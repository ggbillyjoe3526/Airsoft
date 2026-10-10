import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { prepareReplicaFile } from './replicaFiles';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

async function scene(path: string): Promise<THREE.Object3D | null> {
  try {
    const buf = readFileSync(new URL(path, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
    gltf.scene.animations = gltf.animations;
    return gltf.scene;
  } catch {
    return null;
  }
}

const fileOf = async (id: string) => prepareReplicaFile(id, (await scene(`../assets/models/replicas/${id}.glb`))!, await scene(`../assets/models/replicaParts/${id}.glb`));

describe('the model files\' Inspect clips (RM2)', () => {
  it('Cyber Pistol: a magazine track for Inspect, and a rig that has the clip (duration 2 s)', async () => {
    const f = await fileOf('cyber');
    const track = f.rig!.magazine.get('Inspect');
    expect(track).toBeDefined();
    expect(track!.times.length).toBeGreaterThan(1);
    const last = track!.times[track!.times.length - 1]!;
    expect(last).toBeCloseTo(2, 2);
    // It moves, and comes home.
    const v = track!.values;
    expect(Math.hypot(...[...v].slice(0, 3))).toBeLessThan(1e-6);
    expect(Math.hypot(...[...v].slice(-3))).toBeLessThan(1e-6);
    expect(Math.max(...[...v].map(Math.abs))).toBeGreaterThan(0.01);
  });

  it('bone-only Inspect clips (AEG, gas pistol) have no magazine track, and no clip moves the magazine as a bone', async () => {
    for (const id of ['aeg', 'pistol']) {
      const f = await fileOf(id);
      expect(f.rig!.clips.has('Inspect')).toBe(true);
      expect(f.rig!.magazine.has('Inspect')).toBe(false);
      for (const clip of f.rig!.clips.get('Inspect') ? [f.rig!.clips.get('Inspect')!] : []) for (const t of clip.tracks) expect(t.name).not.toMatch(/magazine/i);
    }
  });
});
