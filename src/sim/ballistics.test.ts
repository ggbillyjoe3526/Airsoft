import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, bbMass, GAS_PISTOL, LOADOUT, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { type BB, createBBPool, spawnBB, stepBBFlight } from './ballistics';
import { vec3 } from './vec';

const DT = 1 / 60;
const MUZZLE_HEIGHT = 1.6;

interface Flight {
  /** Height change (negative = drop) when the BB passes each horizontal distance. */
  dropAt: (distance: number) => number;
  /** Time taken to reach a horizontal distance. */
  timeTo: (distance: number) => number;
  /** Speed when passing a horizontal distance. */
  speedAt: (distance: number) => number;
  speeds: number[];
}

/** Fires horizontally along -Z and records the flight until the BB hits the ground. */
function fly(speed: number, hopUp: number, mass: number): Flight {
  const pool = createBBPool(1);
  const bb: BB = spawnBB(pool, 0, vec3(0, MUZZLE_HEIGHT, 0), vec3(0, 0, -1), speed, hopUp, mass);
  const samples: { d: number; y: number; t: number; v: number }[] = [];
  const speeds: number[] = [];
  let t = 0;
  while (bb.position.y > 0 && t < 5) {
    stepBBFlight(bb, BALLISTICS, DT);
    t += DT;
    const v = Math.hypot(bb.velocity.x, bb.velocity.y, bb.velocity.z);
    samples.push({ d: -bb.position.z, y: bb.position.y - MUZZLE_HEIGHT, t, v });
    speeds.push(v);
  }
  const at = (distance: number) => {
    const s = samples.find((p) => p.d >= distance);
    if (!s) throw new Error(`BB never reached ${distance} m`);
    return s;
  };
  return { dropAt: (d) => at(d).y, timeTo: (d) => at(d).t, speedAt: (d) => at(d).v, speeds };
}

/** A replica shooting its own BBs, or BBs of another weight (same joules), at the resulting muzzle velocity. */
const shoot = (r: ReplicaConfig, grams = r.bbWeight): Flight => {
  const loaded = { ...r, bbWeight: grams };
  return fly(muzzleVelocity(loaded), loaded.hopUp, bbMass(loaded));
};

describe('BB ballistics', () => {
  const aeg = shoot(AEG);
  const pistol = shoot(GAS_PISTOL);
  const noHop = fly(muzzleVelocity(AEG), 0, bbMass(AEG));

  it('rates replicas the way sites do: joules and BB weight give the muzzle velocity', () => {
    // E = ½mv²: the speed carries exactly the replica's energy.
    expect(0.5 * bbMass(AEG) * muzzleVelocity(AEG) ** 2).toBeCloseTo(AEG.muzzleEnergy, 9);
    expect(bbMass(GAS_PISTOL)).toBeCloseTo(0.0002, 9);
    expect(muzzleVelocity(AEG)).toBeGreaterThan(85); // ~1 J on 0.25 g: a typical site-legal AEG
    expect(muzzleVelocity(AEG)).toBeLessThan(92);
    expect(muzzleVelocity(GAS_PISTOL)).toBeLessThan(muzzleVelocity(AEG));
  });

  it('flies flat over mid-range thanks to hop-up, then visibly drops inside a CQB field', () => {
    // AEG: within a few centimetres of the aim point out to 20 m...
    expect(Math.abs(aeg.dropAt(20))).toBeLessThan(0.06);
    expect(Math.abs(aeg.dropAt(30))).toBeLessThan(0.3);
    // ...dropping enough by Depot's longest sightline (34 m) to see and aim over...
    expect(aeg.dropAt(34)).toBeLessThan(-0.3);
    // ...then clearly falling away.
    expect(aeg.dropAt(45)).toBeLessThan(-0.9);
  });

  it('hop-up makes a big difference compared with no hop-up', () => {
    // Without hop-up the BB drops at least three times as far by 30 m (both drops are negative).
    expect(Math.abs(noHop.dropAt(30))).toBeGreaterThan(Math.abs(aeg.dropAt(30)) * 3);
    expect(noHop.dropAt(30)).toBeLessThan(-0.6);
  });

  it('gives the pistol a shorter effective range than the AEG', () => {
    expect(pistol.dropAt(25)).toBeLessThan(aeg.dropAt(25) - 0.15);
    expect(Math.abs(pistol.dropAt(15))).toBeLessThan(0.1);
  });

  it('has visible travel time: about half a second across the map', () => {
    expect(aeg.timeTo(30)).toBeGreaterThan(0.42);
    expect(aeg.timeTo(30)).toBeLessThan(0.52);
    expect(pistol.timeTo(20)).toBeGreaterThan(aeg.timeTo(20));
  });

  it('only ever slows down in level flight (drag)', () => {
    for (let i = 1; i < aeg.speeds.length && i < 30; i++) expect(aeg.speeds[i]!).toBeLessThan(aeg.speeds[i - 1]!);
  });

  it('makes BB weight matter: light BBs leave faster but shed speed sooner; the same hop lifts them harder', () => {
    const light = shoot(AEG, 0.2);
    const heavy = shoot(AEG, 0.28);
    // Same replica (same joules): the lighter BB is faster out of the barrel...
    expect(light.speeds[0]!).toBeGreaterThan(aeg.speeds[0]!);
    expect(heavy.speeds[0]!).toBeLessThan(aeg.speeds[0]!);
    // ...but loses a bigger share of its speed to drag by 30 m...
    const kept = (f: Flight) => f.speedAt(30) / f.speeds[0]!;
    expect(kept(light)).toBeLessThan(kept(aeg));
    expect(kept(heavy)).toBeGreaterThan(kept(aeg));
    // ...and a hop set for 0.25 g lifts a 0.20 g BB above the aim line, while a 0.28 g one sags sooner.
    expect(light.dropAt(20)).toBeGreaterThan(0.02);
    expect(heavy.dropAt(25)).toBeLessThan(aeg.dropAt(25));
  });

  it('is deterministic', () => {
    expect(shoot(AEG).dropAt(37)).toBe(aeg.dropAt(37));
  });
});

describe('BB pool', () => {
  it('reuses free slots and gives each shot a new serial', () => {
    const pool = createBBPool(2);
    const a = spawnBB(pool, 1, vec3(), vec3(0, 0, -1), 50, 0, 0.25e-3);
    const b = spawnBB(pool, 1, vec3(), vec3(0, 0, -1), 50, 0, 0.25e-3);
    expect(a).not.toBe(b);
    a.active = false;
    const c = spawnBB(pool, 2, vec3(1, 2, 3), vec3(1, 0, 0), 60, 0.1, 0.25e-3);
    expect(c).toBe(a);
    expect(c.serial).toBeGreaterThan(b.serial);
    expect(c.ownerId).toBe(2);
    expect(c.prevPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(c.velocity).toEqual({ x: 60, y: 0, z: 0 });
    expect(c.age).toBe(0);
  });

  it('overwrites the oldest BB when full', () => {
    const pool = createBBPool(2);
    const first = spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0, 0.25e-3);
    spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0, 0.25e-3);
    const third = spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0, 0.25e-3);
    expect(third).toBe(first);
    expect(pool.bbs.filter((b) => b.active)).toHaveLength(2);
  });
});

describe('replica and BB sanity', () => {
  it('every replica has a positive energy, BB weight and hop, so its BBs fly', () => {
    for (const r of LOADOUT) {
      expect(r.muzzleEnergy, r.id).toBeGreaterThan(0);
      expect(r.bbWeight, r.id).toBeGreaterThan(0);
      expect(r.hopUp, r.id).toBeGreaterThan(0);
      expect(Number.isFinite(muzzleVelocity(r)), r.id).toBe(true);
    }
  });

  it('refuses a BB without a mass instead of flying it as NaN', () => {
    expect(() => spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), 80, 0.1, 0)).toThrow();
  });
});
