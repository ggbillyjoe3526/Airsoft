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
  // Measured: Easy 48 % and 63 FC a minute, Normal 25 % and 31, Hard 6 % and 11, Pro 8 % and 14. M71 (Audit 2: every
  // level hunts the middle, bots step aside when pressed together): Easy 58 % (28 of 48) and 62, Normal 31 % (15) and
  // 43, Hard 10 % (5) and 19, Pro 4 % (2) and 9.
  // M72 (Audit 2 BAL-03, owner decisions 1a and 8: the home team one fewer at Normal and one more at Pro, a 3 s grace for
  // the squad at the insertion and after a respawn), seeds 1-48: Easy 58 % (28) and 62, Normal 52 % (25) and 54, Hard 12.5 %
  // (6) and 20, Pro 4 % (2) and 5: Normal now gets out about half the time, as the plan has it. Each band is
  // the figure ±15 points (extract) and ±20 FC a minute, floored at 0.
  easy: { extract: [0.43, 0.73], fcPerMinute: [42, 82] },
  normal: { extract: [0.37, 0.67], fcPerMinute: [34, 74] },
  hard: { extract: [0, 0.28], fcPerMinute: [0, 40] },
  pro: { extract: [0, 0.19], fcPerMinute: [0, 25] },
};

describeExtractionBalance('Extraction balance on Depot (M46)', DEPOT, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['normal', 'hard']], timeoutMs: 600_000 });
