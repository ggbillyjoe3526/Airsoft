import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { REPLICA_FILE } from '../../config/assets';
import { AEG, GAS_PISTOL, type ReplicaConfig } from '../../config/replicas';
import { createArmament, fitOptics, fitParts } from '../../sim/armament';
import { fitParts as fitPicture } from './itemPictures';
import { prepareReplicaFile, type ReplicaFiles } from './replicaFiles';
import { buildReplicaModels, HUMAN_ARMS, LOW_DETAIL, REPLICA_PART_TABLES } from './replicaModels';
import { Viewmodel } from './viewmodel';

// RM8: the redesigned optics, silencers and torches in the parts files, their sight lines and under-laser markers.

const nodeFs = 'node:fs';
const { readFileSync, statSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array; statSync(path: URL): { size: number } };

const dir = (name: string): URL => new URL(`../../assets/models/${name}`, import.meta.url);
async function scene(name: string): Promise<THREE.Object3D> {
  const buf = readFileSync(dir(name));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}
async function filesFor(ids: readonly string[]): Promise<ReplicaFiles> {
  const files = new Map();
  for (const id of ids) files.set(id, prepareReplicaFile(id, await scene(`replicas/${id}.glb`), await scene(`replicaParts/${id}.glb`)));
  return files;
}

const FILE_OF = [['aeg', 'aeg'], ['pistol', 'pistol'], ['cyber', 'cyber']] as const;
const files = await filesFor(['aeg', 'pistol', 'cyber']);

function vmOf(loadout: readonly ReplicaConfig[], withFiles: boolean): Viewmodel {
  return new Viewmodel(16 / 9, 0x3a7bd5, loadout, LOW_DETAIL, null, HUMAN_ARMS, withFiles ? files : undefined);
}
const slotOf = (vm: Viewmodel, i: number) => (vm as unknown as { slots: { aimHold: readonly number[] | undefined; sightHolds: ReadonlyMap<string, readonly number[]>; light: { object: THREE.Object3D } | null }[] }).slots[i]!;
const named = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => o.name === name && out.push(o));
  return out;
};

describe('the parts files (RM8)', () => {
  it('draw every part their replica\'s table draws, and stay under the part-size warning', () => {
    for (const [id, table] of FILE_OF) {
      const file = files.get(id)!;
      for (const name of Object.keys(REPLICA_PART_TABLES[table].parts)) expect(file.parts.has(name), `${id} ${name}`).toBe(true);
      const limit = REPLICA_FILE.warnPartBytes[id] ?? REPLICA_FILE.warnPartBytes.default!;
      expect(statSync(dir(`replicaParts/${id}.glb`)).size).toBeLessThan(limit);
    }
    // The new parts in particular.
    for (const name of ['optic:redDot', 'optic:scope2x', 'muzzle:silencer', 'light:weaponTorch']) expect(files.get('aeg')!.parts.has(name), name).toBe(true);
    for (const name of ['muzzle:silencer', 'light:weaponTorch']) expect(files.get('pistol')!.parts.has(name), name).toBe(true);
    expect(files.get('cyber')!.parts.has('light:weaponTorch')).toBe(true);
  });

  it('mark the new optics\' sight lines at 0.104 m and the pistol torch\'s move under the laser', () => {
    const aeg = files.get('aeg')!;
    expect(aeg.sightLines.get('optic:redDot')).toBeCloseTo(0.104, 3);
    expect(aeg.sightLines.get('optic:scope2x')).toBeCloseTo(0.104, 3);
    const move = files.get('pistol')!.underLaser.get('light:weaponTorch')!;
    expect(move.x).toBeCloseTo(0, 4);
    expect(move.y).toBeCloseTo(-0.016, 4);
    expect(move.z).toBeCloseTo(0, 4);
  });
});

describe('aiming down a file optic (RM8)', () => {
  it('raises the replica so the sight line runs through the eye: the aim hold with y = -sightLine; built-in models keep the aim hold', () => {
    const vm = vmOf([AEG, GAS_PISTOL], true);
    const slot = slotOf(vm, 0);
    expect(slot.sightHolds.get('redDot')).toEqual([AEG.look.aimHold![0], -files.get('aeg')!.sightLines.get('optic:redDot')!, AEG.look.aimHold![2]]);
    expect(slot.sightHolds.get('redDot')![1]).toBeCloseTo(-0.104, 3);
    expect(slot.aimHold).toEqual(AEG.look.aimHold);
    vm.dispose();
    const plain = vmOf([AEG, GAS_PISTOL], false);
    expect(slotOf(plain, 0).sightHolds.size).toBe(0);
    expect(slotOf(plain, 0).aimHold).toEqual([0, -0.126, -0.205]);
    plain.dispose();
  });

  it('keeps the file red dot\'s view centre inside the glass at the strongest recoil kick', () => {
    const vm = vmOf([AEG, GAS_PISTOL], true);
    const arm = createArmament([AEG, GAS_PISTOL]);
    fitOptics(arm, ['redDot', null]);
    for (let i = 0; i < 5; i++) vm.onShot();
    vm.update(0, 0, 0, 0, 4.2, 0, arm, false, 1);
    const [optic] = named(vm.scene, 'optic:redDot');
    optic!.updateWorldMatrix(true, false);
    const toLocal = optic!.matrixWorld.clone().invert();
    const eye = new THREE.Vector3(0, 0, 0).applyMatrix4(toLocal);
    const far = new THREE.Vector3(0, 0, -1).applyMatrix4(toLocal);
    const axisUp = files.get('aeg')!.sightLines.get('optic:redDot')!;
    let worst = 0;
    for (const forward of [-0.002, 0.048]) {
      const t = (-forward - eye.z) / (far.z - eye.z);
      worst = Math.max(worst, Math.hypot(eye.x + (far.x - eye.x) * t, eye.y + (far.y - eye.y) * t - axisUp));
    }
    expect(worst).toBeLessThan(0.0118);
    expect(worst).toBeGreaterThan(0); // it still kicks a little
    vm.dispose();
  });
});

describe('the torch under the laser (RM8)', () => {
  const torchY = (vm: Viewmodel, i: number): number => slotOf(vm, i).light!.object.position.y;

  it('moves in the viewmodel only while the laser is fitted, and is back without it', () => {
    const vm = vmOf([AEG, GAS_PISTOL], true);
    const arm = createArmament([AEG, GAS_PISTOL]);
    const tick = (): void => vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    tick();
    expect(torchY(vm, 1)).toBe(0);
    fitParts(arm, [{ grip: 'none', magazine: 'standard' }, { grip: 'none', magazine: 'standard', laser: 'redLaser', light: 'weaponTorch' }]);
    tick();
    expect(torchY(vm, 1)).toBeCloseTo(-0.016, 4);
    fitParts(arm, [{ grip: 'none', magazine: 'standard' }, { grip: 'none', magazine: 'standard', light: 'weaponTorch' }]);
    tick();
    expect(torchY(vm, 1)).toBe(0);
    vm.dispose();
  });

  it('moves in an item picture\'s model too', () => {
    const { models, dispose } = buildReplicaModels([GAS_PISTOL], 0x3a7bd5, false, LOW_DETAIL, null, 'hands', HUMAN_ARMS, files);
    const model = models.get(GAS_PISTOL.id)!;
    expect(model.light).toBeTruthy();
    fitPicture(model, { laser: 'redLaser', light: 'weaponTorch' });
    expect(model.light!.object.position.y).toBeCloseTo(-0.016, 4);
    fitPicture(model, { light: 'weaponTorch' });
    expect(model.light!.object.position.y).toBe(0);
    dispose();
  });

  it('is as before without files: no torch move and no sight lines on the built-in models', () => {
    const { models, dispose } = buildReplicaModels([AEG, GAS_PISTOL], 0x3a7bd5, false);
    for (const m of models.values()) {
      expect(m.light ?? null).toBeNull();
      expect(m.sightLines?.size ?? 0).toBe(0);
    }
    dispose();
  });
});
