import { GAME_STATS } from './gameStats';
import { overlay } from './statsFile';

/**
 * Optics: accessories fitted to a replica, never part of its model (owner, 2026-10-03), picked for the rifle on the
 * Loadout screen before a match: the red dot, or a low-power 2× scope (M17b). Aiming down sights (the aim button, right
 * mouse by default, held or toggled) works only with an optic fitted. More optics and full customisation come with bigger loadouts (v0.3)
 * and customisation (v0.5).
 */
export type OpticId = 'redDot' | 'scope2x';

export interface OpticConfig {
  /** Shown on the Loadout screen. */
  name: string;
  /** How much aiming through it narrows the view: the main camera's zoom (1 = none). A red dot has no magnifier. */
  zoom: number;
  /** Multiplies AIMING.raiseTime: a heavier optic is slower to bring to your eye. */
  raiseScale: number;
  /**
   * Looking through it hides the view around it: the HUD darkens everything outside the eyepiece and draws a fine
   * crosshair reticle instead of a dot.
   */
  scope: boolean;
}

/** Built-in numbers; stats.md's Optics table is what the game uses (M29). */
export const OPTICS: Readonly<Record<OpticId, OpticConfig>> = overlay<OpticConfig>({
  // "Narrows the view slightly" (roadmap): about 100° → 84° across a 16:9 screen. A first guess to tune in play.
  redDot: { name: 'Red Dot', zoom: 1.25, raiseScale: 1, scope: false },
  // A closer look down Depot's long lanes (about 100° → 56° across a 16:9 screen), paid for with a slower raise and
  // nothing seen around the eyepiece. First guesses to tune in play.
  scope2x: { name: '2x Scope', zoom: 2, raiseScale: 1.6, scope: true },
}, GAME_STATS.optics) as Record<OpticId, OpticConfig>;

/** One line for each optic choice on the Loadout's Customise screen ('none': iron sights). */
export const OPTIC_BLURBS: Readonly<Record<'none' | OpticId, string>> = {
  none: 'No optic: fire from the hip with the crosshair. Aiming down sights needs an optic.',
  redDot: 'A red dot: press the aim button (right mouse by default) to aim through it (walking pace).',
  scope2x: 'A low-power scope: a closer view down the long lanes, but slower to raise and you see nothing around it.',
};

export const AIMING = {
  /** Seconds to raise the sight to your eye (and to lower it): the view zoom, the replica and the HUD follow it. */
  raiseTime: 0.15,
  /**
   * Mouse sensitivity while aiming, as a multiple of the normal one (the player's "Aiming sensitivity"). The
   * default matches the zoom, so the world moves across the screen at the same speed as from the hip.
   */
  defaultSensitivity: 0.8,
  /**
   * The optic zoom the Aiming sensitivity setting is for (the red dot's). Through a stronger optic the mouse turns
   * slower in proportion, so the world crosses the eyepiece at the same speed whatever is fitted.
   */
  sensitivityZoom: 1.25,
  minSensitivity: 0.2,
  maxSensitivity: 2,
  sensitivityStep: 0.05,
  /** The crosshair gives way to the red dot once the sight is this far up (0..1): by then the glass is in front of it. */
  reticleFrom: 0.9,
} as const;
