import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { createCharacter } from './character';
import { characterHitCapsule, hitTop, rayCapsule, type VerticalCapsule } from './hitbox';
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

describe('characterHitCapsule', () => {
  it('shrinks when crouching so 1.2 m crouch cover hides the whole head', () => {
    const c = createCharacter(0, vec3(3, 0, -2), 0);
    const out: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };
    characterHitCapsule(c, HITS, out);
    expect(out.y1 + out.r).toBeCloseTo(HITS.standingTop, 9);
    c.crouchAmount = 1;
    characterHitCapsule(c, HITS, out);
    expect(out.y1 + out.r).toBeCloseTo(HITS.crouchedTop, 9);
    expect(hitTop(1, HITS)).toBeLessThanOrEqual(1.15);
    expect(out.x).toBe(3);
    expect(out.z).toBe(-2);
  });
});
