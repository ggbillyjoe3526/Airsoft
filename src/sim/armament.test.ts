import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, GAS_PISTOL, hopUpLift, LOADOUT, muzzleVelocity, RECOIL, TRIGGER } from '../config/replicas';
import { type ArmamentContext, createArmament, fitParts, type Muzzle, nextFireMode, nextSpare, rattles, setBbWeights, setHopUps, shotHeardScale, stepArmament, type WorldQuery } from './armament';
import { createCharacter, respawnCharacter } from './character';
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
      cmd.cycleFireMode = false;
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

  it('never uses up a bottomless magazine (the Dev settings, M24), and keeps it so through a respawn', () => {
    const { a, run, count } = setup();
    a.bottomless = true;
    // Long enough for more shots than a magazine holds.
    const evs = run(Math.ceil(((AEG.magSize + 10) / AEG.fireRate) * 60), (c) => (c.fire = true));
    expect(count(evs, 'shot')).toBeGreaterThan(AEG.magSize);
    expect(a.ammo[0]!.mag).toBe(AEG.magSize);
    const c = createCharacter(1, vec3(), 0, LOADOUT, 0);
    c.armament.bottomless = true;
    respawnCharacter(c);
    expect(c.armament.bottomless).toBe(true);
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

  it('keeps a reload pressed while the replica comes up, and starts it once it is up (bug pass)', () => {
    const { a, run, count } = setup();
    a.ammo[1]!.mag = 5;
    run(1, (c) => (c.switchTo = 1));
    // R three ticks into the draw: nothing yet, then the reload starts as the pistol is up.
    const during = run(Math.ceil(GAS_PISTOL.drawTime / DT) + 1, (c, i) => (c.reload = i === 3));
    expect(count(during, 'reloadStart')).toBe(1);
    expect(a.reload).toBeGreaterThan(0);
    run(Math.ceil(GAS_PISTOL.reloadTime / DT) + 1);
    expect(a.ammo[1]!.mag).toBe(GAS_PISTOL.magSize);
  });

  it('drops a reload asked for during a draw when the player switches again', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 5;
    run(1, (c) => (c.switchTo = 1));
    run(3, (c, i) => (c.reload = i === 1));
    run(1, (c) => (c.switchTo = 0));
    expect(count(run(Math.ceil(AEG.drawTime / DT) + 5), 'reloadStart')).toBe(0);
    expect(a.ammo[0]!.mag).toBe(5);
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
    expect(rifleBB.hopUp).toBe(hopUpLift(AEG, AEG.hopUpDial)); // the factory hop-up setting
    run(1, (c) => (c.fire = false));
    run(1, (c) => (c.switchTo = 1));
    run(Math.ceil(GAS_PISTOL.drawTime / DT) + 1);
    expect(a.active).toBe(1);
    const before = ctx.bbs.nextSerial;
    run(1, (c) => (c.fire = true));
    const pistolBB = ctx.bbs.bbs.find((b) => b.active && b.serial >= before)!;
    expect(pistolBB.mass).toBeCloseTo(0.0002, 9);
    expect(pistolBB.hopUp).toBe(hopUpLift(GAS_PISTOL, GAS_PISTOL.hopUpDial));
    expect(Math.hypot(pistolBB.velocity.x, pistolBB.velocity.y, pistolBB.velocity.z)).toBeCloseTo(72, 0);
  });

  it('gives each BB the hop-up its replica is dialled to', () => {
    const { ctx, a, run } = setup();
    setHopUps(a, [1, 0]);
    run(1, (c) => (c.fire = true));
    expect(ctx.bbs.bbs.find((b) => b.active)!.hopUp).toBe(AEG.hopUpMax);
  });

  it('fires the BB weight picked for the replica: heavier leaves slower, with a little more energy', () => {
    const { ctx, a, run } = setup();
    setBbWeights(a, [0.28, 0.2]);
    run(1, (c) => (c.fire = true));
    const bb = ctx.bbs.bbs.find((b) => b.active)!;
    expect(bb.mass).toBeCloseTo(0.00028, 9);
    const speed = Math.hypot(bb.velocity.x, bb.velocity.y, bb.velocity.z);
    expect(speed).toBeCloseTo(muzzleVelocity(AEG, 0.28), 6);
    expect(speed).toBeLessThan(muzzleVelocity(AEG));
    expect(0.5 * bb.mass * speed * speed).toBeGreaterThan(AEG.muzzleEnergy);
  });

  it('only takes BB weights that are offered', () => {
    const a = createArmament(LOADOUT);
    setBbWeights(a, [0.31, Number.NaN]);
    expect(a.bbWeights).toEqual([AEG.bbWeight, GAS_PISTOL.bbWeight]);
    setBbWeights(a, [0.28]);
    expect(a.bbWeights).toEqual([0.28, GAS_PISTOL.bbWeight]);
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

  it('never sends a BB past vertical, even fired straight up with full kick and spread (bug pass)', () => {
    const { ctx, muzzle, run } = setup();
    muzzle.pitch = Math.PI / 2 - 0.02; // the top of the look range (MOVEMENT.maxPitch)
    run(60, (c) => (c.fire = true));
    const fired = ctx.bbs.bbs.filter((b) => b.active);
    expect(fired.length).toBeGreaterThan(5);
    // Past vertical, a BB aimed down -Z would head +Z (backwards).
    for (const bb of fired) expect(bb.velocity.z).toBeLessThanOrEqual(0);
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
  it('never fires a double-tap faster than the fire rate after the replica sat ready (bug pass)', () => {
    const { run } = setup();
    run(1, (c) => (c.switchTo = 1));
    run(Math.ceil(GAS_PISTOL.drawTime / DT) + 30); // drawn, then idle
    // Two quick pulls, the second buffered during the cooldown; one tick at a time to see when each fires.
    const shotTicks: number[] = [];
    for (let tick = 0; tick < 40; tick++) {
      const evs = run(1, (c) => (c.fire = tick === 0 || tick === 2));
      if (evs.some((e) => e.type === 'shot')) shotTicks.push(tick);
    }
    expect(shotTicks.length).toBe(2);
    expect((shotTicks[1]! - shotTicks[0]!) * DT).toBeGreaterThanOrEqual(1 / GAS_PISTOL.fireRate - 1e-9);
  });

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

  it('clicks and reloads again after switching away mid-reload and back, trigger still held', () => {
    const { a, run, count } = setup();
    a.ammo[0]!.mag = 0;
    run(2, (c) => (c.fire = true)); // dry click, auto-reload starts
    expect(a.reload).toBeGreaterThan(0);
    run(1, (c) => ((c.fire = true), (c.switchTo = 1))); // switching cancels the reload
    run(Math.ceil(GAS_PISTOL.drawTime / DT) + 1, (c) => (c.fire = true));
    run(1, (c) => ((c.fire = true), (c.switchTo = 0)));
    const evs = run(Math.ceil(AEG.drawTime / DT) + 2, (c) => (c.fire = true));
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(1);
  });
});

describe('fire selector (owner, 2026-10-03)', () => {
  const shotTicks = (evs: { type: string }[][]): number[] => evs.flatMap((e, i) => (e.some((x) => x.type === 'shot') ? [i] : []));

  it('steps the AEG through single, burst and auto (it starts on auto); the pistol has only semi', () => {
    expect(AEG.fireModes).toEqual(['semi', 'burst', 'auto']);
    expect(AEG.defaultFireMode).toBe('auto');
    expect(GAS_PISTOL.fireModes).toEqual(['semi']);
    expect(nextFireMode(AEG, 'auto')).toBe('semi');
    expect(nextFireMode(AEG, 'semi')).toBe('burst');
    expect(nextFireMode(AEG, 'burst')).toBe('auto');
    expect(nextFireMode(GAS_PISTOL, 'semi')).toBe('semi');

    const { a, run } = setup();
    expect(a.modes).toEqual(['auto', 'semi']);
    const evs = run(1, (c) => (c.cycleFireMode = true));
    expect(a.modes[0]).toBe('semi');
    expect(evs).toContainEqual({ type: 'fireMode', characterId: 1, replicaId: AEG.id, mode: 'semi' });
    // One press, one step: the latch is consumed.
    run(5);
    expect(a.modes[0]).toBe('semi');

    // The pistol's selector doesn't move, and says nothing.
    run(1, (c) => (c.switchTo = 1));
    expect(run(1, (c) => (c.cycleFireMode = true)).some((e) => e.type === 'fireMode')).toBe(false);
    expect(a.modes).toEqual(['semi', 'semi']);
  });

  it('fires one BB per pull in single, however long the trigger is held', () => {
    const { a, run, count } = setup();
    run(1, (c) => (c.cycleFireMode = true));
    expect(a.modes[0]).toBe('semi');
    expect(count(run(60, (c) => (c.fire = true)), 'shot')).toBe(1);
  });

  it('fires a burst of three per pull at the fire rate, held or tapped', () => {
    const { a, cmd, muzzle, ctx } = setup();
    a.modes[0] = 'burst';
    const ticks: { type: string }[][] = [];
    const step = (fire: boolean): void => {
      cmd.fire = fire;
      ctx.events.length = 0;
      stepArmament(1, a, cmd, muzzle, true, ctx, DT);
      ticks.push([...ctx.events]);
    };
    for (let i = 0; i < 60; i++) step(true); // held a whole second: still one burst
    const held = shotTicks(ticks);
    expect(held.length).toBe(TRIGGER.burstShots);
    // Spaced by the fire rate, like auto.
    for (let i = 1; i < held.length; i++) expect((held[i]! - held[i - 1]!) * DT).toBeCloseTo(1 / AEG.fireRate, 1);

    // A tap (one tick) still gets the whole burst.
    ticks.length = 0;
    step(false);
    step(true);
    for (let i = 0; i < 30; i++) step(false);
    expect(shotTicks(ticks).length).toBe(TRIGGER.burstShots);
    expect(a.ammo[0]!.mag).toBe(AEG.magSize - 2 * TRIGGER.burstShots);
  });

  it('ignores pulls during a burst, and buffers one that comes just after it', () => {
    const { a, run, count } = setup();
    a.modes[0] = 'burst';
    // Clicks on every other tick through the first burst: still one burst while it runs.
    const during = run(Math.ceil(TRIGGER.burstShots / AEG.fireRate / DT) - 1, (c, i) => (c.fire = i % 2 === 0));
    expect(count(during, 'shot')).toBe(TRIGGER.burstShots);
    expect(a.burstShotsLeft).toBe(0);
    // A pull right after the last shot (while the replica cycles) fires the next burst once it can.
    const after = run(30, (c, i) => (c.fire = i === 0));
    expect(count(after, 'shot')).toBe(TRIGGER.burstShots);
  });

  it('ends a burst early when the magazine runs dry (one click, then the reload starts)', () => {
    const { a, run, count } = setup();
    a.modes[0] = 'burst';
    a.ammo[0]!.mag = TRIGGER.burstShots - 1;
    const evs = run(30, (c, i) => (c.fire = i === 0));
    expect(count(evs, 'shot')).toBe(TRIGGER.burstShots - 1);
    expect(count(evs, 'dryFire')).toBe(1);
    expect(count(evs, 'reloadStart')).toBe(1);
    expect(a.burstShotsLeft).toBe(0);
  });

  it('cuts a burst short on a switch or when the replica can\'t fire (sprinting)', () => {
    const { a, run, count } = setup();
    a.modes[0] = 'burst';
    expect(count(run(1, (c) => (c.fire = true)), 'shot')).toBe(1);
    expect(a.burstShotsLeft).toBe(TRIGGER.burstShots - 1);
    run(1, (c) => {
      c.fire = false;
      c.switchTo = 1;
    });
    expect(a.burstShotsLeft).toBe(0);

    const s = setup();
    s.a.modes[0] = 'burst';
    s.run(1, (c) => (c.fire = true));
    expect(s.count(s.run(30, (c) => (c.fire = false), false), 'shot')).toBe(0);
    expect(s.a.burstShotsLeft).toBe(0);
  });

  it('keeps each replica\'s selector, hop-up and BB weight where they were across rounds', () => {
    const c = createCharacter(0, vec3(), 0, LOADOUT);
    c.armament.modes[0] = 'burst';
    setHopUps(c.armament, [0.4, 0.8]);
    setBbWeights(c.armament, [0.28, 0.25]);
    c.armament.ammo[0]!.mag = 3;
    respawnCharacter(c);
    expect(c.armament.modes).toEqual(['burst', 'semi']);
    expect(c.armament.hopUps).toEqual([0.4, 0.8]);
    expect(c.armament.bbWeights).toEqual([0.28, 0.25]);
    expect(c.armament.ammo[0]!.mag).toBe(AEG.magSize);
  });

  it('needs a fresh pull for a semi shot when the trigger is still held as a round starts (bug pass)', () => {
    const c = createCharacter(0, vec3(), 0, LOADOUT);
    c.armament.modes[0] = 'semi';
    c.armament.triggerWasDown = true; // held through the end of the last round
    respawnCharacter(c);
    const s = setup();
    Object.assign(s.a, c.armament);
    expect(s.count(s.run(10, (cmd) => (cmd.fire = true)), 'shot')).toBe(0);
    expect(s.count(s.run(1, (cmd) => (cmd.fire = false)), 'shot')).toBe(0);
    expect(s.count(s.run(1, (cmd) => (cmd.fire = true)), 'shot')).toBe(1);
  });
});

describe('attachments on the armament (M17b)', () => {
  it('fits grips and magazines per replica, with fresh magazines of the new kind', () => {
    const a = createArmament(LOADOUT);
    fitParts(a, [
      { grip: 'angled', magazine: 'hiCap' },
      { grip: 'none', magazine: 'extended' },
    ]);
    expect(a.parts).toMatchObject([
      { grip: 'angled', magazine: 'hiCap' },
      { grip: 'none', magazine: 'extended' },
    ]);
    expect(a.ammo[0]!.mag).toBe(120);
    expect(a.ammo[0]!.pouch).toEqual([120]);
    expect(a.ammo[1]!.mag).toBe(27);
    expect(a.ammo[1]!.pouch).toHaveLength(GAS_PISTOL.mags - 1);
  });

  it('reloads and draws in the times the parts give', () => {
    const { a, run } = setup();
    fitParts(a, [{ grip: 'none', magazine: 'lowCap' }, { grip: 'none', magazine: 'extended' }]);
    a.ammo[0]!.mag = 0;
    run(1, (c) => (c.reload = true));
    expect(a.reload).toBeCloseTo(AEG.reloadTime * 0.8, 6);
    run(Math.ceil((AEG.reloadTime * 0.8) / DT) + 1);
    expect(a.ammo[0]!.mag).toBe(30);
    run(1, (c) => (c.switchTo = 1));
    expect(a.draw).toBeGreaterThan(GAS_PISTOL.drawTime);
  });

  it('keeps the parts through a respawn, refilling their magazines', () => {
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    fitParts(c.armament, [{ grip: 'vertical', magazine: 'hiCap' }]);
    c.armament.ammo[0]!.mag = 3;
    respawnCharacter(c);
    expect(c.armament.parts[0]).toMatchObject({ grip: 'vertical', magazine: 'hiCap' });
    expect(c.armament.ammo[0]!.mag).toBe(120);
    expect(rattles(c.armament)).toBe(true);
  });
});

describe('how far a shot carries (M29b)', () => {
  it("is the usual 1 as it comes, the silencer's share when one is fitted on the active replica, and follows a switch", () => {
    const c = createCharacter(1, vec3(), 0, LOADOUT, 0);
    expect(shotHeardScale(c)).toBe(1);
    fitParts(c.armament, [{ grip: 'none', magazine: 'standard', muzzle: 'silencer' }, { grip: 'none', magazine: 'standard' }]);
    expect(shotHeardScale(c)).toBe(0.5);
    c.armament.active = 1;
    expect(shotHeardScale(c)).toBe(1);
    // Kept through a respawn, like the other fitted parts.
    c.armament.active = 0;
    respawnCharacter(c);
    expect(shotHeardScale(c)).toBe(0.5);
  });
});
