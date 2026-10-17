# src/progress

Levels and XP: what each level unlocks, what a match gives, and what the player has unlocked. `data/levels.md` is the
plan the game reads; the owner edits it by hand. Pure apart from the progress store's storage.

- `levels.ts`: `loadLevels` reads `levels.md`'s Levels, XP and Difficulty tables against the pool into a `LevelTable`
  (each level's XP, running total and unlocks, the cap, each asset's level), listing what it can't read by line and
  never throwing. `levelOf`, `standing` (where an XP total stands: level, XP into it, what the next takes),
  `unlocksUpTo`; `DEFAULT_XP` fills a missing XP number.
- `gameLevels.ts`: `GAME_LEVELS`, the bundled `levels.md` read once at start.
- `xp.ts`: `matchXp`, a finished match's XP line by line (`XpEarned`) from a `MatchOutcome`: a shorter match gives
  less, a round sat out gives nothing, an Extraction run gives the XP it got out with, and the lower team difficulty
  multiplies the total (custom rules at most ×1.5).
- `progress.ts`: the player's `Progress { xp, unlocked, rev }`, saved as `airsoft.progress`. `newProgress`, `addXp`
  (stops at the cap's total; returns a `LevelUp`), `grantReached`, `xpToNext`, `resetProgress` (Dev › Reset level),
  and `loadProgress`, `syncProgress`, `saveProgress`, which never overwrite another tab's newer save or a newer build's.
- `track.ts`: `levelTrack`, the level track the Armory screen draws: every level with its items, each unlocked, next
  or locked (each item marked if the player has it, KI1), and what comes next.
- Who uses it: `stats/settleMatch.ts` gives a match's XP once (none with Dev settings or dev content, `matchStanding`);
  `pool/loadoutModel.ts` `gameOwnership` turns the unlocks into what the Loadout offers; `ui/menus/armoryScreen.ts`,
  `summaryScreen.ts` and the top bar show it; `save/stores.ts` saves it.
- Tuning: `levels.md` (levels, XP, multipliers). Tests: `levels.test.ts` (reads the shipped `levels.md` and fails with
  the line of anything it can't read), `xp.test.ts`, `progress.test.ts`.
- Rules: `levels.md`'s format and the progress store are contracts (`docs/ARCHITECTURE.md › Contracts`). Unlocks are
  only ever added. A store version bump needs `SAVE_FORMAT`, `STORES_BY_FORMAT` and a `MIGRATIONS` step
  (`src/save/`).
