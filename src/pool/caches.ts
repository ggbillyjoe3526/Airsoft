import { createRng, rngNext, type RngState } from '../sim/rng';
import type { CaseFind, CaseSetup } from '../sim/extraction';
import type { Vec3 } from '../sim/vec';
import type { Pool } from './pool';
import type { CaseKind, NumberRange } from './tables';

/**
 * Extraction's cases (M44): pool.md's Caches table (one row per kind of case: how many a run places, how long one takes
 * to open, how far it is heard and the XP it holds) and the seeded roll that places a run's cases on a map's case spots
 * and fills them. The numbers are the owner's to tune in pool.md; the table is read, and the defaults for any the file
 * is missing are kept, in tables.ts.
 */

/** A place a case can stand on a map (map data), and the kinds of case it suits (pool.md Keys). */
export interface CaseSpotLike {
  position: Vec3;
  yaw: number;
  kinds: readonly string[];
}

/** A whole number in `r`, inclusive. */
function rollRange(r: NumberRange, rng: RngState): number {
  return r.min + Math.min(r.max - r.min, Math.floor(rngNext(rng) * (r.max - r.min + 1)));
}

/**
 * Which spot gets which kind of case (M44): the kinds the fewest spots suit first (the locker), each placing its rolled
 * number on free spots that suit it, picked at random; a kind runs out quietly when its spots do (map data tests
 * check every map has room for each kind's most). Pure.
 */
export function placeCases(kinds: readonly CaseKind[], spots: readonly CaseSpotLike[], rng: RngState): { spot: number; kind: CaseKind }[] {
  const suits = (k: CaseKind): number => spots.filter((s) => s.kinds.includes(k.key)).length;
  const order = [...kinds].sort((a, b) => suits(a) - suits(b));
  const used = new Set<number>();
  const out: { spot: number; kind: CaseKind }[] = [];
  for (const kind of order) {
    const want = rollRange(kind.count, rng);
    const free: number[] = [];
    spots.forEach((s, i) => {
      if (!used.has(i) && s.kinds.includes(kind.key)) free.push(i);
    });
    for (let n = 0; n < want && free.length > 0; n++) {
      const spot = free.splice(Math.floor(rngNext(rng) * free.length), 1)[0]!;
      used.add(spot);
      out.push({ spot, kind });
    }
  }
  return out.sort((a, b) => a.spot - b.spot);
}

/** What one case holds (LV1): its XP, or a BB resupply instead, on its chance. Gear is never found: levels unlock it. */
export function rollFind(kind: CaseKind, rng: RngState): CaseFind {
  const resupply = rngNext(rng) < kind.resupplyChance;
  const xp = rollRange(kind.xp, rng);
  return { xp: resupply ? 0 : xp, resupply };
}

/**
 * A run's cases (M44), from its seed: placed on the map's spots and filled from pool.md's Caches table. The same seed
 * gives the same run. Pure.
 */
export function rollRunCases(pool: Pool, spots: readonly CaseSpotLike[], seed: number): CaseSetup[] {
  const rng = createRng(seed);
  return placeCases(pool.caseKinds, spots, rng).map(({ spot, kind }) => {
    const s = spots[spot]!;
    return {
      kind: kind.key,
      name: kind.name,
      position: { x: s.position.x, y: s.position.y, z: s.position.z },
      yaw: s.yaw,
      openTime: kind.openTime,
      heard: kind.heard,
      find: rollFind(kind, rng),
    };
  });
}
