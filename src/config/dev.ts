import type { LightingPresetId } from './render';

/**
 * Dev settings (M24; owner, 2026-10-04): a hidden Settings tab, shown by ticking "Dev settings" under the tabs. Each is a
 * plain saved setting (`dev.<id>`, settings/dev.ts), and they apply only while the tab is shown: unticking the box turns
 * them all off without forgetting them. Adding one: a field in DevSettings and DEV_DEFAULTS, an entry in DEV_ENTRIES
 * (the tab builds its rows from it), and whatever reads it (Game.applyDev).
 */
export interface DevSettings {
  /**
   * Content tagged dev (M35, config/content.ts): maps, modes, difficulties and gear still being built are offered,
   * looking like the rest. A match that uses any of it stays out of the records and pays no FC (that is decided by what the
   * match uses, not by the switch, so it isn't a `cheat`).
   */
  devContent: boolean;
  /** Turns the Armory off (M26d): gone from every menu (M83), and matches pay no Field Credits. */
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
  /** Armory Shots cost nothing (M90): the cases can be tried without earning the Field Credits. Changes no match. */
  freeShots: boolean;
  /**
   * The light every map plays under (M90): its own pick ('map', the Match screen's Day or Night where it offers both),
   * or Day or Night on any map (config/render.ts LIGHTING_PRESETS: any map can take any preset). From the next match.
   */
  timeOfDay: 'map' | LightingPresetId;
  /** Bots never pull the trigger (M90): walk a map, or watch them move, without being shot. */
  botsHoldFire: boolean;
  /** Watch any bot while you are still in play (M90): you stand where you are and the fire key moves to the next. */
  spectateBots: boolean;
  /** A small label over each bot saying what its brain is doing (M90): fighting, holding, searching … Presentation only. */
  botIntent: boolean;
}

export const DEV_DEFAULTS: Readonly<DevSettings> = {
  devContent: false,
  disableArmory: false,
  unlockAllGear: false,
  showDebug: false,
  showBbPaths: false,
  bottomlessMags: false,
  ghost: false,
  gameSpeed: 1,
  freeShots: false,
  timeOfDay: 'map',
  botsHoldFire: false,
  spectateBots: false,
  botIntent: false,
};

type KeysOf<V> = { [K in keyof DevSettings]: DevSettings[K] extends V ? K : never }[keyof DevSettings];

/**
 * One row on the Dev tab. `cheat`: while it's on (off its default), a match doesn't go into the records. A range shows
 * its value with `format` (a percentage without one).
 */
export type DevEntry =
  | { kind: 'switch'; id: KeysOf<boolean>; label: string; help: string; cheat: boolean }
  | { kind: 'choice'; id: KeysOf<string>; label: string; help: string; cheat: boolean; choices: readonly { id: string; label: string; blurb: string }[] }
  | { kind: 'range'; id: KeysOf<number>; label: string; help: string; cheat: boolean; min: number; max: number; step: number; format?: (v: number) => string };

/** The Dev tab's rows, top to bottom. */
export const DEV_ENTRIES: readonly DevEntry[] = [
  {
    kind: 'switch',
    id: 'devContent',
    label: 'Dev content',
    help: "Shows maps, modes, difficulties and gear still being built. Matches that use any of it don't go into your records or pay Field Credits.",
    cheat: false,
  },
  { kind: 'switch', id: 'disableArmory', label: 'Disable Armory', help: 'Turns off every Armory mechanic and takes the Armory out of the menus, Field Credits and Tokens too.', cheat: false },
  { kind: 'switch', id: 'unlockAllGear', label: 'Unlock all gear', help: 'Every replica and part in the pool, at every rarity it comes in, is yours to equip. Your own collection stays as it is.', cheat: true },
  { kind: 'switch', id: 'showDebug', label: 'Debug info', help: 'Frame rate, position and other numbers in the top-left corner.', cheat: false },
  { kind: 'switch', id: 'showBbPaths', label: 'BB paths', help: 'Draws the flight of every BB, to watch hop-up lift it and drop take over.', cheat: false },
  { kind: 'range', id: 'gameSpeed', label: 'Game speed', help: 'Below 100% everything slows down, BBs too; above it, everything speeds up.', cheat: true, min: 0.25, max: 2, step: 0.25 },
  { kind: 'switch', id: 'bottomlessMags', label: 'Bottomless magazines', help: 'Your magazines never run dry.', cheat: true },
  { kind: 'switch', id: 'ghost', label: 'Ghost', help: 'BBs pass straight through you. The bots still shoot at you.', cheat: true },
  { kind: 'switch', id: 'botsHoldFire', label: 'Bots hold fire', help: 'No bot pulls its trigger: walk the map or watch them move without being shot.', cheat: true },
  {
    kind: 'switch',
    id: 'spectateBots',
    label: 'Spectate any bot',
    help: 'In a match your view follows a bot while you stand still; your fire key moves to the next bot, on either team.',
    cheat: true,
  },
  { kind: 'switch', id: 'botIntent', label: 'Bot intentions', help: 'A small label over each bot in play says what it is doing: advancing, holding, fighting, searching …', cheat: true },
  {
    kind: 'choice',
    id: 'timeOfDay',
    label: 'Time of day',
    help: "The light every map plays under, from the next match: its own (the Match screen's Day or Night), or Day or Night on any map.",
    cheat: true,
    choices: [
      { id: 'map', label: "Map's own", blurb: '' },
      { id: 'day', label: 'Day', blurb: '' },
      { id: 'night', label: 'Night', blurb: '' },
    ],
  },
  { kind: 'switch', id: 'freeShots', label: 'Free case openings', help: 'Armory Shots cost no Tokens or Field Credits.', cheat: false },
];

/**
 * The Dev tab's buttons (M90): each does something once, nothing saved. `cheat`: a match it acts on stays out of the
 * records (End the round now marks the match itself). `confirm`: asked first.
 */
export type DevActionId = 'giveFc' | 'giveTokens' | 'endRound' | 'resetSave';
export interface DevAction {
  id: DevActionId;
  label: string;
  help: string;
  button: string;
  confirm?: { title: string; question: string; yes: string };
}

/** What the gift buttons give each press (M90). */
export const DEV_GIFTS = { fc: 1000, tokens: 10 } as const;

export const DEV_ACTIONS: readonly DevAction[] = [
  { id: 'giveFc', label: 'Field Credits', help: `Adds ${DEV_GIFTS.fc.toLocaleString('en-GB')} FC to your wallet, for the Armory.`, button: `+${DEV_GIFTS.fc.toLocaleString('en-GB')} FC` },
  { id: 'giveTokens', label: 'Tokens', help: `Adds ${DEV_GIFTS.tokens} Tokens to your wallet, for the Armory's Shots.`, button: `+${DEV_GIFTS.tokens} Tokens` },
  {
    id: 'endRound',
    label: 'End the round now',
    help: "Runs the round's clock out, so it ends as on time. Open it from the pause menu in a match, then Resume. That match stays out of your records.",
    button: 'End round',
  },
  {
    id: 'resetSave',
    label: 'Reset the save',
    help: 'Deletes the save and starts the game as for a new player. Undo on the Save group brings it back.',
    button: 'Reset save',
    confirm: { title: 'Reset the save?', question: 'Your settings, key bindings, Loadout, Armory collection and records go, and the game reloads fresh.', yes: 'Reset save' },
  },
];

/** What a Dev button says for a moment after it is pressed (M90). */
export const DEV_ACTION_TEXT = { done: 'Done', noRound: 'No round under way', noteTime: 1600 } as const;

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

/** True when a setting that changes play (a `cheat` entry) is off its default: the match won't go into the records. */
export function devCheating(d: DevSettings): boolean {
  return DEV_ENTRIES.some((e) => e.cheat && d[e.id] !== DEV_DEFAULTS[e.id]);
}

/** Bot intentions' labels (M90): metres above the bot's eyes the label's foot sits, over the teammate tag's place. */
export const DEV_BOT_INTENT = { aboveEyes: 0.55 } as const;
