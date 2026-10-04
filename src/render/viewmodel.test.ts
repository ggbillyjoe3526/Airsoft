import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REDUCED_MOTION } from '../config/accessibility';
import { VIEWMODEL } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { createArmament, fitOptics, fitParts } from '../sim/armament';
import { AEG_MUZZLE, buildReplicaModels, PISTOL_MUZZLE, RIFLE_OPTIC, RIFLE_SCOPE } from './replicaModels';
import { magazineOut, magazineSwap, sprintCarry, Viewmodel } from './viewmodel';

/** Each replica's typed model parts (replicaModels.ts), built apart from the viewmodel's: the same offsets. */
const reference = buildReplicaModels(LOADOUT, 0x3a7bd5, VIEWMODEL.orangeTips);
const partsOf = (id: string) => reference.models.get(id)!;
afterAll(() => reference.dispose());

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
      const frame = () => vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
      frame();
      expect(hand.position.length()).toBe(0);
      // Mid-swap: hand and magazine are far below the magwell together.
      let deepest = 0;
      for (arm.reload = replica.reloadTime; arm.reload > 0; arm.reload -= dt) {
        frame();
        deepest = Math.max(deepest, mag[slot]!.position.length());
        if (arm.reload < replica.reloadTime - VIEWMODEL.reload.handMoveTime - dt) {
          // Once there, the hand holds the magazine: it moves exactly with it.
          const toMag = partsOf(replica.id).supportHand.toMag;
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

describe('Viewmodel reload with a fitted magazine (M17b)', () => {
  it("the support hand reaches the fitted magazine's base plate: higher on a low-cap, lower on an extended one", () => {
    const parts = [{ grip: 'none', magazine: 'lowCap' }, { grip: 'none', magazine: 'extended' }] as const;
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT, [...parts]);
    const hands: THREE.Object3D[] = [];
    vm.scene.traverse((o) => o.name === 'supportHand' && hands.push(o));
    const dt = 1 / 60;
    for (const [slot, replica] of LOADOUT.entries()) {
      arm.active = slot;
      const ref = partsOf(replica.id).magazine;
      const base = ref.bases.get(ref.group.getObjectByName(`magazine:${parts[slot]!.magazine}`)!)!;
      expect(base).toBeDefined();
      // Once the hand is on the magazine, it sits at the standard grab plus the fitted base's offset.
      arm.reload = replica.reloadTime;
      for (let t = 0; t < VIEWMODEL.reload.handMoveTime + 2 * dt; t += dt, arm.reload -= dt) vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
      const mag = hands[slot]!.parent!.getObjectByName('magazine')!;
      const expected = partsOf(replica.id).supportHand.toMag.clone().add(base).add(mag.position);
      expect(hands[slot]!.position.distanceTo(expected)).toBeLessThan(1e-9);
      expect(Math.sign(base.y)).toBe(parts[slot]!.magazine === 'lowCap' ? 1 : -1);
      arm.reload = 0;
      for (let t = 0; t <= VIEWMODEL.reload.handMoveTime + dt; t += dt) vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
    }
    vm.dispose();
  });
});

describe('Viewmodel weapon switch mid-reload', () => {
  it('draws the other replica with its support hand on the grip, not snapping from the magazine', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const hands: THREE.Object3D[] = [];
    vm.scene.traverse((o) => o.name === 'supportHand' && hands.push(o));
    const dt = 1 / 60;
    const frame = () => vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
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
    const frame = (yaw: number) => vm.update(dt, yaw, 0, 0, 4.2, 0, arm, false, 0);
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
    const [optic] = named(vm, 'optic:redDot');
    const [up] = named(vm, 'sightsUp');
    const [down] = named(vm, 'sightsDown');
    expect(named(vm, 'optic:redDot')).toHaveLength(1); // only the rifle has a rail for one
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect([optic!.visible, up!.visible, down!.visible]).toEqual([false, true, false]);
    fitOptics(arm, ['redDot', null]);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect([optic!.visible, up!.visible, down!.visible]).toEqual([true, false, true]);
    vm.dispose();
  });

  it('shows only the fitted optic, grip and magazine on each replica (M17b)', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const shown = (name: string) => named(vm, name).map((o) => o.visible);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect([...shown('magazine:standard'), ...shown('magazine:hiCap'), ...shown('magazine:extended')]).toEqual([true, true, false, false]);
    expect([...shown('grip:vertical'), ...shown('grip:angled'), ...shown('optic:scope2x')]).toEqual([false, false, false]);
    fitOptics(arm, ['scope2x', null]);
    fitParts(arm, [
      { grip: 'angled', magazine: 'hiCap' },
      { grip: 'none', magazine: 'extended' },
    ]);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    // Two standard magazines (rifle, pistol): both are swapped for the fitted kind.
    expect([...shown('magazine:standard'), ...shown('magazine:hiCap'), ...shown('magazine:extended')]).toEqual([false, false, true, true]);
    expect([...shown('grip:vertical'), ...shown('grip:angled'), ...shown('optic:scope2x'), ...shown('optic:redDot')]).toEqual([false, true, true, false]);
    vm.dispose();
  });

  it("shows the pistol's red laser only when it is fitted (M26b)", () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const shown = () => named(vm, 'laser:redLaser').map((o) => o.visible);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect(shown()).toEqual([false]);
    fitParts(arm, [
      { grip: 'none', magazine: 'standard' },
      { grip: 'none', magazine: 'standard', laser: 'redLaser' },
    ]);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect(shown()).toEqual([true]);
    vm.dispose();
  });

  it('raised to the eye, puts the 2× scope on the same axis as the red dot (M17b)', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    fitOptics(arm, ['scope2x', null]);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 1);
    const [scope] = named(vm, 'optic:scope2x');
    scope!.updateWorldMatrix(true, false);
    const sc = RIFLE_SCOPE;
    const back = scope!.localToWorld(new THREE.Vector3(0, RIFLE_OPTIC.axisUp, -(sc.from - sc.eyeLength)));
    const front = scope!.localToWorld(new THREE.Vector3(0, RIFLE_OPTIC.axisUp, -(sc.from + sc.length + sc.bellLength)));
    for (const p of [back, front]) {
      expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-6);
      expect(p.z).toBeLessThan(-VIEWMODEL.near);
    }
    vm.dispose();
  });

  it('raised to the eye, puts the optic square on the view centre line, where BBs go', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    fitOptics(arm, ['redDot', null]);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 1);
    const [optic] = named(vm, 'optic:redDot');
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
    fitOptics(arm, ['redDot', null]);
    for (let i = 0; i < 5; i++) vm.onShot(); // full auto: the kick is at kickMax
    vm.update(0, 0, 0, 0, 4.2, 0, arm, false, 1);
    const [optic] = named(vm, 'optic:redDot');
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
      for (let i = 0; i < 60; i++) vm.update(dt, 0, 0, 6, 4.2, 1, arm, false, 0); // sprinting
      const total = 0.2;
      // The lockout runs down a tick a frame; the frame before firing unlocks still has a tick of it left.
      for (let lockout = total; lockout > dt / 2; lockout -= dt) vm.update(dt, 0, 0, 3, 4.2, sprintCarry(lockout, total), arm, false, 0);
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

describe('Viewmodel reduced motion (M18)', () => {
  /** Where the held replica sits after walking and turning for a second, then firing a shot. */
  function after(reduced: boolean): { walkY: number[]; turned: number; kicked: number } {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    if (reduced) vm.setMotion(REDUCED_MOTION);
    const arm = createArmament(LOADOUT);
    arm.draw = 0;
    const rig = vm.scene.children.find((o) => o instanceof THREE.Group)!;
    const walkY: number[] = [];
    const dt = 1 / 60;
    vm.update(dt, 0, 0, 4.2, 4.2, 0, arm, false, 0);
    for (let i = 0; i < 60; i++) {
      vm.update(dt, 0, 0, 4.2, 4.2, 0, arm, false, 0);
      walkY.push(rig.position.y);
    }
    vm.update(dt, 0.3, 0, 0, 4.2, 0, arm, false, 0);
    const turned = rig.position.x;
    const rest = rig.position.z;
    vm.onShot();
    vm.update(dt, 0.3, 0, 0, 4.2, 0, arm, false, 0);
    return { walkY, turned, kicked: rig.position.z - rest };
  }

  it('takes away the walk bob and the sway behind a turn, and halves the kick', () => {
    const full = after(false);
    const reduced = after(true);
    const spread = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
    expect(spread(full.walkY)).toBeGreaterThan(0.005);
    expect(spread(reduced.walkY)).toBeCloseTo(0, 9);
    expect(Math.abs(full.turned)).toBeGreaterThan(0.005);
    expect(reduced.turned).toBeCloseTo(0, 9);
    expect(reduced.kicked).toBeCloseTo(full.kicked * REDUCED_MOTION.kick, 6);
    expect(full.kicked).toBeGreaterThan(0);
  });
});

describe('Viewmodel barrels and muzzle parts (M29b)', () => {
  it('shows the fitted barrel and silencer and moves the muzzle out to their end; the flash hider shows as it comes', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const fittedParts = [{ grip: 'none', magazine: 'standard', barrel: 'long', muzzle: 'silencer' }, { grip: 'none', magazine: 'standard', muzzle: 'silencer' }] as const;
    const stock = createArmament(LOADOUT);
    const fitted = createArmament(LOADOUT, [...fittedParts]);
    const named = (name: string) => {
      const found: THREE.Object3D[] = [];
      vm.scene.traverse((o) => o.name === name && found.push(o));
      return found;
    };
    const muzzleZ = (slot: number) => {
      const marker = named('muzzle')[slot]!;
      return marker.getWorldPosition(new THREE.Vector3()).applyMatrix4(marker.parent!.parent!.matrixWorld.clone().invert()).z;
    };
    const frame = (arm: ReturnType<typeof createArmament>) => {
      vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
      vm.scene.updateMatrixWorld(true);
    };
    frame(stock);
    expect(named('barrel:long')[0]!.visible).toBe(false);
    expect(named('muzzle:none')[0]!.visible).toBe(true);
    expect(named('muzzle:silencer').every((o) => !o.visible)).toBe(true);
    const stockZ = [muzzleZ(0), muzzleZ(1)];
    frame(fitted);
    expect(named('barrel:long')[0]!.visible).toBe(true);
    expect(named('muzzle:none')[0]!.visible).toBe(false);
    expect(named('muzzle:silencer').every((o) => o.visible)).toBe(true);
    // Forward is -z: the muzzle now sits past the longer barrel and the silencer.
    expect(muzzleZ(0)).toBeCloseTo(stockZ[0]! - AEG_MUZZLE.extensions.long - (AEG_MUZZLE.tips.silencer - AEG_MUZZLE.tips.none), 6);
    expect(muzzleZ(1)).toBeCloseTo(stockZ[1]! - PISTOL_MUZZLE.tips.silencer, 6);
    vm.dispose();
  });
});
