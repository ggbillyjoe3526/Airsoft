import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { createBBPool, spawnBB, stepBBFlight } from '../sim/ballistics';
import { vec3 } from '../sim/vec';
import { OwnShotStarts } from './ownShotStarts';

const DT = 1 / 60;

/** Stands in for BBRenderer: what each start was given. */
function recorder() {
  const starts: { serial: number; muzzle: { x: number; y: number; z: number }; flight: number; origin: { x: number; y: number; z: number } }[] = [];
  return {
    starts,
    startFromMuzzle(bb: { serial: number }, muzzle: { x: number; y: number; z: number }, flight: number, origin?: { x: number; y: number; z: number }) {
      starts.push({ serial: bb.serial, muzzle: { ...muzzle }, flight, origin: { x: origin!.x, y: origin!.y, z: origin!.z } });
    },
  };
}

describe('your shots start from the muzzle as this frame\'s camera sees it (BP6)', () => {
  it('starts each shot of the frame from the muzzle given at the frame, measured from where it really left', () => {
    const pool = createBBPool(4);
    const shots = new OwnShotStarts(pool.bbs.length);
    const a = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    stepBBFlight(a, BALLISTICS, DT);
    a.prevPosition.x = 0; // as stepBBs leaves it after the shot's tick: its segment began at the eye
    a.prevPosition.z = 0;
    shots.record(a, 0.5);
    // A second shot a tick later; the first BB flies on meanwhile (its prevPosition moves on with it).
    const b = spawnBB(pool, 0, vec3(0.1, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    b.prevPosition.x = 0.1;
    shots.record(b, Number.POSITIVE_INFINITY);
    a.prevPosition.z = -3;
    expect(shots.pending).toBe(2);
    const r = recorder();
    const muzzle = { x: 0.3, y: 1.4, z: -0.6 };
    shots.start(r, muzzle);
    expect(shots.pending).toBe(0);
    expect(r.starts.map((s) => s.serial)).toEqual([a.serial, b.serial]);
    expect(r.starts.every((s) => s.muzzle.x === 0.3 && s.muzzle.z === -0.6)).toBe(true);
    // Measured from the eye it left from, not from where the BB has flown on to since.
    expect(r.starts[0]!.origin).toEqual({ x: 0, y: 1.6, z: 0 });
    expect(r.starts[0]!.flight).toBe(0.5);
    expect(r.starts[1]!.origin.x).toBeCloseTo(0.1, 9);
  });

  it('skips a BB that has already landed, or whose slot a newer BB took, and starts none with no replica shown', () => {
    const pool = createBBPool(1);
    const shots = new OwnShotStarts(pool.bbs.length);
    const a = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    shots.record(a, 1);
    a.active = false;
    const r = recorder();
    shots.start(r, { x: 0, y: 0, z: 0 });
    expect(r.starts).toHaveLength(0);
    const b = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    shots.record(b, 1);
    shots.start(r, null);
    expect(r.starts).toHaveLength(0);
    expect(shots.pending).toBe(0);
  });

  it('holds no more than the BB pool can have in the air, however many ticks run with no frame drawn', () => {
    const pool = createBBPool(2);
    const shots = new OwnShotStarts(pool.bbs.length);
    const a = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    for (let i = 0; i < 50; i++) shots.record(a, 1);
    expect(shots.pending).toBe(2);
    shots.clear();
    expect(shots.pending).toBe(0);
  });
});
