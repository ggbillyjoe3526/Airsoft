import { GAME_BOT_KITS } from '../pool/gameBotKits';
import { GAME_POOL } from '../pool/gamePool';
import { GAME_LEVELS } from '../progress/gameLevels';
import { BOT_PERSONALITIES } from './botPersonalities';
import { CALLOUT_LINES } from './calloutLines';
import { GAME_STATS } from './gameStats';

/** One of the hand-edited tables in data/ and what the game couldn't read of it, each problem with its line. */
export interface DataTable {
  readonly file: string;
  readonly errors: readonly string[];
}

/**
 * The six tables in data/ as the game read them at start (audit B6, DX7). A row it can't read is left out, plays
 * neutral or keeps the built-in number, and each module that reads one lists its problems in the console as it loads;
 * Settings → Dev → Data tables lists them too (ui/devSettings.ts), so a bad edit is seen without the console open.
 */
export const DATA_TABLES: readonly DataTable[] = [
  { file: 'pool.md', errors: GAME_POOL.errors },
  { file: 'stats.md', errors: GAME_STATS.errors },
  { file: 'levels.md', errors: GAME_LEVELS.errors },
  { file: 'bots.md', errors: BOT_PERSONALITIES.errors },
  { file: 'bot-kits.md', errors: GAME_BOT_KITS.errors },
  { file: 'callouts.md', errors: CALLOUT_LINES.errors },
];

/** Settings → Dev → Data tables (DX7): its words, and how many problems it lists before it sums up the rest. */
export const DATA_TABLES_TEXT = {
  label: 'Data tables',
  help: "The hand-edited tables in data/. A row the game can't read is left out or keeps its built-in value; each one is listed here and in the console.",
  clean: (count: number): string => `All ${count} tables read cleanly.`,
  more: (count: number): string => `…and ${count} more (the console lists them all).`,
  shown: 20,
} as const;

/**
 * What the Data tables row says of `tables`: one line per problem, led by its file ("pool.md: line 12: …"; bots.md's and
 * callouts.md's readers name it already, "bots.md:66: …"), or that all read cleanly.
 */
export function dataTableLines(tables: readonly DataTable[]): string[] {
  const lines = tables.flatMap((t) => t.errors.map((e) => (e.startsWith(`${t.file}:`) ? e : `${t.file}: ${e}`)));
  if (lines.length === 0) return [DATA_TABLES_TEXT.clean(tables.length)];
  if (lines.length <= DATA_TABLES_TEXT.shown) return lines;
  return [...lines.slice(0, DATA_TABLES_TEXT.shown), DATA_TABLES_TEXT.more(lines.length - DATA_TABLES_TEXT.shown)];
}
