/** What awayWatch listens to: the page's document (for `hidden`) and its window. */
export interface AwayTargets {
  readonly doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  readonly win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Calls `away` when the player stops looking at the game: the tab is hidden (another tab, the window minimised; M18b),
 * or the window loses the focus with the mouse still captured (an overlay, a notification, a click on a second monitor;
 * audit CORE-20), where nothing else would pause it and the keyboard lets go of every key. Returns the function that
 * stops watching.
 */
export function awayWatch({ doc, win }: AwayTargets, away: () => void): () => void {
  const visibility = (): void => {
    if (doc.hidden) away();
  };
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', away);
  return () => {
    doc.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('blur', away);
  };
}
