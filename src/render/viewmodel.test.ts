import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VIEWMODEL } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { createArmament, fitOptic } from '../sim/armament';
import { RIFLE_OPTIC } from './replicaModels';
import { magazineOut, magazineSwap, sprintCarry, Viewmodel } from './viewmodel';

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
      const frame = () => vm.update(dt, 0, 0, 0, 4.2, 0, arm, LOADOUT, false, 0);
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
    const frame = () => vm.update(dt, 0, 0, 0, 4.2, 0, arm, LOADOUT, false, 0);
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
    const frame = (yaw: number) => vm.update(dt, yaw, 0, 0, 4.2, 0, arm, LOADOUT, false, 0);
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

describe('Viewmodel optic', () => {
  const named = (vm: Viewmodel, name: string): THREE.Object3D[] => {
    const found: THREE.Object3D[] = [];
    vm.scene.traverse((o) => o.name === name && found.push(o));
    return found;
  };

  it('shows the optic only when one is fitted, folding the iron sights down under it', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const [optic] = named(vm, 'optic');
    const [up] = named(vm, 'sightsUp');
    const [down] = named(vm, 'sightsDown');
    expect(named(vm, 'optic')).toHaveLength(1); // only the rifle has a rail for one
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, LOADOUT, false, 0);
    expect([optic!.visible, up!.visible, down!.visible]).toEqual([false, true, false]);
    fitOptic(arm, LOADOUT, 'redDot');
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, LOADOUT, false, 0);
    expect([optic!.visible, up!.visible, down!.visible]).toEqual([true, false, true]);
    vm.dispose();
  });

  it('raised to the eye, puts the optic square on the view centre line, where BBs go', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    fitOptic(arm, LOADOUT, 'redDot');
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, LOADOUT, false, 1);
    const [optic] = named(vm, 'optic');
    optic!.updateWorldMatrix(true, false);
    const o = RIFLE_OPTIC;
    const back = optic!.localToWorld(new THREE.Vector3(0, o.axisUp, -o.from));
    const front = optic!.localToWorld(new THREE.Vector3(0, o.axisUp, -(o.from + o.length)));
    for (const p of [back, front]) {
      expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-6); // on the axis the viewmodel camera looks down
      expect(p.z).toBeLessThan(-VIEWMODEL.near); // in front of the eye, past the near clip
    }
    expect(front.z).toBeLessThan(back.z);
    vm.dispose();
  });

  it('keeps the dot (the view centre) inside the glass at the strongest recoil kick', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    fitOptic(arm, LOADOUT, 'redDot');
    for (let i = 0; i < 5; i++) vm.onShot(); // full auto: the kick is at kickMax
    vm.update(0, 0, 0, 0, 4.2, 0, arm, LOADOUT, false, 1);
    const [optic] = named(vm, 'optic');
    optic!.updateWorldMatrix(true, false);
    // The view's centre line (from the eye along -Z) in the optic's own frame.
    const toLocal = optic!.matrixWorld.clone().invert();
    const eye = new THREE.Vector3(0, 0, 0).applyMatrix4(toLocal);
    const far = new THREE.Vector3(0, 0, -1).applyMatrix4(toLocal);
    const o = RIFLE_OPTIC;
    let tilt = 0;
    for (const forward of [o.from, o.from + o.length]) {
      // Where the line crosses the tube's end (local z = -forward), measured from the tube's axis.
      const t = (-forward - eye.z) / (far.z - eye.z);
      const off = Math.hypot(eye.x + (far.x - eye.x) * t, eye.y + (far.y - eye.y) * t - o.axisUp);
      expect(off).toBeLessThan(o.inner);
      tilt = Math.max(tilt, off);
    }
    expect(tilt).toBeGreaterThan(0); // it still kicks a little
    vm.dispose();
  });
});

describe('sprint carry', () => {
  it('comes down over the post-sprint lockout and is gone before firing unlocks', () => {
    expect(sprintCarry(0.2, 0.2)).toBe(1);
    expect(sprintCarry(0.1, 0.2)).toBeGreaterThan(0);
    expect(sprintCarry(0.2 * VIEWMODEL.carrySquareAt, 0.2)).toBe(0);
    expect(sprintCarry(0, 0.2)).toBe(0);
    expect(sprintCarry(0.1, 0)).toBe(0); // no lockout configured: never carried
  });

  for (const [slot, replica] of LOADOUT.entries()) {
    it(`${replica.id}: a shot straight out of a sprint leaves a replica back in its hold (level, at its hold yaw)`, () => {
      const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
      const arm = createArmament(LOADOUT);
      arm.active = slot;
      const dt = 1 / 60;
      for (let i = 0; i < 60; i++) vm.update(dt, 0, 0, 6, 4.2, 1, arm, LOADOUT, false, 0); // sprinting
      const total = 0.2;
      // The lockout runs down a tick a frame; the frame before firing unlocks still has a tick of it left.
      for (let lockout = total; lockout > dt / 2; lockout -= dt) vm.update(dt, 0, 0, 3, 4.2, sprintCarry(lockout, total), arm, LOADOUT, false, 0);
      const markers: THREE.Object3D[] = [];
      vm.scene.traverseVisible((o) => o.name === 'muzzle' && markers.push(o));
      vm.scene.updateMatrixWorld(true);
      const barrel = new THREE.Vector3(0, 0, -1).transformDirection(markers[0]!.matrixWorld);
      expect(Math.abs(barrel.y)).toBeLessThan(1e-9);
      expect(Math.atan2(-barrel.x, -barrel.z)).toBeCloseTo(replica.look.hold.yaw, 9);
      vm.dispose();
    });
  }
});
