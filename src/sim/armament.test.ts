import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, GAS_PISTOL, LOADOUT, muzzleVelocity, RECOIL } from '../config/replicas';
import { type ArmamentContext, createArmament, type Muzzle, nextSpare, stepArmament, type WorldQuery } from './armament';
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
  const muzzle: Muzzle = { eye: vec3(0, 1.6, 0), yaw: 0, pitch: 0, spreadScale: 1 };
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

  it('clicks dry when empty, then reloads automatically with a full spare magazine', () => {
    const { a, run, count } = setup();
    expect(a.ammo[0]!.pouch).toEqual(Array(AEG.mags - 1).fill(AEG.magSize));
    a.ammo[0]!.mag = 0;
    const evs = run(1, (c) => (c.fire = true));
    expect(count(evs, 'shot')).toBe(0);
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(1);
    const done = run(Math.ceil(AEG.reloadTime / DT) + 1, (c) => (c.fire = false));
    expect(count(done, 'reloadEnd')).toBe(1);
    expect(a.ammo[0]!.mag).toBe(AEG.magSize);
    // The empty magazine went back in the pouch: one fewer full spare.
    expect([...a.ammo[0]!.pouch].sort((x, y) => x - y)).toEqual([0, ...Array(AEG.mags - 2).fill(AEG.magSize)]);
  });

  it('swaps in the fullest spare and keeps the old magazine as it is: no topping up', () => {
    const { a, run, count } = setup();
    expect(count(run(1, (c) => (c.reload = true)), 'reloadStart')).toBe(0); // full mag, nothing fuller
    a.ammo[0]!.mag = 10;
    a.ammo[0]!.pouch = [25, 40, 5];
    expect(count(run(1, (c) => (c.reload = true)), 'reloadStart')).toBe(1);
    run(Math.ceil(AEG.reloadTime / DT) + 1);
    expect(a.ammo[0]!.mag).toBe(40); // the fullest spare
    expect(a.ammo[0]!.pouch).toEqual([25, 10, 5]); // the 10 went back where the 40 was
    // Reloading again only if a spare has more than the loaded mag.
    a.ammo[0]!.mag = 30;
    expect(count(run(1, (c) => (c.reload = true)), 'reloadStart')).toBe(0);
  });

  it('says so when a reload is pressed but no spare is fuller, so the HUD can explain', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 30;
    a.ammo[0]!.pouch = [25, 25, 25];
    const evs = run(1, (c) => (c.reload = true));
    expect(count(evs, 'reloadStart')).toBe(0);
    expect(count(evs, 'reloadRefused')).toBe(1);
    expect(count(run(5), 'reloadRefused')).toBe(0); // only on the press
  });

  it('knows which spare a reload would take: the fullest, only if it beats the loaded one (what the HUD marks)', () => {
    expect(nextSpare({ mag: 10, pouch: [25, 40, 5] })).toBe(1);
    expect(nextSpare({ mag: 30, pouch: [25, 25, 25] })).toBe(-1); // nothing fuller: no reload, no mark
    expect(nextSpare({ mag: 0, pouch: [0, 0, 0] })).toBe(-1);
    expect(nextSpare({ mag: 0, pouch: [0, 3, 0] })).toBe(1);
    expect(nextSpare({ mag: 5, pouch: [] })).toBe(-1);
    // A full magazine: R does nothing, quietly (nothing to explain).
    const { a, run, count } = setup();
    expect(count(run(1, (c) => (c.reload = true)), 'reloadRefused')).toBe(0);
    a.ammo[0]!.mag = AEG.magSize - 1;
    a.ammo[0]!.pouch = [AEG.magSize - 1, 0, 0];
    expect(count(run(1, (c) => (c.reload = true)), 'reloadRefused')).toBe(1);
  });

  it('leaves the magazines as they were when a switch cancels a reload', () => {
    const { a, run } = setup();
    a.ammo[0]!.mag = 12;
    a.ammo[0]!.pouch = [60, 30, 0];
    run(1, (c) => (c.reload = true));
    run(Math.floor(AEG.reloadTime / DT / 2));
    run(1, (c) => (c.switchTo = 1));
    run(Math.ceil(AEG.reloadTime / DT));
    expect(a.ammo[0]!.mag).toBe(12);
    expect(a.ammo[0]!.pouch).toEqual([60, 30, 0]);
  });

  it('runs dry for good once every magazine is empty', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 0;
    a.ammo[0]!.pouch = [0, 0, 0];
    const evs = run(1, (c) => (c.fire = true));
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(0); // nothing left to load
    expect(count(run(1, (c) => (c.reload = true)), 'reloadStart')).toBe(0);
  });

  it('empties every magazine it carries, and no more, over a long burst', () => {
    const { a, run, count } = setup();
    let shots = 0;
    for (let i = 0; i < 60 * 40; i++) shots += count(run(1, (c) => (c.fire = true)), 'shot');
    expect(shots).toBe(AEG.magSize * AEG.mags);
    expect(a.ammo[0]!.mag).toBe(0);
    expect(a.ammo[0]!.pouch.every((m) => m === 0)).toBe(true);
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
    // A click near the end of the draw is buffered and may fire once ready; let that settle.
    run(30, (c) => (c.fire = false));
    expect(count(run(1, (c) => (c.fire = true)), 'shot')).toBe(1);
  });

  it('does not fire when the character cannot (sprinting)', () => {
    const { run, count } = setup();
    expect(count(run(30, (c) => (c.fire = true), false), 'shot')).toBe(0);
  });

  it('spawns a BB at the eye, moving at muzzle velocity along the aim', () => {
    const { ctx, run } = setup();
    run(1, (c) => (c.fire = true));
    const bb = ctx.bbs.bbs.find((b) => b.active)!;
    expect(bb.ownerId).toBe(1);
    const speed = Math.hypot(bb.velocity.x, bb.velocity.y, bb.velocity.z);
    expect(speed).toBeCloseTo(muzzleVelocity(AEG), 6);
    expect(bb.velocity.z).toBeLessThan(-0.99 * speed); // yaw 0 aims down -Z
    expect(Math.hypot(bb.position.x, bb.position.y - 1.6, bb.position.z)).toBeCloseTo(0, 6);
  });

  it('fires each replica’s own BBs: the pistol’s lighter, slower 0.20 g BBs, the AEG’s 0.25 g', () => {
    const { ctx, a, run } = setup();
    run(1, (c) => (c.fire = true));
    const rifleBB = ctx.bbs.bbs.find((b) => b.active)!;
    expect(rifleBB.mass).toBeCloseTo(0.00025, 9);
    expect(rifleBB.hopUp).toBe(AEG.hopUp);
    run(1, (c) => (c.fire = false));
    run(1, (c) => (c.switchTo = 1));
    run(Math.ceil(GAS_PISTOL.drawTime / DT) + 1);
    expect(a.active).toBe(1);
    const before = ctx.bbs.nextSerial;
    run(1, (c) => (c.fire = true));
    const pistolBB = ctx.bbs.bbs.find((b) => b.active && b.serial >= before)!;
    expect(pistolBB.mass).toBeCloseTo(0.0002, 9);
    expect(pistolBB.hopUp).toBe(GAS_PISTOL.hopUp);
    expect(Math.hypot(pistolBB.velocity.x, pistolBB.velocity.y, pistolBB.velocity.z)).toBeCloseTo(72, 0);
  });

  it('spreads shots around the aim point by roughly the configured amount, deterministically', () => {
    const angles = (seedRuns: number, spreadScale = 1): number[] => {
      const { ctx, a, run, muzzle } = setup();
      muzzle.spreadScale = spreadScale;
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
    // The shooter's stance and movement multiplier scales the spread (same seed: exactly).
    const shaky = angles(20, 2.6);
    for (let i = 0; i < 20; i++) expect(shaky[i]).toBeCloseTo(xs[i]! * 2.6, 9);
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

});

describe('semi-auto trigger buffering', () => {
  it('turns fast clicking into shots at the full fire rate instead of dropping clicks', () => {
    for (const hz of [7.5, 8.6, 10]) {
      const { run, count } = setup();
      run(1, (c) => (c.switchTo = 1));
      run(Math.ceil(GAS_PISTOL.drawTime / DT) + 1);
      const period = 60 / hz;
      const shots = count(
        run(120, (c, i) => (c.fire = i % period < 2)), // 2-tick presses at `hz`
        'shot',
      );
      const clicks = Math.ceil(120 / period);
      expect(shots, `${hz} Hz`).toBeGreaterThanOrEqual(Math.min(clicks, GAS_PISTOL.fireRate * 2) - 1);
      expect(shots).toBeLessThanOrEqual(GAS_PISTOL.fireRate * 2 + 1);
    }
  });
});

describe('empty AEG with the trigger held', () => {
  it('clicks dry once when the mag runs out mid-burst, then reloads automatically', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 3;
    const evs = run(60, (c) => (c.fire = true));
    expect(count(evs, 'shot')).toBe(3);
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(1);
  });
});
