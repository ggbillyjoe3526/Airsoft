import { describe, expect, it } from 'vitest';
import { escOpensMenu, escSkips, type LockDrop } from './escSkip';

const esc: LockDrop = { released: false, skippable: true, focused: true, msSinceFullscreenKey: Number.POSITIVE_INFINITY, fullscreenWindowMs: 1500 };

describe('Esc skips the round (the owner\'s 0.1 Dev 5 playtest, note 10)', () => {
  it('skips on the player\'s Esc once a skip is offered or running', () => {
    expect(escSkips(esc)).toBe(true);
  });

  it('pauses as before while you are still in the round (nothing to skip)', () => {
    expect(escSkips({ ...esc, skippable: false })).toBe(false);
  });

  it('never skips on the game\'s own release (the result screen, a crash, the Loadout key)', () => {
    expect(escSkips({ ...esc, released: true })).toBe(false);
  });

  it('never skips when switching away dropped the lock (tab hidden, window unfocused)', () => {
    expect(escSkips({ ...esc, focused: false })).toBe(false);
  });

  it('leaves the drop to the Fullscreen key\'s relock just after that key, and skips again after its window', () => {
    expect(escSkips({ ...esc, msSinceFullscreenKey: 200 })).toBe(false);
    expect(escSkips({ ...esc, msSinceFullscreenKey: 1500 })).toBe(false);
    expect(escSkips({ ...esc, msSinceFullscreenKey: 1501 })).toBe(true);
  });
});

describe('Esc again opens the menu while the round skips without the mouse', () => {
  it('opens on a fresh Esc after the guard', () => {
    expect(escOpensMenu('Escape', false, 400, 400)).toBe(true);
  });

  it('ignores the Esc that let go of the mouse, a held Esc\'s repeats and other keys', () => {
    expect(escOpensMenu('Escape', false, 30, 400)).toBe(false);
    expect(escOpensMenu('Escape', true, 900, 400)).toBe(false);
    expect(escOpensMenu('KeyW', false, 900, 400)).toBe(false);
  });
});
