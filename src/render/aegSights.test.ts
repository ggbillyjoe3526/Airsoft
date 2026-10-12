import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { AEG } from '../config/replicas';
import { prepareReplicaFile, type ReplicaFile } from './replicaFiles';
import { AEG_HANDGUARD, buildReplicaModels, LOW_DETAIL } from './replicaModels';
import { RIFLE_OPTIC } from './replicaParts';

/** RM6: the redesigned AEG's iron sights stand small and low, and fold flat under an optic (file and built-in model). */

const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

async function scene(path: string): Promise<THREE.Object3D> {
  const buf = readFileSync(new URL(path, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

const sight = AEG.look.ironSight!;
const LINE = sight.rear[0];
/** The tallest a sight may stand over the rail (m): the owner's "small and low". */
const TALLEST_OVER_RAIL = 0.02;
/** The tops of the receiver rail (the rear sight stands on) and the handguard rail (the front post). */
/** The underside of the red dot's hood: folded sights stay below it. */
const UNDER_OPTIC = RIFLE_OPTIC.axisUp - RIFLE_OPTIC.outer;
const RAIL = { rear: 0.074, front: AEG_HANDGUARD.top };

/** Highest point (model space, y) of the vertices the named bones carry, by the pose now. */
function sightTops(root: THREE.Object3D, bones: string[]): Record<string, number> {
  root.updateMatrixWorld(true);
  const top: Record<string, number> = Object.fromEntries(bones.map((n) => [n, -Infinity]));
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const idx = o.geometry.getAttribute('skinIndex');
    const wt = o.geometry.getAttribute('skinWeight');
    const names = o.skeleton.bones.map((b) => b.name);
    for (let i = 0; i < idx.count; i++) {
      for (let k = 0; k < 4; k++) {
        const name = names[idx.getComponent(i, k)]!;
        if (!bones.includes(name) || wt.getComponent(i, k) < 0.5) continue;
        o.getVertexPosition(i, v);
        v.applyMatrix4(o.matrixWorld);
        top[name] = Math.max(top[name]!, v.y);
      }
    }
  });
  return top;
}

describe('the AEG file\'s iron sights (RM6)', () => {
  it('stand low: no taller than 2 cm over the rail, their tips on the sight line', async () => {
    const file: ReplicaFile = prepareReplicaFile('aeg', await scene('../assets/models/replicas/aeg.glb'), await scene('../assets/models/replicaParts/aeg.glb'));
    const models = buildReplicaModels([AEG], 0x3a7bd5, false, LOW_DETAIL, null, 'bare', undefined, new Map([['aeg', file]]));
    const { group, rig } = models.models.get('aeg')!;
    rig!.set('SightsFold', 0);
    rig!.apply();
    const up = sightTops(group, ['rig_rearSight', 'rig_frontSight']);
    expect(up.rig_rearSight).toBeLessThanOrEqual(LINE + 0.006);
    expect(up.rig_rearSight).toBeGreaterThan(LINE - 0.01);
    expect(up.rig_rearSight! - RAIL.rear).toBeLessThanOrEqual(TALLEST_OVER_RAIL);
    expect(up.rig_frontSight).toBeLessThanOrEqual(LINE + 0.006);
    expect(up.rig_frontSight).toBeGreaterThan(LINE - 0.01);
    expect(up.rig_frontSight! - RAIL.front).toBeLessThanOrEqual(TALLEST_OVER_RAIL + 0.005);

    // Both leaves fold flat: lower than they stood, and under the red dot's hood.
    rig!.set('SightsFold', rig!.duration('SightsFold'));
    rig!.apply();
    const down = sightTops(group, ['rig_rearSight', 'rig_frontSight']);
    expect(down.rig_rearSight).toBeLessThan(up.rig_rearSight! - 0.008);
    expect(down.rig_frontSight).toBeLessThan(up.rig_frontSight! - 0.008);
    expect(Math.max(down.rig_rearSight!, down.rig_frontSight!)).toBeLessThan(UNDER_OPTIC);
    models.dispose();
    file.dispose();
  });
});

describe('the built-in AEG\'s iron sights (RM6)', () => {
  it('stand low on the 0.088 line and fold flat under it', () => {
    const models = buildReplicaModels([AEG], 0x3a7bd5, false, LOW_DETAIL, null, 'bare');
    const { group } = models.models.get('aeg')!;
    const topOf = (name: string): { min: number; max: number } => {
      const box = new THREE.Box3().setFromObject(group.getObjectByName(name)!);
      return { min: box.min.y, max: box.max.y };
    };
    const up = topOf('sightsUp');
    const down = topOf('sightsDown');
    expect(up.max).toBeLessThanOrEqual(LINE + 0.006);
    expect(up.max).toBeGreaterThan(LINE - 0.002);
    expect(up.max - RAIL.rear).toBeLessThanOrEqual(TALLEST_OVER_RAIL);
    expect(up.max - up.min).toBeLessThan(0.03);
    expect(down.max).toBeLessThan(UNDER_OPTIC);
    expect(down.max).toBeLessThan(up.max);
    models.dispose();
  });
});
