import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HITS, type HitConfig } from '../config/hits';
import { MOVEMENT } from '../config/movement';
import { type Character, createCharacter } from '../sim/character';
import { characterHitVolume, createHitVolume, type HitVolume, inflateHitVolume, rayCharacter } from '../sim/hitbox';
import { vec3 } from '../sim/vec';
import { CharacterRenderer } from './characterRenderer';
import type { FigureCrowd } from './figureMix';
import { figureRigs } from './figureRig';
import type { RiggedFigure } from './riggedFigure';
import { figureFilesForTests } from './testSupport';

/**
 * M85's check (render/figureHitVolume.test.ts; DECISIONS: "a new figure (the Blender remodel) must pass it") on the
 * rigged human and robot (BF1): the hit volume against the figure players see, on every pose. The same grid of
 * parallel rays from eight sides, asked the same two things: does it touch the drawn body (arms, hands and the replica
 * don't count, DECISIONS 2026-10-01), and does the simulation count it. The skinned triangles are posed on the CPU and
 * laid on the grid (the rays of a side are parallel, so a ray touches a triangle when its grid point is inside the
 * triangle's outline): the same answer as casting each ray, in a fraction of the time on 20,000 triangles. The hit rules
 * are a match's with the rigged figures: the volume's legs on the figures' own legs (HitConfig.figureLegs, IM8).
 */

interface Pose {
  name: string;
  set(c: Character): void;
}

/** Moving ahead at `speed` (m/s), `phase` (0..1) through the walk cycle, crouched by `crouch`. */
const moving =
  (speed: number, phase: number, crouch = 0) =>
  (c: Character): void => {
    c.velocity.z = -speed;
    c.walkCycle = c.prevWalkCycle = phase * Math.PI * 2;
    c.crouchAmount = c.prevCrouchAmount = crouch;
  };
/** Mid-stride: the walk cycle a quarter on, one foot passing the other. */
const walk = moving(2, 0.25);

/** `time` seconds into a vault that rises onto the top for 0.2 s and is across it by 0.5 s, at the vault's speed. */
function vaultingAt(c: Character, time: number): void {
  Object.assign(c.vault, { active: true, time, riseEnd: 0.2, end: 0.5, speed: MOVEMENT.vault.minSpeed });
  c.velocity.z = -MOVEMENT.vault.minSpeed;
  c.grounded = false;
  c.airTime = time;
  c.crouchAmount = c.prevCrouchAmount = MOVEMENT.vault.tuck;
}

const POSES: Pose[] = [
  { name: 'standing', set: () => {} },
  { name: 'crouched', set: (c) => (c.crouchAmount = c.prevCrouchAmount = 1) },
  { name: 'leaning left', set: (c) => (c.lean = c.prevLean = -1) },
  { name: 'leaning right', set: (c) => (c.lean = c.prevLean = 1) },
  {
    name: 'crouched, leaning',
    set: (c) => {
      c.crouchAmount = c.prevCrouchAmount = 1;
      c.lean = c.prevLean = 1;
    },
  },
  { name: 'walking', set: walk },
  { name: 'walking, heel down', set: moving(MOVEMENT.walkSpeed, 0) },
  { name: 'running', set: moving(MOVEMENT.runSpeed, 0.25) },
  {
    name: 'sprinting',
    set: (c) => {
      moving(MOVEMENT.sprintSpeed, 0.25)(c);
      c.sprinting = true;
    },
  },
  { name: 'crouch walking', set: moving(MOVEMENT.crouchSpeed, 0.25, 1) },
  { name: 'crouch walking, other foot', set: moving(MOVEMENT.crouchSpeed, 0.75, 1) },
  { name: 'calling the hit', set: (c) => (c.status = 'calling') },
  {
    name: 'walking off',
    set: (c) => {
      c.status = 'walkingOff';
      walk(c);
    },
  },
  { name: 'out', set: (c) => (c.status = 'out') },
  // Over low cover (M102), halfway across the top and halfway up onto it: tucked by the vault (VaultConfig.tuck).
  { name: 'vaulting', set: (c) => vaultingAt(c, 0.35) },
  { name: 'vaulting, rising', set: (c) => vaultingAt(c, 0.1) },
];

/** M85's grid (render/figureHitVolume.test.ts): spacing, reach either side and up, the sides, the rim. */
const STEP = 0.035;
const HALF_WIDTH = 0.72;
const HEIGHT = 1.9;
const AZIMUTHS = 8;
const RANGE = 4;
const TOLERANCE = 0.02;
/**
 * The rigged figures do not pass M85's bar yet (at most 4 % of the drawn body missed and 3 % of the volume thin air,
 * past the rim): KNOWN_ISSUES › Figures and art. Since IM8 the volume's legs are the figures' own and their crouch is
 * as low as the volume's, so the drawn body is missed on 0-5 % of the grid on every pose but a vault's rise (up to
 * 9 %); what is left is thin air: the volume's head, chest and hips are the built-in human's, rounder than the Blender
 * human (4-8 %) and the robot (7-11 %; the v12 robot's armour fills more of it than v11's bare shell did), and upright
 * while the figures lean into a run and a sprint (up to 16 %). They are drawn only with the Dev switches off, and must
 * reach M85's bar before they become the default (DECISIONS › Gameplay and feel). Until then each pose is held to
 * today's worst case over the human looks and the robot plus a point (measured 2026-10-13, the v12 figures), so a
 * change can only bring them closer.
 */
const LIMITS: Readonly<Record<string, { missed: number; phantom: number }>> = {
  standing: { missed: 0.041, phantom: 0.08 },
  crouched: { missed: 0.036, phantom: 0.097 },
  'leaning left': { missed: 0.036, phantom: 0.079 },
  'leaning right': { missed: 0.036, phantom: 0.085 },
  'crouched, leaning': { missed: 0.032, phantom: 0.086 },
  walking: { missed: 0.046, phantom: 0.104 },
  'walking, heel down': { missed: 0.055, phantom: 0.115 },
  running: { missed: 0.047, phantom: 0.124 },
  sprinting: { missed: 0.057, phantom: 0.169 },
  'crouch walking': { missed: 0.045, phantom: 0.124 },
  'crouch walking, other foot': { missed: 0.054, phantom: 0.118 },
  'calling the hit': { missed: 0.045, phantom: 0.093 },
  'walking off': { missed: 0.039, phantom: 0.094 },
  out: { missed: 0.042, phantom: 0.096 },
  vaulting: { missed: 0.056, phantom: 0.086 },
  'vaulting, rising': { missed: 0.098, phantom: 0.115 },
};

/** The bones whose vertices are arm (the shoulders' are the torso's): UpperArm and everything down to the fingertips. */
const ARM_BONE = /^(UpperArm|Forearm|ForearmTwist|Elbow|Hand|Grip|Thumb|Index|Middle|Ring|Pinky|Finger)/;

const { rigs: kinds, files } = await figureFilesForTests();
const rigs = figureRigs(kinds.human, kinds.robot, () => {});
/** A match's hit rules with the rigged figures (matchSession.ts): the volume's legs on theirs. */
const hits: HitConfig = { ...HITS, figureLegs: rigs.legs };

interface Tally {
  body: number;
  missed: number;
  volume: number;
  phantom: number;
}

const volumeOf = (c: Character, grow: number): HitVolume => {
  const v = createHitVolume();
  characterHitVolume(c, hits, v);
  inflateHitVolume(v, grow);
  return v;
};

/** Every visible triangle of the posed figure in world space, and whether it is arm or replica. */
function triangles(root: THREE.Object3D): { points: Float32Array; arm: Uint8Array } {
  root.updateMatrixWorld(true);
  const points: number[] = [];
  const arm: number[] = [];
  const v = new THREE.Vector3();
  const walkTree = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if (o instanceof THREE.Mesh) {
      const g = o.geometry as THREE.BufferGeometry;
      const pos = g.getAttribute('position');
      const index = g.index;
      const count = index ? index.count : pos.count;
      const skinned = o instanceof THREE.SkinnedMesh;
      const isArmBone = skinned ? o.skeleton.bones.map((b) => ARM_BONE.test(b.name)) : [];
      const skinIndex = skinned ? g.getAttribute('skinIndex') : null;
      const skinWeight = skinned ? g.getAttribute('skinWeight') : null;
      const armShare = (i: number): number => {
        if (!skinIndex || !skinWeight) return 1; // the replica and magazines
        let s = 0;
        for (let k = 0; k < 4; k++) if (isArmBone[skinIndex.getComponent(i, k)]) s += skinWeight.getComponent(i, k);
        return s;
      };
      const world = new Map<number, [number, number, number]>();
      const at = (i: number): [number, number, number] => {
        let p = world.get(i);
        if (!p) {
          o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
          p = [v.x, v.y, v.z];
          world.set(i, p);
        }
        return p;
      };
      for (let t = 0; t + 2 < count; t += 3) {
        const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
        for (const i of ids) points.push(...at(i));
        arm.push((armShare(ids[0]!) + armShare(ids[1]!) + armShare(ids[2]!)) / 3 > 0.5 ? 1 : 0);
      }
    }
    for (const k of o.children) walkTree(k);
  };
  walkTree(root);
  return { points: new Float32Array(points), arm: Uint8Array.from(arm) };
}

function measure(pose: Pose, id: number, robot: boolean): Tally {
  const c = createCharacter(id, vec3(), 0.3);
  // On the ground, as the movement leaves a character standing (a new one starts in the air).
  c.grounded = true;
  const crowd: FigureCrowd = { robots: [robot], realistic: false };
  const renderer = new CharacterRenderer([c], [0x3d8bff], hits, null, 'high', crowd, files, rigs);
  pose.set(c);
  // Long enough for every blend to settle (the hit call's clip holds its last pose once played).
  for (let i = 0; i < 90; i++) {
    c.statusTime += 1 / 60;
    renderer.update(1, 1 / 60, -1);
  }
  const rigged = (renderer as unknown as { figures: { rigged: RiggedFigure }[] }).figures[0]!.rigged;
  const { points, arm } = triangles(rigged.root);
  const outer = volumeOf(c, TOLERANCE);
  const inner = volumeOf(c, -TOLERANCE);

  const cols = Math.floor((2 * HALF_WIDTH) / STEP + 1e-6) + 1;
  const rows = Math.floor((HEIGHT - STEP / 2) / STEP + 1e-6) + 1;
  const body = new Uint8Array(cols * rows);
  const arms = new Uint8Array(cols * rows);
  const t: Tally = { body: 0, missed: 0, volume: 0, phantom: 0 };
  const o = vec3();
  const d = vec3();
  for (let a = 0; a < AZIMUTHS; a++) {
    const az = (a / AZIMUTHS) * Math.PI * 2;
    d.x = -Math.sin(az);
    d.y = 0;
    d.z = -Math.cos(az);
    // A point's place across the view (u) and up (y), and the grid's cell for it.
    const ux = -d.z;
    const uz = d.x;
    body.fill(0);
    arms.fill(0);
    for (let tri = 0; tri < arm.length; tri++) {
      const k = tri * 9;
      const u0 = points[k]! * ux + points[k + 2]! * uz, y0 = points[k + 1]!;
      const u1 = points[k + 3]! * ux + points[k + 5]! * uz, y1 = points[k + 4]!;
      const u2 = points[k + 6]! * ux + points[k + 8]! * uz, y2 = points[k + 7]!;
      const area = (u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0);
      if (Math.abs(area) < 1e-12) continue;
      const c0 = Math.max(0, Math.ceil((Math.min(u0, u1, u2) + HALF_WIDTH) / STEP - 1e-9));
      const c1 = Math.min(cols - 1, Math.floor((Math.max(u0, u1, u2) + HALF_WIDTH) / STEP + 1e-9));
      const r0 = Math.max(0, Math.ceil((Math.min(y0, y1, y2) - STEP / 2) / STEP - 1e-9));
      const r1 = Math.min(rows - 1, Math.floor((Math.max(y0, y1, y2) - STEP / 2) / STEP + 1e-9));
      const mark = arm[tri] ? arms : body;
      for (let r = r0; r <= r1; r++) {
        const y = STEP / 2 + r * STEP;
        for (let col = c0; col <= c1; col++) {
          const u = -HALF_WIDTH + col * STEP;
          const w0 = ((u1 - u) * (y2 - y) - (u2 - u) * (y1 - y)) / area;
          const w1 = ((u2 - u) * (y0 - y) - (u0 - u) * (y2 - y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 >= 0 && w1 >= 0 && w2 >= 0) mark[r * cols + col] = 1;
        }
      }
    }
    for (let col = 0; col < cols; col++) {
      const u = -HALF_WIDTH + col * STEP;
      for (let r = 0; r < rows; r++) {
        const y = STEP / 2 + r * STEP;
        o.x = -d.x * RANGE - d.z * u;
        o.y = y;
        o.z = -d.z * RANGE + d.x * u;
        const onBody = body[r * cols + col] === 1;
        const onArm = arms[r * cols + col] === 1;
        if (onBody) {
          t.body++;
          if (rayCharacter(o, d, RANGE * 2, outer) < 0) t.missed++;
        }
        if (rayCharacter(o, d, RANGE * 2, inner) >= 0) {
          t.volume++;
          if (!onBody && !onArm) t.phantom++;
        }
      }
    }
  }
  renderer.dispose();
  return t;
}

describe('the hit volume against the rigged figures, on every pose (BF1, M85: not passed yet)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  // The human in each of its four heads (the id picks one: high-cut helmet, cap, boonie, full-cut helmet), with its
  // pack and radio and without, and the robot.
  const cases: { id: number; robot: boolean }[] = [
    { id: 0, robot: false },
    { id: 1, robot: false },
    { id: 2, robot: false },
    { id: 3, robot: false },
    { id: 0, robot: true },
  ];
  for (const { id, robot } of cases) {
    it(`${robot ? 'the robot' : `the human, look ${id}`}: no further from the hit volume than measured, on any pose`, () => {
      const rows: string[] = [];
      let worst = 0;
      for (const pose of POSES) {
        const t = measure(pose, id, robot);
        const missed = t.missed / t.body;
        const phantom = t.phantom / t.volume;
        const limit = LIMITS[pose.name]!;
        worst = Math.max(worst, missed / limit.missed, phantom / limit.phantom);
        rows.push(`${pose.name}: missed ${(100 * missed).toFixed(1)}%, thin air ${(100 * phantom).toFixed(1)}%`);
      }
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FIGURE_REPORT) console.log(`${robot ? 'robot' : `human ${id}`}\n  ${rows.join('\n  ')}`);
      expect(worst, rows.join('; ')).toBeLessThanOrEqual(1);
    }, 60_000);
  }
});
