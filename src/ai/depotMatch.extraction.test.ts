import { beforeAll, describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { haulTotals, regenClear, runHaul } from '../sim/extraction';
import { setUpRun as setUp } from './extractionRunSupport';

/**
 * Extraction on Depot (M43), headless with real physics and bots (extractionRunSupport.ts): you (not a bot: you stand
 * where the test puts you) with two bot teammates against the home team. You're a ghost here (BBs pass through, Dev
 * settings' Ghost) unless a test wants you hit, so the run's own rules decide how it ends.
 */
const setUpRun = (seed: number) => setUp({ seed });

const mates = (cs: readonly Character[]) => cs.filter((c) => c.team === 0 && c.id !== 0);

describe('Extraction on Depot, headless (M43)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps your bot teammates with you, and ends "extracted" once you stand in an open exit for the count', () => {
    for (const seed of [1, 2]) {
      const r = setUpRun(seed);
      let near = 0;
      let ticks = 0;
      r.play(30, () => {
        for (const m of mates(r.state.characters)) {
          if (!isInPlay(m)) continue;
          ticks++;
          if (Math.hypot(m.position.x - r.you.position.x, m.position.z - r.you.position.z) < 8) near++;
        }
      });
      // Following you as long as any of them is still in play (a busy start can put both out of the run).
      if (mates(r.state.characters).some(isInPlay)) expect(r.bots.orderOf(r.you), `seed ${seed}`).toBe('follow');
      expect(near / Math.max(1, ticks), `seed ${seed}: teammates near you`).toBeGreaterThan(0.8);
      const open = r.state.round.run.exits.find((e) => e.open)!;
      r.moveYou(open.position);
      r.play(r.run.rules.extractTime + 2);
      expect(r.state.round.phase, `seed ${seed}`).toBe('matchOver');
      expect(r.state.round.reason, `seed ${seed}`).toBe('extracted');
      r.dispose();
    }
  });

  it('opens the marshal’s locker with the Use key through the simulation, and you extract with what it held (M44)', () => {
    const r = setUpRun(4);
    r.play(2);
    const run = r.state.round.run;
    const at = run.cases.findIndex((k) => k.kind === 'locker');
    const locker = run.cases[at]!;
    // Beside it, facing it.
    r.moveYou({ x: locker.position.x + Math.sin(locker.yaw) * -0.9, y: locker.position.y, z: locker.position.z + Math.cos(locker.yaw) * -0.9 });
    r.yours.yaw = r.you.yaw;
    r.yours.use = true;
    let noise = 0;
    r.play(locker.openTime + 0.2, () => {
      for (const e of r.state.events) if (e.type === 'caseNoise') noise++;
    });
    // Loud all the way (bots hearing it: caseHearing.test.ts).
    expect(noise).toBeGreaterThanOrEqual(Math.floor(locker.openTime));
    expect(locker.open).toBe(true);
    expect(run.carried).toEqual(locker.finds);
    // The locker always holds a part, from Rare up (pool.md).
    expect(['rare', 'veryRare', 'epic', 'legendary']).toContain(locker.finds[0]!.item!.tier);
    r.yours.use = false;
    r.moveYou(run.exits.find((e) => e.open)!.position);
    r.play(r.run.rules.extractTime + 1);
    expect(r.state.round.reason).toBe('extracted');
    expect(haulTotals(runHaul(run)).items).toEqual([locker.finds[0]!.item]);
    r.dispose();
  });

  it('brings you back at the insertion after a hit, and a second hit ends the run "out"', () => {
    const r = setUpRun(3);
    r.play(5);
    r.hitYou();
    r.play(HITS.callTime + 0.2);
    expect(isInPlay(r.you)).toBe(true);
    expect(Math.hypot(r.you.position.x - r.run.insertion[0]!.position.x, r.you.position.z - r.run.insertion[0]!.position.z)).toBeLessThan(3);
    // Your bot teammates follow you again once you're back (the hit dropped the order), and close in.
    r.play(0.2);
    expect(r.bots.orderOf(r.you)).toBe('follow');
    r.play(8);
    for (const m of mates(r.state.characters).filter(isInPlay)) {
      expect(Math.hypot(m.position.x - r.you.position.x, m.position.z - r.you.position.z), `Blue ${m.id + 1}`).toBeLessThan(8);
    }
    r.hitYou();
    r.play(HITS.callTime + 0.2);
    expect(r.state.round.reason).toBe('out');
    r.dispose();
  });

  it('brings hit opponents back in the next wave at regen points out of the squad’s sight, and they come looking (M45)', () => {
    const r = setUpRun(5);
    const home = r.state.characters.filter((c) => c.team === 1);
    const waves = r.run.waves!;
    r.play(3);
    // The cap in play, the reserve waiting.
    expect(home.filter(isInPlay).length).toBe(waves.cap);
    const hitNow = home.filter(isInPlay).slice(0, 2);
    for (const c of hitNow) r.hitThem(c);
    const squad = r.state.characters.filter((c) => c.team === 0);
    const back: { id: number; clear: boolean; at: { x: number; z: number } }[] = [];
    let most = 0;
    r.play(waves.every + 2, () => {
      most = Math.max(most, home.filter(isInPlay).length);
      for (const e of r.state.events) {
        if (e.type !== 'returned') continue;
        const c = r.state.characters[e.characterId]!;
        // Judged at the moment it came back, from where the squad stood then.
        const regen = waves.regens.find((p) => Math.hypot(p.position.x - c.position.x, p.position.z - c.position.z) < 0.01)!;
        back.push({ id: c.id, clear: regenClear(regen, squad, r.run, waves), at: { x: c.position.x, z: c.position.z } });
        // Its bot starts afresh: nothing remembered, on a lane from the point nearest its regen point.
        const bot = r.bots.bots.find((x) => x.character === c)!;
        expect(bot.hasLastKnown).toBe(false);
        const lane = DEPOT.lanes[bot.lane]!;
        const next = lane[bot.laneIndex + bot.laneDir]!;
        for (const p of lane) expect(Math.hypot(next.x - c.position.x, next.z - c.position.z)).toBeLessThanOrEqual(Math.hypot(p.x - c.position.x, p.z - c.position.z));
      }
    });
    // Those hit here are back (and any the squad's bots hit meanwhile).
    for (const c of hitNow) expect(back.map((b) => b.id), `Red ${c.id}`).toContain(c.id);
    expect(back.every((b) => b.clear)).toBe(true);
    expect(most).toBeLessThanOrEqual(waves.cap);
    // Out of the reset, they set off: each is a few metres from where it came back.
    r.play(6);
    for (const b of back) {
      const c = r.state.characters[b.id]!;
      expect(Math.hypot(c.position.x - b.at.x, c.position.z - b.at.z), `Red ${b.id}`).toBeGreaterThan(2);
    }
    r.dispose();
  });
});
