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
  // Hard 12.5 % (6) and 17.5, Pro 19 % (9) and 24; Easy's and Normal's floors moved down (45 to 35 %, 5 to 3 %): each
  // measure sat about one standard error above its old floor. The Extraction balance pass (BAL PR 2) sets them again.
  easy: { extract: [0.35, 0.8], fcPerMinute: [30, 80] },
  normal: { extract: [0.03, 0.35], fcPerMinute: [5, 40] },
  hard: { extract: [0.05, 0.35], fcPerMinute: [5, 45] },
  pro: { extract: [0.08, 0.4], fcPerMinute: [10, 55] },
};

describeExtractionBalance('Extraction balance on Woodland (M48)', WOODLAND, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['easy', 'hard'], ['easy', 'pro']], timeoutMs: 900_000 });
