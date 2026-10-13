import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../config/figureRig';
import type { FigureLegClip, FigureLegs } from '../config/hits';
import { MOVEMENT } from '../config/movement';
import { type Character, createCharacter } from './character';
import { characterLegWeights, figureLegCycleStep, figureLegPose, LEG_CLIPS, LEG_MODE, LEG_POINT, LEG_POINTS, LEG_SAMPLE, LEG_SLOT, legDirection, legMode, legRun, legsHaveVault, vaultClipShare } from './figureLegs';
import { createVaultState } from './vault';
import { vec3 } from './vec';

/** A character standing on the ground, facing -z (yaw 0). */
function standing(): Character {
  const c = createCharacter(1, vec3(), 0);
  c.grounded = true;
  return c;
}

/** Moving `speed` m/s ahead (yaw 0 faces -z). */
const ahead = (c: Character, speed: number): Character => {
  c.velocity.z = -speed;
  return c;
};

/** Every clip's samples hold one number (the slot plus the sample's index / 100), so a blend's result reads back. */
function markedLegs(): FigureLegs {
  const clips: FigureLegClip[] = LEG_CLIPS.map((_, slot) => {
    const frames = slot === LEG_SLOT.Idle || slot === LEG_SLOT.CrouchIdle ? 1 : 11;
    const points = new Float32Array(frames * LEG_SAMPLE);
    for (let f = 0; f < frames; f++) points.fill(slot + f / 100, f * LEG_SAMPLE, (f + 1) * LEG_SAMPLE);
    return { seconds: 1, stride: frames > 1 ? 1 + slot / 10 : 0, frames, points };
  });
  return { clips };
}

/** `time` seconds into a vault that rises onto the top for 0.2 s and is across it by 0.6 s. */
function vaulting(time: number): Character {
  const c = ahead(standing(), MOVEMENT.vault.minSpeed);
  Object.assign(c.vault, { active: true, time, riseEnd: 0.2, end: 0.6, speed: MOVEMENT.vault.minSpeed });
  c.grounded = false;
  c.airTime = time;
  c.crouchAmount = MOVEMENT.vault.tuck;
  return c;
}

const weights = new Float32Array(LEG_CLIPS.length);
const shares = (c: Character, vaultClip = false): Record<string, number> => {
  characterLegWeights(c, weights, vaultClip);
  return Object.fromEntries(LEG_CLIPS.map((n, i) => [n, weights[i]!]).filter(([, w]) => (w as number) > 1e-6));
};

describe('the legs clips the rigged figures play (IM8)', () => {
  it('picks the hit call, the walk-off, the sprint or the gait by the character state', () => {
    expect(legMode('calling', false, 0)).toBe(LEG_MODE.call);
    expect(legMode('walkingOff', false, 3)).toBe(LEG_MODE.walkOff);
    expect(legMode('leaving', false, 0)).toBe(LEG_MODE.walkOff);
    expect(legMode('alive', true, MOVEMENT.sprintSpeed)).toBe(LEG_MODE.sprint);
    // A sprint held while standing still is no sprint; nor is one after the hit.
    expect(legMode('alive', true, 0)).toBe(LEG_MODE.gait);
    expect(legMode('out', true, MOVEMENT.sprintSpeed)).toBe(LEG_MODE.gait);
  });

  it('plays the vault while vaulting with a Vault clip, else the jump; never over the hit call', () => {
    expect(legMode('alive', true, MOVEMENT.sprintSpeed, true)).toBe(LEG_MODE.vault);
    expect(legMode('calling', false, 0, true)).toBe(LEG_MODE.call);
    expect(legMode('out', false, 0, true)).toBe(LEG_MODE.gait);
    expect(shares(vaulting(0.1), true)).toEqual({ Vault: 1 });
    expect(shares(vaulting(0.1))).toEqual({ Jump: 1 });
  });

  it('runs the Vault clip by the vault: its first part over the rise onto the top, the rest across it', () => {
    const v = { ...createVaultState(), riseEnd: 0.2, end: 0.6 };
    const top = FIGURE_RIG.vault.top;
    expect(vaultClipShare(v, 0)).toBe(0);
    expect(vaultClipShare(v, 0.1)).toBeCloseTo(top / 2, 6);
    expect(vaultClipShare(v, 0.2)).toBeCloseTo(top, 6);
    expect(vaultClipShare(v, 0.4)).toBeCloseTo((top + 1) / 2, 6);
    expect(vaultClipShare(v, 0.6)).toBeCloseTo(1, 6);
    // Held at its ends either side (the figure reads it a tick back, between ticks).
    expect(vaultClipShare(v, -0.01)).toBe(0);
    expect(vaultClipShare(v, 0.7)).toBe(1);
  });

  it('splits a step into its four directions, and has none below the still speed', () => {
    const dir = new Float32Array(4).fill(7);
    expect(legDirection(0, 0, FIGURE_RIG.stillBelow, dir)).toBe(false);
    expect([...dir]).toEqual([7, 7, 7, 7]);
    expect(legDirection(1, 1, Math.SQRT2, dir)).toBe(true);
    expect(dir[0]).toBeCloseTo(0.5, 6);
    expect(dir[3]).toBeCloseTo(0.5, 6);
    expect(legDirection(-2, 0, 2, dir)).toBe(true);
    expect([...dir]).toEqual([0, 1, 0, 0]);
  });

  it('blends the walk into the run from the walking pace to the normal pace', () => {
    expect(legRun(MOVEMENT.walkSpeed)).toBe(0);
    expect(legRun((MOVEMENT.walkSpeed + MOVEMENT.runSpeed) / 2)).toBeCloseTo(0.5, 6);
    expect(legRun(MOVEMENT.sprintSpeed)).toBe(1);
  });

  it('weighs the clips as the character stands, walks, crouches, sprints, jumps and calls a hit', () => {
    expect(shares(standing())).toEqual({ Idle: 1 });
    expect(shares(ahead(standing(), MOVEMENT.walkSpeed))).toEqual({ Walk_F: 1 });
    expect(shares(ahead(standing(), MOVEMENT.runSpeed))).toEqual({ Run_F: 1 });
    const crouched = standing();
    crouched.crouchAmount = 1;
    expect(shares(crouched)).toEqual({ CrouchIdle: 1 });
    expect(shares(ahead(crouched, MOVEMENT.crouchSpeed))).toEqual({ CrouchWalk: 1 });
    const sprinting = ahead(standing(), MOVEMENT.sprintSpeed);
    sprinting.sprinting = true;
    expect(shares(sprinting)).toEqual({ Sprint: 1 });
    const jumping = ahead(standing(), MOVEMENT.runSpeed);
    jumping.grounded = false;
    expect(shares(jumping)).toEqual({ Jump: 1 });
    const calling = standing();
    calling.status = 'calling';
    expect(shares(calling)).toEqual({ HitCall: 1 });
    // Half crouched and strafing right: the crouch walk and the strafe share the legs.
    const half = standing();
    half.crouchAmount = 0.5;
    half.velocity.x = MOVEMENT.runSpeed;
    expect(shares(half)).toEqual({ Run_R: 0.5, CrouchWalk: 0.5 });
  });
});

describe('the walk cycle at the figures strides (IM8)', () => {
  const legs = markedLegs();
  const turn = (c: Character, moved: number): number => figureLegCycleStep(c, legs, moved) / (Math.PI * 2);

  it('steps a cycle per stride of the clip being played', () => {
    expect(turn(ahead(standing(), MOVEMENT.walkSpeed), 1.1)).toBeCloseTo(1.1 / legs.clips[LEG_SLOT.Walk_F]!.stride, 6);
    expect(turn(ahead(standing(), MOVEMENT.runSpeed), 1)).toBeCloseTo(1 / legs.clips[LEG_SLOT.Run_F]!.stride, 6);
  });

  it('blends the strides of clips played together, and uses the run stride while standing still', () => {
    const c = ahead(standing(), (MOVEMENT.walkSpeed + MOVEMENT.runSpeed) / 2);
    const walk = legs.clips[LEG_SLOT.Walk_F]!.stride;
    const run = legs.clips[LEG_SLOT.Run_F]!.stride;
    expect(turn(c, 1)).toBeCloseTo(1 / ((walk + run) / 2), 6);
    expect(turn(standing(), 0.1)).toBeCloseTo(0.1 / run, 6);
  });

  it('runs the crouch walk backwards while stepping back crouched, made as it was walking ahead', () => {
    const c = standing();
    c.crouchAmount = 1;
    c.velocity.z = MOVEMENT.crouchSpeed;
    expect(turn(c, 0.5)).toBeCloseTo(-0.5 / legs.clips[LEG_SLOT.CrouchWalk]!.stride, 6);
    c.velocity.z = -MOVEMENT.crouchSpeed;
    expect(turn(c, 0.5)).toBeCloseTo(0.5 / legs.clips[LEG_SLOT.CrouchWalk]!.stride, 6);
  });
});

describe('the legs pose for the hit volume (IM8)', () => {
  const legs = markedLegs();
  const out = new Float32Array(LEG_SAMPLE);
  const pose = (c: Character): number => {
    figureLegPose(c, legs, out);
    // Every number of a sample is the same in markedLegs: the blend of them all is too.
    for (let k = 1; k < LEG_SAMPLE; k++) expect(out[k]).toBeCloseTo(out[0]!, 5);
    return out[0]!;
  };

  it('holds the idles at their first sample', () => {
    expect(pose(standing())).toBeCloseTo(LEG_SLOT.Idle, 6);
    const crouched = standing();
    crouched.crouchAmount = 1;
    crouched.statusTime = 0.7;
    expect(pose(crouched)).toBeCloseTo(LEG_SLOT.CrouchIdle, 6);
  });

  it('plays a cycle at the walk cycle, between two samples', () => {
    const c = ahead(standing(), MOVEMENT.walkSpeed);
    c.walkCycle = Math.PI * 2 * (3 + 0.25);
    // A quarter through 11 samples is 2.5 samples in: halfway from the third to the fourth (x 0.9999, never wrapping).
    expect(pose(c)).toBeCloseTo(LEG_SLOT.Walk_F + 0.025, 4);
  });

  it('plays the hit call by its own clock and stops on its last sample', () => {
    const c = standing();
    c.status = 'calling';
    c.statusTime = 0.5;
    expect(pose(c)).toBeCloseTo(LEG_SLOT.HitCall + 0.05, 4);
    c.statusTime = 5;
    expect(pose(c)).toBeCloseTo(LEG_SLOT.HitCall + 0.1, 3);
  });

  it('plays the jump from its take-off, by the time in the air', () => {
    const c = ahead(standing(), MOVEMENT.runSpeed);
    c.grounded = false;
    c.airTime = 0.1;
    expect(pose(c)).toBeCloseTo(LEG_SLOT.Jump + (FIGURE_RIG.jump.from + 0.1) / 10, 4);
  });

  it('plays the Vault clip by the vault where the legs have one, else the jump', () => {
    expect(legsHaveVault(legs)).toBe(true);
    // Halfway up onto the top: half of the clip's rise share, between two of its 11 samples.
    expect(pose(vaulting(0.1))).toBeCloseTo(LEG_SLOT.Vault + ((FIGURE_RIG.vault.top / 2) * 10) / 100, 4);
    const none: FigureLegs = { clips: legs.clips.map((clip, slot) => (slot === LEG_SLOT.Vault ? { ...clip, frames: 0, points: new Float32Array(0) } : clip)) };
    expect(legsHaveVault(none)).toBe(false);
    figureLegPose(vaulting(0.1), none, out);
    expect(out[0]).toBeCloseTo(LEG_SLOT.Jump + (FIGURE_RIG.jump.from + 0.1) / 10, 4);
  });

  it('blends clips by weight', () => {
    const c = standing();
    c.crouchAmount = 0.25;
    expect(pose(c)).toBeCloseTo(0.75 * LEG_SLOT.Idle + 0.25 * LEG_SLOT.CrouchIdle, 5);
  });

  it('lays out a sample leg by leg, point by point', () => {
    expect(LEG_SAMPLE).toBe(2 * LEG_POINTS * 3);
    expect(Object.values(LEG_POINT)).toEqual([0, 1, 2, 3, 4]);
  });
});
