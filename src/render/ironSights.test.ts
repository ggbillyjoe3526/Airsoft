import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { AEG, CYBER_PISTOL, GAS_PISTOL, type ReplicaConfig } from '../config/replicas';
import { createArmament, fitOptics } from '../sim/armament';
import { prepareReplicaFile, type ReplicaFiles } from './replicaFiles';
import { LOW_DETAIL, type ReplicaDetail } from './replicaModels';
import { Viewmodel } from './viewmodel';

/**
 * M84 (the owner's playtest note 16): with no optic fitted, aiming down sights lines up the replica's own iron sights
 * on the view's centre, where BBs go. Checked by sight lines from the eye, on the built-in models and the model files.
 */

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

async function fileFor(id: string): Promise<ReplicaFiles> {
  const buf = readFileSync(new URL(`../assets/models/replicas/${id}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return new Map([[id, prepareReplicaFile(id, gltf.scene)]]);
}

const shown = (o: THREE.Object3D | null): boolean => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

/** The aimed view of `replica` (an optic on it if `optic`), and a sight line from the eye `up` radians above the centre. */
function aimed(replica: ReplicaConfig, files: ReplicaFiles, optic = false, detail: ReplicaDetail = LOW_DETAIL) {
  const vm = new Viewmodel(16 / 9, 0x3a7bd5, [replica], detail, null, undefined, files);
  const arm = createArmament([replica]);
  if (optic) fitOptics(arm, ['redDot']);
  for (let i = 0; i < 30; i++) vm.update(1 / 60, 0, 0, 0, MOVEMENT.runSpeed, 0, arm, false, 1);
  vm.scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  /** Distance along the sight line to the first part of the replica it meets (Infinity if none within a metre). */
  const meets = (up: number): number => {
    ray.set(new THREE.Vector3(), new THREE.Vector3(0, Math.sin(up), -Math.cos(up)));
    ray.far = 1;
    const hit = ray.intersectObjects(vm.scene.children, true).find((h) => shown(h.object));
    return hit ? hit.distance : Number.POSITIVE_INFINITY;
  };
  return { vm, meets };
}

/**
 * A sight line this far off the centre (radians): about 0.2° for the model files (what the game draws once they load),
 * 0.4° for the built-in models drawn until then, whose sights stand a millimetre or two off the files'.
 */
const OFF = { file: 0.0035, 'built-in': 0.007 };

describe('iron sights on every replica (M84)', () => {
  for (const replica of [AEG, GAS_PISTOL, CYBER_PISTOL]) {
    const sight = replica.look.ironSight!;
    // From the rear sight's aim point to just past the front's, along the line.
    const near = sight.eyeRelief - 0.01;
    const far = sight.eyeRelief + Math.abs(sight.rear[1] - sight.front[1]) + 0.02;
    for (const [source, replicaDetail] of [['built-in', 'low'], ['built-in', 'high'], ['file', 'low']] as const) {
      it(`${replica.name} (${source} model, ${replicaDetail}): the sights sit on the centre, nothing above them, the sight below them`, async () => {
        const files: ReplicaFiles = source === 'file' ? await fileFor(replica.id) : new Map();
        const { meets } = aimed(replica, files, false, { replica: replicaDetail, hands: 'low' });
        // Just over the centre: clear of the whole replica, so the post's tip is no higher than the aim point.
        expect(meets(OFF[source])).toBe(Number.POSITIVE_INFINITY);
        // Just under it: the sights themselves, so they reach up to the aim point.
        const below = meets(-OFF[source]);
        expect(below).toBeGreaterThan(near);
        expect(below).toBeLessThan(far);
      });
    }
  }

  it('looks through the rifle\'s rear aperture to the front post: the centre line passes the rear sight', async () => {
    for (const files of [new Map(), await fileFor(AEG.id)] as ReplicaFiles[]) {
      const { meets } = aimed(AEG, files);
      expect(meets(0)).toBeGreaterThan(AEG.look.ironSight!.eyeRelief + 0.3);
    }
  });

  it('keeps the optic\'s own hold with an optic fitted (the iron sights fold under it)', () => {
    const { vm } = aimed(AEG, new Map(), true);
    const model = vm.scene.getObjectByName('sightsDown')!.parent!;
    model.position.toArray().forEach((v, i) => expect(v).toBeCloseTo(AEG.look.aimHold![i]!, 9));
    expect(model.rotation.x).toBe(0);
  });
});
