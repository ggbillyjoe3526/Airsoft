# src/ui

DOM overlays: the HUD, settings tabs, notices and the menus (`menus/`, with its own README). No framework. They read
game state and never write it. Tests use the fake DOM in `testSupport.ts` (no jsdom).

- In-match HUD: `hud.ts` (crosshair, replica panel), `ammoStatus.ts`, `crosshair.ts`, `scoreboard.ts`, `roundBanner.ts`,
  `hitFeed.ts`, `hitFeedback.ts`, `soundCues.ts`, `teammateMarkers.ts`, `flagMarker.ts`, `flagStatus.ts`,
  `runStatus.ts`, `casePrompt.ts`, `whatGotYou.ts`, `squadOrderLine.ts`, `orderWheel.ts`.
- Map and stats: `minimap.ts` (the field drawn once per match on a canvas) with `minimapView.ts` (teammates and heard
  players), `matchBoard.ts` (Tab), `statsRows.ts` (pure) and `statsTable.ts`, `recordsView.ts`, `rangeReadout.ts`,
  `performanceSheet.ts` (the Customise screen's Performance sheet).
- Settings tabs: one `*Settings.ts` per tab (graphics, audio, controls and `keySettings.ts`, hud, look, accessibility,
  crosshair, dev, save), shown by `menus/settingsScreen.ts`. `optionPicker.ts` is the shared pop-up choice.
- Overlays: `debugOverlay.ts`, `crashScreen.ts`, `loadingScreen.ts`, `graphicsNotice.ts`, `otherTabNotice.ts`,
  `coachPanel.ts` (the tutorial), `saveDialog.ts`.
- Wording that needs testing is pure (`matchStopText.ts`, `keyNotes.ts`, `statsRows.ts`).
- The HUD reads `--team-0` / `--team-1` (set by `Game.play`) and `--sb-scale`, `--cue-scale`, `--cue-colour` (set by
  `Game.showHudLook`). Team colours come from `teamCss(team)`, never hard-coded.
- Tuning, in `config/`: `teams.ts`, `minimap.ts`, `matchInfo.ts`, `menus.ts`, `tutorial.ts`, `accessibility.ts`.
- Tests: a `*.test.ts` beside most files (`hud`, `minimap`, `scoreboard`, `soundCues`, `statsRows`, `settingsNotes`).
