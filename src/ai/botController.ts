import { AUDIO } from '../config/audio';
import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import { FLAG } from '../config/modes';
import type { BodyConfig } from '../config/movement';
import { NAV } from '../config/nav';
import type { ReplicaConfig } from '../config/replicas';
import { SQUAD_ORDERS, type SquadOrderKind } from '../config/squad';
import { botSeed, planSeed } from '../core/seed';
import { cellX, cellZ, createNavSearch, findPath, floorAt, type NavGrid, type NavSearch } from '../nav/navGrid';
import { shotHeardScale, type WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { blockedShare } from '../sim/soundPath';
import type { GameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, createBot, lastSeenAt, pick, resetBot } from './bot';
import { thinkBot } from './botBrain';
import type { CoverBlock } from './cover';
import { bodyPoint, eyeOf } from './perception';
import { endOrder, heldCentre, holdPoint, placeHold, startOrder } from './squadOrders';
import { assignLanes, pickTeamPlan, shuffledLanes, type TeamPlan } from './teamPlan';

/** Score of a sector nobody has visited this round: older than any real visit. */
const NEVER = -1e6;

export interface BotControllerOptions {
  query: WorldQuery;
  nav: NavGrid;
  /** Route ends snap to the nearest walkable cell within this distance. */
  navSnap: number;
  /** How far round a route's straight legs the ground must be walkable, so they keep clear of corners (default NAV.legProbe, AI-12). */
  legProbe?: number;
  lanes: readonly (readonly Vec3[])[];
  /** The map's low and full-height cover (lowCoverBlocks / tallCoverBlocks of map.blocks); empty if none. */
  lowCover: readonly CoverBlock[];
  tallCover: readonly CoverBlock[];
  body: BodyConfig;
  hits: HitConfig;
  loadout: readonly ReplicaConfig[];
  /** The bots' tuning: the behaviour every bot shares (BotWorld.cfg), and the skill of each, unless `teamCfg` gives a team its own. */
  cfg: BotConfig;
  /**
   * Per team (Blue, Orange), the difficulty its bots play at: one for your teammates and one for your opponents
   * (M20). Only each one's skill is used (Bot.skill, BOT_SKILL); the behaviour is always `cfg`'s.
   */
  teamCfg?: readonly BotConfig[];
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
  /** The characters the bots drive (players are the rest). */
  private readonly botCharacters = new Set<Character>();
  private readonly world: BotWorld;
  private readonly search: NavSearch;
  private readonly commandsById = new Map<number, PlayerCommand>();
  private readonly chest = vec3();
  private readonly ear = vec3();
  private readonly held = vec3();
  private readonly lookedAt = vec3();
  /** Where a hit call points to (AI-09). */
  private readonly callGuess = vec3();
  /**
   * Per player who gave one, the squad order in force (one source for the HUD and for giving it again). `ownSpot`: a
   * Hold here given looking at nothing, so each holds where it stood.
   */
  private readonly given = new Map<Character, { kind: SquadOrderKind; ownSpot: boolean }>();
  private plannerCursor = 0;
  /** Per team, the tuning its bots play by (BotControllerOptions.teamCfg). */
  private readonly teamCfg: readonly BotConfig[];
  /** Hunt sectors: per team, the last time a player of that team stood in each sector. */
  private readonly sectorCols: number;
  private readonly sectorRows: number;
  private readonly visited: Float64Array[];
  /** Per team, the middle of its spawns this round (teams swap ends at half-time). */
  private readonly spawnCentre: Vec3[] = [vec3(), vec3()];
  /** Per team, the unit direction (x, z) from its spawn towards the enemy's this round. */
  private readonly attackDir: { x: number; z: number }[] = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
  ];
  /** Per team, the way its enemy's spawn is (yaw) this round. */
  private readonly enemyYaw: number[] = [0, 0];
  /** Per team, the end of the map it starts from this round. */
  private readonly ends: number[] = [0, 1];
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

    this.planRng = createRng(planSeed(opts.seed));
    this.teamCfg = opts.teamCfg ?? [cfg, cfg];

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
      enemyYaw: this.enemyYaw,
      huntPoint: (bot, out) => this.huntPoint(bot, out),
      aheadOfTeam: (bot) => this.aheadOfTeam(bot),
      inEnemyHalf: (bot) => this.inEnemyHalf(bot),
      markVisited: (bot, point) => {
        this.visited[bot.character.team]![this.sectorOf(point.x, point.z)] = this.world.time;
      },
      bots: this.bots,
      time: 0,
      live: true,
    };
    this.search = createNavSearch(nav);
    for (const c of botCharacters) {
      this.bots.push(createBot(c, botSeed(opts.seed, c.id), cfg, this.cfgOf(c.team)));
      this.botCharacters.add(c);
      commands.set(c.id, this.commandFor(c.id));
    }
    this.planRound();
  }

  /** @internal For tests that drive one bot step (shootBot, reloadBot) by hand: the world the bots think in. */
  get worldForTests(): BotWorld {
    return this.world;
  }

  /** The tuning `team`'s bots play by. */
  cfgOf(team: number): BotConfig {
    return this.teamCfg[team] ?? this.opts.cfg;
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
    // One route search a tick in all (AI-10): a walk-off search runs in this tick's simulation step when someone was hit
    // last tick, so the bots wait a tick.
    if (!walkOffSearchDue(state.characters)) this.planRoutes();
    this.updateOrders();
    this.pickRetakers();
    this.pickRaiser();
    // Each bot decides with its own team's skill (Bot.skill, set at creation); w.cfg is the shared behaviour.
    for (const b of this.bots) thinkBot(b, w, this.commandFor(b.character.id), dt);
  }

  /**
   * A squad order from `leader` (a player) to the bot teammates in play (M22). Giving the order already in force
   * cancels it, except Hold here aimed somewhere else (at least holdMove from the held spot, or at nothing while they
   * hold a spot you looked at, which holds where they stand), which moves it. With `toggle` false (the order wheel,
   * M23, which has its own Team Plan) the order already in force stays as it is instead. Returns the order in force
   * afterwards ('none' also when no teammate is in play to take it).
   */
  giveOrder(leader: Character, kind: SquadOrderKind, toggle = true): SquadOrderKind | 'none' {
    const w = this.world;
    const team = this.bots.filter((b) => b.character !== leader && b.character.team === leader.team && isInPlay(b.character));
    if (!isInPlay(leader) || team.length === 0) {
      this.dropOrder(leader);
      return 'none';
    }
    const current = this.given.get(leader);
    const point = holdPoint(leader, w, this.lookedAt) ? this.lookedAt : undefined;
    if (current?.kind === kind) {
      const same =
        kind !== 'hold' ||
        (point ? !current.ownSpot && heldCentre(this.bots, leader, this.held) && Math.hypot(point.x - this.held.x, point.z - this.held.z) < SQUAD_ORDERS.holdMove : current.ownSpot);
      if (same) {
        if (!toggle) return kind;
        this.dropOrder(leader);
        return 'none';
      }
    }
    if (kind === 'hold') {
      // Left to right across the leader's view, so nobody crosses another's path to their spot.
      const rx = Math.cos(leader.yaw);
      const rz = -Math.sin(leader.yaw);
      team.sort((a, b) => a.character.position.x * rx + a.character.position.z * rz - (b.character.position.x * rx + b.character.position.z * rz));
    }
    for (const b of this.bots) if (b.orderLeader === leader && !team.includes(b)) endOrder(b, w);
    team.forEach((b, slot) => startOrder(b, leader, kind, slot));
    if (kind === 'hold') placeHold(team, leader, point, w);
    this.given.set(leader, { kind, ownSpot: kind === 'hold' && !point });
    return kind;
  }

  /** The order `leader`'s bot teammates are carrying out ('none': they play the team plan). */
  orderOf(leader: Character): SquadOrderKind | 'none' {
    return this.given.get(leader)?.kind ?? 'none';
  }

  /**
   * While `leader`'s teammates hold a spot they looked at: the middle of the held spots into `out`, and true. False
   * for a hold where each stood (they may be far apart: no one spot to mark).
   */
  holdSpot(leader: Character, out: Vec3): boolean {
    const given = this.given.get(leader);
    return given?.kind === 'hold' && !given.ownSpot && heldCentre(this.bots, leader, out);
  }

  /** `leader`'s order ends (the order wheel's Team plan, M23): everyone given it goes back to the team plan. */
  cancelOrder(leader: Character): void {
    this.dropOrder(leader);
  }

  /** Everyone given `leader`'s order goes back to the team plan. */
  private dropOrder(leader: Character): void {
    for (const b of this.bots) if (b.orderLeader === leader) endOrder(b, this.world);
    this.given.delete(leader);
  }

  /**
   * Before the bots think: an order ends when whoever gave it is out of play (hit, or the round over), and for a bot
   * that is out itself; Regroup becomes Follow me for each bot that has got back, and for the order once all have.
   */
  private updateOrders(): void {
    for (const b of this.bots) if (b.order !== 'none' && !isInPlay(b.character)) endOrder(b, this.world);
    for (const [leader, given] of this.given) {
      if (!isInPlay(leader)) {
        this.dropOrder(leader);
        continue;
      }
      let carried = 0;
      let regrouping = 0;
      for (const b of this.bots) {
        if (b.orderLeader !== leader) continue;
        carried++;
        if (b.order !== 'regroup') continue;
        const p = b.character.position;
        if (Math.hypot(leader.position.x - p.x, leader.position.z - p.z) <= SQUAD_ORDERS.regroupArrive) {
          b.order = 'follow';
          b.orderHeading = leader.yaw;
        } else {
          regrouping++;
        }
      }
      if (carried === 0) this.given.delete(leader);
      else if (given.kind === 'regroup' && regrouping === 0) given.kind = 'follow';
    }
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
      // A bot under a squad order isn't picked: it does what it was told, and the next nearest goes.
      if (r.mode !== 'attackDefend' || r.attackers < 0 || c.team === r.attackers || !isInPlay(c) || b.order !== 'none') continue;
      const d = Math.hypot(c.position.x - pole.x, c.position.z - pole.z);
      let closer = 0;
      for (const o of this.bots) {
        const oc = o.character;
        if (o === b || oc.team !== c.team || !isInPlay(oc) || o.order !== 'none') continue;
        const od = Math.hypot(oc.position.x - pole.x, oc.position.z - pole.z);
        if (od < d || (od === d && oc.id < c.id)) closer++;
      }
      b.retake = closer < this.world.cfg.retakers;
    }
  }

  /**
   * Attack / Defend (audit AI-06): of the attacking bots in play that have swept their lane, one raises the flag and the
   * others guard the pole from cover; a second raiser adds nothing (the rope goes up no faster). The raiser is the bot
   * in flag mode nearest the pole, the current one kept unless another is raiserSwitchMargin nearer; one drawn into a
   * fight or into cover elsewhere hands the rope over, so a guard never waits on a raiser that is busy or far off.
   * Nobody raises while a teammate who isn't a bot (the player) is already at the pole.
   */
  private pickRaiser(): void {
    const r = this.world.round;
    let raiser: Bot | undefined;
    // Bots in flag mode first, then anyone else; then the nearest to the pole, the raiser counted raiserSwitchMargin nearer.
    let bestRank = Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    for (const b of this.bots) {
      const keep = b.raiser;
      b.raiser = false;
      const c = b.character;
      if (r.mode !== 'attackDefend' || c.team !== r.attackers || !isInPlay(c) || !b.laneDone || b.order !== 'none') continue;
      const rank = b.mode === 'flag' ? 0 : 1;
      const d = Math.hypot(c.position.x - r.flag.position.x, c.position.z - r.flag.position.z) - (keep ? this.world.cfg.raiserSwitchMargin : 0);
      if (rank < bestRank || (rank === bestRank && d < best)) {
        bestRank = rank;
        best = d;
        raiser = b;
      }
    }
    if (!raiser) return;
    for (const c of this.world.characters) {
      if (c.team !== r.attackers || !isInPlay(c) || this.botCharacters.has(c)) continue;
      if (Math.hypot(c.position.x - r.flag.position.x, c.position.z - r.flag.position.z) <= FLAG.radius) return;
    }
    raiser.raiser = true;
  }

  /** After a simulation tick, while its events are still in the state. */
  observe(state: GameState): void {
    const time = state.time;
    for (const e of state.events) {
      const cfg = this.world.cfg;
      if (e.type === 'roundStart') {
        for (const v of this.visited) v.fill(Number.NEGATIVE_INFINITY);
        this.given.clear(); // resetBot ends every bot's order
        this.planRound();
      } else if (e.type === 'shot') {
        const shooter = this.character(state, e.characterId);
        // A silencer (M29b) shortens how far the shot carries.
        if (shooter) this.hear(shooter.team, e.position, shooter.position, time, shooter.position, cfg.hearingDistance * shotHeardScale(shooter), shooter.id);
      } else if (e.type === 'characterHit') {
        // Teammates near someone who calls a hit turn towards where it came from; not from a BB fired by someone hit
        // since (they are walking off, not where the threat is). A "HIT!" tells them which way the BB came, not how far
        // (AI-09): the guess is back along the BB's path from the victim, no further than gunfire carries.
        const victim = this.character(state, e.victimId);
        const shooter = this.character(state, e.shooterId);
        if (victim && shooter && isInPlay(shooter) && victim.team !== shooter.team) {
          const g = this.callGuess;
          const flat = Math.hypot(e.direction.x, e.direction.z);
          const back = Math.min(cfg.hearingDistance, Math.hypot(shooter.position.x - victim.position.x, shooter.position.z - victim.position.z));
          g.x = victim.position.x - (flat > 1e-6 ? (e.direction.x / flat) * back : 0);
          g.y = victim.position.y;
          g.z = victim.position.z - (flat > 1e-6 ? (e.direction.z / flat) * back : 0);
          this.hear(shooter.team, victim.position, victim.position, time, g, cfg.hearingDistance, shooter.id, undefined, true);
        }
      } else if (e.type === 'ricochetTick') {
        // A ricochet that doesn't count still tells its victim they're under fire, unless it was their own (SIM-07).
        if (e.victimId === e.shooterId) continue;
        for (const b of this.bots) {
          if (b.character.id !== e.victimId) continue;
          b.suppressedAt = time;
          b.lastThreatAt = time;
        }
      } else if (e.type === 'footstep') {
        const walker = this.character(state, e.characterId);
        const range =
          e.kind === 'sprint' ? cfg.footstepHearingSprint : e.kind === 'land' ? cfg.footstepHearingLand : e.kind === 'rattle' ? cfg.footstepHearingRattle : cfg.footstepHearingRun;
        if (walker && isInPlay(walker)) this.hear(walker.team, walker.position, walker.position, time, walker.position, range, walker.id);
      } else if (e.type === 'bbImpact') {
        // Only enemy fire suppresses: a bot's own BB (or a teammate's) landing near it is no threat.
        const shooter = this.character(state, e.ownerId);
        for (const b of this.bots) {
          if (shooter && shooter.team === b.character.team) continue;
          const p = bodyPoint(b.character, this.opts.hits, cfg.aimHeightFraction, this.chest);
          if (Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z) <= cfg.suppressionRadius) {
            b.suppressedAt = time;
            b.lastThreatAt = time;
            // A near miss gives away roughly where it came from, however far off the shot was (AI-04): the bot hears the
            // BB land by its own feet, so the range test always passes.
            if (shooter && isInPlay(shooter)) this.hear(shooter.team, b.character.position, shooter.position, time, shooter.position, Number.POSITIVE_INFINITY, shooter.id, b);
          }
        }
      }
    }
  }

  /**
   * Bots not on `shooterTeam` within `range` of `heardAt` (gunfire, a hit call, footsteps, a near miss) learn roughly
   * where the source (character `sourceId`) is; `only`: just that bot. The guess is off by up to hearingError ×
   * distance and is kept while the noise keeps coming from about there (bursts and nearby shooters don't make it jump).
   * A bot fighting someone else keeps it aside for when that fight is over (AI-15); one already watching the source
   * learns nothing. Hearing is not sight: it never skips a bot's reaction when the shooter then appears. Walls between
   * the bot and whoever made the sound (standing at `sourceFeet`) shorten the range (wallHearing, M22).
   */
  /**
   * Those of the other team within `range` of `heardAt` (walls muffle it) hear a noise from `shooterPos`. `only` limits
   * it to one bot; `call` marks a teammate's hit call, which a bot that heard it and plays as a team (M38) goes to trade
   * (see tradeTime). A teamPlay bot shares where it heard someone with its teamPlay teammates (M38).
   */
  private hear(shooterTeam: number, heardAt: Vec3, sourceFeet: Vec3, time: number, shooterPos: Vec3, range: number, sourceId: number, only?: Bot, call = false): void {
    const cfg = this.world.cfg;
    for (const b of this.bots) {
      if (only && b !== only) continue;
      const c = b.character;
      if (c.team === shooterTeam || !isInPlay(c) || (b.targetVisible && b.targetId === sourceId)) continue;
      const heard = Math.hypot(heardAt.x - c.position.x, heardAt.z - c.position.z);
      if (heard > range) continue;
      // Within the range a wall leaves, nothing to check; beyond it, cast the rays.
      if (heard > range * cfg.wallHearing) {
        const share = blockedShare(this.opts.query, eyeOf(c, this.opts.body, this.opts.hits, this.ear), sourceFeet, AUDIO.occlusion.rayHeights);
        if (heard > range * (1 - share * (1 - cfg.wallHearing))) continue;
      }
      const dist = Math.hypot(shooterPos.x - c.position.x, shooterPos.z - c.position.z);
      if (b.targetVisible) {
        // Busy with someone else: remember this one for later (a flanker), but keep fighting.
        this.guess(b, shooterPos, dist, b.heardOther);
        b.heardOtherAt = time;
        continue;
      }
      // Gunfire from within the current guess's margin of error (any shooter) is the same noise: keep
      // the guess. Only a clearly different source makes a new one; the guess never tracks anyone.
      const margin = dist * cfg.hearingError + cfg.replanDistance;
      const sameNoise = b.hasLastKnown && time - b.heardAt < cfg.hearingContactTime && Math.hypot(shooterPos.x - b.lastKnown.x, shooterPos.z - b.lastKnown.z) <= margin;
      if (!sameNoise) this.guess(b, shooterPos, dist, b.lastKnown);
      b.hasLastKnown = true;
      b.heardAt = time;
      b.lastThreatAt = time;
      if (!b.skill.teamPlay) continue;
      if (call) {
        b.tradeAt = time;
        b.tradeTried = false;
      }
      this.shareHeard(b, time);
    }
  }

  /**
   * Teamplay (M38): bot `b` tells its teamPlay teammates where it heard someone, the bots' version of the player's
   * minimap patches. A teammate fighting, or with fresher news of its own, keeps its own; nobody trades on hearsay.
   */
  private shareHeard(b: Bot, time: number): void {
    const cfg = this.world.cfg;
    for (const m of this.bots) {
      if (m === b || !m.skill.teamPlay || m.character.team !== b.character.team || !isInPlay(m.character) || m.targetVisible) continue;
      if (m.hasLastKnown && time - Math.max(lastSeenAt(m), m.heardAt) < cfg.hearingContactTime) continue;
      m.lastKnown.x = b.lastKnown.x;
      m.lastKnown.y = b.lastKnown.y;
      m.lastKnown.z = b.lastKnown.z;
      m.hasLastKnown = true;
      m.heardAt = time;
      m.lastThreatAt = time;
    }
  }

  /**
   * A heard guess of `source` (`dist` metres from bot `b`) into `out`: off by up to hearingError × dist, on the floor
   * there (another level's floor if the noise came from one; the bot's own height off the grid).
   */
  private guess(b: Bot, source: Vec3, dist: number, out: Vec3): void {
    const angle = rngNext(b.rng) * Math.PI * 2;
    const off = Math.sqrt(rngNext(b.rng)) * dist * this.world.cfg.hearingError;
    out.x = source.x + Math.cos(angle) * off;
    out.z = source.z + Math.sin(angle) * off;
    const floor = floorAt(this.opts.nav, out.x, out.z);
    out.y = Number.isNaN(floor) ? b.character.position.y : floor;
  }

  /**
   * A fresh round for every bot: per team, pick a plan, deal out the lanes in a random order, and have
   * bots that share a lane set off a moment apart. In Attack / Defend, defenders don't advance: each holds
   * the first point of its lane (nearest home), or the second (see defendForwardChance), and they never
   * stack all on one lane. Attackers walk their lane only as far as the first point past the middle of
   * the map, then head for the pole.
   */
  private planRound(): void {
    this.measureEnds();
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
          // Bots that play as a team (M38) both hold a shared lane's forward point, in a crossfire (see crossfireSpot).
          points = forward || (shared && b.skill.teamPlay) ? 2 : 1;
        } else if (attacking) {
          points = this.pointsToMidfield(team, lane);
        }
        resetBot(b, lane, hold, cfg, points);
      });
    }
  }

  /** Where each team starts this round (its spawns' middle and end), and which way its enemy is. */
  private measureEnds(): void {
    const chars = this.world.characters;
    for (let team = 0; team < 2; team++) {
      const centre = this.spawnCentre[team]!;
      let n = 0;
      centre.x = 0;
      centre.z = 0;
      for (const c of chars) {
        if (c.team !== team) continue;
        centre.x += c.spawnPosition.x;
        centre.z += c.spawnPosition.z;
        this.ends[team] = c.end;
        n++;
      }
      centre.x /= Math.max(1, n);
      centre.z /= Math.max(1, n);
    }
    const [blue, orange] = this.spawnCentre as [Vec3, Vec3];
    this.enemyYaw[0] = Math.atan2(-(orange.x - blue.x), -(orange.z - blue.z));
    this.enemyYaw[1] = Math.atan2(-(blue.x - orange.x), -(blue.z - orange.z));
    const span = Math.max(1e-6, Math.hypot(orange.x - blue.x, orange.z - blue.z));
    const ux = (orange.x - blue.x) / span;
    const uz = (orange.z - blue.z) / span;
    this.attackDir[0]!.x = ux;
    this.attackDir[0]!.z = uz;
    this.attackDir[1]!.x = -ux;
    this.attackDir[1]!.z = -uz;
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
      // Walking order: from end 0 the points go first to last, from end 1 last to first (see resetBot).
      const p = points[this.ends[team] === 0 ? k : n - 1 - k]!;
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

  /** True if `bot` stands more than halfway from its spawns to the enemy's. */
  private inEnemyHalf(bot: Bot): boolean {
    const team = bot.character.team;
    const home = this.spawnCentre[team]!;
    const enemy = this.spawnCentre[1 - team]!;
    return this.progress(bot.character) > Math.hypot(enemy.x - home.x, enemy.z - home.z) / 2;
  }

  /** True if `bot` is more than teamSpread ahead of its rearmost teammate bot in play (players don't hold bots back). */
  private aheadOfTeam(bot: Bot): boolean {
    const me = bot.character;
    let rear = Number.POSITIVE_INFINITY;
    for (const b of this.bots) {
      const c = b.character;
      // Bots under a squad order go their own way: nobody waits for them.
      if (c === me || c.team !== me.team || !isInPlay(c) || b.order !== 'none') continue;
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
      const ok = findPath(this.opts.nav, this.search, b.character.position, b.routeGoal, this.opts.navSnap, b.route, this.opts.legProbe ?? NAV.legProbe);
      b.routeLeg = 0;
      b.stuckFor = 0;
      b.routeState = ok ? 'ok' : 'failed';
      if (!ok) b.routeRetryAt = this.world.time + this.world.cfg.routeRetryDelay;
    }
  }
}

/** True if a walk-off route search will run in the coming simulation step (a victim hit last tick, M27). */
function walkOffSearchDue(characters: readonly Character[]): boolean {
  for (const c of characters) if (c.walkOffRoutePending) return true;
  return false;
}
