import type { BotBehaviour, BotConfig, BotSkill } from '../config/bots';
import type { HitConfig } from '../config/hits';
import { WHAT_GOT_YOU } from '../config/matchInfo';
import { type BodyConfig, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import type { ReplicaConfig } from '../config/replicas';
import { SQUAD_ORDERS, type SquadOrderKind } from '../config/squad';
import { botSeed } from '../core/seed';
import { beginRoute, cellX, cellZ, createNavSearch, endRoute, type NavGrid, type NavSearch, stepRoute } from '../nav/navGrid';
import { vaultLinksOf } from '../nav/vaultLinks';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { createHitFacts, type HitFacts, recordHitFacts } from '../sim/hitFacts';
import { rngNext } from '../sim/rng';
import type { GameState } from '../sim/state';
import { copy, type Vec3, vec3 } from '../sim/vec';
import { type AngleFeatures, angleFeaturesOf } from './angleFeatures';
import { RunRoles } from './extractionRoles';
import { type Bot, type BotWorld, createBot, pick } from './bot';
import { thinkBot } from './botBrain';
import type { CoverBlock } from './cover';
import { characterById, hearEvent } from './hearing';
import { OPEN_SIGHT, type SightConditions, seesSpot } from './perception';
import { endOrder, heldCentre, holdPoint, placeHold, startOrder } from './squadOrders';
import { type BotIdentity, personalSkill } from './personality';
import { MagShare, type MagAskResult } from './magShare';
import { aimPing, type Ping, pingSight, takePing } from './pings';
import { pickRaiser, pickRetakers, RoundPlanner } from './roundPlanner';
import type { TeamPlan } from './teamPlan';

/** Score of a sector nobody has visited this round: older than any real visit. */
const NEVER = -1e6;
/** A hunt candidate, while huntPoint weighs it. */
const candidate = vec3();

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
  /** What hides people besides walls (sightConditionsOf the map: bushes, M33e, and night, M33g). Absent: daylight, no bushes. */
  sight?: SightConditions;
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
  /** Extraction: the map's insertion berth (ExtractionData.insertionBerth; absent, BOT_BEHAVIOUR.insertionBerth). */
  insertionBerth?: number | undefined;
  /**
   * Who each bot is (BN1), by character id: its name and personality (ai/botRoster.ts drawIdentities, as the match drew
   * them). A bot without one plays its difficulty as it is; absent, every bot does (the unit tests' bots).
   */
  identities?: ReadonlyMap<number, BotIdentity> | undefined;
}

/**
 * Runs every bot: before each simulation tick it writes each bot's PlayerCommand (bots are just
 * another controller); after each tick it lets bots hear what happened (gunfire, near misses,
 * teammates being hit: ai/hearing.ts). Route searches are rationed per tick and handed out round-robin. It also
 * remembers, per team, when each part of the map was last visited or seen empty (M87), so bots hunt where nobody has
 * looked for a while, and has each round planned per team (ai/roundPlanner.ts): which lanes its bots take (TeamPlan)
 * and how far ahead of the team a bot may get.
 */
export class BotController {
  readonly bots: Bot[] = [];
  /** The characters the bots drive (players are the rest). */
  private readonly botCharacters = new Set<Character>();
  private readonly world: BotWorld;
  private features: AngleFeatures | undefined;
  private readonly search: NavSearch;
  private readonly commandsById = new Map<number, PlayerCommand>();
  private readonly held = vec3();
  private readonly lookedAt = vec3();
  /**
   * Per player who gave one, the squad order in force (one source for the HUD and for giving it again). `ownSpot`: a
   * Hold here given looking at nothing, so each holds where it stood.
   */
  private readonly given = new Map<Character, { kind: SquadOrderKind; ownSpot: boolean }>();
  private plannerCursor = 0;
  /** The bot whose route search is open in `search`, carried over from an earlier tick (audit AI-04), and its goal. */
  private searching: Bot | undefined;
  private readonly searchGoal = vec3();
  /** What a player's eyes see an enemy by when they ping (PG1, ai/pings.ts pingSight): the bots' rules, as far as a ping reaches. */
  private readonly pingSight: BotBehaviour;
  /** Per team, the tuning its bots play by (BotControllerOptions.teamCfg; a team's skill changes by setTeamSkill). */
  private readonly teamCfg: BotConfig[];
  /** Hunt sectors: per team, the last time a player of that team stood in each sector. */
  private readonly sectorCols: number;
  private readonly sectorRows: number;
  private readonly visited: Float64Array[];
  /** Each round's team plans, where each team starts and its own random stream (ai/roundPlanner.ts). */
  private readonly planner: RoundPlanner;
  /**
   * The facts of the last hit on a player (a character no bot drives), for the "what got you" card (M41): filled in
   * `observe` the tick the hit comes in, from the shooter's own state; reused, never reallocated.
   */
  readonly lastHit: HitFacts = createHitFacts();
  /** The magazine hand-off (MG1, ai/magShare.ts): who asks whom, and who brings one. */
  readonly mags: MagShare;
  /** Extraction (M46): the home team's jobs in the run; undefined in the other modes. */
  private run: RunRoles | undefined;

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

    this.planner = new RoundPlanner(opts.seed);
    this.teamCfg = [...(opts.teamCfg ?? [cfg, cfg])];
    this.pingSight = pingSight(cfg);

    this.world = {
      characters: state.characters,
      query: opts.query,
      nav,
      lanes: opts.lanes,
      lowCover: opts.lowCover,
      tallCover: opts.tallCover,
      sight: opts.sight ?? OPEN_SIGHT,
      angleFeatures: () => this.angleFeatures(),
      body: opts.body,
      hits: opts.hits,
      loadout: opts.loadout,
      cfg,
      round: state.round,
      enemyYaw: this.planner.enemyYaw,
      huntPoint: (bot, out) => this.huntPoint(bot, out),
      aheadOfTeam: (bot) => this.planner.aheadOfTeam(bot, this.world),
      inEnemyHalf: (bot) => this.planner.inEnemyHalf(bot),
      squadNews: (team, out) => this.run?.newsFor(team, out) ?? Number.NEGATIVE_INFINITY,
      markVisited: (bot, point) => {
        this.visited[bot.character.team]![this.sectorOf(point.x, point.z)] = this.world.time;
      },
      huntGoalChecked: (bot) => {
        const team = bot.character.team;
        const goal = this.sectorOf(bot.huntGoal.x, bot.huntGoal.z);
        const p = bot.character.position;
        if (goal === this.sectorOf(p.x, p.z)) return false;
        return this.visited[team]![goal]! > bot.huntPickedAt;
      },
      bots: this.bots,
      time: 0,
      live: true,
    };
    this.search = createNavSearch(nav);
    // Routes over low obstacles where that pays (M102): the grid's vault links, found once per grid.
    vaultLinksOf(nav, opts.query, opts.body, MOVEMENT, cfg.vaultPrice);
    for (const c of botCharacters) {
      this.bots.push(createBot(c, botSeed(opts.seed, c.id), cfg, this.cfgOf(c.team), opts.identities?.get(c.id)));
      this.botCharacters.add(c);
      commands.set(c.id, this.commandFor(c.id));
    }
    this.mags = new MagShare(this.bots);
    this.planRound();
    // A bot that holds angles needs the map's features (M40): worked out now, as the match loads, not mid-round. Its
    // level or its personality (BN1) may make it one.
    if (this.bots.some((b) => b.skill.holdsAngles || b.skill.slicesCorners)) this.angleFeatures();
  }

  /** The map's angle features (M40), worked out on first use. */
  private angleFeatures(): AngleFeatures {
    this.features ??= angleFeaturesOf(this.opts.nav, this.opts.tallCover, this.world.sight?.foliage ?? [], this.opts.cfg);
    return this.features;
  }

  /** Per team, this round's plan (ai/roundPlanner.ts). */
  get plans(): readonly TeamPlan[] {
    return this.planner.plans;
  }

  /** @internal For tests that drive one bot step (shootBot, reloadBot) by hand: the world the bots think in. */
  get worldForTests(): BotWorld {
    return this.world;
  }

  /** The tuning `team`'s bots play by. */
  cfgOf(team: number): BotConfig {
    return this.teamCfg[team] ?? this.opts.cfg;
  }

  /**
   * Adaptive difficulty (AD1, ai/adaptiveRun.ts), between rounds: `team`'s bots play at `skill` from now on, each with
   * its personality laid over it again (BN1). Only its numbers may change; the switches stay the match's (a team that
   * holds angles had its map features worked out as the match loaded).
   */
  setTeamSkill(team: number, skill: BotSkill): void {
    const cfg = { ...this.cfgOf(team), ...skill };
    this.teamCfg[team] = cfg;
    for (const b of this.bots) if (b.character.team === team) b.skill = personalSkill(cfg, b.style);
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
  think(state: Readonly<GameState>, dt: number): void {
    const w = this.world;
    w.time = state.time;
    w.live = state.round.phase === 'live';
    for (const c of state.characters) {
      if (isInPlay(c)) this.visited[c.team]![this.sectorOf(c.position.x, c.position.z)] = state.time;
    }
    // One route planned a tick in all (AI-10): a walk-off route is planned in this tick's simulation step when someone
    // was hit last tick, so the bots wait a tick.
    if (!walkOffRouteDue(state.characters)) this.planRoutes();
    this.updateOrders();
    pickRetakers(w);
    pickRaiser(w, this.botCharacters);
    this.run?.update(this.bots, w);
    this.mags.update(w);
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

  /**
   * A ping from `leader` (a player, PG1) at simulation time `time`: where their view (`yaw`, `pitch`) points goes into
   * `out` (ai/pings.ts aimPing), and their bot teammates in play take it (takePing: a bot fighting or in cover doesn't).
   * False if the view meets nothing within reach, or the leader is out of play: nobody hears of it.
   */
  ping(leader: Character, yaw: number, pitch: number, time: number, out: Ping): boolean {
    const w = this.world;
    if (!isInPlay(leader) || !aimPing(leader, yaw, pitch, w, this.pingSight, out)) return false;
    w.time = time;
    for (const b of this.bots) if (b.character !== leader && b.character.team === leader.team) takePing(b, out, w);
    return true;
  }

  /**
   * `asker` (a player, MG1) asks for a magazine at simulation time `time`: the nearest bot teammate with one to spare
   * brings it (ai/magShare.ts MagShare.ask, which says what came of it).
   */
  askForMag(asker: Character, time: number, live: boolean): MagAskResult {
    const w = this.world;
    w.time = time;
    w.live = live;
    return this.mags.ask(asker, w);
  }

  /** The bot teammate an ask for a magazine from `asker` (a player) would go to now, or undefined (MG1: the HUD's hint). */
  magGiverFor(asker: Character): Character | undefined {
    return this.mags.giverFor(asker, this.world);
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
   * A player was hit (M41): writes what `shooter`'s bot knew into `lastHit`. Whether it was holding an angle and how long
   * the victim had been in its view come from its contact with the victim; friendly fire or a ricochet leaves both unknown.
   */
  private recordHit(victim: Character, shooter: Character, ricochet: boolean, time: number): void {
    let held: boolean | null = null;
    let inView: number | null = null;
    if (!ricochet && victim.team !== shooter.team) {
      for (const b of this.bots) {
        if (b.character !== shooter) continue;
        const contact = b.contacts.get(victim.id);
        held = contact?.held ?? false;
        if (contact && Number.isFinite(contact.firstSeenAt) && Number.isFinite(contact.seenAt)) {
          // Still in view, or until the moment the bot lost sight (a BB already in flight).
          const end = time - contact.seenAt > this.cfgOf(shooter.team).contactGrace ? contact.seenAt : time;
          inView = Math.max(0, end - contact.firstSeenAt);
        }
        break;
      }
    }
    recordHitFacts(this.lastHit, time, victim, shooter, ricochet, held, inView, WHAT_GOT_YOU.movingSpeed);
  }

  /** After a simulation tick, while its events are still in the state. */
  observe(state: Readonly<GameState>): void {
    const time = state.time;
    for (const e of state.events) {
      if (e.type === 'roundStart') {
        for (const v of this.visited) v.fill(Number.NEGATIVE_INFINITY);
        this.given.clear(); // resetBot ends every bot's order
        this.planRound();
      } else if (e.type === 'overtime') {
        // Elimination's overtime flag is up (Dev 6 item 45): each bot goes for it once it has taken in the whistle (its
        // skill's overtimeReaction), and draws now whether it goes round the side (its flankChance).
        for (const b of this.bots) {
          b.overtimeAt = time + pick(b.rng, b.skill.overtimeReaction);
          b.overtimeFlank = rngNext(b.rng) < b.skill.flankChance;
        }
      } else if (e.type === 'returned') {
        // Extraction (M45): an opponent back in a wave sets out afresh from its regen point.
        for (const b of this.bots) {
          if (b.character.id !== e.characterId) continue;
          this.planner.sendBack(b, this.world);
          this.run?.returned(b, this.bots, this.world); // its job on the home team (M46)
        }
      } else if (e.type === 'caseOpened') {
        // Extraction (M46): the case's guards move on.
        this.run?.caseOpened(e.case, this.bots, this.world);
      } else {
        if (e.type === 'characterHit') {
          // A hit on a player: what the shooter knew, for the "what got you" card (M41).
          const victim = characterById(state, e.victimId);
          const shooter = characterById(state, e.shooterId);
          if (victim && shooter && !this.botCharacters.has(victim)) this.recordHit(victim, shooter, e.ricochet, time);
        }
        // Gunfire, hit calls, footsteps, noisy props, cases being opened, near misses (ai/hearing.ts).
        hearEvent(e, state, this.world);
      }
    }
    this.mags.observe(state.events, state.characters, time);
  }

  /** A fresh round: each team's plan and lanes (ai/roundPlanner.ts), and in Extraction the home team's jobs. */
  private planRound(): void {
    const run = this.planner.plan(this.world);
    // Extraction (M46): the home team plays the run by jobs, not lanes. The run is the match's one round, so its clock
    // now is the run's length.
    this.run = undefined;
    if (run) {
      const round = this.world.round;
      const home = 1 - round.run.squadTeam;
      this.run = new RunRoles(home, round.clock, this.cfgOf(home));
      this.run.start(this.bots, this.world, this.planner.spawnCentre[round.run.squadTeam]!, this.opts.insertionBerth);
    }
  }

  /**
   * A walkable spot worth checking for `bot`'s team: of a few random walkable spots, the one in the
   * sector the team checked least recently (never-checked sectors further from home first, or with the skill's
   * huntsMiddle nearer the middle of the map). A sector is checked where a teammate stood and, since M87, where one saw
   * it empty (botMovement glance; a spot the bot can see from where it stands is seen there and then: seesSpot). A check
   * holds for the skill's huntMemory: older, or never, counts alike, so the middle still draws the hunt.
   */
  private huntPoint(bot: Bot, out: Vec3): boolean {
    const nav = this.opts.nav;
    const w = this.world;
    const cfg = w.cfg;
    const visited = this.visited[bot.character.team]!;
    const home = this.planner.spawnCentre[bot.character.team]!;
    const enemy = this.planner.spawnCentre[1 - bot.character.team]!;
    // huntsMiddle (Pro since M40, every level since M71): the middle of the map, between the two ends, rather than the
    // far end.
    const middle = bot.skill.huntsMiddle;
    const midX = (home.x + enemy.x) / 2;
    const midZ = (home.z + enemy.z) / 2;
    // Checked longer ago than this counts as never (M87; with no memory limit, NEVER: as before M87).
    const stale = Math.max(NEVER, w.time - bot.skill.huntMemory);
    let best = Number.POSITIVE_INFINITY;
    // A spot it sees empty from here is checked now, not worth the walk: one is picked only if every spot drawn is one.
    let inView = Number.POSITIVE_INFINITY;
    const cells = nav.cols * nav.rows;
    for (let k = 0, tries = 0; k < cfg.huntCandidates && tries < cfg.huntCandidates * cfg.huntTriesPerCandidate; tries++) {
      const cell = Math.floor(rngNext(bot.rng) * cells);
      // One of the cell's floors (M34b: a draw only where floors are stacked, so a map without stays as it was).
      const floors = nav.cellStart[cell + 1]! - nav.cellStart[cell]!;
      if (floors === 0) continue;
      const node = nav.cellStart[cell]! + (floors > 1 ? Math.floor(rngNext(bot.rng) * floors) : 0);
      if (!nav.walkable[node]) continue;
      k++;
      const x = cellX(nav, cell % nav.cols);
      const z = cellZ(nav, Math.floor(cell / nav.cols));
      const sector = this.sectorOf(x, z);
      const seen = visited[sector]!;
      // Stale sectors first (never checked counts as long ago); then prefer those far from home (the enemy's side), or
      // with huntsMiddle those near the middle.
      const lean = middle ? -Math.hypot(x - midX, z - midZ) * cfg.huntMiddleBias : Math.hypot(x - home.x, z - home.z) * cfg.huntFarBias;
      const score = Math.max(Number.isFinite(seen) ? seen : NEVER, stale) - lean;
      if (cfg.huntClearRange > 0) {
        candidate.x = x;
        candidate.y = nav.floorY[node]!;
        candidate.z = z;
        if (seesSpot(bot.character, candidate, cfg.huntClearRange, w.query, cfg, w.body, w.hits, w.sight)) {
          visited[sector] = w.time;
          if (!Number.isFinite(best) && score < inView) {
            inView = score;
            copy(out, candidate);
          }
          continue;
        }
      }
      if (score < best) {
        best = score;
        out.x = x;
        out.y = nav.floorY[node]!;
        out.z = z;
      }
    }
    return Number.isFinite(best) || Number.isFinite(inView);
  }

  private sectorOf(x: number, z: number): number {
    const nav = this.opts.nav;
    const size = this.opts.cfg.huntSectorSize; // fixed at construction, like the sector grid
    const i = Math.min(this.sectorCols - 1, Math.max(0, Math.floor((x - nav.minX) / size)));
    const j = Math.min(this.sectorRows - 1, Math.max(0, Math.floor((z - nav.minZ) / size)));
    return j * this.sectorCols + i;
  }

  /**
   * Serves at most cfg.pathsPerTick route requests, round-robin across bots, within NAV.searchBudget node expansions
   * a tick in all (audit AI-04): a search the budget doesn't finish carries on next tick, its bot still waiting for
   * the route (and following its old one, botMovement). A bot that stops wanting it, or wants it elsewhere, drops it.
   */
  private planRoutes(): void {
    let budget = NAV.searchBudget;
    for (let served = 0; served < this.world.cfg.pathsPerTick && budget > 0; served++) {
      const b = this.openSearch();
      if (!b) return;
      const step = stepRoute(this.opts.nav, this.search, budget);
      budget -= this.search.expanded;
      if (step === 'pending') return;
      this.searching = undefined;
      // The route ends on the goal it was searched for: a carried search's goal may since have moved a little.
      if (step === 'found') {
        copy(b.routeGoal, this.searchGoal);
        endRoute(this.opts.nav, this.search, b.character.position, b.routeGoal, b.route, this.opts.legProbe ?? NAV.legProbe);
      }
      this.routeDone(b, step === 'found');
    }
  }

  /**
   * The bot whose search is open: the one carried over if it is still in play and wants a route about there (its goal
   * moved less than replanDistance, as Follow me's spot does every tick; BP2), else the next to begin one.
   */
  private openSearch(): Bot | undefined {
    const open = this.searching;
    const g = this.searchGoal;
    if (open && open.routeState === 'wanted' && isInPlay(open.character) && open.routeGoal.y === g.y && Math.hypot(open.routeGoal.x - g.x, open.routeGoal.z - g.z) < this.world.cfg.replanDistance) return open;
    this.searching = undefined;
    const n = this.bots.length;
    for (let k = 0; k < n; k++) {
      const i = (this.plannerCursor + k) % n;
      const b = this.bots[i]!;
      // A bot hit while it waited walks off on its own route (M74): no search for it.
      if (b.routeState !== 'wanted' || !isInPlay(b.character)) continue;
      // Over low obstacles too (M102), unless this bot was lately held up at one.
      this.search.vaults = this.world.time >= b.vaultsOffUntil;
      if (!beginRoute(this.opts.nav, this.search, b.character.position, b.routeGoal, this.opts.navSnap)) {
        this.routeDone(b, false);
        continue;
      }
      this.plannerCursor = (i + 1) % n; // the next search starts after this bot
      this.searching = b;
      copy(this.searchGoal, b.routeGoal);
      return b;
    }
    return undefined;
  }

  private routeDone(b: Bot, ok: boolean): void {
    if (!ok) b.route.length = 0;
    b.routeLeg = 0;
    b.stuckFor = 0;
    // The first leg starts where the route was pulled from (endRoute: the bot's position now).
    copy(b.routeFrom, b.character.position);
    b.routeState = ok ? 'ok' : 'failed';
    if (!ok) b.routeRetryAt = this.world.time + this.world.cfg.routeRetryDelay;
  }
}

/** True if a walk-off route will be planned in the coming simulation step (a victim hit last tick, M27). */
function walkOffRouteDue(characters: readonly Character[]): boolean {
  for (const c of characters) if (c.walkOffRoutePending) return true;
  return false;
}
