import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { VIEWMODEL } from '../config/render';
import { AEG, type ReplicaConfig } from '../config/replicas';
import { createArmament, fitOptics } from '../sim/armament';
import { findEyepiece } from './eyepiece';
import { prepareReplicaFile, type ReplicaFiles } from './replicaFiles';
import { buildReplicaModels, HUMAN_ARMS, LOW_DETAIL, type ReplicaDetail, RIFLE_OPTIC, RIFLE_SCOPE } from './replicaModels';
import { Viewmodel } from './viewmodel';

// The 2× scope (the owner's 0.1 Dev 5 playtest, notes 5 and 6): aimed, the replica stays in view and the rear glass
// shows the world; at the hip each glass reads as glass over black, with no gap through the body.

const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };
async function scene(name: string): Promise<THREE.Object3D> {
  const buf = readFileSync(new URL(`../assets/models/${name}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}
const files: ReplicaFiles = new Map([['aeg', prepareReplicaFile('aeg', await scene('replicas/aeg.glb'), await scene('replicaParts/aeg.glb'))]]);

const HIGH: ReplicaDetail = { replica: 'high', hands: 'high' };
const isLens = (m: THREE.Material): boolean => m.name === 'lens';
const LOADOUT: readonly ReplicaConfig[] = [AEG];

/** The rifle's 2× scope as drawn at `detail`, built-in or from its parts file. */
function scopeOf(detail: ReplicaDetail, withFile: boolean): THREE.Object3D {
  const models = buildReplicaModels(LOADOUT, 0x3a7bd5, false, detail, null, 'hands', HUMAN_ARMS, withFile ? files : undefined);
  const group = models.models.get('aeg')!.group;
  let scope: THREE.Object3D | undefined;
  group.traverse((o) => o.name === 'optic:scope2x' && (scope = o));
  scope!.updateWorldMatrix(true, true);
  return scope!;
}

/** The first thing other than glass that a ray from `from` along `dir` (the scope's own space) meets, as drawn (front faces). */
function firstSolid(scope: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3): THREE.Intersection | undefined {
  const ray = new THREE.Raycaster(scope.localToWorld(from.clone()), dir.clone().transformDirection(scope.matrixWorld));
  const meshes: THREE.Mesh[] = [];
  scope.traverse((o) => o instanceof THREE.Mesh && o.visible && meshes.push(o));
  return ray.intersectObjects(meshes, false).find((h) => !isLens((h.object as THREE.Mesh).material as THREE.Material));
}

const CASES = [
  ['the built-in scope on Low', LOW_DETAIL, false],
  ['the built-in scope on High', HIGH, false],
  ['the Blender scope', HIGH, true],
] as const;

describe('the 2× scope\'s glass (the 0.1 Dev 5 playtest, note 6)', () => {
  it('the built-in scope has its eyepiece glass, on the sight line and as wide as the tube', () => {
    for (const detail of [LOW_DETAIL, HIGH]) {
      const eye = findEyepiece(scopeOf(detail, false), isLens)!;
      expect(eye.radius).toBeCloseTo(RIFLE_SCOPE.inner, 4);
      expect(eye.y).toBeCloseTo(RIFLE_OPTIC.axisUp, 4);
      expect(eye.x).toBeCloseTo(0, 4);
      expect(eye.z).toBeCloseTo(RIFLE_SCOPE.eyeLength - RIFLE_SCOPE.from - RIFLE_SCOPE.ocularInset, 4);
    }
  });

  for (const [name, detail, withFile] of CASES) {
    it(`${name}: seen through either glass, a dark core sits just behind it (no view through the body)`, () => {
      const scope = scopeOf(detail, withFile);
      const eye = findEyepiece(scope, isLens)!;
      expect(eye).not.toBeNull();
      const length = 0.2;
      for (const r of [0, 0.5, 0.9]) {
        for (const a of [0, 1.3, 2.9, 4.4]) {
          const at = (z: number) => new THREE.Vector3(eye.x + Math.cos(a) * r * eye.radius, eye.y + Math.sin(a) * r * eye.radius, z);
          // In at the eyepiece: the core, past where the eyepiece's mask sits, and inside the scope.
          const back = firstSolid(scope, at(eye.z + 0.01), new THREE.Vector3(0, 0, -1));
          expect(back, `${r} ${a}`).toBeDefined();
          expect(back!.distance - 0.01).toBeGreaterThan(VIEWMODEL.eyepieceInset);
          expect(back!.distance - 0.01).toBeLessThan(0.005);
          // In at the objective: the core again, never out through the eyepiece.
          const front = firstSolid(scope, at(eye.z - length), new THREE.Vector3(0, 0, 1));
          expect(front, `${r} ${a}`).toBeDefined();
          expect(front!.point.distanceTo(back!.point)).toBeGreaterThan(0.05);
        }
      }
    });
  }

  it('the built-in scope\'s bell closes onto its tube: nothing to see through at the step', () => {
    for (const detail of [LOW_DETAIL, HIGH]) {
      const scope = scopeOf(detail, false);
      const sc = RIFLE_SCOPE;
      for (const r of [sc.outer + 0.001, (sc.outer + sc.bellOuter) / 2, sc.bellOuter - 0.004]) {
        // From behind the step, along the tube, at a radius between the tube's and the bell's: the shoulder stops it.
        const hit = firstSolid(scope, new THREE.Vector3(0, RIFLE_OPTIC.axisUp + r, -(sc.from + sc.length - 0.02)), new THREE.Vector3(0, 0, -1));
        expect(hit, `${r}`).toBeDefined();
        expect(-scope.worldToLocal(hit!.point.clone()).z).toBeCloseTo(sc.from + sc.length, 3);
      }
    }
  });
});

describe('aiming down the 2× scope (the 0.1 Dev 5 playtest, note 5)', () => {
  const masksOf = (vm: Viewmodel): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    vm.scene.traverse((o) => o.name === 'eyepieceMask' && out.push(o as THREE.Mesh));
    return out;
  };
  const shown = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };

  for (const withFile of [false, true]) {
    it(`keeps the replica in view and opens the eyepiece to the world only at your eye (${withFile ? 'the Blender scope' : 'built-in'})`, () => {
      const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, HIGH, null, HUMAN_ARMS, withFile ? files : undefined);
      const arm = createArmament(LOADOUT);
      fitOptics(arm, ['scope2x']);
      vm.update(1 / 60, 0, 0, 0, 4.2, 0, arm, false, 1);
      const [mask] = masksOf(vm);
      expect(masksOf(vm)).toHaveLength(1); // the scope's alone: the red dot needs none
      expect(shown(mask!)).toBe(false);
      vm.setScoped(true);
      expect(shown(mask!)).toBe(true);
      let scope: THREE.Object3D | undefined;
      vm.scene.traverse((o) => o.name === 'optic:scope2x' && (scope = o));
      expect(shown(scope!)).toBe(true); // the replica and the scope stay drawn
      // Only depth, before anything else in the replica's pass, square on the view's centre line in front of the eye.
      const mat = mask!.material as THREE.Material;
      expect([mat.colorWrite, mat.depthWrite, mat.depthTest, mask!.renderOrder]).toEqual([false, true, true, -1]);
      mask!.updateWorldMatrix(true, false);
      const centre = mask!.getWorldPosition(new THREE.Vector3());
      expect(Math.hypot(centre.x, centre.y)).toBeLessThan(1e-4);
      expect(centre.z).toBeLessThan(-VIEWMODEL.near);
      vm.setScoped(false);
      expect(shown(mask!)).toBe(false);
      vm.dispose();
    });
  }

  it('hands its hidden masks to the warm-up (KI1), so the first aim through the scope compiles nothing', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, LOW_DETAIL);
    expect(vm.warmTargets()).toEqual(masksOf(vm));
    expect(vm.warmTargets()).toHaveLength(1);
    vm.setDetail(HIGH);
    expect(vm.warmTargets()).toEqual(masksOf(vm));
    vm.dispose();
  });

  it('builds the masks again with the replicas (a detail change) and keeps them as scoped', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT, LOW_DETAIL);
    vm.setScoped(true);
    vm.setDetail(HIGH);
    const masks = masksOf(vm);
    expect(masks).toHaveLength(1);
    expect(masks[0]!.visible).toBe(true);
    vm.dispose();
  });
});
