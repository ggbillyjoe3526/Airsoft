# src/settings

The player's saved settings: one versioned object in the browser, plus the Dev settings' values.

- `storage.ts`: `airsoft.settings` (`SETTINGS_VERSION`), `loadSetting`, `loadChoice` (one of a list's ids),
  `saveSetting`, `saveSettingSoon`, `flushSettings`, `migrate`. `browserStorage()` is the save system's guarded storage
  once it has started.
- `hudPrefs.ts` (DX5): `HudPrefs`, every HUD and accessibility preference in one object (the crosshair and hit marker,
  Settings › HUD, Settings › Accessibility), `loadHudPrefs`, `setHudPref` (moves its `version` on, which each session
  checks before play runs again and each frame drawn) and `motionReduced`. `Game` loads it once; the menus change it,
  `Game`, both sessions, both presentations and `ui/hudLook.ts` read it by reference. Its loaders: `loadCrosshair`,
  `loadHitMarker` (with `hexColour`), `loadHudSize`, `loadScoreboardSize`, `loadHudOpacity`, `loadHitFeedMode`,
  `loadFeedCorner`, `loadWhatGotYouMode`, `loadMinimapTurn`, `loadCallouts`, `loadPingMarkers`, `loadMagPrompts`,
  `loadAmmoCounter`, `loadReducedMotion` (with `systemReducedMotionQuery`, `effectiveReducedMotion`, `motionClass`),
  `loadTeamColours`, `loadSoundCues`, `loadSoundCueSize`, `loadSoundCueColour`. A new preference is a field there, its
  loader, its row and its readers.
- `savedChoices.ts` (out of `ui/menus/`, DX5): every other choice the menus save, read back with its default: New
  game's (`loadNewGamePicks`: `loadMap`, `loadMode`, `loadDifficulty`, `loadTeammateDifficulty`, `loadTeamPick`,
  `loadRuleset`, `loadMatchRules`; and `loadLightingPicks`, `loadPracticePlace`, `loadPracticeChallenge`), the
  controls (`loadControls`, laid onto `PlayerInput`; `loadMouseDpi`, `loadRawInput`), the graphics (`loadFov`,
  `loadSavedQuality`, `loadCustomQuality`, `loadFrameRateCap`, `loadRendererChoice`, `loadShowFps`),
  `loadLook`, and the tutorial's and the title's flags (`loadTutorialDone`, `loadTutorialStep`, `loadMatchStarted`).
- `dev.ts`: the Dev settings' values as `dev.<id>` (a switch is `'on'` / `'off'`, a choice its option's id), read back as `DevSettings`.
  `Game.dev` holds what applies (the defaults while the Dev settings box is unticked).
- `adaptiveRating.ts`: adaptive difficulty's rating for the next match (AD1) as `adaptiveRating`, and the Opponents
  level it grew from as `adaptiveFrom` (another level picked starts it again from that level).
- `retroLook.ts`: Settings › Dev › Retro look (M96; on the Dev tab again since ST1, shown only while it is ticked) as `retroLook`, `retroPixelSize`, `retroColours`; a save from
  before reads the Dev tab's old `dev.retro*` keys, written under the new names once (`carryOverDevRetro`).
- Rules: renaming a key needs a `case` in `migrate`; fields are only ever added, each read with a fallback; an object
  from a newer version is never read or overwritten. A new Dev setting goes in `config/dev.ts`, then `Game.applyDev`.
- Other stores: key bindings (`input/keyBindings.ts`), records (`stats/records.ts`), the level progress
  (`progress/progress.ts`). All four are listed in `save/stores.ts`.
- Tests: `storage.test.ts`, `savedChoices.test.ts`, `retroLook.test.ts`, `config/dev.test.ts`; each loader's own in the
  test of the row or reader that uses it (`ui/*Settings.test.ts`, `ui/crosshair.test.ts`, `ui/hitMarker.test.ts`).
