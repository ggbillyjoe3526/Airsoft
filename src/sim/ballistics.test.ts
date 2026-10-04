import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, bbMass, GAS_PISTOL, hopUpLift, LOADOUT, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { flightTime as hopFlightTime } from './hopUp';
import { type BB, createBBPool, flightTimeEstimate, spawnBB, stepBBFlight } from './ballistics';
import { type Vec3, vec3 } from './vec';

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

/**
 * A replica with its factory hop-up shooting its own BBs, or BBs of another weight (same joules), at the resulting
 * muzzle velocity.
 */
const shoot = (r: ReplicaConfig, grams = r.bbWeight): Flight => {
  const loaded = { ...r, bbWeight: grams };
  return fly(muzzleVelocity(loaded), hopUpLift(loaded, loaded.hopUpDial), bbMass(loaded));
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

  it("flies flat thanks to hop-up out to Depot's longest sightline (34 m), then visibly drops", () => {
    // AEG with its factory hop: a gentle rise, within a hand's width of the aim point all the way to 34 m...
    for (const d of [10, 20, 25, 30, 34]) expect(Math.abs(aeg.dropAt(d)), `${d} m`).toBeLessThan(0.15);
    expect(aeg.dropAt(20)).toBeGreaterThan(0.03);
    // ...then falling away past it.
    expect(aeg.dropAt(45)).toBeLessThan(-0.5);
  });

  it('hop-up makes a big difference compared with no hop-up', () => {
    // Without hop-up the BB has dropped most of a metre by 30 m, where the hopped one is still on target.
    expect(noHop.dropAt(30)).toBeLessThan(aeg.dropAt(30) - 0.6);
    expect(noHop.dropAt(30)).toBeLessThan(-0.6);
  });

  it('gives the pistol a shorter effective range than the AEG', () => {
    expect(pistol.dropAt(30)).toBeLessThan(aeg.dropAt(30) - 0.3);
    expect(Math.abs(pistol.dropAt(15))).toBeLessThan(0.1);
  });

  it('has visible travel time: about half a second across the map', () => {
    // Real air drag since M30 (it was ~60% of real, ~0.47 s): a 1 J rifle's BB takes about 0.52 s to 30 m.
    expect(aeg.timeTo(30)).toBeGreaterThan(0.48);
    expect(aeg.timeTo(30)).toBeLessThan(0.56);
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

/** The factory rifle's BB fired level along `dir` from 1.6 m, in `wind`, stepped `steps` times a 60 Hz tick. */
function rifleBB(dir: Vec3 = vec3(0, 0, -1), wind?: Vec3, steps = 1) {
  const bb = spawnBB(createBBPool(1), 0, vec3(0, MUZZLE_HEIGHT, 0), dir, muzzleVelocity(AEG), hopUpLift(AEG, AEG.hopUpDial), bbMass(AEG), BALLISTICS);
  /** Flies on until `distance` m from the start along the ground, then returns where it is (interpolated). */
  const flyTo = (distance: number): Vec3 & { t: number } => {
    let last = { x: bb.position.x, y: bb.position.y, z: bb.position.z, t: bb.age };
    for (;;) {
      for (let i = 0; i < steps; i++) stepBBFlight(bb, BALLISTICS, DT / steps, wind);
      const reached = Math.hypot(bb.position.x, bb.position.z);
      if (reached >= distance) {
        const before = Math.hypot(last.x, last.z);
        const f = (distance - before) / (reached - before);
        return { x: last.x + (bb.position.x - last.x) * f, y: last.y + (bb.position.y - last.y) * f, z: last.z + (bb.position.z - last.z) * f, t: last.t + (bb.age - last.t) * f };
      }
      last = { x: bb.position.x, y: bb.position.y, z: bb.position.z, t: bb.age };
      if (bb.age > BALLISTICS.maxLifetime) throw new Error(`never reached ${distance} m`);
    }
  };
  return { bb, flyTo };
}

describe('BB fluid dynamics (M30)', () => {
  it('slows a BB as real air does: a 1 J rifle keeps under half its speed by 30 m', () => {
    const aeg = shoot(AEG);
    // Real drag (Cd ~0.4 from the Reynolds number): 88 m/s at the muzzle, about 39 m/s at 30 m.
    expect(aeg.speedAt(30) / aeg.speeds[0]!).toBeGreaterThan(0.38);
    expect(aeg.speedAt(30) / aeg.speeds[0]!).toBeLessThan(0.5);
  });

  it('steps accurately: one step a tick lands within a centimetre of a 100-substep flight at 50 m', () => {
    const wind = vec3(1.5, 0, 0.5);
    const tick = rifleBB(undefined, wind).flyTo(50);
    const fine = rifleBB(undefined, wind, 100).flyTo(50);
    expect(Math.abs(tick.y - fine.y)).toBeLessThan(0.01);
    expect(Math.abs(tick.x - fine.x)).toBeLessThan(0.01);
    expect(Math.abs(tick.t - fine.t)).toBeLessThan(0.005);
  });

  it('lifts a hopped BB the same whichever way it is fired (the backspin axis follows the barrel)', () => {
    const north = rifleBB(vec3(0, 0, -1)).flyTo(30);
    const s = Math.SQRT1_2;
    const diagonal = rifleBB(vec3(s, 0, s)).flyTo(30);
    expect(diagonal.y).toBeCloseTo(north.y, 6);
    expect(Math.abs(north.x)).toBeLessThan(1e-9); // and no sideways curl in still air
    expect(diagonal.x).toBeCloseTo(diagonal.z, 6);
  });

  it('keeps the spin axis level and square to the barrel, even on a shot aimed up', () => {
    const up = vec3(0, Math.sin(0.3), -Math.cos(0.3));
    const { bb } = rifleBB(up);
    expect(bb.spinAxis.y).toBe(0);
    expect(bb.spinAxis.x * up.x + bb.spinAxis.z * up.z).toBeCloseTo(0, 12);
    expect(Math.hypot(bb.spinAxis.x, bb.spinAxis.z)).toBeCloseTo(1, 12);
    const straightUp = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 1, 0), 80, 0.2, 0.25e-3);
    expect(Math.hypot(straightUp.spinAxis.x, straightUp.spinAxis.y, straightUp.spinAxis.z)).toBeCloseTo(1, 12);
  });

  it("loses its backspin to the air's friction, faster on a lighter BB", () => {
    const spinLeftAfter = (grams: number) => {
      const loaded = { ...AEG, bbWeight: grams };
      const bb = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), muzzleVelocity(loaded), hopUpLift(AEG, AEG.hopUpDial), bbMass(loaded));
      const start = bb.spin;
      for (let i = 0; i < 30; i++) stepBBFlight(bb, BALLISTICS, DT);
      return bb.spin / start;
    };
    expect(spinLeftAfter(0.25)).toBeLessThan(0.9);
    expect(spinLeftAfter(0.25)).toBeGreaterThan(0.4);
    expect(spinLeftAfter(0.2)).toBeLessThan(spinLeftAfter(0.28));
  });

  it('drifts a BB downwind in a crosswind, little at close range and more and more with distance', () => {
    const breeze = vec3(1.5, 0, 0); // 1.5 m/s blowing across a shot fired towards −z
    const flight = rifleBB(undefined, breeze);
    const at = [10, 20, 34].map((d) => flight.flyTo(d).x);
    expect(at[0]!).toBeGreaterThan(0);
    expect(at[0]!).toBeLessThan(0.05); // a few centimetres at 10 m
    expect(at[1]!).toBeGreaterThan(0.08); // a hand's width by 20 m
    expect(at[2]!).toBeGreaterThan(0.3); // a torso's width at Depot's longest lines
    expect(at[2]!).toBeLessThan(0.5);
    expect(at[2]! / at[1]!).toBeGreaterThan(34 / 20); // the drift grows faster than the distance: it builds as the BB slows
    // Calm air: none.
    expect(rifleBB().flyTo(34).x).toBe(0);
  });

  it('carries a BB a little further on a tailwind and a little shorter into a headwind', () => {
    const tail = rifleBB(undefined, vec3(0, 0, -1.5)).flyTo(40);
    const calm = rifleBB().flyTo(40);
    const head = rifleBB(undefined, vec3(0, 0, 1.5)).flyTo(40);
    expect(tail.t).toBeLessThan(calm.t);
    expect(head.t).toBeGreaterThan(calm.t);
  });

  it("estimates the flight time a bot leads with to within 5% of the full model's, and well over distance / muzzle speed", () => {
    for (const r of LOADOUT) {
      for (const d of [10, 20, 30]) {
        const exact = hopFlightTime(r, r.hopUpDial, d, BALLISTICS);
        const estimate = flightTimeEstimate(d, muzzleVelocity(r), bbMass(r), BALLISTICS);
        expect(Math.abs(estimate / exact - 1), `${r.id} ${d} m`).toBeLessThan(0.05);
      }
      expect(flightTimeEstimate(30, muzzleVelocity(r), bbMass(r), BALLISTICS)).toBeGreaterThan((30 / muzzleVelocity(r)) * 1.3);
    }
    expect(flightTimeEstimate(10, 0, 0.25e-3, BALLISTICS)).toBe(Number.POSITIVE_INFINITY);
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

  it('overwrites the oldest BB in flight when full, wherever its slot is', () => {
    const pool = createBBPool(3);
    const fire = () => spawnBB(pool, 0, vec3(), vec3(0, 0, -1), 50, 0, 0.25e-3);
    const [a, b, c] = [fire(), fire(), fire()];
    // The middle slot lands and is fired again: it now holds the newest BB, and `a` is the oldest.
    b.active = false;
    expect(fire()).toBe(b);
    expect(fire()).toBe(a);
    expect(pool.bbs.filter((x) => x.active)).toHaveLength(3);
    // Then `c` (the oldest left), then `b` (older than the BB just put in a's slot).
    expect(fire()).toBe(c);
    expect(fire()).toBe(b);
  });
});

describe('replica and BB sanity', () => {
  it('every replica has a positive energy, BB weight and hop, so its BBs fly', () => {
    for (const r of LOADOUT) {
      expect(r.muzzleEnergy, r.id).toBeGreaterThan(0);
      expect(r.bbWeight, r.id).toBeGreaterThan(0);
      expect(hopUpLift(r, r.hopUpDial), r.id).toBeGreaterThan(0);
      expect(r.hopUpDial, r.id).toBeLessThanOrEqual(1);
      expect(Number.isFinite(muzzleVelocity(r)), r.id).toBe(true);
    }
  });

  it('refuses a BB without a mass instead of flying it as NaN', () => {
    expect(() => spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), 80, 0.1, 0)).toThrow();
  });
});
