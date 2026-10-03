/**
 * How a trigger pull fires: one BB per pull (semi; "single" on a rifle's selector), a short burst per pull
 * (TRIGGER.burstShots), or for as long as the trigger is held (auto).
 */
export type FireMode = 'semi' | 'burst' | 'auto';

/** Stats for one replica. All weapon behaviour is data; nothing about specific replicas is hardcoded. */
export interface ReplicaConfig {
  id: string;
  /** Generic, non-brand name shown in the HUD. */
  name: string;
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
  /** Hop-up strength: Magnus lift per unit speed at full spin for a BALLISTICS.referenceMass BB (1/s). */
  hopUp: number;
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
  /** Where it sits in the first-person view (camera space, metres) and its inward cant (radians). */
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
  fireModes: ['semi', 'burst', 'auto'],
  defaultFireMode: 'auto',
  fireRate: 13,
  magSize: 60,
  mags: 4,
  // About 15% quicker than the first 2.1 s (owner's v0.1-alpha.3 playtest: "a tiny bit too slow").
  reloadTime: 1.8,
  drawTime: 0.45,
  // ~1 J with 0.25 g BBs, like a typical site-legal AEG: 88 m/s. Flat to ~20 m, dropping by 35 m.
  muzzleEnergy: 0.97,
  bbWeight: 0.25,
  hopUp: 0.14,
  spreadDeg: 0.45,
  recoilDeg: 0.18,
  opticMount: true,
  look: {
    model: 'rifle',
    shotSound: 'rifle',
    suppressed: false,
    hold: { position: [0.16, -0.17, -0.48], yaw: 0.14 },
    // The optic's axis is RIFLE_OPTIC.axisUp above the model's origin (render/replicaModels.ts); its back end about
    // 0.2 m in front of the eye, so the tube frames the view without filling it.
    aimHold: [0, -0.126, -0.205],
  },
};

/** Gas pistol: semi auto, shorter range, quick to handle, small magazine. */
export const GAS_PISTOL: ReplicaConfig = {
  id: 'pistol',
  name: 'Gas pistol',
  fireModes: ['semi'],
  defaultFireMode: 'semi',
  fireRate: 7,
  magSize: 18,
  mags: 4,
  reloadTime: 1.2,
  drawTime: 0.3,
  // A gas pistol on light 0.20 g BBs: 72 m/s, a close-range sidearm (dropping clearly past 20 m).
  muzzleEnergy: 0.52,
  bbWeight: 0.2,
  hopUp: 0.13,
  spreadDeg: 0.8,
  recoilDeg: 0.5,
  opticMount: false,
  look: { model: 'pistol', shotSound: 'pistol', suppressed: false, hold: { position: [0.12, -0.1, -0.55], yaw: 0.36 } },
};

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
