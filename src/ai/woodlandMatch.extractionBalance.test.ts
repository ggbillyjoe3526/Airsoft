import { WOODLAND } from '../map/woodland';
import { describeExtractionBalance, type ExtractionBands } from './extractionBalanceSupport';

/**
 * Extraction's balance on Woodland (M48), measured as on Depot (depotMatch.extractionBalance.test.ts): whole runs at
 * night, a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each level (4 / 5 / 6 of them
 * with a trio, three more than the squad), every bot carrying the torch the game fits it at night (M57, audit AI-02).
 * Measured 2026-10-05 over these seeds (DECISIONS M48, M57). Normal already beats the squad here, so Normal, Hard and
 * Pro come out close together (KNOWN_ISSUES): only Easy is checked to be easier than each, and their order is left to
 * the Woodland balance pass (M48 acceptance 2, amended).
 */
const SEEDS = 48;
const BANDS: ExtractionBands = {
  // Measured (M57, with torches): Easy 56 % (27 of 48) and 45 FC a minute, Normal 17 % (8) and 21, Hard 15 % (7) and
  // 23, Pro 12.5 % (6) and 16. Before M57, without torches: Easy 65 % and 54, Normal 19 % and 20, Hard 19 % and 24, Pro
  // 25 % and 33.
  easy: { extract: [0.4, 0.75], fcPerMinute: [25, 70] },
  normal: { extract: [0.05, 0.3], fcPerMinute: [8, 40] },
  hard: { extract: [0.03, 0.3], fcPerMinute: [8, 45] },
  pro: { extract: [0.03, 0.3], fcPerMinute: [5, 35] },
};

describeExtractionBalance('Extraction balance on Woodland (M48)', WOODLAND, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['easy', 'hard'], ['easy', 'pro']], timeoutMs: 900_000 });
