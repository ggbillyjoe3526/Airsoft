import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, GAS_PISTOL } from '../config/replicas';
import { type BB, createBBPool, spawnBB, stepBBFlight } from './ballistics';
import { vec3 } from './vec';

const DT = 1 / 60;
const MUZZLE_HEIGHT = 1.6;

interface Flight {
  /** Height change (negative = drop) when the BB passes each horizontal distance. */
  dropAt: (distance: number) => number;
  /** Time taken to reach a horizontal distance. */
  timeTo: (distance: number) => number;
  speeds: number[];
}

/** Fires horizontally along -Z and records the flight until the BB hits the ground. */
function fly(speed: number, hopUp: number): Flight {
  const pool = createBBPool(1);
  const bb: BB = spawnBB(pool, 0, vec3(0, MUZZLE_HEIGHT, 0), vec3(0, 0, -1), speed, hopUp);
  const samples: { d: number; y: number; t: number }[] = [];
  const speeds: number[] = [];
  let t = 0;
  while (bb.position.y > 0 && t < 5) {
    stepBBFlight(bb, BALLISTICS, DT);
    t += DT;
    samples.push({ d: -bb.position.z, y: bb.position.y - MUZZLE_HEIGHT, t });
    speeds.push(Math.hypot(bb.velocity.x, bb.velocity.y, bb.velocity.z));
  }
  const at = (distance: number): { y: number; t: number } => {
    const s = samples.find((p) => p.d >= distance);
    if (!s) throw new Error(`BB never reached ${distance} m`);
    return s;
  };
  return { dropAt: (d) => at(d).y, timeTo: (d) => at(d).t, speeds };
}

describe('BB ballistics', () => {
  const aeg = fly(AEG.muzzleVelocity, AEG.hopUp);
  const pistol = fly(GAS_PISTOL.muzzleVelocity, GAS_PISTOL.hopUp);
  const noHop = fly(AEG.muzzleVelocity, 0);

  it('flies flat over mid-range thanks to hop-up, then drops off', () => {
    // AEG: within a hand's width of the aim point out to 30 m...
    expect(Math.abs(aeg.dropAt(20))).toBeLessThan(0.1);
    expect(Math.abs(aeg.dropAt(30))).toBeLessThan(0.25);
    // ...then clearly falling away.
    expect(aeg.dropAt(45)).toBeLessThan(-0.7);
  });

  it('hop-up makes a big difference compared with no hop-up', () => {
    expect(noHop.dropAt(30)).toBeLessThan(aeg.dropAt(30) * 3);
    expect(noHop.dropAt(30)).toBeLessThan(-0.6);
  });

  it('gives the pistol a shorter effective range than the AEG', () => {
    expect(pistol.dropAt(25)).toBeLessThan(aeg.dropAt(25) - 0.15);
    expect(Math.abs(pistol.dropAt(15))).toBeLessThan(0.15);
  });

  it('has visible travel time: tenths of a second across the map', () => {
    expect(aeg.timeTo(30)).toBeGreaterThan(0.35);
    expect(aeg.timeTo(30)).toBeLessThan(0.55);
    expect(pistol.timeTo(20)).toBeGreaterThan(aeg.timeTo(20));
  });

  it('only ever slows down in level flight (drag)', () => {
    for (let i = 1; i < aeg.speeds.length && i < 30; i++) expect(aeg.speeds[i]!).toBeLessThan(aeg.speeds[i - 1]!);
  });

  it('is deterministic', () => {
    expect(fly(AEG.muzzleVelocity, AEG.hopUp).dropAt(37)).toBe(aeg.dropAt(37));
  });
});

describe('BB pool', () => {
  it('reuses free slots and gives each shot a new serial', () => {
    const pool = createBBPool(2);
    const a = spawnBB(pool, 1, vec3(), vec3(0, 0, -1), 50, 0);
    const b = spawnBB(pool, 1, vec3(), vec3(0, 0, -1), 50, 0);
    expect(a).not.toBe(b);
    a.active = false;
    const c = spawnBB(pool, 2, vec3(1, 2, 3), vec3(1, 0, 0), 60, 0.1);
    expect(c).toBe(a);
    expect(c.serial).toBeGreaterThan(b.serial);
    expect(c.ownerId).toBe(2);
    expect(c.prevPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(c.velocity).toEqual({ x: 60, y: 0, z: 0 });
    expect(c.age).toBe(0);
  });

  it('overwrites the oldest BB when full', () => {
    const pool = createBBPool(2);
    const first = spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0);
    spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0);
    const third = spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0);
    expect(third).toBe(first);
    expect(pool.bbs.filter((b) => b.active)).toHaveLength(2);
  });
});
