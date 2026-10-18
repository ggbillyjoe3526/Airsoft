import kitsText from '../../data/bot-kits.md?raw';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { readBotKits, type BotKitTable } from './botKit';
import { GAME_POOL } from './gamePool';

/**
 * The bots' kits (BG1): data/bot-kits.md, bundled into the build and read once at start against the
 * game's pool and bots.md's personalities. Rows it can't read are left out and listed in the console
 * (src/pool/botKitTable.test.ts fails on them, with their lines).
 */
export const GAME_BOT_KITS: BotKitTable = readBotKits(kitsText, GAME_POOL, [...BOT_PERSONALITIES.styles.keys()]);

if (GAME_BOT_KITS.errors.length > 0) console.warn(`bot-kits.md: ${GAME_BOT_KITS.errors.length} problem(s), those rows are left out:\n${GAME_BOT_KITS.errors.join('\n')}`);
