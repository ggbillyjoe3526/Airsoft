import { describe, expect, it } from 'vitest';
import { BOTS, botConfig } from '../config/bots';
import { createCommand } from '../sim/commands';
import { vec3, wrapAngle } from '../sim/vec';
import { aimBot } from './botCombat';
import { eyeOf } from './perception';
import { duel, noWalls } from './testSupport';

/**
 * M72 QA: a guard leaning out at its post sweeps its view only away from the lean's side (the lean follows the look,
 * so turning towards the side swings the leaned eye back behind the cover). Lean +1 is the right, and a turn to the
 * left is a positive yaw, so +1 sweeps to yaw >= the post's and -1 to yaw <= it; no lean sweeps both ways as before.
 */
const DEG = Math.PI / 180;
const DT = 1 / 60;
const POST_YAW = 0.7;

/** A guard holding its post facing POST_YAW with `lean`; returns the aim's offset (rad) from the post at each `phase` of the sweep period. */
function offsets(lean: number, phases: readonly number[], level: 'normal' | 'pro' = 'normal'): number[] {
  const { bot, bots, player } = duel(12, () => {}, noWalls);
  const b = bots.bots[0]!;
  (b as { skill: unknown }).skill = botConfig(level);
  const w = bots.worldForTests;
  player.position.x = 30;
  player.position.z = 30;
  b.role = 'guard';
  b.postYaw = POST_YAW;
  b.holdLean = lean;
  b.holding = true;
  const eye = vec3();
  const cmd = createCommand();
  return phases.map((phase) => {
    b.teamWait = phase * BOTS.holdSweepPeriod;
    // Long enough for the aim to settle on its target.
    for (let i = 0; i < 2 / DT; i++) {
      eyeOf(bot, w.body, w.hits, eye);
      aimBot(b, w, undefined, eye, vec3(), false, cmd, DT);
    }
    return wrapAngle(b.aim.yaw - POST_YAW);
  });
}

const PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
const EDGE = BOTS.holdSweepDeg * DEG * 0.8;

describe('M72 QA: the hold sweep of a guard leaning out', () => {
  it('sweeps to the left only, never back past the post to the right, when leaning right (+1)', () => {
    const o = offsets(1, PHASES);
    for (const [i, d] of o.entries()) expect(d, `phase ${PHASES[i]}`).toBeGreaterThanOrEqual(-1 * DEG);
    // And it does sweep: both peaks of the sine (a quarter and three quarters round) go the full way, the same side.
    expect(o[2]!).toBeGreaterThan(EDGE);
    expect(o[6]!).toBeGreaterThan(EDGE);
  });

  it('sweeps to the right only when leaning left (-1)', () => {
    const o = offsets(-1, PHASES);
    for (const [i, d] of o.entries()) expect(d, `phase ${PHASES[i]}`).toBeLessThanOrEqual(1 * DEG);
    expect(o[2]!).toBeLessThan(-EDGE);
    expect(o[6]!).toBeLessThan(-EDGE);
  });

  it('sweeps both ways, as before, with no lean', () => {
    const o = offsets(0, PHASES);
    expect(o[2]!, 'a quarter round').toBeGreaterThan(EDGE);
    expect(o[6]!, 'three quarters round').toBeLessThan(-EDGE);
    expect(Math.abs(o[0]!), 'the start is straight ahead').toBeLessThan(1 * DEG);
  });

  it('keeps the same reach as the plain sweep, only on one side', () => {
    const plain = offsets(0, [0.25])[0]!;
    expect(offsets(1, [0.25])[0]!).toBeCloseTo(plain, 1);
    expect(offsets(-1, [0.25])[0]!).toBeCloseTo(-plain, 1);
  });
});
