import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArmament, nextFireMode } from '../sim/armament';
import type { PlayerKit } from '../pool/loadoutModel';
import { loadMatchRules, loadRuleset } from '../ui/menus/savedChoices';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { factoryParts } from './attachments';
import { BOT_GLOW_BBS } from './glowBBs';
import { ROUNDS } from './hits';
import {
  countsForRecords,
  DEFAULT_MATCH_RULES,
  DEFAULT_RULESET,
  kitUnderRules,
  type MatchRules,
  matchRulesSummary,
  offersSwitch,
  recordsKeyOf,
  roundRulesFor,
  RULESETS,
  rulesetOf,
  rulesUnder,
  SKIRMISH_SWITCHES,
  standardMatchText,
  standardRules,
  standardRulesOf,
  WIN_BY_TWO,
} from './matchRules';
import { AEG, GAS_PISTOL, LOADOUT, REALCAP, replicaUnderRules } from './replicas';

function storageWith(fields: Record<string, unknown>): Storage {
  const data = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields })]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: data.size,
  };
}

/** A kit with Armory gear on it: an optic, a hi-cap and an extended magazine, dials and weights off their defaults. */
const ARMORY_KIT: PlayerKit = {
  slots: [
    { replica: { ...AEG, muzzleEnergy: AEG.muzzleEnergy * 1.05 }, optic: 'redDot', parts: { ...factoryParts(AEG), magazine: 'hiCap' } },
    { replica: GAS_PISTOL, optic: null, parts: { ...factoryParts(GAS_PISTOL), magazine: 'extended' } },
  ],
  hopUps: [0.3, 0.4],
  bbWeights: [0.28, 0.2],
  glowBBs: ['always', 'always'],
};

describe('the Rules picker (M39)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers Skirmish (the default), Tournament and Pro CQB (both dev) and Custom, one data entry each', () => {
    expect(RULESETS.map((r) => r.id)).toEqual(['skirmish', 'tournament', 'proCqb', 'custom']);
    expect(DEFAULT_RULESET).toBe('skirmish');
    expect(RULESETS.filter((r) => r.tag === 'dev').map((r) => r.id)).toEqual(['tournament', 'proCqb']);
    expect(RULESETS.map((r) => recordsKeyOf(r.id))).toEqual(['', 'tournament', 'proCqb', null]);
    for (const r of RULESETS) expect(r.blurb.length).toBeGreaterThan(0);
  });

  it('plays Skirmish as the game always did: its standard match is DEFAULT_MATCH_RULES, its records the plain cells', () => {
    expect(standardRulesOf('skirmish')).toEqual(DEFAULT_MATCH_RULES);
    expect(rulesUnder('skirmish', DEFAULT_MATCH_RULES)).toEqual(DEFAULT_MATCH_RULES);
    // Today's Match pop-up picks stand; the new switches stay off whatever Custom saved.
    const picked: MatchRules = { ...DEFAULT_MATCH_RULES, teamSize: 1, winsNeeded: 3, semiAutoOnly: true, heardOnMinimap: false };
    expect(rulesUnder('skirmish', picked)).toEqual({ ...DEFAULT_MATCH_RULES, teamSize: 1, winsNeeded: 3 });
    expect(standardMatchText('skirmish')).toBe(standardMatchText());
    expect(roundRulesFor(DEFAULT_MATCH_RULES)).toMatchObject({ winBy: ROUNDS.winBy, timeOutToMorePlayers: false });
    expect(ROUNDS.winBy).toBe(1);
  });

  it('plays Tournament first to 7 (half-time after 6), win by two, 2:00 rounds, time-outs to more players, teammates only on the minimap, ricochets counting, strict marshal, own kit', () => {
    const t = rulesUnder('tournament', DEFAULT_MATCH_RULES);
    expect(t).toEqual({
      ...DEFAULT_MATCH_RULES,
      winsNeeded: 7,
      roundTime: 120,
      friendlyFire: true,
      ricochetsCount: true,
      winByTwo: true,
      timeOutToMorePlayers: true,
      heardOnMinimap: false,
      semiAutoOnly: false,
      realcap: false,
      factoryKit: false,
      strictMarshal: true,
    });
    expect(roundRulesFor(t)).toMatchObject({ winsNeeded: 7, halfTimeAfter: 6, roundTime: 120, winBy: WIN_BY_TWO, timeOutToMorePlayers: true });
    // Whatever the Match pop-up holds, only the team size is the player's.
    const picked: MatchRules = { ...DEFAULT_MATCH_RULES, winsNeeded: 3, roundTime: 300, teamSize: 2, friendlyFire: false, factoryKit: true, semiAutoOnly: true };
    expect(rulesUnder('tournament', picked)).toEqual({ ...t, teamSize: 2 });
  });

  it('plays Pro CQB as Tournament plus semi only and realcap', () => {
    expect(rulesUnder('proCqb', DEFAULT_MATCH_RULES)).toEqual({ ...rulesUnder('tournament', DEFAULT_MATCH_RULES), semiAutoOnly: true, realcap: true });
  });

  it('leaves every switch to Custom, and offers in the Match pop-up only what the ruleset leaves to you', () => {
    const custom: MatchRules = { ...DEFAULT_MATCH_RULES, winByTwo: true, realcap: true, factoryKit: true };
    expect(rulesUnder('custom', custom)).toEqual(custom);
    const fields = Object.keys(DEFAULT_MATCH_RULES) as (keyof MatchRules)[];
    expect(fields.filter((f) => offersSwitch('custom', f))).toEqual(fields.filter((f) => f !== 'strictMarshal'));
    expect(fields.filter((f) => offersSwitch('skirmish', f))).toEqual(['winsNeeded', 'roundTime', 'teamSize', 'friendlyFire', 'ricochetsCount']);
    expect(fields.filter((f) => offersSwitch('tournament', f))).toEqual(['teamSize']);
    expect(fields.filter((f) => offersSwitch('proCqb', f))).toEqual(['teamSize']);
  });

  it("counts a named ruleset's standard match only, with the usual teammates; Custom never", () => {
    for (const r of ['skirmish', 'tournament', 'proCqb'] as const) {
      const std = standardRulesOf(r);
      expect(standardRules(r, std)).toBe(true);
      for (const d of ['easy', 'normal', 'hard', 'pro'] as const) expect(countsForRecords(std, d, d, r)).toBe(true);
      expect(countsForRecords(std, 'hard', 'easy', r)).toBe(false);
      expect(standardRules(r, { ...std, teamSize: 2 })).toBe(false);
    }
    // Tournament's numbers aren't Skirmish's standard match, nor the other way round.
    expect(standardRules('skirmish', standardRulesOf('tournament'))).toBe(false);
    expect(standardRules('tournament', DEFAULT_MATCH_RULES)).toBe(false);
    for (const rules of [DEFAULT_MATCH_RULES, standardRulesOf('tournament')]) {
      expect(standardRules('custom', rules)).toBe(false);
      expect(countsForRecords(rules, 'normal', 'normal', 'custom')).toBe(false);
    }
    expect(rulesetOf('nonsense' as never).id).toBe('skirmish');
  });

  it('describes its standard match for the notes, and sums up the switches only when they differ from Skirmish', () => {
    expect(standardMatchText('tournament')).toContain('3v3 · first to 7, 2:00 rounds. Friendly fire on; ricochets count. Win by two.');
    expect(matchRulesSummary(DEFAULT_MATCH_RULES).detail).toBe("2:30 rounds. Friendly fire on; ricochets don't count.");
    expect(matchRulesSummary(standardRulesOf('proCqb')).detail).toBe(
      `2:00 rounds. Friendly fire on; ricochets count. Win by two. Time-out: more players left wins. Minimap: teammates only. Semi only. Realcap ${REALCAP.magSize} × ${REALCAP.mags}.`,
    );
  });

  it('saves the ruleset and Custom switches as settings, Skirmish and the switches off until saved', () => {
    vi.stubGlobal('localStorage', storageWith({}));
    expect(loadRuleset()).toBe('skirmish');
    expect(loadMatchRules()).toEqual(DEFAULT_MATCH_RULES);
    vi.stubGlobal(
      'localStorage',
      storageWith({ ruleset: 'proCqb', overtime: 'on', timeOut: 'morePlayers', minimapHeard: 'off', fireModes: 'semi', magazines: 'realcap', matchKit: 'factory' }),
    );
    expect(loadRuleset()).toBe('proCqb');
    expect(loadMatchRules()).toEqual({ ...DEFAULT_MATCH_RULES, winByTwo: true, timeOutToMorePlayers: true, heardOnMinimap: false, semiAutoOnly: true, realcap: true, factoryKit: true });
    vi.stubGlobal('localStorage', storageWith({ ruleset: 'speedsoft', fireModes: 'burst' }));
    expect(loadRuleset()).toBe('skirmish');
    expect(loadMatchRules()).toEqual({ ...DEFAULT_MATCH_RULES, ...SKIRMISH_SWITCHES });
  });
});

describe('replicas and kits under the rules (M39)', () => {
  it('holds every selector on semi, bots and player alike, and the selector then has nowhere to go', () => {
    const semi = replicaUnderRules(AEG, { semiAutoOnly: true, realcap: false });
    expect(semi.fireModes).toEqual(['semi']);
    expect(semi.defaultFireMode).toBe('semi');
    expect(nextFireMode(semi, 'semi')).toBe('semi');
    expect(semi.magSize).toBe(AEG.magSize);
    expect(createArmament([semi]).modes).toEqual(['semi']);
    expect(replicaUnderRules(AEG, { semiAutoOnly: false, realcap: false })).toBe(AEG);
  });

  it('gives realcap magazines: at most 30 BBs (a pistol keeps its smaller one), 3 carried, a hi-cap fitted or not', () => {
    const rules = { ...standardRulesOf('proCqb') };
    const kit = kitUnderRules(ARMORY_KIT, rules);
    expect(kit.slots.map((s) => s.parts.magazine)).toEqual([REALCAP.magazine, REALCAP.magazine]);
    const a = createArmament(kit.slots.map((s) => s.replica), kit.slots.map((s) => s.parts));
    expect(a.handling.map((h) => h.magSize)).toEqual([REALCAP.magSize, Math.min(GAS_PISTOL.magSize, REALCAP.magSize)]);
    expect(a.handling.map((h) => h.mags)).toEqual([REALCAP.mags, REALCAP.mags]);
    expect(a.ammo[0]!.pouch).toHaveLength(REALCAP.mags - 1);
    expect(a.modes).toEqual(['semi', 'semi']);
    // Applying the rules twice changes nothing more.
    expect(kitUnderRules(kit, rules)).toEqual(kit);
  });

  it('keeps your own Armory kit unless the factory kit rule is on, then everyone carries LOADOUT as it comes', () => {
    expect(kitUnderRules(ARMORY_KIT, standardRulesOf('tournament'))).toBe(ARMORY_KIT);
    const factory = kitUnderRules(ARMORY_KIT, { ...DEFAULT_MATCH_RULES, factoryKit: true });
    expect(factory.slots.map((s) => s.replica)).toEqual([...LOADOUT]);
    expect(factory.slots.map((s) => s.optic)).toEqual([null, null]);
    expect(factory.slots.map((s) => s.parts)).toEqual(LOADOUT.map(factoryParts));
    expect(factory.hopUps).toEqual(LOADOUT.map((r) => r.hopUpDial));
    expect(factory.bbWeights).toEqual(LOADOUT.map((r) => r.bbWeight));
    expect(factory.glowBBs).toEqual(LOADOUT.map(() => BOT_GLOW_BBS));
  });
});
