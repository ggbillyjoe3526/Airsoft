/**
 * The menus (M15, owner's design, 2026-10-03): a title screen, then New game (Mode, Difficulty, Loadout, Settings),
 * a Loadout screen and a Settings screen of their own, a pause menu and the match result. Items not built yet are
 * listed greyed out and marked "Later" so the layout already has their place.
 */

/** Shown in the title screen's corner: the release this build belongs to (moves with each tag, CLAUDE.md §7). */
export const BUILD_LABEL = 'v0.1-alpha.3';

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

/** The Loadout screen's words (M26b). */
export const LOADOUT_TEXT = {
  slots: { primary: 'Primary', secondary: 'Secondary', grenades: 'Grenades' },
  empty: 'Empty',
  equipped: 'Equipped',
  customise: 'Customise',
  backToGear: 'Back To Gear',
  rightClickHint: 'Right-click a replica to customise it.',
  /** Under a row with nothing owned to fit yet. */
  armoryHint: 'Unlock more in the Armory.',
  /** A part the replica has no rail or mount for. */
  noMount: 'No rail for one',
  /** Under the power sources, by the fitted one's type. */
  powerBlurb: {
    battery: 'A higher-capacity battery shoots harder and cycles faster.',
    gas: 'A stronger gas (red, then black) shoots harder.',
    spring: 'A stiffer spring shoots harder.',
  },
  grenadesLater: 'Grenades, smoke and flash bombs come in a later version.',
  /** Skins come with customisation (v0.5): the row keeps their place (M17b). */
  skinsLater: 'Replicas and outfit',
} as const;

export type SettingsTab = 'controls' | 'keys' | 'graphics' | 'crosshair' | 'audio' | 'accessibility';

/** The Settings screen's tabs, top to bottom. `later`: nothing on it is built yet. */
export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; later: boolean }[] = [
  { id: 'controls', label: 'Controls', later: false },
  { id: 'keys', label: 'Key bindings', later: false },
  { id: 'graphics', label: 'Graphics', later: false },
  { id: 'crosshair', label: 'Crosshair', later: false },
  { id: 'audio', label: 'Audio', later: false },
  { id: 'accessibility', label: 'Accessibility', later: false },
];

/** Settings not built yet, listed greyed out on their tab (label and a short line on what it will do). */
export const SETTINGS_LATER: Readonly<Record<SettingsTab, readonly { label: string; help: string }[]>> = {
  controls: [],
  keys: [],
  graphics: [],
  crosshair: [],
  audio: [{ label: 'Voices (hit calls)', help: '' }],
  accessibility: [],
};
