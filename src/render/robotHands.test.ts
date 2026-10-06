import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import type { DetailLevel } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { figurePalette } from './figurePalette';
import { buildHand, handSkeleton, type HandPose } from './handModels';
import { AEG_HANDGUARD, AEG_SUPPORT_POSE, buildReplicaModels, HUMAN_ARMS, LOW_DETAIL, RAISED_HAND_POSE, type ReplicaModels } from './replicaModels';
import { buildRobotForearm, buildRobotHand } from './robotHands';
import { Viewmodel } from './viewmodel';

const DETAILS: readonly DetailLevel[] = ['low', 'high'];
const ROBOT = { robot: true, shell: FIGURE.robot.shells[1]! };

/** Every part a hand builder makes for `pose`, with the material each went to. */
function parts(build: typeof buildHand, pose: HandPose, detail: DetailLevel): { key: string; geo: THREE.BufferGeometry }[] {
  const out: { key: string; geo: THREE.BufferGeometry }[] = [];
  build({ addGeometry: (key, geo) => out.push({ key, geo }) }, pose, detail);
  return out;
}

const centre = (geo: THREE.BufferGeometry): THREE.Vector3 => {
  geo.computeBoundingBox();
  return geo.boundingBox!.getCenter(new THREE.Vector3());
};

/** Signed distance (m) from a point to the AEG's handguard block; negative inside (as handPoses.test.ts). */
function handguardDistance(p: THREE.Vector3): number {
  const H = AEG_HANDGUARD;
  const q = [Math.abs(p.x) - H.halfWidth, Math.abs(p.y - (H.top + H.bottom) / 2) - (H.top - H.bottom) / 2, Math.abs(-p.z - (H.from + H.to) / 2) - (H.to - H.from) / 2];
  return Math.hypot(Math.max(q[0]!, 0), Math.max(q[1]!, 0), Math.max(q[2]!, 0)) + Math.min(Math.max(q[0]!, q[1]!, q[2]!), 0);
}

const triangles = (geo: THREE.BufferGeometry): number => (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;

describe('a robot\'s first-person hands (G7)', () => {
  it('close on every grip as the gloved hand does: a plate along each of its finger and thumb bones', () => {
    for (const pose of [AEG_SUPPORT_POSE, RAISED_HAND_POSE, { ...AEG_SUPPORT_POSE, side: 'right' as const }]) {
      const bones = [...handSkeleton(pose).fingers, ...handSkeleton(pose).thumb];
      for (const detail of DETAILS) {
        const plates = parts(buildRobotHand, pose, detail).filter((p) => p.key === 'sleeve').map((p) => centre(p.geo));
        for (const bone of bones) {
          // The plate sits on the bone's outer part, its root joint showing.
          const mid = bone.from.clone().lerp(bone.to, 0.57);
          const closest = Math.min(...plates.map((c) => c.distanceTo(mid)));
          expect(closest).toBeLessThan(0.002);
        }
      }
    }
  });

  it('holds the rifle\'s handguard without going through it: fingertips up its far side', () => {
    const H = AEG_HANDGUARD;
    for (const detail of DETAILS) {
      const all = parts(buildRobotHand, AEG_SUPPORT_POSE, detail);
      const pos = new THREE.Vector3();
      // No deeper than a hard plate pressed on it shows: the thumb's plate, flat against the near side, 4 mm at most (a
      // gloved finger's soft pad may go 3).
      for (const { geo } of all) {
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i++) expect(handguardDistance(pos.fromBufferAttribute(p, i))).toBeGreaterThan(-0.0045);
      }
      // The fingertips' plates (the last of each finger's three; the palm's plate comes first) on the far side.
      const plates = all.filter((p) => p.key === 'sleeve').map((p) => centre(p.geo));
      for (const tip of [3, 6, 9, 12]) expect(plates[tip]!.x).toBeGreaterThan(H.halfWidth);
    }
  });

  it('uses only the gloved arms\' materials on Low (no extra draw call) and fewer triangles', () => {
    for (const pose of [AEG_SUPPORT_POSE, RAISED_HAND_POSE]) {
      const robot = parts(buildRobotHand, pose, 'low');
      const gloved = parts(buildHand, pose, 'low');
      expect(new Set(robot.map((p) => p.key))).toEqual(new Set(['sleeve', 'glove', 'armband']));
      expect(robot.reduce((n, p) => n + triangles(p.geo), 0)).toBeLessThan(gloved.reduce((n, p) => n + triangles(p.geo), 0));
      expect(robot.some((p) => p.geo.getAttribute('color'))).toBe(false);
    }
    const forearm: string[] = [];
    buildRobotForearm({ addGeometry: (key) => forearm.push(key) }, [0, 0, 0], [0.1, -0.2, -0.3], undefined, 'low');
    expect(new Set(forearm)).toEqual(new Set(['sleeve', 'glove', 'armband']));
  });
});

/** The arms' materials in a built set, by mesh name, from the AEG's model. */
function armColours(models: ReplicaModels): Record<string, number> {
  const out: Record<string, number> = {};
  models.models.get(LOADOUT[0]!.id)!.group.traverse((o) => {
    if (o instanceof THREE.Mesh && ['glove', 'sleeve', 'armband'].includes(o.name)) out[o.name] = (o.material as THREE.MeshStandardMaterial).color.getHex();
  });
  return out;
}

const trianglesIn = (o: THREE.Object3D): number => {
  let n = 0;
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) n += triangles(c.geometry);
  });
  return n;
};
const meshCount = (o: THREE.Object3D): number => {
  let n = 0;
  o.traverse((c) => c instanceof THREE.Mesh && n++);
  return n;
};

describe('the first-person arms (G7)', () => {
  it('are dark gloves, camo sleeves in the team\'s palette and the team armband; a robot\'s shell when its slot is a robot', () => {
    for (const team of [0x3d8bff, 0xff8a2a]) {
      const human = buildReplicaModels(LOADOUT, team, false);
      expect(armColours(human)).toEqual({ glove: FIGURE.colors.glove, sleeve: figurePalette(team).camo, armband: team });
      human.dispose();
      const robot = buildReplicaModels(LOADOUT, team, false, LOW_DETAIL, null, 'hands', ROBOT);
      expect(armColours(robot)).toEqual({ glove: FIGURE.robot.joint, sleeve: ROBOT.shell, armband: team });
      robot.dispose();
    }
  });

  it('cost a robot no more draw calls or triangles than the gloved arms on Low, the raised hand included', () => {
    const human = buildReplicaModels(LOADOUT, 0x3d8bff, false, LOW_DETAIL, null, 'hands', HUMAN_ARMS);
    const robot = buildReplicaModels(LOADOUT, 0x3d8bff, false, LOW_DETAIL, null, 'hands', ROBOT);
    for (const r of LOADOUT) {
      const h = human.models.get(r.id)!.group;
      const b = robot.models.get(r.id)!.group;
      expect(meshCount(b)).toBeLessThanOrEqual(meshCount(h));
      expect(trianglesIn(b)).toBeLessThan(trianglesIn(h));
    }
    expect(meshCount(robot.raisedHand)).toBeLessThanOrEqual(meshCount(human.raisedHand));
    human.dispose();
    robot.dispose();
  });

  it('keep the robot arms through a detail change in the viewmodel, and free them', () => {
    const vm = new Viewmodel(16 / 9, 0xff8a2a, LOADOUT, LOW_DETAIL, null, ROBOT);
    const sleeves = (): number[] => {
      const out: number[] = [];
      vm.scene.traverse((o) => o instanceof THREE.Mesh && o.name === 'sleeve' && out.push((o.material as THREE.MeshStandardMaterial).color.getHex()));
      return out;
    };
    expect(sleeves().length).toBeGreaterThan(0);
    expect(new Set(sleeves())).toEqual(new Set([ROBOT.shell]));
    vm.setDetail({ replica: 'high', hands: 'high' });
    vm.setDetail(LOW_DETAIL);
    expect(new Set(sleeves())).toEqual(new Set([ROBOT.shell]));
    const used = new Set<THREE.BufferGeometry | THREE.Material>();
    vm.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) used.add(o.geometry).add(o.material as THREE.Material);
    });
    const freed = new Set<unknown>();
    for (const r of used) r.addEventListener('dispose', () => freed.add(r));
    vm.dispose();
    expect([...used].filter((r) => !freed.has(r))).toHaveLength(0);
  });
});
