import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { PHYSICS } from '../config/physics';
import { RANGE, targetSpec } from '../config/range';
import { LOADOUT } from '../config/replicas';
import type { WorldQuery } from './armament';
import { createArmament } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { createCharacter } from './character';
import { characterHitVolume, createHitVolume, hitTop, rayCharacter } from './hitbox';
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
    // The lanes first (M93 adds the other targets and the START plate after them, so the lanes keep their ids).
    const lanes = targets.slice(0, RANGE.lanes.length * RANGE.distances.length);
    expect(targets).toHaveLength(lanes.length + RANGE.features.length + 1);
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
    for (const t of lanes) {
      expect(t.motion).toBe('still');
      expect(t.position.z).toBe(-t.distance);
      expect(t.position.y).toBe(t.kind === 'steel' ? RANGE.plateHeight : 0);
    }
    for (const t of targets) expect(Math.abs(t.position.x)).toBeLessThan(RANGE.halfWidth - 1);
    expect(targets.filter((t) => t.crouched).every((t) => t.kind === 'figure')).toBe(true);
  });

  it('never hides one target behind another from where you start, moving or not (M93)', () => {
    const targets = createRangeTargets();
    for (const t of targets) {
      if (t.motion === 'popup') t.down = 0; // every pop-up standing at once
      t.hidden = false; // the START plate too
    }
    const eye = vec3(0, BODY.standEyeHeight, RANGE.spawnBack);
    const hit = { index: -1, at: 0, post: false };
    // Over two of the slowest cycles, every 0.1 s: movers along their tracks, swingers through their swing.
    for (let time = 0; time < 2 * 6; time += 0.1) {
      for (const [i, t] of targets.entries()) {
        // Aim at the middle of what can be hit: the plate's centre, a figure's chest (or a crouched one's).
        const aim = vec3(t.position.x, t.kind === 'steel' ? t.position.y : t.position.y + (t.crouched ? 0.7 : 1.2), t.position.z);
        const d = unit(vec3(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z));
        firstRangeTargetHit(eye, d, 100, targets, HITS, hit);
        expect(hit.index, `${t.label} ${t.distance} m at ${time.toFixed(1)} s`).toBe(i);
        expect(hit.post, `${t.label} ${t.distance} m at ${time.toFixed(1)} s`).toBe(false);
      }
      stepRangeTargets(targets, 0.1);
      for (const t of targets) if (t.motion === 'popup') t.down = 0;
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

  it('stands its figures exactly as tall as a character on the same floor: a hit on the range is a hit in a match (audit SIM-12)', () => {
    for (const crouched of [false, true]) {
      const figure = createRangeTargets().find((t) => t.kind === 'figure' && t.crouched === crouched)!;
      const p = figure.position;
      const c = createCharacter(0, vec3(p.x, p.y + PHYSICS.groundRestGap, p.z), 0); // resting on the same floor point
      c.crouchAmount = crouched ? 1 : 0;
      const v = createHitVolume();
      characterHitVolume(c, HITS, v);
      // Level rays from in front, from well below the head's top to just over it: both agree at every height. (Below the
      // hips a player's volume is two legs (M85) and a range figure one capsule: this ray down the middle would split them.)
      for (let y = p.y + hitTop(c.crouchAmount, HITS) - 0.6; y <= 1.9; y += 0.005) {
        const o = vec3(p.x, y, p.z + 5);
        const d = vec3(0, 0, -1);
        const onRange = rayRangeTarget(o, d, 10, figure, HITS) >= 0;
        const inMatch = rayCharacter(o, d, 10, v) >= 0;
        expect(onRange, `${crouched ? 'crouched' : 'standing'} at ${y.toFixed(3)} m`).toBe(inMatch);
      }
    }
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

describe('targets stood on a map (M94)', () => {
  /** A plate on a floor 3 m up at (10, 3, -4), turned to face +x (east), and a figure beside it facing -x. */
  const targets = createRangeTargets([
    targetSpec({ kind: 'steel', x: 10, y: 3 + RANGE.plateHeight, z: -4, yaw: Math.PI / 2, label: 'Steel', distance: 20 }),
    targetSpec({ kind: 'figure', x: 14, y: 3, z: -4, yaw: -Math.PI / 2, label: 'Figure', distance: 24 }),
  ]);
  const plate = targets[0]!;
  const figure = targets[1]!;

  it('rings a turned plate only from the side it faces, inside the plate', () => {
    const p = plate.position;
    expect(p.y).toBe(3 + RANGE.plateHeight);
    expect(plate.floor).toBeCloseTo(3, 9);
    expect(plate.face.x).toBeCloseTo(1, 9);
    expect(plate.face.z).toBeCloseTo(0, 9);
    expect(plate.distance).toBe(20);
    expect(rayRangeTarget(vec3(p.x + 5, p.y, p.z), vec3(-1, 0, 0), 10, plate, HITS)).toBeCloseTo(5, 6);
    expect(rayRangeTarget(vec3(p.x - 5, p.y, p.z), vec3(1, 0, 0), 10, plate, HITS)).toBe(-1); // from behind
    expect(rayRangeTarget(vec3(p.x + 5, p.y, p.z + RANGE.plateRadius + 0.01), vec3(-1, 0, 0), 10, plate, HITS)).toBe(-1); // beside it
    // From in front and off to one side, at a slant: still the plate.
    const o = vec3(p.x + 4, p.y, p.z + 3);
    const d = unit(vec3(p.x - o.x, 0, p.z - o.z));
    expect(rayRangeTarget(o, d, 10, plate, HITS)).toBeCloseTo(5, 6);
  });

  it("puts a turned plate's post behind it, from its floor up: a BB there is a miss", () => {
    const p = plate.position;
    const hit = { index: -1, at: 0, post: false };
    // Level, along the plate's face, under the plate: the post is RANGE.postBehind behind it (-x), standing on its floor.
    firstRangeTargetHit(vec3(p.x + 5, 3.3, p.z), vec3(-1, 0, 0), 10, [plate], HITS, hit);
    expect(hit.post).toBe(true);
    expect(hit.at).toBeCloseTo(5 + RANGE.postBehind - RANGE.postWidth / 2, 2);
    // Below its floor there's no post.
    firstRangeTargetHit(vec3(p.x + 5, 2.9, p.z), vec3(-1, 0, 0), 10, [plate], HITS, hit);
    expect(hit.index).toBe(-1);
  });

  it("knocks a figure down from any side, hit at a player's height above its own floor", () => {
    const p = figure.position;
    expect(p.y).toBe(3);
    expect(rayRangeTarget(vec3(p.x - 5, 4.2, p.z), vec3(1, 0, 0), 10, figure, HITS)).toBeGreaterThan(4.5);
    expect(rayRangeTarget(vec3(p.x + 5, 4.2, p.z), vec3(-1, 0, 0), 10, figure, HITS)).toBeGreaterThan(4.5);
    expect(rayRangeTarget(vec3(p.x - 5, 3 + hitTop(0, HITS) + 0.05, p.z), vec3(1, 0, 0), 10, figure, HITS)).toBe(-1); // over its head
  });

  it('stands the range just as before: every target faces the firing line (+z) from the floor', () => {
    for (const t of createRangeTargets()) {
      expect(t.face).toEqual({ x: 0, z: 1 });
      expect(t.floor).toBeCloseTo(0, 9);
    }
  });
});
