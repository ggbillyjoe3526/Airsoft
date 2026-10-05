import { beforeAll, describe, expect, it } from 'vitest';
import { setUpRun } from '../ai/extractionRunSupport';
import { createCommand } from '../sim/commands';
import { fillScriptedCommand, type ScriptStep, stepAt } from '../input/scriptedInput';
import { initPhysics } from '../physics/physicsWorld';
import { MATCH_MODES } from './modes';
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

describe('which perf runs may press Use (QA, M64 UI-05)', () => {
  const TICKS = 4800; // a little over PERF_SCRIPT's 4500

  /** Every tick the scripted player for `script` holds Use. */
  const useTicks = (script: readonly ScriptStep[]): number[] => {
    const cmd = createCommand();
    const held: number[] = [];
    let yaw = 0;
    for (let tick = 0; tick < TICKS; tick++) {
      yaw = fillScriptedCommand(script, tick, yaw, SIM_DT, cmd);
      if (cmd.use) held.push(tick);
    }
    return held;
  };

  it('never holds Use in any mode but Extraction (Elimination and Attack / Defend play PERF_SCRIPT)', () => {
    for (const { id } of MATCH_MODES) {
      if (id === 'extraction') continue;
      expect(perfScriptFor(id), id).toBe(PERF_SCRIPT);
      expect(useTicks(perfScriptFor(id)), id).toEqual([]);
    }
  });

  it('holds Use in Extraction for one unbroken stretch, which ends before PERF_SCRIPT takes over', () => {
    const held = useTicks(perfScriptFor('extraction'));
    expect(held.length).toBeGreaterThanOrEqual(3 * 60); // the walk's Use is held for 3 s (the ammo can opens in 2)
    expect(held.length).toBeLessThanOrEqual(4 * 60); // and let go once it is open, not held on into the next stretch
    expect(held.at(-1)! - held[0]! + 1).toBe(held.length); // no gap
    expect(held.at(-1)!).toBeLessThan(1080);
  });

  it('plays PERF_SCRIPT\'s commands, tick for tick, from tick 1080 in Extraction, with Use up', () => {
    const base = createCommand();
    const run = createCommand();
    for (let tick = 1080; tick < TICKS; tick++) {
      fillScriptedCommand(PERF_SCRIPT, tick, 0, SIM_DT, base);
      fillScriptedCommand(PERF_SCRIPT_EXTRACTION, tick, 0, SIM_DT, run);
      expect(run, `tick ${tick}`).toEqual(base);
    }
  });

  it('has a first step at tick 0, so Use is not held before the script starts', () => {
    expect(stepAt(PERF_SCRIPT_EXTRACTION, 0)).not.toBeNull();
    const cmd = createCommand();
    cmd.use = true;
    fillScriptedCommand(PERF_SCRIPT_EXTRACTION, 0, 0, SIM_DT, cmd);
    expect(cmd.use).toBe(false);
  });
});
