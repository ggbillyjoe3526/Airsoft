import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { LOADOUT } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { prepareReplicaFile, type ReplicaFile, type ReplicaFiles } from './replicaFiles';
import { buildReplicaModels, HUMAN_ARMS, LOW_DETAIL } from './replicaModels';
import { slidingRig } from './replicaRig';
import { Viewmodel } from './viewmodel';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

async function scene(path: string): Promise<THREE.Object3D> {
  const buf = readFileSync(new URL(path, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

const fileOf = async (id: 'aeg' | 'pistol'): Promise<ReplicaFile> =>
  prepareReplicaFile(id, await scene(`../assets/models/replicas/${id}.glb`), await scene(`../assets/models/replicaParts/${id}.glb`));

const TRAVEL = 0.026;
const dt = 1 / 60;
const PISTOL = LOADOUT.findIndex((r) => r.id === 'pistol');

/** The slide's bone position along the bore (+Z is back), found by name under any object. */
const slideZ = (root: THREE.Object3D): number => root.getObjectByName('rig_slide')!.position.z;

describe('slidingRig (RM7)', () => {
  it('builds one bone at rest with each clip a share of the travel, in time steps', () => {
    const f = slidingRig('slide', 0.1, 0.5, { Fire: [0, 1, 0], Lock: [1, 1] });
    expect(f.bones.map((b) => b.name)).toEqual(['slide']);
    expect([...f.clips.keys()]).toEqual(['Fire', 'Lock']);
    expect(f.clips.get('Fire')!.duration).toBeCloseTo(1, 9);
    const track = f.clips.get('Fire')!.tracks[0]!;
    expect(track.values.length).toBe(9);
    expect(track.values[2]).toBeCloseTo(0, 9);
    expect(track.values[5]).toBeCloseTo(0.1, 6);
    expect(track.values[8]).toBeCloseTo(0, 9);
    expect(f.clips.get('Lock')!.tracks[0]!.values[2]).toBeCloseTo(0.1, 6);
  });
});

describe('the built-in GBB Pistol slide (RM7)', () => {
  const build = () => buildReplicaModels(LOADOUT, 0x3a7bd5, false, LOW_DETAIL);

  it('rides a skinned bone in the body\'s own meshes, with no extra meshes for it', () => {
    const models = build();
    const { group, rig } = models.models.get('pistol')!;
    expect(rig).toBeTruthy();
    expect(rig!.duration('Fire')).toBeGreaterThan(0);
    expect(rig!.duration('SlideLock')).toBeGreaterThan(0);
    let skinned = 0;
    group.traverse((o) => o instanceof THREE.SkinnedMesh && skinned++);
    expect(skinned).toBeGreaterThan(0);
    // Every direct child mesh with a twin merged: no two meshes share a name.
    const names = group.children.filter((c) => c instanceof THREE.Mesh).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    models.dispose();
  });

  it('Fire kicks the slide back along +Z and home; SlideLock holds it 0.026 back and wins over Fire', () => {
    const models = build();
    const { group, rig } = models.models.get('pistol')!;
    const rest = slideZ(group);
    expect(rest).toBeCloseTo(0, 9);
    let peak = 0;
    for (let t = 0; t <= rig!.duration('Fire'); t += dt) {
      rig!.set('Fire', t);
      rig!.apply();
      peak = Math.max(peak, slideZ(group) - rest);
    }
    expect(peak).toBeCloseTo(TRAVEL, 3);
    rig!.set('Fire', rig!.duration('Fire'));
    rig!.apply();
    expect(slideZ(group) - rest).toBeCloseTo(0, 6);
    rig!.set('Fire', rig!.duration('Fire') * 0.1);
    rig!.set('SlideLock', rig!.duration('SlideLock'));
    rig!.apply();
    expect(slideZ(group) - rest).toBeCloseTo(TRAVEL, 6);
    rig!.set('Fire', 0);
    rig!.apply();
    expect(slideZ(group) - rest).toBeCloseTo(TRAVEL, 6);
    rig!.set('SlideLock', 0);
    rig!.apply();
    expect(slideZ(group) - rest).toBeCloseTo(0, 6);
    models.dispose();
  });

  it('the AEG and Cyber Pistol have no SlideLock clip', () => {
    const models = build();
    for (const r of LOADOUT) {
      if (r.id === 'pistol') continue;
      const rig = models.models.get(r.id)!.rig;
      expect(rig?.duration('SlideLock') ?? 0).toBe(0);
    }
    models.dispose();
  });
});

describe('the GBB Pistol model file (RM7)', () => {
  it('has SlideLock after Fire, and Fire moves the slide', async () => {
    const file = await fileOf('pistol');
    const clips = [...file.rig!.clips.keys()];
    expect(clips).toEqual(expect.arrayContaining(['Fire', 'Reload', 'Inspect', 'SlideLock']));
    expect(clips.indexOf('SlideLock')).toBeGreaterThan(clips.indexOf('Fire'));
    const moves = (clip: string, bone: string): boolean =>
      file.rig!.clips.get(clip)!.tracks.some((t) => t.name.includes(bone) && t.name.endsWith('.position'));
    expect(moves('Fire', 'slide')).toBe(true);
    expect(moves('SlideLock', 'slide')).toBe(true);
  });

  it('drawn from the file: Fire moves the slide bone and SlideLock holds it back over Fire', async () => {
    const files: ReplicaFiles = new Map([['pistol', await fileOf('pistol')]]);
    const models = buildReplicaModels(LOADOUT, 0x3a7bd5, false, LOW_DETAIL, null, 'bare', undefined, files);
    const { group, rig } = models.models.get('pistol')!;
    const slide = group.getObjectByName('rig_slide')!;
    const rest = slide.position.clone();
    rig!.set('Fire', rig!.duration('Fire') * 0.4);
    rig!.apply();
    const kicked = slide.position.distanceTo(rest);
    expect(kicked).toBeGreaterThan(0.005);
    rig!.set('Fire', 0);
    rig!.set('SlideLock', rig!.duration('SlideLock'));
    rig!.apply();
    const locked = slide.position.distanceTo(rest);
    expect(locked).toBeGreaterThan(0.005);
    rig!.set('Fire', rig!.duration('Fire') * 0.4);
    rig!.apply();
    expect(slide.position.distanceTo(rest)).toBeCloseTo(locked, 6);
    models.dispose();
  });
});

describe('the slide lock in first person (RM7)', () => {
  for (const mode of ['built-in', 'file'] as const) {
    it(`${mode}: an empty magazine locks the slide back from the last shot's peak, and a refill sends it home`, async () => {
      const files = mode === 'file' ? new Map([['pistol', await fileOf('pistol')]]) : undefined;
      const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, LOW_DETAIL, null, HUMAN_ARMS, files);
      const arm = createArmament(LOADOUT);
      arm.active = PISTOL;
      const frame = (): void => vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
      const slide = (): THREE.Object3D => {
        let found: THREE.Object3D | undefined;
        vm.scene.traverse((o) => {
          if (o.name === 'rig_slide') found = o;
        });
        return found!;
      };
      for (let i = 0; i < 5; i++) frame();
      const bone = slide();
      const rest = bone.position.clone();
      const away = (): number => bone.position.distanceTo(rest);
      expect(away()).toBeLessThan(1e-6);

      // A shot with rounds left kicks the slide and it comes home.
      vm.onShot();
      let peak = 0;
      for (let t = 0; t < 1; t += dt) {
        frame();
        peak = Math.max(peak, away());
      }
      expect(peak).toBeGreaterThan(0.005);
      expect(away()).toBeLessThan(1e-6);

      // The last shot: the magazine is empty. Not locked before Fire reaches its peak; the slide then stays back.
      arm.ammo[PISTOL]!.mag = 0;
      vm.onShot();
      frame();
      const early = away();
      for (let t = 0; t < 1; t += dt) frame();
      const locked = away();
      expect(locked).toBeGreaterThan(0.005);
      expect(early).toBeLessThan(locked);
      for (let t = 0; t < 1; t += dt) frame();
      expect(away()).toBeCloseTo(locked, 6);

      // A full magazine seated: home.
      arm.ammo[PISTOL]!.mag = arm.ammo[PISTOL]!.mag + 10;
      for (let t = 0; t < 0.5; t += dt) frame();
      expect(away()).toBeLessThan(1e-6);
      vm.dispose();
    });
  }

  it('the AEG and Cyber Pistol never lock with an empty magazine', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, LOW_DETAIL, null, HUMAN_ARMS);
    const arm = createArmament(LOADOUT);
    for (let slot = 0; slot < LOADOUT.length; slot++) {
      if (slot === PISTOL) continue;
      arm.active = slot;
      arm.ammo[slot]!.mag = 0;
      for (let i = 0; i < 30; i++) vm.update(dt, 0, 0, 0, 4.2, 0, arm, false, 0);
      const rig = (vm as unknown as { slots: { parts3d: { duration(n: string): number } | null }[] }).slots[slot]!.parts3d;
      expect(rig?.duration('SlideLock') ?? 0).toBe(0);
    }
    expect(slideZ(vm.scene)).toBeCloseTo(0, 9);
    vm.dispose();
  });
});
