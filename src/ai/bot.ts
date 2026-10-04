import type { BotBehaviour, BotSkill } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import type { SquadOrderKind } from '../config/squad';
import type { Bush } from '../map/foliage';
import type { NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import type { RoundState } from '../sim/round';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { type AimState, createAim } from './aim';
import { createHeldAngle, type HeldAngle } from './angles';
import { type CoverBlock, type CoverSpot, createCoverSpot } from './cover';

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
 */
export type BotMode = 'advance' | 'fight' | 'cover' | 'search' | 'flag' | 'order';

/** What a bot remembers about one enemy it has seen (sight only; hearing never counts). */
export interface Contact {
  /** Last time this enemy was in sight (s). */
  seenAt: number;
  /** When this contact began: the aim error settles from here. */
  acquiredAt: number;
  /** The bot may open fire on this enemy from this time on (its reaction delay). */
  reactAt: number;
}

export interface Bot {
  character: Character;
  /** How good this bot is: its team's difficulty level (M20). Everything else it is tuned by is `BotWorld.cfg`. */
  readonly skill: BotSkill;
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
  /** Held angles (M37): the corners it aims at while holding (best first), how many, and when they were found (s). */
  heldAngles: HeldAngle[];
  heldAngleCount: number;
  heldAnglesAt: number;
  heldAnglesFrom: Vec3;
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
  routeGoal: Vec3;
  /** 'none': no route; 'wanted': waiting for the planner; 'ok': following `route`; 'failed': no route exists. */
  routeState: 'none' | 'wanted' | 'ok' | 'failed';
  /** World direction (unit, horizontal) the bot walks this tick, while following a route. */
  moveDir: { x: number; z: number };
  stuckFor: number;
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
  /** The map's bushes (M33e): bots can't see through them (see visiblePart). Absent: none. */
  foliage?: readonly Bush[];
  body: BodyConfig;
  hits: HitConfig;
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
  /** Counts `point`'s hunt sector as just checked by `bot`'s team (a spot it found no route to, AI-07). */
  markVisited(bot: Bot, point: Vec3): void;
  /** Every bot in the match (teammates' cover spots and lane holds, AI-01). */
  bots: readonly Bot[];
  /** Simulation time now (s). */
  time: number;
  /** False after the round is decided (cease-fire). */
  live: boolean;
}

/** A bot for `character` playing at `skill`, with no lane until the controller plans the round (resetBot). */
export function createBot(character: Character, seed: number, cfg: BotBehaviour, skill: BotSkill): Bot {
  const bot: Bot = {
    character,
    skill,
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
    laneGoal: vec3(),
    holdLeft: 0,
    teamWait: 0,
    waitForTeam: false,
    holding: false,
    heldAngles: [createHeldAngle(), createHeldAngle()],
    heldAngleCount: 0,
    heldAnglesAt: Number.NEGATIVE_INFINITY,
    heldAnglesFrom: vec3(),
    holdCrouch: false,
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
    routeGoal: vec3(),
    routeState: 'none',
    moveDir: { x: 0, z: 0 },
    stuckFor: 0,
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
  b.burstLeft = 0;
  b.pauseLeft = 0;
  b.lane = lane;
  // From end 0 a bot walks the lane points first to last, from end 1 last to first.
  b.laneDir = c.end === 0 ? 1 : -1;
  b.laneIndex = -1;
  b.hunting = false;
  b.lanePoints = lanePoints;
  b.laneDone = false;
  b.retake = false;
  b.holdLeft = startHold;
  b.teamWait = 0;
  b.waitForTeam = false;
  b.holding = false;
  b.heldAngleCount = 0;
  b.heldAnglesAt = Number.NEGATIVE_INFINITY;
  b.atPost = false;
  b.holdCover = false;
  b.searchLookLeft = 0;
  b.flanking = false;
  b.raiser = false;
  b.flagGuard = false;
  b.routeRetryAt = Number.NEGATIVE_INFINITY;
  b.routeState = 'none';
  b.route.length = 0;
  b.stuckFor = 0;
  b.coverLeft = 0;
  b.coverCooldown = 0;
  b.fromCover = false;
  b.order = 'none';
  b.orderLeader = undefined;
  b.orderRush = false;
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

/** When the current target was last seen, or -Infinity without one. */
export function lastSeenAt(b: Bot): number {
  return b.contact ? b.contact.seenAt : Number.NEGATIVE_INFINITY;
}

/** A random value in [min, max] from the bot's own seeded generator. */
export const pick = (rng: RngState, r: readonly [number, number]): number => r[0] + rngNext(rng) * (r[1] - r[0]);

/** Flag mode: whether `b`'s team attacks or defends the pole this round ('none' in elimination). */
export function flagRole(b: Bot, w: BotWorld): 'attack' | 'defend' | 'none' {
  const r = w.round;
  if (r.mode !== 'attackDefend' || r.attackers < 0) return 'none';
  return b.character.team === r.attackers ? 'attack' : 'defend';
}

/**
 * True if `b` should be at the pole now: an attacker that has swept its lane, or a defender picked to
 * retake while the flag is off the bottom (the flag on its pole is in plain view; bots know how far up
 * it is). The others hold their posts.
 */
export function wantsFlag(b: Bot, w: BotWorld): boolean {
  const role = flagRole(b, w);
  if (role === 'attack') return b.laneDone;
  return role === 'defend' && w.round.flag.progress > 0 && b.retake;
}
