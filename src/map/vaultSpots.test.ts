import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { VAULT, VAULT_WALL_HEIGHT, VAULT_WALL_MAX_DEPTH } from '../config/vault';
import { buildNavGrid, createNavSearch, findPath, nodeX, nodeZ } from '../nav/navGrid';
import { buildVaultLinks } from '../nav/vaultLinks';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { createVaultState, planVault } from '../sim/vault';
import { type Vec3, vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import type { MapBlock, MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { RANGE_MAP } from './range';
import { WOODLAND } from './woodland';

/**
 * The maps' low walls built to be vaulted (M102, owner 2026-10-12: "a few added to the maps where they open a route"):
 * Depot's office hall, Woodland's cabin, the Capsules' front on Neon Heights, and the range's sandbags for the tutorial.
 * Each is found from the map (a wall no deeper than VAULT_WALL_MAX_DEPTH with a floor each side VAULT_WALL_HEIGHT under
 * its top), vaulted both ways in the planner and through Rapier, linked for the bots, and saves a walk round.
 */

const DT = 1 / 60;
const R = BODY.radius;
/** Where a body stands to vault: this far from the wall's face to its middle (inside a standstill's reach). */
const STAND_OFF = R + 0.25;
/** Each wall's floors may differ this much from VAULT_WALL_HEIGHT under its top (Woodland's ground slopes). */
const HEIGHT_SLACK = 0.03;
/** A route over the wall at least this much shorter than the walk round (m): it opens a way. */
const SAVES = 5;

interface Spot {
  block: MapBlock;
  /** The two places a body stands to vault it (feet), and the way from each to the other (unit, on the ground plane). */
  sides: [Vec3, Vec3];
  way: [number, number];
}

function rays(map: MapData): WorldQuery {
  const level = buildLevelRay(map.blocks, PHYSICS.rayGridCell, map.terrain ?? null);
  return { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) };
}

/** The map's vault walls, with where to stand each side. */
function vaultSpots(map: MapData): Spot[] {
  const q = rays(map);
  const out: Spot[] = [];
  for (const block of map.blocks) {
    if (block.kind === 'floor' || block.kind === 'ramp') continue;
    const alongX = block.size.x <= block.size.z;
    const depth = alongX ? block.size.x : block.size.z;
    if (depth > VAULT_WALL_MAX_DEPTH + 1e-6) continue;
    const top = block.center.y + block.size.y / 2;
    const off = depth / 2 + STAND_OFF;
    const sides = [-1, 1].map((s) => {
      const x = block.center.x + (alongX ? s * off : 0);
      const z = block.center.z + (alongX ? 0 : s * off);
      const d = q.raycastStatic(vec3(x, top + 0.5, z), vec3(0, -1, 0), 3);
      return d < 0 ? null : vec3(x, top + 0.5 - d + PHYSICS.groundRestGap, z);
    });
    if (!sides[0] || !sides[1]) continue;
    const under = (p: Vec3) => top - (p.y - PHYSICS.groundRestGap);
    if (sides.some((p) => Math.abs(under(p!) - VAULT_WALL_HEIGHT) > HEIGHT_SLACK)) continue;
    out.push({ block, sides: [sides[0], sides[1]], way: alongX ? [1, 0] : [0, 1] });
  }
  return out;
}

const MAPS: [string, MapData][] = [
  ['Depot', DEPOT],
  ['Woodland', WOODLAND],
  ['Neon Heights', NEON_HEIGHTS],
  ['Practice range', RANGE_MAP],
];

describe('vault walls on the maps (M102)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const [name, map] of MAPS) {
    describe(name, () => {
      const spots = vaultSpots(map);

      it('has one, thinner than a body, and the planner vaults it both ways from a standstill', () => {
        expect(spots).toHaveLength(1);
        const q = rays(map);
        for (const { block, sides, way } of spots) {
          expect(Math.min(block.size.x, block.size.z)).toBeLessThan(2 * R);
          const plan = createVaultState();
          expect(planVault(sides[0], way[0], way[1], 0, VAULT, BODY, q, plan), 'one way').toBe(true);
          expect(planVault(sides[1], -way[0], -way[1], 0, VAULT, BODY, q, plan), 'the other way').toBe(true);
        }
      });

      it('opens a way: over it is much shorter than round it, and the bots have a link over it each way', () => {
        const nav = buildNavGrid(map, NAV);
        const q = rays(map);
        nav.vaults = buildVaultLinks(nav, q, BODY, MOVEMENT, BOTS.vaultPrice);
        const length = (from: Vec3, route: readonly Vec3[]) => {
          let len = 0;
          let a = from;
          for (const b of route) {
            len += Math.hypot(b.x - a.x, b.z - a.z);
            a = b;
          }
          return len;
        };
        for (const { sides } of spots) {
          const [a, b] = sides;
          const search = createNavSearch(nav);
          const round: Vec3[] = [];
          expect(findPath(nav, search, a, b, NAV.snap, round, NAV.legProbe), 'a way round').toBe(true);
          search.vaults = true;
          const over: Vec3[] = [];
          expect(findPath(nav, search, a, b, NAV.snap, over, NAV.legProbe)).toBe(true);
          // The range's sandbags stand in the open for the tutorial: no way to open there.
          if (map !== RANGE_MAP) expect(length(a, round) - length(a, over), 'saved by vaulting').toBeGreaterThan(SAVES);
          else expect(length(a, over)).toBeLessThan(length(a, round));
        }
        // A link from a node by the wall to a node past it, each way, across the wall's middle within its length.
        for (const { block, way } of spots) {
          const links = nav.vaults!;
          const at = (k: number) => [nodeX(nav, k), nodeZ(nav, k)] as const;
          const ways = new Set<number>();
          for (let k = 0; k + 1 < links.start.length; k++) {
            for (let l = links.start[k]!; l < links.start[k + 1]!; l++) {
              const [fx, fz] = at(k);
              const [tx, tz] = at(links.to[l]!);
              const across = way[0] ? [fx - block.center.x, tx - block.center.x] : [fz - block.center.z, tz - block.center.z];
              const along = way[0] ? [fz - block.center.z, block.size.z / 2] : [fx - block.center.x, block.size.x / 2];
              if (across[0]! * across[1]! < 0 && Math.abs(along[0]!) < along[1]!) ways.add(Math.sign(across[1]!));
            }
          }
          expect([...ways].sort(), 'linked each way').toEqual([-1, 1]);
        }
      });

      // Nothing else on a match map is vaulted (owner, 2026-10-12: crouch cover stays peek-only): no crouch cover, not even
      // a log on a slope, low from its uphill side (the critic's find on Woodland's Knoll, M102). The range's tables and
      // props are no match's business.
      if (map !== RANGE_MAP) {
        it("links nothing else: every vault link on the map goes over its vault wall", () => {
          const nav = buildNavGrid(map, NAV);
          const links = buildVaultLinks(nav, rays(map), BODY, MOVEMENT, BOTS.vaultPrice);
          const stray: string[] = [];
          for (let k = 0; k + 1 < links.start.length; k++) {
            for (let l = links.start[k]!; l < links.start[k + 1]!; l++) {
              const mx = (nodeX(nav, k) + nodeX(nav, links.to[l]!)) / 2;
              const mz = (nodeZ(nav, k) + nodeZ(nav, links.to[l]!)) / 2;
              const over = spots.some(({ block: b }) => Math.abs(mx - b.center.x) <= b.size.x / 2 + NAV.cell && Math.abs(mz - b.center.z) <= b.size.z / 2 + NAV.cell);
              if (!over) stray.push(`${mx.toFixed(1)},${mz.toFixed(1)}`);
            }
          }
          expect(stray, 'links away from the vault wall').toEqual([]);
          expect(links.to.length).toBeGreaterThan(0);
        });
      }

      it('is vaulted through Rapier both ways, walking up and pressing Jump, landing clear on the far side', () => {
        for (const { block, sides, way } of spots) {
          for (const s of [0, 1] as const) {
            const world = new PhysicsWorld(map, BODY, DT);
            const nav = buildNavGrid(map, NAV);
            const ctx = createSimContext({ mover: world, query: world, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: map.killY, hits: HITS, deadZones: map.deadZones, rounds: ROUNDS, nav, navSnap: NAV.snap });
            const state = createGameState(1, 16, ROUNDS);
            const dir = s === 0 ? 1 : -1;
            const start = sides[s];
            // A step further back, so it walks into reach.
            const player = createCharacter(0, vec3(start.x - way[0] * dir * 0.6, start.y, start.z - way[1] * dir * 0.6), 0, undefined, 0);
            const other = createCharacter(1, vec3(map.deadZones[1][0]!.position.x, map.deadZones[1][0]!.position.y + PHYSICS.groundRestGap, map.deadZones[1][0]!.position.z), 0, undefined, 1);
            state.characters.push(player, other);
            world.addCharacter(player);
            world.addCharacter(other);
            const cmd = createCommand();
            // Yaw 0 looks down -z; facing (wx, wz) is yaw atan2(-wx, -wz).
            cmd.yaw = Math.atan2(-way[0] * dir, -way[1] * dir);
            cmd.forward = 1;
            let vaulted = false;
            for (let t = 0; t < 120; t++) {
              const face = Math.abs((way[0] ? player.position.x - block.center.x : player.position.z - block.center.z)) - Math.min(block.size.x, block.size.z) / 2 - R;
              cmd.jump = !vaulted && face < 0.3;
              stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
              if (player.vault.active) vaulted = true;
              if (vaulted && !player.vault.active && player.grounded) break;
            }
            const past = way[0] ? (player.position.x - block.center.x) * dir : (player.position.z - block.center.z) * dir;
            expect(vaulted, `${name} side ${s}: vaulted`).toBe(true);
            expect(past, `${name} side ${s}: on the far side`).toBeGreaterThan(Math.min(block.size.x, block.size.z) / 2 + R);
            expect(Math.abs(player.position.y - sides[1 - s]!.y), `${name} side ${s}: on the far floor`).toBeLessThan(0.1);
            world.dispose();
          }
        }
      });
    });
  }
});
