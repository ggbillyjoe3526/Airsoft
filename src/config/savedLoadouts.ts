/**
 * Saved loadouts (SL1, Dev 6 item 19): how many there are, how long a name may be, and their words. The model is
 * `pool/savedLoadouts.ts`; the Loadout's dropdown `ui/menus/savedLoadoutsBar.ts`, the Match screen's pick
 * `ui/menus/loadoutPicker.ts`.
 */

export const SAVED_LOADOUTS = {
  /** Fixed slots, numbered 1 to 5 (keys 1 to 5 on the Loadout): enough for CQB, long range and a few to try (docs/DECISIONS.md). */
  slots: 5,
  /** Characters in a name, after trimming. */
  nameMax: 20,
} as const;

export const SAVED_TEXT = {
  heading: 'Saved loadouts',
  defaultName: (slot: number): string => `Loadout ${slot}`,
  /** A duplicate's name: the original's, then "copy" (the original cut short to fit). */
  copySuffix: ' copy',
  current: 'Current',
  newLoadout: 'New loadout',
  /** The Loadout's New button beside the dropdown (MR1). */
  newShort: 'New',
  newNote: 'Starts as a copy of yours',
  rename: 'Rename',
  duplicate: 'Duplicate',
  delete: 'Delete',
  cancel: 'Cancel',
  nameLabel: 'Loadout name',
  /** The replicas a loadout carries, as its tab's second line. */
  carries: (names: readonly string[]): string => names.join(' · ') || 'Nothing carried',
  locked: (n: number): string => `${n} locked`,
  /** Under the tabs, for the loadout carried: what it holds that isn't available, and what plays instead. */
  lockedHead: 'Not available, swapped for now',
  missing: (wanted: string, dev: boolean, instead: string | null, level: number | null = null): string =>
    `${wanted} (${dev ? 'dev gear: Dev content is off' : level !== null ? `unlocks at level ${level}` : 'locked'}): ${instead ? `${instead} instead` : 'nothing in its place'}`,
  onlyOne: 'Your only saved loadout: rename or change it instead.',
  full: `All ${SAVED_LOADOUTS.slots} slots are in use: delete one first.`,
  deleteTitle: (name: string): string => `Delete ${name}?`,
  deleteBody: 'It is gone for good.',
  deleteCurrentBody: (next: string): string => `It is gone for good, and you carry ${next} instead.`,
  /** The Loadout's dropdown for a screen reader (MR1). */
  pickerName: (slot: number, name: string, carries: string, locked: number): string =>
    `Saved loadout ${slot}: ${name}, ${carries}${locked > 0 ? `, ${locked} locked` : ''}. Pick another`,
  /** The Loadout's line beside the dropdown. */
  hint: `Changes save as you go · keys 1 to ${SAVED_LOADOUTS.slots} switch`,
  /** The Match screen's pick: its button, its menu's title and the way to the Loadout. */
  pickName: (name: string): string => `Saved loadout: ${name}. Pick another`,
  pickTitle: 'Saved loadouts',
  manage: 'Manage loadouts',
} as const;
