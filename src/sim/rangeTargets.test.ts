import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { RANGE } from '../config/range';
import { LOADOUT } from '../config/replicas';
import type { WorldQuery } from './armament';
import { createArmament } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { stepBBs } from './bbs';
import type { GameEvent } from './events';
import { createRangeTargets, firstRangeTargetHit, rayRangeTarget, refillSpares, stepRangeTargets } from './rangeTargets';
import { openFieldElimination } from './testSupport';
import { type Vec3, vec3 } from './vec';

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return vec3(v.x / l, v.y / l, v.z / l);
}

const DT = 1 / 60;
const open: WorldQuery = { raycastStatic: () => -1 };

describe('practice range targets (M21)', () => {
  it('lays out every lane at every distance, steel at chest height, figures on the floor', () => {
    const targets = createRangeTargets();
    expect(targets).toHaveLength(RANGE.lanes.length * RANGE.distances.length);
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
    for (const t of targets) {
      expect(t.position.z).toBe(-t.distance);
      expect(t.position.y).toBe(t.kind === 'steel' ? RANGE.plateHeight : 0);
      expect(Math.abs(t.position.x)).toBeLessThan(RANGE.halfWidth - 1);
    }
    expect(targets.filter((t) => t.crouched).every((t) => t.kind === 'figure')).toBe(true);
  });

  it('never hides one target behind another from where you start', () => {
    const targets = createRangeTargets();
    const eye = vec3(0, BODY.standEyeHeight, RANGE.spawnBack);
    const hit = { index: -1, at: 0, post: false };
    for (const [i, t] of targets.entries()) {
      // Aim at the middle of what can be hit: the plate's centre, a figure's chest (or a crouched one's).
      const aim = vec3(t.position.x, t.kind === 'steel' ? t.position.y : t.crouched ? 0.7 : 1.2, t.position.z);
      const d = unit(vec3(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z));
      firstRangeTargetHit(eye, d, 100, targets, HITS, hit);
      expect(hit.index, `${t.label} ${t.distance} m`).toBe(i);
    }
  });

  it('rings steel only from the front, inside the plate', () => {
    const plate = createRangeTargets().find((t) => t.kind === 'steel')!;
    const p = plate.position;
    const front = vec3(p.x, p.y, p.z + 5);
    expect(rayRangeTarget(front, vec3(0, 0, -1), 10, plate, HITS)).toBeCloseTo(5, 6);
    expect(rayRangeTarget(vec3(p.x + RANGE.plateRadius + 0.01, p.y, p.z + 5), vec3(0, 0, -1), 10, plate, HITS)).toBe(-1);
    expect(rayRangeTarget(vec3(p.x, p.y, p.z - 5), vec3(0, 0, 1), 10, plate, HITS)).toBe(-1);
    expect(rayRangeTarget(front, vec3(0, 0, -1), 4, plate, HITS)).toBe(-1); // out of reach this tick
  });

  it("stops a BB on a plate's post as a miss, without ringing the plate", () => {
    const targets = createRangeTargets();
    const plate = targets.find((t) => t.kind === 'steel')!;
    const from = vec3(plate.position.x, 0.5, plate.position.z + 5); // under the plate, at the post
    const pool = createBBPool(2);
    spawnBB(pool, 0, from, vec3(0, 0, -1), 80, 0, 0.25e-3);
    const events: GameEvent[] = [];
    const ctx = { characters: [], hits: HITS, elimination: openFieldElimination([[], []]), rangeTargets: targets };
    for (let i = 0; i < 10; i++) stepBBs(pool, BALLISTICS, open, -10, events, DT, ctx);
    expect(events.filter((e) => e.type === 'targetHit')).toHaveLength(0);
    const impacts = events.filter((e) => e.type === 'bbImpact');
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.type === 'bbImpact' && impacts[0]!.position.z).toBeCloseTo(plate.position.z - RANGE.postBehind + RANGE.postWidth / 2, 2);
  });

  it('knocks a figure down for a while, then stands it up again', () => {
    const targets = createRangeTargets();
    const figure = targets.find((t) => t.kind === 'figure' && !t.crouched)!;
    const p = figure.position;
    const from = vec3(p.x, 1.2, p.z + 5);
    expect(rayRangeTarget(from, vec3(0, 0, -1), 10, figure, HITS)).toBeGreaterThan(4.5);

    const pool = createBBPool(2);
    spawnBB(pool, 0, from, vec3(0, 0, -1), 80, 0, 0.25e-3);
    const events: GameEvent[] = [];
    const ctx = { characters: [], hits: HITS, elimination: openFieldElimination([[], []]), rangeTargets: targets };
    for (let i = 0; i < 10; i++) stepBBs(pool, BALLISTICS, open, -10, events, DT, ctx);
    const hits = events.filter((e) => e.type === 'targetHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ targetId: figure.id, shooterId: 0, ricochet: false });
    expect(figure.down).toBe(RANGE.figureDownTime);
    // Down: BBs fly past it.
    expect(rayRangeTarget(from, vec3(0, 0, -1), 10, figure, HITS)).toBe(-1);
    for (let t = 0; t < RANGE.figureDownTime + DT; t += DT) stepRangeTargets(targets, DT);
    expect(figure.down).toBe(0);
    expect(rayRangeTarget(from, vec3(0, 0, -1), 10, figure, HITS)).toBeGreaterThan(4.5);
  });

  it('gives a crouched figure a crouched hit volume: a BB at standing chest height flies over it', () => {
    const crouched = createRangeTargets().find((t) => t.crouched)!;
    const p = crouched.position;
    expect(rayRangeTarget(vec3(p.x, 1.4, p.z + 5), vec3(0, 0, -1), 10, crouched, HITS)).toBe(-1);
    expect(rayRangeTarget(vec3(p.x, 0.7, p.z + 5), vec3(0, 0, -1), 10, crouched, HITS)).toBeGreaterThan(4.5);
  });

  it('keeps the spare magazines full, but leaves the loaded one to you', () => {
    const a = createArmament(LOADOUT);
    a.ammo[0]!.mag = 3;
    for (const ammo of a.ammo) ammo.pouch.fill(0);
    refillSpares(a);
    expect(a.ammo[0]!.mag).toBe(3);
    for (const [i, ammo] of a.ammo.entries()) expect(ammo.pouch.every((m) => m === a.handling[i]!.magSize)).toBe(true);
  });
});
