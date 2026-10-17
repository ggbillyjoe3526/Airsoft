import botsText from '../../data/bots.md?raw';
import { type BotsFile, loadBotsFile } from './botsFile';

/**
 * The bots' names and personalities (BN1): data/bots.md, bundled into the build and read once at
 * start, as stats.md is (config/gameStats.ts). Anything it can't read plays neutral and is listed in the console
 * (src/config/botsFile.test.ts fails on it).
 */
export const BOT_PERSONALITIES: BotsFile = loadBotsFile(botsText);

if (BOT_PERSONALITIES.errors.length > 0) console.warn(`bots.md: ${BOT_PERSONALITIES.errors.length} problem(s), played neutral there:\n${BOT_PERSONALITIES.errors.join('\n')}`);
