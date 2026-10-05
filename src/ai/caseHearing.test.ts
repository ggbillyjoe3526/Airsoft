import { describe, expect, it } from 'vitest';
import { duel } from './testSupport';

/** Extraction (M44): bots hear a case being opened as far as its kind's noise carries (pool.md's Heard m). */
describe('bots hearing a case being opened (M44)', () => {
  /** The bot faces away from you, `dist` m off; one noise from a case at your feet that carries `range` m. */
  const hears = (dist: number, range: number, opener = 0): boolean => {
    const { state, bots, player } = duel(dist, (st) => (st.characters[1]!.yaw += Math.PI));
    state.events.length = 0;
    state.events.push({ type: 'caseNoise', characterId: opener, case: 0, kind: 'locker', position: { ...player.position }, range });
    bots.observe(state);
    return bots.bots[0]!.hasLastKnown;
  };

  it('come to look within its range, and never beyond it', () => {
    expect(hears(12, 30)).toBe(true);
    expect(hears(12, 8)).toBe(false);
  });

  it('do not take their own side for a threat', () => {
    // Character 1 is the Orange bot itself: a case it made noise at is not someone to hunt.
    expect(hears(5, 30, 1)).toBe(false);
  });
});
