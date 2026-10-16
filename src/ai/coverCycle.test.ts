import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import type { WorldQuery } from '../sim/armament';
import type { CoverBlock } from './cover';
import { boxQuery, duel } from './testSupport';

/**
 * KI1 (KNOWN_ISSUES "No test covers the cover → search → re-sighting → cover again cycle", M4b): a bot that takes
 * contact cover, loses sight of its target, searches, sees it again and takes cover again. The mode machine bounds the
 * cycle: a cover episode starts no sooner than coverCooldown after the last one began, and none outlasts
 * coverEpisodeMax.
 */
const DT = 1 / 60;

/**
 * A duel at 14 m with a 1.2 m crate 2 m in front of the bot, and a screen in front of the player that the test raises
 * and lowers (the player stepping behind something and out again). Holding fire, so nobody is hit.
 */
function cycle(seconds: number, screenUp: (mode: string, time: number, coverStarts: readonly number[]) => boolean) {
  const crate = boxQuery(0, -12, 0.6, 0.6, 1.2);
  const block: CoverBlock = { x: 0, z: -12, halfX: 0.6, halfZ: 0.6 };
  const screen = boxQuery(0, -1.5, 4, 0.3, 3);
  let up = false;
  const query: WorldQuery = {
    raycastStatic(o, d, max) {
      const a = crate.raycastStatic(o, d, max);
      const b = up ? screen.raycastStatic(o, d, max) : -1;
      if (a < 0) return b;
      return b < 0 ? a : Math.min(a, b);
    },
  };
  const { state, bots, run } = duel(14, () => {}, query, { ...BOTS, fireCone: 0 }, 7, [block]);
  const b = bots.bots[0]!;
  const modes: string[] = [];
  const coverStarts: number[] = [];
  const episodes: number[] = [];
  let last = '';
  let coverSince = -1;
  run(seconds, () => {
    up = screenUp(b.mode, state.time, coverStarts);
    // A cover episode is time in cover mode or fighting from the spot it took.
    const inCover = b.mode === 'cover' || (b.mode === 'fight' && b.fromCover);
    if (b.mode === 'cover' && last !== 'cover' && !(last === 'fight' && coverSince >= 0)) coverStarts.push(state.time);
    if (inCover && coverSince < 0) coverSince = state.time;
    if (!inCover && coverSince >= 0) {
      episodes.push(state.time - coverSince);
      coverSince = -1;
    }
    if (b.mode !== last) modes.push(b.mode);
    last = b.mode;
  });
  if (coverSince >= 0) episodes.push(state.time - coverSince);
  return { modes, coverStarts, episodes };
}

describe('the cover → search → re-sighting → cover again cycle (M4b)', () => {
  it('takes cover again on seeing its target again while searching for it', () => {
    // The screen goes up once the bot has taken cover, and down again once it is searching.
    let searched = false;
    const r = cycle(20, (mode, _t, starts) => {
      searched ||= starts.length > 0 && mode === 'search';
      return starts.length === 1 && !searched;
    });
    const first = r.modes.indexOf('cover');
    const search = r.modes.indexOf('search', first);
    const again = r.modes.indexOf('cover', search);
    expect(first, r.modes.join(' ')).toBeGreaterThanOrEqual(0);
    expect(search, r.modes.join(' ')).toBeGreaterThan(first);
    expect(again, r.modes.join(' ')).toBeGreaterThan(search);
    expect(r.coverStarts.length).toBeGreaterThanOrEqual(2);
    expect(r.coverStarts[1]! - r.coverStarts[0]!).toBeGreaterThanOrEqual(BOTS.coverCooldown - DT / 2);
    for (const e of r.episodes) expect(e).toBeLessThanOrEqual(BOTS.coverEpisodeMax + 2 * DT);
  });

  it('never starts cover episodes closer than coverCooldown, nor holds one past coverEpisodeMax, however often sight comes and goes', () => {
    // The screen flicks up and down every 0.7 s to 2.3 s: sight lost and won again over and over.
    const r = cycle(40, (_m, t) => Math.floor(t / 0.7) % 3 === 0 || Math.floor(t / 2.3) % 2 === 1);
    expect(r.coverStarts.length, r.modes.join(' ')).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < r.coverStarts.length; i++) {
      expect(r.coverStarts[i]! - r.coverStarts[i - 1]!, `cover starts ${r.coverStarts.map((s) => s.toFixed(2)).join(', ')}`).toBeGreaterThanOrEqual(BOTS.coverCooldown - DT / 2);
    }
    for (const e of r.episodes) expect(e).toBeLessThanOrEqual(BOTS.coverEpisodeMax + 2 * DT);
  });
});
