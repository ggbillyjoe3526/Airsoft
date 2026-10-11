import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { type Character, createCharacter } from '../sim/character';
import { characterHitVolume, createHitVolume, type HitVolume, inflateHitVolume, rayCharacter } from '../sim/hitbox';
import { vec3 } from '../sim/vec';
import type { Figure } from './characterModels';
import { CharacterRenderer } from './characterRenderer';
import type { FigureCrowd } from './figureMix';

/**
 * M85 acceptance 3 (the owner's playtest note 17: "only hit targets if they are clearly visible"): the hit volume
 * (sim/hitbox.ts) against the figure players see, on every pose, for every look, human and robot. Rays are fired at
 * the posed figure from all round it on a fine grid, and each is asked two things: does it touch the drawn body (torso,
 * head, kit, legs; arms and replicas don't count, DECISIONS 2026-10-01), and does the simulation count it. A ray on the
 * drawn body that the volume misses is a BB that flies on to whoever is behind; one the volume catches with nothing
 * drawn there is a hit on thin air. Within TOLERANCE of the surface (the rim) neither can be told apart in play.
 */

interface Pose {
  name: string;
  set(c: Character): void;
}

/** Mid-stride: the walk cycle a quarter on, so the legs are at full swing. */
function walk(c: Character): void {
  c.velocity.z = -2;
  c.walkCycle = c.prevWalkCycle = Math.PI / 2;
}

const POSES: Pose[] = [
  { name: 'standing', set: () => {} },
  { name: 'crouched', set: (c) => (c.crouchAmount = 1) },
  { name: 'leaning left', set: (c) => (c.lean = -1) },
  { name: 'leaning right', set: (c) => (c.lean = 1) },
  {
    name: 'crouched, leaning',
    set: (c) => {
      c.crouchAmount = 1;
      c.lean = 1;
    },
  },
  { name: 'walking', set: walk },
  { name: 'calling the hit', set: (c) => (c.status = 'calling') },
  {
    name: 'walking off',
    set: (c) => {
      c.status = 'walkingOff';
      walk(c);
    },
  },
  { name: 'out', set: (c) => (c.status = 'out') },
];

/** Grid spacing (metres), how far either side of the figure's axis and how high the grid reaches, and the azimuths. */
const STEP = 0.035;
const HALF_WIDTH = 0.72;
const HEIGHT = 1.9;
const AZIMUTHS = 8;
const RANGE = 4;
/** How far the hit volume's surface may sit from the drawn one (metres): a few BB widths, the rim. */
const TOLERANCE = 0.02;
/**
 * At most this share of the drawn body may be missed, or of the hit volume be thin air, past the rim, on any pose, for
 * humans and robots alike. Robots are a look only (Settings › Look: the simulation doesn't know who is drawn as one), so
 * the robot is drawn inside the human envelope (render/figureRobot.ts). Measured 2026-10-11 on this grid: humans at worst
 * 3.5% missed (a pack's back when crouched) and 2.7% thin air; robots 3.5% and 2.6%. Before M85, standing, 10% of the
 * drawn body was missed and 29% of the volume was thin air, rim included; robots before their M85 refit, 5.2% and 9%.
 */
const LIMITS = { missed: 0.04, phantom: 0.03 };

interface Tally {
  /** Rays that touch the drawn body. */
  body: number;
  /** Of those, rays that miss the hit volume grown by TOLERANCE (the BB would fly on). */
  missed: number;
  /** Rays that meet the hit volume shrunk by TOLERANCE. */
  volume: number;
  /** Of those, rays with nothing drawn on them, arms and replica included. */
  phantom: number;
}

const visibleMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  const walkTree = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if (o instanceof THREE.Mesh) out.push(o);
    for (const k of o.children) walkTree(k);
  };
  walkTree(root);
  return out;
};

const volumeOf = (c: Character, grow: number): HitVolume => {
  const v = createHitVolume();
  characterHitVolume(c, HITS, v);
  inflateHitVolume(v, grow);
  return v;
};

function measure(pose: Pose, id: number, detail: 'low' | 'high', robot: boolean): Tally {
  const c = createCharacter(id, vec3(), 0.3);
  const crowd: FigureCrowd = { robots: [robot], realistic: false };
  const renderer = new CharacterRenderer([c], [0x3d8bff], HITS, null, detail, crowd);
  pose.set(c);
  renderer.update(1, 1 / 60, -1);
  const figure = (renderer as unknown as { figures: { figure: Figure }[] }).figures[0]!.figure;
  figure.root.updateMatrixWorld(true);
  const arms = new Set<THREE.Object3D>(visibleMeshes(figure.aim).concat(visibleMeshes(figure.hitPose)));
  const meshes = visibleMeshes(figure.root);
  for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
  const outer = volumeOf(c, TOLERANCE);
  const inner = volumeOf(c, -TOLERANCE);

  const ray = new THREE.Raycaster();
  ray.far = RANGE * 2;
  const o = vec3();
  const d = vec3();
  const t: Tally = { body: 0, missed: 0, volume: 0, phantom: 0 };
  const hits: THREE.Intersection[] = [];
  for (let a = 0; a < AZIMUTHS; a++) {
    const az = (a / AZIMUTHS) * Math.PI * 2;
    // Looking at the figure's axis from `az`, u across the view.
    d.x = -Math.sin(az);
    d.y = 0;
    d.z = -Math.cos(az);
    for (let u = -HALF_WIDTH; u <= HALF_WIDTH; u += STEP) {
      for (let y = STEP / 2; y <= HEIGHT; y += STEP) {
        o.x = -d.x * RANGE - d.z * u;
        o.y = y;
        o.z = -d.z * RANGE + d.x * u;
        ray.set(new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3(d.x, d.y, d.z));
        let body = false;
        let arm = false;
        for (const m of meshes) {
          const isArm = arms.has(m);
          if (isArm ? arm : body) continue;
          hits.length = 0;
          m.raycast(ray, hits);
          if (hits.length === 0) continue;
          if (isArm) arm = true;
          else body = true;
        }
        if (body) {
          t.body++;
          if (rayCharacter(o, d, RANGE * 2, outer) < 0) t.missed++;
        }
        if (rayCharacter(o, d, RANGE * 2, inner) >= 0) {
          t.volume++;
          if (!body && !arm) t.phantom++;
        }
      }
    }
  }
  renderer.dispose();
  return t;
}

describe('the hit volume against the drawn figure, on every pose (M85)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  // Every pose with and without a pack (looks 0 and 1), human and robot; every look's headgear standing and crouched; the
  // detailed figure (Player detail High) on three poses.
  const ALL = POSES.map((p) => p.name);
  const cases: { id: number; detail: 'low' | 'high'; robot: boolean; poses: readonly string[] }[] = [
    { id: 0, detail: 'low', robot: false, poses: ALL },
    { id: 1, detail: 'low', robot: false, poses: ALL },
    { id: 0, detail: 'low', robot: true, poses: ALL },
  ];
  for (let id = 2; id < FIGURE.looks.length; id++) cases.push({ id, detail: 'low', robot: false, poses: ['standing', 'crouched'] });
  for (const robot of [false, true]) cases.push({ id: 3, detail: 'high', robot, poses: ['standing', 'walking', 'crouched, leaning'] });

  for (const { id, detail, robot, poses } of cases) {
    it(`look ${id}, ${detail} detail${robot ? ', robot' : ''}: a BB on the drawn body counts, and none on thin air`, () => {
      const rows: string[] = [];
      let worst = 0;
      for (const pose of POSES.filter((p) => poses.includes(p.name))) {
        const t = measure(pose, id, detail, robot);
        const missed = t.missed / t.body;
        const phantom = t.phantom / t.volume;
        worst = Math.max(worst, missed / LIMITS.missed, phantom / LIMITS.phantom);
        rows.push(`${pose.name}: missed ${(100 * missed).toFixed(1)}%, thin air ${(100 * phantom).toFixed(1)}%`);
      }
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FIGURE_REPORT) console.log(`look ${id}, ${detail}${robot ? ', robot' : ''}\n  ${rows.join('\n  ')}`);
      expect(worst, rows.join('; ')).toBeLessThanOrEqual(1);
    }, 60_000);
  }
});
