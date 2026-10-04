import { describe, expect, it } from 'vitest';
import { type Animatable, restartAnimation } from './restartAnimation';

/** A stand-in element: its classes, its running animations, and a trap on the layout read the old way needed. */
function element(animations: { currentTime: number | null; plays: number }[]) {
  const classes = new Set<string>();
  const el: Animatable & { offsetWidth: number } = {
    classList: { contains: (c) => classes.has(c), add: (c) => void classes.add(c), remove: (c) => void classes.delete(c) },
    getAnimations: () => animations.map((a) => Object.assign(a, { play: () => void a.plays++ })),
    get offsetWidth(): number {
      throw new Error('forced layout');
    },
  };
  return { el, classes };
}

describe('restarting a hit effect (audit UI-23)', () => {
  it('adds the class the first time, then rewinds its animations without reading layout', () => {
    const anim = { currentTime: 350 as number | null, plays: 0 };
    const { el, classes } = element([anim]);
    restartAnimation(el, 'show');
    expect(classes.has('show')).toBe(true);
    expect(anim.plays).toBe(0);
    restartAnimation(el, 'show'); // would throw on offsetWidth the old way
    expect(anim.currentTime).toBe(0);
    expect(anim.plays).toBe(1);
    expect(classes.has('show')).toBe(true);
  });
});
