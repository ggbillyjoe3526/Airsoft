import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { REPLICA_FILE } from '../config/assets';
import { VIEWMODEL } from '../config/render';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { createArmament, fitOptics } from '../sim/armament';
import { HUMAN_CROWD, figureDress } from './figureMix';
import { type FigureDetail, PartBuilder } from './figureParts';
import { addRifle } from './figureReplicas';
import { prepareReplicaFile, type ReplicaFile, type ReplicaFiles } from './replicaFiles';
import { AEG_MUZZLE, buildReplicaModels, HUMAN_ARMS, LOW_DETAIL, PISTOL_MUZZLE, type ReplicaDetail } from './replicaModels';
import { Viewmodel } from './viewmodel';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

/** A model file, parsed as the game parses it (its animations on the scene, as loadGltfScene leaves them). */
async function scene(path: string): Promise<THREE.Object3D> {
  const buf = readFileSync(new URL(path, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

const fileOf = async (id: 'aeg' | 'pistol'): Promise<ReplicaFile> =>
  prepareReplicaFile(id, await scene(`../assets/models/replicas/${id}.glb`), await scene(`../assets/models/replicaParts/${id}.glb`));

async function bothFiles(): Promise<ReplicaFiles> {
  return new Map([
    ['aeg', await fileOf('aeg')],
    ['pistol', await fileOf('pistol')],
  ]);
}

const HIGH: ReplicaDetail = { replica: 'high', hands: 'high' };

/** Meshes drawn for a replica as it comes (its standard magazine, no muzzle device, no grip): its draw calls. */
function drawn(group: THREE.Group): number {
  const under = (name: string): number => {
    let n = 0;
    group.getObjectByName(name)?.traverse((o) => {
      if (o instanceof THREE.Mesh) n++;
    });
    return n;
  };
  return group.children.filter((c) => c instanceof THREE.Mesh).length + under('magazine:standard') + under('muzzle:none') + under('hold:none');
}

/** The angle (radians) between a bone's turn now and at rest. */
const turned = (bone: THREE.Object3D, rest: THREE.Quaternion): number => bone.quaternion.angleTo(rest);

describe('the AEG and gas pistol model files (RM1)', () => {
  it('fire from where the built-in models always did, within their budgets, with their moving parts and parts', async () => {
    const aeg = await fileOf('aeg');
    // The AEG's marker is the flash hider's face: the barrel's end plus the hider, as the built-in layout has it.
    expect(aeg.muzzle.x).toBeCloseTo(0, 4);
    expect(aeg.muzzle.y).toBeCloseTo(AEG_MUZZLE.up, 4);
    expect(aeg.muzzle.z).toBeCloseTo(-(AEG_MUZZLE.barrelEnd + AEG_MUZZLE.tips.none), 4);
    expect(aeg.flashHider.length).toBeGreaterThan(0);
    expect(aeg.rig!.bones.map((b) => b.name).sort()).toEqual(['chargingHandle', 'dustCover', 'frontSight', 'hopDial', 'magRelease', 'rearSight', 'selector', 'trigger']);
    expect([...aeg.rig!.clips.keys()].sort()).toEqual(['Fire', 'Inspect', 'Reload', 'Selector', 'SightsFold']);
    expect([...aeg.parts.keys()].sort()).toEqual(['barrel:long', 'barrel:tightBore', 'grip:angled', 'grip:vertical', 'light:weaponTorch', 'magazine:hiCap', 'magazine:lowCap', 'muzzle:silencer', 'optic:redDot', 'optic:scope2x']);

    const pistol = await fileOf('pistol');
    expect(pistol.muzzle.y).toBeCloseTo(PISTOL_MUZZLE.up, 4);
    expect(pistol.muzzle.z).toBeCloseTo(-PISTOL_MUZZLE.barrelEnd, 4);
    expect(pistol.rig!.bones.map((b) => b.name).sort()).toEqual(['magRelease', 'slide', 'trigger']);
    expect([...pistol.parts.keys()].sort()).toEqual(['laser:redLaser', 'light:weaponTorch', 'magazine:extended', 'muzzle:silencer']);

    for (const f of [aeg, pistol]) {
      expect(f.triangles.held).toBeLessThanOrEqual(REPLICA_FILE.warnTriangles[f.id] ?? REPLICA_FILE.warnTriangles.default!);
      expect(f.triangles.figure).toBeLessThanOrEqual(REPLICA_FILE.warnFigureTriangles);
      // The magazine is never a bone: the viewmodel moves it (and the hand holding it) by code through a reload.
      for (const clip of f.rig!.clips.values()) for (const t of clip.tracks) expect(t.name).not.toMatch(/magazine/i);
    }
    // Pinned so a new export is seen.
    expect(aeg.triangles).toEqual({ held: 5558, figure: 244 });
    expect(pistol.triangles).toEqual({ held: 1700, figure: 60 });
    aeg.dispose();
    pistol.dispose();
  });

  it('costs no more draw calls in the hands than the built-in models, at Low and High', async () => {
    const files = await bothFiles();
    for (const detail of [LOW_DETAIL, HIGH]) {
      const fromFile = buildReplicaModels([AEG, GAS_PISTOL], 0x3a7bd5, true, detail, null, 'hands', HUMAN_ARMS, files);
      const builtIn = buildReplicaModels([AEG, GAS_PISTOL], 0x3a7bd5, true, detail, null, 'hands', HUMAN_ARMS);
      for (const id of ['aeg', 'pistol']) {
        expect(fromFile.models.get(id)!.rig).toBeTruthy();
        expect(drawn(fromFile.models.get(id)!.group)).toBeLessThanOrEqual(drawn(builtIn.models.get(id)!.group));
      }
      fromFile.dispose();
      builtIn.dispose();
    }
  });
});

describe('the moving parts (RM1)', () => {
  it('pose from the file\'s animations: each part turns through its clip and is back at rest at time 0', async () => {
    const files = await bothFiles();
    const models = buildReplicaModels([AEG], 0x3a7bd5, false, LOW_DETAIL, null, 'bare', undefined, files);
    const { group, rig } = models.models.get('aeg')!;
    // The moving parts ride on bones in the body's own meshes: skinned, no extra meshes.
    expect(group.children.some((c) => c instanceof THREE.SkinnedMesh)).toBe(true);
    const selector = group.getObjectByName('rig_selector')!;
    const sight = group.getObjectByName('rig_rearSight')!;
    const restSelector = selector.quaternion.clone();
    const restSight = sight.quaternion.clone();
    rig!.set('Selector', rig!.duration('Selector'));
    rig!.set('SightsFold', rig!.duration('SightsFold'));
    rig!.apply();
    // Safe to full auto is half a turn; the sights fold flat (a quarter turn).
    expect(turned(selector, restSelector)).toBeCloseTo(Math.PI, 1);
    expect(turned(sight, restSight)).toBeCloseTo(Math.PI / 2, 1);
    rig!.set('Selector', 0);
    rig!.set('SightsFold', 0);
    rig!.apply();
    expect(turned(selector, restSelector)).toBeLessThan(1e-6);
    expect(turned(sight, restSight)).toBeLessThan(1e-6);
    models.dispose();
  });

  it('follow the game in first person: the trigger on a shot, the selector on the fire mode, the sights with an optic', async () => {
    const files = await bothFiles();
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, LOW_DETAIL, null, HUMAN_ARMS, files);
    const arm = createArmament(LOADOUT);
    arm.active = 0;
    const dt = 1 / 60;
    const frame = (): void => vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
    const bone = (name: string): THREE.Object3D => {
      let found: THREE.Object3D | undefined;
      vm.scene.traverse((o) => {
        if (!found && o.name === name) found = o;
      });
      return found!;
    };
    const trigger = bone('rig_trigger');
    const selector = bone('rig_selector');
    const sight = bone('rig_rearSight');
    frame();
    const rest = { trigger: trigger.quaternion.clone(), sight: sight.quaternion.clone() };

    // A shot pulls the trigger, which springs back once its clip is over.
    vm.onShot();
    frame();
    frame();
    expect(turned(trigger, rest.trigger)).toBeGreaterThan(0.1);
    for (let t = 0; t < 0.2; t += dt) frame();
    expect(turned(trigger, rest.trigger)).toBeLessThan(1e-6);

    // The selector sits at the fire mode from the first frame, then turns to a new one at the clip's speed.
    const at = (mode: 'semi' | 'auto'): number => VIEWMODEL.parts.selector[mode] * Math.PI;
    arm.modes[0] = 'semi';
    for (let t = 0; t < 1; t += dt) frame();
    const semi = selector.quaternion.clone();
    arm.modes[0] = 'auto';
    frame();
    expect(selector.quaternion.angleTo(semi)).toBeGreaterThan(0);
    expect(selector.quaternion.angleTo(semi)).toBeLessThan(at('auto') - at('semi'));
    for (let t = 0; t < 1; t += dt) frame();
    expect(selector.quaternion.angleTo(semi)).toBeCloseTo(at('auto') - at('semi'), 1);

    // An optic folds the iron sights down.
    fitOptics(arm, ['redDot', null]);
    for (let t = 0; t < 1; t += dt) frame();
    expect(turned(sight, rest.sight)).toBeCloseTo(Math.PI / 2, 1);
    vm.dispose();
  });
});

describe('the bots\' rifle from the AEG file (RM1)', () => {
  it('dresses a figure carrying the AEG in the file\'s shape: butt at the origin, muzzle FIGURE.rifle.length ahead', async () => {
    const files = await bothFiles();
    const dress = figureDress(HUMAN_CROWD, 0, 0, [AEG, GAS_PISTOL], files);
    expect(dress.rifleShape).toBe(files.get('aeg')!.figure);
    expect(dress.pistolShape).toBe(files.get('pistol')!.figure);
    const box = new THREE.Box3();
    for (const p of dress.rifleShape!) box.union((p.geometry.computeBoundingBox(), p.geometry.boundingBox!));
    expect(box.max.z).toBeCloseTo(0, 4);
    expect(box.min.z).toBeCloseTo(-FIGURE.rifle.length, 4);
    // The gas pistol's slide is a moving part, and still sets the back of its figure's frame.
    const pistol = new THREE.Box3();
    for (const p of dress.pistolShape!) pistol.union((p.geometry.computeBoundingBox(), p.geometry.boundingBox!));
    expect(pistol.max.z).toBeLessThan(0.03);
    expect(pistol.min.z).toBeCloseTo(-FIGURE.pistol.length, 1);
  });

  it('draws that shape in place of the built-in blocks at every detail, with a silencer when fitted and detailed', async () => {
    const files = await bothFiles();
    const dress = figureDress(HUMAN_CROWD, 0, 0, [AEG], files);
    const tris = (detail: FigureDetail, silencer: boolean): number => {
      const b = new PartBuilder(detail);
      addRifle(b, new THREE.Matrix4(), dress.rifle, { rifleSilencer: silencer }, dress.rifleShape);
      const { geometry } = b.build(new THREE.MeshStandardMaterial());
      const n = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      geometry.dispose();
      return n;
    };
    expect(tris(FIGURE.detail.low, false)).toBe(tris(FIGURE.detail.high, false));
    expect(tris(FIGURE.detail.high, true)).toBeGreaterThan(tris(FIGURE.detail.high, false));
    expect(tris(FIGURE.detail.low, true)).toBe(tris(FIGURE.detail.low, false));
  });
});
