import type { PowerSource } from './replicas';

/**
 * The menus (M15, owner's design, 2026-10-03): a title screen, then New game (Mode, Difficulty, Loadout, Settings),
 * a Loadout screen and a Settings screen of their own, a pause menu and the match result. Items not built yet are
 * listed greyed out and marked "Later" so the layout already has their place.
 */

/** Shown in the title screen's corner: the release this build belongs to (moves with each tag, CLAUDE.md §7). */
export const BUILD_LABEL = 'v0.1-alpha.3';

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

export type SettingsTab = 'controls' | 'keys' | 'graphics' | 'crosshair' | 'audio' | 'accessibility';

/** The Settings screen's tabs, top to bottom. `later`: nothing on it is built yet. */
export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; later: boolean }[] = [
  { id: 'controls', label: 'Controls', later: false },
  { id: 'keys', label: 'Key bindings', later: false },
  { id: 'graphics', label: 'Graphics', later: false },
  { id: 'crosshair', label: 'Crosshair', later: false },
  { id: 'audio', label: 'Audio', later: false },
  { id: 'accessibility', label: 'Accessibility', later: true },
];

/** Settings not built yet, listed greyed out on their tab (label and a short line on what it will do). */
export const SETTINGS_LATER: Readonly<Record<SettingsTab, readonly { label: string; help: string }[]>> = {
  controls: [{ label: 'Invert mouse', help: 'Up and down swapped.' }],
  keys: [],
  // Quality is listed greyed out too, with the preset in use (settingsScreen.ts).
  graphics: [],
  crosshair: [],
  audio: [{ label: 'Voices (hit calls)', help: '' }],
  accessibility: [
    { label: 'Colour-blind team colours', help: '' },
    { label: 'Reduced motion', help: 'Less camera bob and screen shake.' },
  ],
};
