import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CYBER_PISTOL } from '../../config/replicas';
import { pistolGrips } from '../figures/figureReplicas';
import { prepareReplicaFile, type ReplicaFile, type ReplicaFilePiece } from './replicaFiles';
import { buildReplicaModels, CYBER_MUZZLE, LOW_DETAIL, type ReplicaDetail } from './replicaModels';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

const HIGH: ReplicaDetail = { replica: 'high', hands: 'high' };

let file: ReplicaFile;
beforeAll(async () => {
  const buf = readFileSync(new URL('../../assets/models/replicas/cyber.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  file = prepareReplicaFile('cyber', gltf.scene);
});

/** The box round every vertex of `pieces` (optionally only those `keep` accepts). */
function boxOf(pieces: readonly ReplicaFilePiece[], keep: (p: THREE.Vector3) => boolean = () => true): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of pieces) {
    const a = p.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      if (keep(v)) box.expandByPoint(v);
    }
  }
  return box;
}

describe('the Cyber Pistol file with a weapon torch (RM5, acceptance 4)', () => {
  for (const [name, detail] of [['low', LOW_DETAIL], ['high', HIGH]] as const) {
    it(`clamps the torch under the rail, its lens level with the muzzle face and its tail clear of the trigger guard (${name})`, () => {
      const built = buildReplicaModels([CYBER_PISTOL], 0, false, detail, null, 'bare', undefined, new Map([['cyber', file]]));
      const model = built.models.get('cyber')!;
      const torch = model.group.getObjectByName('light:weaponTorch')!;
      model.group.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(torch);
      // The lens ends about level with the muzzle face.
      expect(Math.abs(box.min.z - file.muzzle.z)).toBeLessThan(0.004);
      // The guard is the frame below the slide behind the torch; the torch's tail stays ahead of it, with a gap.
      const guard = boxOf([...file.body, ...file.rig!.pieces], (p) => p.y < -0.02 && p.y > -0.06 && Math.abs(p.x) < 0.012 && p.z < 0 && p.z > -0.056);
      expect(guard.isEmpty()).toBe(false);
      expect(box.max.z).toBeLessThan(guard.min.z - 0.001);
      // No vertex of the file's body or moving parts pokes into the torch's box (the clamp's touch on the rail aside).
      const inner = box.clone().expandByScalar(-0.0006);
      const all = [...file.body, ...file.rig!.pieces];
      expect(boxOf(all, (p) => inner.containsPoint(p)).isEmpty()).toBe(true);
      expect(Math.abs(box.min.z - -CYBER_MUZZLE.barrelEnd)).toBeLessThan(0.004);
      built.dispose();
    });
  }
});

describe('the Cyber Pistol file on a figure (RM5, acceptance 4)', () => {
  it('has its grip where the hand closes: the figure shape fills the grip line and reaches under the hand', () => {
    const { firing } = pistolGrips();
    const shape = boxOf(file.figure);
    const grip = boxOf(file.figure, (p) => p.y < firing.top.y);
    // The grip's top and bottom, in the figures' pistol frame, lie inside the shape, which reaches below the hand.
    for (const p of [firing.top, firing.bottom]) expect(grip.distanceToPoint(p)).toBeLessThan(0.02);
    expect(shape.min.y).toBeLessThan(firing.bottom.y - 0.02);
    // Its back is at the origin and its bore along -Z, as addPistol's frame says.
    expect(shape.max.z).toBeLessThan(0.03);
    expect(shape.max.z).toBeGreaterThan(-0.01);
    expect(Math.abs((shape.min.x + shape.max.x) / 2)).toBeLessThan(0.002);
  });
});

describe('the Cyber Pistol file\'s moving parts (RM5, acceptance 3)', () => {
  it('moves only the slide, trigger and selector as rig pieces; the slab and the front block stay in the body', () => {
    const names = file.rig!.bones.map((b) => b.name).sort();
    expect(names).toEqual(['selector', 'slide', 'trigger']);
    const slabKeys = new Set(file.rig!.pieces.map((p) => p.key));
    expect(slabKeys.has('cyberSlab')).toBe(false);
    expect(file.body.some((p) => p.key === 'cyberSlab')).toBe(true);
    // The muzzle block (the front of the barrel, ahead of the slide's face) is in the body, not on the slide.
    const slide = file.rig!.bones.findIndex((b) => b.name === 'slide');
    const slideFront = boxOf(file.rig!.pieces.filter((p) => p.bone === slide)).min.z;
    expect(slideFront).toBeGreaterThan(file.muzzle.z + 0.01);
    expect(boxOf(file.body).min.z).toBeLessThanOrEqual(file.muzzle.z + 0.001);
  });

  it('plays Fire and Selector on the rig and the Reload and Inspect magazine moves', () => {
    expect([...file.rig!.clips.keys()].sort()).toEqual(['Fire', 'Selector']);
    expect([...file.rig!.magazine.keys()].sort()).toEqual(['Inspect', 'Reload']);
    for (const t of file.rig!.magazine.values()) expect(t.values.some((v) => Math.abs(v) > 0.005)).toBe(true);
  });
});
