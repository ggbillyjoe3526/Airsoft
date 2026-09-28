import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, GAS_PISTOL, LOADOUT, RECOIL } from '../config/replicas';
import { type ArmamentContext, createArmament, type Muzzle, stepArmament, type WorldQuery } from './armament';
import { createBBPool } from './ballistics';
import { createCommand, type PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { createRng } from './rng';
import { vec3 } from './vec';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const openSky: WorldQuery = { raycastStatic: () => -1 };

function setup(query: WorldQuery = openSky) {
  const events: GameEvent[] = [];
  const ctx: ArmamentContext = {
    loadout: LOADOUT,
    ballistics: BALLISTICS,
    bbs: createBBPool(512),
    rng: createRng(7),
    query,
    events,
  };
  const a = createArmament(LOADOUT);
  const muzzle: Muzzle = { eye: vec3(0, 1.6, 0), yaw: 0, pitch: 0 };
  const cmd = createCommand();
  /** Runs ticks, clearing one-shot inputs after the first. Returns all events. */
  const run = (ticks: number, setupCmd: (c: PlayerCommand, tick: number) => void = () => {}, canFire = true): GameEvent[] => {
    const all: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      setupCmd(cmd, i);
      events.length = 0;
      stepArmament(1, a, cmd, muzzle, canFire, ctx, DT);
      all.push(...events);
      cmd.reload = false;
      cmd.switchTo = -1;
    }
    return all;
  };
  const count = (evs: GameEvent[], type: GameEvent['type']): number => evs.filter((e) => e.type === type).length;
  return { a, ctx, cmd, muzzle, run, count };
}

describe('replica handling', () => {
  it('fires the AEG at its fire rate while the trigger is held', () => {
    const { a, run, count } = setup();
    const evs = run(60, (c) => (c.fire = true));
    expect(Math.abs(count(evs, 'shot') - AEG.fireRate)).toBeLessThanOrEqual(1);
    expect(a.ammo[0]!.mag).toBe(AEG.magSize - count(evs, 'shot'));
  });

  it('fires the pistol once per trigger press, never faster than its fire rate', () => {
    const { a, run, count } = setup();
    run(1, (c) => (c.switchTo = 1));
    run(Math.ceil(GAS_PISTOL.drawTime / DT) + 1);
    expect(a.active).toBe(1);
    // Holding the trigger: one shot.
    expect(count(run(60, (c) => (c.fire = true)), 'shot')).toBe(1);
    // Hammering the trigger every other tick: capped by fire rate.
    const clicks = run(60, (c, i) => (c.fire = i % 2 === 0));
    expect(count(clicks, 'shot')).toBeLessThanOrEqual(GAS_PISTOL.fireRate + 1);
    expect(count(clicks, 'shot')).toBeGreaterThanOrEqual(GAS_PISTOL.fireRate - 1);
  });

  it('clicks dry when empty, then reloads automatically from reserve', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 0;
    const evs = run(1, (c) => (c.fire = true));
    expect(count(evs, 'shot')).toBe(0);
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(1);
    const done = run(Math.ceil(AEG.reloadTime / DT) + 1, (c) => (c.fire = false));
    expect(count(done, 'reloadEnd')).toBe(1);
    expect(a.ammo[0]!.mag).toBe(AEG.magSize);
    expect(a.ammo[0]!.reserve).toBe(AEG.reserve - AEG.magSize);
  });

  it('reloads on request only when it helps, and tops up from what reserve is left', () => {
    const { a, run, count } = setup();
    expect(count(run(1, (c) => (c.reload = true)), 'reloadStart')).toBe(0); // full mag
    a.ammo[0]!.mag = 10;
    a.ammo[0]!.reserve = 5;
    expect(count(run(1, (c) => (c.reload = true)), 'reloadStart')).toBe(1);
    run(Math.ceil(AEG.reloadTime / DT) + 1);
    expect(a.ammo[0]!.mag).toBe(15);
    expect(a.ammo[0]!.reserve).toBe(0);
    a.ammo[0]!.mag = 0;
    const evs = run(1, (c) => (c.fire = true));
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(0); // nothing left to load
  });

  it('cannot fire while reloading or drawing; switching cancels a reload', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 5;
    run(1, (c) => (c.reload = true));
    expect(count(run(10, (c) => (c.fire = true)), 'shot')).toBe(0);
    const sw = run(1, (c) => (c.switchTo = 1));
    expect(count(sw, 'draw')).toBe(1);
    expect(a.reload).toBe(0);
    expect(a.ammo[0]!.mag).toBe(5); // the cancelled reload didn't load anything
    expect(count(run(Math.floor(GAS_PISTOL.drawTime / DT) - 1, (c, i) => (c.fire = i % 2 === 0)), 'shot')).toBe(0);
    run(5, (c) => (c.fire = false));
    expect(count(run(1, (c) => (c.fire = true)), 'shot')).toBe(1);
  });

  it('does not fire when the character cannot (sprinting)', () => {
    const { run, count } = setup();
    expect(count(run(30, (c) => (c.fire = true), false), 'shot')).toBe(0);
  });

  it('spawns a BB just ahead of the eye, moving at muzzle velocity along the aim', () => {
    const { ctx, run } = setup();
    run(1, (c) => (c.fire = true));
    const bb = ctx.bbs.bbs.find((b) => b.active)!;
    expect(bb.ownerId).toBe(1);
    const speed = Math.hypot(bb.velocity.x, bb.velocity.y, bb.velocity.z);
    expect(speed).toBeCloseTo(AEG.muzzleVelocity, 6);
    expect(bb.velocity.z).toBeLessThan(-0.99 * speed); // yaw 0 aims down -Z
    expect(Math.hypot(bb.position.x, bb.position.y - 1.6, bb.position.z)).toBeCloseTo(BALLISTICS.muzzleOffset, 6);
  });

  it('spreads shots around the aim point by roughly the configured amount, deterministically', () => {
    const angles = (seedRuns: number): number[] => {
      const { ctx, a, run } = setup();
      const out: number[] = [];
      for (let i = 0; i < seedRuns; i++) {
        a.recoil = 0;
        a.cooldown = 0;
        a.ammo[0]!.mag = 10;
        run(1, (c) => (c.fire = true));
        run(1, (c) => (c.fire = false));
        const bb = ctx.bbs.bbs.filter((b) => b.active).sort((x, y) => y.serial - x.serial)[0]!;
        out.push(Math.atan2(bb.velocity.x, -bb.velocity.z)); // horizontal deviation
      }
      return out;
    };
    const xs = angles(300);
    const sd = Math.sqrt(xs.reduce((s, v) => s + v * v, 0) / xs.length);
    expect(sd).toBeGreaterThan(AEG.spreadDeg * DEG * 0.7);
    expect(sd).toBeLessThan(AEG.spreadDeg * DEG * 1.3);
    expect(angles(20)).toEqual(xs.slice(0, 20));
  });

  it('kicks the aim up a little per shot, caps it, and recovers quickly', () => {
    const { a, run } = setup();
    run(1, (c) => (c.fire = true));
    expect(a.recoil).toBeCloseTo(AEG.recoilDeg * DEG, 6);
    run(59, (c) => (c.fire = true));
    expect(a.recoil).toBeLessThanOrEqual(RECOIL.maxDeg * DEG + 1e-12);
    run(Math.ceil((RECOIL.recoveryTime * 5) / DT), (c) => (c.fire = false));
    expect(a.recoil).toBeLessThan(AEG.recoilDeg * DEG * 0.1);
  });

  it('hits cover right in front of the muzzle instead of shooting through it', () => {
    const wallAt = 0.2;
    const { ctx, run, count } = setup({ raycastStatic: (_o, _d, max) => (wallAt <= max ? wallAt : -1) });
    const evs = run(1, (c) => (c.fire = true));
    expect(count(evs, 'shot')).toBe(1);
    expect(count(evs, 'bbImpact')).toBe(1);
    expect(ctx.bbs.bbs.some((b) => b.active)).toBe(false);
  });
});
