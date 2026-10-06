import { describe, expect, it } from 'vitest';
import { EXTRACTION, homeTeamCap } from '../config/extraction';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid, createNavSearch, findPath, floorAt, isWalkableAt } from '../nav/navGrid';
import { placeCases, rollRunCases } from '../pool/caches';
import { GAME_POOL } from '../pool/gamePool';
import { createCharacter } from '../sim/character';
import { caseInReach, createRunState, exitClosedFor, pickOpponentStarts, type RunSight } from '../sim/extraction';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { createRng } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { MAPS, mapData } from './maps';
import { modeOffered, playableMode } from './playableMode';

/** The biggest squad (a trio). */
const MAX_SQUAD = EXTRACTION.maxSquad;
/** Share of an exit's disc that must be walkable, so you can stand anywhere in it, give or take a corner. */
const EXIT_WALKABLE = 0.7;
/** Where you stand to open a case: in front of it, an arm's length off (as the bot runner does, RUNNER_PLAN.standOff). */
const CASE_FRONT = 0.9;
/** The grid (m) the reach round a case is walked on, for the spots it can't be opened from. */
const REACH_STEP = 0.1;

describe('Extraction map data (M43)', () => {
  for (const { id, label } of MAPS) {
    const map = mapData(id);
    const x = map.extraction;
    if (!x) continue;
    const nav = buildNavGrid(map, NAV);
    /** The biggest home team a run starts with: a full squad against the level with the most opponents (M72, BAL-03). */
    const most = Math.max(...Object.keys(EXTRACTION.opponentsByLevel).map((level) => homeTeamCap(x.baseOpponents, MAX_SQUAD, level as keyof typeof EXTRACTION.opponentsByLevel)));
    describe(label, () => {
      it('has walkable insertions for a full squad, starts for the most opponents, and exits you can stand in', () => {
        for (const ins of x.insertions) {
          expect(ins.spawns.length, ins.name).toBeGreaterThanOrEqual(MAX_SQUAD);
          for (const s of ins.spawns) expect(isWalkableAt(nav, s.position.x, s.position.y, s.position.z), ins.name).toBe(true);
        }
        expect(x.opponentStarts.length).toBeGreaterThanOrEqual(most);
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
          for (const s of pickOpponentStarts(x.opponentStarts, ins.spawns, most)) {
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

      it('opens every case spot from in front of it, and refuses it from the far side of a wall in reach (M55, audit SIM-02)', () => {
        const level = buildLevelRay(map.blocks, PHYSICS.rayGridCell, map.terrain ?? null);
        const sight: RunSight = { query: { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) }, body: BODY };
        const run = createRunState();
        const you = createCharacter(0, vec3(), 0, LOADOUT, 0);
        const standAt = (x: number, y: number, z: number) => {
          you.position.x = x;
          you.position.y = y;
          you.position.z = z;
        };
        let refused = 0;
        for (const c of x.cases) {
          const at = JSON.stringify(c.position);
          run.cases = [{ kind: c.kinds[0]!, name: 'case', position: c.position, yaw: c.yaw, openTime: 1, heard: 0, finds: [], open: false, dropped: false }];
          // In front: the nearest walkable spot out from its front, an arm's length off at most.
          let front = false;
          for (let d = CASE_FRONT; d > 0 && !front; d -= nav.cell) {
            const fx = c.position.x - Math.sin(c.yaw) * d;
            const fz = c.position.z - Math.cos(c.yaw) * d;
            if (!isWalkableAt(nav, fx, c.position.y, fz)) continue;
            standAt(fx, floorAt(nav, fx, c.position.y, fz), fz);
            front = caseInReach(run, you, EXTRACTION, sight) === 0;
          }
          expect(front, `${at} from its front`).toBe(true);
          // Every walkable spot in reach on its floor: the line of sight decides, and the far side of a wall is refused.
          for (let dx = -EXTRACTION.caseReach; dx <= EXTRACTION.caseReach; dx += REACH_STEP) {
            for (let dz = -EXTRACTION.caseReach; dz <= EXTRACTION.caseReach; dz += REACH_STEP) {
              const px = c.position.x + dx;
              const pz = c.position.z + dz;
              if (Math.hypot(dx, dz) > EXTRACTION.caseReach || !isWalkableAt(nav, px, c.position.y, pz)) continue;
              standAt(px, floorAt(nav, px, c.position.y, pz), pz);
              if (caseInReach(run, you, EXTRACTION) === 0 && caseInReach(run, you, EXTRACTION, sight) < 0) refused++;
            }
          }
        }
        // Neon Heights' partitions are thin: a case in an office is in reach from the corridor (Depot and Woodland only
        // have a corner or two).
        if (id === 'neonHeights') expect(refused).toBeGreaterThan(100);
      });

      it('can be walked to from every insertion to every case spot (M44)', () => {
        const search = createNavSearch(nav);
        const out: Vec3[] = [];
        for (const ins of x.insertions) {
          for (const c of x.cases) expect(findPath(nav, search, ins.spawns[0]!.position, c.position, NAV.snap, out), `${ins.name} to ${JSON.stringify(c.position)}`).toBe(true);
        }
      });

      it('rolls every run one marshal’s locker and each other kind within its pool.md count, on distinct spots of the map (M44)', () => {
        const at = new Set(x.cases.map((c) => JSON.stringify(c.position)));
        for (let seed = 0; seed < 200; seed++) {
          const run = rollRunCases(GAME_POOL, x.cases, {}, seed);
          expect(run.filter((c) => c.kind === 'locker'), `seed ${seed}`).toHaveLength(1);
          for (const k of GAME_POOL.caseKinds) {
            const n = run.filter((c) => c.kind === k.key).length;
            expect(n, `${k.key} seed ${seed}`).toBeGreaterThanOrEqual(k.count.min);
            expect(n, `${k.key} seed ${seed}`).toBeLessThanOrEqual(k.count.max);
          }
          const places = run.map((c) => JSON.stringify(c.position));
          expect(new Set(places).size).toBe(places.length);
          for (const p of places) expect(at.has(p)).toBe(true);
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
