import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../../config/figureRig';
import { createFigurePose, createPoseState, hasHolster, OPTIONAL_CLIPS, POSE_CLIPS, POSE_SLOT as S, type PoseClipTable, type PoseInput, type PoseState, stepPose } from './figurePose';

/** BP4 (Blender models bug pass): the pose blend's fixes and the Holster clips, as plain numbers on a synthetic table. */

const DT = 1 / 60;
const make = (without: readonly string[] = []): PoseClipTable =>
  POSE_CLIPS.map((name) => {
    const speeds: Record<string, number> = { Walk_F: 1.5, Run_F: 4, Run_B: 3.5, Run_L: 3.5, Run_R: 3.5, Sprint: 6, CrouchWalk: 1, WalkOff: 1.5, Holster_Sprint: 6 };
    return { seconds: without.includes(name) ? 0 : name === 'Rifle_Fire' || name === 'Pistol_Fire' ? 0.2 : 0.8, speed: without.includes(name) ? null : (speeds[name] ?? null) };
  });
const TABLE = make();
const input = (over: Partial<PoseInput> = {}): PoseInput => ({
  status: 'alive', statusTime: 0, forward: 0, side: 0, crouch: 0, sprinting: false, airborne: false, airTime: 0, pitch: 0, hold: 'rifle',
  reload: null, draw: null, firstPerson: false, vaulting: false, vaultAt: 0, holster: 0, cycle: null, ...over,
});
function run(inp: PoseInput, seconds = 3, state: PoseState = createPoseState(), table = TABLE) {
  const out = createFigurePose();
  for (let i = 0; i < Math.round(seconds / DT); i++) stepPose(state, inp, DT, table, out);
  return { state, out };
}

describe('F2 landing holds the Jump clip where it was', () => {
  it('keeps the clip time at the tuck after landing while the jump eases out, not back at jump.from', () => {
    const J = FIGURE_RIG.jump;
    const { state } = run(input({ airborne: true, airTime: 0.3 }), 0.4);
    const air = Math.min(J.to, J.from + 0.3);
    expect(air).toBeGreaterThan(J.from);
    const out = createFigurePose();
    // Landed: airTime back to 0, the jump weight still easing out.
    stepPose(state, input({ airTime: 0 }), DT, TABLE, out);
    expect(state.jump).toBeGreaterThan(0.05);
    expect(out.time[S.Jump]).toBeCloseTo(air, 5);
    expect(out.time[S.Jump]).not.toBeCloseTo(J.from, 3);
  });
});

describe('F6 in a switch the hold follows the Switch clip from its start', () => {
  it('shows the replica switched from on the first frames, the one drawn once the clip is past switchPistolFrom', () => {
    const early = createFigurePose();
    stepPose(createPoseState(), input({ hold: 'pistol', draw: { progress: 0.05, from: 'rifle' } }), DT, TABLE, early);
    expect(early.hold).toBe('rifle');
    const late = run(input({ hold: 'pistol', draw: { progress: 0.9, from: 'rifle' } }), 1).out;
    expect(late.hold).toBe('pistol');
    const back = createFigurePose();
    stepPose(createPoseState(), input({ hold: 'rifle', draw: { progress: 0.05, from: 'pistol' } }), DT, TABLE, back);
    expect(back.hold).toBe('pistol');
  });
});

describe('the Holster clips', () => {
  it('are optional, and hasHolster follows the table', () => {
    expect(OPTIONAL_CLIPS.has('Holster')).toBe(true);
    expect(OPTIONAL_CLIPS.has('Holster_Sprint')).toBe(true);
    expect(hasHolster(TABLE)).toBe(true);
    expect(hasHolster(make(['Holster', 'Holster_Sprint']))).toBe(false);
  });

  it('holstered, the Holster clip takes the aims\' and the fire\'s weight and the pitch lean goes', () => {
    const state = createPoseState();
    run(input({ pitch: 1.4 }), 2, state);
    const armed = createFigurePose();
    stepPose(state, input({ pitch: 1.4 }), DT, TABLE, armed);
    expect(armed.pitchLean).not.toBe(0);
    const { out, state: s } = run(input({ pitch: 1.4, holster: 1 }), 3, state);
    expect(s.holster).toBeGreaterThan(0.99);
    expect(out.upper[S.Holster]).toBeCloseTo(out.overlay, 2);
    for (const slot of [S.Rifle_Aim, S.Rifle_AimUp, S.Rifle_AimDown, S.Pistol_Aim, S.Rifle_Fire, S.Pistol_Fire]) expect(out.upper[slot]!, POSE_CLIPS[slot]).toBeLessThan(0.01);
    expect(Math.abs(out.pitchLean)).toBeLessThan(0.01);
    // A shot while holstered shows no trigger press.
    const shot = createPoseState();
    shot.fireAge = 0;
    const o2 = createFigurePose();
    for (let i = 0; i < 180; i++) stepPose(shot, input({ holster: 1 }), DT, TABLE, o2);
    shot.fireAge = 0;
    stepPose(shot, input({ holster: 1 }), DT, TABLE, o2);
    expect(o2.upper[S.Rifle_Fire]).toBeLessThan(0.01);
  });

  it('give the arms back to the aim as the holster falls to 0 on a draw', () => {
    const state = createPoseState();
    run(input({ holster: 1 }), 3, state);
    const { out } = run(input({ holster: 0 }), 3, state);
    expect(out.upper[S.Holster]).toBeLessThan(0.01);
    expect(out.upper[S.Rifle_Aim]).toBeGreaterThan(0.9 * out.overlay);
  });

  it('in a sprint Holster_Sprint takes the Sprint\'s upper weight', () => {
    const sprint = input({ forward: 6, sprinting: true });
    const plain = run(sprint, 3).out;
    expect(plain.upper[S.Sprint]).toBeGreaterThan(0.9);
    expect(plain.upper[S.Holster_Sprint]).toBe(0);
    const holstered = run({ ...sprint, holster: 1 }, 3).out;
    expect(holstered.upper[S.Holster_Sprint]).toBeCloseTo(plain.upper[S.Sprint]!, 2);
    expect(holstered.upper[S.Sprint]).toBeLessThan(0.01);
    expect(holstered.time[S.Holster_Sprint]).toBeCloseTo(holstered.time[S.Sprint]!, 5);
  });

  it('are ignored by a table without them', () => {
    const bare = make(['Holster', 'Holster_Sprint']);
    const withNo = run(input({ holster: 1, pitch: 0.3 }), 3, createPoseState(), bare);
    const plain = run(input({ pitch: 0.3 }), 3, createPoseState(), bare);
    expect(withNo.state.holster).toBe(0);
    expect(withNo.out.upper[S.Holster]).toBe(0);
    expect(withNo.out.upper[S.Rifle_Aim]).toBeCloseTo(plain.out.upper[S.Rifle_Aim]!, 5);
    expect(withNo.out.pitchLean).toBeCloseTo(plain.out.pitchLean, 5);
    const sprint = run(input({ forward: 6, sprinting: true, holster: 1 }), 3, createPoseState(), bare).out;
    expect(sprint.upper[S.Holster_Sprint]).toBe(0);
    expect(sprint.upper[S.Sprint]).toBeGreaterThan(0.9);
  });
});
