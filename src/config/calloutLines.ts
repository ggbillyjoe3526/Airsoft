import calloutsText from '../../data/callouts.md?raw';
import { BOT_PERSONALITIES } from './botPersonalities';
import { type CalloutsFile, loadCalloutsFile } from './calloutsFile';

/**
 * What the bots call and when (CL1): data/callouts.md, bundled into the build and read once at
 * start, as bots.md is (config/botPersonalities.ts). Anything it can't read is left out and listed in the console
 * (src/config/calloutsFile.test.ts fails on it).
 */
export const CALLOUT_LINES: CalloutsFile = loadCalloutsFile(calloutsText, new Set(BOT_PERSONALITIES.styles.keys()));

if (CALLOUT_LINES.errors.length > 0) console.warn(`callouts.md: ${CALLOUT_LINES.errors.length} problem(s), left out:\n${CALLOUT_LINES.errors.join('\n')}`);
