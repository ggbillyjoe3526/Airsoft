import { NEON_HEIGHTS } from '../map/neonHeights';
import { describeExtractionBalance, type ExtractionBands } from './extractionBalanceSupport';

/**
 * Extraction's balance on Neon Heights (M48), measured as on Depot (depotMatch.extractionBalance.test.ts): whole runs by
 * Night (the map's first preset), a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each
 * level, every bot carrying the torch the game fits it at night (M57, audit AI-02). Measured 2026-10-05 over these seeds
 * (DECISIONS M48, M57): the squad gets out more often than on Depot at Normal (the plan's "about half"), the rooms and
 * floors giving it cover to open cases behind. With torches Easy and Normal read the same (24 and 26 of 48 runs, inside
 * one standard error of each other), so Easy is checked against Hard and Normal against Hard.
 */
const SEEDS = 48;
const BANDS: ExtractionBands = {
  // Measured (M57, with torches): Easy 50 % (24 of 48) and 33 FC a minute, Normal 54 % (26) and 36, Hard 21 % (10) and
  // 20, Pro 10 % (5) and 13.5. Before M57, without torches: Easy 56 % and 34, Normal 50 % and 32, Hard 21 % and 25, Pro
  // 15 % and 16.
  easy: { extract: [0.35, 0.7], fcPerMinute: [18, 55] },
  normal: { extract: [0.35, 0.7], fcPerMinute: [20, 55] },
  hard: { extract: [0.08, 0.35], fcPerMinute: [8, 35] },
  pro: { extract: [0.03, 0.25], fcPerMinute: [5, 25] },
};

describeExtractionBalance('Extraction balance on Neon Heights (M48)', NEON_HEIGHTS, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'hard'], ['normal', 'hard']], timeoutMs: 900_000 });
