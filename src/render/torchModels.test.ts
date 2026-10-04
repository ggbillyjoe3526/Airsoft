import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, VIEWMODEL } from '../config/render';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import { TORCHES } from '../config/torches';
import { WOODLAND } from '../map/woodland';
import { createArmament, fitParts } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { BARE_KIT, buildFigure, disposeFigure } from './characterModels';
import { torchFitted } from './characterRenderer';
import { resolveLighting } from './lightingPreset';
import { buildReplicaModels, REPLICA_PART_TABLES } from './replicaModels';
import { Viewmodel } from './viewmodel';

const night = resolveLighting(WOODLAND);
const lightsOf = (scene: THREE.Scene): THREE.Light[] => scene.children.filter((o): o is THREE.Light => o instanceof THREE.Light);
const trianglesOf = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
  });
  return n;
};

describe('the weapon torch modelled (M33h, acceptance 5)', () => {
  it('is a part of all three replicas, shown only while fitted, at either detail', () => {
    for (const table of Object.values(REPLICA_PART_TABLES)) expect(Object.keys(table.parts)).toContain('light:weaponTorch');
    for (const high of [false, true]) {
      const models = buildReplicaModels([...LOADOUT, CYBER_PISTOL], 0x3a7bd5, false, high ? { replica: 'high', hands: 'high' } : undefined);
      for (const r of [...LOADOUT, CYBER_PISTOL]) expect(models.models.get(r.id)!.group.getObjectByName('light:weaponTorch'), r.id).toBeDefined();
      models.dispose();
    }
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const shown = (): boolean => {
      let on = false;
      vm.scene.traverse((o) => {
        if (o.name === 'light:weaponTorch' && o.parent?.visible && o.visible) on = true;
      });
      return on;
    };
    vm.update(1 / 60, 0, 0, 0, 1, 0, arm, false, 0);
    expect(shown()).toBe(false);
    fitParts(arm, arm.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
    vm.update(1 / 60, 0, 0, 0, 2, 0, arm, false, 0);
    expect(shown()).toBe(true);
    vm.dispose();
  });

  it('lights its lens by a uniform (High) or a colour (Low) when switched on', () => {
    const high = buildReplicaModels(LOADOUT, 0x3a7bd5, false, { replica: 'high', hands: 'high' });
    // The lens: the torch's material in the dark glass colour.
    const found: THREE.MeshStandardMaterial[] = [];
    high.models.get(LOADOUT[0]!.id)!.group.getObjectByName('light:weaponTorch')!.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of [o.material].flat()) if (m instanceof THREE.MeshStandardMaterial && m.color.getHex() === REPLICA_FINISH.torch.lensOff) found.push(m);
    });
    const glass = found[0]!;
    expect(glass).toBeDefined();
    const version = glass.version;
    high.setTorchLit(true);
    expect(glass.emissiveIntensity).toBeGreaterThan(0);
    expect(glass.version).toBe(version); // no shader rebuild
    high.setTorchLit(false);
    expect(glass.emissiveIntensity).toBe(0);
    high.dispose();

    const low = buildReplicaModels(LOADOUT, 0x3a7bd5, false);
    const basic: THREE.MeshBasicMaterial[] = [];
    low.models.get(LOADOUT[0]!.id)!.group.getObjectByName('light:weaponTorch')!.traverse((o) => {
      if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) if (m instanceof THREE.MeshBasicMaterial) basic.push(m);
    });
    expect(basic[0]!.color.getHex()).toBe(REPLICA_FINISH.torch.lensOff);
    low.setTorchLit(true);
    expect(basic[0]!.color.getHex()).toBe(TORCHES.weaponTorch.colour);
    low.dispose();
  });

  it("lights the viewmodel by the map's preset and the torch, with its three lights always", () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const lights = lightsOf(vm.scene);
    expect(lights).toHaveLength(3);
    const [hemi, key, rim] = lights as [THREE.HemisphereLight, THREE.DirectionalLight, THREE.DirectionalLight];
    vm.setLighting(LIGHTING_PRESETS.day);
    // By day, exactly the constants it always had.
    expect([hemi.color.getHex(), hemi.groundColor.getHex(), hemi.intensity]).toEqual([...VIEWMODEL.light.hemi]);
    expect([key.color.getHex(), key.intensity]).toEqual([VIEWMODEL.light.keyColor, VIEWMODEL.light.keyIntensity]);
    expect([rim.color.getHex(), rim.intensity]).toEqual([VIEWMODEL.light.rimColor, VIEWMODEL.light.rimIntensity]);
    vm.setTorch(true, TORCHES.weaponTorch.colour); // by day the torch changes no light
    expect([key.color.getHex(), key.intensity]).toEqual([VIEWMODEL.light.keyColor, VIEWMODEL.light.keyIntensity]);
    vm.setTorch(false, TORCHES.weaponTorch.colour);

    vm.setLighting(night);
    expect(hemi.intensity).toBe(night.viewmodel.hemi.intensity);
    expect(hemi.intensity).toBeLessThan(VIEWMODEL.light.hemi[2]);
    expect(key.intensity).toBe(night.viewmodel.key.intensity);
    vm.setTorch(true, TORCHES.weaponTorch.colour);
    expect(key.intensity).toBeCloseTo(night.viewmodel.key.intensity * (1 + night.torch.spillIntensity), 9);
    expect(key.color.getHex()).not.toBe(night.viewmodel.key.colour);
    vm.setTorch(false, TORCHES.weaponTorch.colour);
    expect(key.color.getHex()).toBe(night.viewmodel.key.colour);
    expect(lightsOf(vm.scene)).toHaveLength(3);
    vm.dispose();
  });

  it('is on the figures in third person: 24 triangles on a rifle or pistol carrying one, nothing without', () => {
    const c = createCharacter(1, vec3(), 0, LOADOUT, 1);
    expect(torchFitted(c, false)).toBe(false);
    fitParts(c.armament, c.armament.parts.map((p, i) => (i === 0 ? { ...p, light: 'weaponTorch' as const } : p)));
    expect(torchFitted(c, false)).toBe(true);
    expect(torchFitted(c, true)).toBe(false);
    const build = (kit = BARE_KIT) => buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 1, null, undefined, kit);
    const bare = build();
    const rifle = build({ rifleSilencer: false, rifleTorch: true });
    const pistol = build({ rifleSilencer: false, pistolTorch: true });
    // The rifle is built twice (in the hands, and slung while the pistol is out; one shows at a time).
    expect(trianglesOf(rifle.root) - trianglesOf(bare.root)).toBe(2 * 24);
    expect(trianglesOf(pistol.root) - trianglesOf(bare.root)).toBe(24);
    for (const f of [bare, rifle, pistol]) disposeFigure(f);
  });
});
