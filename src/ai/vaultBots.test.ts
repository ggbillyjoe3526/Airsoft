import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildNavGrid, createNavSearch, findPath } from '../nav/navGrid';
import { buildVaultLinks } from '../nav/vaultLinks';
import { initPhysics } from '../physics/physicsWorld';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { teamEnd } from '../sim/round';
import type { WorldQuery } from '../sim/armament';
import { type Vec3, vec3 } from '../sim/vec';
import { expectGrounded, playMatch } from './depotMatchSupport';

/**
 * Bots vault (M102): their routes go over a low obstacle where that saves enough walking (nav/vaultLinks.ts), and they
 * press Jump there as a player would. A field split by a long wall with a way round at its north end.
 */
function field(wallHeight: number): MapData {
  const blocks: MapBlock[] = [
    { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 26) },
    // The wall from the south edge to 2.5 m short of the north one: the way round is up there.
    { kind: 'wall', center: vec3(0, wallHeight / 2, -1.25), size: vec3(0.4, wallHeight, 23.5) },
    // A shelter at each end, so the hider there isn't seen before the wall is crossed.
    { kind: 'wall', center: vec3(-14, 1.5, -6), size: vec3(0.4, 3, 6) },
    { kind: 'wall', center: vec3(14, 1.5, -6), size: vec3(0.4, 3, 6) },
  ];
  const line = (x: number, yaw: number) => [-8, -6, -4].map((z) => ({ position: vec3(x, 0, z), yaw }));
  const dead = (x: number) => [9, 10, 11].map((z) => ({ position: vec3(x, 0, z), yaw: 0 }));
  return {
    name: 'vault field',
    blocks,
    killY: -10,
    spawns: [line(-17, -Math.PI / 2), line(17, Math.PI / 2)],
    deadZones: [dead(-18), dead(18)],
    lanes: [[vec3(-17, 0, -9), vec3(-6, 0, -6), vec3(6, 0, -6), vec3(17, 0, -9)]],
  };
}

/** Blue (the hider) stands at its own end in round 1, behind the shelter; the bots start at the other. */
const HIDER = vec3(teamEnd(0, 'elimination', 1, ROUNDS) === 0 ? -17 : 17, 0, -6);

function rays(map: MapData): WorldQuery {
  const level = buildLevelRay(map.blocks);
  return { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) };
}

const routeLength = (from: Vec3, route: readonly Vec3[]): number => {
  let len = 0;
  let a = from;
  for (const b of route) {
    len += Math.hypot(b.x - a.x, b.z - a.z);
    a = b;
  }
  return len;
};

describe('vault links (M102)', () => {
  it('link a low wall where a body can vault it, and nothing taller or shorter', () => {
    for (const [h, linked] of [
      [0.85, true],
      [0.6, true],
      [1.2, false],
      [0.4, false],
    ] as const) {
      const map = field(h);
      const nav = buildNavGrid(map, NAV);
      const links = buildVaultLinks(nav, rays(map), BODY, MOVEMENT, BOTS.vaultPrice);
      expect(links.to.length > 0, `${h} m`).toBe(linked);
    }
  });

  it('take a bot\'s route over the wall where that saves the walk round, and only a route that asks for vaults', () => {
    const map = field(0.85);
    const nav = buildNavGrid(map, NAV);
    nav.vaults = buildVaultLinks(nav, rays(map), BODY, MOVEMENT, BOTS.vaultPrice);
    const from = vec3(6, 0, -6);
    const to = vec3(-6, 0, -6);
    const onFoot: Vec3[] = [];
    const search = createNavSearch(nav);
    expect(findPath(nav, search, from, to, NAV.snap, onFoot, NAV.legProbe)).toBe(true);
    search.vaults = true;
    const over: Vec3[] = [];
    expect(findPath(nav, search, from, to, NAV.snap, over, NAV.legProbe)).toBe(true);
    // Round the north end on foot (about 40 m), straight over with a vault (12 m).
    expect(routeLength(from, onFoot)).toBeGreaterThan(30);
    expect(routeLength(from, over)).toBeLessThan(15);
    // Near the wall, going round is shorter than a vault's price: no vault.
    const north = vec3(1.5, 0, 9.8);
    const round: Vec3[] = [];
    expect(findPath(nav, search, north, vec3(-1.5, 0, 9.8), NAV.snap, round, NAV.legProbe)).toBe(true);
    expect(round.every((p) => p.z > 10.5 || Math.abs(p.x) > 0.5)).toBe(true);
    expect(round.some((p) => p.z > 10.5)).toBe(true);
  });
});

describe('bots vault (M102)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('go over a low wall on their way, and never over crouch cover', () => {
    const hider = HIDER;
    const low = playMatch(14, 3, hider, BOTS, 'elimination', undefined, field(0.85), 3);
    expect(low.vaults).toBeGreaterThan(0);
    expect(low.farthestFromSpawn.slice(1).some((d) => d > 20)).toBe(true);
    // Nobody hangs in the air, sinks or ends up on the wall (a vault's own time off the ground aside).
    expectGrounded(low, field(0.85));
    const cover = playMatch(14, 3, hider, BOTS, 'elimination', undefined, field(1.2), 3);
    expect(cover.vaults).toBe(0);
  });
});
