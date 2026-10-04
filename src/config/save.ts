/**
 * The save system's numbers and words (M31, owner, 2026-10-04): everything the game keeps saves automatically in the
 * browser; Settings → Save downloads it as a file and loads one back. Format and migrations: `save/saveFile.ts`.
 */

/** The save layer's own keys in the browser, beside the stores it bundles (save/stores.ts). */
export const SAVE_KEYS = {
  /** Which save format last wrote this browser's save, when it last saved and when it was last downloaded. */
  meta: 'airsoft.save.meta',
  /** The daily restore points (newest first). */
  restorePoints: 'airsoft.save.restore',
  /** The save as it was before the last load, restore or delete (Undo). */
  undo: 'airsoft.save.undo',
} as const;

/** What a save file says it is (`game`), so a stray JSON file is told apart. */
export const SAVE_GAME_ID = 'Airsoft';

/** Restore points kept, one per day the game is opened (owner's default, 2026-10-04). */
export const RESTORE_POINTS = 3;

/** A file bigger than this (bytes) is refused before it is read: a save is a few kilobytes. */
export const SAVE_FILE_MAX_BYTES = 2 * 1024 * 1024;

/** The downloaded file's name, for a date ("airsoft-save-2026-10-04.json"). */
export const SAVE_FILE_PREFIX = 'airsoft-save-';

/** How long a new tab listens for an open one before it takes the save (ms), and waits for one to let go. */
export const TAB_LOCK = {
  channel: 'airsoft.tabs',
  answerWaitMs: 300,
  releaseWaitMs: 600,
} as const;

/** How long (ms) the download link stays alive after the click: Firefox reads it after the click returns. */
export const DOWNLOAD_URL_LIFETIME_MS = 10_000;

/** The Save tab's text. */
export const SAVE_TEXT = {
  statusLabel: 'Saved automatically',
  statusHelp: 'Settings, key bindings, Loadout, Armory and records save as they change. Nothing to press.',
  savedNever: 'Nothing saved yet',
  savedAgo: (ago: string) => `Last saved ${ago}`,
  downloadLabel: 'Download save',
  downloadHelp: 'A file with your whole save, to keep as a backup or to load in another browser.',
  downloadButton: 'Download',
  downloadedNever: 'Not downloaded yet.',
  downloadedAgo: (ago: string) => `Last downloaded ${ago}.`,
  loadLabel: 'Load save file',
  loadHelp: 'Replaces this browser\'s save with one from a file (or drop the file on this page). You can undo it.',
  loadButton: 'Load file',
  loadInMatch: 'Leave the match to load a save.',
  undoLabel: 'Undo last load or delete',
  undoHelp: (what: string) => `Brings back the save from before ${what}.`,
  undoNone: 'Nothing to undo.',
  undoButton: 'Undo',
  restoreLabel: 'Restore points',
  restoreHelp: `The browser keeps your save from each of the last ${RESTORE_POINTS} days you played. They go too if the browser's data is cleared: download a save for that.`,
  restoreNone: 'None yet: the first is kept the next time you open the game.',
  restoreButton: 'Restore',
  protectLabel: 'Protect from automatic clearing',
  protectHelp: 'Asks the browser not to clear the save when the disk runs low. Clearing your browsing data still deletes it.',
  protectButton: 'Protect',
  protectOn: 'Protected',
  protectRefused: 'The browser said no for now (Chrome and Edge decide by how often you play). Download a save to be safe.',
  protectUnsupported: 'This browser can\'t do this. Download a save to be safe.',
  deleteLabel: 'Delete save and start over',
  deleteHelp: 'Removes your settings, key bindings, Loadout, Armory and records from this browser. You can undo it.',
  deleteButton: 'Delete save',
  /** Problems, on the Save tab and the title screen. */
  blocked: 'This browser isn\'t keeping your save (storage is blocked or full). Download your save before closing the game.',
  newer: (build: string) => `This browser's save is from a newer version (${build}). Nothing you change now is saved: update the game to keep playing that save.`,
  otherTab: 'Airsoft is open in another tab, so this tab isn\'t saving.',
  privateHint: 'In a private window the browser deletes the save when the window closes.',
  /** The load and delete pop-ups. */
  confirmLoadTitle: 'Load this save?',
  confirmRestoreTitle: 'Restore this save?',
  confirmUndoTitle: 'Undo?',
  confirmDeleteTitle: 'Delete your save?',
  confirmDeleteBody: 'Your settings, key bindings, Loadout, Armory collection and records go, and the game starts fresh. Undo on the Save tab brings them back.',
  current: 'This browser',
  incoming: (from: 'file' | 'restore' | 'undo') => (from === 'file' ? 'The file' : from === 'restore' ? 'Restore point' : 'Before'),
  replaceButton: 'Replace',
  loadAnywayButton: 'Load anyway',
  deleteConfirmButton: 'Delete',
  downloadFirstButton: 'Download first',
  cancelButton: 'Cancel',
  reloadNote: 'The game reloads straight after.',
  checksumBad: 'This file was changed or damaged since it was saved. Loading it may lose or change some of your progress.',
  /** Why a file was refused. */
  errors: {
    tooBig: 'That file is too big to be an Airsoft save.',
    notJson: 'That file isn\'t an Airsoft save (it can\'t be read).',
    notSave: 'That file isn\'t an Airsoft save.',
    newer: (build: string) => `That save is from a newer version of the game (${build}). Update the game to load it.`,
    unreadable: 'The browser couldn\'t read that file.',
  },
  /** The rows of the side-by-side comparison. */
  compare: {
    savedAt: 'Saved',
    build: 'Version',
    fc: 'Field Credits',
    tokens: 'Tokens',
    items: 'Items',
    matches: 'Matches played',
  },
  undoWhat: { load: 'the last load', restore: 'the last restore', delete: 'the delete' },
  /** The notice in a second tab. */
  otherTabTitle: 'Airsoft is open in another tab',
  otherTabBody: 'Only one tab can play at a time, so your save stays in one piece. Play here to move the game to this tab; the other one stops saving.',
  otherTabButton: 'Play here',
} as const;
