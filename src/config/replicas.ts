/**
 * How a trigger pull fires: one BB per pull (semi; "single" on a rifle's selector), a short burst per pull
 * (TRIGGER.burstShots), or for as long as the trigger is held (auto).
 */
export type FireMode = 'semi' | 'burst' | 'auto';

/** What drives a replica: a battery and motor (an AEG) or gas (green gas for now). Spring and HPA may come later. */
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
  /** The mode it starts each match in (one of fireModes). */
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
   * Muzzle energy (joules), the way sites rate and chrono replicas. With the BB weight it sets the muzzle
   * velocity (see muzzleVelocity).
   */
  muzzleEnergy: number;
  /** BB weight it shoots (grams: 0.20, 0.25 …). Changes speed, drag and hop-up lift (config/ballistics.ts). */
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
  /** Has a rail an optic can be fitted to (config/optics.ts); aiming down sights needs one fitted. */
  opticMount: boolean;
  /** How it looks and sounds (presentation only; the simulation ignores this). */
  look: ReplicaLook;
}

export type ReplicaModelKind = 'rifle' | 'pistol';

export interface ReplicaLook {
  model: ReplicaModelKind;
  /** Sound family played for its shots. */
  shotSound: ReplicaModelKind;
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
   * centre line, so the red dot is where your BBs go. Only replicas with an optic mount have one.
   */
  aimHold?: readonly [number, number, number];
}

/** Electric rifle (AR pattern): single, burst and full auto, medium range, medium magazine. */
export const AEG: ReplicaConfig = {
  id: 'aeg',
  name: 'AEG rifle',
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
  opticMount: true,
  look: {
    model: 'rifle',
    shotSound: 'rifle',
    suppressed: false,
    hold: { position: [0.16, -0.17, -0.48], yaw: 0 },
    // The optic's axis is RIFLE_OPTIC.axisUp above the model's origin (render/replicaModels.ts); its back end about
    // 0.2 m in front of the eye, so the tube frames the view without filling it.
    aimHold: [0, -0.126, -0.205],
  },
};

/** Gas pistol: semi auto, shorter range, quick to handle, small magazine. */
export const GAS_PISTOL: ReplicaConfig = {
  id: 'pistol',
  name: 'Gas pistol',
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
  opticMount: false,
  look: { model: 'pistol', shotSound: 'pistol', suppressed: false, hold: { position: [0.09, -0.095, -0.45], yaw: 0.1 } },
};

/** The hop-up dial the player turns before a match (0..1 of a replica's hopUpMax), shown as a percentage. */
export const HOP_UP = {
  minDial: 0,
  maxDial: 1,
  dialStep: 0.05,
  /**
   * For the start screen's readout: a BB counts as on target while it stays within this far (m) above or below
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

/** Mass of the BBs a replica shoots (kg; the config gives grams). */
export function bbMass(r: ReplicaConfig): number {
  return r.bbWeight / 1000;
}

/** Muzzle velocity (m/s) of a replica: from its energy and BB weight, E = ½·m·v². */
export function muzzleVelocity(r: ReplicaConfig): number {
  return Math.sqrt((2 * r.muzzleEnergy) / bbMass(r));
}

/** The loadout everyone carries (v0.1): slot 0 primary, slot 1 sidearm. */
export const LOADOUT: readonly ReplicaConfig[] = [AEG, GAS_PISTOL];

export const RECOIL = {
  /** Recoil kick recovers exponentially with this time constant (s). */
  recoveryTime: 0.12,
  /** Kick never accumulates past this (degrees). */
  maxDeg: 2,
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
