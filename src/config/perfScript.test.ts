import { beforeAll, describe, expect, it } from 'vitest';
import { setUpRun } from '../ai/extractionRunSupport';
import { fillScriptedCommand } from '../input/scriptedInput';
import { initPhysics } from '../physics/physicsWorld';
import { SIM_DT } from './sim';
import { PERF_SCRIPT, PERF_SCRIPT_EXTRACTION, perfScriptFor } from './perfScript';

describe('the perf harness scripts (M64, audit UI-05)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays PERF_SCRIPT in Elimination and its own script in Extraction', () => {
    expect(perfScriptFor('elimination')).toBe(PERF_SCRIPT);
    expect(perfScriptFor('extraction')).toBe(PERF_SCRIPT_EXTRACTION);
    expect(PERF_SCRIPT.some((step) => step.use)).toBe(false);
  });

  it('keeps the Extraction script in order and joins PERF_SCRIPT where it leaves off', () => {
    const ticks = PERF_SCRIPT_EXTRACTION.map((step) => step.fromTick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(new Set(ticks).size).toBe(ticks.length);
    const tail = PERF_SCRIPT_EXTRACTION.filter((step) => step.fromTick >= 1080);
    expect(tail).toEqual(PERF_SCRIPT.filter((step) => step.fromTick >= 1080));
  });

  it('opens a case on Depot at seed 1 before the script rejoins PERF_SCRIPT', () => {
    const r = setUpRun({ seed: 1 });
    const run = r.state.round.run;
    let yaw = r.you.yaw;
    for (let tick = 0; tick < 1080; tick++) {
      yaw = fillScriptedCommand(PERF_SCRIPT_EXTRACTION, tick, yaw, SIM_DT, r.yours);
      r.play(SIM_DT);
    }
    expect(run.cases.filter((k) => k.open).map((k) => k.kind)).toEqual(['ammo-can']);
    r.dispose();
  });
});
