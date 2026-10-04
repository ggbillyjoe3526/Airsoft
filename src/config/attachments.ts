import { GAME_STATS } from './gameStats';
import type { LaserId } from './lasers';
import type { ReplicaConfig } from './replicas';
import { overlay } from './statsFile';

/**
 * Attachments (M17b): the grip and magazine fitted to a replica on the Loadout screen. Each is a trade-off, never a
 * straight upgrade (ROADMAP M17): one hit is still one hit. Bots keep each replica's factory parts (no grip, the
 * standard magazine). The optics are in config/optics.ts. All numbers are first guesses for the owner's playtest;
 * how many magazines each carries is final-tuned in beta.
 */

export type GripId = 'none' | 'vertical' | 'angled';

export interface GripConfig {
  label: string;
  blurb: string;
  /**
   * Handling: multiplies the time to bring the replica up after switching to it and to raise a fitted optic to your
   * eye (below 1 is quicker).
   */
  handlingScale: number;
  /**
   * Steadiness: multiplies how long the shake of a sprint or a landing carries into your aim afterwards
   * (MOVEMENT.accuracy carryTime and settleTime; below 1 settles sooner).
   */
  shakeScale: number;
}

/**
 * Small, opposite strengths: the vertical grip steadies, the angled grip handles quicker. The numbers below are the
 * built-in ones; stats.md's Grips table is what the game uses (M29).
 */
export const GRIPS: Readonly<Record<GripId, GripConfig>> = overlay<GripConfig>({
  none: { label: 'No Grip', blurb: 'Hand on the handguard, as it comes.', handlingScale: 1, shakeScale: 1 },
  vertical: {
    label: 'Vertical Grip',
    blurb: 'Steadier: the shake of a sprint or a jump leaves your aim sooner. A little slower to bring up and to aim.',
    handlingScale: 1.25,
    shakeScale: 0.6,
  },
  angled: {
    label: 'Angled Grip',
    blurb: 'Quicker: brings the rifle up and raises the sight faster. The shake of a sprint or a jump lasts a little longer.',
    handlingScale: 0.8,
    shakeScale: 1.3,
  },
}, GAME_STATS.grips) as Record<GripId, GripConfig>;

export type MagazineId = 'standard' | 'hiCap' | 'lowCap' | 'extended';

export interface MagazineConfig {
  label: string;
  blurb: string;
  /** BBs it holds, as a multiple of the replica's magSize (rounded). */
  capacity: number;
  /** Magazines carried, added to the replica's `mags` (at least one is always carried). */
  carried: number;
  /** Multiplies the reload time. */
  reloadScale: number;
  /** Multiplies the time to bring the replica up after a switch. */
  drawScale: number;
  /**
   * The BBs rattle in it as you move: walking and moving crouched are no longer silent to bots close by
   * (BOT_BEHAVIOUR.footstepHearingRattle), and you hear it too.
   */
  rattles: boolean;
}

/** Built-in numbers; stats.md's Magazines table is what the game uses (M29). The standard magazine is how a replica comes. */
export const MAGAZINES: Readonly<Record<MagazineId, MagazineConfig>> = overlay<MagazineConfig>({
  standard: { label: 'Standard', blurb: 'As it comes.', capacity: 1, carried: 0, reloadScale: 1, drawScale: 1, rattles: false },
  // Rifle: 120 BBs but two carried (the same 240), fewer reloads, and it gives you away when you sneak.
  hiCap: {
    label: 'Hi-Cap',
    blurb: 'Twice the BBs in each, but only two carried, and the loose BBs rattle: bots close by hear you even walking.',
    capacity: 2,
    carried: -2,
    reloadScale: 1,
    drawScale: 1,
    rattles: true,
  },
  // Rifle: 30 BBs, one more carried (150 in all), and a quicker change.
  lowCap: {
    label: 'Low-Cap',
    blurb: 'Half the BBs in each and one more carried: fewer BBs in all, but quicker to change. Silent.',
    capacity: 0.5,
    carried: 1,
    reloadScale: 0.8,
    drawScale: 1,
    rattles: false,
  },
  // Pistol: 27 BBs; the longer magazine snags as you draw.
  extended: {
    label: 'Extended',
    blurb: 'Half as many BBs again in each, but it sticks out of the grip: slower to draw.',
    capacity: 1.5,
    carried: 0,
    reloadScale: 1,
    drawScale: 1.35,
    rattles: false,
  },
}, GAME_STATS.magazines) as Record<MagazineId, MagazineConfig>;

export type BarrelId = 'tightBore' | 'long';

/**
 * A barrel swapped into a replica (M29b): a quality or a length, each changing how hard and how tightly it shoots. Only
 * replicas tagged `barrel-mount` in pool.md take one (the AEG Rifle); "as it comes" is its standard barrel.
 */
export interface BarrelConfig {
  label: string;
  blurb: string;
  /** Muzzle energy added, as a share (0.08 = 8 % more). */
  energy: number;
  /** Multiplies the replica's spread (below 1 is tighter). */
  spreadScale: number;
  /** Multiplies the time to bring the replica up and to raise a fitted optic (above 1 is slower). */
  handlingScale: number;
}

/** Built-in numbers; stats.md's Barrels table is what the game uses. First guesses for the owner's playtest. */
export const BARRELS: Readonly<Record<BarrelId, BarrelConfig>> = overlay<BarrelConfig>(
  {
    // A tight bore seals the BB better: it groups tighter and pushes a little harder. A quality part with no downside
    // (owner, 2026-10-04: "a higher quality barrel could give better performance").
    tightBore: { label: 'Tight-Bore Barrel', blurb: 'A precision inner barrel: tighter groups and a little more energy.', energy: 0.03, spreadScale: 0.85, handlingScale: 1 },
    // A longer barrel gives the BB more push, paid for with a front-heavy replica.
    long: { label: 'Long Barrel', blurb: 'More energy for a flatter, longer flight, but front-heavy: slower to bring up and to aim.', energy: 0.08, spreadScale: 1, handlingScale: 1.15 },
  },
  GAME_STATS.barrels,
) as Record<BarrelId, BarrelConfig>;

export type MuzzleId = 'silencer';

/**
 * A muzzle device (M29b): screwed onto a replica tagged `muzzle-thread` in pool.md (both replicas). A silencer makes a
 * shot quieter and harder to place, at a cost in energy and handling. Later: a tracer unit (v0.3).
 */
export interface MuzzleConfig {
  label: string;
  blurb: string;
  /** Muzzle energy added, as a share (negative: lost). */
  energy: number;
  /** Multiplies the time to bring the replica up and to raise a fitted optic. */
  handlingScale: number;
  /**
   * Multiplies how far a shot is heard: by bots (BOT_BEHAVIOUR.hearingDistance), on the minimap and in the sound cues.
   */
  heardScale: number;
  /** Its shots sound muffled and quieter (AUDIO.suppressed). */
  muffled: boolean;
}

/** Built-in numbers; stats.md's Muzzle parts table is what the game uses. First guesses for the owner's playtest. */
export const MUZZLES: Readonly<Record<MuzzleId, MuzzleConfig>> = overlay<MuzzleConfig>(
  {
    silencer: {
      label: 'Silencer',
      blurb: 'Quieter shots: bots hear them from half as far, and they show on a minimap only close by. A little less energy, slower to bring up.',
      energy: -0.05,
      handlingScale: 1.1,
      heardScale: 0.5,
      muffled: true,
    },
  },
  GAME_STATS.muzzles,
) as Record<MuzzleId, MuzzleConfig>;

/**
 * Multipliers a part's rarity tier brings (M26b, pool/kit.ts), on top of what the parts themselves do: below 1 is
 * quicker or steadier.
 */
export interface PartTune {
  raiseScale: number;
  shakeScale: number;
  drawScale: number;
  reloadScale: number;
}

export const NO_TUNE: PartTune = { raiseScale: 1, shakeScale: 1, drawScale: 1, reloadScale: 1 };

/** The parts fitted to one replica. */
export interface ReplicaParts {
  grip: GripId;
  magazine: MagazineId;
  /** A laser on its rail (M26b; config/lasers.ts): shown on the model. Its tighter spread is in the player's replica. */
  laser?: LaserId | null;
  /**
   * A swapped barrel and a muzzle device (M29b): their handling here, their energy and spread in the carried replica
   * (pool/kit.ts). Null: as it comes.
   */
  barrel?: BarrelId | null;
  muzzle?: MuzzleId | null;
  /** What the parts' rarity tiers add (M26b); none for bots. */
  tune?: PartTune;
}

/** How a replica comes: no grip, its first (standard) magazine. Bots always carry this. */
export function factoryParts(r: ReplicaConfig): ReplicaParts {
  return { grip: 'none', magazine: r.magazines[0]! };
}

/**
 * `parts` with anything unknown replaced by the factory part. What fits which replica is the asset pool's call (pool.md
 * tags, M26b): the Loadout only offers parts that fit.
 */
export function partsFor(r: ReplicaConfig, parts: Partial<ReplicaParts>): ReplicaParts {
  const factory = factoryParts(r);
  return {
    grip: parts.grip && parts.grip in GRIPS ? parts.grip : factory.grip,
    magazine: parts.magazine && parts.magazine in MAGAZINES ? parts.magazine : factory.magazine,
    laser: parts.laser ?? null,
    barrel: parts.barrel && parts.barrel in BARRELS ? parts.barrel : null,
    muzzle: parts.muzzle && parts.muzzle in MUZZLES ? parts.muzzle : null,
    tune: parts.tune ?? NO_TUNE,
  };
}

/** What a replica's parts make of it: the numbers the armament, HUD and viewmodel read instead of the replica's own. */
export interface Handling {
  magSize: number;
  /** Magazines carried, the loaded one included. */
  mags: number;
  reloadTime: number;
  drawTime: number;
  /** Multiplies AIMING.raiseTime (with the optic's own). */
  raiseScale: number;
  /** Multiplies how long a sprint's or landing's shake carries into the aim. */
  shakeScale: number;
  /** Its magazines rattle as you move (MagazineConfig.rattles). */
  rattles: boolean;
  /** Multiplies how far its shots are heard (a silencer, M29b; 1 as it comes). */
  heardScale: number;
  /** Its shots sound muffled (a silencer, M29b). */
  muffled: boolean;
}

export function handlingOf(r: ReplicaConfig, parts: ReplicaParts): Handling {
  const grip = GRIPS[parts.grip];
  const mag = MAGAZINES[parts.magazine];
  const tune = parts.tune ?? NO_TUNE;
  const muzzle = parts.muzzle ? MUZZLES[parts.muzzle] : undefined;
  // A front-heavy barrel or muzzle device is slower to bring up and to raise to your eye, like a heavier grip.
  const front = (parts.barrel ? BARRELS[parts.barrel].handlingScale : 1) * (muzzle?.handlingScale ?? 1);
  return {
    magSize: Math.max(1, Math.round(r.magSize * mag.capacity)),
    mags: Math.max(1, r.mags + mag.carried),
    reloadTime: r.reloadTime * mag.reloadScale * tune.reloadScale,
    drawTime: r.drawTime * mag.drawScale * grip.handlingScale * front * tune.drawScale,
    raiseScale: grip.handlingScale * front * tune.raiseScale,
    shakeScale: grip.shakeScale * tune.shakeScale,
    rattles: mag.rattles,
    heardScale: muzzle?.heardScale ?? 1,
    muffled: muzzle?.muffled ?? false,
  };
}
