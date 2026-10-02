import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import type { WorldQuery } from './armament';
import { type Character, createCharacter, eyeHeight } from './character';
import { createCommand } from './commands';
import { leanedEye, leanOffset, stepLean } from './lean';
import { vec3 } from './vec';

const DT = 1 / 60;
const openSky: WorldQuery = { raycastStatic: () => -1 };

/** A wall plane at x = wallX (rays crossing it stop there). */
function wallAtX(wallX: number): WorldQuery {
  return {
    raycastStatic(o, d, max) {
      if (Math.abs(d.x) < 1e-9) return -1;
      const t = (wallX - o.x) / d.x;
      return t >= 0 && t <= max ? t : -1;
    },
  };
}

/** A character at the origin facing -Z (its right is +X), standing on the ground. */
function standing(): Character {
  const c = createCharacter(0, vec3(), 0);
  c.grounded = true;
  return c;
}

function hold(c: Character, lean: number, seconds: number, query: WorldQuery = openSky): void {
  const cmd = createCommand();
  cmd.lean = lean;
  for (let i = 0; i < Math.round(seconds / DT); i++) stepLean(c, cmd, BODY, HITS, MOVEMENT, query, DT);
}

describe('lean geometry', () => {
  const out = vec3();

  it('swings points above the hips out to the side, along the character’s right, and a little down', () => {
    const above = BODY.standEyeHeight - HITS.lean.pivotHeight;
    leanOffset(BODY.standEyeHeight, 1, 0, 0, HITS, out);
    expect(out.x).toBeCloseTo(above * Math.sin(HITS.lean.maxAngle), 9);
    expect(out.y).toBeCloseTo(-above * (1 - Math.cos(HITS.lean.maxAngle)), 9);
    expect(out.z).toBeCloseTo(0, 9);
    // About 0.4 m: enough to see past a corner from a body-width back.
    expect(out.x).toBeGreaterThan(0.35);
    leanOffset(BODY.standEyeHeight, -1, 0, 0, HITS, out);
    expect(out.x).toBeLessThan(-0.35);
    // Facing +X (yaw -90°), the right is +Z.
    leanOffset(BODY.standEyeHeight, 1, 0, -Math.PI / 2, HITS, out);
    expect(out.z).toBeGreaterThan(0.35);
    expect(Math.abs(out.x)).toBeLessThan(1e-9);
  });

  it('leaves the hips and legs where they are, and pivots lower when crouched', () => {
    leanOffset(HITS.lean.pivotHeight, 1, 0, 0, HITS, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBe(0);
    leanOffset(0.5, 1, 0, 0, HITS, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBe(0);
    // Crouched, the same lean moves the (lower) eyes about as far sideways.
    leanOffset(eyeHeight(1, BODY), 1, 1, 0, HITS, out);
    expect(out.x).toBeGreaterThan(0.35);
  });

  it('puts the eyes (where BBs leave from) at the leaned position', () => {
    const c = standing();
    c.lean = 1;
    const eye = leanedEye(c, BODY, HITS, vec3());
    leanOffset(BODY.standEyeHeight, 1, 0, 0, HITS, out);
    expect(eye.x).toBeCloseTo(out.x, 9);
    expect(eye.y).toBeCloseTo(BODY.standEyeHeight + out.y, 9);
  });
});

describe('leaning', () => {
  it('eases into a full lean while the key is held, and back upright when released', () => {
    const c = standing();
    hold(c, 1, MOVEMENT.leanTime / 2);
    expect(c.lean).toBeCloseTo(0.5, 1);
    hold(c, 1, MOVEMENT.leanTime);
    expect(c.lean).toBe(1);
    hold(c, 0, MOVEMENT.leanTime + DT);
    expect(c.lean).toBe(0);
    hold(c, -1, 1);
    expect(c.lean).toBe(-1);
  });

  it('straightens up in the air', () => {
    const c = standing();
    hold(c, 1, 1);
    c.grounded = false;
    hold(c, 1, MOVEMENT.leanTime + DT);
    expect(c.lean).toBe(0);
  });

  it('stops short of a wall, so the eyes stay leanWallClearance from it', () => {
    const c = standing();
    hold(c, 1, 1, wallAtX(0.45)); // a wall at the right shoulder
    expect(c.lean).toBeGreaterThan(0);
    expect(c.lean).toBeLessThan(1);
    const eye = leanedEye(c, BODY, HITS, vec3());
    expect(eye.x).toBeLessThanOrEqual(0.45 - MOVEMENT.leanWallClearance + 1e-9);
    // Leaning away from it is unaffected.
    hold(c, -1, 1, wallAtX(0.45));
    expect(c.lean).toBe(-1);
  });

  it('cuts a lean at once when it would put the head into a wall', () => {
    const c = standing();
    hold(c, 1, 1);
    expect(c.lean).toBe(1);
    hold(c, 1, DT, wallAtX(0.3)); // the wall is right there now
    const eye = leanedEye(c, BODY, HITS, vec3());
    expect(eye.x).toBeLessThanOrEqual(0.3 - MOVEMENT.leanWallClearance + 1e-9);
  });

  it('can’t lean at all with a wall against the body', () => {
    const c = standing();
    hold(c, 1, 1, wallAtX(BODY.radius));
    expect(leanedEye(c, BODY, HITS, vec3()).x).toBeLessThanOrEqual(BODY.radius - MOVEMENT.leanWallClearance + 1e-9);
  });
});
