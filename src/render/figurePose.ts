import { FIGURE_RIG } from '../config/figureRig';
import type { LifeStatus } from '../sim/character';
import { LEG_CLIPS, LEG_MODE, LEG_MODES, type LegBlend, legClipWeights, legDirection, legMode, legRun } from '../sim/figureLegs';

/**
 * What a rigged figure (BF1, render/riggedFigure.ts) plays each frame, worked out from its character as plain numbers:
 * the weight and time of every clip, which replica it holds and where the reload's magazines are. No Three.js here, so
 * the rules are tested on their own (figurePose.test.ts).
 *
 * The legs and the upper body are two layers. The legs blend standing, walking and running in four directions,
 * crouching, a jump, the sprint, the hit call, the walk-off and the vault, each clip's time stepped by the ground covered
 * so feet don't slide (or, in a match whose hit volumes follow the figures' legs, at the simulation's walk cycle: IM8,
 * sim/figureLegs.ts, which weighs the legs' clips by the same rules); the vault's clip is run by the vault's progress
 * (where the file has it). The upper body is the same clips' unless the figure is in play and not sprinting or
 * vaulting: then it aims (the rifle's or the pistol's three clips blended by the view's pitch), reloads (the clip run by
 * the reload's progress) or switches replica (the Switch clip, run backwards from the pistol to the rifle). The replica
 * resting on cover blends the aim into the Rest clips, which lean it in over the cover (where the file has them); one
 * trigger press plays on top for each shot. Every blend eases in (FIGURE_RIG.blend), so nothing snaps.
 */

/**
 * The clips a figure plays, by slot (FigurePose arrays). The first thirteen (sim/figureLegs.ts LEG_CLIPS) drive the legs
 * and, unless overridden, the upper body.
 */
export const POSE_CLIPS = [
  ...LEG_CLIPS,
  'Rifle_Aim',
  'Rifle_AimUp',
  'Rifle_AimDown',
  'Pistol_Aim',
  'Pistol_AimUp',
  'Pistol_AimDown',
  'Rifle_Reload',
  'Pistol_Reload',
  'Switch',
  'Rifle_Rest',
  'Rifle_RestUp',
  'Rifle_RestDown',
  'Pistol_Rest',
  'Pistol_RestUp',
  'Pistol_RestDown',
  'Holster',
  'Holster_Sprint',
  'Rifle_Fire',
  'Pistol_Fire',
] as const;
export type PoseClip = (typeof POSE_CLIPS)[number];

/** Slots 0 to BODY_CLIPS - 1 are whole-body clips (legs and upper body); the rest drive the upper body only. */
export const BODY_CLIPS = LEG_CLIPS.length;
/** The last two slots are the trigger presses, played additively. */
export const FIRE_CLIPS = 2;
/**
 * Clips a figure's file may lack (made with the figure redesign, Dev 6): their slots are then empty, with a length of 0
 * in the clip table. A file without the Rest clips leans by FIGURE_RIG.rest instead (render/riggedFigure.ts); one
 * without the Vault clip vaults on the legs' clips (the jump, tucked by the crouch); one without the Holster clips (BP4)
 * holds the replica in the hands while holstered.
 */
export const OPTIONAL_CLIPS: ReadonlySet<PoseClip> = new Set<PoseClip>(['Vault', 'Rifle_Rest', 'Rifle_RestUp', 'Rifle_RestDown', 'Pistol_Rest', 'Pistol_RestUp', 'Pistol_RestDown', 'Holster', 'Holster_Sprint']);

const S = Object.fromEntries(POSE_CLIPS.map((name, i) => [name, i])) as Record<PoseClip, number>;
export const POSE_SLOT: Readonly<Record<PoseClip, number>> = S;

/** Whether the clip table has `hold`'s Rest clips (the file had them). */
export function hasRest(table: PoseClipTable, hold: PoseHold): boolean {
  return len(table, hold === 'pistol' ? S.Pistol_Rest : S.Rifle_Rest) > 0;
}

/** Whether the clip table has the Holster clips (the file had them: bot23.py, BP4). */
export function hasHolster(table: PoseClipTable): boolean {
  return len(table, S.Holster) > 0;
}

/** Whether the clip table has the Vault clip (the file had it). */
export function hasVault(table: PoseClipTable): boolean {
  return len(table, S.Vault) > 0;
}

/** A clip's length and, for a cycle, the pace it was made for (the sidecar's `seconds` and `speed`). */
export interface PoseClipInfo {
  seconds: number;
  /** Metres a second the cycle covers; null for one played in place or by time. */
  speed: number | null;
}

/** The clips' lengths and paces, by slot. */
export type PoseClipTable = readonly PoseClipInfo[];

/** The replica a figure holds: the rifle (the AEG's grip) or the pistol. */
export type PoseHold = 'rifle' | 'pistol';

/** What the character is doing this frame, read from the simulation (interpolated where it moves smoothly). */
export interface PoseInput {
  status: LifeStatus;
  statusTime: number;
  /** Horizontal velocity in the figure's own frame (m/s): ahead and to its right. */
  forward: number;
  side: number;
  /** 0 standing, 1 fully crouched. */
  crouch: number;
  sprinting: boolean;
  airborne: boolean;
  airTime: number;
  /** The view's pitch (radians, up positive). */
  pitch: number;
  /** The replica in hand. */
  hold: PoseHold;
  /** The reload's progress (0..1) while reloading, else null. */
  reload: number | null;
  /** The draw after a switch: its progress (0..1) and the replica it came from; null when not drawing. */
  draw: { progress: number; from: PoseHold } | null;
  /** The player's own figure seen from the eyes: the upper body stays the legs' clips' (the arms aren't drawn). */
  firstPerson: boolean;
  /** How settled the replica is on cover (0..1, Character.coverRest): the aim blends into the Rest clips by this much. */
  rest: number;
  /**
   * Vaulting (M102): the whole body plays the Vault clip at `vaultAt`, the replica carried in it. A file without the
   * clip plays the legs' clips instead (the jump, tucked by the crouch), the replica carried as they hold it.
   */
  vaulting: boolean;
  /** Where in the Vault clip the vault is (0..1, sim/figureLegs.ts vaultClipShare), read while vaulting. */
  vaultAt: number;
  /**
   * Holstered (M92): 1 with the replica holstered, falling to 0 as it is drawn from the holster (the arms rising from
   * hanging to the aim), else 0. The arms hang (the Holster clip, the Holster_Sprint's in a sprint) by this much where
   * the file has the clips.
   */
  holster: number;
  /**
   * The simulation's walk cycle (cycles, interpolated) when the match's hit volumes follow the figures' legs (IM8): every
   * cycle clip is played at it, so the drawn legs step with their hit volumes. Null: the figure steps its own cycles.
   */
  cycle: number | null;
}

const MODES = LEG_MODES;
const GAIT = LEG_MODE.gait;

/** A figure's blends and cycles, carried from frame to frame (one per figure). */
export interface PoseState {
  /** How far each leg mode is in (sum 1). */
  mode: Float32Array;
  /** Moving (1) or standing (0), eased. */
  move: number;
  /** The step's direction weights: ahead, back, left, right (sum 1), eased. */
  dir: Float32Array;
  jump: number;
  /** Where in the Jump clip the legs are (seconds): held from the landing while the jump eases out, never snapped back. */
  jumpAt: number;
  /** How settled the replica is on cover, eased: a rest taken away at once (a hit) leans back out, not in one frame. */
  rest: number;
  /** The holstered arms' share, eased. */
  holster: number;
  /** The upper body's layer (aim, reload or switch) over the legs' clips, and within it the reload's and the switch's share. */
  overlay: number;
  reload: number;
  switching: number;
  /** The pistol's share of the aim (0 the rifle's clips, 1 the pistol's). */
  pistol: number;
  /** Cycle phases (cycles, unwrapped): the walk and run, the crouched walk, the sprint, the walk-off; and the idles' clock. */
  gait: number;
  crouchStep: number;
  sprint: number;
  walkOff: number;
  idle: number;
  /** Seconds since the last shot (the trigger press plays while it is under the fire clip's length). */
  fireAge: number;
  fireHold: PoseHold;
  /** The hit call's clock: the clip holds its last pose once played. */
  call: number;
  /** The last reload clip and its progress, kept while the reload eases out. */
  reloadHold: PoseHold;
  reloadAt: number;
  /** The last switch's clip time share and the replica it shows there. */
  switchAt: number;
  /** The Vault clip's share, kept while the vault eases out. */
  vaultAt: number;
}

export function createPoseState(): PoseState {
  const mode = new Float32Array(MODES);
  mode[GAIT] = 1;
  const dir = new Float32Array(4);
  dir[0] = 1;
  return {
    mode,
    move: 0,
    dir,
    jump: 0,
    jumpAt: FIGURE_RIG.jump.from,
    rest: 0,
    holster: 0,
    overlay: 0,
    reload: 0,
    switching: 0,
    pistol: 0,
    gait: 0,
    crouchStep: 0,
    sprint: 0,
    walkOff: 0,
    idle: 0,
    fireAge: Infinity,
    fireHold: 'rifle',
    call: 0,
    reloadHold: 'rifle',
    reloadAt: 0,
    switchAt: 0,
    vaultAt: 0,
  };
}

/** What to play this frame (one per figure, rewritten each frame). */
export interface FigurePose {
  /** Each slot's weight on the legs (whole-body slots only) and on the upper body; and its time (seconds). */
  lower: Float32Array;
  upper: Float32Array;
  time: Float32Array;
  /** The upper layer's weight (the aim, reload or switch over the legs' clips): the upper body is held upright by it. */
  overlay: number;
  /** The replica in the hand this frame (in a switch: the one the clip shows). */
  hold: PoseHold;
  /** The reload's share of the upper body (0..1) and its clip's progress (0..1). */
  reload: number;
  reloadAt: number;
  reloadHold: PoseHold;
  /**
   * The aim's pitch the clips don't reach (radians, up positive, weighted by the aim's share): the upper body leans it
   * in, so the replica points where the shot goes even past the aim clips' own reach.
   */
  pitchLean: number;
  /** The rifle's and the pistol's aim clips' share of the upper body (each twists it by its rig's aimYaw). */
  rifleAim: number;
  pistolAim: number;
}

export function createFigurePose(): FigurePose {
  const n = POSE_CLIPS.length;
  return { lower: new Float32Array(n), upper: new Float32Array(n), time: new Float32Array(n), overlay: 0, hold: 'rifle', reload: 0, reloadAt: 0, reloadHold: 'rifle', pitchLean: 0, rifleAim: 0, pistolAim: 0 };
}

const ease = (dt: number, tau: number): number => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
/** The direction the step asks for, the eased one normalised, and the legs' blend (stepPose's scratch). */
const want = new Float32Array(4);
const dir = new Float32Array(4);
const blend: LegBlend = { mode: dir, move: 0, dir, jump: 0, crouch: 0, run: 0 };
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number): number => v - Math.floor(v);

/** Starts the trigger press of a shot from `hold`. */
export function poseShot(state: PoseState, hold: PoseHold): void {
  state.fireAge = 0;
  state.fireHold = hold;
}

/** Restarts the hit call's clip (a new hit, or a figure seen calling for the first time). */
export function poseRestartCall(state: PoseState): void {
  state.call = 0;
}

/** Slot `i`'s length (seconds). */
function len(table: PoseClipTable, i: number): number {
  return table[i]?.seconds ?? 0;
}

/** Just short of a clip's end, so a cycle's last frame never wraps round to its first. */
const LAST = 0.9999;

/** The time in slot `i`'s cycle at `share` cycles. */
function at(table: PoseClipTable, i: number, share: number): number {
  return frac(share) * len(table, i) * LAST;
}

/** Metres one cycle of slot `i` covers (its pace times its length), or 0 for a clip played in place. */
function stride(table: PoseClipTable, i: number): number {
  const c = table[i];
  return c && c.speed ? c.speed * c.seconds : 0;
}

/**
 * Steps `state` by `dt` seconds for `input` and writes what to play into `out`. `table` gives each slot's length and
 * pace. Allocation-free.
 */
export function stepPose(state: PoseState, input: PoseInput, dt: number, table: PoseClipTable, out: FigurePose): FigurePose {
  const B = FIGURE_RIG.blend;
  const speed = Math.hypot(input.forward, input.side);
  const alive = input.status === 'alive';
  const inPlay = alive || input.status === 'out';

  // The legs' mode: the hit call while calling, the walk-off while walking off or leaving, the vault while vaulting (with
  // the clip), the sprint while sprinting. The vault is quick (about half a second), so it comes in and goes out fast,
  // as the hit volume's legs follow it at once.
  const vaulting = alive && input.vaulting && hasVault(table);
  const wantMode = legMode(input.status, input.sprinting, speed, vaulting);
  const km = ease(dt, vaulting || state.mode[LEG_MODE.vault]! > 1e-3 ? B.vault : B.mode);
  for (let m = 0; m < MODES; m++) state.mode[m]! += ((m === wantMode ? 1 : 0) - state.mode[m]!) * km;

  // Standing or moving, and which way: four clips' weights from the step's direction, eased.
  state.move += ((speed > FIGURE_RIG.stillBelow ? 1 : 0) - state.move) * ease(dt, B.move);
  if (legDirection(input.forward, input.side, speed, want)) {
    const kd = ease(dt, B.direction);
    for (let k = 0; k < 4; k++) state.dir[k]! += (want[k]! - state.dir[k]!) * kd;
  }
  const dirSum = state.dir[0]! + state.dir[1]! + state.dir[2]! + state.dir[3]! || 1;
  for (let k = 0; k < 4; k++) dir[k] = state.dir[k]! / dirSum;
  state.jump += ((input.airborne && inPlay ? 1 : 0) - state.jump) * ease(dt, B.jump);

  // Leg weights (the rules the hit volume's legs share, sim/figureLegs.ts): the gait's own (standing, walking ahead,
  // running four ways, crouched), then each mode's.
  const w = out.lower;
  w.fill(0);
  blend.mode = state.mode;
  blend.move = state.move;
  blend.jump = state.jump;
  blend.crouch = input.crouch;
  blend.run = legRun(speed);
  legClipWeights(blend, w);

  // The cycles step by the ground covered, so the feet keep their place: the walk and run at the stride of their blend;
  // or all of them at the simulation's walk cycle, which steps the same way (sim/figureLegs.ts figureLegCycleStep).
  const travel = speed * dt;
  const moving = w[S.Walk_F]! + w[S.Run_F]! + w[S.Run_B]! + w[S.Run_L]! + w[S.Run_R]!;
  let gaitStride = 0;
  if (moving > 1e-4) {
    gaitStride =
      (w[S.Walk_F]! * stride(table, S.Walk_F) + w[S.Run_F]! * stride(table, S.Run_F) + w[S.Run_B]! * stride(table, S.Run_B) + w[S.Run_L]! * stride(table, S.Run_L) + w[S.Run_R]! * stride(table, S.Run_R)) /
      moving;
  } else gaitStride = stride(table, S.Run_F);
  if (gaitStride > 0) state.gait += travel / gaitStride;
  // The crouched walk was made walking ahead: it runs backwards when the step goes back.
  const crouchStride = stride(table, S.CrouchWalk);
  if (crouchStride > 0) state.crouchStep += (input.forward < -FIGURE_RIG.backStep.share * speed ? -travel : travel) / crouchStride;
  const sprintStride = stride(table, S.Sprint);
  if (sprintStride > 0) state.sprint += travel / sprintStride;
  const offStride = stride(table, S.WalkOff);
  if (offStride > 0) state.walkOff += travel / offStride;
  if (input.cycle !== null) state.gait = state.crouchStep = state.sprint = state.walkOff = input.cycle;
  state.idle += dt;
  state.call = input.status === 'calling' ? state.call + dt : state.call;

  const t = out.time;
  t[S.Idle] = at(table, S.Idle, state.idle / (len(table, S.Idle) || 1));
  t[S.CrouchIdle] = at(table, S.CrouchIdle, state.idle / (len(table, S.CrouchIdle) || 1));
  for (let i = S.Walk_F; i <= S.Run_R; i++) t[i] = at(table, i, state.gait);
  t[S.CrouchWalk] = at(table, S.CrouchWalk, state.crouchStep);
  t[S.Sprint] = at(table, S.Sprint, state.sprint);
  t[S.WalkOff] = at(table, S.WalkOff, state.walkOff);
  const J = FIGURE_RIG.jump;
  // On landing the time in the air goes back to 0: the clip stays at its tuck while the jump eases out.
  if (input.airborne) state.jumpAt = Math.min(J.to, J.from + Math.max(0, input.airTime));
  t[S.Jump] = state.jumpAt;
  t[S.HitCall] = Math.min(state.call, len(table, S.HitCall) * LAST);
  if (vaulting) state.vaultAt = clamp01(input.vaultAt);
  t[S.Vault] = state.vaultAt * len(table, S.Vault) * LAST;

  // The upper layer: in play (not out), not sprinting or vaulting, and not your own first-person body.
  const overlayOn = alive && wantMode === GAIT && !input.vaulting && !input.firstPerson;
  state.overlay += ((overlayOn ? 1 : 0) - state.overlay) * ease(dt, vaulting ? B.vault : B.mode);
  const ko = ease(dt, B.overlay);
  const reloading = input.reload !== null;
  if (reloading) {
    state.reloadAt = clamp01(input.reload!);
    state.reloadHold = input.hold;
  }
  state.reload += ((reloading ? 1 : 0) - state.reload) * ko;
  // A switch between kinds plays the Switch clip (forward from the rifle, backwards from the pistol).
  const switching = input.draw !== null && input.draw.from !== input.hold && !reloading;
  if (switching) {
    const p = clamp01(input.draw!.progress);
    state.switchAt = input.draw!.from === 'rifle' ? p : 1 - p;
  }
  state.switching += ((switching ? 1 : 0) - state.switching) * ko;
  state.pistol += ((input.hold === 'pistol' ? 1 : 0) - state.pistol) * ease(dt, B.hold);
  state.rest += (clamp01(input.rest) - state.rest) * ko;
  state.holster += ((hasHolster(table) ? clamp01(input.holster) : 0) - state.holster) * ko;

  const overlay = state.overlay;
  const share = Math.min(1, state.reload + state.switching);
  const reloadShare = share > 0 ? (state.reload / (state.reload + state.switching || 1)) * share : 0;
  const switchShare = share - reloadShare;
  const aim = 1 - share;
  // The aim clips turn the replica through a share of their pitch (aimReach): blended so it follows the view's pitch.
  const reach = FIGURE_RIG.aimPitch * FIGURE_RIG.aimReach;
  const a = Math.max(-1, Math.min(1, input.pitch / reach));
  const up = Math.max(0, a);
  const down = Math.max(0, -a);
  const level = 1 - up - down;
  const u = out.upper;
  for (let i = 0; i < BODY_CLIPS; i++) u[i] = w[i]! * (1 - overlay);
  for (let i = BODY_CLIPS; i < POSE_CLIPS.length; i++) u[i] = 0;
  // Holstered: the arms hang in place of the aim, and pump in a sprint in place of the Sprint's rifle carry (its legs' stride).
  const holster = state.holster;
  const holsterSprint = len(table, S.Holster_Sprint) > 0 ? holster : 0;
  u[S.Holster_Sprint] = u[S.Sprint]! * holsterSprint;
  u[S.Sprint] = u[S.Sprint]! * (1 - holsterSprint);
  t[S.Holster_Sprint] = at(table, S.Holster_Sprint, state.sprint);
  t[S.Holster] = 0;
  const armed = aim * (1 - holster);
  u[S.Holster] = overlay * aim * holster;
  const rifleAim = overlay * armed * (1 - state.pistol);
  const pistolAim = overlay * armed * state.pistol;
  // Resting on cover: each aim clip blends into its Rest clip (the same pitch, leaned in over the cover).
  const rifleRest = hasRest(table, 'rifle') ? state.rest : 0;
  const pistolRest = hasRest(table, 'pistol') ? state.rest : 0;
  u[S.Rifle_Aim] = rifleAim * level * (1 - rifleRest);
  u[S.Rifle_AimUp] = rifleAim * up * (1 - rifleRest);
  u[S.Rifle_AimDown] = rifleAim * down * (1 - rifleRest);
  u[S.Rifle_Rest] = rifleAim * level * rifleRest;
  u[S.Rifle_RestUp] = rifleAim * up * rifleRest;
  u[S.Rifle_RestDown] = rifleAim * down * rifleRest;
  u[S.Pistol_Aim] = pistolAim * level * (1 - pistolRest);
  u[S.Pistol_AimUp] = pistolAim * up * (1 - pistolRest);
  u[S.Pistol_AimDown] = pistolAim * down * (1 - pistolRest);
  u[S.Pistol_Rest] = pistolAim * level * pistolRest;
  u[S.Pistol_RestUp] = pistolAim * up * pistolRest;
  u[S.Pistol_RestDown] = pistolAim * down * pistolRest;
  const reloadSlot = state.reloadHold === 'pistol' ? S.Pistol_Reload : S.Rifle_Reload;
  u[reloadSlot] = overlay * reloadShare;
  t[reloadSlot] = state.reloadAt * len(table, reloadSlot) * LAST;
  u[S.Switch] = overlay * switchShare;
  t[S.Switch] = state.switchAt * len(table, S.Switch) * LAST;
  // The aim clips are held poses: their first frame (and so are the rests).
  for (let i = S.Rifle_Aim; i <= S.Pistol_AimDown; i++) t[i] = 0;
  for (let i = S.Rifle_Rest; i <= S.Pistol_RestDown; i++) t[i] = 0;

  // A shot's trigger press, on top while it lasts (the aim layer must be in).
  state.fireAge += dt;
  const fireSlot = state.fireHold === 'pistol' ? S.Pistol_Fire : S.Rifle_Fire;
  u[S.Rifle_Fire] = 0;
  u[S.Pistol_Fire] = 0;
  if (state.fireAge < len(table, fireSlot)) {
    u[fireSlot] = overlay * armed;
    t[fireSlot] = state.fireAge;
  }

  out.overlay = overlay;
  out.pitchLean = (input.pitch - a * reach) * overlay * armed;
  out.rifleAim = rifleAim;
  out.pistolAim = pistolAim;
  // In a switch the hand holds what the Switch clip shows from its start (not the replica drawn next until the clip
  // gets there), and on until the clip has eased out.
  out.hold = switching || switchShare > 0.5 ? (state.switchAt >= FIGURE_RIG.switchPistolFrom ? 'pistol' : 'rifle') : input.hold;
  out.reload = overlay * reloadShare;
  out.reloadAt = state.reloadAt;
  out.reloadHold = state.reloadHold;
  return out;
}

/** Where the reload's magazines are at clip share `u` (sidecar `magazineInHand`, in shares of the reload clip). */
export interface MagazineTimes {
  /** The fresh magazine shows on the hand over [from, to). */
  from: number;
  to: number;
  /** The replica's own magazine is hidden over [hidden[0], hidden[1]). */
  hidden: readonly [number, number];
  /** The old magazine shows on the hand over [oldFrom, release), then flies. */
  oldFrom: number;
  release: number;
}

/** Which magazines a reload at clip share `u` shows. */
export interface MagazineShow {
  fresh: boolean;
  old: boolean;
  replicaHidden: boolean;
}

/** The magazines shown at reload share `u` (writes `out`). */
export function magazinesAt(times: MagazineTimes, u: number, out: MagazineShow): MagazineShow {
  out.fresh = u >= times.from && u < times.to;
  out.old = u >= times.oldFrom && u < times.release;
  out.replicaHidden = u >= times.hidden[0] && u < times.hidden[1];
  return out;
}

/** True when the reload went past the old magazine's release between shares `before` and `now`: it is thrown this frame. */
export function releasedBetween(times: MagazineTimes, before: number, now: number): boolean {
  return before < times.release && now >= times.release;
}
