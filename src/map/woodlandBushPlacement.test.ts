import { describe, expect, it } from 'vitest';
import { WOODLAND, WOODLAND_LAYOUT } from './woodland';

/** M33e QA, acceptance 4, beyond what woodlandFoliage.test.ts checks: where else a bush must not stand. */
const BUSHES = WOODLAND.foliage ?? [];

describe("Woodland's bushes keep clear of the places people start from or fight over (M33e, acceptance 4)", () => {
  const spots = [
    ...WOODLAND.spawns.flat().map((s) => ['spawn', s.position] as const),
    ...WOODLAND.deadZones.flat().map((s) => ['dead-zone spot', s.position] as const),
    ['flag', WOODLAND.flag!] as const,
    ...WOODLAND_LAYOUT.fort.entrances.map((p) => ['fort entrance', p] as const),
  ];

  it('stands none on a spawn, a dead-zone spot, the flag or in front of a gap of the fort', () => {
    expect(spots.length).toBeGreaterThan(20);
    for (const [what, p] of spots) {
      for (const b of BUSHES) expect(Math.hypot(b.x - p.x, b.z - p.z), `${what} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeGreaterThan(b.radius);
    }
  });

  it('puts none inside the fort', () => {
    const f = WOODLAND_LAYOUT.fort.inside;
    for (const b of BUSHES) {
      const inside = b.x + b.radius > Math.min(f.x0, f.x1) && b.x - b.radius < Math.max(f.x0, f.x1) && b.z + b.radius > Math.min(f.z0, f.z1) && b.z - b.radius < Math.max(f.z0, f.z1);
      expect(inside, `bush at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`).toBe(false);
    }
  });

  it('gives every bush a real size: wider than a person, never taller than a standing one with a hat', () => {
    for (const b of BUSHES) {
      expect(b.radius).toBeGreaterThanOrEqual(0.5);
      expect(b.height).toBeGreaterThanOrEqual(1);
      expect(b.height).toBeLessThanOrEqual(2.2);
      expect(Number.isFinite(b.x + b.y + b.z)).toBe(true);
    }
  });

  it('spreads them over the field, not in one clump: some in each of the west, middle and east thirds', () => {
    const third = (WOODLAND_LAYOUT.halfX * 2) / 3;
    const count = [0, 0, 0];
    for (const b of BUSHES) count[Math.min(2, Math.floor((b.x + WOODLAND_LAYOUT.halfX) / third))]!++;
    for (const n of count) expect(n).toBeGreaterThanOrEqual(10);
  });
});
