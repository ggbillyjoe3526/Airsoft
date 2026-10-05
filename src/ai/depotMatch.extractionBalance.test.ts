import { DEPOT } from '../map/depot';
import { describeExtractionBalance, type ExtractionBands } from './extractionBalanceSupport';

/**
 * Extraction's balance on Depot (M46; plan, section 4): whole runs, headless, a bot playing the runner by RUNNER_PLAN
 * (three cases, nearest first, the locker left alone, then the nearest open exit) with two bot teammates, against the
 * home team at each difficulty. The squad is Normal at every level, standing in for you, so only the home team's level
 * changes. Measured 2026-10-05 over these seeds (DECISIONS M46): the bands keep a later change from tipping the mode
 * over, and the levels in order. FC a minute is what the runs got out with over the minutes they lasted; a bot runner
 * is quicker about it than a player, so it is only comparable between levels and builds, not with Elimination's pay.
 */
const SEEDS = 48;
const BANDS: ExtractionBands = {
  // Measured: Easy 48 % and 63 FC a minute, Normal 25 % and 31, Hard 6 % and 11, Pro 8 % and 14.
  easy: { extract: [0.3, 0.65], fcPerMinute: [35, 90] },
  normal: { extract: [0.1, 0.45], fcPerMinute: [12, 55] },
  hard: { extract: [0, 0.25], fcPerMinute: [0, 35] },
  pro: { extract: [0, 0.25], fcPerMinute: [0, 40] },
};

describeExtractionBalance('Extraction balance on Depot (M46)', DEPOT, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['normal', 'hard']], timeoutMs: 600_000 });
