import { ADAPTIVE_TEXT } from './adaptiveDifficulty';
import { TONE_MAPPING_CHOICES } from './graphics';
import { type LightingPresetId, TONE_MAPPING, type ToneMappingId } from './render';

/**
 * Dev settings (M24; owner, 2026-10-04): a hidden Settings tab, shown by ticking "Dev settings" under the tabs. Each is a
 * plain saved setting (`dev.<id>`, settings/dev.ts), and they apply only while the tab is shown: unticking the box turns
 * them all off without forgetting them. Adding one: a field in DevSettings and DEV_DEFAULTS, an entry in DEV_ENTRIES
 * (the tab builds its rows from it), and whatever reads it (Game.applyDev).
 */
export interface DevSettings {
  /**
   * Content tagged dev (M35, config/content.ts): maps, modes, difficulties and gear still being built are offered,
   * looking like the rest. A match that uses any of it stays out of the records and gives no XP (that is decided by what
   * the match uses, not by the switch, so it isn't a `cheat`).
   */
  devContent: boolean;
  /**
   * Disable levelling (M26d's Unlock all gear, LV1): every asset in pool.md unlocked for the Loadout, and matches give no
   * XP (a `cheat`: they stay out of the records too). The player's own level and unlocks are left as they are. The id
   * stays `unlockAllGear` so saved Dev settings keep it.
   */
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
  /**
   * The light every map plays under (M90): its own pick ('map', the Match screen's Day or Night where it offers both),
   * or Day or Night on any map (config/render.ts LIGHTING_PRESETS: any map can take any preset). From the next match.
   */
  timeOfDay: 'map' | LightingPresetId;
  /** Bots never pull the trigger (M90): walk a map, or watch them move, without being shot. */
  botsHoldFire: boolean;
  /**
   * Each round, MAG_SHARE.devLowAfter in, one bot a team is down to its last magazine (MG1), so the magazine hand-off
   * can be watched: bots fire a magazine or less a round, and rarely run low otherwise.
   */
  botsRunLow: boolean;
  /** Watch any bot while you are still in play (M90): you stand where you are and the fire key moves to the next. */
  spectateBots: boolean;
  /** A small label over each bot saying what its brain is doing (M90): fighting, holding, searching … Presentation only. */
  botIntent: boolean;
  /**
   * Adaptive difficulty (AD1, Dev 6 item 48; owner, 2026-10-06: "auto difficulty as a Dev setting"): in Elimination and
   * Attack / Defend the other team's skill follows how you do (config/adaptiveDifficulty.ts). A `cheat`: its matches
   * play no fixed level, so they stay out of the records.
   */
  adaptiveDifficulty: boolean;
  /**
   * Tone mapping (audit section 5 F2; RV2, owner's feature triage 2026-10-05: it left Graphics and everyone plays
   * Neutral). A look only, so not a `cheat`; applies at once.
   */
  toneMapping: ToneMappingId;
}

export const DEV_DEFAULTS: Readonly<DevSettings> = {
  devContent: false,
  unlockAllGear: false,
  showDebug: false,
  showBbPaths: false,
  bottomlessMags: false,
  ghost: false,
  gameSpeed: 1,
  timeOfDay: 'map',
  botsHoldFire: false,
  botsRunLow: false,
  spectateBots: false,
  botIntent: false,
  adaptiveDifficulty: false,
  toneMapping: TONE_MAPPING.default,
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
    help: "Shows maps, modes, difficulties and gear still being built. Matches that use any of it don't go into your records or give XP.",
    cheat: false,
  },
  {
    kind: 'switch',
    id: 'unlockAllGear',
    label: 'Disable levelling',
    help: 'Every replica and part is unlocked to equip, and matches give no XP. Your own level and unlocks stay as they are and come back when you turn it off.',
    cheat: true,
  },
  { kind: 'switch', id: 'showDebug', label: 'Debug info', help: 'Frame rate, position and other numbers in the top-left corner.', cheat: false },
  { kind: 'switch', id: 'showBbPaths', label: 'BB paths', help: 'Draws the flight of every BB, to watch hop-up lift it and drop take over.', cheat: false },
  { kind: 'range', id: 'gameSpeed', label: 'Game speed', help: 'Below 100% everything slows down, BBs too; above it, everything speeds up.', cheat: true, min: 0.25, max: 2, step: 0.25 },
  { kind: 'switch', id: 'bottomlessMags', label: 'Bottomless magazines', help: 'Your magazines never run dry.', cheat: true },
  { kind: 'switch', id: 'ghost', label: 'Ghost', help: 'BBs pass straight through you. The bots still shoot at you.', cheat: true },
  { kind: 'switch', id: 'botsHoldFire', label: 'Bots hold fire', help: 'No bot pulls its trigger: walk the map or watch them move without being shot.', cheat: true },
  {
    kind: 'switch',
    id: 'botsRunLow',
    label: 'Bots run low on BBs',
    help: 'Each round, a few seconds in, one bot on each team is down to its last magazine, to watch the magazine hand-off: it asks the nearest teammate, maybe you, for one.',
    cheat: true,
  },
  {
    kind: 'switch',
    id: 'spectateBots',
    label: 'Spectate any bot',
    help: 'In a match your view follows a bot while you stand still; your fire key moves to the next bot, on either team.',
    cheat: true,
  },
  { kind: 'switch', id: 'botIntent', label: 'Bot intentions', help: 'A small label over each bot in play says what it is doing: advancing, holding, fighting, searching …', cheat: true },
  { kind: 'switch', id: 'adaptiveDifficulty', label: ADAPTIVE_TEXT.label, help: ADAPTIVE_TEXT.help, cheat: true },
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
  {
    kind: 'choice',
    id: 'toneMapping',
    label: 'Tone mapping',
    help: 'How bright colours roll off to the screen. Everyone else plays Neutral.',
    cheat: false,
    choices: TONE_MAPPING_CHOICES,
  },
];

/**
 * The Dev tab's buttons (M90): each does something once, nothing saved. `cheat`: a match it acts on stays out of the
 * records (End the round now marks the match itself). `confirm`: asked first.
 */
export type DevActionId = 'giveXp' | 'levelUp' | 'resetLevel' | 'endRound' | 'resetSave';
export interface DevAction {
  id: DevActionId;
  label: string;
  help: string;
  button: string;
  confirm?: { title: string; question: string; yes: string };
}

/** What the XP button gives each press (M90, LV1). */
export const DEV_GIFTS = { xp: 500 } as const;

export const DEV_ACTIONS: readonly DevAction[] = [
  { id: 'giveXp', label: 'XP', help: `Adds ${DEV_GIFTS.xp} XP to your level, unlocking what it reaches.`, button: `+${DEV_GIFTS.xp} XP` },
  { id: 'levelUp', label: 'Next level', help: 'Adds the XP the next level takes, unlocking what it gives.', button: 'Level up' },
  {
    id: 'resetLevel',
    label: 'Reset level',
    help: 'Back to level 0 with the starting kit, to play the levels through again. The rest of the save stays.',
    button: 'Reset level',
    confirm: { title: 'Reset your level?', question: 'Your XP goes back to 0 and only the starting kit stays unlocked.', yes: 'Reset level' },
  },
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
    confirm: { title: 'Reset the save?', question: 'Your settings, key bindings, Loadout, level and records go, and the game reloads fresh.', yes: 'Reset save' },
  },
];

/** What a Dev button says for a moment after it is pressed (M90). */
export const DEV_ACTION_TEXT = { done: 'Done', noRound: 'No round under way', topLevel: 'At the top level', noteTime: 1600 } as const;

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
