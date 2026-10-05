import { NEON_HEIGHTS } from '../map/neonHeights';
import { describeExtractionBalance, type ExtractionBands } from './extractionBalanceSupport';

/**
 * Extraction's balance on Neon Heights (M48), measured as on Depot (depotMatch.extractionBalance.test.ts): whole runs by
 * Night (the map's first preset), a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each
 * level. Measured 2026-10-05 over these seeds (DECISIONS M48): the squad gets out more often than on Depot at Normal (the
 * plan's "about half"), the rooms and floors giving it cover to open cases behind.
 */
const SEEDS = 48;
const BANDS: ExtractionBands = {
  // Measured: Easy 56 % and 34 FC a minute, Normal 50 % and 32, Hard 21 % and 25, Pro 15 % and 16. With the torches the
  // game fits every bot at night (M57, audit AI-02, on M55's maps): Easy 58 % (28 of 48) and 41.5, Normal 48 % (23) and
  // 31, Hard 21 % (10) and 19, Pro 8 % (4) and 12, all inside these bands.
  easy: { extract: [0.4, 0.75], fcPerMinute: [20, 55] },
  normal: { extract: [0.3, 0.65], fcPerMinute: [18, 50] },
  hard: { extract: [0.08, 0.35], fcPerMinute: [10, 40] },
  pro: { extract: [0.03, 0.3], fcPerMinute: [5, 30] },
};

describeExtractionBalance('Extraction balance on Neon Heights (M48)', NEON_HEIGHTS, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['normal', 'hard']], timeoutMs: 900_000 });
