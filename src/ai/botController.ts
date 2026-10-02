import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import { botSeed, planSeed } from '../core/seed';
import { cellX, cellZ, createNavSearch, findPath, type NavGrid, type NavSearch } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { createRng, type RngState, rngNext } from '../sim/rng';
import type { GameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, createBot, pick, resetBot } from './bot';
import { thinkBot } from './botBrain';
import type { CoverBlock } from './cover';
import { bodyPoint } from './perception';
import { assignLanes, pickTeamPlan, shuffledLanes, type TeamPlan } from './teamPlan';

/** Score of a sector nobody has visited this round: older than any real visit. */
const NEVER = -1e6;

export interface BotControllerOptions {
  query: WorldQuery;
  nav: NavGrid;
  /** Route ends snap to the nearest walkable cell within this distance. */
  navSnap: number;
  lanes: readonly (readonly Vec3[])[];
  /** The map's low and full-height cover (lowCoverBlocks / tallCoverBlocks of map.blocks); empty if none. */
  lowCover: readonly CoverBlock[];
  tallCover: readonly CoverBlock[];
  body: BodyConfig;
  hits: HitConfig;
  loadout: readonly ReplicaConfig[];
  cfg: BotConfig;
  seed: number;
}

/**
 * Runs every bot: before each simulation tick it writes each bot's PlayerCommand (bots are just
 * another controller); after each tick it lets bots hear what happened (gunfire, near misses,
 * teammates being hit). Route searches are rationed per tick and handed out round-robin. It also
 * remembers, per team, when each part of the map was last visited, so bots hunt where nobody has
 * looked for a while, and plans each round per team: which lanes its bots take (TeamPlan) and how far
 * ahead of the team a bot may get.
 */
export class BotController {
  readonly bots: Bot[] = [];
  private readonly world: BotWorld;
  private readonly search: NavSearch;
  private readonly commandsById = new Map<number, PlayerCommand>();
  private readonly chest = vec3();
  private plannerCursor = 0;
  /** Tuning to switch to at the next round start (a difficulty change made mid-match). */
  private pendingCfg: BotConfig | undefined;
  /** Hunt sectors: per team, the last time a player of that team stood in each sector. */
  private readonly sectorCols: number;
  private readonly sectorRows: number;
  private readonly visited: Float64Array[];
  private readonly spawnCentre: Vec3[];
  /** Per team, the unit direction (x, z) from its spawn towards the enemy's. */
  private readonly attackDir: { x: number; z: number }[];
  /** The team plans' own random stream (separate from each bot's). */
  private readonly planRng: RngState;
  /** Per team, this round's plan. */
  readonly plans: TeamPlan[] = ['split', 'split'];

  constructor(
    state: GameState,
    botCharacters: readonly Character[],
    commands: Map<number, PlayerCommand>,
    private readonly opts: BotControllerOptions,
  ) {
    const nav = opts.nav;
    const cfg = opts.cfg;
    this.sectorCols = Math.ceil((nav.cols * nav.cell) / cfg.huntSectorSize);
    this.sectorRows = Math.ceil((nav.rows * nav.cell) / cfg.huntSectorSize);
    this.visited = [0, 1].map(() => new Float64Array(this.sectorCols * this.sectorRows).fill(Number.NEGATIVE_INFINITY));

    // Where each team starts, and which way its enemy is.
    this.spawnCentre = [0, 1].map((team) => {
      const members = state.characters.filter((c) => c.team === team);
      const n = Math.max(1, members.length);
      return vec3(members.reduce((a, c) => a + c.spawnPosition.x, 0) / n, 0, members.reduce((a, c) => a + c.spawnPosition.z, 0) / n);
    });
    const [blue, orange] = this.spawnCentre as [Vec3, Vec3];
    const enemyYaw = [Math.atan2(-(orange.x - blue.x), -(orange.z - blue.z)), Math.atan2(-(blue.x - orange.x), -(blue.z - orange.z))];
    const span = Math.max(1e-6, Math.hypot(orange.x - blue.x, orange.z - blue.z));
    const ux = (orange.x - blue.x) / span;
    const uz = (orange.z - blue.z) / span;
    this.attackDir = [
      { x: ux, z: uz },
      { x: -ux, z: -uz },
    ];
    this.planRng = createRng(planSeed(opts.seed));

    this.world = {
      characters: state.characters,
      query: opts.query,
      nav,
      lanes: opts.lanes,
      lowCover: opts.lowCover,
      tallCover: opts.tallCover,
      body: opts.body,
      hits: opts.hits,
      loadout: opts.loadout,
      cfg,
      round: state.round,
      enemyYaw,
      huntPoint: (bot, out) => this.huntPoint(bot, out),
      aheadOfTeam: (bot) => this.aheadOfTeam(bot),
      time: 0,
      live: true,
    };
    this.search = createNavSearch(nav);
    for (const c of botCharacters) {
      this.bots.push(createBot(c, botSeed(opts.seed, c.id), cfg));
      commands.set(c.id, this.commandFor(c.id));
    }
    this.planRound();
  }

  /** The tuning bots play by now. */
  get cfg(): BotConfig {
    return this.world.cfg;
  }

  /**
   * Changes the bots' tuning (a difficulty level): right away, or from the next round so a fight in
   * progress isn't changed under the player.
   */
  setConfig(cfg: BotConfig, when: 'now' | 'nextRound'): void {
    if (when === 'now') {
      this.world.cfg = cfg;
      this.pendingCfg = undefined;
    } else {
      this.pendingCfg = cfg;
    }
  }

  private commandFor(id: number): PlayerCommand {
    let cmd = this.commandsById.get(id);
    if (!cmd) {
      cmd = createCommand();
      this.commandsById.set(id, cmd);
    }
    return cmd;
  }

  /** Before a simulation tick: plan routes (rationed) and decide every bot's command. */
  think(state: GameState, dt: number): void {
    const w = this.world;
    w.time = state.time;
    w.live = state.round.phase === 'live';
    for (const c of state.characters) {
      if (isInPlay(c)) this.visited[c.team]![this.sectorOf(c.position.x, c.position.z)] = state.time;
    }
    this.planRoutes();
    this.pickRetakers();
    for (const b of this.bots) thinkBot(b, w, this.commandFor(b.character.id), dt);
  }

  /**
   * Attack / Defend: the `retakers` defending bots in play nearest the pole are the ones who go and pull
   * the flag down once it's off the bottom; the rest hold their posts, so tagging the pole doesn't empty
   * every lane. Re-picked every tick, so if a retaker is hit the next nearest takes over.
   */
  private pickRetakers(): void {
    const r = this.world.round;
    const pole = r.flag.position;
    for (const b of this.bots) {
      const c = b.character;
      b.retake = false;
      if (r.mode !== 'attackDefend' || r.attackers < 0 || c.team === r.attackers || !isInPlay(c)) continue;
      const d = Math.hypot(c.position.x - pole.x, c.position.z - pole.z);
      let closer = 0;
      for (const o of this.bots) {
        const oc = o.character;
        if (o === b || oc.team !== c.team || !isInPlay(oc)) continue;
        const od = Math.hypot(oc.position.x - pole.x, oc.position.z - pole.z);
        if (od < d || (od === d && oc.id < c.id)) closer++;
      }
      b.retake = closer < this.world.cfg.retakers;
    }
  }

  /** After a simulation tick, while its events are still in the state. */
  observe(state: GameState): void {
    const time = state.time;
    for (const e of state.events) {
      const cfg = this.world.cfg;
      if (e.type === 'roundStart') {
        if (this.pendingCfg) {
          this.world.cfg = this.pendingCfg;
          this.pendingCfg = undefined;
        }
        for (const v of this.visited) v.fill(Number.NEGATIVE_INFINITY);
        this.planRound();
      } else if (e.type === 'shot') {
        const shooter = this.character(state, e.characterId);
        if (shooter) this.hear(shooter.team, e.position, time, shooter.position, cfg.hearingDistance);
      } else if (e.type === 'characterHit') {
        // Teammates near someone who calls a hit turn towards where it came from.
        const victim = this.character(state, e.victimId);
        const shooter = this.character(state, e.shooterId);
        if (victim && shooter && victim.team !== shooter.team) this.hear(shooter.team, victim.position, time, shooter.position, cfg.hearingDistance);
      } else if (e.type === 'footstep') {
        const walker = this.character(state, e.characterId);
        const range = e.kind === 'sprint' ? cfg.footstepHearingSprint : e.kind === 'land' ? cfg.footstepHearingLand : cfg.footstepHearingRun;
        if (walker && isInPlay(walker)) this.hear(walker.team, walker.position, time, walker.position, range);
      } else if (e.type === 'bbImpact') {
        // Only enemy fire suppresses: a bot's own BB (or a teammate's) landing near it is no threat.
        const shooter = this.character(state, e.ownerId);
        for (const b of this.bots) {
          if (shooter && shooter.team === b.character.team) continue;
          const p = bodyPoint(b.character, this.opts.hits, cfg.aimHeightFraction, this.chest);
          if (Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z) <= cfg.suppressionRadius) {
            b.suppressedAt = time;
            b.lastThreatAt = time;
          }
        }
      }
    }
  }

  /**
   * Bots not on `shooterTeam` within `range` of `heardAt` (gunfire, a hit call, footsteps) learn roughly where the source is,
   * unless they can already see someone. The guess is off by up to hearingError × distance and is kept
   * while the noise keeps coming from about there (bursts and nearby shooters don't make it jump).
   * Hearing is not sight: it never skips a bot's reaction when the shooter then appears.
   */
  private hear(shooterTeam: number, heardAt: Vec3, time: number, shooterPos: Vec3, range: number): void {
    const cfg = this.world.cfg;
    for (const b of this.bots) {
      const c = b.character;
      if (c.team === shooterTeam || !isInPlay(c) || b.targetVisible) continue;
      if (Math.hypot(heardAt.x - c.position.x, heardAt.z - c.position.z) > range) continue;
      // Gunfire from within the current guess's margin of error (any shooter) is the same noise: keep
      // the guess. Only a clearly different source makes a new one; the guess never tracks anyone.
      const dist = Math.hypot(shooterPos.x - c.position.x, shooterPos.z - c.position.z);
      const margin = dist * cfg.hearingError + cfg.replanDistance;
      const sameNoise = b.hasLastKnown && time - b.heardAt < cfg.hearingContactTime && Math.hypot(shooterPos.x - b.lastKnown.x, shooterPos.z - b.lastKnown.z) <= margin;
      if (!sameNoise) {
        const angle = rngNext(b.rng) * Math.PI * 2;
        const off = Math.sqrt(rngNext(b.rng)) * dist * cfg.hearingError;
        b.lastKnown.x = shooterPos.x + Math.cos(angle) * off;
        b.lastKnown.y = c.position.y;
        b.lastKnown.z = shooterPos.z + Math.sin(angle) * off;
      }
      b.hasLastKnown = true;
      b.heardAt = time;
      b.lastThreatAt = time;
    }
  }

  /**
   * A fresh round for every bot: per team, pick a plan, deal out the lanes in a random order, and have
   * bots that share a lane set off a moment apart. In Attack / Defend, defenders don't advance: each holds
   * the first point of its lane (nearest home), or the second (see defendForwardChance), and they never
   * stack all on one lane. Attackers walk their lane only as far as the first point past the middle of
   * the map, then head for the pole.
   */
  private planRound(): void {
    const cfg = this.world.cfg;
    const round = this.world.round;
    const objective = round.mode === 'attackDefend' && round.attackers >= 0;
    for (let team = 0; team < this.plans.length; team++) {
      const members = this.bots.filter((b) => b.character.team === team);
      const defending = objective && team !== round.attackers;
      const attacking = objective && team === round.attackers;
      let plan = pickTeamPlan(this.planRng, cfg);
      if (defending && plan === 'stack') plan = 'pair'; // three bots holding one lane point would stand in a heap
      this.plans[team] = plan;
      const lanes = assignLanes(plan, members.length, shuffledLanes(this.planRng, this.opts.lanes.length));
      const onLane = new Map<number, number>();
      members.forEach((b, i) => {
        const lane = lanes[i]!;
        const ahead = onLane.get(lane) ?? 0;
        onLane.set(lane, ahead + 1);
        let hold = 0;
        for (let k = 0; k < ahead; k++) hold += pick(b.rng, cfg.laneFollowDelay);
        let points = Number.POSITIVE_INFINITY;
        if (defending) {
          const shared = lanes.filter((l) => l === lane).length > 1;
          const forward = ahead === 0 && (shared || rngNext(this.planRng) < cfg.defendForwardChance);
          points = forward ? 2 : 1;
        } else if (attacking) {
          points = this.pointsToMidfield(team, lane);
        }
        resetBot(b, lane, hold, cfg, points);
      });
    }
  }

  /**
   * How many of `lane`'s points `team` walks to reach the first one past the middle of the map (all of
   * them if none is): attackers go for the pole from there.
   */
  private pointsToMidfield(team: number, lane: number): number {
    const points = this.opts.lanes[lane];
    if (!points) return Number.POSITIVE_INFINITY;
    const home = this.spawnCentre[team]!;
    const dir = this.attackDir[team]!;
    const enemy = this.spawnCentre[1 - team]!;
    const half = Math.hypot(enemy.x - home.x, enemy.z - home.z) / 2;
    const n = points.length;
    for (let k = 0; k < n; k++) {
      // Walking order: Blue goes through the points first to last, Orange last to first (see resetBot).
      const p = points[team === 0 ? k : n - 1 - k]!;
      if ((p.x - home.x) * dir.x + (p.z - home.z) * dir.z >= half) return k + 1;
    }
    return n;
  }

  /** How far `c` is from its spawn towards the enemy side (metres). */
  private progress(c: Character): number {
    const home = this.spawnCentre[c.team]!;
    const dir = this.attackDir[c.team]!;
    return (c.position.x - home.x) * dir.x + (c.position.z - home.z) * dir.z;
  }

  /** True if `bot` is more than teamSpread ahead of its rearmost teammate bot in play (players don't hold bots back). */
  private aheadOfTeam(bot: Bot): boolean {
    const me = bot.character;
    let rear = Number.POSITIVE_INFINITY;
    for (const b of this.bots) {
      const c = b.character;
      if (c === me || c.team !== me.team || !isInPlay(c)) continue;
      rear = Math.min(rear, this.progress(c));
    }
    return this.progress(me) - rear > this.world.cfg.teamSpread;
  }

  /**
   * A walkable spot worth checking for `bot`'s team: of a few random walkable spots, the one in the
   * sector the team visited least recently (never-visited sectors further from home first).
   */
  private huntPoint(bot: Bot, out: Vec3): boolean {
    const nav = this.opts.nav;
    const cfg = this.world.cfg;
    const visited = this.visited[bot.character.team]!;
    const home = this.spawnCentre[bot.character.team]!;
    let best = Number.POSITIVE_INFINITY;
    const cells = nav.cols * nav.rows;
    for (let k = 0, tries = 0; k < cfg.huntCandidates && tries < cfg.huntCandidates * cfg.huntTriesPerCandidate; tries++) {
      const cell = Math.floor(rngNext(bot.rng) * cells);
      if (!nav.walkable[cell]) continue;
      k++;
      const x = cellX(nav, cell % nav.cols);
      const z = cellZ(nav, Math.floor(cell / nav.cols));
      const seen = visited[this.sectorOf(x, z)]!;
      // Stale sectors first (never visited counts as long ago); then prefer those far from home (the enemy's side).
      const score = (Number.isFinite(seen) ? seen : NEVER) - Math.hypot(x - home.x, z - home.z) * cfg.huntFarBias;
      if (score < best) {
        best = score;
        out.x = x;
        out.y = nav.floorY[cell]!;
        out.z = z;
      }
    }
    return Number.isFinite(best);
  }

  private sectorOf(x: number, z: number): number {
    const nav = this.opts.nav;
    const size = this.opts.cfg.huntSectorSize; // fixed at construction, like the sector grid
    const i = Math.min(this.sectorCols - 1, Math.max(0, Math.floor((x - nav.minX) / size)));
    const j = Math.min(this.sectorRows - 1, Math.max(0, Math.floor((z - nav.minZ) / size)));
    return j * this.sectorCols + i;
  }

  private character(state: GameState, id: number): Character | undefined {
    for (const c of state.characters) if (c.id === id) return c;
    return undefined;
  }

  /** Serves at most cfg.pathsPerTick route requests, round-robin across bots. */
  private planRoutes(): void {
    let budget = this.world.cfg.pathsPerTick;
    const n = this.bots.length;
    const start = this.plannerCursor;
    for (let k = 0; k < n && budget > 0; k++) {
      const i = (start + k) % n;
      const b = this.bots[i]!;
      if (b.routeState !== 'wanted') continue;
      budget--;
      this.plannerCursor = (i + 1) % n; // the next tick starts after the last bot served
      const ok = findPath(this.opts.nav, this.search, b.character.position, b.routeGoal, this.opts.navSnap, b.route);
      b.routeLeg = 0;
      b.stuckFor = 0;
      b.routeState = ok ? 'ok' : 'failed';
    }
  }
}
