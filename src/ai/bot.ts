import type { BotBehaviour, BotSkill } from '../config/bots';
import { NEUTRAL_STYLE, type PersonalityStyle } from '../config/botsFile';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import type { SquadOrderKind } from '../config/squad';
import type { NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import type { RoundState } from '../sim/round';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { type AimState, createAim } from './aim';
import { createHeldAngle, type HeldAngle } from './angles';
import type { AngleFeatures } from './angleFeatures';
import { type CoverBlock, type CoverSpot, createCoverSpot } from './cover';
import type { SightConditions } from './perception';
import { type BotIdentity, personalSkill } from './personality';

/**
 * A bot's modes:
 * - advance: walk a lane towards the enemy side, pausing at lane points to look ahead; once the lane
 *   is swept, hunt: head for the parts of the map the team has checked least recently;
 * - fight: someone is in sight: react, aim, shoot in bursts, sidestep;
 * - cover: under fire or reloading: move to a spot hidden from the threat and duck; at crouch-high
 *   cover, stand up to look (and fight from the spot) a few times before moving on, and at a corner of
 *   full-height cover, lean out to look the same way;
 * - search: lost sight of (or heard) someone: go to where they were last known;
 * - flag (flag mode): go to the pole, crouch there and work the rope: attackers once their lane is swept,
 *   defenders while the flag is off the bottom. In flag mode defenders hold a point near home on their
 *   lane instead of advancing, and nobody hunts.
 * - order: carrying out a squad order from a player on its team (M22): following them, holding a spot or regrouping
 *   on them. It takes the place of advancing, searching and the pole; fights and cover still come first.
 * - mag: the magazine hand-off (MG1, ai/magShare.ts): bringing a teammate who asked one of its spares and tossing it
 *   (before a squad order), or low itself, waiting where it is for the teammate bot bringing one, or going over to the
 *   player it asked (after the order and the pole). Fights and cover still come first.
 */
export type BotMode = 'advance' | 'fight' | 'cover' | 'search' | 'flag' | 'order' | 'mag';

/**
 * Extraction (M46; plan, section 3): a home-team bot's job in a run, which takes the place of its lane ('none' in the
 * other modes, and on the squad). Fights, cover and searches still come first.
 * - guard: posted at a case, holding cover facing the way in, going after noises only within guardLeash of it;
 * - patrol: walking a round of the cases, in pairs, pausing at each;
 * - hunter: from the run's huntersFrom on, making for where its team last saw or heard the squad, and pushing in.
 */
export type RunRole = 'none' | 'guard' | 'patrol' | 'hunter';

/** A patrol's round (M46): stops in front of cases, in walking order, with the case each is for. A pair shares one. */
export interface PatrolRound {
  stops: Vec3[];
  cases: number[];
}

/** What a bot remembers about one enemy it has seen (sight only; hearing never counts). */
export interface Contact {
  /** Last time this enemy was in sight (s). */
  seenAt: number;
  /** When this contact began: the aim error settles from here. */
  acquiredAt: number;
  /** When this contact was first seen, unbroken since (M41: the "what got you" card's time in view; acquiredAt is shifted back by a pre-aim). */
  firstSeenAt: number;
  /** It began with the bot holding an angle (M41): a Pro bot standing still with its view already on that spot. */
  held: boolean;
  /** The bot may open fire on this enemy from this time on (its reaction delay). */
  reactAt: number;
}

export interface Bot {
  character: Character;
  /**
   * How good this bot is and its habits: its team's difficulty level (M20) with its personality laid over it (BN1,
   * ai/personality.ts personalSkill). Everything else it is tuned by is `BotWorld.cfg`. Changed only between rounds, by
   * adaptive difficulty (AD1, BotController.setTeamSkill), the personality laid over the new level again.
   */
  skill: BotSkill;
  /** Its personality's key (bots.md: "rusher"), or '' without one. */
  readonly personality: string;
  /** What its personality changes besides the skill (BN1): pushing in, its own lane, holding, aiming from cover. */
  readonly style: PersonalityStyle;
  rng: RngState;
  aim: AimState;
  mode: BotMode;
  thinkLeft: number;

  // What it knows. Sight and hearing are tracked apart: only sight counts as "the same contact".
  targetId: number;
  targetVisible: boolean;
  /** Which part of the target is visible, as a fraction of its height (aim there). */
  targetPart: number;
  /** Per enemy id, the last sighting; switching back to someone seen moments ago is no new contact. */
  contacts: Map<number, Contact>;
  /** The current target's contact (undefined without a target). */
  contact: Contact | undefined;
  heardAt: number;
  lastKnown: Vec3;
  hasLastKnown: boolean;
  lastThreatAt: number;
  suppressedAt: number;
  /**
   * Heard while fighting someone else (audit AI-15): roughly where another enemy made a noise, and when (-Infinity:
   * nothing). Becomes the last-known spot once the bot loses its target.
   */
  heardOther: Vec3;
  heardOtherAt: number;
  /**
   * A teammate's ping it took (PG1, ai/pings.ts): when (-Infinity: none this round) and the floor spot. It is the bot's
   * last-known spot until real news replaces it, kept in mind for BOT_BEHAVIOUR.pingMemory (pingInMind).
   */
  pingAt: number;
  pingSpot: Vec3;

  // Firing.
  burstLeft: number;
  pauseLeft: number;

  // Moving.
  lane: number;
  laneIndex: number;
  laneDir: number;
  /** Lane points to walk this round (Infinity: all of them). Flag-mode defenders stop at the last one and hold it. */
  lanePoints: number;
  /** Flag-mode attacker that has swept its lane: heads for the pole from now on. */
  laneDone: boolean;
  /** Attack / Defend defender picked to go and pull the flag down (one of the nearest to the pole; set by the controller each tick). */
  retake: boolean;
  /** Where by the pole this bot stands (flag mode). */
  flagGoal: Vec3;
  /** Swept the whole lane: now hunting the least recently checked parts of the map. */
  hunting: boolean;
  huntGoal: Vec3;
  /** When the hunt goal was picked (s): its sector checked by the team since then sends the bot elsewhere (M87). */
  huntPickedAt: number;
  /** Glances taken (M87): each looks at the next spot of a fixed spread over the field of view (botMovement glance). */
  glances: number;
  /** The current lane point, moved a little at random (laneJitter). */
  laneGoal: Vec3;
  holdLeft: number;
  /** Seconds stood at the lane point just reached (the hold there counts), and whether to wait for teammates. */
  teamWait: number;
  waitForTeam: boolean;
  /** Holding still this tick: at a lane point (hold or team wait), or at a defender's post (AI-02). */
  holding: boolean;
  /** Whether to crouch while holding here: decided once per hold by one ray towards the enemy side (AI-02). */
  holdCrouch: boolean;
  /** A guard at a lean post (M55, audit AI-01): the way it leans out while it holds there, chosen with holdCrouch. */
  holdLean: number;
  /**
   * How far (rad) a guard leaning out at its post turns as it sweeps: unlimited till its leaned eye loses the way in at
   * a turn, then holdLeanSweepBackDeg short of that turn (BN1). Reset with holdLean on arrival.
   */
  holdSweepReach: number;
  /** Held angles (M37): the corners it aims at while holding (best first), how many, and when they were found (s). */
  heldAngles: HeldAngle[];
  heldAngleCount: number;
  heldAnglesAt: number;
  heldAnglesFrom: Vec3;
  /** Near the enemy with slicesCorners (M38): walking and aiming at each corner ahead as it opens (set each tick). */
  careful: boolean;
  /** Lost sight of someone (M38, peekWatchTime): stays and watches where they were until this time (s). */
  watchUntil: number;
  /** When it last heard a teammate call a hit (M38, teamPlay: trade them for tradeTime s), and whether it has tried. */
  tradeAt: number;
  tradeTried: boolean;
  /** A defender settled at its post last tick: its holdCrouch was chosen on arrival and stands until it leaves (AI-02). */
  atPost: boolean;
  /** On the way to cover by the lane point just reached, to hold from there (AI-02). */
  holdCover: boolean;
  holdSpot: CoverSpot;
  /** End of a search with nobody found (AI-14): seconds left looking round, and the heading it arrived on. */
  searchLookLeft: number;
  searchLookTime: number;
  searchLookYaw: number;
  /** Flanking a search (AI-17): going round by `flankGoal` before heading for the last-known spot. */
  flanking: boolean;
  flankGoal: Vec3;
  /** Attack / Defend attacker that raises the flag (the others guard the pole from cover; set by the controller, AI-06). */
  raiser: boolean;
  /** Flag mode: whether `flagGoal` is a guard spot (not by the pole), and for which raiser state it was picked. */
  flagGuard: boolean;
  /** No route search for this bot before this time (s): its last one found no way (AI-07). */
  routeRetryAt: number;
  route: Vec3[];
  routeLeg: number;
  /**
   * Where the leg the bot walks now starts (G11): where the route was planned from, then each waypoint reached, then
   * wherever followRoute last checked the way on from. A bot pushed off that line (a hold, a fight, a teammate) has
   * the way from where it is checked before it walks on, so it never takes a ledge the leg went round (routes.ts).
   */
  routeFrom: Vec3;
  routeGoal: Vec3;
  /** 'none': no route; 'wanted': waiting for the planner; 'ok': following `route`; 'failed': no route exists. */
  routeState: 'none' | 'wanted' | 'ok' | 'failed';
  /** World direction (unit, horizontal) the bot walks this tick, while following a route. */
  moveDir: { x: number; z: number };
  /**
   * The leg it walks this tick goes over a low obstacle (M102, nav/vaultLinks.ts): it faces the way and presses Jump
   * once a vault is there (botBrain). Set by followRoute each tick it walks one.
   */
  vaultLeg: boolean;
  /** No vault in this bot's routes before this time (s): it got stuck on a vault leg (BOT_BEHAVIOUR.vaultRetryDelay). */
  vaultsOffUntil: number;
  stuckFor: number;
  /**
   * The holster (M92, ai/botHolster.ts): seconds sprinting without a break, and seconds since the sprint last ended
   * (each 0 while the other counts).
   */
  sprintRun: number;
  sprintGap: number;
  cover: CoverSpot;
  coverLeft: number;
  /** Time left before giving up on cover altogether (unreachable spot, endless reload...). */
  coverGiveUp: number;
  /** Seconds spent at the cover spot so far. */
  coverHeld: number;
  /** When this cover episode began (s): it ends after coverEpisodeMax. */
  coverSince: number;
  coverCooldown: number;
  /** At a crouch-high cover spot: ducked, or standing up to look over it. */
  coverPhase: 'down' | 'peek';
  /** Looks over the cover left, and time left in the current look (s). */
  peeksLeft: number;
  peekLeft: number;
  /** Fighting from a crouch-cover spot (stays put; ducks again after `peekFightLeft` s or under fire). */
  fromCover: boolean;
  peekFightLeft: number;
  strafeDir: number;
  strafeLeft: number;
  /**
   * A hunter fighting (M46): whether a step ahead keeps its target in sight, looked at once per sidestep (as strafeLeft
   * is drawn) rather than every tick (M55, KNOWN_ISSUES row 200).
   */
  pushInSight: boolean;
  /** The target pushInSight was looked at for (-1: none yet this fight); a new fight or target looks again at once (BP2). */
  pushLookFor: number;

  // A squad order from a player on the team (M22; 'none': play the team plan).
  order: SquadOrderKind | 'none';
  /** Who gave it. */
  orderLeader: Character | undefined;
  /** This bot's place among the teammates given the order (which follow or hold spot is its own). */
  orderSlot: number;
  /** Hold: the spot to hold. Follow and regroup: where to make for now (moves with the leader). */
  orderGoal: Vec3;
  /** Which way to look once there (yaw). */
  orderYaw: number;
  /** Follow: the leader's heading (yaw), the way they last moved. */
  orderHeading: number;
  /** Hurrying (regroup, or a follower far behind): sprints even when a fight was close. */
  orderRush: boolean;
  /** Follow me: standing at its spot while the leader stands still. */
  orderSettled: boolean;
  /** Follow me: fallen behind its spot, so going a pace faster than the leader until back on it. */
  orderCatchingUp: boolean;
  /** Follow me: got ahead of its spot, so going a pace slower than the leader until back on it. */
  orderDroppingBack: boolean;
  /**
   * Follow me in Extraction (M46): covering the leader while they open a case, from `orderGoal` (crouched there with
   * `orderCrouch`), watching `orderYaw`.
   */
  orderCovering: boolean;
  orderCrouch: boolean;
  /**
   * Covering at a corner of full cover (M55, audit AI-01): the way it leans out to watch (1 right, -1 left, 0 not a lean
   * spot), the point it watches (`orderWatch`), and whether the lean has been checked again from where it stopped.
   */
  orderLean: number;
  orderWatch: Vec3;
  orderLeanChecked: boolean;

  // Extraction (M46): its job on the home team.
  role: RunRole;
  /** Guard: the case it guards (an index into the run's cases; -1 none), its post and the way it faces there (yaw). */
  guardCase: number;
  post: Vec3;
  postYaw: number;
  /**
   * Guard (M55, audit AI-01): the way in it watches from its post, and the way it leans out there to see it (1 right,
   * -1 left, 0 not a lean post: it stands, or crouches where crouched eyes still see).
   */
  postWatch: Vec3;
  postLean: number;
  /**
   * Patrol: its round (shared with its partner, if it has one) and the stop it is making for (-1: none yet). Of a pair,
   * the lead walks the round and the other keeps with it, stop by stop (the other leads once the lead is out).
   */
  patrol: PatrolRound | undefined;
  patrolIndex: number;
  patrolPartner: Bot | undefined;
  patrolLead: boolean;
  /** Hunter: when the news of the squad it last went after was had (s). */
  newsTaken: number;

  // The magazine hand-off (MG1, ai/magShare.ts).
  /** The teammate who asked that it is bringing a spare to, and when it took that on (s). */
  magFor: Character | undefined;
  magForAt: number;
  /** Its own ask, when it is low: since when (s; -Infinity: none open), whom it asked, and whether that is a player. */
  magAskAt: number;
  magFrom: Character | undefined;
  magFromPlayer: boolean;
  /** A magazine tossed to it is in the air: its ask stays open until it lands. */
  magInAir: boolean;
  /** It asks again no sooner than this (s). */
  magAskGap: number;
  /** Bringing one and still far off: it sprints (MAG_SHARE.hurryDistance). */
  magRush: boolean;
  /**
   * Elimination's overtime flag (Dev 6 item 45): when it goes for the flag (s; the flag going up plus its skill's
   * overtimeReaction; Infinity until it is up), and whether this overtime it goes round the side (its flankChance, drawn
   * once when the flag goes up; used up on the way).
   */
  overtimeAt: number;
  overtimeFlank: boolean;
}

/** Everything a bot's decisions depend on besides its own state. */
export interface BotWorld {
  characters: readonly Character[];
  query: WorldQuery;
  nav: NavGrid;
  lanes: readonly (readonly Vec3[])[];
  /** The map's low and full-height blocks, tried as cover spots (see findCover). */
  lowCover: readonly CoverBlock[];
  tallCover: readonly CoverBlock[];
  /** What hides people besides walls: the map's bushes (M33e) and its dark (M33g); see visiblePart. Absent: daylight, no bushes. */
  sight?: SightConditions;
  /** The map's bushes, posts and stair tops a held angle can be (M40), worked out once when first asked for. */
  angleFeatures(): AngleFeatures;
  body: BodyConfig;
  hits: HitConfig;
  /** The factory loadout the world was built with. Aim no longer reads it: each bot leads and judges its line by the replica in its hands (BP3). */
  loadout: readonly ReplicaConfig[];
  /** The behaviour tuning every bot shares, whatever its level; each bot's skill is its own (`Bot.skill`). */
  cfg: BotBehaviour;
  /** The match: mode, who attacks the flag, and the pole (read only). */
  round: RoundState;
  /** Per team, the yaw that faces the enemy's side of the map. */
  enemyYaw: readonly number[];
  /** Picks somewhere worth checking for `bot`'s team (least recently visited); false if none. */
  huntPoint(bot: Bot, out: Vec3): boolean;
  /** True if `bot` is more than teamSpread ahead (towards the enemy side) of its rearmost bot teammate. */
  aheadOfTeam(bot: Bot): boolean;
  /** True if `bot` stands past the middle of the map, towards the enemy's end (M38: near the enemy). */
  inEnemyHalf(bot: Bot): boolean;
  /**
   * Extraction (M46): the latest place `team`'s bots saw or heard someone of the squad, into `out`; returns when
   * (s; -Infinity: never, and in the other modes).
   */
  squadNews(team: number, out: Vec3): number;
  /**
   * Counts `point`'s hunt sector as just checked by `bot`'s team: a spot it found no route to (AI-07), or saw empty (M87,
   * botMovement glance). The team shares what each of its bots checked, for the skill's huntMemory.
   */
  markVisited(bot: Bot, point: Vec3): void;
  /**
   * True if `bot`'s team has checked the sector of its hunt goal since the bot picked it (M87: a teammate went there or
   * saw it empty, or it saw it itself), and the bot isn't standing in that sector already.
   */
  huntGoalChecked(bot: Bot): boolean;
  /** Every bot in the match (teammates' cover spots and lane holds, AI-01). */
  bots: readonly Bot[];
  /** Simulation time now (s). */
  time: number;
  /** False after the round is decided (cease-fire). */
  live: boolean;
}

/**
 * A bot for `character` playing at `skill` as `identity`'s personality (none: the level as it is), with no lane until
 * the controller plans the round (resetBot).
 */
export function createBot(character: Character, seed: number, cfg: BotBehaviour, skill: BotSkill, identity?: BotIdentity): Bot {
  const style = identity?.style ?? NEUTRAL_STYLE;
  const bot: Bot = {
    character,
    skill: personalSkill(skill, style),
    personality: identity?.personality ?? '',
    style,
    rng: createRng(seed),
    aim: createAim(character.yaw),
    mode: 'advance',
    thinkLeft: 0,
    targetId: -1,
    targetVisible: false,
    targetPart: cfg.aimHeightFraction,
    contacts: new Map(),
    contact: undefined,
    heardAt: Number.NEGATIVE_INFINITY,
    lastKnown: vec3(),
    hasLastKnown: false,
    lastThreatAt: Number.NEGATIVE_INFINITY,
    suppressedAt: Number.NEGATIVE_INFINITY,
    heardOther: vec3(),
    heardOtherAt: Number.NEGATIVE_INFINITY,
    pingAt: Number.NEGATIVE_INFINITY,
    pingSpot: vec3(),
    burstLeft: 0,
    pauseLeft: 0,
    lane: 0,
    laneIndex: -1,
    laneDir: 1,
    lanePoints: Number.POSITIVE_INFINITY,
    laneDone: false,
    retake: false,
    flagGoal: vec3(),
    hunting: false,
    huntGoal: vec3(),
    huntPickedAt: Number.NEGATIVE_INFINITY,
    glances: 0,
    laneGoal: vec3(),
    holdLeft: 0,
    teamWait: 0,
    waitForTeam: false,
    holding: false,
    heldAngles: [createHeldAngle(), createHeldAngle()],
    heldAngleCount: 0,
    heldAnglesAt: Number.NEGATIVE_INFINITY,
    heldAnglesFrom: vec3(),
    careful: false,
    watchUntil: Number.NEGATIVE_INFINITY,
    tradeAt: Number.NEGATIVE_INFINITY,
    tradeTried: false,
    holdCrouch: false,
    holdLean: 0,
    holdSweepReach: Number.POSITIVE_INFINITY,
    atPost: false,
    holdCover: false,
    holdSpot: createCoverSpot(),
    searchLookLeft: 0,
    searchLookTime: 0,
    searchLookYaw: 0,
    flanking: false,
    flankGoal: vec3(),
    raiser: false,
    flagGuard: false,
    routeRetryAt: Number.NEGATIVE_INFINITY,
    route: [],
    routeLeg: 0,
    routeFrom: vec3(),
    routeGoal: vec3(),
    routeState: 'none',
    moveDir: { x: 0, z: 0 },
    vaultLeg: false,
    vaultsOffUntil: Number.NEGATIVE_INFINITY,
    stuckFor: 0,
    sprintRun: 0,
    sprintGap: 0,
    cover: createCoverSpot(),
    coverLeft: 0,
    coverGiveUp: 0,
    coverHeld: 0,
    coverSince: 0,
    coverCooldown: 0,
    coverPhase: 'down',
    peeksLeft: 0,
    peekLeft: 0,
    fromCover: false,
    peekFightLeft: 0,
    strafeDir: 1,
    strafeLeft: 0,
    pushInSight: false,
    pushLookFor: -1,
    order: 'none',
    orderLeader: undefined,
    orderSlot: 0,
    orderGoal: vec3(),
    orderYaw: 0,
    orderHeading: 0,
    orderRush: false,
    orderSettled: false,
    orderCatchingUp: false,
    orderDroppingBack: false,
    orderCovering: false,
    orderCrouch: false,
    orderLean: 0,
    orderWatch: vec3(),
    orderLeanChecked: false,
    role: 'none',
    guardCase: -1,
    post: vec3(),
    postYaw: 0,
    postWatch: vec3(),
    postLean: 0,
    patrol: undefined,
    patrolIndex: -1,
    patrolPartner: undefined,
    patrolLead: false,
    newsTaken: Number.NEGATIVE_INFINITY,
    magFor: undefined,
    magForAt: Number.NEGATIVE_INFINITY,
    magAskAt: Number.NEGATIVE_INFINITY,
    magFrom: undefined,
    magFromPlayer: false,
    magInAir: false,
    magAskGap: Number.NEGATIVE_INFINITY,
    magRush: false,
    overtimeAt: Number.POSITIVE_INFINITY,
    overtimeFlank: false,
  };
  resetBot(bot, -1, 0, cfg);
  return bot;
}

/**
 * Fresh round: forget everything and head for the first point of `lane` (-1: none, hunt) on the way
 * to the enemy, after waiting `startHold` seconds (bots sharing a lane set off apart). `lanePoints`:
 * how many of the lane's points to walk (flag-mode defenders hold the last one).
 */
export function resetBot(b: Bot, lane: number, startHold: number, cfg: BotBehaviour, lanePoints = Number.POSITIVE_INFINITY): void {
  const c = b.character;
  b.aim = createAim(c.yaw);
  b.mode = 'advance';
  b.thinkLeft = rngNext(b.rng) * cfg.thinkInterval; // stagger perception across bots
  forgetTarget(b);
  for (const contact of b.contacts.values()) contact.seenAt = Number.NEGATIVE_INFINITY;
  b.hasLastKnown = false;
  b.heardAt = Number.NEGATIVE_INFINITY;
  b.lastThreatAt = Number.NEGATIVE_INFINITY;
  b.suppressedAt = Number.NEGATIVE_INFINITY;
  b.heardOtherAt = Number.NEGATIVE_INFINITY;
  b.pingAt = Number.NEGATIVE_INFINITY;
  b.burstLeft = 0;
  b.pauseLeft = 0;
  b.lane = lane;
  // From end 0 a bot walks the lane points first to last, from end 1 last to first.
  b.laneDir = c.end === 0 ? 1 : -1;
  b.laneIndex = -1;
  b.hunting = false;
  b.huntPickedAt = Number.NEGATIVE_INFINITY;
  b.lanePoints = lanePoints;
  b.laneDone = false;
  b.retake = false;
  b.holdLeft = startHold;
  b.teamWait = 0;
  // Moving in pairs (M38, teamPlay) starts at the spawn: of two on one lane, one sets off first. Not for a personality
  // that never waits for the team (BN1).
  b.waitForTeam = b.skill.teamPlay && b.style.waitsForTeam;
  b.holding = false;
  b.heldAngleCount = 0;
  b.heldAnglesAt = Number.NEGATIVE_INFINITY;
  b.careful = false;
  b.watchUntil = Number.NEGATIVE_INFINITY;
  b.tradeAt = Number.NEGATIVE_INFINITY;
  b.tradeTried = false;
  b.atPost = false;
  b.holdCover = false;
  b.searchLookLeft = 0;
  b.flanking = false;
  b.pushInSight = false;
  b.pushLookFor = -1;
  b.raiser = false;
  b.flagGuard = false;
  b.routeRetryAt = Number.NEGATIVE_INFINITY;
  b.routeState = 'none';
  b.route.length = 0;
  b.vaultLeg = false;
  b.vaultsOffUntil = Number.NEGATIVE_INFINITY;
  b.stuckFor = 0;
  b.sprintRun = 0;
  b.sprintGap = 0;
  b.coverLeft = 0;
  b.coverCooldown = 0;
  b.fromCover = false;
  b.order = 'none';
  b.orderLeader = undefined;
  b.orderRush = false;
  b.orderCovering = false;
  b.orderLean = 0;
  b.role = 'none';
  b.guardCase = -1;
  b.postLean = 0;
  b.patrol = undefined;
  b.patrolIndex = -1;
  b.patrolPartner = undefined;
  b.newsTaken = Number.NEGATIVE_INFINITY;
  // A new round starts with full magazines: no hand-off carries over.
  b.magFor = undefined;
  b.magAskAt = Number.NEGATIVE_INFINITY;
  b.magFrom = undefined;
  b.magInAir = false;
  b.magAskGap = Number.NEGATIVE_INFINITY;
  b.magRush = false;
  b.overtimeAt = Number.POSITIVE_INFINITY;
  b.overtimeFlank = false;
}

/** Drops the current target (its contact stays remembered for contactGrace). */
export function forgetTarget(b: Bot): void {
  b.targetId = -1;
  b.targetVisible = false;
  b.contact = undefined;
}

/**
 * A bot done with its target (out of play, or searched for in vain) turns to the other enemy it heard while fighting
 * (AI-15): that guess becomes its last-known spot. False if it heard nobody else lately (memoryTime).
 */
export function recallHeardOther(b: Bot, time: number, cfg: BotBehaviour): boolean {
  if (time - b.heardOtherAt >= cfg.memoryTime) return false;
  b.lastKnown.x = b.heardOther.x;
  b.lastKnown.y = b.heardOther.y;
  b.lastKnown.z = b.heardOther.z;
  b.hasLastKnown = true;
  b.heardAt = b.heardOtherAt;
  b.heardOtherAt = Number.NEGATIVE_INFINITY;
  return true;
}

/** True while the bot still remembers an enemy it saw or heard (memoryTime), or a teammate's ping it took (pingInMind). */
export function threatInMind(b: Bot, w: BotWorld): boolean {
  return b.hasLastKnown && (w.time - Math.max(lastSeenAt(b), b.heardAt) < w.cfg.memoryTime || pingInMind(b, w));
}

/**
 * A teammate's ping (PG1) is what the bot has in mind: taken within pingMemory, and still its last-known spot (real
 * news since, a sighting, a noise or a teammate's, writes another; a search that got there and looked forgets it).
 */
export function pingInMind(b: Bot, w: BotWorld): boolean {
  return w.time - b.pingAt < w.cfg.pingMemory && onPingSpot(b);
}

/** Whether `b`'s last-known spot is still the one a teammate's ping gave it (PG1), however long ago. */
export function onPingSpot(b: Bot): boolean {
  return b.hasLastKnown && b.pingAt > Number.NEGATIVE_INFINITY && b.lastKnown.x === b.pingSpot.x && b.lastKnown.z === b.pingSpot.z && b.lastKnown.y === b.pingSpot.y;
}

/** When the current target was last seen, or -Infinity without one. */
export function lastSeenAt(b: Bot): number {
  return b.contact ? b.contact.seenAt : Number.NEGATIVE_INFINITY;
}

/** A random value in [min, max] from the bot's own seeded generator. */
export const pick = (rng: RngState, r: readonly [number, number]): number => r[0] + rngNext(rng) * (r[1] - r[0]);

/**
 * The way `b` faces while holding still (M46): a guard the way into its case, a bot watching the overtime flag from cover
 * (Dev 6 item 45) at the flag from its spot, everyone else the enemy's side.
 */
export function holdYaw(b: Bot, w: BotWorld): number {
  if (b.role === 'guard') return b.postYaw;
  if (b.mode === 'flag' && b.flagGuard && w.round.overtimeFlag.up) {
    const flag = w.round.overtimeFlag.position;
    return Math.atan2(-(flag.x - b.flagGoal.x), -(flag.z - b.flagGoal.z));
  }
  return w.enemyYaw[b.character.team] ?? 0;
}

/** Flag mode: whether `b`'s team attacks or defends the pole this round ('none' in elimination). */
export function flagRole(b: Bot, w: BotWorld): 'attack' | 'defend' | 'none' {
  const r = w.round;
  if (r.mode !== 'attackDefend' || r.attackers < 0) return 'none';
  return b.character.team === r.attackers ? 'attack' : 'defend';
}

/**
 * True if `b` should be at the pole now: an attacker that has swept its lane, or a defender picked to
 * retake while the flag is off the bottom (the flag on its pole is in plain view; bots know how far up
 * it is). The others hold their posts. In Elimination's overtime (Dev 6 item 45), every bot once its reaction to the
 * flag going up is over: the flag comes before chasing noises, as the pole does.
 */
export function wantsFlag(b: Bot, w: BotWorld): boolean {
  const role = flagRole(b, w);
  if (role === 'attack') return b.laneDone;
  if (role === 'defend') return w.round.flag.progress > 0 && b.retake;
  return w.round.overtimeFlag.up && w.round.phase === 'live' && w.time >= b.overtimeAt;
}

/** Where flag mode heads: Attack / Defend's pole, or Elimination's overtime flag (Dev 6 item 45). */
export function flagSpot(w: BotWorld): Vec3 {
  return w.round.overtimeFlag.up ? w.round.overtimeFlag.position : w.round.flag.position;
}
