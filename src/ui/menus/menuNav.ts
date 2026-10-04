/**
 * How the menus join up (owner's design, 2026-10-03). Before a match: Title → Start → New game, whose Map, Mode and
 * Difficulty buttons open a pop-up and whose Loadout and Settings buttons open a screen of their own. Esc in a match
 * opens the pause menu (Resume, Settings, Quit). After a match: the summary (M19: everyone's numbers
 * and your records; Continue), then the result (Play Again, New Game, Summary to look
 * again). The loadout is reached only through New game, so never mid-match; the practice range (M21, from the title)
 * opens it from its pause menu too, since nothing is at stake there.
 */
export type MenuScreen = 'title' | 'setup' | 'loadout' | 'armory' | 'settings' | 'pause' | 'summary' | 'result';

/** Where Settings (or, on the practice range, the Loadout) was opened from, and so where its Back button returns. */
export type SettingsOrigin = 'setup' | 'pause';

/** Where a screen's Back button goes, or null for screens without one (title, pause, summary, result). */
export function backTarget(screen: MenuScreen, settingsFrom: SettingsOrigin, loadoutFrom: SettingsOrigin = 'setup'): MenuScreen | null {
  switch (screen) {
    case 'setup':
      return 'title';
    case 'loadout':
      return loadoutFrom;
    // The Armory (M26c) is reached only from New game.
    case 'armory':
      return 'setup';
    case 'settings':
      return settingsFrom;
    default:
      return null;
  }
}

/**
 * The menu shown when play stops: the title before the first match, the match's end once it is decided (the summary,
 * then the result), else the pause menu.
 */
export function screenWhenStopped(started: boolean, matchOver: boolean): 'title' | 'pause' | 'result' {
  if (matchOver) return 'result';
  return started ? 'pause' : 'title';
}

/**
 * The tab a key moves to in a vertical tab list (WAI-ARIA tabs pattern, audit L-31): Arrow Down / Up to the next or
 * previous one (wrapping round), Home and End to the first and last; null for any other key.
 */
export function tabAfterKey(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
