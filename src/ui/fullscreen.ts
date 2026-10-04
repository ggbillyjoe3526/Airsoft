/**
 * Fullscreen (M18b): the whole page (menus and HUD with the field), on the Fullscreen key while playing or from
 * Settings → Graphics. Browsers only allow it in answer to a click or key press, and Esc always leaves it.
 */
export function isFullscreen(): boolean {
  return document.fullscreenElement !== null && document.fullscreenElement !== undefined;
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
