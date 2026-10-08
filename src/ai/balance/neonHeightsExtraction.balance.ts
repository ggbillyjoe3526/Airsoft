import { NEON_HEIGHTS } from '../../map/neonHeights';
import { describeExtractionBalance, type ExtractionBands } from './extractionBalance';

/**
 * Extraction's balance on Neon Heights (M48), measured as on Depot (depotExtraction.balance.ts): whole runs by
 * Night (the map's first preset), a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each
 * level. Measured 2026-10-05 over these seeds (DECISIONS M48): the squad gets out more often than on Depot at Normal (the
 * plan's "about half"), the rooms and floors giving it cover to open cases behind.
 */
const SEEDS = 48;
const BANDS: ExtractionBands = {
  // Measured: Easy 56 % and 34 FC a minute, Normal 50 % and 32, Hard 21 % and 25, Pro 15 % and 16. With the torches the
  // game fits every bot at night (M57, audit AI-02, on M55's maps): Easy 58 % (28 of 48) and 41.5, Normal 48 % (23) and
  // 31, Hard 21 % (10) and 19, Pro 8 % (4) and 12, all inside these bands. M71 (Audit 2: every level hunts the middle
  // and keeps out of the light, a torch only for a fight within 20 m or a search's last stretch): Easy 67 % (32) and
  // 43, Normal 40 % (19) and 29, Hard 23 % (11) and 27, Pro 12.5 % (6) and 19.
  // M72 (Audit 2 BAL-03, owner decisions 1a and 8: the home team one more at Pro, a 3 s grace for
  // the squad at the insertion and after a respawn), seeds 1-48: Easy 67 % (32) and 42, Normal (the baseline, the base plus the
  // squad, owner 2026-10-06) 40 % (19) and 29, Hard 23 %
  // (11) and 27, Pro 0 % (none of 48) and 0: a Pro home team of six in the city stops the bot runner every time. Each band is
  // the figure ±15 points (extract) and ±20 FC a minute, floored at 0.
  easy: { extract: [0.52, 0.82], fcPerMinute: [22, 62] },
  normal: { extract: [0.25, 0.55], fcPerMinute: [9, 49] },
  hard: { extract: [0.08, 0.38], fcPerMinute: [7, 47] },
  pro: { extract: [0, 0.15], fcPerMinute: [0, 20] },
};

describeExtractionBalance('Extraction balance on Neon Heights (M48)', NEON_HEIGHTS, { seeds: SEEDS, bands: BANDS, harder: [['easy', 'normal'], ['normal', 'hard']], timeoutMs: 900_000 });
