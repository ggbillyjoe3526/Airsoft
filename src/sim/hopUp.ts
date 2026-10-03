import type { BallisticsConfig } from '../config/ballistics';
import { bbMass, HOP_UP, hopUpLift, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { createBBPool, spawnBB, stepBBFlight } from './ballistics';
import { vec3 } from './vec';

/** What a hop-up setting does to a level shot, for the start screen's readout. */
export interface HopUpReach {
  /** Metres the BB stays within HOP_UP.onTargetBand of the aim line (HOP_UP.readoutRange if it never leaves it). */
  onTargetTo: number;
  /** Highest it climbs above the aim line (m, 0 if it never does). */
  peakRise: number;
}

const DT = 1 / 120;

/**
 * Flies one BB level from `replica` with its hop-up dial at `dial` (the game's flight model, no spread) and
 * reports how far it stays on target and how high it rises. Cheap enough to run on every slider move.
 */
export function hopUpReach(replica: ReplicaConfig, dial: number, cfg: BallisticsConfig): HopUpReach {
  const bb = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), muzzleVelocity(replica), hopUpLift(replica, dial), bbMass(replica));
  let peakRise = 0;
  let onTargetTo: number = HOP_UP.readoutRange;
  while (bb.age < cfg.maxLifetime) {
    stepBBFlight(bb, cfg, DT);
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
    stepBBFlight(bb, cfg, DT);
    peakRise = Math.max(peakRise, bb.position.y);
  }
  return { onTargetTo, peakRise };
}
