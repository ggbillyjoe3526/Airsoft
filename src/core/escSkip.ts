/**
 * Esc skips the round (the owner's 0.1 Dev 5 playtest, note 10): once you are out, Esc skips straight away instead of
 * opening the pause menu, and Esc again opens the menu. The browser takes the mouse back on Esc and the page can't stop
 * it, so the skip runs without the mouse and a click takes it again.
 */

/** Why the mouse lock dropped in a match, as far as the game can tell. */
export interface LockDrop {
  /** The game let go itself (the result screen, a crash, the tab going away): never a skip. */
  released: boolean;
  /** A skip is offered (you are out) or one is already running. */
  skippable: boolean;
  /** The page is shown and has the focus: switching away drops the lock too, and must not skip anything. */
  focused: boolean;
  /** Ms since the Fullscreen key in play: fullscreen changing drops the lock too, and that takes it back (audit UI-19). */
  msSinceFullscreenKey: number;
  fullscreenWindowMs: number;
}

/** Whether a dropped mouse lock is the player's Esc to skip the round, rather than a pause. */
export function escSkips(d: LockDrop): boolean {
  const fullscreen = d.msSinceFullscreenKey >= 0 && d.msSinceFullscreenKey <= d.fullscreenWindowMs;
  return d.skippable && !d.released && d.focused && !fullscreen;
}

/**
 * Whether a key opens the pause menu while a round skips without the mouse: Esc, but not a held key's repeats nor
 * within `guardMs` of the skip starting (the Esc that let go of the mouse, where a browser passes it on to the page).
 */
export function escOpensMenu(code: string, repeat: boolean, msSinceSkip: number, guardMs: number): boolean {
  return code === 'Escape' && !repeat && msSinceSkip >= guardMs;
}
