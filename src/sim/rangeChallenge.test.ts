import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { RANGE, RANGE_CHALLENGE, RANGE_VISUALS, targetSpec } from '../config/range';
import type { WorldQuery } from './armament';
import type { GameEvent } from './events';
import { createChallenge, helpChallenge, seesTarget, setChallengeOn, stepChallenge } from './rangeChallenge';
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

  it('a run with Dev help (marked at any point from the START plate on) is never a best, and the next run starts clean (BP5)', () => {
    const { c, start, tick, run, targets } = range(1);
    helpChallenge(c);
    expect(c.helped, 'nothing to mark before a run').toBe(false);
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + 1);
    helpChallenge(c);
    let ended = false;
    for (let i = 0; i < (RANGE_CHALLENGE.runTime + 1) / DT && !ended; i++) {
      tick(targets.filter((t) => t.lit > 0).map((t) => hit(t)));
      ended = c.cue === 'time';
    }
    expect(c.last!.hits).toBeGreaterThan(1);
    expect(c.last!.best).toBe(false);
    expect(c.last!.helped).toBe(true);
    expect(c.best).toBe(1);
    // Shot START again with no help: clean.
    tick([hit(start)]);
    expect(c.helped).toBe(false);
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

  it('pop-ups lying when a run ends, or when it is turned off, lie on: never drawn falling again', () => {
    // Drawn flat (render/match/rangeTargetsRenderer.ts figureTilt): its fall done, its rise not begun.
    const flat = (t: RangeTarget) => t.downFor - t.down >= RANGE_VISUALS.fallTime && t.down >= RANGE.riseTime;
    const popups = (ts: RangeTarget[]) => ts.filter((t) => t.motion === 'popup');
    const { c, start, tick, run, targets, rng } = range();
    expect(popups(targets).every(flat)).toBe(true); // lying from the start, not falling
    tick([hit(start)]);
    run(RANGE_CHALLENGE.countdown + DT);
    let lying = popups(targets).filter((t) => t.down >= RANGE.riseTime && t.lit <= 0);
    expect(lying.length).toBeGreaterThan(0);
    setChallengeOn(c, targets, false, rng);
    expect(lying.every(flat)).toBe(true);
    // And at the end of a run.
    setChallengeOn(c, targets, true, rng);
    tick([hit(start)]);
    while (c.phase !== 'running' || c.clock > 2 * DT) tick();
    lying = popups(targets).filter((t) => t.down >= RANGE.riseTime && t.lit <= 0);
    while (c.phase === 'running') tick();
    expect(c.last).not.toBeNull();
    expect(lying.every(flat)).toBe(true);
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

describe('the timed challenge on a map (M94)', () => {
  /** The range's targets, the challenge on and started, with a sight rule that counts its looks. */
  function sighted(sees: (t: RangeTarget) => boolean) {
    const rng = createRng(7);
    const targets = createRangeTargets(undefined, rng);
    const c = createChallenge(0);
    setChallengeOn(c, targets, true, rng);
    let looks = 0;
    const sight = (t: RangeTarget) => {
      looks++;
      return sees(t);
    };
    const tick = (events: GameEvent[] = []) => {
      stepRangeTargets(targets, DT, rng);
      stepChallenge(c, targets, events, PLAYER, DT, rng, sight);
    };
    tick([hit(targets.find((t) => t.start)!)]);
    for (let i = 0; i < Math.round(RANGE_CHALLENGE.countdown / DT) + 1; i++) tick();
    return { c, targets, tick, looks: () => looks };
  }

  it('lights only targets in your sight', () => {
    const { c, targets, tick } = sighted((t) => t.kind === 'steel');
    expect(c.phase).toBe('running');
    for (let i = 0; i < Math.round(20 / DT); i++) {
      tick();
      for (const t of targets) if (t.lit > 0) expect(t.kind).toBe('steel');
    }
    expect(c.missed).toBeGreaterThan(0); // they did light, and went out unhit
  });

  it('with nothing in sight, lights nothing and looks again only every so often, not every tick', () => {
    const { c, targets, tick, looks } = sighted(() => false);
    const before = looks();
    const ticks = Math.round(2 / DT);
    for (let i = 0; i < ticks; i++) tick();
    expect(c.phase).toBe('running');
    expect(targets.some((t) => t.lit > 0)).toBe(false);
    const perLook = targets.filter((t) => !t.start).length;
    expect(looks() - before).toBeLessThanOrEqual(perLook * Math.ceil(2 / RANGE_CHALLENGE.lookAgain + 1));
  });
});

describe('a lit target\'s time on a map counts its distance from where you stand (KI1)', () => {
  /** The first targets lit as the run starts, by `away` (null: their marked distance, as on the range). */
  function firstLit(away: ((t: RangeTarget) => number) | null): RangeTarget[] {
    const rng = createRng(7);
    const targets = createRangeTargets(undefined, rng);
    const c = createChallenge(0);
    setChallengeOn(c, targets, true, rng);
    const tick = (events: GameEvent[] = []) => {
      stepRangeTargets(targets, DT, rng);
      stepChallenge(c, targets, events, PLAYER, DT, rng, null, away);
    };
    tick([hit(targets.find((t) => t.start)!)]);
    while (c.phase === 'countdown') tick();
    return targets.filter((t) => t.lit > 0);
  }

  it('gives a target beside you only the base time, a far one the flight on top, and the range its marked distance', () => {
    const rise = (t: RangeTarget) => (t.motion === 'popup' && t.down > 0 ? RANGE.riseTime : 0);
    const near = firstLit(() => 0);
    expect(near).toHaveLength(RANGE_CHALLENGE.litAtOnce);
    for (const t of near) expect(t.lit).toBeCloseTo(RANGE_CHALLENGE.litTime + rise(t), 6);
    const far = firstLit(() => 50);
    for (const t of far) expect(t.lit).toBeCloseTo(RANGE_CHALLENGE.litTime + RANGE_CHALLENGE.litPerMetre * 50 + rise(t), 6);
    const range = firstLit(null);
    for (const t of range) expect(t.lit).toBeCloseTo(RANGE_CHALLENGE.litTime + RANGE_CHALLENGE.litPerMetre * t.distance + rise(t), 6);
  });
});

describe('which targets are in your sight (M94)', () => {
  const [plate, figure, crouched] = createRangeTargets([
    targetSpec({ kind: 'steel', x: 0, y: RANGE.plateHeight, z: -20, label: 'Steel', distance: 20 }),
    targetSpec({ kind: 'figure', x: 4, y: 0, z: -20, label: 'Figure', distance: 20 }),
    targetSpec({ kind: 'figure', x: -4, y: 0, z: -20, crouched: true, label: 'Crouched figure', distance: 20 }),
  ]);
  const eye = vec3(0, 1.6, 0);
  const open: WorldQuery = { raycastStatic: () => -1 };

  it('sees a target in the open within reach, not past it', () => {
    for (const t of [plate!, figure!, crouched!]) {
      expect(seesTarget(eye, t, 50, open, HITS)).toBe(true);
      expect(seesTarget(eye, t, 15, open, HITS)).toBe(false);
    }
  });

  it('looks at its middle: a plate’s centre, a figure’s chest, lower when it crouches; a wall in the way hides it', () => {
    const aims: number[] = [];
    const wall: WorldQuery = {
      raycastStatic: (o, d, max) => {
        aims.push(o.y + d.y * max);
        return max / 2;
      },
    };
    for (const t of [plate!, figure!, crouched!]) expect(seesTarget(eye, t, 50, wall, HITS)).toBe(false);
    expect(aims[0]).toBeCloseTo(RANGE.plateHeight, 6);
    expect(aims[1]).toBeCloseTo((HITS.bodyTop + HITS.bodyBottom) / 2, 6);
    expect(aims[2]).toBeCloseTo((HITS.bodyTop + HITS.bodyBottom) / 2 - HITS.crouchDrop, 6);
  });
});
