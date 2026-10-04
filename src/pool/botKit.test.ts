import { describe, expect, it } from 'vitest';
import { BOT_LOADOUTS } from '../config/bots';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { createRng } from '../sim/rng';
import { respawnCharacter } from '../sim/character';
import { botKitSeed, kittedCharacter, randomFit, randomKit, rolledKit, rolledKitMayHoldDev } from './botKit';
import { contentPool } from './contentPool';
import { strayDevPart, withAssets, withTags } from './testSupport';
import { GAME_POOL } from './gamePool';
import { FIT_CATEGORY, FIT_SLOTS } from './kit';
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

describe('rolled bot kits and dev gear (M35)', () => {
  it('rolls the same kit as randomKit for the same seed, with the replicas and parts it rolled listed as items', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rolled = rolledKit(pool, LOADOUT, seed, 1);
      expect(rolled.kit).toEqual(randomKit(pool, LOADOUT, seed, 1));
      expect(rolledKit(pool, LOADOUT, seed)).toEqual(rolledKit(pool, LOADOUT, seed));
      const replicaItems = rolled.items.filter((r) => pool.byId.get(r.asset)!.category === 'replica');
      expect(replicaItems.map((r) => pool.byId.get(r.asset)!.name).sort()).toEqual(['AEG Rifle', 'Gas Pistol']);
      for (const r of rolled.items) expect(tierIds).toContain(r.tier);
      // At a part chance of 1 every slot a replica has a part for is filled, so the items list the power source and parts.
      expect(rolled.items.length).toBeGreaterThan(LOADOUT.length * 2);
      expect(rolled.items.filter((r) => pool.byId.get(r.asset)!.category === 'power')).toHaveLength(LOADOUT.length);
    }
  });

  it('lists no parts at a part chance of 0 beyond the replica and its power source', () => {
    const { items } = rolledKit(pool, LOADOUT, 3, 0);
    expect(items.map((r) => pool.byId.get(r.asset)!.category).sort()).toEqual(['power', 'power', 'replica', 'replica']);
  });

  it('never rolls a dev part when the bots see contentPool(pool, false), and does roll it from the full pool', () => {
    const devPool = withTags(pool, { 'Red Dot': 'dev', '2x Scope': 'dev', 'Vertical Grip': 'dev', 'Red Laser': 'dev' });
    const devIds = new Set(devPool.assets.filter((a) => a.tag === 'dev').map((a) => a.id));
    const seen = (p: typeof pool): Set<string> => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 150; seed++) for (const r of rolledKit(p, LOADOUT, seed, 1).items) if (devIds.has(r.asset)) out.add(r.asset);
      return out;
    };
    expect(seen(devPool).size).toBeGreaterThan(0);
    const shown = contentPool(devPool, false);
    expect(seen(shown).size).toBe(0);
  });

  it('never rolls a dev replica for a bot either', () => {
    const devPool = withTags(pool, { 'Gas Pistol': 'dev' });
    const shown = contentPool(devPool, false);
    for (let seed = 1; seed <= 30; seed++) {
      const { items } = rolledKit(shown, LOADOUT, seed, 1);
      expect(items.map((r) => r.asset)).not.toContain(devPool.assets.find((a) => a.name === 'Gas Pistol')!.id);
    }
  });
});

describe('whether a rolled kit may hold dev gear (M35 rolledKitMayHoldDev)', () => {
  it('is false for the real pool, whose every asset is public', () => {
    expect(pool.assets.every((a) => a.tag === 'public')).toBe(true);
    expect(rolledKitMayHoldDev(pool, LOADOUT)).toBe(false);
  });

  it('is true when a part that fits a LOADOUT replica is dev, a power source and a muzzle part included', () => {
    for (const name of ['Red Dot', 'Vertical Grip', 'Red Laser', 'Hi-Cap Magazine', 'Red Gas', '11.1 V LiPo Battery']) {
      expect(rolledKitMayHoldDev(withTags(pool, { [name]: 'dev' }), LOADOUT), name).toBe(true);
    }
  });

  it("is true when a LOADOUT replica's own row is dev", () => {
    expect(rolledKitMayHoldDev(withTags(pool, { 'Gas Pistol': 'dev' }), LOADOUT)).toBe(true);
    expect(rolledKitMayHoldDev(withTags(pool, { 'AEG Rifle': 'dev' }), LOADOUT)).toBe(true);
  });

  it('is false when the only dev asset fits no LOADOUT replica', () => {
    const stray = strayDevPart(pool);
    const devPool = withAssets(pool, [stray]);
    expect(devPool.assets.filter((a) => a.tag === 'dev')).toEqual([stray]);
    expect(LOADOUT.every((r) => !fits(stray, assetOfReplica(devPool, r)!))).toBe(true);
    expect(rolledKitMayHoldDev(devPool, LOADOUT)).toBe(false);
  });

  it('only looks at the replicas it is given', () => {
    const devPool = withTags(pool, { 'Red Laser': 'dev' }); // fits the pistol only
    expect(rolledKitMayHoldDev(devPool, [GAS_PISTOL])).toBe(true);
    expect(rolledKitMayHoldDev(devPool, [AEG])).toBe(false);
  });
});
