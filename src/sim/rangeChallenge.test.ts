import { describe, expect, it } from 'vitest';
import { RANGE, RANGE_CHALLENGE } from '../config/range';
import type { GameEvent } from './events';
import { createChallenge, setChallengeOn, stepChallenge } from './rangeChallenge';
import { createRangeTargets, type RangeTarget, stepRangeTargets } from './rangeTargets';
import { createRng } from './rng';
import { vec3 } from './vec';

const DT = 1 / 60;
const PLAYER = 0;

function hit(t: RangeTarget, shooterId = PLAYER): GameEvent {
  return { type: 'targetHit', targetId: t.id, kind: t.kind, shooterId, position: vec3(t.position.x, t.position.y, t.position.z), ricochet: false };
}

function shot(characterId = PLAYER): GameEvent {
  return { type: 'shot', characterId, replicaId: 'aeg', position: vec3(0, 1.5, 0) };
}

/** The range with the challenge on, and a tick that steps the targets then the challenge, as RangeSession does. */
function range(best = 0) {
  const rng = createRng(7);
  const targets = createRangeTargets(undefined, rng);
  const c = createChallenge(best);
  setChallengeOn(c, targets, true, rng);
  const start = targets.find((t) => t.start)!;
  const tick = (events: GameEvent[] = []) => {
    stepRangeTargets(targets, DT, rng);
    stepChallenge(c, targets, events, PLAYER, DT, rng);
  };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) tick();
  };
  return { rng, targets, c, start, tick, run };
}

describe('the timed challenge (M93)', () => {
  it('is off until turned on; off, no START plate stands and nothing lights', () => {
    const rng = createRng(1);
    const targets = createRangeTargets(undefined, rng);
    const c = createChallenge(0);
    expect(c.phase).toBe('off');
    expect(targets.find((t) => t.start)!.hidden).toBe(true);
    stepChallenge(c, targets, [hit(targets[0]!)], PLAYER, DT, rng);
    expect(c.phase).toBe('off');
    expect(targets.every((t) => t.lit === 0)).toBe(true);
  });

  it('on, the START plate stands; your hit on it starts a countdown, someone else\'s does not', () => {
    const { c, start, tick } = range();
    expect(c.phase).toBe('ready');
    expect(start.hidden).toBe(false);
    tick([hit(start, 1)]);
    expect(c.phase).toBe('ready');
    tick([hit(start)]);
    expect(c.phase).toBe('countdown');
    expect(c.cue).toBe('count');
    expect(start.hidden).toBe(true);
  });

  it('counts down a beep a second, then lights targets and runs for its time', () => {
    const { c, start, tick, targets } = range();
    tick([hit(start)]);
    let counts = 1;
    let ticks = 0;
    while (c.phase === 'countdown') {
      tick();
      ticks++;
      if (c.cue === 'count') counts++;
    }
    expect(counts).toBe(RANGE_CHALLENGE.countdown);
    expect(ticks * DT).toBeCloseTo(RANGE_CHALLENGE.countdown, 1);
    expect(c.phase).toBe('running');
    expect(c.cue).toBe('go');
    expect(c.clock).toBe(RANGE_CHALLENGE.runTime);
    expect(targets.filter((t) => t.lit > 0)).toHaveLength(RANGE_CHALLENGE.litAtOnce);
    expect(targets.some((t) => t.start && t.lit > 0)).toBe(false);
  });

  it('scores a lit target you hit and lights another; an unlit one or a miss scores nothing; BBs are counted', () => {
    const { c, start, tick, run, targets } = range();
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + DT);
    expect(c.phase).toBe('running');
    const lit = targets.find((t) => t.lit > 0)!;
    const dark = targets.find((t) => t.lit === 0 && !t.start)!;
    tick([shot(), hit(lit), shot(), hit(dark), shot(1)]);
    expect(c.hits).toBe(1);
    expect(c.shots).toBe(2);
    expect(lit.lit).toBeLessThan(0); // put out, resting
    expect(targets.filter((t) => t.lit > 0)).toHaveLength(RANGE_CHALLENGE.litAtOnce);
  });

  it('a lit target left unhit goes out as a miss', () => {
    const { c, start, tick, run } = range();
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + DT);
    run(RANGE_CHALLENGE.litTime + RANGE_CHALLENGE.litPerMetre * 50 + RANGE.riseTime + 0.1);
    expect(c.missed).toBeGreaterThan(0);
    expect(c.hits).toBe(0);
  });

  it('ends on time: the START plate stands again, nothing stays lit, and a better score becomes the best', () => {
    const { c, start, tick, run, targets } = range(1);
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + DT);
    let ended = false;
    for (let i = 0; i < (RANGE_CHALLENGE.runTime + 1) / DT && !ended; i++) {
      // Hit every lit target as soon as it lights.
      tick(targets.filter((t) => t.lit > 0).map((t) => hit(t)));
      ended = c.cue === 'time';
    }
    expect(ended).toBe(true);
    expect(c.phase).toBe('ready');
    expect(c.last!.hits).toBeGreaterThan(1);
    expect(c.last!.best).toBe(true);
    expect(c.best).toBe(c.last!.hits);
    expect(start.hidden).toBe(false);
    expect(targets.every((t) => t.lit === 0)).toBe(true);
    expect(targets.filter((t) => t.motion === 'popup').every((t) => t.auto)).toBe(true);
  });

  it('a worse run keeps the best', () => {
    const { c, start, tick, run } = range(99);
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + RANGE_CHALLENGE.runTime + 0.5);
    expect(c.last!.best).toBe(false);
    expect(c.best).toBe(99);
  });

  it('turned off mid-run drops the run with no score, and hides the START plate', () => {
    const { c, start, tick, run, targets, rng } = range(5);
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + 1);
    setChallengeOn(c, targets, false, rng);
    expect(c.phase).toBe('off');
    expect(c.best).toBe(5);
    expect(c.last).toBeNull();
    expect(start.hidden).toBe(true);
    expect(targets.every((t) => t.lit === 0)).toBe(true);
  });

  it('plays the same from the same seed', () => {
    const lights = () => {
      const { start, tick, run, targets } = range();
      tick([hit(start)]);
      run(RANGE_CHALLENGE.countdown + 10);
      return targets.map((t) => Math.round(t.lit * 100));
    };
    expect(lights()).toEqual(lights());
  });
});
