import { describe, expect, it } from 'vitest';
import { standardRulesOf } from '../config/matchRules';
import { AEG, GAS_PISTOL, LOADOUT, REALCAP, type ReplicaConfig, replicaUnderRules } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import type { GameState } from '../sim/state';
import { duel } from './testSupport';

/**
 * M39 QA: a bot on a semi replica (the gas pistol, or any replica under Pro CQB's semi-only rule) squeezes the trigger
 * every other tick during a burst, so a burst is several BBs at the replica's rate; on auto it holds the trigger.
 */
const DT = 1 / 60;

/**
 * A duel whose bot misses (a wild spread, so the standing player is never hit and the fight lasts) with its first
 * replica `replica` on `mode`. Returns the BBs fired per burst, the tick each was fired and the longest run of ticks
 * the trigger stayed down inside a burst.
 */
function fight(replica: ReplicaConfig, mode: 'auto' | 'semi' | null = null, seconds = 8) {
  const wild = { ...replica, spreadDeg: 30 };
  const { state, bots, run } = duel(12, (s: GameState) => {
    s.characters[1]!.armament = createArmament([wild, GAS_PISTOL]);
    if (mode) s.characters[1]!.armament.modes[0] = mode;
  });
  const b = bots.bots[0]!;
  const shotTicks: number[] = [];
  const bursts: number[] = [];
  let inBurst = false;
  let held = 0;
  let longestHold = 0;
  run(seconds, () => {
    if (b.burstLeft > 0 && !inBurst) {
      inBurst = true;
      bursts.push(0);
    } else if (b.burstLeft <= 0) inBurst = false;
    held = inBurst && state.characters[1]!.armament.triggerWasDown ? held + 1 : 0;
    longestHold = Math.max(longestHold, held);
    for (const e of state.events) {
      if (e.type !== 'shot' || e.characterId !== 1) continue;
      shotTicks.push(state.tick);
      if (inBurst) bursts[bursts.length - 1]!++;
    }
  });
  return { state, shotTicks, bursts: bursts.filter((n) => n > 0), longestHold };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, n) => a + n, 0) / xs.length;

describe('bots on semi tap the trigger during a burst (M39 criterion 3)', () => {
  it("fire several BBs per burst on semi, never faster than the replica's own rate", () => {
    const { shotTicks, bursts } = fight(AEG, 'semi');
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    // A trigger held through a burst fires once; tapping fires a string of BBs.
    expect(Math.max(...bursts)).toBeGreaterThanOrEqual(2);
    expect(mean(bursts)).toBeGreaterThan(1.5);
    const gaps = shotTicks.slice(1).map((t, i) => (t - shotTicks[i]!) * DT);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1 / AEG.fireRate - DT); // one tick of slack
  });

  it('release the trigger between pulls: down one tick at a time, never held through a burst', () => {
    const { longestHold, state } = fight(AEG, 'semi');
    expect(longestHold).toBe(1);
    expect(state.characters[1]!.armament.modes[0]).toBe('semi');
  });

  it('hold the trigger on auto, as before: down for a whole burst', () => {
    const { longestHold, bursts } = fight(AEG, 'auto');
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    expect(longestHold).toBeGreaterThan(5);
  });

  it('give the gas pistol (semi by itself) the same tapping', () => {
    const { bursts } = fight(GAS_PISTOL);
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...bursts)).toBeGreaterThanOrEqual(2);
  });
});

describe('Pro CQB on everyone, bots included (M39 criterion 3)', () => {
  const rules = standardRulesOf('proCqb');
  const botLoadout = LOADOUT.map((r) => replicaUnderRules(r, rules));

  it('gives a bot semi-only selectors and realcap magazines of at most 30 BBs, 3 carried', () => {
    const bot = createCharacter(5, vec3(), 0, botLoadout, 1);
    expect(bot.armament.modes).toEqual(['semi', 'semi']);
    expect(bot.armament.replicas.map((r) => r.fireModes)).toEqual([['semi'], ['semi']]);
    expect(bot.armament.handling.map((h) => h.magSize)).toEqual([Math.min(AEG.magSize, REALCAP.magSize), Math.min(GAS_PISTOL.magSize, REALCAP.magSize)]);
    expect(bot.armament.handling.every((h) => h.magSize <= 30)).toBe(true);
    expect(bot.armament.handling.map((h) => h.mags)).toEqual([REALCAP.mags, REALCAP.mags]);
    expect(bot.armament.ammo.map((a) => a.pouch.length + 1)).toEqual([REALCAP.mags, REALCAP.mags]);
    expect(bot.armament.ammo.map((a) => a.mag)).toEqual(bot.armament.handling.map((h) => h.magSize));
  });

  it('keeps a pistol\'s smaller magazine when it is below the cap, and trims a bigger one down to it', () => {
    expect(GAS_PISTOL.magSize).toBeLessThanOrEqual(REALCAP.magSize);
    expect(botLoadout[1]!.magSize).toBe(GAS_PISTOL.magSize);
    const big = replicaUnderRules({ ...AEG, magSize: 120 }, { semiAutoOnly: false, realcap: true });
    expect(big.magSize).toBe(REALCAP.magSize);
  });

  it('plays an AEG held on semi by the rules as a tapper: several BBs per burst', () => {
    const { bursts, state } = fight(replicaUnderRules(AEG, rules));
    expect(state.characters[1]!.armament.modes[0]).toBe('semi'); // the rules' selector, not set by the test
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...bursts)).toBeGreaterThanOrEqual(2);
  });
});
