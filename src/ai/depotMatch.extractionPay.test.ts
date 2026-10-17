import { beforeAll, describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { GAME_LEVELS } from '../progress/gameLevels';
import { newProgress } from '../progress/progress';
import { haulTotals, runHaul } from '../sim/extraction';
import { emptyRecords, resultKey } from '../stats/records';
import { settleMatch } from '../stats/settleMatch';
import { setUpRun } from './extractionRunSupport';

/**
 * M47: a real headless run (extractionRunSupport.ts) settled the way MatchSession does it. MatchSession itself needs a
 * Renderer and a page, so the run's pieces (runHaul, haulTotals, the clock) are read the way takeMatchResult and
 * takeOutcome read them, and the settle is the real one.
 */
describe('an Extraction run, settled (M47, LV1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('gives the locker’s XP and your hits and records the extraction with its time, once you are out with it', () => {
    const r = setUpRun({ seed: 4 });
    r.play(2);
    const run = r.state.round.run;
    const locker = run.cases.find((k) => k.kind === 'locker')!;
    r.moveYou({ x: locker.position.x + Math.sin(locker.yaw) * -0.9, y: locker.position.y, z: locker.position.z + Math.cos(locker.yaw) * -0.9 });
    r.yours.yaw = r.you.yaw;
    r.yours.use = true;
    r.play(locker.openTime + 0.2);
    expect(locker.open).toBe(true);
    r.yours.use = false;
    r.moveYou(run.exits.find((e) => e.open)!.position);
    r.play(r.run.rules.extractTime + 1, r.clearExit);
    expect(r.state.round.reason).toBe('extracted');

    const haul = runHaul(run);
    const totals = haulTotals(haul);
    expect(haul.length).toBeGreaterThan(0);
    const seconds = DEPOT.extraction!.runTime - r.state.round.clock;
    const finds = haul.filter((f) => f.xp > 0).length;
    const records = emptyRecords();
    const progress = newProgress(GAME_LEVELS);
    const settled = settleMatch(
      records,
      progress,
      GAME_LEVELS,
      { difficulty: 'normal', mode: 'extraction', won: true, hits: 2, bbsFired: 0, run: { haulXp: totals.xp, finds, seconds } },
      { extraction: true, won: true, roundsWon: 1, hits: 2, winsNeeded: 1, difficulty: 'normal', haul: totals },
    );
    expect(finds).toBeGreaterThan(0);
    expect(seconds).toBeGreaterThan(0);
    expect(totals.xp).toBeGreaterThan(0);
    expect(settled.xp!.total).toBe(totals.xp + 2 * GAME_LEVELS.xp.earn.hit);
    expect(progress.xp).toBe(settled.xp!.total);
    expect(settled.levelUp!.to).toBeGreaterThan(0);
    expect(records.bestHaul).toBe(totals.xp);
    expect(records.results[resultKey('normal', 'extraction')]).toEqual({ wins: 1, losses: 0 });
    expect(records.fastestExtraction).toBe(seconds);
    expect(records.extractionStreak).toBe(1);
    r.dispose();
  });

  it('carries nothing out of a run you are put out of, so it gives XP for the hits only and keeps no haul', () => {
    const r = setUpRun({ seed: 4 });
    r.play(2);
    const run = r.state.round.run;
    const locker = run.cases.find((k) => k.kind === 'locker')!;
    r.moveYou({ x: locker.position.x + Math.sin(locker.yaw) * -0.9, y: locker.position.y, z: locker.position.z + Math.cos(locker.yaw) * -0.9 });
    r.yours.yaw = r.you.yaw;
    r.yours.use = true;
    r.play(locker.openTime + 0.2);
    expect(locker.open).toBe(true);
    expect(run.carried.length).toBeGreaterThan(0);
    r.yours.use = false;
    r.hitYou();
    r.play(HITS.callTime + 0.2);
    r.hitYou();
    r.play(HITS.callTime + 0.2);
    expect(r.state.round.reason).toBe('out');
    // What was in the case is not the haul: only a run you got out of has one.
    expect(runHaul(run)).toEqual([]);
    expect(haulTotals(runHaul(run))).toEqual({ xp: 0 });
    const records = emptyRecords();
    const progress = newProgress(GAME_LEVELS);
    const settled = settleMatch(
      records,
      progress,
      GAME_LEVELS,
      { difficulty: 'normal', mode: 'extraction', won: false, hits: 1, bbsFired: 0, run: { haulXp: 0, finds: 0, seconds: DEPOT.extraction!.runTime - r.state.round.clock } },
      { extraction: true, won: false, roundsWon: 0, hits: 1, winsNeeded: 1, difficulty: 'normal' },
    );
    expect(settled.xp!.lines).toEqual([{ label: '1 hit on an opponent', xp: GAME_LEVELS.xp.earn.hit }]);
    expect(progress.xp).toBe(GAME_LEVELS.xp.earn.hit);
    expect(records).toMatchObject({ bestHaul: null, fastestExtraction: null, extractionStreak: 0 });
    r.dispose();
  });
});
