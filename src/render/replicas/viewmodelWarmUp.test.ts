import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LOADOUT } from '../../config/replicas';
import { createArmament } from '../../sim/armament';
import { Viewmodel } from './viewmodel';

/**
 * The owner's 0.1 Dev 6 playtest, note 26: a hitch on the first weapon switch of a match. The warm-up compile
 * (CombatPresentation.warmShaders) reaches only what a draw would: visible objects inside the camera's view. The replica
 * not in hand was hidden, so its materials were built and its pipelines compiled on the first switch to it.
 */

/** The meshes a draw (or Three's compile) of the viewmodel's scene would take: visible all the way up, and in view. */
function drawn(vm: Viewmodel): Set<THREE.Object3D> {
  vm.scene.updateMatrixWorld(true);
  vm.camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(vm.camera.projectionMatrix, vm.camera.matrixWorldInverse));
  const out = new Set<THREE.Object3D>();
  vm.scene.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh && (!o.frustumCulled || frustum.intersectsObject(o))) out.add(o);
  });
  return out;
}

/** Every mesh in slot `i`'s replica (the model the viewmodel shows for that slot). */
function meshesOf(vm: Viewmodel, i: number): THREE.Object3D[] {
  const model = (vm as unknown as { slots: { model: THREE.Object3D }[] }).slots[i]!.model;
  const out: THREE.Object3D[] = [];
  model.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o));
  return out;
}

const models = (vm: Viewmodel) => (vm as unknown as { slots: { model: THREE.Object3D }[] }).slots.map((s) => s.model);

describe('the warm-up compile reaches every carried replica (Dev 6 playtest note 26)', () => {
  it('shows every slot to the compile, as built (before any frame), and in view, then hides them again', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    expect(LOADOUT.length).toBeGreaterThan(1);
    // As the session's build ends: no frame yet, so no slot is shown.
    expect(models(vm).every((m) => !m.visible)).toBe(true);
    let seen = new Set<THREE.Object3D>();
    vm.withEverySlotShown(() => (seen = drawn(vm)));
    for (let i = 0; i < LOADOUT.length; i++) {
      const meshes = meshesOf(vm, i);
      expect(meshes.length, LOADOUT[i]!.id).toBeGreaterThan(0);
      // Each replica has meshes a draw takes (its parts not fitted may stay hidden: they are not drawn either).
      expect(meshes.some((m) => seen.has(m)), LOADOUT[i]!.id).toBe(true);
    }
    expect(models(vm).every((m) => !m.visible)).toBe(true);
    vm.dispose();
  });

  it('after frames, reaches the replica not in hand and puts back the one in hand only', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    for (let i = 0; i < 3; i++) vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect(models(vm).map((m) => m.visible)).toEqual(LOADOUT.map((_, i) => i === 0));
    // A plain draw (or compile) takes none of the pistol's meshes: the first switch to it would build them.
    expect(meshesOf(vm, 1).some((m) => drawn(vm).has(m))).toBe(false);
    let seen = new Set<THREE.Object3D>();
    vm.withEverySlotShown(() => (seen = drawn(vm)));
    expect(meshesOf(vm, 1).some((m) => seen.has(m))).toBe(true);
    expect(models(vm).map((m) => m.visible)).toEqual(LOADOUT.map((_, i) => i === 0));
    vm.dispose();
  });

  it('puts the visibility back when the compile throws', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    expect(() =>
      vm.withEverySlotShown(() => {
        throw new Error('lost device');
      }),
    ).toThrow('lost device');
    expect(models(vm).every((m) => !m.visible)).toBe(true);
    vm.dispose();
  });

  it('with the replica holstered, restores every slot hidden, and a nested call restores what it found', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    arm.holstered = true;
    for (let i = 0; i < 90; i++) vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    const before = models(vm).map((m) => m.visible);
    expect(before.some(Boolean)).toBe(false);
    vm.withEverySlotShown(() => {
      expect(models(vm).every((m) => m.visible)).toBe(true);
      vm.withEverySlotShown(() => {});
      expect(models(vm).every((m) => m.visible)).toBe(true);
    });
    expect(models(vm).map((m) => m.visible)).toEqual(before);
    vm.dispose();
  });
});
