import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LOADOUT } from '../config/replicas';
import { createArmament, fitParts } from '../sim/armament';
import { robotShell } from './figurePalette';
import { type ArmStyle, buildReplicaModels, fitMuzzle, HUMAN_ARMS, LOW_DETAIL, type ReplicaDetail } from './replicaModels';
import { Viewmodel } from './viewmodel';

const HIGH: ReplicaDetail = { replica: 'high', hands: 'high' };
const ROBOT: ArmStyle = { robot: true, shell: robotShell(0) };
const DETAILS: ReadonlyArray<readonly [string, ReplicaDetail]> = [['low', LOW_DETAIL], ['high', HIGH]];
const DT = 1 / 60;

const named = (vm: Viewmodel, name: string): THREE.Object3D[] => {
  const found: THREE.Object3D[] = [];
  vm.scene.traverse((o) => o.name === name && found.push(o));
  return found;
};
/** Triangles of the meshes that are actually drawn (every ancestor visible) under `root`. */
const shownTriangles = (root: THREE.Object3D): number => {
  let n = 0;
  const walk = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    if (o instanceof THREE.Mesh) n += o.geometry.getAttribute('position').count / 3;
    o.children.forEach(walk);
  };
  walk(root);
  return n;
};
const grips = (vm: Viewmodel, slot: number) => ({
  none: named(vm, 'hold:none')[slot]!,
  vertical: named(vm, 'hold:vertical')[slot],
});

describe('FP1 AC2: barrel and muzzle devices sit on the bore', () => {
  it.each(DETAILS)('%s detail: every barrel and muzzle device is centred on (0, layout.up) within 1 mm', (_n, detail) => {
    const models = buildReplicaModels(LOADOUT, 0x3a7bd5, true, detail);
    let checked = 0;
    for (const [id, model] of models.models) {
      model.group.updateMatrixWorld(true);
      const up = model.mount.layout.up;
      const parts = [
        ...model.group.children.filter((c) => c.name.startsWith('barrel:')),
        ...model.mount.group.children.filter((c) => c.name.startsWith('muzzle:')),
      ];
      for (const part of parts) {
        const box = new THREE.Box3().setFromObject(part);
        if (box.isEmpty()) continue;
        const c = box.getCenter(new THREE.Vector3());
        expect(Math.abs(c.x), `${id} ${part.name} across`).toBeLessThan(0.001);
        expect(Math.abs(c.y - up), `${id} ${part.name} up`).toBeLessThan(0.001);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3); // the rifle's barrel(s) and silencer, the pistol's silencer
    models.dispose();
  });

  it('with a long barrel and a silencer fitted the muzzle device and bore marker line up on the bore', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, HIGH);
    const arm = createArmament(LOADOUT);
    fitParts(arm, [
      { grip: 'none', magazine: 'standard', barrel: 'long', muzzle: 'silencer' },
      { grip: 'none', magazine: 'standard', muzzle: 'silencer' },
    ]);
    vm.update(DT, 0, 0, 0, 4.2, 0, arm, false, 0);
    const ref = buildReplicaModels(LOADOUT, 0x3a7bd5, true, HIGH);
    for (const [slot, r] of LOADOUT.entries()) {
      const up = ref.models.get(r.id)!.mount.layout.up;
      const marker = named(vm, 'muzzle')[slot]!;
      const dev = named(vm, 'muzzle:silencer')[slot]!;
      expect(dev.visible).toBe(true);
      expect(marker.position.y).toBeCloseTo(up, 6);
      expect(marker.position.x).toBe(0);
      // The same mount in the reference model (identity transform), moved to the long barrel's end.
      const mount = ref.models.get(r.id)!.mount;
      fitMuzzle(mount, slot === 0 ? 'long' : null, 'silencer');
      mount.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mount.group.getObjectByName('muzzle:silencer')!);
      expect(Math.abs((box.min.y + box.max.y) / 2 - up)).toBeLessThan(0.001);
      expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.001);
      // Its far end is where the bore marker (the BBs' start) sits.
      expect(Math.abs(box.min.z - (mount.group.position.z + mount.marker.position.z))).toBeLessThan(0.001);
    }
    ref.dispose();
    vm.dispose();
  });
});

describe('FP1 AC3: the support hand holds the vertical grip', () => {
  for (const [label, arms] of [['human', HUMAN_ARMS], ['robot', ROBOT]] as const) {
    it(`${label} arms: the rifle builds both holds, the pistol only hold:none`, () => {
      const models = buildReplicaModels(LOADOUT, 0x3a7bd5, true, HIGH, null, 'hands', arms);
      expect([...models.models.get('aeg')!.supportHand.holds.keys()].sort()).toEqual(['none', 'vertical']);
      expect([...models.models.get('pistol')!.supportHand.holds.keys()]).toEqual(['none']);
      const hold = models.models.get('aeg')!.supportHand.holds.get('vertical')!;
      expect(hold.object.name).toBe('hold:vertical');
      let tris = 0;
      hold.object.traverse((o) => o instanceof THREE.Mesh && (tris += o.geometry.getAttribute('position').count / 3));
      expect(tris).toBeGreaterThan(0);
      models.dispose();
    });
  }

  it('shows hold:vertical and hides hold:none with the grip fitted, and swaps back when it is removed; angled and none keep hold:none', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const show = (rifleGrip: 'vertical' | 'angled' | 'none') => {
      fitParts(arm, [{ grip: rifleGrip, magazine: 'standard' }, { grip: 'none', magazine: 'standard' }]);
      vm.update(DT, 0, 0, 0, 4.2, 0, arm, false, 0);
      return grips(vm, 0);
    };
    let g = show('none');
    expect([g.none.visible, g.vertical!.visible]).toEqual([true, false]);
    g = show('vertical');
    expect([g.none.visible, g.vertical!.visible]).toEqual([false, true]);
    g = show('angled');
    expect([g.none.visible, g.vertical!.visible]).toEqual([true, false]);
    g = show('vertical');
    expect(g.vertical!.visible).toBe(true);
    g = show('none');
    expect([g.none.visible, g.vertical!.visible]).toEqual([true, false]);
    // The pistol has no vertical hold and always shows hold:none.
    expect(named(vm, 'hold:vertical')).toHaveLength(1);
    expect(named(vm, 'hold:none')[1]!.visible).toBe(true);
    vm.dispose();
  });

  it('on a reload with the vertical grip the hand moves by the vertical hold’s own toMag, to the magazine', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const ref = buildReplicaModels(LOADOUT, 0x3a7bd5, true);
    const rifle = ref.models.get('aeg')!;
    const own = rifle.supportHand.holds.get('vertical')!.toMag;
    const plain = rifle.supportHand.holds.get('none')!.toMag;
    const arm = createArmament(LOADOUT);
    fitParts(arm, [{ grip: 'vertical', magazine: 'standard' }, { grip: 'none', magazine: 'standard' }]);
    const hand = named(vm, 'supportHand')[0]!;
    const mag = named(vm, 'magazine')[0]!;
    const replica = LOADOUT[0]!;
    arm.reload = replica.reloadTime;
    let mid = false;
    for (; arm.reload > 0; arm.reload -= DT) {
      vm.update(DT, 0, 0, 0, 4.2, 0, arm, false, 0);
      if (arm.reload < replica.reloadTime / 2 && arm.reload > replica.reloadTime / 3) {
        mid = true;
        expect(hand.position.clone().sub(own).distanceTo(mag.position)).toBeLessThan(1e-9);
        if (own.distanceTo(plain) > 1e-6) expect(hand.position.clone().sub(plain).distanceTo(mag.position)).toBeGreaterThan(1e-6);
      }
    }
    expect(mid).toBe(true);
    ref.dispose();
    vm.dispose();
  });
});

describe('FP1 AC4: one hold is drawn at a time', () => {
  for (const [label, arms] of [['human', HUMAN_ARMS], ['robot', ROBOT]] as const) {
    it.each(DETAILS)(`${label} arms, %s detail: the support hand draws no more triangles or meshes with the vertical grip than with none`, (_n, detail) => {
      const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, detail, null, arms);
      const arm = createArmament(LOADOUT);
      const count = (grip: 'none' | 'vertical') => {
        fitParts(arm, [{ grip, magazine: 'standard' }, { grip: 'none', magazine: 'standard' }]);
        vm.update(DT, 0, 0, 0, 4.2, 0, arm, false, 0);
        const hand = named(vm, 'supportHand')[0]!;
        let meshes = 0;
        hand.traverse((o) => o instanceof THREE.Mesh && o.visible && meshes++);
        return { tris: shownTriangles(hand), meshes };
      };
      const bare = count('none');
      const gripped = count('vertical');
      expect(bare.tris).toBeGreaterThan(0);
      // Allow a little for a different pose's finger count; two holds drawn at once would about double it.
      expect(gripped.tris).toBeLessThanOrEqual(bare.tris * 1.1);
      expect(gripped.meshes).toBeLessThanOrEqual(bare.meshes + 2);
      vm.dispose();
    });
  }
});
