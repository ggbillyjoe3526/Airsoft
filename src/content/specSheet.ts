import { BALLISTICS, type BallisticsConfig } from '../config/ballistics';
import { SPEC_SHEET } from '../config/contentRules';
import { bbMass, hopUpLift, muzzleEnergy, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { SIM_DT } from '../config/sim';
import { createBBPool, spawnBB, stepBBFlight } from '../sim/ballistics';
import { bestHopUp, hopUpReach } from '../sim/hopUp';
import { vec3 } from '../sim/vec';

/**
 * The spec test's chrono and range table (CT1, level 3): what a replica shoots, worked out with the game's own BB
 * flight (sim/ballistics.ts, the 60 Hz tick the BBs you fire use), like a virtual chrono and a range day. Pure.
 */

export interface ChronoRow {
  grams: number;
  /** m/s at the muzzle. */
  speed: number;
  joules: number;
}

export interface SpecSheet {
  name: string;
  /** Muzzle speed and energy for each BB weight on the chrono. */
  chrono: ChronoRow[];
  /** How far a level shot stays on target (within the Loadout's band of the aim line) at its factory hop-up and weight (m). */
  onTarget: number;
  /** The same at the hop-up dial that keeps it on target furthest, and that dial (0..1). */
  bestOnTarget: { dial: number; metres: number };
  /** How far below the aim line a level shot is (cm, + below) at each distance, factory hop-up and weight; NaN if it never gets there. */
  drop: { metres: number; cm: number }[];
  /** Half the BBs land within this radius (cm) of the aim point, standing still, at each distance. */
  group: { metres: number; cm: number }[];
  /** Seconds to empty a magazine with the trigger held (or clicking as fast as it fires). */
  emptyMag: number;
  fireRate: number;
  magSize: number;
  mags: number;
  reload: number;
  draw: number;
  spreadDeg: number;
  recoilDeg: number;
}

/** The radius holding half of a two-axis normal spread of σ per axis (a Rayleigh median): σ·√(2 ln 2). */
const HALF_RADIUS = Math.sqrt(2 * Math.LN2);

/** Where a level shot is (m above the aim line) as it passes each of `distances` (sorted), or NaN if it never gets there. */
export function heightsAt(replica: ReplicaConfig, dial: number, distances: readonly number[], cfg: BallisticsConfig = BALLISTICS, grams = replica.bbWeight): number[] {
  const bb = spawnBB(createBBPool(1), 0, vec3(), vec3(0, 0, -1), muzzleVelocity(replica, grams), hopUpLift(replica, dial), bbMass(replica, grams), cfg);
  const out = distances.map(() => Number.NaN);
  let next = 0;
  let before = { d: 0, y: 0 };
  while (bb.age < cfg.maxLifetime && next < distances.length) {
    stepBBFlight(bb, cfg, SIM_DT);
    const d = -bb.position.z;
    while (next < distances.length && d >= distances[next]!) {
      const t = (distances[next]! - before.d) / Math.max(1e-9, d - before.d);
      out[next] = before.y + t * (bb.position.y - before.y);
      next++;
    }
    before = { d, y: bb.position.y };
  }
  return out;
}

/** The spec sheet of `replica` as carried (a kitted replica works as well as one as it comes). */
export function specSheet(replica: ReplicaConfig, cfg: BallisticsConfig = BALLISTICS): SpecSheet {
  const chrono = SPEC_SHEET.bbWeights.map((grams) => ({ grams, speed: muzzleVelocity(replica, grams), joules: muzzleEnergy(replica, grams) }));
  const best = bestHopUp(replica, cfg);
  const heights = heightsAt(replica, replica.hopUpDial, SPEC_SHEET.dropAt, cfg);
  const spread = (replica.spreadDeg * Math.PI) / 180;
  return {
    name: replica.name,
    chrono,
    onTarget: hopUpReach(replica, replica.hopUpDial, cfg).onTargetTo,
    bestOnTarget: { dial: best.dial, metres: best.onTargetTo },
    drop: SPEC_SHEET.dropAt.map((metres, i) => ({ metres, cm: -heights[i]! * 100 })),
    group: SPEC_SHEET.groupAt.map((metres) => ({ metres, cm: Math.tan(spread) * HALF_RADIUS * metres * 100 })),
    emptyMag: replica.magSize / replica.fireRate,
    fireRate: replica.fireRate,
    magSize: replica.magSize,
    mags: replica.mags,
    reload: replica.reloadTime,
    draw: replica.drawTime,
    spreadDeg: replica.spreadDeg,
    recoilDeg: replica.recoilDeg,
  };
}
