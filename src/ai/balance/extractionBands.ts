import type { Difficulty } from '../../config/bots';
import type { MapId } from '../../map/maps';
import type { ExtractionBands } from './extractionBalance';

/**
 * Extraction's balance figures' targets per map (moved here from each map's *Extraction.balance.ts for the content toolkit's
 * mode checks, CT3, which read the same bands): the seeds measured, each level's bands, and the pairs of levels whose
 * order is checked ([easier, harder]).
 */
export interface ExtractionBalance {
  seeds: number;
  bands: ExtractionBands;
  harder: readonly (readonly [Difficulty, Difficulty])[];
}

export const EXTRACTION_BALANCE: Readonly<Partial<Record<MapId, ExtractionBalance>>> = {
  /**
   * Extraction's balance on Depot (M46; plan, section 4; figures since TE4): whole runs, headless, a bot playing the runner by RUNNER_PLAN
   * (three cases, nearest first, the locker left alone, then the nearest open exit) with two bot teammates, against the
   * home team at each difficulty. The squad is Normal at every level, standing in for you, so only the home team's level
   * changes. Measured 2026-10-05 over these seeds (DECISIONS M46): the bands keep a later change from tipping the mode
   * over, and the levels in order. XP a minute is what the runs got out with over the minutes they lasted; a bot runner
   * is quicker about it than a player, so it is only comparable between levels and builds, not with Elimination's pay.
   */
  depot: {
    seeds: 48,
    bands: {
      // Measured: Easy 48 % and 63 XP a minute, Normal 25 % and 31, Hard 6 % and 11, Pro 8 % and 14. M71 (Audit 2: every
      // level hunts the middle, bots step aside when pressed together): Easy 58 % (28 of 48) and 62, Normal 31 % (15) and
      // 43, Hard 10 % (5) and 19, Pro 4 % (2) and 9.
      // M72 (Audit 2 BAL-03, owner decisions 1a and 8: the home team one more at Pro, a 3 s grace for
      // the squad at the insertion and after a respawn), seeds 1-48: Easy 58 % (28) and 62, Hard 12.5 %
      // (6) and 20, Pro 4 % (2) and 5. Normal is the baseline (owner, 2026-10-06: Extraction wants more opponents, not
      // fewer), the base plus the squad: 31 % (15) and 40. Each band is
      // the figure ±15 points (extract) and ±20 XP a minute, floored at 0.
      easy: { extract: [0.43, 0.73], xpPerMinute: [42, 82] },
      normal: { extract: [0.16, 0.46], xpPerMinute: [20, 60] },
      hard: { extract: [0, 0.28], xpPerMinute: [0, 40] },
      pro: { extract: [0, 0.19], xpPerMinute: [0, 25] },
    },
    harder: [['easy', 'normal'], ['normal', 'hard']],
  },
  /**
   * Extraction's balance on Woodland (M48), measured as on Depot (depotExtraction.balance.ts): whole runs at
   * night, a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each level (4 / 5 / 6 of them
   * with a trio, three more than the squad). Measured 2026-10-05 over these seeds (DECISIONS M48). Normal already beats
   * the squad here, by day as by night, so Normal, Hard and Pro come out close together (KNOWN_ISSUES): only Easy is
   * checked to be easier than each, and their order is left to the Woodland balance pass (M48 acceptance 2, amended).
   */
  woodland: {
    seeds: 48,
    bands: {
      // Measured: Easy 65 % and 54 XP a minute, Normal 19 % and 20, Hard 19 % and 24, Pro 25 % and 33. With the torches the
      // game fits every bot at night (M57, audit AI-02, on M55's maps): Easy 52 % (25 of 48) and 48, Normal 10 % (5) and 13,
      // Hard 12.5 % (6) and 17.5, Pro 19 % (9) and 24. M71 (Audit 2: every level hunts the middle and keeps out of the
      // light, a torch only for a fight within 20 m or a search's last stretch): Easy 56 % (27) and 45, Normal 35.4 % (17)
      // and 35, Hard 19 % (9) and 19, Pro 25 % (12) and 29.
      // M72 (Audit 2 BAL-03, owner decisions 1a and 8: the home team one more at Pro, a 3 s grace for
      // the squad at the insertion and after a respawn, and the home team
      // keeping 30 m from Woodland's insertion), seeds 1-48: Easy 54 % (26) and 45, Normal (the baseline, the base
      // plus the squad, owner 2026-10-06) 33 % (16) and 32, Hard 15 % (7) and 15, Pro 19 % (9) and 21: Easy, Normal and Hard in order again, measured below. Each band is
      // the figure ±15 points (extract) and ±20 XP a minute, floored at 0.
      // M87 and M88 (2026-10-11, hunting bots check by eye and share it; Woodland's lanes; a bot at a lean spot walks aside
      // for a teammate walking past), seeds 1-48: Easy 70.8 %, over its band within noise (±6.6); seeds 49-96 58.3 %, so
      // 64.6 % over 96. Normal 37.5 %, Hard 18.8 %, Pro 16.7 % before the lean-spot yield.
      easy: { extract: [0.39, 0.69], xpPerMinute: [25, 65] },
      normal: { extract: [0.18, 0.48], xpPerMinute: [12, 52] },
      hard: { extract: [0, 0.3], xpPerMinute: [0, 35] },
      pro: { extract: [0.04, 0.34], xpPerMinute: [1, 41] },
    },
    harder: [['easy', 'normal'], ['normal', 'hard'], ['easy', 'pro']],
  },
  /**
   * Extraction's balance on Neon Heights (M48), measured as on Depot (depotExtraction.balance.ts): whole runs by
   * Night (the map's first preset), a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each
   * level. Measured 2026-10-05 over these seeds (DECISIONS M48): the squad gets out more often than on Depot at Normal (the
   * plan's "about half"), the rooms and floors giving it cover to open cases behind.
   */
  neonHeights: {
    seeds: 48,
    bands: {
      // Measured: Easy 56 % and 34 XP a minute, Normal 50 % and 32, Hard 21 % and 25, Pro 15 % and 16. With the torches the
      // game fits every bot at night (M57, audit AI-02, on M55's maps): Easy 58 % (28 of 48) and 41.5, Normal 48 % (23) and
      // 31, Hard 21 % (10) and 19, Pro 8 % (4) and 12, all inside these bands. M71 (Audit 2: every level hunts the middle
      // and keeps out of the light, a torch only for a fight within 20 m or a search's last stretch): Easy 67 % (32) and
      // 43, Normal 40 % (19) and 29, Hard 23 % (11) and 27, Pro 12.5 % (6) and 19.
      // M72 (Audit 2 BAL-03, owner decisions 1a and 8: the home team one more at Pro, a 3 s grace for
      // the squad at the insertion and after a respawn), seeds 1-48: Easy 67 % (32) and 42, Normal (the baseline, the base plus the
      // squad, owner 2026-10-06) 40 % (19) and 29, Hard 23 %
      // (11) and 27, Pro 0 % (none of 48) and 0: a Pro home team of six in the city stops the bot runner every time. Each band is
      // the figure ±15 points (extract) and ±20 XP a minute, floored at 0.
      easy: { extract: [0.52, 0.82], xpPerMinute: [22, 62] },
      normal: { extract: [0.25, 0.55], xpPerMinute: [9, 49] },
      hard: { extract: [0.08, 0.38], xpPerMinute: [7, 47] },
      pro: { extract: [0, 0.15], xpPerMinute: [0, 20] },
    },
    harder: [['easy', 'normal'], ['normal', 'hard']],
  },
};
