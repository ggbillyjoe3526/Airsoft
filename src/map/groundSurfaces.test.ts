import { describe, expect, it } from 'vitest';
import { DEPOT } from './depot';
import { buildGroundGrid, groundAt, groundUnderTrees } from './groundSurfaces';
import type { MapData } from './mapTypes';
import { WOODLAND, WOODLAND_LAYOUT } from './woodland';

describe('the ground grid (M33i: one grid the ground is drawn from and M33j’s footsteps read)', () => {
  it('is null for a map without MapData.ground (Depot)', () => {
    expect(buildGroundGrid(DEPOT)).toBeNull();
  });

  const grid = buildGroundGrid(WOODLAND)!;
  const patches = WOODLAND.ground!.patches;

  it('lays gravel along the creek bed and earth on the tracks', () => {
    for (const surface of ['gravel', 'earth'] as const) {
      for (const p of patches.filter((q) => q.surface === surface && q.path && q.path.length > 1)) {
        const mid = p.path![Math.floor(p.path!.length / 2)]!;
        expect(groundAt(grid, mid.x, mid.z), `${surface} at ${mid.x}, ${mid.z}`).toBe(surface);
      }
    }
  });

  it('floors the cabin with wood, the fort and the camp fires’ clearings with earth, and leaves the spawns on grass', () => {
    const wood = patches.find((p) => p.surface === 'wood')!.box!;
    expect(groundAt(grid, (wood[0] + wood[1]) / 2, (wood[2] + wood[3]) / 2)).toBe('wood');
    const f = WOODLAND_LAYOUT.fort.inside;
    expect(groundAt(grid, (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2)).toBe('earth');
    for (const l of WOODLAND.lights!.filter((x) => x.kind === 'fire')) expect(groundAt(grid, l.position.x, l.position.z)).toBe('earth');
    for (const s of WOODLAND.spawns.flat()) expect(groundAt(grid, s.position.x, s.position.z)).toBe('grass');
  });

  it('puts leaf litter under the trees and grass on the open meadow', () => {
    const trees = WOODLAND.blocks.filter((b) => b.kind === 'tree');
    const under = trees.filter((t) => groundUnderTrees(grid, t.center.x, t.center.z));
    // Most trees stand where the trees close overhead (lone trees and the strip's edges may not).
    expect(under.length / trees.length).toBeGreaterThan(0.5);
    const leaves = under.filter((t) => groundAt(grid, t.center.x, t.center.z) === 'leaves');
    expect(leaves.length / under.length).toBeGreaterThan(0.8);
    // The meadow between the camp and the Knoll (plan 45, 47.5) is open grass.
    expect(groundAt(grid, 45 - WOODLAND_LAYOUT.halfX, WOODLAND_LAYOUT.halfZ - 47.5)).toBe('grass');
    expect(groundUnderTrees(grid, 45 - WOODLAND_LAYOUT.halfX, WOODLAND_LAYOUT.halfZ - 47.5)).toBe(false);
  });

  it('applies patches in order (a later one wins) and clamps past the edge', () => {
    const map: MapData = {
      ...DEPOT,
      ground: {
        base: 'grass',
        patches: [
          { surface: 'earth', box: [-5, 5, -5, 5] },
          { surface: 'gravel', path: [{ x: 0, z: 0 }], width: 2 },
        ],
      },
    };
    const g = buildGroundGrid(map)!;
    expect(groundAt(g, 0.2, 0.2)).toBe('gravel');
    expect(groundAt(g, 3.5, 3.5)).toBe('earth');
    expect(groundAt(g, 1e6, -1e6)).toBe(groundAt(g, g.minX + g.cols * g.cell - 0.5, g.minZ + 0.5));
  });

  it('looks a point up in O(1): one cell of the grid read, whatever its size, and nothing else', () => {
    for (const g of [grid, buildGroundGrid({ ...DEPOT, ground: { base: 'earth', patches: [] } })!]) {
      let reads = 0;
      const counted = new Proxy(g.surface, {
        get(target, key) {
          if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
          else if (key !== 'constructor') throw new Error(`groundAt touched surface.${String(key)}`);
          return Reflect.get(target, key) as unknown;
        },
      });
      const probe = { ...g, surface: counted as unknown as Uint8Array };
      for (const [x, z] of [[0, 0], [17.3, -9.1], [-1e5, 1e5]] as const) {
        reads = 0;
        groundAt(probe, x, z);
        expect(reads).toBe(1);
      }
    }
  });
});
