import { describe, expect, it } from 'vitest';
import { MINIMAP } from '../config/minimap';
import { clampToRim, HeardPlayers, noiseAlpha, noiseBlur, toMinimap } from './minimapView';
import type { HeardSound } from './soundCues';

const at = { x: 0, y: 0 };

describe('toMinimap (M23)', () => {
  it('puts what is ahead of you at the top and what is to your right on the right', () => {
    // Yaw 0 looks down -z; +x is to the right.
    expect(toMinimap(0, 0, 0, 0, -10, 2, at)).toEqual({ x: 0, y: -20 });
    expect(toMinimap(0, 0, 0, 10, 0, 2, at).x).toBeCloseTo(20);
  });

  it('turns with the view: looking down -x (yaw π/2), -x is up and -z is to the right', () => {
    const p = toMinimap(Math.PI / 2, 5, 5, -5, 5, 1, at);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-10);
    const q = toMinimap(Math.PI / 2, 5, 5, 5, -5, 1, at);
    expect(q.x).toBeCloseTo(10);
    expect(q.y).toBeCloseTo(0);
  });

  it('pins a point beyond the rim to it, and leaves one inside alone', () => {
    const p = { x: 30, y: 40 };
    expect(clampToRim(p, 10)).toBe(true);
    expect(p.x).toBeCloseTo(6);
    expect(p.y).toBeCloseTo(8);
    const q = { x: 3, y: 4 };
    expect(clampToRim(q, 10)).toBe(false);
    expect(q).toEqual({ x: 3, y: 4 });
  });
});

describe('heard players on the minimap (M23)', () => {
  const sound = (sourceId: number, kind: HeardSound['kind'], x: number, z: number): HeardSound => ({ sourceId, kind, x, z });

  it('places a footstep vaguer than a shot, vaguer further off, within bounds', () => {
    expect(noiseBlur('step', 20)).toBeGreaterThan(noiseBlur('shot', 20));
    expect(noiseBlur('shot', 30)).toBeGreaterThan(noiseBlur('shot', 15));
    expect(noiseBlur('shot', 0)).toBe(MINIMAP.noiseMinBlur);
    expect(noiseBlur('step', 1000)).toBe(MINIMAP.noiseMaxBlur);
  });

  it('keeps one patch per player, at their last sound, with them inside it', () => {
    const h = new HeardPlayers();
    h.add(sound(4, 'step', 10, 0), 0, 0, 1);
    h.add(sound(4, 'shot', 12, 3), 0, 0, 2);
    h.add(sound(5, 'shot', -8, 2), 0, 0, 2);
    const live = h.players.filter((p) => !Number.isNaN(p.at));
    expect(live).toHaveLength(2);
    const p4 = live.find((p) => p.sourceId === 4)!;
    expect(p4.kind).toBe('shot');
    expect(p4.at).toBe(2);
    expect(Math.hypot(p4.x - 12, p4.z - 3)).toBeLessThanOrEqual(p4.radius);
  });

  it('hears nothing beyond the sound\'s range, and ignores hit calls', () => {
    const h = new HeardPlayers();
    h.add(sound(4, 'step', MINIMAP.hearing.step + 1, 0), 0, 0, 1);
    h.add(sound(5, 'hit', 1, 0), 0, 0, 1);
    expect(h.players.filter((p) => !Number.isNaN(p.at))).toHaveLength(0);
  });

  it('fades a patch out and frees it; forgets a player who is hit; a new round clears all', () => {
    expect(noiseAlpha(0)).toBe(1);
    expect(noiseAlpha(MINIMAP.noiseLife - MINIMAP.noiseFade / 2)).toBeCloseTo(0.5);
    expect(noiseAlpha(MINIMAP.noiseLife)).toBe(0);
    const h = new HeardPlayers();
    h.add(sound(4, 'shot', 5, 0), 0, 0, 0);
    h.add(sound(5, 'shot', 6, 0), 0, 0, 3);
    h.expire(MINIMAP.noiseLife + 0.1);
    expect(h.players.filter((p) => !Number.isNaN(p.at)).map((p) => p.sourceId)).toEqual([5]);
    h.forget(5);
    expect(h.players.every((p) => Number.isNaN(p.at))).toBe(true);
    h.add(sound(6, 'step', 2, 0), 0, 0, 4);
    expect(h.players).toHaveLength(2); // a free patch is reused
    h.clear();
    expect(h.players.every((p) => Number.isNaN(p.at))).toBe(true);
  });
});
