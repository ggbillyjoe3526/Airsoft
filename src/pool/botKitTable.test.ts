import { describe, expect, it } from 'vitest';
import kitsText from '../../data/bot-kits.md?raw';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { BOT_KIT_SUIT_LEAN, DIFFICULTIES, type Difficulty } from '../config/bots';
import { type BotKitTable, botKitSeed, kitsFor, kitWeights, pickBotKit, readBotKits } from './botKit';
import { contentPool } from './contentPool';
import { GAME_POOL } from './gamePool';
import { withTags } from './testSupport';

const pool = GAME_POOL;
const id = (name: string): string => pool.assets.find((a) => a.name === name)!.id;
const HEADER = '| Kit | Primary | Primary parts | Secondary | Secondary parts | Easy | Normal | Hard | Pro |\n|---|---|---|---|---|---|---|---|---|\n';

/** The kits of a table made of `rows` (each a `| … |` line under the shipped header). */
function table(...rows: string[]): BotKitTable {
  return readBotKits(`## Kits\n\n${HEADER}${rows.join('\n')}\n`, pool);
}

/** How often each kit is picked at `difficulty` over `n` bots' seeds (match seed 1, bots 1..n), by name ('' for none). */
function shares(t: BotKitTable, difficulty: Difficulty, n: number, offered = pool): Map<string, number> {
  const counts = new Map<string, number>();
  for (let bot = 1; bot <= n; bot++) {
    const name = pickBotKit(t, difficulty, offered, botKitSeed(1, bot))?.name ?? '';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map([...counts].map(([k, v]) => [k, v / n]));
}

describe('bot-kits.md (BG1)', () => {
  const shipped = readBotKits(kitsText, pool);

  it('reads every row of the shipped file, against the shipped pool', () => {
    expect(shipped.errors).toEqual([]);
    expect(shipped.kits.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every difficulty kits to pick from: Easy mostly factory, more and better gear each level up, Pro never factory', () => {
    const factory = shipped.kits.find((k) => k.slots.every((s) => s.parts.length === 0))!;
    expect(factory).toBeDefined();
    const share = (d: Difficulty) => factory.weights[d] / shipped.kits.reduce((sum, k) => sum + k.weights[d], 0);
    expect(share('easy')).toBeGreaterThanOrEqual(0.5);
    expect(share('normal')).toBeLessThan(share('easy'));
    expect(share('hard')).toBeLessThan(share('normal'));
    expect(share('pro')).toBe(0);
    for (const d of DIFFICULTIES) expect(kitsFor(shipped, d.id, pool).length, d.label).toBeGreaterThan(0);
  });

  it('puts each kit together from pool.md: its replicas primary first, its parts on the replica they are listed for', () => {
    const marksman = shipped.kits.find((k) => k.name === 'Marksman')!;
    expect(marksman.slots.map((s) => s.replica)).toEqual([id('AEG Rifle'), id('GBB Pistol')]);
    expect(marksman.slots[0]!.parts).toContain(id('2x Scope'));
    expect(marksman.slots[1]!.parts).toEqual([id('Red Laser')]);
  });
});

describe('reading bot kits (BG1)', () => {
  it('reads names in any case or IDs, an empty secondary as none and an empty weight as 0', () => {
    const t = table(`| Lone | aeg rifle | red dot, ${id('Vertical Grip')} | | | 1 | | 2.5 | 0 |`);
    expect(t.errors).toEqual([]);
    expect(t.kits[0]).toEqual({ name: 'Lone', slots: [{ replica: id('AEG Rifle'), parts: [id('Red Dot'), id('Vertical Grip')] }], suits: [], weights: { easy: 1, normal: 0, hard: 2.5, pro: 0 } });
  });

  it('leaves out a row it cannot read and says why, with its line', () => {
    const t = table(
      '| Good | AEG Rifle | | GBB Pistol | | 1 | 1 | 1 | 1 |',
      '| Typo | AEG Rifel | | | | 1 | 1 | 1 | 1 |',
      '| Part | GBB Pistol | Red Dot | | | 1 | 1 | 1 | 1 |',
      '| Two | AEG Rifle | Red Dot, 2x Scope | | | 1 | 1 | 1 | 1 |',
      '| Torch | AEG Rifle | Weapon Torch | | | 1 | 1 | 1 | 1 |',
      '| Weight | AEG Rifle | | | | 1 | lots | 1 | 1 |',
      '| Good | AEG Rifle | | | | 1 | 1 | 1 | 1 |',
      '| NoGun | | | GBB Pistol | | 1 | 1 | 1 | 1 |',
      '| Silencer | Red Dot | | | | 1 | 1 | 1 | 1 |',
    );
    expect(t.kits.map((k) => k.name)).toEqual(['Good']);
    expect(t.errors).toEqual([
      'line 6: Primary "AEG Rifel" isn\'t in pool.md',
      'line 7: Primary part "Red Dot" doesn\'t fit the GBB Pistol',
      'line 8: Primary parts "Red Dot" and "2x Scope" both take the optic slot',
      'line 9: Primary part "Weapon Torch": weapon torches are fitted by rule on night fields',
      'line 10: Normal weight "lots" isn\'t a number of 0 or more',
      'line 11: kit "Good" is listed twice',
      'line 12: no Primary',
      'line 13: Primary "Red Dot" isn\'t a replica',
    ]);
  });

  it('reads nothing from a table missing a column, and says which', () => {
    const t = readBotKits('| Kit | Primary | Primary parts | Secondary | Secondary parts | Easy | Normal | Hard |\n|---|---|---|---|---|---|---|---|\n| A | AEG Rifle | | | | 1 | 1 | 1 |\n', pool);
    expect(t.kits).toEqual([]);
    expect(t.errors).toEqual(['line 1: missing: Pro']);
  });
});

describe('picking a bot kit (BG1)', () => {
  const t = table(
    '| Often | AEG Rifle | | GBB Pistol | | 3 | 0 | 1 | 0 |',
    '| Rarely | AEG Rifle | Red Dot | GBB Pistol | | 1 | 0 | 1 | 0 |',
    '| Never | AEG Rifle | 2x Scope | GBB Pistol | | 0 | 0 | 0 | 0 |',
    '| Quiet | AEG Rifle | Silencer | GBB Pistol | | 0 | 0 | 2 | 0 |',
  );

  it('picks the same kit for the same match seed and bot', () => {
    for (let bot = 1; bot <= 20; bot++) expect(pickBotKit(t, 'easy', pool, botKitSeed(5, bot))).toBe(pickBotKit(t, 'easy', pool, botKitSeed(5, bot)));
  });

  it('picks each kit about as often as its weight says, and a kit weighted 0 never', () => {
    const easy = shares(t, 'easy', 4000);
    expect(easy.get('Often')).toBeCloseTo(0.75, 1);
    expect(easy.get('Rarely')).toBeCloseTo(0.25, 1);
    expect(easy.has('Never')).toBe(false);
    const hard = shares(t, 'hard', 4000);
    expect(hard.get('Quiet')).toBeCloseTo(0.5, 1);
  });

  it('carries the replicas as they come (no kit) when no kit is weighted above 0', () => {
    expect(shares(t, 'normal', 50)).toEqual(new Map([['', 1]]));
  });

  it('picks a kit holding dev gear only when the pool offers it (Dev content on)', () => {
    const devScope = withTags(pool, { 'Red Dot': 'dev' });
    expect(shares(t, 'easy', 200, contentPool(devScope, false)).get('Often')).toBe(1);
    expect(shares(t, 'easy', 2000, contentPool(devScope, true)).get('Rarely')).toBeGreaterThan(0.15);
  });
});

describe('kits that suit a personality (BG1, with the bot personalities)', () => {
  const PERSONALITIES = [...BOT_PERSONALITIES.styles.keys()];
  const SUITS_HEADER = '| Kit | Primary | Primary parts | Secondary | Secondary parts | Suits | Easy | Normal | Hard | Pro |\n|---|---|---|---|---|---|---|---|---|---|\n';
  const suited = (...rows: string[]) => readBotKits(`${SUITS_HEADER}${rows.join('\n')}\n`, pool, PERSONALITIES);

  it('reads the shipped Suits against bots.md\'s personalities, each personality suited by some kit', () => {
    expect(PERSONALITIES).toEqual(['rusher', 'anchor', 'flanker', 'careful']);
    const shipped = readBotKits(kitsText, pool, PERSONALITIES);
    expect(shipped.errors).toEqual([]);
    for (const p of PERSONALITIES) expect(shipped.kits.some((k) => k.suits.includes(p)), p).toBe(true);
    expect(shipped.kits.find((k) => k.name === 'Factory')!.suits).toEqual([]);
  });

  it('reads names in any case, once each, and says when one is no personality', () => {
    const t = suited('| A | AEG Rifle | | | | Rusher, rusher ,ANCHOR | 1 | 1 | 1 | 1 |', '| B | AEG Rifle | | | | sniper | 1 | 1 | 1 | 1 |');
    expect(t.kits.map((k) => [k.name, k.suits])).toEqual([['A', ['rusher', 'anchor']]]);
    expect(t.errors).toEqual(['line 4: Suits "sniper" isn\'t a bot personality']);
    // Without a list of personalities any name reads.
    expect(readBotKits(`${SUITS_HEADER}| B | AEG Rifle | | | | sniper | 1 | 1 | 1 | 1 |\n`, pool).kits[0]!.suits).toEqual(['sniper']);
  });

  it('picks a kit that suits the bot BOT_KIT_SUIT_LEAN times as often as the other kits with Suits; a kit without keeps its chance', () => {
    const t = suited(
      '| Fast | AEG Rifle | | | | rusher | 1 | 0 | 1 | 1 |',
      '| Slow | AEG Rifle | Red Dot | | | anchor | 1 | 0 | 1 | 1 |',
      '| Plain | AEG Rifle | | | | | 2 | 0 | 1 | 1 |',
      '| Never | AEG Rifle | 2x Scope | | | rusher | 0 | 0 | 0 | 0 |',
    );
    const shares = (personality: string | null): Map<string, number> => {
      const n = new Map<string, number>();
      for (let bot = 1; bot <= 6000; bot++) {
        const k = pickBotKit(t, 'easy', pool, botKitSeed(3, bot), personality)!.name;
        n.set(k, (n.get(k) ?? 0) + 1 / 6000);
      }
      return n;
    };
    const plain = shares(null);
    expect(plain.get('Fast')).toBeCloseTo(0.25, 1);
    expect(plain.get('Plain')).toBeCloseTo(0.5, 1);
    const rusher = shares('rusher');
    // Fast and Slow keep their half between them, now 3 to 1; Plain keeps its half; Never stays never.
    const fastShare = (BOT_KIT_SUIT_LEAN / (BOT_KIT_SUIT_LEAN + 1)) * 0.5;
    expect(rusher.get('Fast')).toBeCloseTo(fastShare, 1);
    expect(rusher.get('Plain')).toBeCloseTo(0.5, 1);
    expect(rusher.has('Never')).toBe(false);
    expect(kitWeights(t.kits, 'easy', 'rusher')).toEqual([1.5, 0.5, 2, 0]);
    expect(kitWeights(t.kits, 'easy', 'careful')).toEqual([1, 1, 2, 0]);
    expect(kitWeights(t.kits, 'normal', 'rusher')).toEqual([0, 0, 0, 0]);
    // The same seed and no personality picks as before personalities came.
    for (let bot = 1; bot <= 50; bot++) expect(pickBotKit(t, 'easy', pool, botKitSeed(3, bot))).toBe(pickBotKit(t, 'easy', pool, botKitSeed(3, bot), null));
  });
});
