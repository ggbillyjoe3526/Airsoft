import { afterEach, describe, expect, it, vi } from 'vitest';
import kitsText from '../../data/bot-kits.md?raw';
import { DIFFICULTIES } from '../config/bots';
import { botsMayCarryDev } from '../newGamePicks';
import { botKitSeed, kitAssets, kitsMayHoldDev, pickBotKit, readBotKits } from './botKit';
import { contentPool } from './contentPool';
import { GAME_POOL } from './gamePool';
import { withTags } from './testSupport';

/** BG1 QA: the console warning on a bad row (criterion 1) and the dev-gear note agreeing with the picks (criterion 3). */

const HEADER = '| Kit | Primary | Primary parts | Secondary | Secondary parts | Easy | Normal | Hard | Pro |\n|---|---|---|---|---|---|---|---|---|\n';

describe('the console warning when bot-kits.md has a bad row (BG1 criterion 1)', () => {
  afterEach(() => {
    vi.doUnmock('../../data/bot-kits.md?raw');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function loadWith(text: string) {
    vi.resetModules();
    vi.doMock('../../data/bot-kits.md?raw', () => ({ default: text }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('./gameBotKits');
    return { table: mod.GAME_BOT_KITS, warn };
  }

  it('warns once, naming each bad row by its line, and keeps the good rows', async () => {
    const { table, warn } = await loadWith(`# Kits\n\n${HEADER}| Good | AEG Rifle | Red Dot | GBB Pistol | | 1 | 1 | 1 | 1 |\n| Typo | AEG Rifel | | | | 1 | 1 | 1 | 1 |\n| Late | AEG Rifle | | | | 1 | lots | 1 | 1 |\n`);
    expect(table.kits.map((k) => k.name)).toEqual(['Good']);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain('bot-kits.md');
    expect(text).toContain('line 6: Primary "AEG Rifel" isn\'t in pool.md');
    expect(text).toContain('line 7: Normal weight "lots"');
    expect(text).not.toContain('Good');
  });

  it('does not stop the game from starting when the table is missing or unreadable: no kits, a warning', async () => {
    const { table, warn } = await loadWith('# nothing here\n');
    expect(table.kits).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for the shipped file', async () => {
    const { table, warn } = await loadWith(kitsText);
    expect(table.errors).toEqual([]);
    expect(table.kits.length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves every opponent on the replicas as they come when no row could be read', async () => {
    const { table } = await loadWith('# nothing here\n');
    const offered = contentPool(GAME_POOL, true);
    for (const d of DIFFICULTIES) expect(pickBotKit(table, d.id, offered, botKitSeed(1, 1)), d.label).toBeNull();
  });
});

describe('the dev-gear note agrees with the picks at every difficulty (BG1 criterion 3)', () => {
  const shipped = readBotKits(kitsText, GAME_POOL);
  const held = [...new Set(shipped.kits.flatMap(kitAssets))];

  /** Whether any of 3000 seeded bots at `difficulty` carries a kit holding `asset`, from the pool with Dev content `on`. */
  function someoneCarries(tagged: typeof GAME_POOL, difficulty: (typeof DIFFICULTIES)[number]['id'], asset: string, on: boolean): boolean {
    const offered = contentPool(tagged, on);
    for (let bot = 1; bot <= 3000; bot++) {
      const k = pickBotKit(shipped, difficulty, offered, botKitSeed(11, bot));
      if (k && kitAssets(k).includes(asset)) return true;
    }
    return false;
  }

  it('says dev gear is possible exactly where a bot picks a kit holding it, and never lets it through with Dev content off', () => {
    const assets = GAME_POOL.assets.filter((a) => held.includes(a.id));
    expect(assets.length).toBeGreaterThan(8);
    for (const a of assets) {
      const tagged = withTags(GAME_POOL, { [a.name]: 'dev' });
      for (const d of DIFFICULTIES) {
        const may = kitsMayHoldDev(shipped, d.id, tagged);
        expect(someoneCarries(tagged, d.id, a.id, false), `${a.name} ${d.label} with Dev content off`).toBe(false);
        expect(someoneCarries(tagged, d.id, a.id, true), `${a.name} ${d.label} with Dev content on`).toBe(may);
      }
    }
  });

  it("is what New game's note asks: botsMayCarryDev is off without Dev content and follows kitsMayHoldDev with it", () => {
    const tagged = withTags(GAME_POOL, { 'Cyber Pistol': 'dev' });
    for (const d of DIFFICULTIES) {
      expect(botsMayCarryDev(tagged, false, d.id), `${d.label} off`).toBe(false);
      expect(botsMayCarryDev(tagged, true, d.id), `${d.label} on`).toBe(kitsMayHoldDev(readBotKits(kitsText, tagged), d.id, tagged));
    }
    expect(botsMayCarryDev(tagged, true, 'easy')).toBe(false);
    expect(botsMayCarryDev(tagged, true, 'pro')).toBe(true);
  });
});
