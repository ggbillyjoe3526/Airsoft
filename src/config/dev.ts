import type { RetroLook } from './render';

/**
 * Dev settings (M24; owner, 2026-10-04): a hidden Settings tab, shown by ticking "Dev settings" under the tabs. Each is a
 * plain saved setting (`dev.<id>`, settings/dev.ts), and they apply only while the tab is shown: unticking the box turns
 * them all off without forgetting them. Adding one: a field in DevSettings and DEV_DEFAULTS, an entry in DEV_ENTRIES
 * (the tab builds its rows from it), and whatever reads it (Game.applyDev).
 */
export interface DevSettings {
  /** Turns the Armory off (M26d): its button greyed out on New game, and matches pay no Field Credits. */
  disableArmory: boolean;
  /** Every asset in pool.md owned at every tier, for the Loadout (M26d); the collection itself is left as it is. */
  unlockAllGear: boolean;
  /** The debug panel (FPS, frame time, position …) on from the start; ` or F3 still toggle it. */
  showDebug: boolean;
  /** The BB flight paths drawn in the world, as the ] key toggles them. */
  showBbPaths: boolean;
  /** Shots never use up your magazine. */
  bottomlessMags: boolean;
  /** BBs pass straight through you. */
  ghost: boolean;
  /** The simulation's speed: 1 is normal, below it slow motion. */
  gameSpeed: number;
  /** The retro pixel filter (M42, render/retroFilter.ts): chunky pixels and a small dithered palette. */
  retroPixels: boolean;
  /** Its pixel size: CSS pixels per retro pixel. */
  retroPixelSize: number;
  /** Its shades of each of red, green and blue. */
  retroColours: number;
}

export const DEV_DEFAULTS: Readonly<DevSettings> = {
  disableArmory: false,
  unlockAllGear: false,
  showDebug: false,
  showBbPaths: false,
  bottomlessMags: false,
  ghost: false,
  gameSpeed: 1,
  retroPixels: false,
  retroPixelSize: 4,
  retroColours: 6,
};

type KeysOf<V> = { [K in keyof DevSettings]: DevSettings[K] extends V ? K : never }[keyof DevSettings];

/**
 * One row on the Dev tab. `cheat`: while it's on (off its default), a match doesn't go into the records. A range shows
 * its value with `format` (a percentage without one).
 */
export type DevEntry =
  | { kind: 'switch'; id: KeysOf<boolean>; label: string; help: string; cheat: boolean }
  | { kind: 'range'; id: KeysOf<number>; label: string; help: string; cheat: boolean; min: number; max: number; step: number; format?: (v: number) => string };

/** The Dev tab's rows, top to bottom. */
export const DEV_ENTRIES: readonly DevEntry[] = [
  { kind: 'switch', id: 'disableArmory', label: 'Disable Armory', help: 'Turns off every Armory mechanic and greys out the Armory in the menu.', cheat: false },
  { kind: 'switch', id: 'unlockAllGear', label: 'Unlock all gear', help: 'Every replica and part in the pool, at every rarity, is yours to equip. Your own collection stays as it is.', cheat: true },
  { kind: 'switch', id: 'showDebug', label: 'Debug info', help: 'Frame rate, position and other numbers in the top-left corner.', cheat: false },
  { kind: 'switch', id: 'showBbPaths', label: 'BB paths', help: 'Draws the flight of every BB, to watch hop-up lift it and drop take over.', cheat: false },
  { kind: 'switch', id: 'retroPixels', label: 'Retro pixels', help: 'Chunky pixels and a small dithered palette, like a 1990s shooter. The HUD and menus stay sharp.', cheat: false },
  { kind: 'range', id: 'retroPixelSize', label: 'Pixel size', help: 'How big each retro pixel is, in screen pixels.', cheat: false, min: 2, max: 8, step: 1, format: (v) => `${v} px` },
  { kind: 'range', id: 'retroColours', label: 'Colours', help: 'How many colours the retro palette has: fewer is cruder.', cheat: false, min: 3, max: 8, step: 1, format: (v) => String(v ** 3) },
  { kind: 'range', id: 'gameSpeed', label: 'Game speed', help: 'Below 100% everything slows down, BBs too; above it, everything speeds up.', cheat: true, min: 0.25, max: 2, step: 0.25 },
  { kind: 'switch', id: 'bottomlessMags', label: 'Bottomless magazines', help: 'Your magazines never run dry.', cheat: true },
  { kind: 'switch', id: 'ghost', label: 'Ghost', help: 'BBs pass straight through you. The bots still shoot at you.', cheat: true },
];

/** The two Dev tab switches the game shows as On / Off. */
export const DEV_SWITCH_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: '' },
  { id: 'on', label: 'On', blurb: '' },
];

/** What applies: the picked values while the Dev tab is shown (`enabled`), else every default. Always a copy. */
export function activeDev(enabled: boolean, picked: DevSettings): DevSettings {
  return { ...(enabled ? picked : DEV_DEFAULTS) };
}

/** The Dev tab's line over its rows: what it's for, and which settings keep a match out of the records. */
export function devIntro(): string {
  const cheats = DEV_ENTRIES.filter((e) => e.cheat).map((e) => e.label);
  return `For trying things out. With ${cheats.slice(0, -1).join(', ')} or ${cheats.at(-1)} changed, matches don't go into your records.`;
}

/** The retro pixel filter's look while it is on (M42), else null. `scripted`: the perf harness, which always runs without it. */
export function retroLookOf(d: DevSettings, scripted: boolean): RetroLook | null {
  return d.retroPixels && !scripted ? { pixelSize: d.retroPixelSize, levels: d.retroColours } : null;
}

/** True when a setting that changes play (a `cheat` entry) is off its default: the match won't go into the records. */
export function devCheating(d: DevSettings): boolean {
  return DEV_ENTRIES.some((e) => e.cheat && d[e.id] !== DEV_DEFAULTS[e.id]);
}
