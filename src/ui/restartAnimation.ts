/** An element whose CSS animation can be restarted (the DOM's, or a stand-in in tests). */
export interface Animatable {
  classList: { contains(cls: string): boolean; add(cls: string): void; remove(cls: string): void };
  getAnimations?: () => { currentTime: number | null | unknown; play(): void }[];
}

/**
 * Starts the CSS animation `cls` gives `el`, or restarts it from the beginning if `cls` is already on (audit UI-23):
 * through the Web Animations API, so no forced style and layout flush (the old remove, read offsetWidth, add trick)
 * lands in the frame that draws a hit. The hit effects keep their last frame (`forwards`), so a finished one is still
 * listed and restarts too; one with no animation (reduced motion) just stays on.
 */
export function restartAnimation(el: Animatable, cls: string): void {
  if (!el.classList.contains(cls)) {
    el.classList.add(cls);
    return;
  }
  if (el.getAnimations) {
    for (const a of el.getAnimations()) {
      a.currentTime = 0;
      a.play();
    }
    return;
  }
  // No Web Animations API (none of the browsers the game supports): the old way, with a reflow between.
  el.classList.remove(cls);
  void (el as unknown as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
