import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import type { NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { type AimState, createAim } from './aim';
import type { CoverSpot } from './cover';

/**
 * A bot's modes:
 * - advance: walk a lane towards the enemy side, pausing at lane points to look ahead; once the lane
 *   is swept, hunt: head for the parts of the map the team has checked least recently;
 * - fight: someone is in sight: react, aim, shoot in bursts, sidestep;
 * - cover: under fire or reloading: move to a spot hidden from the threat, wait, then peek;
 * - search: lost sight of (or heard) someone: go to where they were last known.
 */
export type BotMode = 'advance' | 'fight' | 'cover' | 'search';

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

  // Firing.
  burstLeft: number;
  pauseLeft: number;

  // Moving.
  lane: number;
  laneIndex: number;
  laneDir: number;
  /** Swept the whole lane: now hunting the least recently checked parts of the map. */
  hunting: boolean;
  huntGoal: Vec3;
  holdLeft: number;
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
  coverCooldown: number;
  strafeDir: number;
  strafeLeft: number;
}

/** Everything a bot's decisions depend on besides its own state. */
export interface BotWorld {
  characters: readonly Character[];
  query: WorldQuery;
  nav: NavGrid;
  lanes: readonly (readonly Vec3[])[];
  body: BodyConfig;
  hits: HitConfig;
  loadout: readonly ReplicaConfig[];
  cfg: BotConfig;
  /** Per team, the yaw that faces the enemy's side of the map. */
  enemyYaw: readonly number[];
  /** Picks somewhere worth checking for `bot`'s team (least recently visited); false if none. */
  huntPoint(bot: Bot, out: Vec3): boolean;
  /** Simulation time now (s). */
  time: number;
  /** False after the round is decided (cease-fire). */
  live: boolean;
}

export function createBot(character: Character, seed: number, laneCount: number, cfg: BotConfig): Bot {
  const bot: Bot = {
    character,
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
    burstLeft: 0,
    pauseLeft: 0,
    lane: 0,
    laneIndex: -1,
    laneDir: 1,
    hunting: false,
    huntGoal: vec3(),
    holdLeft: 0,
    route: [],
    routeLeg: 0,
    routeGoal: vec3(),
    routeState: 'none',
    moveDir: { x: 0, z: 0 },
    stuckFor: 0,
    cover: { position: vec3(), crouchOnly: false },
    coverLeft: 0,
    coverGiveUp: 0,
    coverHeld: 0,
    coverCooldown: 0,
    strafeDir: 1,
    strafeLeft: 0,
  };
  resetBot(bot, laneCount, cfg);
  return bot;
}

/** Fresh round: forget everything, pick a lane and head for its first point on the way to the enemy. */
export function resetBot(b: Bot, laneCount: number, cfg: BotConfig): void {
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
  b.burstLeft = 0;
  b.pauseLeft = 0;
  b.lane = laneCount > 0 ? Math.floor(rngNext(b.rng) * laneCount) : -1;
  // Blue (team 0) advances west → east through lane points, Orange the other way.
  b.laneDir = c.team === 0 ? 1 : -1;
  b.laneIndex = -1;
  b.hunting = false;
  b.holdLeft = 0;
  b.routeState = 'none';
  b.route.length = 0;
  b.stuckFor = 0;
  b.coverLeft = 0;
  b.coverCooldown = 0;
}

/** Drops the current target (its contact stays remembered for contactGrace). */
export function forgetTarget(b: Bot): void {
  b.targetId = -1;
  b.targetVisible = false;
  b.contact = undefined;
}

/** When the current target was last seen, or -Infinity without one. */
export function lastSeenAt(b: Bot): number {
  return b.contact ? b.contact.seenAt : Number.NEGATIVE_INFINITY;
}

/** A random value in [min, max] from the bot's own seeded generator. */
export const pick = (rng: RngState, r: readonly [number, number]): number => r[0] + rngNext(rng) * (r[1] - r[0]);
