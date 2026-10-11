import { beforeAll, describe, expect, it } from 'vitest';
import { MATCH_MODES } from '../config/modes';
import { initPhysics } from '../physics/physicsWorld';
import { gameModeContext, hostMaps, type ModePairing, modePairings } from './modeChecks';
import { botsApart, botsCheck, pairingProblems, playsCheck } from './modePlayChecks';

/**
 * The mode checks that play (CT3, level 2's short headless matches): every shipped mode plays every pairing of its
 * compatibility grid on Depot and its bots play it their own way; a map that drops everyone through the floor fails.
 * Kept cheap: SECONDS of each pairing, not MODE_PLAY_TEST.seconds as the content report (`content-check mode:<id>`)
 * plays them.
 */

const SECONDS = 15;
const ctx = gameModeContext();
const depot = ctx.maps.find((m) => m.entry.id === 'depot')!;

/** `mode`'s compatibility grid on Depot. */
const grid = (mode: (typeof MATCH_MODES)[number]['id']): ModePairing[] => modePairings(mode, depot.entry, ctx.defaultRuleset, ctx.fit[mode]!.rulesets);

describe('the mode checks’ short matches', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('Depot hosts every mode, so each is played here', () => {
    for (const mode of MATCH_MODES) expect(hostMaps(ctx, mode.id).map((m) => m.entry.id), mode.id).toContain('depot');
  });

  it.each(MATCH_MODES)('$label plays every pairing of its grid on Depot', { timeout: 300_000 }, (mode) => {
    const pairings = grid(mode.id);
    expect(pairings.map((p) => p.label)).toEqual(expect.arrayContaining(['the standard match', '1v1', 'Hard', expect.stringMatching(/^Custom, /)]));
    const r = playsCheck(mode, depot.entry, depot.data, pairings, 1, SECONDS);
    expect(r.says).not.toMatch(/went wrong/);
    expect(r).toMatchObject({ check: 'mode.plays', verdict: 'pass' });
  });

  it.each(MATCH_MODES)('$label’s bots play it their own way on Depot', { timeout: 300_000 }, (mode) => {
    const r = botsCheck(mode, depot.entry, depot.data);
    expect(r.says).not.toMatch(/play it as Elimination/);
    expect(r).toMatchObject({ check: 'mode.bots', verdict: 'pass' });
  });

  it('finds a mode played as Elimination nothing apart: Elimination against itself', { timeout: 300_000 }, () => {
    expect(botsApart('elimination', depot.data, depot.entry.teamSize.standard, 1, 10)).toBe(0);
  });

  it('fails a map whose floor of last resort is above the floor: everyone falls', { timeout: 300_000 }, () => {
    const sunk = { ...depot.data, killY: 50 };
    const standard = grid('elimination').slice(0, 1);
    expect(pairingProblems('elimination', depot.data, standard[0]!, 1, 5)).toEqual([]);
    expect(pairingProblems('elimination', sunk, standard[0]!, 1, 5).join(' ')).toMatch(/fell through the floor/);
    const r = playsCheck(MATCH_MODES[0]!, depot.entry, sunk, standard, 1, 5);
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain('fell');
  });
});
