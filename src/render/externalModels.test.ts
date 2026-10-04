import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIGURE_MODEL } from '../config/assets';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { buildFigure, disposeFigure } from './characterModels';
import { CharacterRenderer } from './characterRenderer';
import { figureModelUrl, loadFigureModel, prepareFigureModel } from './externalModels';

/** A box mesh named `name`, `h` tall, standing on y = `y0`, centred at (x, z), with a material called `material`. */
function boxMesh(name: string, x: number, y0: number, z: number, h: number, material = 'cloth'): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), new THREE.MeshStandardMaterial({ name: material }));
  mesh.name = name;
  mesh.position.set(x, y0 + h / 2, z);
  return mesh;
}

/** World-space bounds of an object. */
const boundsOf = (o: THREE.Object3D): THREE.Box3 => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

/** A model authored at twice the figures' size, facing +Z (glTF's convention), with parts named for the rig. */
function riggedScene(): THREE.Group {
  const s = 2;
  const scene = new THREE.Group();
  scene.add(boxMesh('body', 0, FIGURE.hipHeight * s, 0, (FIGURE_MODEL.height - FIGURE.hipHeight) * s, 'TeamTape'));
  scene.add(boxMesh('legL', FIGURE.hipSpread * s, 0, 0, FIGURE.hipHeight * s));
  scene.add(boxMesh('legR', -FIGURE.hipSpread * s, 0, 0, FIGURE.hipHeight * s));
  return scene;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the figure model (M25a)', () => {
  it('is absent from the repository, so a normal build fetches nothing and draws the built-in figures', async () => {
    expect(figureModelUrl()).toBeNull();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await loadFigureModel()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the built-in figures, with a warning, when the file is missing or not a .glb', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })));
    expect(await loadFigureModel('figure.glb')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await loadFigureModel('figure.glb')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('scales a whole model to the figures’ height, feet on the ground, turned to face -Z', () => {
    const scene = new THREE.Group();
    scene.add(boxMesh('anything', 0, 0.5, 0, 3.4));
    scene.add(boxMesh('nose', 0, 3, 0.3, 0.2)); // in front of the face, which glTF puts at +Z
    const model = prepareFigureModel(scene);
    expect(model.parts).toEqual({});
    const box = boundsOf(model.whole!);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(FIGURE_MODEL.height, 6);
    expect(boundsOf(model.whole!.getObjectByName('nose')!).max.z).toBeLessThan(0);
    model.dispose();
  });

  it('takes out the named parts in figure space', () => {
    const model = prepareFigureModel(riggedScene());
    expect(Object.keys(model.parts).sort()).toEqual(['body', 'legL', 'legR']);
    expect(model.whole).toBeNull();
    const leg = boundsOf(model.parts.legL!);
    expect(leg.min.y).toBeCloseTo(0, 6);
    expect(leg.max.y).toBeCloseTo(FIGURE.hipHeight, 6);
    // Turned to face -Z, the model's left leg (+X when facing +Z) is on the figure's left (-X when facing -Z).
    expect((leg.min.x + leg.max.x) / 2).toBeCloseTo(-FIGURE.hipSpread, 6);
    model.dispose();
  });
});

describe('buildFigure with a figure model', () => {
  it('draws the parts the model has where the built-in ones go, and the built-in parts for the rest', () => {
    const model = prepareFigureModel(riggedScene());
    const material = new THREE.MeshStandardMaterial();
    const figure = buildFigure(0xff8a2a, material, new THREE.SpriteMaterial(), 0, model);
    figure.root.updateMatrixWorld(true);
    // The legs stand where the model put them, and still pivot at the hips.
    const leg = boundsOf(figure.legL);
    expect(leg.min.y).toBeCloseTo(0, 6);
    expect(leg.max.y).toBeCloseTo(FIGURE.hipHeight, 6);
    expect(figure.legL.position.y).toBeCloseTo(FIGURE.hipHeight, 6);
    // The model has no arms: the built-in rifle hold, pistol hold and hit pose are drawn on the figure's material.
    for (const part of [figure.aimRifle, figure.aimPistol, figure.hitPose]) expect((part as THREE.Mesh).material).toBe(material);
    // Each figure gets its own copies of the model's materials, the team ones painted in its colour.
    const body = figure.upper.children[0]!.getObjectByName('body') as THREE.Mesh;
    const tape = body.material as THREE.MeshStandardMaterial;
    expect(figure.modelMaterials).toContain(tape);
    expect(tape.color.getHex()).toBe(0xff8a2a);
    expect((model.parts.body!.getObjectByName('body') as THREE.Mesh).material).not.toBe(tape);
    model.dispose();
  });

  it('draws a whole model in place of the body and legs, keeping the built-in arms', () => {
    const scene = new THREE.Group();
    scene.add(boxMesh('anything', 0, 0, 0, 1.8));
    const model = prepareFigureModel(scene);
    const material = new THREE.MeshStandardMaterial();
    const figure = buildFigure(0x3d8bff, material, new THREE.SpriteMaterial(), 0, model);
    const meshes: THREE.Mesh[] = [];
    figure.root.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    // The model, plus the rifle hold, the pistol hold and the hit pose: no built-in legs or body.
    expect(meshes.filter((m) => m.material === material)).toHaveLength(3);
    expect(meshes.filter((m) => m.material !== material)).toHaveLength(1);
    model.dispose();
  });

  it('leaves the model’s shared geometry alone when a figure is freed, and frees the figure’s own materials', () => {
    const model = prepareFigureModel(riggedScene());
    const shared = model.parts.legL!.getObjectByName('legL') as THREE.Mesh;
    const geometryDispose = vi.spyOn(shared.geometry, 'dispose');
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, model);
    const own = figure.modelMaterials.map((m) => vi.spyOn(m, 'dispose'));
    disposeFigure(figure);
    expect(geometryDispose).not.toHaveBeenCalled();
    for (const d of own) expect(d).toHaveBeenCalled();
    model.dispose();
    expect(geometryDispose).toHaveBeenCalled();
  });

  it('fades the model’s materials with the figure when a walk-off leaves the field', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }); // the "HIT!" sign's canvas
    const model = prepareFigureModel(riggedScene());
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const renderer = new CharacterRenderer([c], [0x3d8bff, 0xff8a2a], HITS, LOADOUT, model);
    c.status = 'leaving';
    c.statusTime = HITS.vanishTime / 2;
    renderer.update(1, 0, -1);
    const figure = (renderer as unknown as { figures: { figure: { modelMaterials: THREE.Material[] } }[] }).figures[0]!.figure;
    expect(figure.modelMaterials.length).toBeGreaterThan(0);
    for (const m of figure.modelMaterials) {
      expect(m.opacity).toBeCloseTo(0.5, 6);
      expect(m.transparent).toBe(true);
    }
    renderer.dispose();
    model.dispose();
  });
});
