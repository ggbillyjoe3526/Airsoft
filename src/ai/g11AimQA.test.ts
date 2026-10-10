import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOTS, botConfig } from '../config/bots';
import { initPhysics } from '../physics/physicsWorld';
import { createRng } from '../sim/rng';
import { createAim, freshAimError } from './aim';
import { duel, noWalls } from './testSupport';

/**
 * G11 QA, acceptance 5 and 6: the first aim at a new contact goes wide to one side and settles once the bot may fire;
 * how wide, how level and how long are config (config/bots.ts), not literals in the aim code. Only what must never
 * happen is asserted; how often a level wins or how soon it lands is src/ai/balance/closeRange.balance.ts's.
 */

const DEG = Math.PI / 180;
/** The angle of a first aim's error from sideways (radians, 0 level): pitch over the yaw's size. */
const fromLevel = (yaw: number, pitch: number): number => Math.atan2(Math.abs(pitch), Math.abs(yaw));

describe('the first error of a new contact points sideways, within 30° of level (G11)', () => {
  it('the configured tilt is at most 30°, and no draw is tilted past it, dead on, or straight up or down', () => {
    expect(BOTS.aimFirstErrorTiltDeg).toBeGreaterThan(0);
    expect(BOTS.aimFirstErrorTiltDeg).toBeLessThanOrEqual(30);
    const rng = createRng(2026);
    let worst = 0;
    for (let i = 0; i < 3000; i++) {
      const a = createAim(0);
      freshAimError(a, BOTS, rng, true);
      worst = Math.max(worst, fromLevel(a.firstYaw, a.firstPitch));
      expect(Math.abs(a.firstYaw), 'sideways').toBeGreaterThan(BOTS.aimFirstErrorMin * Math.cos(30 * DEG) - 1e-9);
      expect(Math.hypot(a.firstYaw, a.firstPitch), 'never dead on').toBeGreaterThanOrEqual(BOTS.aimFirstErrorMin - 1e-9);
    }
    expect(worst).toBeLessThanOrEqual(30 * DEG + 1e-9);
    // The tilt is used, not zero: some draws are tilted well off level.
    expect(worst).toBeGreaterThan(20 * DEG);
  });

  it('only a new contact gets one: coming back to someone seen moments ago keeps the old first aim as it was', () => {
    const rng = createRng(5);
    const a = createAim(0);
    freshAimError(a, BOTS, rng, true);
    const { firstYaw, firstPitch } = a;
    freshAimError(a, BOTS, rng);
    expect(a.firstYaw).toBe(firstYaw);
    expect(a.firstPitch).toBe(firstPitch);
  });

  it('is data: the tilt and the least error come from the config they are given', () => {
    const level = { ...BOTS, aimFirstErrorTiltDeg: 0, aimFirstErrorMin: 0.9 };
    const steep = { ...BOTS, aimFirstErrorTiltDeg: 80 };
    const rngLevel = createRng(9);
    const rngSteep = createRng(9);
    let tilted = 0;
    for (let i = 0; i < 600; i++) {
      const a = createAim(0);
      freshAimError(a, level, rngLevel, true);
      expect(Math.abs(a.firstPitch)).toBe(0);
      expect(Math.abs(a.firstYaw)).toBeGreaterThanOrEqual(0.9 - 1e-9);
      const b = createAim(0);
      freshAimError(b, steep, rngSteep, true);
      expect(fromLevel(b.firstYaw, b.firstPitch)).toBeLessThanOrEqual(80 * DEG + 1e-9);
      if (fromLevel(b.firstYaw, b.firstPitch) > 30 * DEG) tilted++;
    }
    expect(tilted).toBeGreaterThan(100);
  });

  it('the new tuning values are numbers in the ranges their comments give', () => {
    const B = BOT_BEHAVIOUR;
    expect(B.aimSettleWhileReacting).toBeGreaterThanOrEqual(0);
    expect(B.aimSettleWhileReacting).toBeLessThanOrEqual(1);
    expect(B.aimFirstErrorMin).toBeGreaterThan(0);
    expect(B.aimFirstErrorMin).toBeLessThanOrEqual(1);
    expect(B.routeOffLeg).toBeGreaterThan(0);
    expect(B.routeRejoinAhead).toBeGreaterThan(0);
    expect(B.friendlyBeyondTarget).toBeGreaterThan(0);
  });
});

describe('a bot meeting a player up close (G11)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a fresh contact in a real duel carries a first aim: sideways, within 30° of level, never dead on', () => {
    for (const dist of [5, 10]) {
      for (let seed = 1; seed <= 6; seed++) {
        const { bots, run } = duel(dist, () => {}, noWalls, botConfig('normal'), seed);
        run(0.5, () => {});
        const aim = bots.bots[0]!.aim;
        const ctx = `${dist} m seed ${seed}`;
        expect(Math.hypot(aim.firstYaw, aim.firstPitch), ctx).toBeGreaterThanOrEqual(BOTS.aimFirstErrorMin - 1e-9);
        expect(fromLevel(aim.firstYaw, aim.firstPitch), ctx).toBeLessThanOrEqual(30 * DEG + 1e-9);
        expect(Math.abs(aim.firstYaw), ctx).toBeGreaterThan(0.5);
      }
    }
  });

  it('settles the first aim only once it may fire: with the reaction counting fully the first BB comes sooner than with none counting', () => {
    // aimSettleWhileReacting is read from the config the bot is given, not a constant in the aim code.
    const firstHit = (settle: number, seed: number): number => {
      const { state, bots, run } = duel(5, () => {}, noWalls, { ...botConfig('normal'), aimSettleWhileReacting: settle }, seed);
      let took = Number.POSITIVE_INFINITY;
      run(5, () => {
        if (took < Number.POSITIVE_INFINITY) return;
        for (const e of state.events) if (e.type === 'characterHit' && e.victimId === 0) took = state.time - (bots.bots[0]!.contacts.get(0)?.firstSeenAt ?? 0);
      });
      return took;
    };
    let early = 0;
    let late = 0;
    for (let seed = 1; seed <= 6; seed++) {
      early += Math.min(5, firstHit(1, seed));
      late += Math.min(5, firstHit(0, seed));
    }
    expect(early).toBeLessThan(late);
  });
});
