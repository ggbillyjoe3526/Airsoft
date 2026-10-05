import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { NAV } from '../config/nav';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { placeCases } from '../pool/caches';
import { GAME_POOL } from '../pool/gamePool';
import { exitClosedFor, pickOpponentStarts } from '../sim/extraction';
import { createRng } from '../sim/rng';
import { MAPS } from './maps';
import { modeOffered, playableMode } from './playableMode';

/** The biggest squad (a trio). */
const MAX_SQUAD = EXTRACTION.maxSquad;
/** Share of an exit's disc that must be walkable, so you can stand anywhere in it, give or take a corner. */
const EXIT_WALKABLE = 0.7;

describe('Extraction map data (M43)', () => {
  for (const { label, data: map } of MAPS) {
    const x = map.extraction;
    if (!x) continue;
    const nav = buildNavGrid(map, NAV);
    describe(label, () => {
      it('has walkable insertions for a full squad, starts for the most opponents, and exits you can stand in', () => {
        for (const ins of x.insertions) {
          expect(ins.spawns.length, ins.name).toBeGreaterThanOrEqual(MAX_SQUAD);
          for (const s of ins.spawns) expect(isWalkableAt(nav, s.position.x, s.position.y, s.position.z), ins.name).toBe(true);
        }
        expect(x.opponentStarts.length).toBeGreaterThanOrEqual(x.baseOpponents + MAX_SQUAD);
        for (const s of x.opponentStarts) expect(isWalkableAt(nav, s.position.x, s.position.y, s.position.z), JSON.stringify(s.position)).toBe(true);
        for (const e of x.exits) {
          let ok = 0;
          let all = 0;
          for (let dx = -e.radius; dx <= e.radius; dx += 0.5) {
            for (let dz = -e.radius; dz <= e.radius; dz += 0.5) {
              if (Math.hypot(dx, dz) > e.radius) continue;
              all++;
              if (isWalkableAt(nav, e.position.x + dx, e.position.y, e.position.z + dz)) ok++;
            }
          }
          expect(isWalkableAt(nav, e.position.x, e.position.y, e.position.z), e.name).toBe(true);
          expect(ok / all, e.name).toBeGreaterThanOrEqual(EXIT_WALKABLE);
        }
      });

      it('leaves every insertion an exit open from the start and a late one, none of them by the insertion', () => {
        for (const ins of x.insertions) {
          const open = x.exits.filter((e) => !exitClosedFor(e, ins.spawns, EXTRACTION.minExitDistance));
          expect(open.filter((e) => !e.late).length, ins.name).toBeGreaterThanOrEqual(1);
          expect(open.filter((e) => e.late).length, ins.name).toBeGreaterThanOrEqual(1);
        }
      });

      it('starts the home team well away from the squad', () => {
        for (const ins of x.insertions) {
          for (const s of pickOpponentStarts(x.opponentStarts, ins.spawns, x.baseOpponents + MAX_SQUAD)) {
            for (const sp of ins.spawns) expect(Math.hypot(s.position.x - sp.position.x, s.position.z - sp.position.z), ins.name).toBeGreaterThan(15);
          }
        }
      });

      it('has case spots on walkable floor, out of the exits, with room for every kind of case at its most (M44)', () => {
        const keys = GAME_POOL.caseKinds.map((k) => k.key);
        for (const c of x.cases) {
          const at = JSON.stringify(c.position);
          expect(isWalkableAt(nav, c.position.x, c.position.y, c.position.z), at).toBe(true);
          for (const k of c.kinds) expect(keys, at).toContain(k);
          for (const e of x.exits) expect(Math.hypot(c.position.x - e.position.x, c.position.z - e.position.z), at).toBeGreaterThan(e.radius + 1);
        }
        // Every kind at its most, whatever the seed: each still gets all it wants.
        const most = GAME_POOL.caseKinds.map((k) => ({ ...k, count: { min: k.count.max, max: k.count.max } }));
        for (let seed = 0; seed < 100; seed++) {
          const placed = placeCases(most, x.cases, createRng(seed));
          for (const k of most) expect(placed.filter((p) => p.kind.key === k.key).length, `${k.key} seed ${seed}`).toBe(k.count.max);
        }
      });

      it('is offered Extraction', () => {
        expect(playableMode(map, 'extraction')).toBe('extraction');
        expect(modeOffered(map, 'extraction')).toBe(true);
      });
    });
  }

  it('plays a map without Extraction data as Elimination, and keeps the other modes', () => {
    expect(playableMode({}, 'extraction')).toBe('elimination');
    expect(playableMode({}, 'attackDefend')).toBe('elimination');
    expect(playableMode({}, 'elimination')).toBe('elimination');
    // New game doesn't offer Extraction there at all; the other modes it offers on every map, as before.
    expect(modeOffered({}, 'extraction')).toBe(false);
    expect(modeOffered({}, 'attackDefend')).toBe(true);
    expect(modeOffered({}, 'elimination')).toBe(true);
  });
});
