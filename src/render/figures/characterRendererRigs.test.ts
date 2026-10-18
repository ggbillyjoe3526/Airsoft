import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HITS } from '../../config/hits';
import { fitParts } from '../../sim/armament';
import { type Character, createCharacter } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { CharacterRenderer } from './characterRenderer';
import type { FigureCrowd } from './figureMix';
import { figureRigs } from './figureRig';
import type { RiggedFigure } from './riggedFigure';
import { figureFilesForTests } from '../testSupport';

/**
 * BF1 acceptance 1, 3 and 6 at the CharacterRenderer: with the rigs every player is drawn rigged and none built-in;
 * without them none is (the switches-on look is untouched); a shot, a fade, a parts change and dispose reach the rigged figure.
 */

const { rigs, files } = await figureFilesForTests();

interface Inside {
  figures: { figure: unknown; rigged: RiggedFigure | null; material: THREE.MeshStandardMaterial }[];
  thrown: { count: number; object: THREE.Object3D } | null;
}
const inside = (r: CharacterRenderer): Inside => r as unknown as Inside;

const MIXED: FigureCrowd = { robots: [false, true], realistic: false };

function make(chars: Character[], withRigs: boolean, detail: 'low' | 'high' = 'low') {
  return new CharacterRenderer(chars, [0x3d8bff, 0xff5a3d], HITS, null, detail, MIXED, files, withRigs ? figureRigs(rigs.human, rigs.robot, () => {}) : null);
}
const chars = (): Character[] => [createCharacter(0, vec3(0, 0, 0), 0), createCharacter(1, vec3(2, 0, 0), 0.5, undefined, 1)];
const settle = (r: CharacterRenderer, n = 5): void => {
  for (let i = 0; i < n; i++) r.update(1, 1 / 60, -1);
};
const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};

describe('the rigged figures in CharacterRenderer', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('with the rigs every figure is rigged and none built-in, human or robot as the crowd says', () => {
    const r = make(chars(), true);
    const f = inside(r).figures;
    expect(f.every((s) => s.rigged !== null && s.figure === null)).toBe(true);
    expect(r.object.children).toContain(f[0]!.rigged!.root);
    expect(r.object.children).toContain(f[1]!.rigged!.root);
    r.dispose();
  });

  it('without the rigs none is rigged: the built-in figures are drawn as before, and no thrown-magazine group is added', () => {
    const r = make(chars(), false);
    const f = inside(r).figures;
    expect(f.every((s) => s.rigged === null && s.figure !== null)).toBe(true);
    expect(inside(r).thrown).toBeNull();
    settle(r);
    r.fired(0);
    r.dispose();
  });

  it('with the rigs the thrown-magazine group is part of the scene object', () => {
    const r = make(chars(), true);
    expect(r.object.children).toContain(inside(r).thrown!.object);
    r.dispose();
  });

  it('fired(id) presses the trigger of that figure only, and ignores an unknown id', () => {
    const r = make(chars(), true);
    const f = inside(r).figures;
    const spies = f.map((s) => vi.spyOn(s.rigged!, 'shot'));
    r.fired(1);
    expect(spies[0]).not.toHaveBeenCalled();
    expect(spies[1]).toHaveBeenCalledWith(false);
    r.fired(99);
    expect(spies[0]).not.toHaveBeenCalled();
    expect(spies[1]).toHaveBeenCalledTimes(1);
    r.dispose();
  });

  it('a new round clears the magazines thrown in the last one', () => {
    const r = make(chars(), true);
    const thrown = inside(r).thrown as unknown as { throw: (...a: unknown[]) => void; count: number };
    const g = new THREE.BoxGeometry(0.03, 0.1, 0.05);
    thrown.throw(g, new THREE.MeshBasicMaterial(), new THREE.Matrix4(), new THREE.Vector3(), new THREE.Vector3(), 9.8, 0, 5, false);
    expect(thrown.count).toBe(1);
    r.roundStarted();
    expect(thrown.count).toBe(0);
    r.dispose();
  });

  it('fired reports the pistol when the active replica is the pistol', () => {
    const cs = chars();
    cs[0]!.armament.active = cs[0]!.armament.replicas.findIndex((x) => x.look.model === 'pistol');
    const r = make(cs, true);
    const spy = vi.spyOn(inside(r).figures[0]!.rigged!, 'shot');
    r.fired(0);
    expect(spy).toHaveBeenCalledWith(true);
    r.dispose();
  });

  it('a figure placed by the character’s position, and the camera’s own is the first-person body', () => {
    const cs = chars();
    cs[1]!.position.x = cs[1]!.prevPosition.x = 5;
    const r = make(cs, true);
    r.update(1, 1 / 60, 0, { x: 0, y: 1.6, z: 0 });
    const f = inside(r).figures;
    expect(f[1]!.rigged!.root.position.x).toBeCloseTo(5, 3);
    // The camera's own figure is its first-person body: it casts no shadow; the other, in the third person, does.
    const shadowed = (s: (typeof f)[number]) => meshesOf(s.rigged!.root).filter((m) => m instanceof THREE.SkinnedMesh && m.visible && m.castShadow).length;
    expect(shadowed(f[0]!)).toBe(0);
    expect(shadowed(f[1]!)).toBeGreaterThan(0);
    r.dispose();
  });

  it('the warm-up draws every figure fading, then solid, each time with every part shown, and gets each back (PF1)', () => {
    for (const rigged of [true, false]) {
      const r = make(chars(), rigged);
      settle(r);
      const figures = inside(r).figures;
      const rootOf = (s: (typeof figures)[number]) => s.rigged?.root ?? (s.figure as { root: THREE.Object3D }).root;
      const own = (s: (typeof figures)[number]) => new Set<THREE.Material>([s.material, ...(s.rigged?.materials ?? (s.figure as { modelMaterials: THREE.Material[] }).modelMaterials)]);
      const all = (): THREE.Object3D[] => {
        const out: THREE.Object3D[] = [];
        r.object.traverse((o) => void out.push(o));
        return out;
      };
      const listOf = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);
      const meshes = figures.flatMap((s) => meshesOf(rootOf(s)));
      const materialsBefore = meshes.map((m) => m.material);
      const castBefore = meshes.map((m) => m.castShadow);
      const versions = figures.flatMap((s) => [...own(s)].map((m) => [m.version, m.transparent]));
      const shownBefore = all().map((o) => o.visible);
      expect(shownBefore.some((v) => !v)).toBe(true);
      const [fading, solid] = r.warmPoses();
      let shown: boolean[] = [];
      let drawnIn: THREE.Material[] = [];
      solid!(() => {
        shown = all().map((o) => o.visible);
        drawnIn = meshes.flatMap(listOf);
      });
      expect(shown.every(Boolean)).toBe(true);
      expect(drawnIn).toEqual(materialsBefore.flatMap((m) => (Array.isArray(m) ? m : [m])));
      let copies: THREE.Material[] = [];
      let casting = 0;
      fading!(() => {
        shown = all().map((o) => o.visible);
        copies = figures.flatMap((s) => meshesOf(rootOf(s)).flatMap(listOf).filter((m) => !own(s).has(m) && m.transparent));
        casting = meshes.filter((m) => m.castShadow).length;
      });
      expect(shown.every(Boolean)).toBe(true);
      // Every figure is drawn in see-through copies, its own materials untouched (no render object rebuilt for them).
      expect(copies.length).toBeGreaterThan(0);
      for (const s of figures) expect(meshesOf(rootOf(s)).flatMap(listOf).some((m) => own(s).has(m))).toBe(true);
      expect(casting).toBe(0);
      expect(all().map((o) => o.visible)).toEqual(shownBefore);
      expect(meshes.map((m) => m.material)).toEqual(materialsBefore);
      expect(meshes.map((m) => m.castShadow)).toEqual(castBefore);
      expect(figures.flatMap((s) => [...own(s)].map((m) => [m.version, m.transparent]))).toEqual(versions);
      // The same copies the next time; freed with the renderer.
      let again: THREE.Material[] = [];
      fading!(() => {
        again = figures.flatMap((s) => meshesOf(rootOf(s)).flatMap(listOf).filter((m) => !own(s).has(m) && m.transparent));
      });
      expect(again).toEqual(copies);
      const freed = vi.fn();
      for (const c of new Set(copies)) c.addEventListener('dispose', freed);
      r.dispose();
      expect(freed).toHaveBeenCalledTimes(new Set(copies).size);
    }
  });

  it('a leaving figure fades its rigged materials and drops its shadow; a standing one does neither', () => {
    const cs = chars();
    const r = make(cs, true);
    settle(r);
    const [a, b] = inside(r).figures;
    const casting = (s: typeof a) => meshesOf(s!.rigged!.root).filter((m) => m instanceof THREE.SkinnedMesh && m.visible && m.castShadow).length;
    expect(casting(a)).toBeGreaterThan(0);
    for (const m of a!.rigged!.materials) expect(m.opacity).toBe(1);

    cs[0]!.status = 'leaving';
    cs[0]!.statusTime = 0.3;
    settle(r);
    const want = 1 - 0.3 / HITS.vanishTime;
    expect(a!.material.opacity).toBeCloseTo(want, 5);
    for (const m of a!.rigged!.materials) {
      expect(m.opacity).toBeCloseTo(want, 5);
      expect(m.transparent).toBe(true);
    }
    expect(casting(a)).toBe(0);
    // The other figure is untouched.
    expect(b!.material.opacity).toBe(1);
    expect(casting(b)).toBeGreaterThan(0);
    for (const m of b!.rigged!.materials) expect(m.opacity).toBe(1);

    // Gone entirely at the end of the vanish.
    cs[0]!.statusTime = HITS.vanishTime;
    settle(r);
    expect(a!.material.opacity).toBe(0);
    r.dispose();
  });

  for (const detail of ['low', 'high'] as const) {
    it(`a parts change between rounds rebuilds the rigged figure once, and only that figure (${detail})`, () => {
      const cs = chars();
      const r = make(cs, true, detail);
      settle(r);
      const before = inside(r).figures.map((s) => s.rigged!);
      const root0 = before[0]!.root;
      // Nothing changed: no rebuild across many frames.
      settle(r, 10);
      expect(inside(r).figures[0]!.rigged).toBe(before[0]);

      fitParts(cs[0]!.armament, [{ ...cs[0]!.armament.parts[0]!, muzzle: 'silencer' }]);
      r.update(1, 1 / 60, -1);
      const after = inside(r).figures.map((s) => s.rigged!);
      expect(after[0]).not.toBe(before[0]);
      expect(after[1]).toBe(before[1]);
      expect(r.object.children).toContain(after[0]!.root);
      expect(r.object.children).not.toContain(root0);
      // Not again on the frames after.
      settle(r, 10);
      expect(inside(r).figures[0]!.rigged).toBe(after[0]);
      // And a fresh fit of the same parts (new arrays' entries, same kit) draws the same figure.
      fitParts(cs[0]!.armament, [{ ...cs[0]!.armament.parts[0]! }]);
      settle(r);
      expect(inside(r).figures[0]!.rigged).toBe(after[0]);
      r.dispose();
    });
  }

  it('dispose frees the figures’ materials, takes them and the thrown group out of the scene', () => {
    const scene = new THREE.Group();
    const r = make(chars(), true);
    scene.add(r.object);
    const f = inside(r).figures;
    const mats = f.flatMap((s) => [s.material, ...s.rigged!.materials]);
    const spies = mats.map((m) => vi.spyOn(m, 'dispose'));
    const roots = f.map((s) => s.rigged!.root);
    r.dispose();
    for (const s of spies) expect(s).toHaveBeenCalled();
    for (const root of roots) expect(root.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(inside(r).thrown!.count).toBe(0);
  });
});
