import type { PowerSource } from './replicas';

/**
 * The menus (M15, owner's design, 2026-10-03): a title screen, then New game (Mode, Difficulty, Loadout, Settings),
 * a Loadout screen and a Settings screen of their own, a pause menu and the match result. Items not built yet are
 * listed greyed out and marked "Later" so the layout already has their place.
 */

/** Browser basics (M18b): what the game says when the browser gets in the way. */
export const BROWSER_NOTES = {
  /** On the title screen when the browser draws without hardware acceleration (render/gpuCheck.ts). */
  noHardwareAcceleration:
    'Your browser is drawing without hardware acceleration, so the game will run slowly. Turn on "Use graphics acceleration when available" (Chrome, Edge) or "Use recommended performance settings" (Firefox) in its settings, then restart the browser.',
  /** Added to that warning when the game picked Low for the visit itself (nothing saved; config/render.ts startingQuality). */
  qualitySetLow: 'Graphics quality is set to Low for this visit (Settings, Graphics).',
  /** Over everything while the graphics context is lost. */
  graphicsLost: 'Graphics reset. The graphics card dropped the game for a moment; waiting for it to come back…',
  /** On the pause menu once it's back. */
  graphicsBack: 'Graphics are back. Resume when you’re ready.',
} as const;

/** How a replica's power source shows on the loadout screen: its slot tag, and the placeholder row under it. */
export const POWER_LABELS: Readonly<Record<PowerSource, { tag: string; row: string; value: string }>> = {
  electric: { tag: 'Electric', row: 'Power', value: 'Battery (electric)' },
  gas: { tag: 'Gas', row: 'Gas type', value: 'Green gas' },
};

/** Shown greyed in the optic and grip rows of a replica with no rail for one (M17b). */
export const LOADOUT_FIXED = {
  noOptic: 'Iron sights',
  noGrip: 'No rail for one',
} as const;

/** Loadout parts not built yet, shown as placeholders. */
export const LOADOUT_LATER = {
  /** Skins come with customisation (v0.5): the row keeps their place (M17b). */
  skins: 'Replicas and outfit',
} as const;

export type SettingsTab = 'controls' | 'keys' | 'graphics' | 'crosshair' | 'hud' | 'audio' | 'accessibility' | 'dev';

/**
 * The Settings screen's tabs, top to bottom. `later`: nothing on it is built yet. `hidden`: shown only once the
 * "Dev settings" box under the tabs is ticked (M24).
 */
export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; later: boolean; hidden?: boolean }[] = [
  { id: 'controls', label: 'Controls', later: false },
  { id: 'keys', label: 'Key Bindings', later: false },
  { id: 'graphics', label: 'Graphics', later: false },
  { id: 'crosshair', label: 'Crosshair', later: false },
  { id: 'hud', label: 'HUD', later: false },
  { id: 'audio', label: 'Audio', later: false },
  { id: 'accessibility', label: 'Accessibility', later: false },
  { id: 'dev', label: 'Dev', later: false, hidden: true },
];

/** The box under the Settings tabs that shows the Dev tab (M24). */
export const DEV_TOGGLE_LABEL = 'Dev settings';

/** Settings not built yet, listed greyed out on their tab (label and a short line on what it will do). */
export const SETTINGS_LATER: Readonly<Record<SettingsTab, readonly { label: string; help: string }[]>> = {
  controls: [],
  keys: [],
  graphics: [],
  crosshair: [],
  hud: [],
  audio: [{ label: 'Voices (hit calls)', help: '' }],
  accessibility: [],
  dev: [],
};
