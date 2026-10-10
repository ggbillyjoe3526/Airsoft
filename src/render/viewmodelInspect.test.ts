import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { type InspectCue, VIEWMODEL } from '../config/render';
import { AEG, CYBER_PISTOL, GAS_PISTOL, type ReplicaConfig } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { prepareReplicaFile, type ReplicaFiles } from './replicaFiles';
import { HUMAN_ARMS, LOW_DETAIL } from './replicaModels';
import { inspectPose, type InspectOffset, NO_INSPECT, Viewmodel } from './viewmodel';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array; existsSync(path: URL): boolean };

async function scene(path: string): Promise<THREE.Object3D | null> {
  const url = new URL(path, import.meta.url);
  if (!existsSync(url)) return null;
  const buf = readFileSync(url);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

/** The game's replica files for these ids, as the renderer loads them. */
async function filesFor(ids: readonly string[]): Promise<ReplicaFiles> {
  const files = new Map();
  for (const id of ids) files.set(id, prepareReplicaFile(id, (await scene(`../assets/models/replicas/${id}.glb`))!, await scene(`../assets/models/replicaParts/${id}.glb`)));
  return files;
}

const DT = 1 / 60;

/** A viewmodel holding `loadout` from its files, an armament for it, and a frame of play (nothing else going on). */
async function rig(loadout: readonly ReplicaConfig[]) {
  const vm = new Viewmodel(16 / 9, 0x3a7bd5, loadout, LOW_DETAIL, null, HUMAN_ARMS, await filesFor(loadout.map((r) => r.id)));
  const arm = createArmament(loadout);
  arm.active = 0;
  const sounds: [InspectCue, string][] = [];
  vm.onInspectSound = (cue, id) => sounds.push([cue, id]);
  const state = { carry: 0, calling: false, aim: 0 };
  const frame = (): void => vm.update(DT, 0, 0, 0, 4.2, state.carry, arm, state.calling, state.aim);
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) frame();
  };
  const find = (name: string): THREE.Object3D => {
    let found: THREE.Object3D | undefined;
    vm.scene.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found!;
  };
  /** The model in hand (its slot's group: the replica's own rotation is the hold's plus any pose). */
  const model = (slot: number): THREE.Object3D => (vm as unknown as { slots: { model: THREE.Object3D }[] }).slots[slot]!.model;
  const magazine = (slot: number): THREE.Object3D => (vm as unknown as { slots: { mag: { group: THREE.Object3D } }[] }).slots[slot]!.mag.group;
  return { vm, arm, sounds, state, frame, run, find, model, magazine };
}

describe('inspectPose', () => {
  const keys = VIEWMODEL.inspect.poses.rifle.keys;
  const out: InspectOffset = { ...NO_INSPECT };
  /** At the hold: nothing added (a zero weight can leave a -0). */
  const atHold = (o: InspectOffset): boolean => Object.values(o).every((v) => Math.abs(v) < 1e-12);

  it('starts and ends at the hold, passes through each key, and scales by its weight', () => {
    expect(atHold(inspectPose(keys, 0, 1, out))).toBe(true);
    expect(atHold(inspectPose(keys, 1, 1, out))).toBe(true);
    const key = keys[2]!;
    const at = inspectPose(keys, key.at, 1, out);
    expect(at.turn).toBeCloseTo(key.turn, 6);
    expect(at.inward).toBeCloseTo(key.inward, 6);
    expect(inspectPose(keys, key.at, 0.5, out).turn).toBeCloseTo(key.turn / 2, 6);
    expect(atHold(inspectPose(keys, 0.3, 0, out))).toBe(true);
  });

  it('moves smoothly: no jumps between consecutive 60 Hz frames (under 3.5 degrees of turn each)', () => {
    for (const pose of Object.values(VIEWMODEL.inspect.poses)) {
      const step = DT / pose.duration;
      let prev = inspectPose(pose.keys, 0, 1, { ...NO_INSPECT });
      for (let s = step; s <= 1; s += step) {
        const now = inspectPose(pose.keys, s, 1, { ...NO_INSPECT });
        for (const k of ['tilt', 'turn', 'roll'] as const) expect(Math.abs(now[k] - prev[k])).toBeLessThan(0.06);
        prev = now;
      }
    }
  });

  it('every first-person model\'s pose starts and ends at the hold, with its keys and sounds in order', () => {
    for (const pose of Object.values(VIEWMODEL.inspect.poses)) {
      expect(pose.keys[0]!.at).toBe(0);
      expect(pose.keys[pose.keys.length - 1]!.at).toBe(1);
      expect(atHold(inspectPose(pose.keys, 0, 1, out))).toBe(true);
      expect(atHold(inspectPose(pose.keys, 1, 1, out))).toBe(true);
      for (let i = 1; i < pose.keys.length; i++) expect(pose.keys[i]!.at).toBeGreaterThan(pose.keys[i - 1]!.at);
      for (let i = 1; i < pose.sounds.length; i++) expect(pose.sounds[i]!.at).toBeGreaterThanOrEqual(pose.sounds[i - 1]!.at);
    }
  });
});

describe('inspecting the replica in hand (RM2)', () => {
  it('plays the AEG\'s Inspect clip with the pose and its sounds, then is back at the hold', async () => {
    const { vm, sounds, frame, run, find, model } = await rig([AEG, GAS_PISTOL]);
    frame();
    const handle = find('rig_chargingHandle');
    const rest = handle.position.clone();
    const holdYaw = model(0).rotation.y;
    vm.inspect();
    run(0.6);
    expect(vm.inspecting).toBe(true);
    // The charging handle is back and the replica is turned side on.
    expect(handle.position.distanceTo(rest)).toBeGreaterThan(0.02);
    expect(Math.abs(model(0).rotation.y - holdYaw)).toBeGreaterThan(0.5);
    run(3);
    expect(vm.inspecting).toBe(false);
    expect(handle.position.distanceTo(rest)).toBeLessThan(1e-6);
    expect(model(0).rotation.y).toBeCloseTo(holdYaw, 6);
    expect(sounds.map(([cue]) => cue)).toEqual(VIEWMODEL.inspect.poses.rifle.sounds.map((s) => s.cue));
    expect(sounds.every(([, id]) => id === 'aeg')).toBe(true);
    vm.dispose();
  });

  it('times the inspect by the file\'s clip: the gas pistol\'s press check takes its 2 s, the slide back and home', async () => {
    const { vm, arm, frame, run, find } = await rig([AEG, GAS_PISTOL]);
    arm.active = 1;
    frame();
    const slide = find('rig_slide');
    const rest = slide.position.clone();
    vm.inspect();
    run(0.9);
    expect(slide.position.distanceTo(rest)).toBeGreaterThan(0.015);
    run(1.2);
    expect(vm.inspecting).toBe(false);
    expect(slide.position.distanceTo(rest)).toBeLessThan(1e-6);
    vm.dispose();
  });

  it('slides the Cyber Pistol\'s battery out of the grip and home (its file moves only the magazine)', async () => {
    const { vm, arm, frame, run, magazine } = await rig([AEG, CYBER_PISTOL]);
    arm.active = 1;
    frame();
    expect(magazine(1).position.length()).toBe(0);
    vm.inspect();
    run(1);
    // A finger's width down the magwell (about 1.5 cm).
    const out = magazine(1).position.clone();
    expect(out.length()).toBeGreaterThan(0.01);
    expect(out.length()).toBeLessThan(0.03);
    expect(out.y).toBeLessThan(0);
    run(1.2);
    expect(vm.inspecting).toBe(false);
    expect(magazine(1).position.length()).toBeLessThan(1e-6);
    vm.dispose();
  });

  it('does not start while the hands are busy: reloading, drawing, carried for a sprint, aiming or calling a hit', async () => {
    const { vm, arm, state, frame, run } = await rig([AEG, GAS_PISTOL]);
    frame();
    const tries: [string, () => void, () => void][] = [
      ['reload', () => (arm.reload = 1), () => (arm.reload = 0)],
      ['draw', () => (arm.draw = 0.3), () => (arm.draw = 0)],
      ['sprint', () => (state.carry = 1), () => (state.carry = 0)],
      ['aim', () => (state.aim = 0.5), () => (state.aim = 0)],
      ['hit', () => (state.calling = true), () => (state.calling = false)],
    ];
    for (const [, busy, free] of tries) {
      busy();
      vm.inspect();
      run(0.2);
      expect(vm.inspecting).toBe(false);
      free();
      run(0.5);
    }
    // Asked while busy, it isn't kept for later either.
    vm.inspect();
    frame();
    expect(vm.inspecting).toBe(true);
    vm.dispose();
  });

  it('ends at once on a shot, the replica back at its hold before the BB is drawn from its muzzle', async () => {
    const { vm, frame, run, model, find } = await rig([AEG, GAS_PISTOL]);
    frame();
    const holdYaw = model(0).rotation.y;
    vm.inspect();
    run(1);
    expect(Math.abs(model(0).rotation.y - holdYaw)).toBeGreaterThan(0.5);
    vm.onShot();
    // No update yet: the muzzle the shot is drawn from is already back in line.
    expect(model(0).rotation.y).toBeCloseTo(holdYaw, 6);
    expect(vm.inspecting).toBe(false);
    frame();
    expect(find('rig_chargingHandle')).toBeTruthy();
    vm.dispose();
  });

  it('eases back when cut short by a reload or a replica switch, and a second press mid-inspect changes nothing', async () => {
    const { vm, arm, frame, run, model } = await rig([AEG, GAS_PISTOL]);
    frame();
    const holdYaw = model(0).rotation.y;
    vm.inspect();
    run(1);
    vm.inspect();
    frame();
    expect(vm.inspecting).toBe(true);
    arm.reload = 1;
    frame();
    // Still turned part of the way: it eases back over cancelTime.
    expect(vm.inspecting).toBe(true);
    run(VIEWMODEL.inspect.cancelTime + DT);
    expect(vm.inspecting).toBe(false);
    arm.reload = 0;
    frame();
    expect(model(0).rotation.y).toBeCloseTo(holdYaw, 6);

    vm.inspect();
    run(0.5);
    arm.active = 1;
    arm.draw = 0.3;
    frame();
    run(VIEWMODEL.inspect.cancelTime + DT);
    expect(vm.inspecting).toBe(false);
    vm.dispose();
  });
});
