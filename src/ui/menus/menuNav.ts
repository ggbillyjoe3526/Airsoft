/**
 * How the menus join up (owner's design, 2026-10-03; G3). Before a match: the title, whose buttons (and the top bar on
 * every screen after it) open the Play screen (New game: map, mode and match on one page), the Loadout, the Armory and
 * Settings. Each screen's Back returns to where it was opened from. Esc in a match
 * opens the pause menu (Resume, Settings, Quit). After a match: the summary (M19: everyone's numbers
 * and your records; Continue), then the result (Play Again, New Game, Summary to look
 * again). The loadout is reached only through New game, so never mid-match; the practice range (M21, from the title)
 * opens it from its pause menu too, since nothing is at stake there.
 */
export type MenuScreen = 'title' | 'setup' | 'loadout' | 'armory' | 'settings' | 'pause' | 'summary' | 'result';

/**
 * Where Settings, the Loadout or the Armory was opened from, and so where its Back button returns: the title (or the top
 * bar), the Play screen, or the pause menu (Settings; the Loadout on the practice range).
 */
export type SettingsOrigin = 'title' | 'setup' | 'pause';

/** Where a screen's Back button goes, or null for screens without one (title, pause, summary, result). */
export function backTarget(screen: MenuScreen, settingsFrom: SettingsOrigin, loadoutFrom: SettingsOrigin = 'setup', armoryFrom: SettingsOrigin = 'setup'): MenuScreen | null {
  switch (screen) {
    case 'setup':
      return 'title';
    case 'loadout':
      return loadoutFrom;
    // The Armory (M26c) is reached from the title and the top bar, never mid-match.
    case 'armory':
      return armoryFrom;
    case 'settings':
      return settingsFrom;
    default:
      return null;
  }
}

/**
 * Whether Esc resumes play (audit UI-09): on the pause menu, as Esc toggles pause in most shooters, but not a held key's
 * repeats nor within `guardMs` of the pause menu showing (the Esc that released the mouse, where a browser passes it on).
 */
export function escResumes(screen: MenuScreen, msSinceShown: number, repeat: boolean, guardMs: number): boolean {
  return screen === 'pause' && !repeat && msSinceShown >= guardMs;
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

/** A page has more below what shows (audit UI-18): more than a couple of pixels (rounding) left to scroll. */
export function moreBelow(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight < scrollHeight - 2;
}
