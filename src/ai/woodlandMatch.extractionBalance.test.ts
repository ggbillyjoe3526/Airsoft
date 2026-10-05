import { WOODLAND } from '../map/woodland';
import { describeExtractionBalance, type ExtractionBands } from './extractionBalanceSupport';

/**
 * Extraction's balance on Woodland (M48), measured as on Depot (depotMatch.extractionBalance.test.ts): whole runs at
 * night, a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each level (4 / 5 / 6 of them
 * with a trio, three more than the squad). Measured 2026-10-05 over these seeds (DECISIONS M48). Normal already beats
 * the squad here, by day as by night, so Normal, Hard and Pro come out close together (KNOWN_ISSUES): only Easy is
 * checked to be easier than each, and their order is left to the Woodland balance pass (M48 acceptance 2, amended).
 */
const SEEDS = 48;
const BANDS: ExtractionBands = {
  // Measured: Easy 65 % and 54 FC a minute, Normal 19 % and 20, Hard 19 % and 24, Pro 25 % and 33. With the torches the
  // game fits every bot at night (M57, audit AI-02, on M55's maps): Easy 52 % (25 of 48) and 48, Normal 10 % (5) and 13,
  // Hard 12.5 % (6) and 17.5, Pro 19 % (9) and 24. M71 (Audit 2: every level hunts the middle and keeps out of the
  // light, a torch only for a fight within 20 m or a search's last stretch): Easy 56 % (27) and 45, Normal 35.4 % (17)
  // and 35, Hard 19 % (9) and 19, Pro 25 % (12) and 29.
  // M72 (Audit 2 BAL-03, owner decisions 1a and 8: the home team one fewer at Normal and one more at Pro, a 3 s grace for
  // the squad at the insertion and after a respawn, and the home team
  // keeping 30 m from Woodland's insertion), seeds 1-48: Easy 54 % (26) and 45, Normal 46 % (22) and 40,
  // Hard 15 % (7) and 15, Pro 19 % (9) and 21: Easy, Normal and Hard in order again, asserted below. Each band is
  // the figure ±15 points (extract) and ±20 FC a minute, floored at 0.
  easy: { extract: [0.39, 0.69], fcPerMinute: [25, 65] },
  normal: { extract: [0.31, 0.61], fcPerMinute: [20, 60] },
  hard: { extract: [0, 0.3], fcPerMinute: [0, 35] },
  pro: { extract: [0.04, 0.34], fcPerMinute: [1, 41] },
};

describeExtractionBalance('Extraction balance on Woodland (M48)', WOODLAND, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['normal', 'hard'], ['easy', 'pro']], timeoutMs: 900_000 });
