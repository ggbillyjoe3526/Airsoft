import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import type { GripId } from '../config/attachments';
import { LOADOUT } from '../config/replicas';
import { stepAccuracy, targetSpreadScale, timeToSteady } from './accuracy';
import { fitParts } from './armament';
import { type Character, createCharacter } from './character';
import { vec3 } from './vec';

const DT = 1 / 60;
const A = MOVEMENT.accuracy;

/** A character standing still on the ground, moving at `speed` m/s (sideways) if given. */
function at(speed = 0, crouchAmount = 0): Character {
  const c = createCharacter(0, vec3(), 0);
  c.grounded = true;
  c.velocity.x = speed;
  c.crouchAmount = crouchAmount;
  return c;
}

describe('accuracy by stance and movement', () => {
  it('is steady standing still, steadier crouched, and worse the faster you move', () => {
    expect(targetSpreadScale(at(), MOVEMENT)).toBe(1);
    expect(targetSpreadScale(at(A.stillBelow * 0.9), MOVEMENT)).toBe(1); // drifting to a stop counts as still
    expect(targetSpreadScale(at(0, 1), MOVEMENT)).toBeCloseTo(A.crouched, 9);
    expect(targetSpreadScale(at(MOVEMENT.walkSpeed), MOVEMENT)).toBeCloseTo(A.walk, 9);
    expect(targetSpreadScale(at(MOVEMENT.runSpeed), MOVEMENT)).toBeCloseTo(A.run, 9);
    // Monotonic from still to running pace.
    let last = 0;
    for (let v = 0; v <= MOVEMENT.runSpeed + 1e-9; v += 0.1) {
      const s = targetSpreadScale(at(v), MOVEMENT);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    // Crouch-walking is steadier than walking upright, but not as steady as holding still.
    const crouchWalk = targetSpreadScale(at(MOVEMENT.crouchSpeed, 1), MOVEMENT);
    expect(crouchWalk).toBeLessThan(targetSpreadScale(at(MOVEMENT.crouchSpeed), MOVEMENT));
    expect(crouchWalk).toBeGreaterThan(A.crouched);
  });

  it('is worst in the air and while sprinting', () => {
    const air = at(MOVEMENT.runSpeed);
    air.grounded = false;
    air.airTime = A.airSpreadDelay;
    expect(targetSpreadScale(air, MOVEMENT)).toBe(A.air);
    const sprint = at(MOVEMENT.sprintSpeed);
    sprint.sprinting = true;
    expect(targetSpreadScale(sprint, MOVEMENT)).toBe(A.sprint);
    expect(A.air).toBeGreaterThan(A.run);
    expect(A.sprint).toBeGreaterThan(A.run);
  });

  it('shakes at once when you move, and settles back over a moment once you stop', () => {
    const c = at();
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeLessThanOrEqual(1);
    expect(c.spreadScale).toBeGreaterThan(A.steady); // just stopped: not fully steadied yet
    c.sprinting = true;
    c.velocity.x = MOVEMENT.sprintSpeed;
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBe(A.sprint); // no ramp-up: the first shot after starting to move is already shaky
    // Stop dead: still shaky just after the sprint (when the fire lockout ends)...
    c.sprinting = false;
    c.velocity.x = 0;
    let t = 0;
    while (t < MOVEMENT.sprintFireLockout - 1e-9) {
      stepAccuracy(c, MOVEMENT, DT);
      t += DT;
    }
    expect(c.spreadScale).toBeGreaterThan(1.3);
    // ...and steady again within about a second (steadier than at first, having held still that long).
    for (let i = 0; i < 60; i++) stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeLessThan(A.steady + 0.02);
    expect(c.spreadScale).toBeGreaterThanOrEqual(A.steady);
  });

  it('steadies the longer you hold still, and moving or leaving the ground starts it over', () => {
    const c = at();
    let last = Infinity;
    for (let t = 0; t < A.steadyTime - 1e-9; t += DT) {
      stepAccuracy(c, MOVEMENT, DT);
      expect(c.spreadScale).toBeLessThan(last); // tightens every tick while you hold still
      last = c.spreadScale;
    }
    for (let i = 0; i < 60; i++) stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeCloseTo(A.steady, 3);
    expect(A.steady).toBeLessThan(1);
    expect(c.stillTime).toBeGreaterThan(A.steadyTime);

    // Crouched and still: both steadying effects stack.
    const crouched = at(0, 1);
    for (let i = 0; i < 90; i++) stepAccuracy(crouched, MOVEMENT, DT);
    expect(crouched.spreadScale).toBeCloseTo(A.steady * A.crouched, 3);

    // A step at walking pace starts it over: the shake is the walking one, and so is the wait afterwards.
    c.velocity.x = MOVEMENT.walkSpeed;
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.stillTime).toBe(0);
    expect(c.spreadScale).toBeCloseTo(A.walk, 9);
    c.velocity.x = 0;
    stepAccuracy(c, MOVEMENT, DT);
    expect(targetSpreadScale(c, MOVEMENT)).toBeGreaterThan(A.steady); // one tick still: not fully steadied yet

    // Drifting below the still threshold counts as still; being off the ground doesn't.
    const drift = at(A.stillBelow * 0.9);
    for (let i = 0; i < 60; i++) stepAccuracy(drift, MOVEMENT, DT);
    expect(drift.stillTime).toBeGreaterThan(A.steadyTime);
    drift.grounded = false;
    stepAccuracy(drift, MOVEMENT, DT);
    expect(drift.stillTime).toBe(0);
  });

  it('locks on almost at once when you stop walking or running (owner, 2026-10-03: "instant lock")', () => {
    for (const speed of [MOVEMENT.walkSpeed, MOVEMENT.runSpeed]) {
      const c = at(speed);
      for (let i = 0; i < 30; i++) stepAccuracy(c, MOVEMENT, DT);
      expect(c.spreadScale).toBeGreaterThan(1);
      c.velocity.x = 0; // stopped (the ground deceleration itself takes 0.05 s from walking, 0.1 s from running)
      let t = 0;
      while (c.spreadScale > A.steady + 0.01) {
        stepAccuracy(c, MOVEMENT, DT);
        t += DT;
      }
      expect(t).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    expect(A.steadyTime).toBeLessThanOrEqual(0.1);
    expect(A.lockTime).toBeLessThan(A.settleTime);
  });

  it('keeps the slower settle for a moment after a sprint or a landing', () => {
    const c = at();
    c.sprinting = true;
    stepAccuracy(c, MOVEMENT, DT);
    c.sprinting = false;
    for (let t = 0; t < 0.1; t += DT) stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeGreaterThan(1.5); // still shaky 0.1 s after the sprint
    expect(c.shakeCarry).toBeGreaterThan(0);
    for (let t = 0; t < A.carryTime + 0.2; t += DT) stepAccuracy(c, MOVEMENT, DT);
    expect(c.shakeCarry).toBe(0);
    expect(c.spreadScale).toBeLessThan(A.steady + 0.01);
  });

  it('settles sooner after a sprint with a vertical grip, later with an angled one (M17b)', () => {
    const settleAfterSprint = (grip: GripId): number => {
      const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
      c.grounded = true;
      fitParts(c.armament, [{ grip, magazine: 'standard' }]);
      c.sprinting = true;
      stepAccuracy(c, MOVEMENT, DT);
      c.sprinting = false;
      let t = 0;
      while (c.spreadScale > 1.05 && t < 2) {
        stepAccuracy(c, MOVEMENT, DT);
        t += DT;
      }
      return t;
    };
    const none = settleAfterSprint('none');
    expect(settleAfterSprint('vertical')).toBeLessThan(none - 0.02);
    expect(settleAfterSprint('angled')).toBeGreaterThan(none + 0.02);
  });

  it('makes walking with the walk key only a little shakier than standing (owner, 2026-10-03)', () => {
    expect(A.walk).toBeGreaterThan(1);
    expect(A.walk).toBeLessThanOrEqual(1.2);
    expect(A.walk).toBeLessThan(A.run);
  });

  it('settles after a landing too', () => {
    const c = at();
    c.grounded = false;
    c.airTime = A.airSpreadDelay; // as a jump leaves it (sim/movement.ts)
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBe(A.air);
    c.grounded = true;
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeGreaterThan(A.run); // the landing tick is still very shaky
  });

  describe('a brief loss of ground contact', () => {

    it('leaves the spread alone for one tick off the ground', () => {
      const c = at();
      stepAccuracy(c, MOVEMENT, DT);
      c.grounded = false;
      stepAccuracy(c, MOVEMENT, DT);
      expect(c.spreadScale).toBe(1);
      expect(c.airTime).toBeCloseTo(DT, 9);
    });

    it('applies the in-air spread once the character has been off the ground for airSpreadDelay', () => {
      const ticks = Math.round(A.airSpreadDelay / DT); // 6 at 60 Hz
      const c = at();
      c.grounded = false;
      for (let i = 0; i < ticks - 1; i++) stepAccuracy(c, MOVEMENT, DT);
      expect(c.spreadScale).toBe(1);
      stepAccuracy(c, MOVEMENT, DT); // exactly airSpreadDelay, despite float drift in the summed ticks
      expect(c.spreadScale).toBe(A.air);
    });

    it('applies the in-air spread at once on a jump', () => {
      const c = at();
      c.grounded = false;
      c.airTime = A.airSpreadDelay; // what sim/movement.ts sets on a jump
      stepAccuracy(c, MOVEMENT, DT);
      expect(c.spreadScale).toBe(A.air);
    });

    it('resets the air time on landing', () => {
      const c = at();
      c.grounded = false;
      for (let i = 0; i < 3; i++) stepAccuracy(c, MOVEMENT, DT);
      expect(c.airTime).toBeGreaterThan(0);
      c.grounded = true;
      stepAccuracy(c, MOVEMENT, DT);
      expect(c.airTime).toBe(0);
    });
  });
});

describe('time to steady after a sprint (the Loadout grip line)', () => {
  it('follows stepAccuracy itself: the spread is above the margin a tick before and within it at the time', () => {
    for (const grip of ['none', 'vertical', 'angled'] as GripId[]) {
      const c = createCharacter(0, vec3(), 0);
      fitParts(c.armament, [{ grip, magazine: 'standard' }]);
      const t = timeToSteady(c, MOVEMENT, DT, 0.1);
      expect(c.spreadScale).toBeLessThanOrEqual(1.1);
      // Replay by hand: one tick short of t the aim is still shaky.
      const d = createCharacter(0, vec3(), 0);
      fitParts(d.armament, [{ grip, magazine: 'standard' }]);
      d.grounded = true;
      d.sprinting = true;
      stepAccuracy(d, MOVEMENT, DT);
      d.sprinting = false;
      for (let s = 0; s < t - DT * 1.5; s += DT) stepAccuracy(d, MOVEMENT, DT);
      if (t > 0) expect(d.spreadScale).toBeGreaterThan(1.1);
    }
  });
});
