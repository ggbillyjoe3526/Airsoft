import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, type BotConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { NAV } from '../config/nav';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { buildNavGrid, type NavGrid, nodeAt } from '../nav/navGrid';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import { playMatch } from './depotMatchSupport';

/**
 * M87 (playtest note 15: "bots will go to areas that are obviously empty (corners for example)"): hunting bots skip
 * spots their team has seen empty lately. Measured against the bots as they were (huntClearRange 0: only where someone
 * stood counted, and a check never went stale), on the same seeds, in Elimination on Depot and Neon Heights.
 */

/** A dead end: a walkable spot whose open ways out, each clear for DEAD_END_REACH m, all lie within one quarter turn. */
const DIRECTIONS = 16;
const DEAD_END_REACH = 3;
const DEAD_END_ARC = 5; // of the 16 directions: 90°
/** A way out keeps to its floor: no step up or down of more than this (m) on the way. */
const SAME_FLOOR = 0.6;
/** Nodes are looked up this far (m) over the floor in question, so a floor above isn't picked. */
const LOOK_ABOVE = 0.5;
/** A visit: a hunting bot that stays this long (s) within VISIT_RADIUS (m) of where it stepped into a dead end. */
const VISIT_TIME = 1;
const VISIT_RADIUS = 2;
/**
 * Seeds per map. Neon Heights' hunters seldom stopped in a dead end even before M87: after the lean-spot yield
 * (2026-10-11, botMovement teammatePassing) seeds 1-6 read 0 against 0, seeds 1-16 7 against 1 (Depot 20 against 1).
 * Depot's six seeds read 0 against 0 once the holstered run went to 5.4 m/s (MV2; 10 seeds 2 against 1, 16 seeds 5
 * against 1), so Depot runs 16 too.
 */
const DEPOT_SEEDS = 16;
const NEON_SEEDS = 16;
const SECONDS = 200;

/** Before M87: no checking by eye, and what the team checked stays checked. */
const BEFORE: BotConfig = { ...BOTS, huntClearRange: 0, huntMemory: Number.POSITIVE_INFINITY };

/** Per nav node: 1 where it is a dead end (a pocket or a corner, not a corridor, which opens two ways). */
function deadEnds(g: NavGrid): Uint8Array {
  const out = new Uint8Array(g.walkable.length);
  const open: boolean[] = [];
  for (let k = 0; k < g.walkable.length; k++) {
    if (!g.walkable[k]) continue;
    const c = g.nodeCell[k]!;
    const x = g.minX + ((c % g.cols) + 0.5) * g.cell;
    const z = g.minZ + (Math.floor(c / g.cols) + 0.5) * g.cell;
    const y = g.floorY[k]!;
    for (let d = 0; d < DIRECTIONS; d++) {
      const a = (d / DIRECTIONS) * Math.PI * 2;
      open[d] = true;
      for (let s = g.cell; s <= DEAD_END_REACH && open[d]; s += g.cell) {
        const n = nodeAt(g, x + Math.cos(a) * s, y + LOOK_ABOVE, z + Math.sin(a) * s);
        open[d] = n >= 0 && g.walkable[n] === 1 && Math.abs(g.floorY[n]! - y) <= SAME_FLOOR;
      }
    }
    if (!open.includes(true)) continue;
    for (let from = 0; from < DIRECTIONS; from++) {
      if (open.every((o, d) => !o || (d - from + DIRECTIONS) % DIRECTIONS < DEAD_END_ARC)) {
        out[k] = 1;
        break;
      }
    }
  }
  return out;
}

/** Dead-end visits by hunting bots over `seeds` matches. */
function visits(map: MapData, teamSize: number, seeds: number, cfg: BotConfig): number {
  const nav = buildNavGrid(map, NAV);
  const dead = deadEnds(nav);
  let count = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const entered = new Map<number, { t: number; x: number; z: number; counted: boolean }>();
    playMatch(SECONDS, seed, undefined, cfg, 'elimination', ROUNDS, map, teamSize, undefined, (state, controller) => {
      for (const b of controller.bots) {
        const c = b.character;
        const n = nodeAt(nav, c.position.x, c.position.y + LOOK_ABOVE, c.position.z);
        if (!isInPlay(c) || state.round.phase !== 'live' || b.mode !== 'advance' || !b.hunting || n < 0 || dead[n] !== 1) {
          entered.delete(c.id);
          continue;
        }
        const e = entered.get(c.id);
        if (!e) entered.set(c.id, { t: state.time, x: c.position.x, z: c.position.z, counted: false });
        else if (!e.counted && state.time - e.t >= VISIT_TIME && Math.hypot(c.position.x - e.x, c.position.z - e.z) <= VISIT_RADIUS) {
          e.counted = true;
          count++;
        }
      }
    });
  }
  return count;
}

describe('hunting bots skip what their team has seen empty (M87, playtest notes 15 and 19)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it.each([
    ['Depot', DEPOT, 3, DEPOT_SEEDS],
    ['Neon Heights', NEON_HEIGHTS, 4, NEON_SEEDS],
  ] as const)('on %s, hunting bots stop in dead ends less often than before M87', { timeout: 240_000 }, (_name, map, size, seeds) => {
    const before = visits(map, size, seeds, BEFORE);
    const now = visits(map, size, seeds, BOTS);
    // The measure is not blind: before M87 they did stop in dead ends.
    expect(before).toBeGreaterThan(0);
    expect(now).toBeLessThan(before);
  });
});
