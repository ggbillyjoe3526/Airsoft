/**
 * Optics: accessories fitted to a replica, never part of its model (owner, 2026-10-03). In v0.1 there is one,
 * the red dot, fitted to the rifle from the start screen before a match. Aiming down sights (hold the right
 * mouse button) works only with an optic fitted. More optics and full customisation come with loadouts (v0.3)
 * and customisation (v0.5).
 */
export type OpticId = 'redDot';

export interface OpticConfig {
  /** Shown on the start screen. */
  name: string;
  /** How much aiming through it narrows the view: the main camera's zoom (1 = none). A red dot has no magnifier. */
  zoom: number;
}

export const OPTICS: Readonly<Record<OpticId, OpticConfig>> = {
  // "Narrows the view slightly" (roadmap): about 100° → 84° across a 16:9 screen. A first guess to tune in play.
  redDot: { name: 'Red dot', zoom: 1.25 },
};

/** What the start screen offers for the rifle's optic slot: nothing (iron sights) or an optic. */
export type OpticChoice = 'none' | OpticId;

export const OPTIC_CHOICES: readonly { id: OpticChoice; label: string; blurb: string }[] = [
  { id: 'none', label: 'Iron sights', blurb: 'No optic: fire from the hip with the crosshair. Aiming down sights needs an optic.' },
  { id: 'redDot', label: 'Red dot', blurb: 'A red dot on the rifle: hold the right mouse button to aim through it (walking pace).' },
];

/** Off by default (roadmap M12b): the bare rifle, as the owner played it so far. */
export const DEFAULT_OPTIC: OpticChoice = 'none';

/** The optic a choice fits, or null for none. */
export function opticOf(choice: OpticChoice): OpticId | null {
  return choice === 'none' ? null : choice;
}

export const AIMING = {
  /** Seconds to raise the sight to your eye (and to lower it): the view zoom, the replica and the HUD follow it. */
  raiseTime: 0.15,
  /**
   * Mouse sensitivity while aiming, as a multiple of the normal one (the player's "Aiming sensitivity"). The
   * default matches the zoom, so the world moves across the screen at the same speed as from the hip.
   */
  defaultSensitivity: 0.8,
  minSensitivity: 0.2,
  maxSensitivity: 2,
  sensitivityStep: 0.05,
  /** The crosshair gives way to the red dot once the sight is this far up (0..1): by then the glass is in front of it. */
  reticleFrom: 0.9,
} as const;
