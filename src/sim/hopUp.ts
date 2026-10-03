import type { BallisticsConfig } from '../config/ballistics';
import { SIM_DT } from '../config/sim';
import { bbMass, HOP_UP, hopUpLift, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { createBBPool, spawnBB, stepBBFlight } from './ballistics';
import { vec3 } from './vec';

/** What a hop-up setting does to a level shot, for the Loadout screen's readout. */
export interface HopUpReach {
  /** Metres the BB stays within HOP_UP.onTargetBand of the aim line (HOP_UP.readoutRange if it never leaves it). */
  onTargetTo: number;
  /** Highest it climbs above the aim line (m, 0 if it never does). */
  peakRise: number;
}

/**
 * Flies one `grams` BB level from `replica` with its hop-up dial at `dial` (the game's flight model, no spread) and
 * reports how far it stays on target and how high it rises. Cheap enough to run on every slider move.
 */
export function hopUpReach(replica: ReplicaConfig, dial: number, cfg: BallisticsConfig, grams = replica.bbWeight): HopUpReach {
  const bb = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), muzzleVelocity(replica, grams), hopUpLift(replica, dial), bbMass(replica, grams));
  let peakRise = 0;
  let onTargetTo: number = HOP_UP.readoutRange;
  while (bb.age < cfg.maxLifetime) {
    stepBBFlight(bb, cfg, SIM_DT); // the game's own tick, so the readout matches the BBs you fire
    const distance = -bb.position.z;
    if (distance >= HOP_UP.readoutRange) break;
    peakRise = Math.max(peakRise, bb.position.y);
    if (Math.abs(bb.position.y) > HOP_UP.onTargetBand) {
      onTargetTo = distance;
      break;
    }
  }
  // Past the band it may still climb (over-hopped): follow it to its peak for the readout.
  while (bb.age < cfg.maxLifetime && bb.velocity.y > 0 && -bb.position.z < HOP_UP.readoutRange) {
    stepBBFlight(bb, cfg, SIM_DT);
    peakRise = Math.max(peakRise, bb.position.y);
  }
  return { onTargetTo, peakRise };
}

/**
 * Seconds a level-fired `grams` BB from `replica` with its dial at `dial` takes to fly `distance` m (interpolated
 * between ticks, so weights a tick apart still compare), or Infinity if it never gets there.
 */
export function flightTime(replica: ReplicaConfig, dial: number, distance: number, cfg: BallisticsConfig, grams = replica.bbWeight): number {
  const bb = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), muzzleVelocity(replica, grams), hopUpLift(replica, dial), bbMass(replica, grams));
  let before = 0;
  while (bb.age < cfg.maxLifetime) {
    const t = bb.age;
    stepBBFlight(bb, cfg, SIM_DT);
    const reached = -bb.position.z;
    if (reached >= distance) return t + (SIM_DT * (distance - before)) / (reached - before);
    before = reached;
  }
  return Number.POSITIVE_INFINITY;
}

/** The dial (on the slider's steps) that keeps a `grams` BB from `replica` on target furthest, and how far that is. */
export function bestHopUp(replica: ReplicaConfig, cfg: BallisticsConfig, grams = replica.bbWeight): { dial: number; onTargetTo: number } {
  let best: { dial: number; onTargetTo: number } = { dial: HOP_UP.minDial, onTargetTo: -1 };
  const steps = Math.round((HOP_UP.maxDial - HOP_UP.minDial) / HOP_UP.dialStep);
  for (let i = 0; i <= steps; i++) {
    const dial = Number((HOP_UP.minDial + i * HOP_UP.dialStep).toFixed(4));
    const { onTargetTo, peakRise } = hopUpReach(replica, dial, cfg, grams);
    if (peakRise <= HOP_UP.onTargetBand && onTargetTo > best.onTargetTo) best = { dial, onTargetTo };
  }
  return best;
}
