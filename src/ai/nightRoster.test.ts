import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { lightingChoices, mapUnderLighting, playsAtNight } from '../map/lightingChoice';
import { MAPS, type MapId } from '../map/maps';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { botLight, fitBotLight } from '../pool/botKit';
import { contentPool } from '../pool/contentPool';
import { GAME_POOL } from '../pool/gamePool';
import { type Character, createCharacter } from '../sim/character';
import { lightInHand } from '../sim/torch';
import { vec3 } from '../sim/vec';
import { type BalanceMeasure, type MeasureContext, PRO_BAND, reportTally } from './balance/balanceSupport';
import { type BalanceTally, DT, expectRoundsPlayed, fitNightTorches, playMatch } from './depotMatchSupport';
import { setUpRun } from './extractionRunSupport';

/**
 * M57 QA (audit AI-02): the headless guards' rosters at night are the match build's. The harness fits each bot the very
 * light matchSession.ts spawnRoster fits it (botLight + fitBotLight over the pool the game offers on that map), by the
 * same rule (every bot on a field that plays at night, nobody by day, never you or a hider), and both overrides work
 * both ways. The Pro band is widened for Woodland Attack / Defend alone.
 */

const DATA: Readonly<Record<MapId, MapData>> = { depot: DEPOT, woodland: WOODLAND, neonHeights: NEON_HEIGHTS };

/** What spawnRoster gives bot `id` on `map` (not under the factory kit rule): LOADOUT, the offered light on a night field. */
function asTheGameFits(id: number, team: number, map: MapId): Character {
  const c = createCharacter(id, vec3(), 0, LOADOUT, team);
  // A dev map is picked only with Dev content on (MAPS tag), and the bots roll from what is offered then.
  const pool = contentPool(GAME_POOL, MAPS.find((m) => m.id === map)!.tag === 'dev');
  if (playsAtNight(DATA[map])) fitBotLight(c, pool, botLight(pool));
  return c;
}

/** Every character's parts, replica by replica (the light on each one it fits, not only the one in hand). */
const partsOf = (cs: readonly Character[]) => cs.map((c) => c.armament.parts.map((p) => ({ ...p })));

/** Tick 1 of a playMatch: each character's parts as the match was set up. */
function rosterOf(map: MapData, opts: { hider?: boolean; torches?: boolean } = {}): Character[] {
  let roster: Character[] = [];
  const hider = opts.hider ? map.spawns[1]![0]!.position : undefined;
  playMatch(DT, 1, hider, BOTS, 'elimination', ROUNDS, map, 4, HITS, (state) => {
    if (state.tick === 1) roster = state.characters.map((c) => ({ ...c, armament: { ...c.armament, parts: c.armament.parts.map((p) => ({ ...p })) } }));
  }, undefined, opts.torches);
  return roster;
}

describe('the harness fits the light the match build fits, by its rule (M57 acceptance 1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('fitNightTorches gives a bot the same parts on every replica as spawnRoster on each night map', () => {
    for (const entry of MAPS.filter((m) => playsAtNight(DATA[m.id]))) {
      const ours = createCharacter(5, vec3(), 0, LOADOUT, 1);
      fitNightTorches([ours]);
      const game = asTheGameFits(5, 1, entry.id);
      expect(partsOf([ours]), entry.id).toEqual(partsOf([game]));
      expect(lightInHand(ours), `${entry.id}: a light is fitted at all`).not.toBeNull();
    }
    // Both night maps are night fields, so the check above is not empty.
    expect(MAPS.filter((m) => playsAtNight(DATA[m.id])).map((m) => m.id).sort()).toEqual(['neonHeights', 'woodland']);
  });

  it('the harness default (map.night) is the game\'s night rule (playsAtNight) for every map and every lighting pick', () => {
    for (const entry of MAPS) {
      const map = DATA[entry.id];
      expect(map.night === true, `${entry.id} default`).toBe(playsAtNight(map));
      for (const pick of lightingChoices(map)) expect(mapUnderLighting(map, pick).night === true, `${entry.id} ${pick}`).toBe(playsAtNight(map, pick));
    }
  });

  it('playMatch on Woodland fits all eight bots exactly as spawnRoster would', () => {
    const roster = rosterOf(WOODLAND);
    expect(roster.length).toBe(8);
    expect(partsOf(roster)).toEqual(partsOf(roster.map((c) => asTheGameFits(c.id, c.team, 'woodland'))));
  });

  it('playMatch on Neon Heights fits the bots by Night and none by Day', () => {
    const night = rosterOf(mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(night.filter((c) => lightInHand(c) !== null).length).toBe(8);
    expect(partsOf(night)).toEqual(partsOf(night.map((c) => asTheGameFits(c.id, c.team, 'neonHeights'))));
    const day = rosterOf(mapUnderLighting(NEON_HEIGHTS, 'day'));
    expect(day.filter((c) => c.armament.parts.some((p) => p.light)).length).toBe(0);
  });

  it('a hider (not a bot) is never fitted; the bots hunting it are', () => {
    const roster = rosterOf(WOODLAND, { hider: true });
    const hider = roster.filter((c) => c.team === 0);
    expect(hider.length).toBe(1);
    expect(hider[0]!.armament.parts.every((p) => p.light === null || p.light === undefined), 'the hider carries no light').toBe(true);
    expect(roster.filter((c) => c.team === 1).every((c) => lightInHand(c) !== null), 'every hunting bot').toBe(true);
  });

  it('playMatch: `torches: false` fits nobody at night, `torches: true` every bot by day', () => {
    expect(rosterOf(WOODLAND, { torches: false }).filter((c) => c.armament.parts.some((p) => p.light)).length).toBe(0);
    const day = rosterOf(DEPOT, { torches: true });
    expect(day.length).toBe(8);
    expect(day.every((c) => lightInHand(c) !== null)).toBe(true);
    // By day the game fits none; the override fits the same light the night rule does.
    expect(partsOf(day)).toEqual(partsOf(day.map((c) => asTheGameFits(c.id, c.team, 'woodland'))));
  });

  it('setUpRun: `torches: false` fits nobody at night, `torches: true` every bot by day, and you never by hand', () => {
    const lit = (r: ReturnType<typeof setUpRun>) => r.state.characters.filter((c) => c.armament.parts.some((p) => p.light));
    const dark = setUpRun({ seed: 1, map: WOODLAND, torches: false });
    expect(lit(dark).length).toBe(0);
    dark.dispose();
    const day = setUpRun({ seed: 1, map: DEPOT, torches: true });
    expect(lit(day).length).toBe(day.state.characters.length - 1);
    expect(lit(day).includes(day.you), 'you, playing by hand').toBe(false);
    expect(partsOf(day.state.characters.filter((c) => c !== day.you))).toEqual(partsOf(day.state.characters.filter((c) => c !== day.you).map((c) => asTheGameFits(c.id, c.team, 'woodland'))));
    day.dispose();
    // At night by default, you by hand carry LOADOUT as it comes, on every replica.
    const night = setUpRun({ seed: 2, map: WOODLAND });
    expect(night.you.armament.parts.some((p) => p.light), 'you at night').toBe(false);
    expect(partsOf(night.state.characters.filter((c) => c !== night.you))).toEqual(partsOf(night.state.characters.filter((c) => c !== night.you).map((c) => asTheGameFits(c.id, c.team, 'woodland'))));
    night.dispose();
    // The runner bot (standing in for you) is a bot, and carries one; `torches: false` takes it away too.
    const runner = setUpRun({ seed: 1, map: WOODLAND, runnerBot: true, torches: false });
    expect(lit(runner).length).toBe(0);
    runner.dispose();
  });
});

describe('the Pro band: the plan\'s 40-60 % except Woodland Attack / Defend (M57 acceptance 3; a balance figure since TE4)', () => {
  const ad = (wins: number, rounds = 100): BalanceTally => ({ rounds, decided: rounds, attackerWins: wins, end0Wins: 50, onTime: 0 });
  const elim = (end0: number, decided = 100): BalanceTally => ({ rounds: decided, decided, attackerWins: 50, end0Wins: end0, onTime: 0 });
  /** The figures reportTally hands the balance report for `t`. */
  const figures = (...args: Parameters<typeof reportTally> extends [MeasureContext, ...infer R] ? R : never): BalanceMeasure[] => {
    const ctx = { task: { meta: {} } };
    reportTally(ctx, ...args);
    return (ctx.task.meta as { balance: BalanceMeasure[] }).balance;
  };

  it('PRO_BAND is the plan\'s 40-60 %, the default band of both modes, with under 1 round in 10 on time', () => {
    expect(PRO_BAND).toEqual({ min: 0.4, max: 0.6 });
    const [attackers, onTime] = figures('Depot, Pro, Attack / Defend', ad(45), 'attackDefend');
    expect(attackers).toMatchObject({ value: 0.45, of: 100, band: PRO_BAND });
    expect(attackers!.label).toContain("the attackers' share of rounds");
    expect(onTime).toMatchObject({ value: 0, of: 100, band: { max: 0.1 } });
    const [west] = figures('Depot, Pro, Elimination', elim(55, 80), 'elimination');
    expect(west).toMatchObject({ value: 55 / 80, of: 80, band: PRO_BAND });
    expect(west!.label).toContain("the west end's share of the decided rounds");
  });

  it('a band given replaces both bounds, and the end can be named', () => {
    const band = { min: 0.2, max: 0.6 };
    expect(figures('Woodland, Pro, Attack / Defend', ad(31), 'attackDefend', band)[0]!.band).toEqual(band);
    expect(figures('Woodland, Pro, Elimination', elim(31), 'elimination', band, 'the downhill end')[0]!.label).toContain("the downhill end's share");
    // The on-time band is unchanged by a band.
    expect(figures('Woodland, Pro, Attack / Defend', { ...ad(40), onTime: 10 }, 'attackDefend', band)[1]).toMatchObject({ value: 0.1, band: { max: 0.1 } });
  });

  it('no Pro figure but Woodland Attack / Defend passes a band, and that one keeps the plan\'s ceiling', () => {
    const sources = import.meta.glob<string>('./balance/*Pro*.balance.ts', { query: '?raw', import: 'default', eager: true });
    const calls: { file: string; args: string }[] = [];
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/reportTally\(ctx, '[^']*', tallyBalance\((.*)\);?\s*$/gm)) calls.push({ file, args: m[1]! });
    }
    // Every Pro figure is found: Depot, Neon Heights by Day and by Night, Woodland, each in both modes.
    expect(calls.length).toBe(8);
    // A call without a band ends at its mode; anything after the mode is a band (and Woodland's Elimination names its
    // downhill end after the plan's band).
    const banded = calls.filter((c) => !/'(attackDefend|elimination)'$/.test(c.args) && !c.args.endsWith("PRO_BAND, 'the downhill end'"));
    expect(banded.map((c) => c.file)).toEqual(['./balance/woodlandProFlag.balance.ts']);
    expect(banded[0]!.args).toContain("'attackDefend', WOODLAND,");
    expect(sources['./balance/woodlandProFlag.balance.ts']).toContain('const ATTACKERS: Band = { min: 0.15, max: PRO_BAND.max };');
  });
});

describe('a match guard\'s rounds (TE4: the hard part of the old balance guards)', () => {
  const tally = (rounds: number, onTime: number): BalanceTally => ({ rounds, decided: rounds - onTime, attackerWins: 0, end0Wins: 0, onTime });

  it('passes rounds played with under 1 in 4 on time, whoever wins them', () => {
    expect(() => expectRoundsPlayed(tally(40, 0), 'none on time')).not.toThrow();
    expect(() => expectRoundsPlayed(tally(40, 9), '9 of 40')).not.toThrow();
  });

  it('fails no rounds, or 1 in 4 or more on time (bots that stop finding each other)', () => {
    expect(() => expectRoundsPlayed(tally(0, 0), 'none')).toThrow();
    expect(() => expectRoundsPlayed(tally(40, 10), '10 of 40')).toThrow();
    expect(() => expectRoundsPlayed(tally(82, 38), 'Woodland before M40')).toThrow();
  });
});
