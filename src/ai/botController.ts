import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import { cellX, cellZ, createNavSearch, findPath, type NavGrid, type NavSearch } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { rngNext } from '../sim/rng';
import type { GameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, createBot, resetBot, thinkBot } from './botBrain';
import { bodyPoint } from './perception';

/** Score of a sector nobody has visited this round: older than any real visit. */
const NEVER = -1e6;

export interface BotControllerOptions {
  query: WorldQuery;
  nav: NavGrid;
  /** Route ends snap to the nearest walkable cell within this distance. */
  navSnap: number;
  lanes: readonly (readonly Vec3[])[];
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
 * looked for a while.
 */
export class BotController {
  readonly bots: Bot[] = [];
  private readonly world: BotWorld;
  private readonly search: NavSearch;
  private readonly commandsById = new Map<number, PlayerCommand>();
  private readonly chest = vec3();
  private plannerCursor = 0;
  /** Hunt sectors: per team, the last time a player of that team stood in each sector. */
  private readonly sectorCols: number;
  private readonly sectorRows: number;
  private readonly visited: Float64Array[];
  private readonly spawnCentre: Vec3[];

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

    this.world = {
      characters: state.characters,
      query: opts.query,
      nav,
      lanes: opts.lanes,
      body: opts.body,
      hits: opts.hits,
      loadout: opts.loadout,
      cfg,
      enemyYaw,
      huntPoint: (bot, out) => this.huntPoint(bot, out),
      time: 0,
      live: true,
    };
    this.search = createNavSearch(nav);
    for (const c of botCharacters) {
      this.bots.push(createBot(c, (opts.seed * 7919 + c.id * 104729) >>> 0, opts.lanes.length, cfg));
      commands.set(c.id, this.commandFor(c.id));
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
    for (const b of this.bots) thinkBot(b, w, this.commandFor(b.character.id), dt);
  }

  /** After a simulation tick, while its events are still in the state. */
  observe(state: GameState): void {
    const cfg = this.opts.cfg;
    const time = state.time;
    for (const e of state.events) {
      if (e.type === 'roundStart') {
        for (const v of this.visited) v.fill(Number.NEGATIVE_INFINITY);
        for (const b of this.bots) resetBot(b, this.opts.lanes.length, cfg);
      } else if (e.type === 'shot') {
        const shooter = this.character(state, e.characterId);
        if (shooter) this.hear(shooter.team, e.position, time, shooter.position);
      } else if (e.type === 'characterHit') {
        // Teammates near someone who calls a hit turn towards where it came from.
        const victim = this.character(state, e.victimId);
        const shooter = this.character(state, e.shooterId);
        if (victim && shooter && victim.team !== shooter.team) this.hear(shooter.team, victim.position, time, shooter.position);
      } else if (e.type === 'bbImpact') {
        for (const b of this.bots) {
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
   * Bots not on `shooterTeam` within hearing distance of `heardAt` learn roughly where the shooter is,
   * unless they can already see someone. The guess is off by up to hearingError × distance and is kept
   * while the noise keeps coming from about there (bursts and nearby shooters don't make it jump).
   * Hearing is not sight: it never skips a bot's reaction when the shooter then appears.
   */
  private hear(shooterTeam: number, heardAt: Vec3, time: number, shooterPos: Vec3): void {
    const cfg = this.opts.cfg;
    for (const b of this.bots) {
      const c = b.character;
      if (c.team === shooterTeam || !isInPlay(c) || b.targetVisible) continue;
      if (Math.hypot(heardAt.x - c.position.x, heardAt.z - c.position.z) > cfg.hearingDistance) continue;
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
   * A walkable spot worth checking for `bot`'s team: of a few random walkable spots, the one in the
   * sector the team visited least recently (never-visited sectors further from home first).
   */
  private huntPoint(bot: Bot, out: Vec3): boolean {
    const nav = this.opts.nav;
    const cfg = this.opts.cfg;
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
        out.y = bot.character.position.y;
        out.z = z;
      }
    }
    return Number.isFinite(best);
  }

  private sectorOf(x: number, z: number): number {
    const nav = this.opts.nav;
    const size = this.opts.cfg.huntSectorSize;
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
    let budget = this.opts.cfg.pathsPerTick;
    const n = this.bots.length;
    for (let k = 0; k < n && budget > 0; k++) {
      const b = this.bots[(this.plannerCursor + k) % n]!;
      if (b.routeState !== 'wanted') continue;
      budget--;
      this.plannerCursor = (this.plannerCursor + k + 1) % n;
      const ok = findPath(this.opts.nav, this.search, b.character.position, b.routeGoal, this.opts.navSnap, b.route);
      b.routeLeg = 0;
      b.stuckFor = 0;
      b.routeState = ok ? 'ok' : 'failed';
    }
  }
}
