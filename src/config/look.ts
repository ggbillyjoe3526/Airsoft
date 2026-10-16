import type { RetroLook } from './render';

/**
 * Settings › Looks (graphics overhaul G1; William, 5 October 2026): who the players are drawn as. How their replicas are
 * coloured is saved here too, though its row left Settings (William, Dev 6 playtest, 2026-10-16: it belongs on the
 * Loadout's colour tab). Presentation only: neither changes a hit, a sight line or a sound.
 */

/** Robots: on, each match mixes humans and robots on both teams; off, every figure is human. */
export const ROBOT_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'on', label: 'Mixed', blurb: 'Each match mixes humans and robots on both teams.' },
  { id: 'off', label: 'Humans only', blurb: 'Every player is human.' },
];
export const DEFAULT_ROBOTS = true;

/** Realistic colours: each replica in one plain colour family (black, wolf grey, ranger green or tan) instead of its scheme. */
export const REALISTIC_COLOUR_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'off', label: 'Bold', blurb: 'Every replica in its two-tone colour scheme.' },
  { id: 'on', label: 'Realistic', blurb: 'Every replica in black, wolf grey, ranger green or tan, never mixed.' },
];
export const DEFAULT_REALISTIC_COLOURS = false;

/** Robots are picked from a different stream of the match seed than the sim's, so the mix never shifts a gameplay roll. */
export const ROBOT_SEED_SALT = 0x5f3759df;

/** The Look settings a match or the range is built with. */
export interface LookSettings {
  /** Robots mixed in with humans on both teams (figures follow it from G7). */
  robots: boolean;
  /** Every replica in its scheme's plain family. */
  realisticColours: boolean;
}

export const DEFAULT_LOOK: LookSettings = { robots: DEFAULT_ROBOTS, realisticColours: DEFAULT_REALISTIC_COLOURS };

/**
 * The Retro look (M42's pixel filter, render/retroFilter.ts): the 3D view in chunky pixels and a small dithered palette,
 * the HUD and menus left sharp. Public on Settings › Look from M96 (owner, 2026-10-06); back on the Dev tab since the
 * Dev 6 playtest (William, 2026-10-16), so like every Dev setting it shows only while the Dev settings box is ticked.
 * It shows at once, in the menus' backdrop of a match and in play. Presentation only.
 */
export const RETRO_LOOK_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: '' },
  { id: 'on', label: 'On', blurb: 'Chunky pixels and a small dithered palette, like a 1990s shooter.' },
];
/** Its two sliders (were the Dev tab's, M42): CSS pixels per retro pixel, and shades of each of red, green and blue. */
export const RETRO_PIXEL_SIZE = { min: 2, max: 8, step: 1, default: 4 } as const;
export const RETRO_COLOURS = { min: 3, max: 8, step: 1, default: 6 } as const;

/** The Retro look as saved: on or off, and its sliders (kept while it is off). */
export interface RetroSettings {
  on: boolean;
  pixelSize: number;
  colours: number;
}

export const DEFAULT_RETRO: Readonly<RetroSettings> = { on: false, pixelSize: RETRO_PIXEL_SIZE.default, colours: RETRO_COLOURS.default };

/** The slider readouts: "4 px", and the palette's size ("216" for 6 shades a channel). */
export const retroPixelText = (v: number): string => `${v} px`;
export const retroColoursText = (v: number): string => String(v ** 3);

/**
 * The retro filter's look while the Retro look is on and the Dev tab shown (`devShown`), else null. `scripted`: the perf
 * harness, which always runs without it.
 */
export function retroLookOf(r: RetroSettings, scripted: boolean, devShown: boolean): RetroLook | null {
  return r.on && devShown && !scripted ? { pixelSize: r.pixelSize, levels: r.colours } : null;
}
