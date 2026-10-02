import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { stepAccuracy, targetSpreadScale } from './accuracy';
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
    expect(c.spreadScale).toBe(1);
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
    expect(c.spreadScale).toBeGreaterThan(1.5);
    // ...and steady again within about a second.
    for (let i = 0; i < 60; i++) stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeLessThan(1.02);
    expect(c.spreadScale).toBeGreaterThanOrEqual(1);
  });

  it('settles after a landing too', () => {
    const c = at();
    c.grounded = false;
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBe(A.air);
    c.grounded = true;
    stepAccuracy(c, MOVEMENT, DT);
    expect(c.spreadScale).toBeGreaterThan(A.run); // the landing tick is still very shaky
  });
});
