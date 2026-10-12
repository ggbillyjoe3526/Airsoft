import { FIGURE_RIG } from '../config/figureRig';
import type { FigureLegs } from '../config/hits';
import type { Character, LifeStatus } from './character';

/**
 * The rigged figures' legs in the simulation (IM8). The Blender figures walk, crouch and kneel on real legs that bend at
 * the knee, which the built-in hit volume's legs (straight, swinging on the walk cycle, squashed by a crouch) can't
 * follow. When a match draws them, its hit rules carry their leg clips as plain numbers (HitConfig.figureLegs, read
 * from the figure file by render/figureLegs.ts) and the legs' hit volumes sit on the drawn legs' joints instead: the
 * same clips blended by the same rules the figure plays them by (render/figurePose.ts uses legClipWeights too), at the
 * walk cycle, which then steps at the clips' own strides so the drawn feet don't slide.
 *
 * The figure eases between its clips (FIGURE_RIG.blend, about a tenth of a second); the hit volume takes the blend the
 * character's state asks for at once, so the two part only while a stride starts, stops or turns.
 */

/** The legs' clips, by slot: the first twelve of the figure's (render/figurePose.ts POSE_CLIPS), in the same order. */
export const LEG_CLIPS = ['Idle', 'Walk_F', 'Run_F', 'Run_B', 'Run_L', 'Run_R', 'Sprint', 'CrouchIdle', 'CrouchWalk', 'Jump', 'HitCall', 'WalkOff'] as const;
export type LegClip = (typeof LEG_CLIPS)[number];
export const LEG_SLOT = Object.fromEntries(LEG_CLIPS.map((name, i) => [name, i])) as Readonly<Record<LegClip, number>>;

/** The clips played by the walk cycle (the rest are held, or played by the hit call's or the jump's clock). */
const CYCLES: readonly number[] = ['Walk_F', 'Run_F', 'Run_B', 'Run_L', 'Run_R', 'Sprint', 'CrouchWalk', 'WalkOff'].map((n) => LEG_SLOT[n as LegClip]);

/** A sample's points per leg, in FigureLegClip.points: the hip, knee and ankle joints, then the boot's heel and toe. */
export const LEG_POINT = { hip: 0, knee: 1, ankle: 2, heel: 3, toe: 4 } as const;
export const LEG_POINTS = 5;
/** Numbers in one sample: two legs (left, right) of LEG_POINTS points of three. */
export const LEG_SAMPLE = 2 * LEG_POINTS * 3;

/** The legs' modes: walking and running (the gait), the sprint, the hit call, the walk-off. */
export const LEG_MODES = 4;
export const LEG_MODE = { gait: 0, sprint: 1, call: 2, walkOff: 3 } as const;

/** The legs' mode for a character's state: the hit call while calling, the walk-off while walking off or leaving, the sprint while sprinting. */
export function legMode(status: LifeStatus, sprinting: boolean, speed: number): number {
  if (status === 'calling') return LEG_MODE.call;
  if (status === 'walkingOff' || status === 'leaving') return LEG_MODE.walkOff;
  return status === 'alive' && sprinting && speed > FIGURE_RIG.stillBelow ? LEG_MODE.sprint : LEG_MODE.gait;
}

/**
 * The step's direction as the four clips' shares (ahead, back, left, right; sum 1) for a step `forward` ahead and
 * `side` to the figure's right at `speed`. Leaves `out` as it is and returns false below FIGURE_RIG.stillBelow.
 */
export function legDirection(forward: number, side: number, speed: number, out: Float32Array): boolean {
  if (speed <= FIGURE_RIG.stillBelow) return false;
  const a = Math.max(0, forward / speed);
  const b = Math.max(0, -forward / speed);
  const l = Math.max(0, -side / speed);
  const r = Math.max(0, side / speed);
  const sum = a + b + l + r;
  out[0] = a / sum;
  out[1] = b / sum;
  out[2] = l / sum;
  out[3] = r / sum;
  return true;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The run's share of the walk-to-run blend at `speed` (m/s): 0 at the walking pace and below, 1 at the normal pace. */
export function legRun(speed: number): number {
  return clamp01((speed - FIGURE_RIG.walkSpeed) / (FIGURE_RIG.runSpeed - FIGURE_RIG.walkSpeed));
}

/** What the legs' blend is made of: each mode's share, moving (0..1), the direction's shares, in the air, crouched, running. */
export interface LegBlend {
  mode: ArrayLike<number>;
  move: number;
  dir: ArrayLike<number>;
  jump: number;
  crouch: number;
  run: number;
}

/**
 * The legs' clip weights (slots 0 to LEG_CLIPS.length - 1 of `out`) for blend `b`: standing, walking ahead and running
 * four ways, crouched still or walking, and the jump within the gait; the sprint, the hit call and the walk-off as their
 * modes' shares. The figure passes its eased blend, the hit volume the one the character's state asks for.
 */
export function legClipWeights(b: LegBlend, out: Float32Array): void {
  const S = LEG_SLOT;
  const crouch = clamp01(b.crouch);
  const stand = 1 - crouch;
  const ground = 1 - b.jump;
  const gait = b.mode[LEG_MODE.gait]!;
  const moving = gait * ground * stand * b.move;
  out[S.Idle] = gait * ground * stand * (1 - b.move);
  out[S.Walk_F] = moving * b.dir[0]! * (1 - b.run);
  out[S.Run_F] = moving * b.dir[0]! * b.run;
  out[S.Run_B] = moving * b.dir[1]!;
  out[S.Run_L] = moving * b.dir[2]!;
  out[S.Run_R] = moving * b.dir[3]!;
  out[S.CrouchIdle] = gait * ground * crouch * (1 - b.move);
  out[S.CrouchWalk] = gait * ground * crouch * b.move;
  out[S.Jump] = gait * b.jump;
  out[S.Sprint] = b.mode[LEG_MODE.sprint]!;
  out[S.HitCall] = b.mode[LEG_MODE.call]!;
  out[S.WalkOff] = b.mode[LEG_MODE.walkOff]!;
}

const blend = { mode: new Float32Array(LEG_MODES), move: 0, dir: new Float32Array(4), jump: 0, crouch: 0, run: 0 };
const weights = new Float32Array(LEG_CLIPS.length);

/** A character's step in its own frame (ahead and to its right, m/s), as the figure reads it. */
const step = { forward: 0, side: 0, speed: 0 };
function stepOf(c: Character): void {
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  step.forward = -c.velocity.x * sin - c.velocity.z * cos;
  step.side = c.velocity.x * cos - c.velocity.z * sin;
  step.speed = Math.hypot(c.velocity.x, c.velocity.z);
}

/** The legs' clip weights for `c` as its state stands (no easing), into `out`. */
export function characterLegWeights(c: Character, out: Float32Array): void {
  stepOf(c);
  blend.mode.fill(0);
  blend.mode[legMode(c.status, c.sprinting, step.speed)] = 1;
  blend.move = legDirection(step.forward, step.side, step.speed, blend.dir) ? 1 : 0;
  blend.jump = !c.grounded && (c.status === 'alive' || c.status === 'out') ? 1 : 0;
  blend.crouch = c.crouchAmount;
  blend.run = legRun(step.speed);
  legClipWeights(blend, out);
}

/**
 * The walk cycle's step (radians) for `moved` metres of ground with figure legs: a cycle per the stride of the clips
 * being played (blended by their weights; standing, the run's, as the figure does), backwards while a crouched walk
 * steps back (the crouched walk was made walking ahead).
 */
export function figureLegCycleStep(c: Character, legs: FigureLegs, moved: number): number {
  characterLegWeights(c, weights);
  let sum = 0;
  let strides = 0;
  for (const i of CYCLES) {
    const w = weights[i]!;
    const stride = legs.clips[i]?.stride ?? 0;
    if (w > 0 && stride > 0) {
      sum += w;
      strides += w * stride;
    }
  }
  const stride = sum > 1e-4 ? strides / sum : (legs.clips[LEG_SLOT.Run_F]?.stride ?? 0);
  if (stride <= 0) return 0;
  const back = c.crouchAmount > 0.5 && step.forward < -0.1 * step.speed;
  return ((back ? -moved : moved) / stride) * Math.PI * 2;
}

/** Just short of a clip's end, so a cycle's last frame never wraps round to its first (as the figure plays them). */
const LAST = 0.9999;

/** Where in each clip (0..1 of its length) the legs are for `c`, by slot. */
function shareOf(c: Character, slot: number, seconds: number): number {
  if (CYCLES.includes(slot)) {
    const cycles = c.walkCycle / (Math.PI * 2);
    return (cycles - Math.floor(cycles)) * LAST;
  }
  if (seconds <= 0) return 0;
  if (slot === LEG_SLOT.Jump) {
    const J = FIGURE_RIG.jump;
    return Math.min(J.to, J.from + Math.max(0, c.airTime)) / seconds;
  }
  if (slot === LEG_SLOT.HitCall) return Math.min(c.statusTime / seconds, LAST);
  return 0;
}

/**
 * Writes `c`'s legs (one sample: LEG_SAMPLE numbers, in the figure's own frame) into `out`: every clip with weight,
 * each at its place in the clip (between two of its samples), blended by weight. Allocation-free.
 */
export function figureLegPose(c: Character, legs: FigureLegs, out: Float32Array): void {
  characterLegWeights(c, weights);
  out.fill(0, 0, LEG_SAMPLE);
  let total = 0;
  for (let slot = 0; slot < LEG_CLIPS.length; slot++) {
    const w = weights[slot]!;
    const clip = legs.clips[slot];
    if (w <= 1e-6 || !clip || clip.frames < 1) continue;
    total += w;
    const at = shareOf(c, slot, clip.seconds) * (clip.frames - 1);
    const i0 = Math.min(clip.frames - 1, Math.max(0, Math.floor(at)));
    const i1 = Math.min(clip.frames - 1, i0 + 1);
    const u = at - i0;
    const p = clip.points;
    for (let k = 0; k < LEG_SAMPLE; k++) out[k]! += w * (p[i0 * LEG_SAMPLE + k]! * (1 - u) + p[i1 * LEG_SAMPLE + k]! * u);
  }
  if (total > 0) for (let k = 0; k < LEG_SAMPLE; k++) out[k]! /= total;
}
