import { describe, expect, it } from 'vitest';
import { BALLISTICS, type LeavesConfig } from '../config/ballistics';
import { BOT_BEHAVIOUR } from '../config/bots';
import { createBBPool, spawnBB } from './ballistics';
import { deflectInLeaves } from './leaves';
import { createRng } from './rng';
import { length3, vec3 } from './vec';

const CFG: LeavesConfig = BALLISTICS.leaves;

function bbAt(speed = 80, spin = 1000) {
  const pool = createBBPool(1);
  const bb = spawnBB(pool, 0, vec3(0, 1.4, 0), vec3(0, 0, -1), speed, 0, 0.25e-3);
  bb.spin = spin;
  return bb;
}

/** The angle (radians) between the BB's velocity and straight ahead (-Z). */
const offLine = (v: { x: number; y: number; z: number }): number => Math.acos(-v.z / length3(v.x, v.y, v.z));

describe('deflectInLeaves (Dev 6 item 44)', () => {
  it('slows the BB and scrubs its backspin by keptPerMetre per metre of leaves', () => {
    const bb = bbAt(80, 1000);
    deflectInLeaves(bb, 0.3, CFG);
    const kept = CFG.keptPerMetre ** 0.3;
    expect(length3(bb.velocity.x, bb.velocity.y, bb.velocity.z)).toBeCloseTo(80 * kept, 6);
    expect(bb.spin).toBeCloseTo(1000 * kept, 6);
  });

  it('keeps it on its line without a random stream, as a ricochet without one does not scatter', () => {
    const bb = bbAt();
    deflectInLeaves(bb, 0.4, CFG);
    expect(offLine(bb.velocity)).toBeLessThan(1e-9);
  });

  it('throws it off its line by no more than scatterPerMetre × depth, any way round, and the same way every time from one seed', () => {
    const depth = 0.4;
    const most = CFG.scatterPerMetre * depth;
    const rng = createRng(7);
    let widest = 0;
    let left = 0;
    let up = 0;
    for (let i = 0; i < 400; i++) {
      const bb = bbAt();
      deflectInLeaves(bb, depth, CFG, rng);
      const a = offLine(bb.velocity);
      expect(a).toBeLessThanOrEqual(most + 1e-9);
      widest = Math.max(widest, a);
      if (bb.velocity.x < 0) left++;
      if (bb.velocity.y > 0) up++;
    }
    // Spread over the whole cone, every way round.
    expect(widest).toBeGreaterThan(most * 0.9);
    expect(left).toBeGreaterThan(150);
    expect(up).toBeGreaterThan(150);
    const a = bbAt();
    const b = bbAt();
    deflectInLeaves(a, depth, CFG, createRng(3));
    deflectInLeaves(b, depth, CFG, createRng(3));
    expect(b.velocity).toEqual(a.velocity);
  });

  it('turns a BB flying straight up or down as well (no level line to measure from)', () => {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 0, vec3(0, 1.4, 0), vec3(0, 1, 0), 60, 0, 0.25e-3);
    deflectInLeaves(bb, 0.4, CFG, createRng(11));
    const v = bb.velocity;
    expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    expect(length3(v.x, v.y, v.z)).toBeCloseTo(60 * CFG.keptPerMetre ** 0.4, 6);
    expect(Math.acos(v.y / length3(v.x, v.y, v.z))).toBeGreaterThan(0);
  });

  it('leaves a BB alone for no leaves at all', () => {
    const bb = bbAt(80, 1000);
    deflectInLeaves(bb, 0, CFG, createRng(1));
    expect(bb.velocity).toEqual(vec3(0, 0, -80));
    expect(bb.spin).toBe(1000);
  });
});

describe('the leaves’ tuning', () => {
  it('stops a BB in as much bush as a bot can see through: if you can’t see through it, a BB can’t get through', () => {
    expect(BALLISTICS.leaves.stopDepth).toBe(BOT_BEHAVIOUR.foliageSeeThrough);
  });
});
