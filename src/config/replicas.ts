import type { MagazineId } from './attachments';
import { GAME_STATS } from './gameStats';
import { DEFAULT_SITE_LIMITS, type StatsFile } from './statsFile';

/**
 * How a trigger pull fires: one BB per pull (semi; "single" on a rifle's selector), a short burst per pull
 * (TRIGGER.burstShots), or for as long as the trigger is held (auto).
 */
export type FireMode = 'semi' | 'burst' | 'auto';

/**
 * What drives a replica: a battery and motor (an AEG) or gas (green gas for now). Spring and HPA may come later.
 * It also picks the replica's shot sound (config/sounds.ts ShotProfile).
 */
export type PowerSource = 'electric' | 'gas';

/** Stats for one replica. All weapon behaviour is data; nothing about specific replicas is hardcoded. */
export interface ReplicaConfig {
  id: string;
  /** Generic, non-brand name shown in the HUD. */
  name: string;
  /** What drives it: a battery and motor (AEG) or gas. Shown on the loadout screen. */
  power: PowerSource;
  /**
   * The modes its fire selector offers, in the order the selector key steps through them. Like the real type
   * the replica is modelled on (owner, 2026-10-03): a striker pistol is semi only, a rifle or SMG may offer more.
   */
  fireModes: readonly FireMode[];
  /** The mode it starts each match in (one of fireModes); the selector keeps its setting from round to round. */
  defaultFireMode: FireMode;
  /** Shots per second while the trigger is held (auto, and within a burst) or the fastest you can click (semi). */
  fireRate: number;
  magSize: number;
  /** Magazines carried per round, the loaded one included; each holds magSize BBs at the start. */
  mags: number;
  reloadTime: number;
  /** Time to bring this replica up after switching to it. */
  drawTime: number;
  /**
   * Muzzle energy (joules) with its factory BB weight, the way sites rate and chrono replicas. With the BB weight it
   * sets the muzzle velocity (see muzzleVelocity; other weights shift the energy a little, BB_WEIGHT.energyExponent).
   */
  muzzleEnergy: number;
  /**
   * The most muzzle energy (J) the site's chrono lets it shoot with (stats.md's Site limits, by its class, M29): what
   * the player's items add stops here. Bots carry the replica as it comes, below it.
   */
  energyLimit: number;
  /**
   * The BB weight it comes set up for (grams, within BB_WEIGHT's range): the player's starting choice on the Loadout
   * screen, and what bots always shoot. Changes speed, drag and hop-up lift (config/ballistics.ts).
   */
  bbWeight: number;
  /**
   * Hop-up strength with the dial turned all the way up: Magnus lift per unit speed at full spin for a
   * BALLISTICS.referenceMass BB (1/s). The backspin the dial sets lifts the BB, so it flies flat for longer.
   */
  hopUpMax: number;
  /**
   * Where its hop-up dial is set out of the box (0..1 of hopUpMax): the player's starting setting, which they
   * can change before a match, and the setting bots always use.
   */
  hopUpDial: number;
  /** Random spread, standard deviation of the shot direction (degrees). */
  spreadDeg: number;
  /** Upward view kick per shot (degrees). Light: these are toys, not firearms. */
  recoilDeg: number;
  /**
   * The magazines its model shows (config/attachments.ts), the one it comes with first. Which rails and magazines a
   * replica takes is the asset pool's call (pool.md tags, M26a); bots carry the factory parts.
   */
  magazines: readonly MagazineId[];
  /** How it looks and sounds (presentation only; the simulation ignores this). */
  look: ReplicaLook;
}

export type ReplicaModelKind = 'rifle' | 'pistol';

export interface ReplicaLook {
  model: ReplicaModelKind;
  /** Fitted with a suppressor: its shots sound quieter and duller (config/audio.ts suppressed). */
  suppressed: boolean;
  /**
   * Where it sits in the first-person view (camera space, metres) and its inward cant (radians, + turns the muzzle
   * left). A barrel pointing straight ahead (0) runs on screen from the muzzle to the crosshair, the line your BBs
   * are drawn along, so the rifle keeps 0. The pistol keeps a slight lean (owner playtests, 2026-10-03: 0.36 looked
   * aimed off to the left, 0 "slightly too straight"); `render/tracerLine.test.ts` caps how far it may turn.
   */
  hold: { position: readonly [number, number, number]; yaw: number };
  /**
   * Where it sits while aiming down a fitted optic (camera space, metres, no cant): the optic's axis on the view's
   * centre line, so the red dot is where your BBs go. A replica without one aims through an optic from its hold.
   */
  aimHold?: readonly [number, number, number];
}

/**
 * `base` (the built-in numbers) with the performance numbers stats.md gives its key (M29), and the energy limit of the
 * class it names. The built-in numbers are only used where the file can't be read.
 */
export function withStats(base: Omit<ReplicaConfig, 'energyLimit'> & { siteClass: string }, stats: StatsFile = GAME_STATS): ReplicaConfig {
  const { siteClass: builtInClass, ...rest } = base;
  const { siteClass = builtInClass, ...numbers } = stats.replicas[base.id] ?? {};
  const energyLimit = stats.siteLimits[siteClass] ?? DEFAULT_SITE_LIMITS[siteClass] ?? Number.POSITIVE_INFINITY;
  return { ...rest, ...numbers, energyLimit };
}

/**
 * Electric rifle (AR pattern): single, burst and full auto, medium range, medium magazine. The numbers below are the
 * built-in ones; stats.md's are what the game uses (withStats).
 */
export const AEG: ReplicaConfig = withStats({
  id: 'aeg',
  name: 'AEG Rifle',
  power: 'electric',
  fireModes: ['semi', 'burst', 'auto'],
  defaultFireMode: 'auto',
  fireRate: 13,
  magSize: 60,
  mags: 4,
  // About 15% quicker than the first 2.1 s (owner's v0.1-alpha.3 playtest: "a tiny bit too slow").
  reloadTime: 1.8,
  drawTime: 0.45,
  // ~1 J with 0.25 g BBs, like a typical site-legal AEG: 88 m/s.
  muzzleEnergy: 0.97,
  bbWeight: 0.25,
  // Out of the box the hop is set for Depot's longest sightlines: up to ~10 cm above the aim line around 20 m and
  // back on it by ~34 m (docs/DECISIONS.md). Turned right up, it rises well over half a metre and floats.
  hopUpMax: 0.3,
  hopUpDial: 0.65,
  spreadDeg: 0.45,
  recoilDeg: 0.18,
  magazines: ['standard', 'hiCap', 'lowCap'],
  siteClass: 'rifle',
  look: {
    model: 'rifle',
    suppressed: false,
    hold: { position: [0.16, -0.17, -0.48], yaw: 0 },
    // The optic's axis is RIFLE_OPTIC.axisUp above the model's origin (render/replicaModels.ts); its back end about
    // 0.2 m in front of the eye, so the tube frames the view without filling it.
    aimHold: [0, -0.126, -0.205],
  },
});

/** Gas pistol: semi auto, shorter range, quick to handle, small magazine. Built-in numbers; stats.md's win (withStats). */
export const GAS_PISTOL: ReplicaConfig = withStats({
  id: 'pistol',
  name: 'Gas Pistol',
  power: 'gas',
  fireModes: ['semi'],
  defaultFireMode: 'semi',
  fireRate: 7,
  magSize: 18,
  mags: 4,
  reloadTime: 1.2,
  drawTime: 0.3,
  // A gas pistol on light 0.20 g BBs: 72 m/s, a close-range sidearm.
  muzzleEnergy: 0.52,
  bbWeight: 0.2,
  // Set out of the box for sidearm range: on target to about 25 m, then dropping clearly (docs/DECISIONS.md).
  hopUpMax: 0.3,
  hopUpDial: 0.55,
  spreadDeg: 0.8,
  recoilDeg: 0.5,
  magazines: ['standard', 'extended'],
  siteClass: 'pistol',
  look: { model: 'pistol', suppressed: false, hold: { position: [0.09, -0.095, -0.45], yaw: 0.1 } },
});

/** The hop-up dial the player turns before a match (0..1 of a replica's hopUpMax), shown as a percentage. */
export const HOP_UP = {
  minDial: 0,
  maxDial: 1,
  dialStep: 0.05,
  /**
   * For the Loadout screen's readout: a BB counts as on target while it stays within this far (m) above or below
   * the aim line, about half a torso. "On target to N m" is where it first leaves that band.
   */
  onTargetBand: 0.15,
  /** How far (m) the readout follows a BB; a setting that is still on target there reads "N m+". */
  readoutRange: 60,
} as const;

/** The hop-up lift (ReplicaConfig.hopUpMax units) the replica gives with its dial at `dial`, clamped to the dial's range. */
export function hopUpLift(r: ReplicaConfig, dial: number): number {
  return r.hopUpMax * Math.min(HOP_UP.maxDial, Math.max(HOP_UP.minDial, dial));
}

/** BB weights (M17a): free and unlimited, never pooled (owner, 2026-10-04), picked on a slider in 0.01 g steps. */
export const BB_WEIGHT = {
  /**
   * Grams. 0.30 g is back on the slider (M26b): it only matched 0.28 g's reach on a factory replica while arriving
   * later, but a stronger power source (red or black gas, a better battery) can lift it.
   */
  min: 0.2,
  max: 0.3,
  step: 0.01,
  /**
   * A replica's muzzle energy grows a little with the BB's weight: a heavier BB stays in the barrel longer and takes
   * more of the push, as at a chrono (a 1 J AEG gives ~1.03 J on 0.25 g against 0.20 g). Energy scales as
   * (weight / factory weight) to this power; a first guess from typical chrono readings. Replaces the placeholder
   * "same energy whatever the weight" (DECISIONS 2026-10-02).
   */
  energyExponent: 0.15,
  /**
   * The BB weight readout says how long the BB takes to fly this far (m), at its best hop-up: Depot's mid-range, where a
   * lighter BB's head start still shows.
   */
  timeReadoutDistance: 20,
} as const;

/** `grams` as a BB weight the slider offers (in range, on its 0.01 g steps), or undefined. */
export function validBbWeight(grams: number): number | undefined {
  if (!Number.isFinite(grams) || grams < BB_WEIGHT.min - 1e-9 || grams > BB_WEIGHT.max + 1e-9) return undefined;
  const steps = Math.round((grams - BB_WEIGHT.min) / BB_WEIGHT.step);
  const snapped = Math.round((BB_WEIGHT.min + steps * BB_WEIGHT.step) * 100) / 100;
  return Math.abs(snapped - grams) < 1e-6 ? snapped : undefined;
}

/** Mass of a BB (kg) of `grams` (the replica's factory weight by default; the config gives grams). */
export function bbMass(r: ReplicaConfig, grams = r.bbWeight): number {
  return grams / 1000;
}

/** Muzzle energy (J) of a replica shooting `grams` BBs: its rated energy at its factory weight, shifted by BB_WEIGHT.energyExponent. */
export function muzzleEnergy(r: ReplicaConfig, grams = r.bbWeight): number {
  return r.muzzleEnergy * (grams / r.bbWeight) ** BB_WEIGHT.energyExponent;
}

/** Muzzle velocity (m/s) of a replica shooting `grams` BBs (its factory weight by default): E = ½·m·v². */
export function muzzleVelocity(r: ReplicaConfig, grams = r.bbWeight): number {
  return Math.sqrt((2 * muzzleEnergy(r, grams)) / bbMass(r, grams));
}

/** The default loadout, primary then secondary: what bots and tests carry, and a new player's picks. */
export const LOADOUT: readonly ReplicaConfig[] = [AEG, GAS_PISTOL];

export const RECOIL = {
  /** Recoil kick recovers exponentially with this time constant (s). */
  recoveryTime: 0.12,
  /** Kick never accumulates past this (degrees). */
  maxDeg: 2,
  /**
   * A shot's pitch, kick and spread included, stays within this of straight up or down (degrees), so a BB fired at the
   * top of the look range never goes past vertical and backwards.
   */
  maxShotPitchDeg: 89.9,
} as const;

export const TRIGGER = {
  /**
   * A semi-auto trigger press that arrives while the replica isn't ready (cooldown, draw) still fires
   * if it becomes ready within this many seconds, so fast clicking isn't silently eaten.
   */
  pressBuffer: 0.15,
  /** BBs a burst-mode trigger pull fires (at the replica's fireRate), unless the magazine runs dry first. */
  burstShots: 3,
} as const;

/** How the HUD names each fire mode. */
export const FIRE_MODE_LABELS: Readonly<Record<FireMode, string>> = { semi: 'Semi', burst: 'Burst', auto: 'Auto' };
