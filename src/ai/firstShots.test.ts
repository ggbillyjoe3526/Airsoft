import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, botConfig, type Difficulty } from '../config/bots';
import { initPhysics } from '../physics/physicsWorld';
import { createRng } from '../sim/rng';
import { aimErrorSize, aimFirstErrorSize, aimSettling, createAim, freshAimError } from './aim';
import { duel, noWalls } from './testSupport';

/**
 * G11, acceptance 3: up close a bot walks its first BBs onto you from one side once it opens fire, so a player has a
 * fair moment to answer; it still lands. The figures (how soon, at every level) are src/ai/balance/closeRange.balance.ts.
 */

const DEG = Math.PI / 180;
/** A player's fair moment to answer a Normal bot that opens up close (s): see the BBs, turn, aim (the balance figure's). */
const FAIR_MOMENT = 0.75;
const SEEDS = 20;

/** Seconds from the bot first seeing a player standing still `dist` m away to its first hit on them (Infinity: none in `seconds`). */
function firstHit(level: Difficulty, dist: number, seed: number, seconds = 6): number {
  const { state, bots, run } = duel(dist, () => {}, noWalls, botConfig(level), seed);
  let took = Number.POSITIVE_INFINITY;
  run(seconds, () => {
    if (took < Number.POSITIVE_INFINITY) return;
    for (const e of state.events) if (e.type === 'characterHit' && e.victimId === 0) took = state.time - (bots.bots[0]!.contacts.get(0)?.firstSeenAt ?? 0);
  });
  return took;
}

describe('a bot’s first aim at a new contact (G11)', () => {
  it('is off to one side, within aimFirstErrorTiltDeg of level, never dead on; the hand’s wander starts from the middle on that side', () => {
    const rng = createRng(11);
    let left = 0;
    for (let i = 0; i < 400; i++) {
      const a = createAim(0);
      freshAimError(a, BOTS, rng, true);
      const r = Math.hypot(a.firstYaw, a.firstPitch);
      expect(r).toBeGreaterThanOrEqual(BOTS.aimFirstErrorMin - 1e-9);
      expect(r).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(Math.atan2(a.firstPitch, Math.abs(a.firstYaw)))).toBeLessThanOrEqual(BOTS.aimFirstErrorTiltDeg * DEG + 1e-9);
      expect(a.errYaw).toBe(0);
      expect(a.errPitch).toBe(0);
      expect(Math.sign(a.goalErrYaw) * Math.sign(a.firstYaw)).not.toBe(-1);
      if (a.firstYaw < 0) left++;
    }
    // Either side.
    expect(left).toBeGreaterThan(120);
    expect(left).toBeLessThan(280);
  });

  it('settles only once the bot may fire, less aimSettleWhileReacting of its reaction', () => {
    // Seen at 1 s, may fire at 1.5 s.
    const cfg = { ...BOTS, aimSettleWhileReacting: 0 };
    expect(aimSettling(1.5, 1, 1, 1.5, cfg)).toBeCloseTo(0, 9);
    expect(aimSettling(1.2, 1, 1, 1.5, cfg)).toBeLessThan(0);
    expect(aimSettling(2, 1, 1, 1.5, cfg)).toBeCloseTo(0.5, 9);
    // Settling all through the reaction is the old clock: from first sight.
    expect(aimSettling(2, 1, 1, 1.5, { ...BOTS, aimSettleWhileReacting: 1 })).toBeCloseTo(1, 9);
    // A pre-aim (acquiredAt shifted back) keeps its head start.
    expect(aimSettling(1.5, 0.8, 1, 1.5, cfg)).toBeCloseTo(0.2, 9);
  });

  it('splits the error: the first aim’s part settles away, the rest (settled, moving, tracking) wanders', () => {
    const skill = botConfig('normal');
    for (const [since, dist] of [[0, 5], [0.3, 5], [0, 10], [2, 30]] as const) {
      const total = aimErrorSize(since, true, dist, 1, skill);
      const first = aimFirstErrorSize(since, dist, skill);
      const rest = aimErrorSize(10, true, dist, 1, skill);
      expect(first + rest).toBeCloseTo(total, 12);
    }
    expect(aimFirstErrorSize(skill.aimSettleTime, 5, skill)).toBe(0);
    // Up close the first aim is off by at least the start floor less the settled error.
    expect(Math.tan(aimFirstErrorSize(0, 5, skill) + skill.aimErrorSettledDeg * DEG) * 5).toBeCloseTo(skill.aimErrorStartMetres, 6);
  });
});

describe('a duel at 5 and 10 m against a player standing still (G11)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a Normal bot never lands inside the fair moment; Easy never either', { timeout: 120_000 }, () => {
    for (const level of ['easy', 'normal'] as const) {
      for (const dist of [5, 10]) {
        for (let seed = 1; seed <= SEEDS; seed++) expect(firstHit(level, dist, seed), `${level} ${dist} m seed ${seed}`).toBeGreaterThanOrEqual(FAIR_MOMENT);
      }
    }
  });

  it('every level still lands: no bot from Normal up fails to hit a standing player within 4 s', { timeout: 120_000 }, () => {
    for (const level of ['normal', 'hard', 'pro'] as const) {
      for (const dist of [5, 10]) {
        for (let seed = 1; seed <= SEEDS; seed++) expect(firstHit(level, dist, seed, 4), `${level} ${dist} m seed ${seed}`).toBeLessThan(4);
      }
    }
  });
});
