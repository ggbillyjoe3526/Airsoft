import { describe, expect, it } from 'vitest';
import { WIND } from '../config/ballistics';
import { vec3 } from './vec';
import { createWind, windAt } from './wind';

describe('the match wind (M30)', () => {
  it("is the same for the same match seed and differs between matches", () => {
    expect(createWind(7, WIND)).toEqual(createWind(7, WIND));
    const speeds = new Set(Array.from({ length: 20 }, (_, i) => createWind(i + 1, WIND).speed.toFixed(3)));
    expect(speeds.size).toBeGreaterThan(15);
  });

  it('blows level, from any direction, between calm and a light breeze, gusting round its mean', () => {
    const out = vec3();
    const yaws: number[] = [];
    for (let seed = 1; seed <= 64; seed++) {
      const w = createWind(seed, WIND);
      expect(w.speed).toBeGreaterThanOrEqual(WIND.minSpeed);
      expect(w.speed).toBeLessThanOrEqual(WIND.maxSpeed);
      yaws.push(w.yaw);
      let sum = 0;
      const samples = 2_000;
      for (let i = 0; i < samples; i++) {
        windAt(w, i * 0.25, out);
        expect(out.y).toBe(0);
        const speed = Math.hypot(out.x, out.z);
        expect(speed).toBeLessThanOrEqual(w.speed * (1 + WIND.gust) + 1e-9);
        expect(speed).toBeGreaterThanOrEqual(w.speed * (1 - WIND.gust) - 1e-9);
        sum += speed;
      }
      expect(sum / samples / w.speed).toBeCloseTo(1, 1); // the gusts average out
    }
    // Directions spread round the compass (every quarter gets some).
    const quarters = new Set(yaws.map((y) => Math.floor((y / (Math.PI * 2)) * 4)));
    expect(quarters.size).toBe(4);
  });

  it('changes smoothly from tick to tick (no jumps a BB could feel)', () => {
    const w = createWind(3, WIND);
    const a = windAt(w, 10, vec3());
    const b = windAt(w, 10 + 1 / 60, vec3());
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.01);
  });

  it('blows towards its yaw the way a character faces (yaw 0 is towards −z)', () => {
    const w = { ...createWind(1, WIND), yaw: 0, gust: 0, veer: 0 };
    const out = windAt(w, 5, vec3());
    expect(out.z).toBeCloseTo(-w.speed, 9);
    expect(out.x).toBeCloseTo(0, 9);
  });
});
