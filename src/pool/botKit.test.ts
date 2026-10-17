import { describe, expect, it } from 'vitest';
import kitsText from '../../data/bot-kits.md?raw';
import { DIFFICULTIES } from '../config/bots';
import { AEG, CYBER_PISTOL, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { shotHeardScale } from '../sim/armament';
import { createCharacter, respawnCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { type BotKit, botKitSeed, botKitSlots, kitAssets, kittedBot, kitsMayHoldDev, pickBotKit, readBotKits } from './botKit';
import { contentPool } from './contentPool';
import { GAME_POOL } from './gamePool';
import { withTags } from './testSupport';

const pool = GAME_POOL;
const shipped = readBotKits(kitsText, pool);
const kit = (name: string): BotKit => shipped.kits.find((k) => k.name === name)!;
const id = (name: string): string => pool.assets.find((a) => a.name === name)!.id;

describe('a bot carrying its kit (BG1)', () => {
  it('carries the Factory kit as the replicas come: the same numbers as a teammate on LOADOUT', () => {
    const bot = kittedBot(4, 1, pool, kit('Factory'));
    const teammate = createCharacter(1, vec3(), 0, LOADOUT, 0);
    expect(bot.armament.replicas.map((r) => r.id)).toEqual(LOADOUT.map((r) => r.id));
    for (const [i, r] of bot.armament.replicas.entries()) {
      const base = teammate.armament.replicas[i]!;
      for (const stat of ['muzzleEnergy', 'spreadDeg', 'fireRate', 'reloadTime', 'drawTime', 'recoilDeg', 'magSize'] as const) expect(r[stat], `${r.name} ${stat}`).toBeCloseTo(base[stat], 9);
    }
    expect(bot.armament.optics).toEqual([null, null]);
    expect(bot.armament.parts.map((p) => [p.grip, p.magazine, p.laser ?? null, p.barrel ?? null, p.muzzle ?? null])).toEqual(teammate.armament.parts.map((p) => [p.grip, p.magazine, p.laser ?? null, p.barrel ?? null, p.muzzle ?? null]));
  });

  it("fits each part on the replica it is listed for: the Marksman's scope, barrel and grip on the rifle, its laser on the pistol", () => {
    const [rifle, pistol] = botKitSlots(pool, kit('Marksman'));
    expect(rifle!.replica.id).toBe(AEG.id);
    expect(rifle!.optic).toBe('scope2x');
    expect(rifle!.parts).toMatchObject({ grip: 'vertical', barrel: 'tightBore', laser: null, muzzle: null, magazine: AEG.magazines[0] });
    expect(rifle!.replica.spreadDeg).toBeLessThan(AEG.spreadDeg);
    expect(pistol!.replica.id).toBe(GAS_PISTOL.id);
    expect(pistol!.optic).toBeNull();
    expect(pistol!.parts.laser).toBe('redLaser');
  });

  it("works each kit's magazines and power sources into its replicas: Support's hi-cap and LiPo, Pointman's red gas", () => {
    const support = kittedBot(4, 1, pool, kit('Support'));
    expect(support.armament.parts[0]!.magazine).toBe('hiCap');
    expect(support.armament.replicas[0]!.fireRate).toBeGreaterThan(AEG.fireRate);
    expect(support.armament.parts[1]!.magazine).toBe('extended');
    const pointman = kittedBot(4, 1, pool, kit('Pointman'));
    expect(pointman.armament.replicas[1]!.muzzleEnergy).toBeGreaterThan(GAS_PISTOL.muzzleEnergy);
    expect(pointman.armament.parts[0]!.grip).toBe('angled');
  });

  it("silences the Stealth kit's shots on both replicas, so they are heard nearer", () => {
    const bot = kittedBot(4, 1, pool, kit('Stealth'));
    expect(bot.armament.parts.map((p) => p.muzzle)).toEqual(['silencer', 'silencer']);
    expect(shotHeardScale(bot)).toBeLessThan(1);
    expect(shotHeardScale(kittedBot(4, 1, pool, kit('Factory')))).toBe(1);
  });

  it('carries the Cyber Pistol as its primary on full auto (bots fire held bursts), the GBB Pistol as its sidearm', () => {
    const bot = kittedBot(4, 1, pool, kit('Cyber'));
    expect(bot.armament.replicas.map((r) => r.id)).toEqual([CYBER_PISTOL.id, GAS_PISTOL.id]);
    expect(CYBER_PISTOL.defaultFireMode).toBe('semi');
    expect(bot.armament.modes[0]).toBe('auto');
    expect(bot.armament.parts[1]!.laser).toBe('redLaser');
  });

  it('keeps every shipped kit under each replica\'s site limit, its BB weight and hop-up as it comes', () => {
    for (const k of shipped.kits) {
      const bot = kittedBot(4, 1, pool, k);
      expect(bot.armament.replicas.length, k.name).toBe(k.slots.length);
      for (const r of bot.armament.replicas) {
        const base = [...LOADOUT, CYBER_PISTOL].find((b) => b.id === r.id)!;
        expect(r.muzzleEnergy, `${k.name} ${r.name}`).toBeLessThanOrEqual(r.energyLimit + 1e-9);
        expect(r.bbWeight).toBe(base.bbWeight);
        expect(r.hopUpDial).toBe(base.hopUpDial);
      }
    }
  });

  it('keeps its kit through a respawn', () => {
    const bot = kittedBot(4, 1, pool, kit('Marksman'));
    const fitted = () => [bot.armament.optics.slice(), bot.armament.parts.map((p) => [p.grip, p.magazine, p.laser ?? null, p.barrel ?? null, p.muzzle ?? null])];
    const before = fitted();
    const replicas = bot.armament.replicas.slice();
    respawnCharacter(bot);
    expect(fitted()).toEqual(before);
    expect(bot.armament.replicas).toEqual(replicas);
  });

  it('carries the primary alone when a kit has no secondary', () => {
    const lone: BotKit = { name: 'Lone', slots: [{ replica: id('AEG Rifle'), parts: [id('Red Dot')] }], suits: [], weights: { easy: 1, normal: 1, hard: 1, pro: 1 } };
    const bot = kittedBot(4, 1, pool, lone);
    expect(bot.armament.replicas.map((r) => r.id)).toEqual([AEG.id]);
    expect(bot.armament.optics).toEqual(['redDot']);
  });
});

describe('each bot its own kit (BG1)', () => {
  it('gives the bots of one match different kits, and the same bot the same kit in a replay', () => {
    for (const d of DIFFICULTIES) {
      const picks = [3, 4, 5, 6, 7, 8].map((bot) => pickBotKit(shipped, d.id, pool, botKitSeed(9, bot))?.name);
      expect(new Set(picks).size, d.label).toBeGreaterThan(1);
      expect([3, 4, 5, 6, 7, 8].map((bot) => pickBotKit(shipped, d.id, pool, botKitSeed(9, bot))?.name)).toEqual(picks);
    }
    expect(botKitSeed(7, 3)).not.toBe(botKitSeed(8, 3));
    expect(botKitSeed(7, 3)).not.toBe(botKitSeed(7, 4));
  });
});

describe('kits by personality (BG1, with the bot personalities)', () => {
  it('gives each personality more of the kits that suit it: rushers Pointman, anchors Marksman, flankers Stealth, careful bots Rifleman', () => {
    const share = (personality: string | null, name: string): number => {
      let n = 0;
      for (let bot = 1; bot <= 3000; bot++) if (pickBotKit(shipped, 'hard', pool, botKitSeed(4, bot), personality)?.name === name) n++;
      return n / 3000;
    };
    for (const [personality, name] of [['rusher', 'Pointman'], ['anchor', 'Marksman'], ['flanker', 'Stealth'], ['careful', 'Rifleman']] as const) {
      expect(kit(name).suits, name).toContain(personality);
      expect(share(personality, name), `${personality} ${name}`).toBeGreaterThan(share(null, name) * 1.5);
    }
    // A personality never brings a kit its level doesn't carry: no Easy rusher has the Cyber Pistol.
    for (let bot = 1; bot <= 500; bot++) expect(pickBotKit(shipped, 'easy', pool, botKitSeed(4, bot), 'rusher')?.name).not.toBe('Cyber');
  });
});

describe('whether the bots may carry dev gear (M35, BG1 kitsMayHoldDev)', () => {
  it("is false for the shipped files: the pool's only dev asset is the Weapon Torch, which no kit holds (bots carry it by rule at night)", () => {
    expect(pool.assets.filter((a) => a.tag === 'dev').map((a) => a.name)).toEqual(['Weapon Torch']);
    for (const d of DIFFICULTIES) expect(kitsMayHoldDev(shipped, d.id, pool), d.label).toBe(false);
  });

  it('is true when a kit weighted for the difficulty holds a dev part, power source or replica', () => {
    for (const name of ['Red Dot', 'Vertical Grip', 'Red Laser', 'Hi-Cap Magazine', 'Red Gas', '11.1 V LiPo Battery', 'Silencer', 'GBB Pistol', 'AEG Rifle']) {
      expect(kitsMayHoldDev(shipped, 'pro', withTags(pool, { [name]: 'dev' })), name).toBe(true);
    }
  });

  it('is false at a difficulty that never picks the kit holding it, and for an asset no kit holds', () => {
    const devCyber = withTags(pool, { 'Cyber Pistol': 'dev' });
    expect(kit('Cyber').weights.easy).toBe(0);
    expect(kitsMayHoldDev(shipped, 'easy', devCyber)).toBe(false);
    expect(kitsMayHoldDev(shipped, 'hard', devCyber)).toBe(true);
    expect(shipped.kits.some((k) => kitAssets(k).includes(id('Long Barrel')))).toBe(false);
    for (const d of DIFFICULTIES) expect(kitsMayHoldDev(shipped, d.id, withTags(pool, { 'Long Barrel': 'dev' })), d.label).toBe(false);
  });

  it('agrees with the picks: with Dev content off no bot carries the dev asset, with it on some do', () => {
    const devDot = withTags(pool, { 'Red Dot': 'dev' });
    const dot = id('Red Dot');
    const carried = (devContent: boolean): number => {
      let n = 0;
      for (let bot = 1; bot <= 300; bot++) {
        const k = pickBotKit(shipped, 'hard', contentPool(devDot, devContent), botKitSeed(2, bot));
        if (k && kitAssets(k).includes(dot)) n++;
      }
      return n;
    };
    expect(carried(false)).toBe(0);
    expect(carried(true)).toBeGreaterThan(0);
  });
});
