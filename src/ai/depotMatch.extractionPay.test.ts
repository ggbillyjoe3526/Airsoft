import { beforeAll, describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { newCollection } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { haulTotals, runHaul } from '../sim/extraction';
import { emptyRecords, resultKey } from '../stats/records';
import { settleMatch } from '../stats/settleMatch';
import { setUpRun } from './extractionRunSupport';

/**
 * M47: a real headless run (extractionRunSupport.ts) settled the way MatchSession does it. MatchSession itself needs a
 * Renderer and a page, so the run's pieces (runHaul, haulTotals, the clock) are read the way takeMatchResult and
 * takeOutcome read them, and the settle is the real one.
 */
describe('an Extraction run, settled (M47)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('pays the locker’s FC and your hits and records the extraction with its time, once you are out with it', () => {
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
    r.play(r.run.rules.extractTime + 1);
    expect(r.state.round.reason).toBe('extracted');

    const haul = runHaul(run);
    const totals = haulTotals(haul);
    expect(haul.length).toBeGreaterThan(0);
    const seconds = DEPOT.extraction!.runTime - r.state.round.clock;
    const finds = haul.filter((f) => f.fc > 0 || f.item).length;
    const records = emptyRecords();
    const collection = newCollection(GAME_POOL, 1);
    const fc = collection.fc;
    const settled = settleMatch(
      records,
      collection,
      { difficulty: 'normal', mode: 'extraction', won: true, hits: 2, bbsFired: 0, run: { haulFc: totals.fc, finds, seconds } },
      { extraction: true, won: true, roundsWon: 1, hits: 2, winsNeeded: 1, difficulty: 'normal', haul: totals },
      GAME_POOL.economy,
      false,
    );
    expect(finds).toBeGreaterThan(0);
    expect(seconds).toBeGreaterThan(0);
    expect(collection.fc).toBe(fc + Math.round(settled.pay!.total));
    expect(settled.pay!.total).toBe(totals.fc + 2 * GAME_POOL.economy.earn.hit);
    expect(records.results[resultKey('normal', 'extraction')]).toEqual({ wins: 1, losses: 0 });
    expect(records.fastestExtraction).toBe(seconds);
    expect(records.extractionStreak).toBe(1);
    r.dispose();
  });

  it('carries nothing out of a run you are put out of, so it pays hits only and keeps no haul', () => {
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
    expect(haulTotals(runHaul(run))).toEqual({ fc: 0, items: [] });
    const records = emptyRecords();
    const collection = newCollection(GAME_POOL, 1);
    const settled = settleMatch(
      records,
      collection,
      { difficulty: 'normal', mode: 'extraction', won: false, hits: 1, bbsFired: 0, run: { haulFc: 0, finds: 0, seconds: DEPOT.extraction!.runTime - r.state.round.clock } },
      { extraction: true, won: false, roundsWon: 0, hits: 1, winsNeeded: 1, difficulty: 'normal' },
      GAME_POOL.economy,
      false,
    );
    expect(settled.pay!.total).toBe(GAME_POOL.economy.earn.hit);
    expect(settled.haul).toBeNull();
    expect(records).toMatchObject({ bestHaul: null, fastestExtraction: null, extractionStreak: 0 });
    r.dispose();
  });
});
