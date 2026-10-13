import { handlingOf } from '../config/attachments';
import { KIT_RANGE_SLACK, REPLICA_RANGES } from '../config/contentRules';
import type { ItemRef } from '../pool/item';
import { EMPTY_FIT, FIT_CATEGORY, FIT_SLOTS, type FitSlot, kitSlot, type ReplicaFit, uncappedEnergy } from '../pool/kit';
import { type Asset, fits, hasBuiltInPower, type Pool } from '../pool/pool';
import { num } from './checks';

/**
 * The compatibility grid (CT1): every combination of parts a replica can wear, worked through the game's own kit maths (pool/kit.ts kitSlot, config/attachments.ts handlingOf). It
 * finds numbers that break (a zero or negative reload, an endless spread) or run away together, and energy past the
 * site limit. Pure.
 */

/**
 * Above this many combinations a replica's grid tries this many of them, spread over the whole grid (said in the
 * result), so a long parts list stays quick.
 */
export const GRID_LIMIT = 100_000;

/** A step through `n` combinations that visits every one before repeating (a prime that shares no factor with `n`). */
function coprimeStep(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let step = 7919;
  while (gcd(step, n) !== 1) step += 2;
  return step;
}

/** One fitted kit's carried numbers. */
export interface KitNumbers {
  muzzleEnergy: number;
  energyLimit: number;
  fireRate: number;
  spreadDeg: number;
  reloadTime: number;
  drawTime: number;
  magSize: number;
  mags: number;
  raiseScale: number;
  shakeScale: number;
}

/** A combination that broke a number or ran past its range: what was fitted, and what went wrong. */
export interface GridProblem {
  /** The parts fitted (their pool IDs), for a part's own check to find the kits it is in. */
  parts: readonly string[];
  /** The fit in words: "AEG Rifle with Hi-Cap Magazine, Long Barrel". */
  fit: string;
  says: string;
  severity: 'fail' | 'warn';
}

export interface GridResult {
  combinations: number;
  /** How many were tried: all of them, or GRID_LIMIT spread over the grid. */
  tried: number;
  problems: GridProblem[];
  /** The most energy any kit would shoot before the site limit stops it (J), and the limit. */
  strongest: { uncapped: number; limit: number; fit: string };
}

/** The parts that fit `replica` in each slot (and "as it comes", except the power slot of a replica that needs one). */
export function slotChoices(pool: Pool, replica: Asset): Record<FitSlot, (Asset | null)[]> {
  const out = {} as Record<FitSlot, (Asset | null)[]>;
  for (const slot of FIT_SLOTS) {
    const parts = pool.assets.filter((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
    out[slot] = slot === 'power' && !hasBuiltInPower(replica) && parts.length > 0 ? parts : [null, ...parts];
  }
  return out;
}

/** The carried numbers of `item` with `fit`. */
export function kitNumbers(pool: Pool, item: ItemRef, fit: ReplicaFit): KitNumbers {
  const slot = kitSlot(pool, item, fit);
  const h = handlingOf(slot.replica, slot.parts);
  return {
    muzzleEnergy: slot.replica.muzzleEnergy,
    energyLimit: slot.replica.energyLimit,
    fireRate: slot.replica.fireRate,
    spreadDeg: slot.replica.spreadDeg,
    reloadTime: h.reloadTime,
    drawTime: h.drawTime,
    magSize: h.magSize,
    mags: h.mags,
    raiseScale: h.raiseScale,
    shakeScale: h.shakeScale,
  };
}

/** The ranged numbers a kit is held to, with the slack a kit gets past its class's range. */
const KIT_RANGED = ['fireRate', 'spreadDeg', 'reloadTime', 'drawTime', 'magSize', 'mags'] as const;

/** Grids already worked out, by pool and replica (a replica's and each of its parts' checks read the same one). */
const GRIDS = new WeakMap<Pool, Map<string, GridResult>>();

/** The grid for one replica asset of site class `siteClass` (stats.md's Class), worked out once per pool. */
export function kitGrid(pool: Pool, replica: Asset, siteClass: string): GridResult {
  let byReplica = GRIDS.get(pool);
  if (!byReplica) GRIDS.set(pool, (byReplica = new Map()));
  const key = `${replica.id}|${siteClass}`;
  let grid = byReplica.get(key);
  if (!grid) byReplica.set(key, (grid = workOutGrid(pool, replica, siteClass)));
  return grid;
}

function workOutGrid(pool: Pool, replica: Asset, siteClass: string): GridResult {
  const choices = slotChoices(pool, replica);
  const slots = FIT_SLOTS.filter((s) => choices[s].length > 0);
  const options = slots.map((s) => choices[s]);
  let combinations = 1;
  for (const o of options) combinations *= o.length;
  const tried = Math.min(combinations, GRID_LIMIT);
  const step = tried < combinations ? coprimeStep(combinations) : 1;
  const ranges = REPLICA_RANGES[siteClass];
  const problems: GridProblem[] = [];
  const seen = new Set<string>();
  let strongest = { uncapped: 0, limit: Number.POSITIVE_INFINITY, fit: '' };
  const index = new Array<number>(options.length).fill(0);
  for (let i = 0; i < tried; i++) {
    // Decode combination n: each slot's choice in turn.
    let rest = (i * step) % combinations;
    for (let slot = 0; slot < options.length; slot++) {
      index[slot] = rest % options[slot]!.length;
      rest = Math.floor(rest / options[slot]!.length);
    }
    const fit: ReplicaFit = { ...EMPTY_FIT };
    const fitted: Asset[] = [];
    slots.forEach((s, slot) => {
      const pick = options[slot]![index[slot]!];
      if (pick) {
        fit[s] = { asset: pick.id };
        fitted.push(pick);
      }
    });
    const item = { asset: replica.id };
    const k = kitNumbers(pool, item, fit);
    const words = `${replica.name}${fitted.length ? ` with ${fitted.map((f) => f.name).join(', ')}` : ', as it comes'}`;
    const parts = fitted.map((f) => f.id);
    const add = (severity: 'fail' | 'warn', says: string, key: string): void => {
      // One problem of each kind per set of parts.
      const id = `${severity}|${key}|${parts.join(',')}`;
      if (seen.has(id)) return;
      seen.add(id);
      problems.push({ parts, fit: words, says, severity });
    };
    for (const [name, v] of Object.entries(k)) {
      if (!Number.isFinite(v) || v <= 0) add('fail', `${name} is ${num(v, 3)}: a number broke`, `broken.${name}`);
    }
    if (k.muzzleEnergy > k.energyLimit + 1e-9) add('fail', `energy ${num(k.muzzleEnergy, 3)} J is past the site limit of ${num(k.energyLimit)} J`, 'limit');
    if (ranges) {
      for (const stat of KIT_RANGED) {
        const r = ranges[stat];
        const v = k[stat];
        if (v < r.min * (1 - KIT_RANGE_SLACK) || v > r.max * (1 + KIT_RANGE_SLACK)) add('warn', `${stat} ${num(v, 3)} runs well past the normal ${num(r.min)} to ${num(r.max)}`, `range.${stat}`);
      }
    }
    const e = uncappedEnergy(pool, item, fit);
    if (e > strongest.uncapped) strongest = { uncapped: e, limit: k.energyLimit, fit: words };
  }
  return { combinations, tried, problems, strongest };
}
