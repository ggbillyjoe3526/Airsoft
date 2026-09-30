/** Stats for one replica. All weapon behaviour is data; nothing about specific replicas is hardcoded. */
export interface ReplicaConfig {
  id: string;
  /** Generic, non-brand name shown in the HUD. */
  name: string;
  fireMode: 'auto' | 'semi';
  /** Shots per second while the trigger is held (auto) or the fastest you can click (semi). */
  fireRate: number;
  magSize: number;
  /** Spare rounds carried besides the loaded magazine. */
  reserve: number;
  reloadTime: number;
  /** Time to bring this replica up after switching to it. */
  drawTime: number;
  /** Muzzle speed (m/s). */
  muzzleVelocity: number;
  /** Hop-up strength: Magnus lift per unit speed at full spin (1/s). */
  hopUp: number;
  /** Random spread, standard deviation of the shot direction (degrees). */
  spreadDeg: number;
  /** Upward view kick per shot (degrees). Light: these are toys, not firearms. */
  recoilDeg: number;
  /** How it looks and sounds (presentation only; the simulation ignores this). */
  look: ReplicaLook;
}

export type ReplicaModelKind = 'rifle' | 'pistol';

export interface ReplicaLook {
  model: ReplicaModelKind;
  /** Sound family played for its shots. */
  shotSound: ReplicaModelKind;
  /** Where it sits in the first-person view (camera space, metres) and its inward cant (radians). */
  hold: { position: readonly [number, number, number]; yaw: number };
}

/** Electric rifle: full auto, medium range, medium magazine. */
export const AEG: ReplicaConfig = {
  id: 'aeg',
  name: 'AEG rifle',
  fireMode: 'auto',
  fireRate: 13,
  magSize: 60,
  reserve: 180,
  reloadTime: 2.1,
  drawTime: 0.45,
  muzzleVelocity: 88,
  hopUp: 0.12,
  spreadDeg: 0.45,
  recoilDeg: 0.18,
  look: { model: 'rifle', shotSound: 'rifle', hold: { position: [0.16, -0.17, -0.48], yaw: 0.14 } },
};

/** Gas pistol: semi auto, shorter range, quick to handle, small magazine. */
export const GAS_PISTOL: ReplicaConfig = {
  id: 'pistol',
  name: 'Gas pistol',
  fireMode: 'semi',
  fireRate: 7,
  magSize: 18,
  reserve: 54,
  reloadTime: 1.4,
  drawTime: 0.3,
  muzzleVelocity: 72,
  hopUp: 0.11,
  spreadDeg: 0.8,
  recoilDeg: 0.5,
  look: { model: 'pistol', shotSound: 'pistol', hold: { position: [0.075, -0.07, -0.36], yaw: 0.12 } },
};

/** Loadout for Phase 1: slot 0 primary, slot 1 sidearm. */
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
} as const;
