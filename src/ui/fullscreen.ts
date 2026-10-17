/**
 * Fullscreen (M18b): the whole page (menus and HUD with the field), on the Fullscreen key while playing or from
 * Settings → Graphics. Browsers only allow it in answer to a click or key press, and Esc always leaves it.
 */
export function isFullscreen(): boolean {
  return document.fullscreenElement !== null && document.fullscreenElement !== undefined;
}

/**
 * Whether a fullscreen request now would count as the player's (a recent click or key press). Firefox gives the
 * function keys, the Fullscreen key's F10 among them, and Esc no user activation; Chrome gives the function keys one
 * (both checked under Playwright, Firefox 136 and Chromium 140, IN1). A browser that can't say counts as yes.
 */
export function hasUserActivation(): boolean {
  return navigator.userActivation?.isActive ?? true;
}

/** Enters fullscreen, or leaves it. Must run in (or just after) a click or key press. */
export function toggleFullscreen(): void {
  if (isFullscreen()) {
    void document.exitFullscreen?.().catch(() => undefined);
  } else {
    // Refused without a user gesture, or where fullscreen is blocked (an iframe without permission): nothing happens.
    void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
  }
}

/** Calls `listener` whenever the page enters or leaves fullscreen; returns the unsubscribe. */
export function onFullscreenChange(listener: (on: boolean) => void): () => void {
  const handler = (): void => listener(isFullscreen());
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}

/**
 * Whether to take the mouse again after the page entered or left fullscreen (audit UI-19): the Fullscreen key was
 * pressed in play `msSinceKey` ago (within `windowMs`), a match or the range is in play, and the browser dropped the
 * lock (Chrome and Firefox do as fullscreen changes). The key press is still a user activation, so the request is
 * allowed. Never in unlocked play (the `?nolock` test path).
 */
export function relockAfterFullscreen(msSinceKey: number, windowMs: number, inPlay: boolean, locked: boolean, unlockedPlay: boolean): boolean {
  return msSinceKey >= 0 && msSinceKey <= windowMs && inPlay && !locked && !unlockedPlay;
}

/**
 * What the mouse lock needs around the Fullscreen key (IN1): `take` it again now, `wait` for the page to finish
 * entering or leaving fullscreen (`changed` false: not yet), or nothing (`none`, as relockAfterFullscreen). Firefox
 * drops the lock as fullscreen changes and refuses it back until the change is done, then grants it, both ways; Chrome
 * keeps it (both checked under Playwright, Firefox 136 and Chromium 140, IN1). So a drop before the change waits for it
 * instead of stopping on the pause menu, and the lock is taken again on `fullscreenchange`.
 */
export type FullscreenRelock = 'none' | 'wait' | 'take';

export function fullscreenRelock(msSinceKey: number, windowMs: number, inPlay: boolean, locked: boolean, unlockedPlay: boolean, changed: boolean): FullscreenRelock {
  if (!relockAfterFullscreen(msSinceKey, windowMs, inPlay, locked, unlockedPlay)) return 'none';
  return changed ? 'take' : 'wait';
}
