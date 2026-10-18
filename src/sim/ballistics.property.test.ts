import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect } from 'vitest';
import { BALLISTICS, WIND } from '../config/ballistics';
import { BB_WEIGHT, bbMass, CYBER_PISTOL, GAS_PISTOL, AEG, HOP_UP, hopUpLift, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { SIM_DT } from '../config/sim';
import { airModel } from './air';
import { createBBPool, flightTimeEstimate, spawnBB, stepFlight } from './ballistics';
import { hopUpReach } from './hopUp';
import { vec3 } from './vec';

/**
 * Property tests (TL1, fast-check): the BB flight model over thousands of generated shots rather than a few picked ones.
 * Seeded, so a run is the same every time; a failure prints the smallest shot that breaks the rule and its seed and path.
 */
const SEED = 20261018;
const AIR = airModel(BALLISTICS);
const REPLICAS: readonly ReplicaConfig[] = [AEG, GAS_PISTOL, CYBER_PISTOL];

const replica = fc.constantFrom(...REPLICAS);
const dial = fc.double({ min: HOP_UP.minDial, max: HOP_UP.maxDial, noNaN: true });
/** A weight the slider offers: min plus whole steps. */
const grams = fc.integer({ min: 0, max: Math.round((BB_WEIGHT.max - BB_WEIGHT.min) / BB_WEIGHT.step) }).map((i) => Math.round((BB_WEIGHT.min + i * BB_WEIGHT.step) * 100) / 100);
/** Any way a replica can point: all round, from near straight down to near straight up. */
const aim = fc.record({ yaw: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), pitch: fc.double({ min: -1.5, max: 1.5, noNaN: true }) });
/** Level wind up to the game's strongest gust, any direction. */
const wind = fc.record({ speed: fc.double({ min: 0, max: WIND.maxSpeed * (1 + WIND.gust), noNaN: true }), from: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }) });

/** Height (m) a level shot is at when it has flown `distance` m, between ticks; NaN if it never gets there. */
function heightAt(r: ReplicaConfig, d: number, g: number, distance: number): number {
  const bb = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), muzzleVelocity(r, g), hopUpLift(r, d), bbMass(r, g));
  let x0 = 0;
  let y0 = 0;
  while (bb.age < BALLISTICS.maxLifetime) {
    stepFlight(bb, AIR, SIM_DT);
    const x1 = -bb.position.z;
    if (x1 >= distance) return y0 + ((bb.position.y - y0) * (distance - x0)) / (x1 - x0);
    x0 = x1;
    y0 = bb.position.y;
  }
  return Number.NaN;
}

describe('BB flight properties (TL1)', () => {
  test.prop([replica, dial, grams, aim, wind], { seed: SEED, numRuns: 300 })(
    'stays finite, never gains airspeed beyond what gravity adds, and only ever loses spin',
    (r, d, g, { yaw, pitch }, w) => {
      const dir = vec3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
      const air = vec3(Math.sin(w.from) * w.speed, 0, Math.cos(w.from) * w.speed);
      const speed = muzzleVelocity(r, g);
      const bb = spawnBB(createBBPool(1), 0, vec3(), dir, speed, hopUpLift(r, d), bbMass(r, g));
      const startAirspeed = Math.hypot(bb.velocity.x - air.x, bb.velocity.y - air.y, bb.velocity.z - air.z);
      let spin = bb.spin;
      while (bb.age < BALLISTICS.maxLifetime) {
        stepFlight(bb, AIR, SIM_DT, air);
        const { position: p, velocity: v } = bb;
        expect([p.x, p.y, p.z, v.x, v.y, v.z, bb.spin].every(Number.isFinite)).toBe(true);
        // Drag only takes speed off against the air and the hop's lift is square to the airflow: gravity is all that
        // can add any (the integrator's half-step is allowed half a per cent).
        const airspeed = Math.hypot(v.x - air.x, v.y - air.y, v.z - air.z);
        expect(airspeed).toBeLessThanOrEqual((startAirspeed + BALLISTICS.gravity * bb.age) * 1.005);
        expect(bb.spin).toBeGreaterThanOrEqual(0);
        expect(bb.spin).toBeLessThanOrEqual(spin);
        spin = bb.spin;
      }
    },
  );

  test.prop([replica, grams, dial, dial, fc.double({ min: 5, max: 40, noNaN: true })], { seed: SEED, numRuns: 150 })(
    'more hop-up never flies a level shot lower at any range, or peaks it lower',
    (r, g, a, b, distance) => {
      const [low, high] = a <= b ? [a, b] : [b, a];
      expect(heightAt(r, high, g, distance)).toBeGreaterThanOrEqual(heightAt(r, low, g, distance) - 1e-3);
      expect(hopUpReach(r, high, BALLISTICS, g).peakRise).toBeGreaterThanOrEqual(hopUpReach(r, low, BALLISTICS, g).peakRise - 1e-6);
    },
  );

  test.prop([replica, grams, fc.double({ min: 0, max: 80, noNaN: true }), fc.double({ min: 0.01, max: 20, noNaN: true })], { seed: SEED, numRuns: 500 })(
    "a bot's flight-time estimate grows with distance and is never under distance / muzzle speed",
    (r, g, distance, further) => {
      const speed = muzzleVelocity(r, g);
      const t = flightTimeEstimate(distance, speed, bbMass(r, g), BALLISTICS);
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(distance / speed - 1e-12);
      expect(flightTimeEstimate(distance + further, speed, bbMass(r, g), BALLISTICS)).toBeGreaterThan(t);
    },
  );
});
