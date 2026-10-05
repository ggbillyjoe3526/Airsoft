import { describe, expect, it } from 'vitest';
import { DEPOT } from '../map/depot';
import { skirmish } from './testSupport';

/**
 * Extraction (M45): the 'returned' event a wave puts out makes the bot of that opponent start afresh (the
 * BotController's sendBack), and no other bot.
 */
describe('a bot whose opponent returned in a wave (M45)', () => {
  /** Two Orange bots on Depot's middle lane, far from Blue's character 0, each having heard Blue at its feet. */
  function world(end: number) {
    const w = skirmish(DEPOT, [
      [-20, 0, 0],
      [4, 1, 1],
      [-6, -9, 1],
    ]);
    for (const b of w.bots.bots) b.character.end = end;
    const { state, bots } = w;
    state.events.length = 0;
    state.events.push({ type: 'caseNoise', characterId: 0, case: 0, kind: 'locker', position: { ...state.characters[0]!.position }, range: 200 });
    bots.observe(state);
    state.events.length = 0;
    return w;
  }
  const nearestPoint = (lane: readonly { x: number; z: number }[], x: number, z: number) => lane.reduce((best, p, i) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(lane[best]!.x - x, lane[best]!.z - z) ? i : best), 0);

  for (const end of [0, 1]) {
    it(`forgets what it knew and walks a lane on from the point nearest where it came back (end ${end})`, () => {
      const { state, bots } = world(end);
      const [a, b] = bots.bots;
      expect(a!.hasLastKnown && b!.hasLastKnown, 'both heard the noise').toBe(true);
      state.events.push({ type: 'returned', characterId: a!.character.id });
      bots.observe(state);
      expect(a!.hasLastKnown).toBe(false);
      expect(a!.lane).toBeGreaterThanOrEqual(0);
      expect(a!.lane).toBeLessThan(DEPOT.lanes.length);
      expect(a!.laneDir).toBe(end === 0 ? 1 : -1);
      const lane = DEPOT.lanes[a!.lane]!;
      const next = a!.laneIndex + a!.laneDir;
      expect(next).toBe(nearestPoint(lane, a!.character.position.x, a!.character.position.z));
      expect(a!.mode).toBe('advance');
      // The other opponent is not sent anywhere.
      expect(b!.hasLastKnown).toBe(true);
    });
  }

  it('picks lanes at random over several returns, not always the same one', () => {
    const { state, bots } = world(1);
    const a = bots.bots[0]!;
    const lanes = new Set<number>();
    for (let i = 0; i < 40; i++) {
      state.events.length = 0;
      state.events.push({ type: 'returned', characterId: a.character.id });
      bots.observe(state);
      lanes.add(a.lane);
    }
    expect(lanes.size).toBeGreaterThan(1);
  });

  it('ignores a return of someone who is not one of its bots', () => {
    const { state, bots } = world(1);
    state.events.length = 0;
    state.events.push({ type: 'returned', characterId: 0 });
    bots.observe(state);
    expect(bots.bots.every((b) => b.hasLastKnown)).toBe(true);
  });
});
