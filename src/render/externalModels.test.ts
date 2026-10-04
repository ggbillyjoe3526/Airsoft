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
import { fadeModelMaterials, figureModelUrl, loadFigureModel, prepareFigureModel } from './externalModels';

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
  // Only while the repository has no model: once one is committed (docs/CC0_ASSETS.md), this checks nothing.
  it.skipIf(figureModelUrl() !== null)('when absent from the repository, is never fetched: the built-in figures are drawn', async () => {
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

/**
 * A rigged model: a plain body, and a skinned left leg bound to a bone (named like the part, as rigs often are) that
 * is then moved down to the hip, so the leg is only where it should be in the rig's pose.
 */
function skinnedScene(): THREE.Group {
  const scene = new THREE.Group();
  scene.add(boxMesh('body', 0, FIGURE.hipHeight, 0, FIGURE_MODEL.height - FIGURE.hipHeight));
  const armature = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'legL';
  armature.add(bone);
  const geometry = new THREE.BoxGeometry(0.2, FIGURE.hipHeight, 0.2);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const leg = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  leg.name = 'legL';
  armature.add(leg);
  scene.add(armature);
  armature.updateMatrixWorld(true);
  leg.bind(new THREE.Skeleton([bone]));
  bone.position.set(FIGURE.hipSpread, FIGURE.hipHeight / 2, 0);
  return scene;
}

describe('a rigged figure model', () => {
  it('is drawn in its rig’s pose as plain meshes, so a part moves without the bones it leaves behind', () => {
    const model = prepareFigureModel(skinnedScene());
    const leg = model.parts.legL!;
    leg.traverse((o) => expect(o).not.toBeInstanceOf(THREE.SkinnedMesh));
    expect(leg.getObjectByName('legL')).toBeInstanceOf(THREE.Mesh);
    const box = boundsOf(leg);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(FIGURE.hipHeight, 6);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(-FIGURE.hipSpread, 6);
    // A figure built from it draws the leg where the built-in one goes.
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, model);
    figure.root.updateMatrixWorld(true);
    expect(boundsOf(figure.legL).max.y).toBeCloseTo(FIGURE.hipHeight, 6);
    disposeFigure(figure);
    model.dispose();
  });
});

describe('a figure model with all its parts', () => {
  it('is sized by its body and legs, not the raised hand, and takes out arms nested in the body', () => {
    const s = 2;
    const scene = riggedScene();
    scene.add(boxMesh('hitPose', 0.2 * s, 1.2 * s, 0, 1.0 * s)); // a hand up to 2.2 m: above the head
    const arms = boxMesh('aimRifle', 0, FIGURE.shoulderHeight * s, -0.3 * s, 0.1 * s);
    scene.add(arms);
    scene.updateMatrixWorld(true);
    scene.getObjectByName('body')!.attach(arms); // parented to the body in Blender, where it was
    const model = prepareFigureModel(scene);
    expect(Object.keys(model.parts).sort()).toEqual(['aimRifle', 'body', 'hitPose', 'legL', 'legR']);
    expect(boundsOf(model.parts.body!).max.y).toBeCloseTo(FIGURE_MODEL.height, 6);
    expect(boundsOf(model.parts.legL!).max.y).toBeCloseTo(FIGURE.hipHeight, 6);
    expect(model.parts.body!.getObjectByName('aimRifle')).toBeUndefined();
    expect(boundsOf(model.parts.aimRifle!).min.y).toBeCloseTo(FIGURE.shoulderHeight, 6);
    model.dispose();
  });
});

describe('a figure model with only some meshes named', () => {
  it('draws the rest with the body, says which, and leaves out the file’s lights and cameras', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scene = riggedScene();
    scene.add(boxMesh('hair', 0, 3.3, 0, 0.2));
    scene.add(new THREE.PointLight(), new THREE.PerspectiveCamera());
    const model = prepareFigureModel(scene);
    const hair = model.parts.body!.getObjectByName('hair')!;
    expect(hair).toBeDefined();
    expect(boundsOf(hair).max.y).toBeCloseTo(3.5 / 2, 6); // where it was, at the model's scale of 1/2
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('hair');
    let extras = 0;
    for (const part of Object.values(model.parts)) {
      part.traverse((o) => {
        if (o instanceof THREE.Light || o instanceof THREE.Camera) extras++;
      });
    }
    expect(extras).toBe(0);
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
    // Back in play, the materials are as the model was authored.
    c.status = 'alive';
    renderer.update(1, 0, -1);
    for (const m of figure.modelMaterials) {
      expect(m.opacity).toBe(1);
      expect(m.transparent).toBe(false);
    }
    renderer.dispose();
    model.dispose();
  });

  it('keeps a see-through material see-through after a fade', () => {
    const scene = riggedScene();
    const visor = boxMesh('visor', 0, 1.6, -0.1, 0.1);
    Object.assign(visor.material as THREE.Material, { transparent: true, opacity: 0.4 });
    scene.getObjectByName('body')!.add(visor);
    const model = prepareFigureModel(scene);
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, model);
    const glass = figure.modelMaterials.find((m) => m.opacity < 1)!;
    fadeModelMaterials(figure.modelMaterials, 0.5, true);
    expect(glass.opacity).toBeCloseTo(0.2, 6);
    fadeModelMaterials(figure.modelMaterials, 1, true);
    expect(glass.opacity).toBeCloseTo(0.4, 6);
    expect(glass.transparent).toBe(true);
    disposeFigure(figure);
    model.dispose();
  });

  it('sinks a whole model as far as the head drops when crouching', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const scene = new THREE.Group();
    scene.add(boxMesh('anything', 0, 0, 0, 1.8));
    const model = prepareFigureModel(scene);
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    c.crouchAmount = c.prevCrouchAmount = 1;
    const renderer = new CharacterRenderer([c], [0x3d8bff, 0xff8a2a], HITS, LOADOUT, model);
    renderer.update(1, 0, -1);
    const figure = (renderer as unknown as { figures: { figure: { whole: THREE.Object3D } }[] }).figures[0]!.figure;
    expect(boundsOf(figure.whole).max.y).toBeCloseTo(FIGURE_MODEL.height - FIGURE.crouchDrop, 6);
    renderer.dispose();
    model.dispose();
  });
});
