import { describe, expect, it } from 'vitest';
import { BOT_LOADOUTS, RANDOM_LOADOUT } from '../config/bots';
import { AEG, CYBER_PISTOL, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { createRng } from '../sim/rng';
import { respawnCharacter } from '../sim/character';
import { botKitSeed, carriedLoadout, chaseCarrier, chaseReady, kittedCharacter, randomFit, randomKit } from './botKit';
import { GAME_POOL } from './gamePool';
import { EMPTY_FIT, FIT_CATEGORY, FIT_SLOTS, kitReplica } from './kit';
import { assetOfReplica, fits } from './pool';

const pool = GAME_POOL;
const aeg = assetOfReplica(pool, AEG)!;
const pistol = assetOfReplica(pool, GAS_PISTOL)!;
const tierIds = pool.tiers.map((t) => t.id);

describe('bot kits (M29b)', () => {
  it('rolls kits only for opponents on Hard; Easy and Normal carry the replicas as they come', () => {
    expect(BOT_LOADOUTS).toEqual({ easy: 'factory', normal: 'factory', hard: 'random' });
  });

  it('rolls the same kit for the same match seed and bot, and different kits for different bots', () => {
    const a = randomKit(pool, LOADOUT, botKitSeed(7, 3));
    expect(randomKit(pool, LOADOUT, botKitSeed(7, 3))).toEqual(a);
    const others = [4, 5, 6].map((id) => JSON.stringify(randomKit(pool, LOADOUT, botKitSeed(7, id))));
    expect(new Set([JSON.stringify(a), ...others]).size).toBeGreaterThan(1);
    expect(botKitSeed(7, 3)).not.toBe(botKitSeed(8, 3));
  });

  it('fits only parts that fit, at a pool tier, and always a power source', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const replica of [aeg, pistol]) {
        const fit = randomFit(pool, replica, createRng(seed));
        expect(fit.power, `seed ${seed}`).not.toBeNull();
        for (const slot of FIT_SLOTS) {
          const ref = fit[slot];
          if (!ref) continue;
          const part = pool.byId.get(ref.asset)!;
          expect(part.category).toBe(FIT_CATEGORY[slot]);
          expect(fits(part, replica), `${part.name} on ${replica.name}`).toBe(true);
          expect(tierIds).toContain(ref.tier);
        }
        if (replica === pistol) expect(fit.barrel).toBeNull();
      }
    }
  });

  it('fills every slot that has a part at a part chance of 1, and only the power source at 0', () => {
    for (const replica of [aeg, pistol]) {
      const full = randomFit(pool, replica, createRng(1), 1);
      for (const slot of FIT_SLOTS) {
        const any = pool.assets.some((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
        expect(full[slot] !== null, `${replica.name} ${slot}`).toBe(any);
      }
    }
    const bare = randomFit(pool, aeg, createRng(1), 0);
    expect(FIT_SLOTS.filter((s) => bare[s] !== null)).toEqual(['power']);
  });

  it('draws tiers by the Armory odds: over many rolls Common is the most common and every tier turns up', () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 2000; seed++) {
      const kit = randomKit(pool, [AEG], seed);
      const name = kit[0]!.replica.name;
      expect(name).toBe('AEG Rifle');
      const fit = randomFit(pool, aeg, createRng(seed));
      for (const slot of FIT_SLOTS) if (fit[slot]) counts.set(fit[slot]!.tier, (counts.get(fit[slot]!.tier) ?? 0) + 1);
    }
    const common = counts.get(tierIds[0]!)!;
    for (const id of tierIds) expect(counts.get(id) ?? 0, id).toBeGreaterThan(0);
    for (const id of tierIds.slice(1)) expect(common).toBeGreaterThan(counts.get(id)!);
  });

  it('keeps every rolled replica within its site limit and its factory BB weight and hop-up', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const slot of randomKit(pool, LOADOUT, seed)) {
        expect(slot.replica.muzzleEnergy).toBeLessThanOrEqual(slot.replica.energyLimit + 1e-9);
        const base = LOADOUT.find((r) => r.id === slot.replica.id)!;
        expect(slot.replica.bbWeight).toBe(base.bbWeight);
        expect(slot.replica.hopUpDial).toBe(base.hopUpDial);
      }
    }
  });

  it("arms a bot with its kit's replicas, optics and parts, and keeps them through a respawn", () => {
    const kit = randomKit(pool, LOADOUT, 1, 1);
    const bot = kittedCharacter(4, 1, kit);
    expect(bot.team).toBe(1);
    expect(bot.armament.replicas).toEqual(kit.map((s) => s.replica));
    expect(bot.armament.optics).toEqual(kit.map((s) => s.optic));
    const fitted = () => bot.armament.parts.map((p) => [p.grip, p.magazine, p.laser ?? null, p.barrel ?? null, p.muzzle ?? null]);
    const expected = kit.map((s) => [s.parts.grip, s.parts.magazine, s.parts.laser ?? null, s.parts.barrel ?? null, s.parts.muzzle ?? null]);
    expect(fitted()).toEqual(expected);
    respawnCharacter(bot);
    expect(fitted()).toEqual(expected);
    expect(bot.armament.replicas).toEqual(kit.map((s) => s.replica));
  });
});

describe('M32 acceptance 4 and 6: bots and the Cyber Pistol', () => {
  const CYBER = '000019';
  const cyberAsset = pool.byId.get(CYBER)!;
  const legendary = kitReplica(pool, { asset: CYBER, tier: 'legendary' }, EMPTY_FIT);
  const opponents = [3, 4, 5];
  const carriers = (owned: readonly string[], seeds: number, ids: readonly number[] = opponents) => {
    const out: ({ id: number } | null)[] = [];
    for (let seed = 1; seed <= seeds; seed++) out.push(chaseCarrier(pool, owned, seed, ids));
    return out;
  };

  it('gives a match a carrier on 5 % of seeds (0.05 in the bot config), and never without a chase replica owned', () => {
    expect(RANDOM_LOADOUT.chaseChance).toBe(0.05);
    const some = carriers([CYBER], 4000).filter((c) => c !== null);
    expect(some.length).toBeGreaterThan(140);
    expect(some.length).toBeLessThan(260);
    // The player does not own it, owns only ordinary replicas, or the id is no asset at all: nobody carries one.
    expect(carriers([], 500).every((c) => c === null)).toBe(true);
    expect(carriers([aeg.id, pistol.id], 500).every((c) => c === null)).toBe(true);
    expect(carriers(['999999'], 500).every((c) => c === null)).toBe(true);
  });

  it('has no carrier with no opponents, and a carrier is always one of the opponents', () => {
    expect(carriers([CYBER], 500, []).every((c) => c === null)).toBe(true);
    const seen = new Set<number>();
    for (const c of carriers([CYBER], 4000)) if (c) seen.add(c.id);
    expect([...seen].sort()).toEqual(opponents);
    for (const c of carriers([CYBER], 2000, [7])) expect(c === null || c.id === 7).toBe(true);
  });

  it('picks the same carrier for the same match seed, and follows the chance it is given', () => {
    for (let seed = 1; seed <= 300; seed++) expect(chaseCarrier(pool, [CYBER], seed, opponents)).toEqual(chaseCarrier(pool, [CYBER], seed, opponents));
    for (let seed = 1; seed <= 50; seed++) {
      expect(chaseCarrier(pool, [CYBER], seed, opponents, 1)).not.toBeNull();
      expect(chaseCarrier(pool, [CYBER], seed, opponents, 0)).toBeNull();
    }
  });

  it("carries the Cyber Pistol in the carrier's primary slot, keeping its secondary, and nobody else's loadout changes", () => {
    const carrier = chaseCarrier(pool, [CYBER], 1, opponents, 1)!;
    expect(carrier.replica.id).toBe(CYBER_PISTOL.id);
    const loadout = carriedLoadout(LOADOUT, carrier.id, carrier);
    expect(loadout.map((r) => r.id)).toEqual([CYBER_PISTOL.id, GAS_PISTOL.id]);
    const other = opponents.find((o) => o !== carrier.id)!;
    expect(carriedLoadout(LOADOUT, other, carrier)).toBe(LOADOUT);
    expect(carriedLoadout(LOADOUT, carrier.id, null)).toBe(LOADOUT);
  });

  it('rolls the carrier a Legendary Cyber Pistol with nothing fitted, every time, and the secondary as usual', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const carrier = chaseCarrier(pool, [CYBER], seed, opponents, 1)!;
      const kit = randomKit(pool, carriedLoadout(LOADOUT, carrier.id, carrier), botKitSeed(seed, carrier.id));
      expect(kit.map((s) => s.replica.id), `seed ${seed}`).toEqual(['cyber', 'pistol']);
      expect(kit[0]!.replica).toEqual(legendary);
      expect(kit[0]!.replica.muzzleEnergy).toBeCloseTo(1.0, 2);
      expect(kit[0]!.optic).toBeNull();
      expect(kit[0]!.parts.grip).toBe('none');
      expect(kit[0]!.parts.laser).toBeNull();
      expect(kit[0]!.parts.barrel).toBeNull();
      expect(kit[0]!.parts.muzzle).toBeNull();
    }
    // Nothing fits it, so a full roll of parts is still nothing.
    const fit = randomFit(pool, cyberAsset, createRng(1), 1);
    for (const slot of FIT_SLOTS) expect(fit[slot], slot).toBeNull();
  });

  it("puts the carrier's Cyber Pistol on full auto and leaves its secondary and every other bot as they are", () => {
    const carrier = chaseCarrier(pool, [CYBER], 1, opponents, 1)!;
    const build = (id: number) => kittedCharacter(id, 1, randomKit(pool, carriedLoadout(LOADOUT, id, carrier), botKitSeed(1, id)));
    const bot = chaseReady(build(carrier.id), carrier);
    expect(bot.armament.replicas[0]!.id).toBe('cyber');
    expect(bot.armament.modes).toEqual(['auto', GAS_PISTOL.defaultFireMode]);
    // Without the call it is on its semi default: the bots' held bursts would fire once.
    expect(build(carrier.id).armament.modes[0]).toBe('semi');
    const other = opponents.find((o) => o !== carrier.id)!;
    expect(chaseReady(build(other), carrier).armament.modes).toEqual([AEG.defaultFireMode, GAS_PISTOL.defaultFireMode]);
    expect(chaseReady(build(carrier.id), null).armament.modes[0]).toBe('semi');
    // A carrier replica that has no auto mode is left alone.
    const semiOnly = { id: carrier.id, replica: { ...CYBER_PISTOL, fireModes: ['semi' as const] } };
    expect(chaseReady(build(carrier.id), semiOnly).armament.modes[0]).toBe('semi');
  });

  it('rolls the Cyber Pistol at Legendary only, whatever the odds, wherever a bot kit draws it', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const [slot] = randomKit(pool, [CYBER_PISTOL], seed);
      expect(slot!.replica, `seed ${seed}`).toEqual(legendary);
    }
  });
});
