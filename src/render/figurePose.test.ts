import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../config/figureRig';
import {
  BODY_CLIPS,
  createFigurePose,
  createPoseState,
  FIRE_CLIPS,
  type FigurePose,
  hasRest,
  magazinesAt,
  type MagazineShow,
  type MagazineTimes,
  POSE_CLIPS,
  POSE_SLOT as S,
  type PoseClipTable,
  type PoseInput,
  type PoseState,
  poseRestartCall,
  poseShot,
  releasedBetween,
  stepPose,
} from './figurePose';

/** BF1 acceptance 1 to 3: the pose blend as plain numbers, on a synthetic clip table (no files). */

const DT = 1 / 60;
const TABLE: PoseClipTable = POSE_CLIPS.map((name) => {
  const speeds: Record<string, number> = { Walk_F: 1.5, Run_F: 4, Run_B: 3.5, Run_L: 3.5, Run_R: 3.5, Sprint: 6, CrouchWalk: 1, WalkOff: 1.5 };
  return { seconds: name === 'Rifle_Fire' || name === 'Pistol_Fire' ? 0.2 : name === 'HitCall' ? 1 : 0.8, speed: speeds[name] ?? null };
});

const input = (over: Partial<PoseInput> = {}): PoseInput => ({
  status: 'alive',
  statusTime: 0,
  forward: 0,
  side: 0,
  crouch: 0,
  sprinting: false,
  airborne: false,
  airTime: 0,
  pitch: 0,
  hold: 'rifle',
  reload: null,
  draw: null,
  firstPerson: false,
  vaulting: false,
  rest: 0,
  cycle: null,
  ...over,
});

/** Runs `seconds` of the same input and returns the settled state and pose. */
function run(inp: PoseInput, seconds = 3, state: PoseState = createPoseState(), out: FigurePose = createFigurePose()) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepPose(state, inp, DT, TABLE, out);
  return { state, out };
}
const sum = (a: Float32Array, from = 0, to = a.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]!;
  return s;
};

describe('legs: weights sum to 1 and follow the movement', () => {
  const cases: [string, Partial<PoseInput>][] = [
    ['standing', {}],
    ['walking', { forward: 1.5 }],
    ['running sideways', { side: 4 }],
    ['crouched and walking', { crouch: 1, forward: 1 }],
    ['sprinting', { forward: 6, sprinting: true }],
    ['in the air', { airborne: true, airTime: 0.3 }],
    ['calling', { status: 'calling' }],
    ['walking off', { status: 'walkingOff', forward: 1.5 }],
  ];
  for (const [name, over] of cases) {
    it(`${name}: lower weights sum to 1, and the upper body's too`, () => {
      const { out } = run(input(over));
      expect(sum(out.lower, 0, BODY_CLIPS)).toBeCloseTo(1, 4);
      // (the trigger presses are additive, on top)
      expect(sum(out.upper, 0, BODY_CLIPS) + sum(out.upper, BODY_CLIPS, POSE_CLIPS.length - FIRE_CLIPS)).toBeCloseTo(1, 3);
    });
  }

  it('stands on Idle, walks on Walk_F, runs on Run_F as the pace passes walkSpeed to runSpeed', () => {
    expect(run(input()).out.lower[S.Idle]).toBeCloseTo(1, 3);
    expect(run(input({ forward: FIGURE_RIG.walkSpeed })).out.lower[S.Walk_F]).toBeCloseTo(1, 2);
    expect(run(input({ forward: FIGURE_RIG.runSpeed })).out.lower[S.Run_F]).toBeCloseTo(1, 2);
    const mid = run(input({ forward: (FIGURE_RIG.walkSpeed + FIGURE_RIG.runSpeed) / 2 })).out.lower;
    expect(mid[S.Walk_F]).toBeCloseTo(0.5, 2);
    expect(mid[S.Run_F]).toBeCloseTo(0.5, 2);
  });

  it('picks the run clip of the step direction: back, left, right', () => {
    const v = FIGURE_RIG.runSpeed;
    expect(run(input({ forward: -v })).out.lower[S.Run_B]).toBeCloseTo(1, 2);
    expect(run(input({ side: -v })).out.lower[S.Run_L]).toBeCloseTo(1, 2);
    expect(run(input({ side: v })).out.lower[S.Run_R]).toBeCloseTo(1, 2);
  });

  it('crouching swaps the standing clips for the crouched ones', () => {
    expect(run(input({ crouch: 1 })).out.lower[S.CrouchIdle]).toBeCloseTo(1, 3);
    expect(run(input({ crouch: 1, forward: 1 })).out.lower[S.CrouchWalk]).toBeCloseTo(1, 3);
    const half = run(input({ crouch: 0.5 })).out.lower;
    expect(half[S.Idle]).toBeCloseTo(0.5, 3);
    expect(half[S.CrouchIdle]).toBeCloseTo(0.5, 3);
  });

  it('sprint plays only when sprinting and moving; sprinting on the spot stays on the gait', () => {
    expect(run(input({ forward: 6, sprinting: true })).out.lower[S.Sprint]).toBeCloseTo(1, 3);
    expect(run(input({ forward: 0, sprinting: true })).out.lower[S.Sprint]).toBeCloseTo(0, 3);
    expect(run(input({ forward: 6 })).out.lower[S.Sprint]).toBeCloseTo(0, 3);
  });

  it('airborne plays the jump clip over the time in the air, held inside the clip span', () => {
    const j = FIGURE_RIG.jump;
    const mid = run(input({ airborne: true, airTime: 0.1 }));
    expect(mid.out.lower[S.Jump]).toBeCloseTo(1, 2);
    expect(mid.out.time[S.Jump]).toBeCloseTo(j.from + 0.1, 5);
    expect(run(input({ airborne: true, airTime: 5 })).out.time[S.Jump]).toBeCloseTo(j.to, 5);
    expect(run(input({ airborne: true, airTime: -1 })).out.time[S.Jump]).toBeCloseTo(j.from, 5);
  });

  it('calling and walking off take the legs; a dead figure in the air does not jump', () => {
    expect(run(input({ status: 'calling' })).out.lower[S.HitCall]).toBeCloseTo(1, 3);
    expect(run(input({ status: 'walkingOff' })).out.lower[S.WalkOff]).toBeCloseTo(1, 3);
    expect(run(input({ status: 'leaving' })).out.lower[S.WalkOff]).toBeCloseTo(1, 3);
    expect(run(input({ status: 'calling', airborne: true })).out.lower[S.Jump]).toBeCloseTo(0, 3);
  });

  it('eases: one frame after a change the old mode still has most of the weight', () => {
    const state = createPoseState();
    const out = createFigurePose();
    run(input(), 2, state, out);
    stepPose(state, input({ status: 'calling' }), DT, TABLE, out);
    expect(out.lower[S.HitCall]).toBeGreaterThan(0);
    expect(out.lower[S.HitCall]).toBeLessThan(0.3);
    expect(out.lower[S.Idle]).toBeGreaterThan(0.7);
  });

  it('cycles advance by ground covered and not while standing; crouch walk runs backwards on a backward step', () => {
    const fwd = run(input({ forward: 1.5 }), 1);
    const still = run(input(), 1);
    expect(fwd.state.gait).toBeGreaterThan(0);
    expect(still.state.gait).toBe(0);
    // 1.5 m/s * 1 s / (Walk_F stride 1.5*0.8 m) blended in; just check the direction of the crouched step.
    expect(run(input({ crouch: 1, forward: 1 }), 1).state.crouchStep).toBeGreaterThan(0);
    expect(run(input({ crouch: 1, forward: -1 }), 1).state.crouchStep).toBeLessThan(0);
    // A cycle's time never reaches the clip's end.
    for (const i of [S.Walk_F, S.Sprint, S.CrouchWalk, S.WalkOff]) expect(fwd.out.time[i]).toBeLessThan(TABLE[i]!.seconds);
  });

  it('plays every cycle at the simulation walk cycle when one is given, so the legs step with their hit volumes (IM8)', () => {
    for (const cycle of [0.3, 7.6]) {
      const { state, out } = run(input({ forward: 1.5, crouch: 0.5, cycle }), 1);
      expect(state.gait).toBe(cycle);
      for (const i of [S.Walk_F, S.Run_F, S.Run_L, S.Sprint, S.CrouchWalk, S.WalkOff]) {
        expect(out.time[i]).toBeCloseTo((cycle - Math.floor(cycle)) * TABLE[i]!.seconds, 3);
      }
    }
  });

  it('the hit call clock runs only while calling and holds the clip’s last pose; poseRestartCall rewinds it', () => {
    const state = createPoseState();
    const out = createFigurePose();
    run(input({ status: 'calling' }), 5, state, out);
    expect(out.time[S.HitCall]).toBeCloseTo(TABLE[S.HitCall]!.seconds * 0.9999, 4);
    poseRestartCall(state);
    expect(state.call).toBe(0);
    run(input({ status: 'alive' }), 1, state, out);
    expect(state.call).toBe(0);
  });
});

describe('upper body: the aim layer', () => {
  it('is on for a figure in play and aims with the rifle clips by default', () => {
    const { out } = run(input());
    expect(out.overlay).toBeCloseTo(1, 3);
    expect(out.upper[S.Rifle_Aim]).toBeCloseTo(1, 3);
    expect(out.rifleAim).toBeCloseTo(1, 3);
    expect(out.pistolAim).toBeCloseTo(0, 3);
    expect(sum(out.upper, 0, BODY_CLIPS)).toBeCloseTo(0, 3);
  });

  const off: [string, Partial<PoseInput>][] = [
    ['out', { status: 'out' }],
    ['sprinting', { sprinting: true, forward: 6 }],
    ['calling', { status: 'calling' }],
    ['walking off', { status: 'walkingOff' }],
    ['in first person', { firstPerson: true }],
    ['vaulting', { vaulting: true, airborne: true, airTime: 0.2, crouch: 0.6, forward: 4 }],
  ];
  for (const [name, over] of off) {
    it(`is off while ${name}: the upper body plays the legs' clips`, () => {
      const { out } = run(input(over));
      expect(out.overlay).toBeCloseTo(0, 3);
      expect(sum(out.upper, BODY_CLIPS, POSE_CLIPS.length)).toBeCloseTo(0, 3);
      for (let i = 0; i < BODY_CLIPS; i++) expect(out.upper[i]).toBeCloseTo(out.lower[i]!, 3);
    });
  }

  it('the pistol hold moves the aim to the pistol clips', () => {
    const { out } = run(input({ hold: 'pistol' }));
    expect(out.upper[S.Pistol_Aim]).toBeCloseTo(1, 3);
    expect(out.upper[S.Rifle_Aim]).toBeCloseTo(0, 3);
    expect(out.pistolAim).toBeCloseTo(1, 3);
    expect(out.hold).toBe('pistol');
  });

  it('the view’s pitch blends Aim, AimUp and AimDown up to the clips’ reach, and leans the rest', () => {
    const reach = FIGURE_RIG.aimPitch * FIGURE_RIG.aimReach;
    const up = run(input({ pitch: reach / 2 })).out;
    expect(up.upper[S.Rifle_AimUp]).toBeCloseTo(0.5, 3);
    expect(up.upper[S.Rifle_Aim]).toBeCloseTo(0.5, 3);
    expect(up.pitchLean).toBeCloseTo(0, 5);
    const down = run(input({ pitch: -reach / 4 })).out;
    expect(down.upper[S.Rifle_AimDown]).toBeCloseTo(0.25, 3);
    expect(down.upper[S.Rifle_AimUp]).toBe(0);
    const past = run(input({ pitch: reach + 0.3 })).out;
    expect(past.upper[S.Rifle_AimUp]).toBeCloseTo(1, 3);
    expect(past.upper[S.Rifle_Aim]).toBeCloseTo(0, 3);
    expect(past.pitchLean).toBeCloseTo(0.3, 3);
    expect(run(input({ pitch: -reach - 0.2 })).out.pitchLean).toBeCloseTo(-0.2, 3);
  });

  it('no lean is asked of a figure whose aim layer is off', () => {
    expect(run(input({ pitch: 1.2, status: 'out' })).out.pitchLean).toBeCloseTo(0, 3);
  });

  it('the aim clips are held poses at their first frame', () => {
    const { out } = run(input({ forward: 1.5 }), 1);
    for (let i = S.Rifle_Aim; i <= S.Pistol_AimDown; i++) expect(out.time[i]).toBe(0);
  });
});

describe('upper body: resting on cover (M104)', () => {
  const aims = (o: FigurePose, kind: 'Rifle' | 'Pistol') => [o.upper[S[`${kind}_Aim`]]!, o.upper[S[`${kind}_AimUp`]]!, o.upper[S[`${kind}_AimDown`]]!];
  const rests = (o: FigurePose, kind: 'Rifle' | 'Pistol') => [o.upper[S[`${kind}_Rest`]]!, o.upper[S[`${kind}_RestUp`]]!, o.upper[S[`${kind}_RestDown`]]!];
  const total = (a: number[]) => a.reduce((x, y) => x + y, 0);

  it('blends each aim clip into its Rest clip at the same pitch, by how settled the replica is, at their first frame', () => {
    const half = run(input({ rest: 0.5, pitch: 0.3 })).out;
    expect(total(aims(half, 'Rifle'))).toBeCloseTo(0.5, 3);
    expect(total(rests(half, 'Rifle'))).toBeCloseTo(0.5, 3);
    for (let k = 0; k < 3; k++) expect(rests(half, 'Rifle')[k]).toBeCloseTo(aims(half, 'Rifle')[k]!, 4);
    expect(total(rests(half, 'Pistol'))).toBeCloseTo(0, 3);
    for (let i = S.Rifle_Rest; i <= S.Pistol_RestDown; i++) expect(half.time[i]).toBe(0);
    const pistol = run(input({ rest: 1, hold: 'pistol' })).out;
    expect(total(rests(pistol, 'Pistol'))).toBeCloseTo(1, 3);
    expect(total(aims(pistol, 'Pistol'))).toBeCloseTo(0, 3);
    expect(total(rests(pistol, 'Rifle'))).toBeCloseTo(0, 3);
  });

  it('keeps the aim whole for a file without Rest clips (it leans by FIGURE_RIG.rest instead)', () => {
    expect(hasRest(TABLE, 'rifle')).toBe(true);
    const none = TABLE.map((c, i) => (i >= S.Rifle_Rest && i <= S.Pistol_RestDown ? { seconds: 0, speed: null } : c));
    expect(hasRest(none, 'rifle')).toBe(false);
    expect(hasRest(none, 'pistol')).toBe(false);
    const state = createPoseState();
    const out = createFigurePose();
    for (let i = 0; i < 180; i++) stepPose(state, input({ rest: 1 }), DT, none, out);
    expect(total(aims(out, 'Rifle'))).toBeCloseTo(1, 3);
    expect(total(rests(out, 'Rifle'))).toBe(0);
  });

  it('does not rest without the aim: reloading, sprinting, out, or as your own body', () => {
    const rested = (over: Partial<PoseInput>) => {
      const { out } = run(input({ rest: 1, ...over }));
      return total(rests(out, 'Rifle')) + total(rests(out, 'Pistol'));
    };
    expect(rested({ reload: 0.4 })).toBeCloseTo(0, 3);
    expect(rested({ forward: 6, sprinting: true })).toBeCloseTo(0, 3);
    expect(rested({ status: 'out' })).toBeCloseTo(0, 3);
    expect(rested({ firstPerson: true })).toBeCloseTo(0, 3);
  });
});

describe('upper body: reload and switch', () => {
  it('a reload takes the upper body, its clip run by the reload’s progress', () => {
    const { out } = run(input({ reload: 0.5 }));
    expect(out.upper[S.Rifle_Reload]).toBeCloseTo(1, 3);
    expect(out.upper[S.Rifle_Aim]).toBeCloseTo(0, 3);
    expect(out.time[S.Rifle_Reload]).toBeCloseTo(0.5 * TABLE[S.Rifle_Reload]!.seconds * 0.9999, 4);
    expect(out.reload).toBeCloseTo(1, 3);
    expect(out.reloadAt).toBeCloseTo(0.5, 5);
    expect(out.reloadHold).toBe('rifle');
  });

  it('a pistol reload plays the pistol’s clip; progress is clamped to 0..1', () => {
    const { out } = run(input({ hold: 'pistol', reload: 3 }));
    expect(out.upper[S.Pistol_Reload]).toBeCloseTo(1, 3);
    expect(out.upper[S.Rifle_Reload]).toBe(0);
    expect(out.reloadAt).toBe(1);
    expect(out.reloadHold).toBe('pistol');
  });

  it('the reload eases out into the aim and keeps its clip while it does', () => {
    const state = createPoseState();
    const out = createFigurePose();
    run(input({ reload: 0.9 }), 1, state, out);
    stepPose(state, input(), DT, TABLE, out);
    expect(out.upper[S.Rifle_Reload]).toBeGreaterThan(0.3);
    expect(out.upper[S.Rifle_Reload]).toBeLessThan(1);
    expect(out.upper[S.Rifle_Aim]).toBeGreaterThan(0);
    expect(out.reloadAt).toBeCloseTo(0.9, 5);
    expect(sum(out.upper)).toBeCloseTo(1, 3);
  });

  it('a draw from the rifle plays Switch forwards, from the pistol backwards; the replica swaps at switchPistolFrom', () => {
    const to = run(input({ hold: 'pistol', draw: { progress: 0.25, from: 'rifle' } })).out;
    expect(to.upper[S.Switch]).toBeCloseTo(1, 3);
    expect(to.time[S.Switch]).toBeCloseTo(0.25 * TABLE[S.Switch]!.seconds * 0.9999, 4);
    expect(to.hold).toBe('rifle');
    const later = run(input({ hold: 'pistol', draw: { progress: 0.5, from: 'rifle' } })).out;
    expect(later.hold).toBe('pistol');
    const back = run(input({ hold: 'rifle', draw: { progress: 0.25, from: 'pistol' } })).out;
    expect(back.time[S.Switch]).toBeCloseTo(0.75 * TABLE[S.Switch]!.seconds * 0.9999, 4);
    expect(back.hold).toBe('pistol');
    expect(run(input({ hold: 'rifle', draw: { progress: 0.9, from: 'pistol' } })).out.hold).toBe('rifle');
  });

  it('a draw of the same kind (no switch) and a draw during a reload play no Switch', () => {
    expect(run(input({ draw: { progress: 0.5, from: 'rifle' } })).out.upper[S.Switch]).toBeCloseTo(0, 3);
    const r = run(input({ hold: 'pistol', reload: 0.5, draw: { progress: 0.5, from: 'rifle' } })).out;
    expect(r.upper[S.Switch]).toBeCloseTo(0, 3);
    expect(r.upper[S.Pistol_Reload]).toBeCloseTo(1, 3);
  });

  it('no reload or switch shows on a figure whose aim layer is off', () => {
    const { out } = run(input({ reload: 0.5, sprinting: true, forward: 6 }));
    expect(out.upper[S.Rifle_Reload]).toBeCloseTo(0, 3);
    expect(out.reload).toBeCloseTo(0, 3);
  });
});

describe('the trigger press', () => {
  it('plays on top for a shot while under the fire clip’s length, from its start, and then stops', () => {
    const state = createPoseState();
    const out = createFigurePose();
    run(input(), 1, state, out);
    expect(out.upper[S.Rifle_Fire]).toBe(0);
    poseShot(state, 'rifle');
    stepPose(state, input(), DT, TABLE, out);
    expect(out.upper[S.Rifle_Fire]).toBeCloseTo(1, 3);
    expect(out.time[S.Rifle_Fire]).toBeCloseTo(DT, 5);
    expect(out.upper[S.Pistol_Fire]).toBe(0);
    run(input(), 0.15, state, out);
    expect(out.upper[S.Rifle_Fire]).toBeGreaterThan(0);
    run(input(), 0.1, state, out);
    expect(out.upper[S.Rifle_Fire]).toBe(0);
  });

  it('a pistol shot plays the pistol’s press', () => {
    const state = createPoseState();
    const out = createFigurePose();
    run(input({ hold: 'pistol' }), 1, state, out);
    poseShot(state, 'pistol');
    stepPose(state, input({ hold: 'pistol' }), DT, TABLE, out);
    expect(out.upper[S.Pistol_Fire]).toBeCloseTo(1, 3);
    expect(out.upper[S.Rifle_Fire]).toBe(0);
  });

  it('is not played without the aim layer, nor during a reload', () => {
    const state = createPoseState();
    const out = createFigurePose();
    run(input({ status: 'out' }), 1, state, out);
    poseShot(state, 'rifle');
    stepPose(state, input({ status: 'out' }), DT, TABLE, out);
    expect(out.upper[S.Rifle_Fire]).toBe(0);
    const s2 = createPoseState();
    run(input({ reload: 0.5 }), 1, s2, out);
    poseShot(s2, 'rifle');
    stepPose(s2, input({ reload: 0.5 }), DT, TABLE, out);
    expect(out.upper[S.Rifle_Fire]).toBeCloseTo(0, 3);
  });
});

describe('the reload’s magazines', () => {
  const T: MagazineTimes = { from: 0.5, to: 0.8, hidden: [0.2, 0.6], oldFrom: 0.1, release: 0.3 };
  const show = (u: number): MagazineShow => magazinesAt(T, u, { fresh: false, old: false, replicaHidden: false });

  it('windows are closed at the start and open at the end', () => {
    expect(show(0.5).fresh).toBe(true);
    expect(show(0.4999).fresh).toBe(false);
    expect(show(0.8).fresh).toBe(false);
    expect(show(0.7999).fresh).toBe(true);
    expect(show(0.1).old).toBe(true);
    expect(show(0.0999).old).toBe(false);
    expect(show(0.3).old).toBe(false);
    expect(show(0.2).replicaHidden).toBe(true);
    expect(show(0.6).replicaHidden).toBe(false);
    expect(show(0.5999).replicaHidden).toBe(true);
  });

  it('writes into and returns the object it is given', () => {
    const o: MagazineShow = { fresh: true, old: true, replicaHidden: true };
    expect(magazinesAt(T, 0, o)).toBe(o);
    expect(o).toEqual({ fresh: false, old: false, replicaHidden: false });
  });

  it('the old magazine is thrown on the frame that crosses the release, once', () => {
    expect(releasedBetween(T, 0.29, 0.31)).toBe(true);
    expect(releasedBetween(T, 0.29, 0.3)).toBe(true);
    expect(releasedBetween(T, 0.3, 0.31)).toBe(false);
    expect(releasedBetween(T, 0.2, 0.29)).toBe(false);
    expect(releasedBetween(T, 0.31, 0.2)).toBe(false);
  });
});
