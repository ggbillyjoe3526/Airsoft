import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { RANGE, targetSpec } from '../config/range';
import { createRangeTargets, firstRangeTargetHit, hitRangeTarget, moverOffset, rayRangeTarget, setPopupsAuto, stepRangeTargets, swingAngle } from './rangeTargets';
import { createRng } from './rng';
import { vec3 } from './vec';

const DT = 1 / 60;
const find = (label: string, motion?: string) => createRangeTargets(undefined, createRng(3)).find((t) => t.label === label && (!motion || t.motion === motion))!;
const hit = { index: -1, at: 0, post: false };

describe('movers (M93)', () => {
  it('ping-pongs within its track, waits the dwell at each end and moves at its speed between', () => {
    const track = 1.6;
    const speed = 1.4;
    const dwell = RANGE.mover.dwell;
    const travel = (2 * track) / speed;
    expect(moverOffset(0, track, speed)).toBe(-track);
    expect(moverOffset(dwell * 0.99, track, speed)).toBe(-track);
    expect(moverOffset(dwell + 0.5, track, speed)).toBeCloseTo(-track + speed * 0.5, 9);
    expect(moverOffset(dwell + travel + dwell / 2, track, speed)).toBe(track);
    expect(moverOffset(2 * dwell + travel + 0.5, track, speed)).toBeCloseTo(track - speed * 0.5, 9);
    const period = 2 * (dwell + travel);
    expect(moverOffset(period + 0.3, track, speed)).toBeCloseTo(moverOffset(0.3, track, speed), 9);
    for (let c = -5; c < 20; c += 0.05) expect(Math.abs(moverOffset(c, track, speed))).toBeLessThanOrEqual(track + 1e-9);
  });

  it('a mover target slides along its own x (across its face), never past its track, and keeps its height', () => {
    const t = find('Mover');
    for (let i = 0; i < 60 * 12; i++) {
      stepRangeTargets([t], DT);
      expect(Math.abs(t.position.x - t.home.x)).toBeLessThanOrEqual(t.track + 1e-9);
      expect(t.position.z).toBe(t.home.z);
      expect(t.position.y).toBe(t.home.y);
    }
    // It really moved, and prevPosition trails by one tick.
    const before = { ...t.position };
    stepRangeTargets([t], DT);
    expect(t.prevPosition.x).toBe(before.x);
  });

  it('a turned mover slides along its own x turned to the world', () => {
    const spec = targetSpec({ kind: 'figure', motion: 'mover', x: 0, y: 0, z: 0, label: 'M', distance: 1, yaw: Math.PI / 2, track: 2, speed: 1 });
    const [t] = createRangeTargets([spec]);
    for (let i = 0; i < 60 * 4; i++) {
      stepRangeTargets([t!], DT);
      expect(Math.abs(t!.position.z)).toBeGreaterThan(-1); // moves in z, not x
      expect(t!.position.x).toBeCloseTo(0, 9);
    }
    expect(Math.abs(t!.position.z)).toBeGreaterThan(0.1);
  });
});

describe('swingers (M93)', () => {
  it('swing angle stays within the amplitude and repeats every period', () => {
    for (let c = 0; c < 10; c += 0.05) expect(Math.abs(swingAngle(c))).toBeLessThanOrEqual(RANGE.swinger.amplitude + 1e-9);
    expect(swingAngle(0)).toBe(0);
    expect(swingAngle(RANGE.swinger.period / 4)).toBeCloseTo(RANGE.swinger.amplitude, 9);
    expect(swingAngle(RANGE.swinger.period + 0.4)).toBeCloseTo(swingAngle(0.4), 9);
  });

  it('the plate rides an arc: sideways within arm*sin(amplitude), never below its home height', () => {
    const t = find('Swinger');
    const S = RANGE.swinger;
    let maxX = 0;
    for (let i = 0; i < 60 * 6; i++) {
      stepRangeTargets([t], DT);
      maxX = Math.max(maxX, Math.abs(t.position.x - t.home.x));
      expect(Math.abs(t.position.x - t.home.x)).toBeLessThanOrEqual(S.arm * Math.sin(S.amplitude) + 1e-9);
      expect(t.position.y).toBeGreaterThanOrEqual(t.home.y - 1e-9);
      expect(t.position.y).toBeLessThanOrEqual(t.home.y + S.arm * (1 - Math.cos(S.amplitude)) + 1e-9);
    }
    expect(maxX).toBeGreaterThan(0.5);
  });
});

describe('pop-ups (M93)', () => {
  it('start lying down for a random time from the rng, not all alike, then stand and drop by themselves', () => {
    const rng = createRng(11);
    const pops = createRangeTargets(undefined, rng).filter((t) => t.motion === 'popup');
    expect(pops.length).toBeGreaterThanOrEqual(2);
    for (const p of pops) {
      expect(p.down).toBeGreaterThanOrEqual(RANGE.popup.down[0]);
      expect(p.down).toBeLessThanOrEqual(RANGE.popup.down[1]);
    }
    expect(new Set(pops.map((p) => p.down)).size).toBeGreaterThan(1);
    const p = pops[0]!;
    let stood = 0;
    let dropped = 0;
    let wasUp = false;
    for (let i = 0; i < 60 * 40; i++) {
      stepRangeTargets([p], DT, rng);
      const up = p.down <= 0;
      if (up && !wasUp) stood++;
      if (!up && wasUp) dropped++;
      wasUp = up;
    }
    expect(stood).toBeGreaterThanOrEqual(3);
    expect(dropped).toBeGreaterThanOrEqual(3);
  });

  it('stands for a time inside the up range, lies for a time inside the down range', () => {
    const rng = createRng(5);
    const p = createRangeTargets(undefined, rng).find((t) => t.motion === 'popup')!;
    let upFor = 0;
    const ups: number[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      stepRangeTargets([p], DT, rng);
      if (p.down <= 0) upFor += DT;
      else if (upFor > 0) {
        ups.push(upFor);
        upFor = 0;
      }
    }
    expect(ups.length).toBeGreaterThan(3);
    for (const u of ups) {
      expect(u).toBeGreaterThanOrEqual(RANGE.popup.up[0] - 2 * DT);
      expect(u).toBeLessThanOrEqual(RANGE.popup.up[1] + 2 * DT);
    }
  });

  it('is the same from the same seed', () => {
    const run = (seed: number) => {
      const rng = createRng(seed);
      const p = createRangeTargets(undefined, rng).filter((t) => t.motion === 'popup');
      for (let i = 0; i < 600; i++) stepRangeTargets(p, DT, rng);
      return p.map((t) => [t.down, t.up]);
    };
    expect(run(4)).toEqual(run(4));
    expect(run(4)).not.toEqual(run(5));
  });

  it('a standing one that is hit goes down at once and cannot be hit while down', () => {
    const rng = createRng(2);
    const p = createRangeTargets(undefined, rng).find((t) => t.motion === 'popup')!;
    p.down = 0;
    const o = vec3(p.position.x, 1.2, p.position.z + 5);
    expect(rayRangeTarget(o, vec3(0, 0, -1), 10, p, HITS)).toBeGreaterThan(0);
    hitRangeTarget(p, rng);
    expect(p.down).toBeGreaterThanOrEqual(RANGE.popup.down[0]);
    expect(rayRangeTarget(o, vec3(0, 0, -1), 10, p, HITS)).toBe(-1);
  });

  it('held (challenge, not lit) a pop-up waits lying just before rising; lit, it rises', () => {
    const rng = createRng(2);
    const targets = createRangeTargets(undefined, rng);
    setPopupsAuto(targets, false);
    const p = targets.find((t) => t.motion === 'popup')!;
    for (let i = 0; i < 60 * 20; i++) stepRangeTargets(targets, DT, rng);
    expect(p.down).toBeGreaterThan(0);
    expect(p.down).toBeLessThanOrEqual(RANGE.riseTime + 1e-9);
    p.lit = 3;
    for (let i = 0; i < 60; i++) stepRangeTargets(targets, DT, rng);
    expect(p.down).toBe(0);
    // And once standing it does not drop by itself in the challenge.
    p.up = 0;
    for (let i = 0; i < 60 * 20; i++) stepRangeTargets(targets, DT, rng);
    expect(p.down).toBe(0);
  });

  it('a pop-up hit in the challenge stays down for the plain figure time; back in free practice it rises on its own', () => {
    const rng = createRng(9);
    const targets = createRangeTargets(undefined, rng);
    setPopupsAuto(targets, false);
    const p = targets.find((t) => t.motion === 'popup')!;
    hitRangeTarget(p, rng);
    expect(p.down).toBe(RANGE.figureDownTime);
    setPopupsAuto(targets, true, rng);
    for (let i = 0; i < 60 * 30; i++) stepRangeTargets(targets, DT, rng);
    // It has been up at some time since (it drops again by itself).
    let up = false;
    for (let i = 0; i < 60 * 30; i++) {
      stepRangeTargets(targets, DT, rng);
      if (p.down <= 0) up = true;
    }
    expect(up).toBe(true);
  });
});

describe('small and turned plates, the START plate (M93)', () => {
  it('a small plate has the smaller radius in the ray test, a big one does not', () => {
    const small = find('Small steel');
    const big = createRangeTargets().find((t) => t.kind === 'steel' && t.motion === 'still' && t.radius === RANGE.plateRadius)!;
    expect(small.radius).toBe(RANGE.smallPlateRadius);
    expect(small.radius).toBeLessThan(big.radius);
    const off = (small.radius + big.radius) / 2;
    const at = (t: typeof small, dx: number) => rayRangeTarget(vec3(t.position.x + dx, t.position.y, t.position.z + 5), vec3(0, 0, -1), 10, t, HITS);
    expect(at(small, small.radius * 0.9)).toBeCloseTo(5, 6);
    expect(at(small, off)).toBe(-1);
    expect(at(big, off)).toBeCloseTo(5, 6);
  });

  it('a plate turned a quarter turn is hit from its own front only, and its post stands behind it', () => {
    const spec = targetSpec({ kind: 'steel', x: 0, y: RANGE.plateHeight, z: 0, label: 'T', distance: 1, yaw: Math.PI / 2 });
    const [t] = createRangeTargets([spec]);
    const y = RANGE.plateHeight;
    // Faces +x: a BB flying -x from x = +5 hits; from behind it does not.
    expect(rayRangeTarget(vec3(5, y, 0), vec3(-1, 0, 0), 10, t!, HITS)).toBeCloseTo(5, 6);
    expect(rayRangeTarget(vec3(-5, y, 0), vec3(1, 0, 0), 10, t!, HITS)).toBe(-1);
    expect(rayRangeTarget(vec3(5, y, RANGE.plateRadius + 0.02), vec3(-1, 0, 0), 10, t!, HITS)).toBe(-1);
    // The post is behind it (at -x): a BB under the plate stops there as a miss; at +z it flies free.
    firstRangeTargetHit(vec3(5, 0.5, 0), vec3(-1, 0, 0), 10, [t!], HITS, hit);
    expect(hit).toMatchObject({ index: 0, post: true });
    expect(hit.at).toBeCloseTo(5 + RANGE.postBehind - 0, 1);
    firstRangeTargetHit(vec3(5, 0.5, 0.5), vec3(-1, 0, 0), 10, [t!], HITS, hit);
    expect(hit.index).toBe(-1);
  });

  it('a swinger frame stops a BB at its legs, beside the swing', () => {
    const t = find('Swinger');
    const half = RANGE.swinger.arm * Math.sin(RANGE.swinger.amplitude) + t.radius + RANGE.swinger.frameClearance;
    firstRangeTargetHit(vec3(t.home.x + half, 0.5, t.home.z + 5), vec3(0, 0, -1), 10, [t], HITS, hit);
    expect(hit.post).toBe(true);
    firstRangeTargetHit(vec3(t.home.x + half + 0.3, 0.5, t.home.z + 5), vec3(0, 0, -1), 10, [t], HITS, hit);
    expect(hit.index).toBe(-1);
  });

  it('a hidden START plate cannot be hit, nor stop a BB at its post; shown, it can', () => {
    const targets = createRangeTargets();
    const start = targets.find((t) => t.start)!;
    expect(start.hidden).toBe(true);
    const o = vec3(start.position.x, start.position.y, start.position.z + 3);
    expect(rayRangeTarget(o, vec3(0, 0, -1), 10, start, HITS)).toBe(-1);
    firstRangeTargetHit(vec3(o.x, 0.2, o.z), vec3(0, 0, -1), 10, [start], HITS, hit);
    expect(hit.index).toBe(-1);
    start.hidden = false;
    expect(rayRangeTarget(o, vec3(0, 0, -1), 10, start, HITS)).toBeCloseTo(3, 6);
  });
});
