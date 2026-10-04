import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import { createArmament, fitParts } from '../sim/armament';
import { buildHand, type GeometrySink, type HandPose } from './handModels';
import { heightToNormal, projectSpeckleUvs, speckleHeights, speckleTextures } from './replicaFinish';
import { AEG_MUZZLE, buildReplicaModels, CYBER_MUZZLE, fitMuzzle, LOW_DETAIL, PISTOL_MUZZLE, REPLICA_PART_TABLES, type ReplicaModels } from './replicaModels';
import { Viewmodel } from './viewmodel';

const HIGH = { replica: 'high', hands: 'high' } as const;
/** The two factory replicas and the Cyber Pistol (M32), whose model is its own. */
const WITH_CYBER = [...LOADOUT, CYBER_PISTOL];
const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};
const trianglesOf = (root: THREE.Object3D): number => meshesOf(root).reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);
/**
 * A replica's triangles drawn at once as it comes: its body, the support hand, the standing sights, the standard
 * magazine and its bare muzzle's device (M29b's flash hider, on the muzzle mount).
 */
const drawn = (models: ReplicaModels, id: string): number => {
  const { group } = models.models.get(id)!;
  const fitted = ['optic:', 'grip:', 'laser:', 'barrel:'];
  let n = 0;
  for (const child of group.children) {
    if (fitted.some((kind) => child.name.startsWith(kind)) || child.name === 'sightsDown') continue;
    if (child.name === 'magazine') n += trianglesOf(child.getObjectByName('magazine:standard')!);
    else if (child.name === 'muzzleMount') n += child.getObjectByName('muzzle:none') ? trianglesOf(child.getObjectByName('muzzle:none')!) : 0;
    else n += trianglesOf(child);
  }
  return n;
};

describe('Replica detail (FA8, QualitySettings.replicaDetail)', () => {
  it('keeps Low as it was: no texture coordinates, colours or maps, and the same triangles (a viewmodel pass is not dearer)', () => {
    const low = buildReplicaModels(LOADOUT, 0x3a7bd5, false);
    // Pinned from the models before the overhaul (the rifle 10,844 at once, the pistol 7,944).
    expect(drawn(low, 'aeg')).toBe(10844);
    expect(drawn(low, 'pistol')).toBe(7944);
    for (const r of LOADOUT) {
      for (const m of meshesOf(low.models.get(r.id)!.group)) {
        expect(m.geometry.getAttribute('uv'), m.name).toBeUndefined();
        expect(m.geometry.getAttribute('color'), m.name).toBeUndefined();
        const mat = m.material as THREE.MeshStandardMaterial;
        expect(mat.roughnessMap ?? null).toBeNull();
        expect(mat.normalMap ?? null).toBeNull();
      }
    }
    low.dispose();
  });

  it('draws the high replicas with bevels, speckle and edge highlights, within a third more triangles', () => {
    const low = buildReplicaModels(LOADOUT, 0x3a7bd5, false);
    const high = buildReplicaModels(LOADOUT, 0x3a7bd5, false, HIGH);
    for (const r of LOADOUT) {
      expect(drawn(high, r.id), r.id).toBeGreaterThan(drawn(low, r.id));
      expect(drawn(high, r.id), r.id).toBeLessThan(drawn(low, r.id) * 1.35);
      for (const m of meshesOf(high.models.get(r.id)!.group)) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.roughnessMap) expect(m.geometry.getAttribute('uv'), `${r.id} ${m.name} needs uvs for its speckle`).toBeDefined();
      }
    }
    // The polymer's bevels are lighter than its flat faces (the edge highlight), its worn edges lighter still; a flat
    // face is its colour as before (the material is brightened by as much as the vertex colour darkens it).
    const polymer = high.models.get('aeg')!.group.children.find((c) => c.name === 'polymer') as THREE.Mesh;
    const col = polymer.geometry.getAttribute('color');
    const levels = new Set<number>();
    for (let i = 0; i < col.count; i++) levels.add(Math.round(col.getX(i) * 1000) / 1000);
    const base = 1 / REPLICA_FINISH.wearLight;
    expect([...levels].sort()).toEqual([base, base * REPLICA_FINISH.edgeLight, 1].map((v) => Math.round(v * 1000) / 1000).sort());
    const flat = new THREE.Color(0x2a2c31);
    expect((polymer.material as THREE.MeshStandardMaterial).color.r * base).toBeCloseTo(flat.r, 6);
    low.dispose();
    high.dispose();
  });

  it('draws every part in each replica\'s table, by name, on both levels, the high one with more to it', () => {
    for (const [id, table] of Object.entries(REPLICA_PART_TABLES)) {
      const low = buildReplicaModels(WITH_CYBER, 0x3a7bd5, false);
      const high = buildReplicaModels(WITH_CYBER, 0x3a7bd5, false, HIGH);
      const names = [...Object.keys(table.parts), ...Object.keys(table.magazines).map((m) => `magazine:${m}`), ...Object.keys(table.muzzles).map((m) => `muzzle:${m}`)];
      for (const name of names) {
        const lo = low.models.get(id)!.group.getObjectByName(name)!;
        const hi = high.models.get(id)!.group.getObjectByName(name)!;
        // The Tight-Bore is the one part Low draws nothing for (as M29b did): an empty group, no draw call.
        if (name === 'barrel:tightBore') expect(meshesOf(lo), name).toHaveLength(0);
        else expect(trianglesOf(lo), name).toBeGreaterThan(0);
        expect(trianglesOf(hi), name).toBeGreaterThan(trianglesOf(lo));
        // A part stays a handful of draw calls: one mesh per material it uses.
        expect(meshesOf(hi).length, name).toBeLessThanOrEqual(4);
      }
      low.dispose();
      high.dispose();
    }
  });

  it('draws the barrels and silencers (M29b) on every level with the BBs leaving the fitted muzzle\'s front face', () => {
    const box = new THREE.Box3();
    const marker = new THREE.Vector3();
    for (const detail of [LOW_DETAIL, HIGH]) {
      const models = buildReplicaModels(LOADOUT, 0x3a7bd5, true, detail);
      // Every combination M29b allows: the AEG's three barrels with and without a silencer, the pistol bare or silenced.
      const fits = [
        ...([null, 'long', 'tightBore'] as const).flatMap((barrel) => ([null, 'silencer'] as const).map((device) => ({ id: 'aeg', layout: AEG_MUZZLE, barrel, device }))),
        ...([null, 'silencer'] as const).map((device) => ({ id: 'pistol', layout: PISTOL_MUZZLE, barrel: null, device })),
      ];
      expect(fits).toHaveLength(8);
      for (const f of fits) {
        const { group, mount, muzzle } = models.models.get(f.id)!;
        fitMuzzle(mount, f.barrel, f.device);
        group.updateMatrixWorld(true);
        const where = `${detail.replica} ${f.id} ${f.barrel} ${f.device}`;
        muzzle.getWorldPosition(marker);
        expect(marker.y, where).toBeCloseTo(f.layout.up, 6);
        expect(marker.x, where).toBeCloseTo(0, 6);
        // The mount sits on the fitted barrel's end: the long barrel's front is where the device starts.
        const barrelEnd = -(f.layout.barrelEnd + (f.barrel === 'long' ? AEG_MUZZLE.extensions.long : 0));
        expect(mount.group.position.z, where).toBeCloseTo(barrelEnd, 6);
        const barrel = f.barrel ? group.getObjectByName(`barrel:${f.barrel}`)! : null;
        if (barrel && (f.barrel !== 'tightBore' || detail.replica === 'high')) expect(box.setFromObject(barrel).min.z, where).toBeCloseTo(f.barrel === 'long' ? barrelEnd : -f.layout.barrelEnd, 3);
        // The BB leaves the fitted device's front face (within the bore's 0.5 mm lip on high).
        const device = group.getObjectByName(`muzzle:${f.device ?? 'none'}`);
        if (device) {
          expect(Math.abs(box.setFromObject(device).min.z - marker.z), where).toBeLessThan(0.0006);
          expect(trianglesOf(device), where).toBeGreaterThan(0);
        } else expect(marker.z, where).toBeCloseTo(barrelEnd, 6);
      }
      models.dispose();
    }
  });

  it('gives the high optics glossy glass and the laser an emissive lens; Low keeps its unlit ones', () => {
    const low = buildReplicaModels(LOADOUT, 0x3a7bd5, false);
    const high = buildReplicaModels(LOADOUT, 0x3a7bd5, false, HIGH);
    const lensOf = (m: ReplicaModels, model: string, part: string, key: string) => (m.models.get(model)!.group.getObjectByName(part)!.getObjectByName(key) as THREE.Mesh).material;
    expect(lensOf(low, 'aeg', 'optic:redDot', 'lens')).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(lensOf(low, 'pistol', 'laser:redLaser', 'laserLens')).toBeInstanceOf(THREE.MeshBasicMaterial);
    const glass = lensOf(high, 'aeg', 'optic:redDot', 'lens') as THREE.MeshStandardMaterial;
    expect(glass).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(glass.roughness).toBe(REPLICA_FINISH.glass.roughness);
    const laser = lensOf(high, 'pistol', 'laser:redLaser', 'laserLens') as THREE.MeshStandardMaterial;
    expect(laser.emissiveIntensity).toBe(REPLICA_FINISH.laserGlow);
    low.dispose();
    high.dispose();
  });

  it('makes the high replica\'s steel metallic only with something to reflect', () => {
    const high = buildReplicaModels(LOADOUT, 0x3a7bd5, false, HIGH);
    const metal = (high.models.get('aeg')!.group.getObjectByName('metal') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(metal.metalness).toBe(REPLICA_FINISH.metal.unlit.metalness);
    high.setReflections(true);
    expect(metal.metalness).toBe(REPLICA_FINISH.metal.lit.metalness);
    expect(metal.roughness).toBe(REPLICA_FINISH.metal.lit.roughness);
    high.setReflections(false);
    expect(metal.metalness).toBe(REPLICA_FINISH.metal.unlit.metalness);
    high.dispose();
  });

  it('frees every geometry, material and texture it made', () => {
    const high = buildReplicaModels(LOADOUT, 0x3a7bd5, false, HIGH);
    const live = new Set<{ addEventListener: (t: 'dispose', f: () => void) => void }>();
    const freed = new Set<unknown>();
    const watch = (r: { addEventListener: (t: 'dispose', f: () => void) => void } | null | undefined) => {
      if (!r || live.has(r)) return;
      live.add(r);
      r.addEventListener('dispose', () => freed.add(r));
    };
    const roots = [...[...high.models.values()].map((m) => m.group), high.raisedHand];
    for (const root of roots) {
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return;
        watch(o.geometry);
        const mat = o.material as THREE.MeshStandardMaterial;
        watch(mat);
        watch(mat.roughnessMap);
        watch(mat.normalMap);
      });
    }
    high.dispose();
    expect(freed.size).toBe(live.size);
    expect(live.size).toBeGreaterThan(20);
  });
});

describe('the moulded speckle (FA8)', () => {
  it('is the same every time, grey ± its noise, and tiles: a flat field gives straight-up normals', () => {
    const S = REPLICA_FINISH.speckle;
    const a = speckleHeights(S.size, S.grey, S.noise, S.seed);
    expect(a).toEqual(speckleHeights(S.size, S.grey, S.noise, S.seed));
    const mean = a.reduce((s, v) => s + v, 0) / a.length;
    expect(Math.abs(mean - S.grey)).toBeLessThan(1);
    expect(Math.max(...a) - Math.min(...a)).toBeLessThanOrEqual(S.noise * 2 + 1);
    const flat = heightToNormal(new Uint8Array(16).fill(100), 4, S.normalStrength);
    for (let i = 0; i < 16; i++) {
      expect(Math.abs(flat[i * 4]! - 127.5)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(flat[i * 4 + 1]! - 127.5)).toBeLessThanOrEqual(0.5);
      expect(flat[i * 4 + 2]).toBe(255);
    }
    const bumpy = heightToNormal(a, S.size, S.normalStrength);
    let tilted = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(bumpy[i * 4]! - 127.5) > 1) tilted++;
    expect(tilted).toBeGreaterThan(a.length / 2);
  });

  it('makes two small mipmapped textures, about 0.2 MB in all', () => {
    const t = speckleTextures();
    const bytes = [t.roughness, t.normal].reduce((s, tex) => s + tex.image.width * tex.image.height * 4 * (4 / 3), 0);
    expect(bytes).toBeLessThan(0.2e6);
    expect(t.roughness.generateMipmaps && t.normal.generateMipmaps).toBe(true);
    t.dispose();
  });

  it('projects the same grain on every face, whatever its size', () => {
    const geo = new THREE.BoxGeometry(0.1, 0.02, 0.3).toNonIndexed();
    projectSpeckleUvs(geo, 10);
    const uv = geo.getAttribute('uv');
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, Math.abs(uv.getX(i)));
    expect(maxU).toBeCloseTo(1.5, 6); // half the 0.3 m length × 10 per metre
  });
});

describe('Hand detail (FA8, QualitySettings.handDetail)', () => {
  const POSE: HandPose = { side: 'right', palm: [0.034, -0.092, -0.074], across: [0, -1, 0], back: [1, 0, 0], fingers: [[0.1, 0.1, 0.1], [1.2, 1.3, 0.9], [1.2, 1.3, 0.9], [1.2, 1.3, 0.9]], thumb: { swing: 0.9, curl: [0.3, 0.3] } };
  const count = (detail: 'low' | 'high') => {
    const keys = new Set<string>();
    let tris = 0;
    let coloured = 0;
    const sink: GeometrySink = {
      addGeometry: (key, geo) => {
        keys.add(key);
        tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
        if (geo.getAttribute('color')) coloured++;
        geo.dispose();
      },
    };
    buildHand(sink, POSE, detail);
    return { keys, tris, coloured };
  };

  it('keeps the Low glove as REN-10 left it; High adds a knuckle pad, seams and a strapped cuff for under 400 triangles', () => {
    const low = count('low');
    const high = count('high');
    expect([...low.keys]).toEqual(['glove']);
    expect(low.coloured).toBe(0);
    expect(high.keys).toEqual(new Set(['glove', 'rubber', 'metal']));
    expect(high.coloured).toBeGreaterThan(10);
    expect(high.tris - low.tris).toBeGreaterThan(0);
    expect(high.tris - low.tris).toBeLessThan(400);
    expect(high.tris).toBeLessThan(2800);
  });
});

describe('the viewmodel at each detail (FA8)', () => {
  it('rebuilds at a new detail, keeping the fitted parts shown, and draws the laser beam only when asked', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    fitParts(arm, [
      { grip: 'vertical', magazine: 'hiCap' },
      { grip: 'none', magazine: 'standard', laser: 'redLaser' },
    ]);
    arm.active = 1;
    const named = (name: string) => {
      const out: THREE.Object3D[] = [];
      vm.scene.traverse((o) => o.name === name && out.push(o));
      return out;
    };
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    const lowTris = trianglesOf(vm.scene);
    vm.setDetail({ replica: 'high', hands: 'high' });
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    expect(trianglesOf(vm.scene)).toBeGreaterThan(lowTris);
    expect(named('laser:redLaser').map((o) => o.visible)).toEqual([true]);
    expect(named('grip:vertical').map((o) => o.visible)).toEqual([true]);
    expect(named('magazine:hiCap').map((o) => o.visible)).toEqual([true]);
    // One of each replica in the rig: the old ones were taken out.
    expect(named('magazine')).toHaveLength(LOADOUT.length);
    const [beam] = named('laserBeam');
    expect(beam!.visible).toBe(false);
    vm.setLaserBeam(true);
    expect(beam!.visible).toBe(true);
    vm.setDetail(LOW_DETAIL);
    expect(named('laserBeam')[0]!.visible).toBe(true); // the setting survives a rebuild
    vm.dispose();
  });
});

describe('the Cyber Pistol\'s model (M32)', () => {
  const mat = (models: ReplicaModels, key: string) =>
    ((models.models.get('cyber')!.group.children.find((c) => c.name === key) as THREE.Mesh).material as THREE.MeshStandardMaterial).color;

  it('is its own chunky pistol in mint, hot pink and black, the same on either team', () => {
    const blue = buildReplicaModels(WITH_CYBER, 0x3a7bd5, false);
    const red = buildReplicaModels(WITH_CYBER, 0xd54a3a, false);
    // Its own mesh, about as dear as the Gas Pistol's (7,944 at once on Low; 9,140): pinned so a change to it is seen.
    expect(drawn(blue, 'cyber')).toBe(9140);
    expect(mat(blue, 'mint').getHex()).toBe(REPLICA_FINISH.cyber.mint);
    expect(mat(blue, 'pink').getHex()).toBe(REPLICA_FINISH.cyber.pink);
    expect(mat(blue, 'polymer').getHex()).toBe(0x2a2c31);
    for (const key of ['mint', 'pink', 'polymer']) expect(mat(red, key).getHex(), key).toBe(mat(blue, key).getHex());
    // Slab-sided: its slide is wider and taller than the Gas Pistol's.
    const box = (models: ReplicaModels, id: string) => new THREE.Box3().setFromObject(models.models.get(id)!.group.children.find((c) => c.name === (id === 'cyber' ? 'mint' : 'polymer'))!);
    expect(box(blue, 'cyber').max.y).toBeGreaterThan(box(blue, 'pistol').max.y);
    blue.dispose();
    red.dispose();
  });

  it('builds the plain mesh on Low and more on High, with nothing to fit but its own magazine', () => {
    const low = buildReplicaModels(WITH_CYBER, 0x3a7bd5, true);
    const high = buildReplicaModels(WITH_CYBER, 0x3a7bd5, true, HIGH);
    for (const m of meshesOf(low.models.get('cyber')!.group)) {
      expect(m.geometry.getAttribute('uv'), m.name).toBeUndefined();
      expect(m.geometry.getAttribute('color'), m.name).toBeUndefined();
      expect((m.material as THREE.MeshStandardMaterial).roughnessMap ?? null).toBeNull();
    }
    expect(drawn(high, 'cyber')).toBeGreaterThan(drawn(low, 'cyber'));
    expect(drawn(high, 'cyber')).toBeLessThan(drawn(low, 'cyber') * 1.35);
    // High's flat mint is the colour as on Low (brightened by as much as the vertex colour darkens it).
    expect(mat(high, 'mint').r / REPLICA_FINISH.wearLight).toBeCloseTo(mat(low, 'mint').r, 6);
    for (const models of [low, high]) {
      const { group, muzzle } = models.models.get('cyber')!;
      const fittable: string[] = [];
      group.traverse((o) => /^(optic|grip|laser|barrel|muzzle|magazine):/.test(o.name) && fittable.push(o.name));
      expect(fittable).toEqual(['magazine:standard']);
      group.updateMatrixWorld(true);
      const at = muzzle.getWorldPosition(new THREE.Vector3());
      expect(at.z).toBeCloseTo(-CYBER_MUZZLE.barrelEnd, 6);
      expect(at.y).toBeCloseTo(CYBER_MUZZLE.up, 6);
      // The orange tip ends at the muzzle (the Orange tips setting still applies).
      const orange = group.children.find((c) => c.name === 'orange')!;
      expect(new THREE.Box3().setFromObject(orange).min.z).toBeCloseTo(-CYBER_MUZZLE.barrelEnd, 6);
    }
    low.dispose();
    high.dispose();
  });

  it('is what the viewmodel holds when the Cyber Pistol is carried', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, [CYBER_PISTOL, LOADOUT[1]!]);
    const arm = createArmament([CYBER_PISTOL, LOADOUT[1]!]);
    vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 0);
    const pink: THREE.Object3D[] = [];
    vm.scene.traverseVisible((o) => o.name === 'pink' && pink.push(o));
    expect(pink.length).toBeGreaterThan(0);
    vm.dispose();
  });
});
