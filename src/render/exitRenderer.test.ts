import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXIT_VISUALS as V } from '../config/render';
import { buildTerrain, terrainHeightAt } from '../map/terrain';
import { createRunState, type RunExit } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { ExitRenderer } from './exitRenderer';

/** A field rising 10 % to the east (+x) and 5 % to the south (+z), like a stretch of Woodland's slope but steeper. */
const SLOPE = buildTerrain(-10, -10, 1, 20, 20, (x, z) => 2 + 0.1 * x + 0.05 * z);
const groundAt = (x: number, z: number): number => terrainHeightAt(SLOPE, x, z)!;

function exitAt(x: number, z: number): RunExit {
  return { name: 'Gate', position: vec3(x, groundAt(x, z), z), radius: 3, late: false, closed: false, open: true } as RunExit;
}

/** The world positions of a mesh's vertices. */
function worldVertices(m: THREE.Mesh): THREE.Vector3[] {
  m.updateWorldMatrix(true, false);
  const p = m.geometry.attributes.position!;
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld));
}

/** The one merged floor mesh (every ring and wash, M75) and its vertices' alphas: a ring's or a wash's. */
function floorOf(r: ExitRenderer): { floor: THREE.Mesh; alpha: (i: number) => number } {
  const floor = r.object.getObjectByName('exit-floor') as THREE.Mesh;
  const colour = floor.geometry.getAttribute('color');
  // Stored as 32-bit floats: read back at the precision the config gives them.
  return { floor, alpha: (i) => Math.round(colour.getW(i) * 1e6) / 1e6 };
}

/** The lift over the ground a floor vertex should have: the ring's, or half of it for the wash inside. */
const liftOf = (alpha: number): number => (alpha === V.ringOpacity ? V.ringLift : V.ringLift * 0.5);

function meshes(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) out.push(c);
  });
  return out;
}

describe('ExitRenderer on terrain (M48)', () => {
  // The EXIT board is drawn on a canvas; the unit tests run without a page, so a canvas with no 2D context stands in.
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('lays the ring and its wash on a slope just over the ground, so the uphill side is not buried', () => {
    const run = createRunState();
    run.exits = [exitAt(1, -2)];
    const r = new ExitRenderer(run, SLOPE);
    r.object.updateMatrixWorld(true);
    const { floor, alpha } = floorOf(r);
    const seen = new Set<number>();
    worldVertices(floor).forEach((v, i) => {
      seen.add(alpha(i));
      expect(v.y - groundAt(v.x, v.z), `${v.x.toFixed(2)}, ${v.z.toFixed(2)}`).toBeCloseTo(liftOf(alpha(i)), 4);
    });
    expect([...seen].sort()).toEqual([V.fillOpacity, V.ringOpacity].sort());
    r.dispose();
  });

  it('stands the cones and the sign post on the ground round the ring', () => {
    const run = createRunState();
    run.exits = [exitAt(1, -2)];
    const r = new ExitRenderer(run, SLOPE);
    r.object.updateMatrixWorld(true);
    const instanced = meshes(r.object).filter((m): m is THREE.InstancedMesh => m.name === 'exit-cones' || m.name === 'exit-posts');
    expect(instanced.map((m) => m.count).sort()).toEqual([1, V.cones].sort());
    const at = new THREE.Matrix4();
    for (const m of instanced) {
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, at);
        const foot = new THREE.Vector3().setFromMatrixPosition(at.premultiply(m.matrixWorld));
        expect(foot.y, `${m.name} ${i}: ${foot.x.toFixed(2)}, ${foot.z.toFixed(2)}`).toBeCloseTo(groundAt(foot.x, foot.z), 4);
        expect(Math.hypot(foot.x - 1, foot.z + 2), `${m.name} ${i} on the ring`).toBeCloseTo(3, 4);
      }
    }
    r.dispose();
  });

  it('draws every exit in five meshes whatever their number: one floor and four instanced draws, nothing per exit (M75)', () => {
    for (const count of [1, 3, 6]) {
      const run = createRunState();
      run.exits = Array.from({ length: count }, (_, i) => exitAt(-6 + 2.4 * i, i % 2 === 0 ? -4 : 4));
      run.exits.push({ ...exitAt(5, 5), closed: true });
      const r = new ExitRenderer(run, SLOPE);
      const all = meshes(r.object);
      expect(all.map((m) => m.name).sort()).toEqual(['exit-boards-open', 'exit-boards-shut', 'exit-cones', 'exit-floor', 'exit-posts']);
      // The only plain mesh is the shared floor; everything else is instanced, and nothing hangs under a group of its own.
      expect(all.filter((m) => !(m instanceof THREE.InstancedMesh)).map((m) => m.name)).toEqual(['exit-floor']);
      for (const m of all) expect(m.parent).toBe(r.object);
      const instanced = all.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh);
      expect(instanced).toHaveLength(4);
      const byName = new Map(instanced.map((m) => [m.name, m]));
      expect(byName.get('exit-cones')!.count).toBe(count * V.cones);
      expect(byName.get('exit-posts')!.count).toBe(count);
      // Shut until the first update shows them open, as before M75.
      expect(byName.get('exit-boards-shut')!.count).toBe(count);
      expect(byName.get('exit-boards-open')!.count).toBe(0);
      expect(byName.get('exit-boards-open')!.visible).toBe(false);
      for (const name of ['exit-cones', 'exit-posts']) {
        expect(byName.get(name)!.castShadow).toBe(true);
        expect(byName.get(name)!.boundingSphere).not.toBeNull();
      }
      r.dispose();
    }
  });

  it('keeps the same five draws, the same buffers and every exit in exactly one board draw as exits open and shut in any order (M75, QA)', () => {
    const run = createRunState();
    // Three columns, two rows, 7 m apart: no two rings touch (each is 3 m round).
    const spots = [[-7, -5], [0, -5], [7, -5], [-7, 5], [0, 5], [7, 5]] as const;
    run.exits = spots.map(([x, z], i) => ({ ...exitAt(x, z), late: i % 2 === 1, open: i % 2 === 0 }));
    run.exits.push({ ...exitAt(0, 0), closed: true });
    const r = new ExitRenderer(run, SLOPE);
    r.update(run);
    const before = meshes(r.object);
    const floor = r.object.getObjectByName('exit-floor') as THREE.Mesh;
    const buffers = (m: THREE.Mesh): unknown[] => [m.geometry, ...Object.values(m.geometry.attributes)];
    const buffersBefore = before.map(buffers);
    const colour = floor.geometry.getAttribute('color');
    const boards = (name: string) => r.object.getObjectByName(name) as THREE.InstancedMesh;
    /** Meshes that would draw this frame: visible, and (instanced) with something to draw. */
    const draws = (): number => meshes(r.object).filter((m) => m.visible && (!(m instanceof THREE.InstancedMesh) || m.count > 0)).length;
    const shownColours = (i: number): string => {
      // The colours of exit i's floor vertices: the ones within its radius of its middle.
      const [x, z] = spots[i]!;
      const seen = new Set<string>();
      const pos = floor.geometry.getAttribute('position');
      for (let v = 0; v < pos.count; v++) if (Math.hypot(pos.getX(v) - x, pos.getZ(v) - z) < 3.01) seen.add([colour.getX(v), colour.getY(v), colour.getZ(v)].map((c) => c.toFixed(4)).join());
      return [...seen].join('|');
    };
    const open = new THREE.Color(V.openColor);
    const shut = new THREE.Color(V.shutColor);
    const key = (c: THREE.Color): string => [c.r, c.g, c.b].map((v) => v.toFixed(4)).join();
    // Opens and re-closes a late exit at a time, in different orders, then all at once and all shut.
    const orders: number[][] = [[1, 3, 5], [5, 1, 3, 3, 1], [3, 5, 5, 3, 1], [1, 1, 1, 5]];
    for (const order of orders) {
      for (const i of order) {
        run.exits[i]!.open = !run.exits[i]!.open;
        r.update(run);
        const now = meshes(r.object);
        expect(now).toEqual(before);
        now.forEach((m, k) => buffers(m).forEach((b, j) => expect(b).toBe(buffersBefore[k]![j])));
        expect(r.object.children).toHaveLength(5);
        // Every drawn exit's board is in exactly one of the two draws, and the draw call count stays within five.
        expect(boards('exit-boards-open').count + boards('exit-boards-shut').count).toBe(6);
        expect(boards('exit-boards-open').count).toBe(run.exits.slice(0, 6).filter((e) => e.open).length);
        expect(draws()).toBeLessThanOrEqual(5);
        for (let k = 0; k < 6; k++) expect(shownColours(k), `exit ${k}`).toBe(key(run.exits[k]!.open ? open : shut));
      }
    }
    for (const e of run.exits) e.open = false;
    r.update(run);
    expect(boards('exit-boards-open').count).toBe(0);
    expect(boards('exit-boards-open').visible).toBe(false);
    expect(boards('exit-boards-shut').count).toBe(6);
    for (const e of run.exits) e.open = true;
    r.update(run);
    expect(boards('exit-boards-shut').count).toBe(0);
    expect(boards('exit-boards-shut').visible).toBe(false);
    expect(boards('exit-boards-open').count).toBe(6);
    expect(draws()).toBe(4);
    r.dispose();
  });

  it('keeps every ring and wash of several exits draped on the slope, before and after they repaint', () => {
    const run = createRunState();
    // Exits on the steep part, across the fall line, and one at the field\'s edge, each with its own radius.
    run.exits = [exitAt(6, 6), exitAt(-6, -4), exitAt(5, -7), { ...exitAt(-5, 6), radius: 2.2, late: true, open: false }];
    const r = new ExitRenderer(run, SLOPE);
    r.object.updateMatrixWorld(true);
    const { floor, alpha } = floorOf(r);
    const drape = (when: string): void => {
      let worst = 0;
      worldVertices(floor).forEach((v, i) => {
        const gap = Math.abs(v.y - groundAt(v.x, v.z) - liftOf(alpha(i)));
        worst = Math.max(worst, gap);
        // A few centimetres at most (the ring is laid on its own ground, so it is exact; the lift is its width over it).
        expect(gap, `${when}: ${v.x.toFixed(2)}, ${v.z.toFixed(2)}`).toBeLessThan(0.02);
      });
      expect(worst).toBeLessThan(0.02);
    };
    drape('built');
    expect(floor.geometry.getAttribute('position').count).toBeGreaterThan(4 * V.ringSegments * 2);
    r.update(run);
    drape('painted');
    run.exits[3]!.open = true;
    r.update(run);
    drape('opened');
    run.exits[3]!.open = false;
    r.update(run);
    drape('shut again');
    // Over the slope the ring is not flat: it climbs with the ground, where a flat one would bury or hover.
    const ys = worldVertices(floor).map((v) => v.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
    r.dispose();
  });

  it('paints an exit open or shut in the colours and see-through it had, and moves its board to the open draw when it opens', () => {
    const run = createRunState();
    run.exits = [exitAt(-4, -3), { ...exitAt(4, 3), late: true, open: false }];
    const r = new ExitRenderer(run, SLOPE);
    const { floor, alpha } = floorOf(r);
    const colour = floor.geometry.getAttribute('color');
    const open = new THREE.Color(V.openColor);
    const shut = new THREE.Color(V.shutColor);
    const boards = (name: string) => r.object.getObjectByName(name) as THREE.InstancedMesh;
    /** The colour each exit's floor vertices show (nearest exit by distance), and their alphas. */
    const shown = (): { colours: Set<string>[]; alphas: Set<number> } => {
      const colours = [new Set<string>(), new Set<string>()];
      const alphas = new Set<number>();
      const pos = floor.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const which = pos.getX(i) < 0 ? 0 : 1;
        colours[which]!.add([colour.getX(i), colour.getY(i), colour.getZ(i)].map((c) => c.toFixed(5)).join());
        alphas.add(alpha(i));
      }
      return { colours, alphas };
    };
    const key = (c: THREE.Color): string => [c.r, c.g, c.b].map((v) => v.toFixed(5)).join();
    r.update(run);
    let now = shown();
    expect([...now.colours[0]!]).toEqual([key(open)]);
    expect([...now.colours[1]!]).toEqual([key(shut)]);
    expect([...now.alphas].sort()).toEqual([V.fillOpacity, V.ringOpacity].sort());
    expect(boards('exit-boards-open').count).toBe(1);
    expect(boards('exit-boards-shut').count).toBe(1);
    // The boards' faces are the two textures they always were.
    expect((boards('exit-boards-open').material as THREE.MeshStandardMaterial).map).not.toBe((boards('exit-boards-shut').material as THREE.MeshStandardMaterial).map);
    const shutBoard = new THREE.Matrix4();
    boards('exit-boards-shut').getMatrixAt(0, shutBoard);
    // The late exit opens: its ring and wash turn green, its board moves to the open draw, in the same place.
    run.exits[1]!.open = true;
    r.update(run);
    now = shown();
    expect([...now.colours[0]!]).toEqual([key(open)]);
    expect([...now.colours[1]!]).toEqual([key(open)]);
    expect([...now.alphas].sort()).toEqual([V.fillOpacity, V.ringOpacity].sort());
    expect(boards('exit-boards-open').count).toBe(2);
    expect(boards('exit-boards-shut').count).toBe(0);
    expect(boards('exit-boards-shut').visible).toBe(false);
    const moved = [0, 1].map((i) => boards('exit-boards-open').getMatrixAt(i, new THREE.Matrix4()));
    expect(moved.some((m) => m.equals(shutBoard))).toBe(true);
    // The floor keeps its material: one draw, its colour per vertex, see-through without writing depth.
    const material = floor.material as THREE.MeshBasicMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.opacity).toBe(1);
    r.dispose();
  });

  it('keeps an exit flat where the map has no terrain, as on Depot and Neon Heights', () => {
    const run = createRunState();
    run.exits = [{ ...exitAt(1, -2), position: vec3(1, 3, -2) }];
    const r = new ExitRenderer(run);
    r.object.updateMatrixWorld(true);
    const { floor, alpha } = floorOf(r);
    worldVertices(floor).forEach((v, i) => expect(v.y).toBeCloseTo(3 + liftOf(alpha(i)), 5));
    r.dispose();
  });

  it('hangs the EXIT board at the top of its post, on the ground the post stands on, however the field slopes', () => {
    const run = createRunState();
    run.exits = [exitAt(1, -2), exitAt(-6, 5)];
    const r = new ExitRenderer(run, SLOPE);
    r.object.updateMatrixWorld(true);
    const all = meshes(r.object);
    const posts = all.find((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.name === 'exit-posts')!;
    const boards = all.find((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.name === 'exit-boards-shut')!;
    expect(boards.count).toBe(2);
    const at = new THREE.Matrix4();
    const board = new THREE.Matrix4();
    [0, 1].forEach((i) => {
      posts.getMatrixAt(i, at);
      const foot = new THREE.Vector3().setFromMatrixPosition(at.premultiply(posts.matrixWorld));
      boards.getMatrixAt(i, board);
      const centre = new THREE.Vector3().setFromMatrixPosition(board.premultiply(boards.matrixWorld));
      expect(Math.hypot(centre.x - foot.x, centre.z - foot.z), `board ${i} on its post`).toBeLessThan(1e-4);
      expect(centre.y - groundAt(foot.x, foot.z), `board ${i} height above the ground`).toBeCloseTo(V.postHeight - V.boardHeight / 2, 4);
    });
    r.dispose();
  });

  it('disposes the instanced draws, the floor, the geometries, the materials and the board textures, and leaves the scene', () => {
    const run = createRunState();
    run.exits = [exitAt(1, -2)];
    const r = new ExitRenderer(run, SLOPE);
    const parent = new THREE.Group();
    parent.add(r.object);
    const all = meshes(r.object);
    const instanced = all.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh);
    expect(instanced.map((m) => m.name).sort()).toEqual(['exit-boards-open', 'exit-boards-shut', 'exit-cones', 'exit-posts']);
    const instanceSpies = instanced.map((m) => vi.spyOn(m, 'dispose'));
    const geometrySpies = all.map((m) => vi.spyOn(m.geometry, 'dispose'));
    const materials = all.map((m) => m.material as THREE.MeshStandardMaterial);
    const materialSpies = materials.map((m) => vi.spyOn(m, 'dispose'));
    const textureSpies = materials.flatMap((m) => (m.map ? [vi.spyOn(m.map, 'dispose')] : []));
    expect(textureSpies).toHaveLength(2);
    r.dispose();
    for (const s of [...instanceSpies, ...geometrySpies, ...materialSpies, ...textureSpies]) expect(s).toHaveBeenCalled();
    expect(r.object.parent).toBeNull();
  });
});
