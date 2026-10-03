/**
 * How the menus join up (owner's design, 2026-10-03). Before a match: Title → Start → New game, whose Map, Mode and
 * Difficulty buttons open a pop-up and whose Loadout and Settings buttons open a screen of their own. Esc in a match
 * opens the pause menu (Resume, Settings, Quit to title screen). After a match: the result (Play Again, Change setup,
 * Title screen). The loadout is reached only through New game, so never mid-match.
 */
export type MenuScreen = 'title' | 'setup' | 'loadout' | 'settings' | 'pause' | 'result';

/** Where Settings was opened from, and so where its Back button returns. */
export type SettingsOrigin = 'setup' | 'pause';

/** Where a screen's Back button goes, or null for screens without one (title, pause, result). */
export function backTarget(screen: MenuScreen, settingsFrom: SettingsOrigin): MenuScreen | null {
  switch (screen) {
    case 'setup':
      return 'title';
    case 'loadout':
      return 'setup';
    case 'settings':
      return settingsFrom;
    default:
      return null;
  }
}

/** The menu shown when play stops: the title before the first match, the result once a match is decided, else the pause menu. */
export function screenWhenStopped(started: boolean, matchOver: boolean): 'title' | 'pause' | 'result' {
  if (matchOver) return 'result';
  return started ? 'pause' : 'title';
}
