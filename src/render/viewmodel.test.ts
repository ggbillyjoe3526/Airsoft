import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VIEWMODEL } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { magazineOut, magazineSwap, Viewmodel } from './viewmodel';

describe('magazineOut', () => {
  const R = VIEWMODEL.reload;

  it('starts seated, is fully out mid-reload and is seated again before the reload ends', () => {
    expect(magazineOut(0)).toBe(0);
    expect(magazineOut(R.magOutEnd)).toBe(1);
    expect(magazineOut((R.magOutEnd + R.magInStart) / 2)).toBe(1);
    expect(magazineOut(R.magSeated)).toBe(0);
    expect(magazineOut(1)).toBe(0);
  });

  it('moves smoothly: no jumps between consecutive frames of a reload', () => {
    let prev = magazineOut(0);
    for (let p = 0.01; p <= 1; p += 0.01) {
      const v = magazineOut(p);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});

describe('magazineSwap', () => {
  const R = VIEWMODEL.reload;

  it('only happens while the magazine is fully out, peaking halfway', () => {
    expect(magazineSwap(0)).toBe(0);
    expect(magazineSwap(R.magOutEnd)).toBe(0);
    expect(magazineSwap((R.magOutEnd + R.magInStart) / 2)).toBeCloseTo(1, 9);
    expect(magazineSwap(R.magInStart)).toBe(0);
    expect(magazineSwap(1)).toBe(0);
  });
});

describe('Viewmodel reload', () => {
  for (const [slot, replica] of LOADOUT.entries()) {
    it(`${replica.id}: the support hand goes to the magazine, follows it out of view and back, then returns`, () => {
      const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
      const arm = createArmament(LOADOUT);
      arm.active = slot;
      const hands: THREE.Object3D[] = [];
      vm.scene.traverse((o) => o.name === 'supportHand' && hands.push(o));
      const hand = hands[slot]!;
      const mag: THREE.Object3D[] = [];
      vm.scene.traverse((o) => o.name === 'magazine' && mag.push(o));
      const dt = 1 / 60;
      const frame = () => vm.update(dt, 0, 0, 0, 4.2, false, arm, LOADOUT, false);
      frame();
      expect(hand.position.length()).toBe(0);
      // Mid-swap: hand and magazine are far below the magwell together.
      let deepest = 0;
      for (arm.reload = replica.reloadTime; arm.reload > 0; arm.reload -= dt) {
        frame();
        deepest = Math.max(deepest, mag[slot]!.position.length());
        if (arm.reload < replica.reloadTime - VIEWMODEL.reload.handMoveTime - dt) {
          // Once there, the hand holds the magazine: it moves exactly with it.
          const toMag = hand.userData.toMag as THREE.Vector3;
          expect(hand.position.clone().sub(toMag).distanceTo(mag[slot]!.position)).toBeLessThan(1e-9);
        }
      }
      expect(deepest).toBeGreaterThan(VIEWMODEL.reload.magTravel + VIEWMODEL.reload.swapTravel * 0.9);
      arm.reload = 0;
      for (let t = 0; t <= VIEWMODEL.reload.handMoveTime + dt; t += dt) frame();
      expect(hand.position.length()).toBeLessThan(1e-9);
      expect(mag[slot]!.position.length()).toBe(0);
      vm.dispose();
    });
  }
});

describe('Viewmodel weapon switch mid-reload', () => {
  it('draws the other replica with its support hand on the grip, not snapping from the magazine', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const hands: THREE.Object3D[] = [];
    vm.scene.traverse((o) => o.name === 'supportHand' && hands.push(o));
    const dt = 1 / 60;
    const frame = () => vm.update(dt, 0, 0, 0, 4.2, false, arm, LOADOUT, false);
    arm.reload = LOADOUT[0]!.reloadTime;
    for (let i = 0; i < 30; i++, arm.reload -= dt) frame();
    expect(hands[0]!.position.length()).toBeGreaterThan(0.1);
    // Switching cancels the reload and draws the pistol.
    arm.reload = 0;
    arm.active = 1;
    frame();
    expect(hands[1]!.position.length()).toBe(0);
    expect(hands[0]!.position.length()).toBe(0);
    vm.dispose();
  });
});

describe('Viewmodel sway', () => {
  it('does not swing the replica when the view is set rather than turned (first frame, a new round)', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const rig = vm.scene.children.find((o) => o instanceof THREE.Group && o.children.length > 0)!;
    const dt = 1 / 60;
    const frame = (yaw: number) => vm.update(dt, yaw, 0, 0, 4.2, false, arm, LOADOUT, false);
    frame(2.5); // first frame, already facing the spawn yaw
    const rest = rig.position.x;
    frame(2.5);
    expect(rig.position.x).toBeCloseTo(rest, 9);
    // A new round snaps the view to another spawn yaw.
    vm.resetSway();
    frame(-0.5);
    expect(rig.position.x).toBeCloseTo(rest, 9);
    // A real turn still sways it.
    frame(-0.4);
    expect(Math.abs(rig.position.x - rest)).toBeGreaterThan(1e-3);
    vm.dispose();
  });
});
