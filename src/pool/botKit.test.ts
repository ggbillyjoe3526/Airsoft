import { describe, expect, it } from 'vitest';
import { BOT_LOADOUTS, BOT_PART_CHANCE, RANDOM_LOADOUT } from '../config/bots';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { createRng } from '../sim/rng';
import { respawnCharacter } from '../sim/character';
import { botKitSeed, kittedCharacter, randomFit, randomKit } from './botKit';
import { GAME_POOL } from './gamePool';
import { FIT_CATEGORY, FIT_SLOTS } from './kit';
import { assetOfReplica, fits } from './pool';

const pool = GAME_POOL;
const aeg = assetOfReplica(pool, AEG)!;
const pistol = assetOfReplica(pool, GAS_PISTOL)!;
const tierIds = pool.tiers.map((t) => t.id);

describe('bot kits (M29b)', () => {
  it('rolls kits only for opponents on Hard and Pro; Easy and Normal carry the replicas as they come', () => {
    expect(BOT_LOADOUTS).toEqual({ easy: 'factory', normal: 'factory', hard: 'random', pro: 'random' });
  });

  it('kits Pro opponents better than Hard ones: more part slots filled (M36)', () => {
    expect(BOT_PART_CHANCE.hard).toBe(RANDOM_LOADOUT.partChance);
    expect(BOT_PART_CHANCE.pro).toBeGreaterThan(BOT_PART_CHANCE.hard);
    const parts = (chance: number) => {
      let n = 0;
      for (let id = 1; id <= 60; id++) for (const k of randomKit(pool, LOADOUT, botKitSeed(11, id), chance)) n += [k.optic, k.parts.laser, k.parts.barrel, k.parts.muzzle].filter((p) => p != null).length;
      return n;
    };
    expect(parts(BOT_PART_CHANCE.pro)).toBeGreaterThan(parts(BOT_PART_CHANCE.hard));
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
