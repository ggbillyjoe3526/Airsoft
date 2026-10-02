import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { createCharacter } from './character';
import { characterHitVolume, createHitVolume, hitTop, rayCapsule, rayCharacter, type VerticalCapsule } from './hitbox';
import { vec3 } from './vec';

const cap: VerticalCapsule = { x: 0, z: 0, y0: 0.26, y1: 1.54, r: 0.26 };
const norm = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return vec3(x / l, y / l, z / l);
};

describe('rayCapsule', () => {
  it('hits the side of the body at the right distance', () => {
    expect(rayCapsule(vec3(0, 1, 10), vec3(0, 0, -1), 20, cap)).toBeCloseTo(10 - 0.26, 9);
  });

  it('respects the segment length', () => {
    expect(rayCapsule(vec3(0, 1, 10), vec3(0, 0, -1), 9, cap)).toBe(-1);
  });

  it('misses a BB passing just beside the body', () => {
    expect(rayCapsule(vec3(0.27, 1, 10), vec3(0, 0, -1), 20, cap)).toBe(-1);
    expect(rayCapsule(vec3(0.25, 1, 10), vec3(0, 0, -1), 20, cap)).toBeGreaterThan(0);
  });

  it('hits the rounded top of the head and misses just above it', () => {
    const top = cap.y1 + cap.r;
    expect(rayCapsule(vec3(0, top - 0.01, 10), vec3(0, 0, -1), 20, cap)).toBeGreaterThan(0);
    expect(rayCapsule(vec3(0, top + 0.01, 10), vec3(0, 0, -1), 20, cap)).toBe(-1);
  });

  it('hits a BB dropping onto the head from above', () => {
    expect(rayCapsule(vec3(0, 5, 0), vec3(0, -1, 0), 10, cap)).toBeCloseTo(5 - (cap.y1 + cap.r), 9);
  });

  it('hits at the feet (bottom cap) on a downward diagonal', () => {
    const d = norm(0, -1, -1);
    const t = rayCapsule(vec3(0, 1.1, 1.1), d, 5, cap);
    expect(t).toBeGreaterThan(0);
  });

  it('counts a ray that starts inside as an immediate hit', () => {
    expect(rayCapsule(vec3(0, 1, 0), vec3(1, 0, 0), 1, cap)).toBe(0);
  });

  it('ignores a body behind the ray', () => {
    expect(rayCapsule(vec3(0, 1, 5), vec3(0, 0, 1), 20, cap)).toBe(-1);
  });
});

describe('characterHitVolume', () => {
  const volume = createHitVolume();
  /** A BB flying along -Z at (x, y): it meets a character facing -Z (yaw 0), whose right is +X. */
  const shoot = (c: ReturnType<typeof createCharacter>, x: number, y: number) => {
    characterHitVolume(c, HITS, volume);
    return rayCharacter(vec3(x, y, 10), vec3(0, 0, -1), 20, volume);
  };

  it('tops out at the head: 1.75 m standing, and under 1.2 m crouch cover when crouched', () => {
    expect(hitTop(0, HITS)).toBeCloseTo(1.75, 9);
    expect(hitTop(1, HITS)).toBeLessThanOrEqual(1.15);
    const c = createCharacter(0, vec3(), 0);
    expect(shoot(c, 0, hitTop(0, HITS) - 0.01)).toBeGreaterThan(0);
    expect(shoot(c, 0, hitTop(0, HITS) + 0.01)).toBe(-1);
    c.crouchAmount = 1;
    expect(shoot(c, 0, 1.2)).toBe(-1);
    expect(shoot(c, 0, 1.0)).toBeGreaterThan(0);
  });

  it('follows the figure: a BB past the ear or beside the legs misses, one on the torso hits', () => {
    const c = createCharacter(0, vec3(), 0);
    expect(shoot(c, 0.16, FIGURE.headHeight)).toBe(-1); // beside the head
    expect(shoot(c, 0.1, FIGURE.headHeight)).toBeGreaterThan(0); // grazing the head
    expect(shoot(c, 0.22, 0.5)).toBe(-1); // beside the legs
    expect(shoot(c, 0.15, 0.5)).toBeGreaterThan(0); // on a leg
    expect(shoot(c, 0.18, 1.2)).toBeGreaterThan(0); // on the torso edge
  });

  it('is built from the same numbers as the drawn figure', () => {
    expect(FIGURE.headHeight).toBe(HITS.headHeight);
    expect(FIGURE.crouchDrop).toBe(HITS.crouchDrop);
    // Head, cap and goggles fit inside the head sphere; body capsule spans the torso and legs.
    expect(FIGURE.headRadius * 1.06).toBeLessThanOrEqual(HITS.headRadius);
    expect(FIGURE.hipSpread + FIGURE.legRadius).toBeLessThanOrEqual(HITS.bodyRadius);
    expect(Math.abs(FIGURE.torso.width / 2 - HITS.bodyRadius)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(FIGURE.torso.bottom + FIGURE.torso.height - HITS.bodyTop)).toBeLessThanOrEqual(0.03);
  });
});

describe('the hit volume of a leaning character', () => {
  const volume = createHitVolume();
  const shoot = (c: ReturnType<typeof createCharacter>, x: number, y: number) => {
    characterHitVolume(c, HITS, volume);
    return rayCharacter(vec3(x, y, 10), vec3(0, 0, -1), 20, volume);
  };
  // Where the head centre goes at full lean: rotated about the hips.
  const above = HITS.headHeight - HITS.lean.pivotHeight;
  const headOut = above * Math.sin(HITS.lean.maxAngle);

  it('moves the head and shoulder out to the side it leans to, and back in when upright', () => {
    const c = createCharacter(0, vec3(), 0);
    const headY = HITS.headHeight - above * (1 - Math.cos(HITS.lean.maxAngle));
    expect(shoot(c, headOut, headY)).toBe(-1); // upright: nothing out there
    c.lean = 1;
    expect(shoot(c, headOut, headY)).toBeGreaterThan(0); // leaning right: the head is
    expect(shoot(c, -headOut, headY)).toBe(-1); // not on the other side
    expect(shoot(c, 0.1, HITS.headHeight)).toBe(-1); // nor where it was
    c.lean = -1;
    expect(shoot(c, -headOut, headY)).toBeGreaterThan(0);
  });

  it('keeps the legs where they were, so only the upper body pokes out past cover', () => {
    const c = createCharacter(0, vec3(), 0);
    c.lean = 1;
    expect(shoot(c, 0.15, 0.5)).toBeGreaterThan(0); // legs still there
    expect(shoot(c, headOut, 0.5)).toBe(-1); // nothing at leg height out to the side
    // Cover up to the hips on the right of the upright body: everything that sticks out past it is
    // above the hips (head and shoulder), never the legs.
    expect(shoot(c, HITS.bodyRadius + 0.05, 0.6)).toBe(-1);
  });

  it('follows a crouch: the pivot comes down with the upper body', () => {
    const c = createCharacter(0, vec3(), 0);
    c.crouchAmount = 1;
    c.lean = 1;
    const headY = HITS.headHeight - HITS.crouchDrop - above * (1 - Math.cos(HITS.lean.maxAngle));
    expect(shoot(c, headOut, headY)).toBeGreaterThan(0);
    // Still no higher than crouch cover: leaning around 1.2 m cover shows the head to the side, not above.
    expect(shoot(c, headOut, 1.2)).toBe(-1);
  });
});
