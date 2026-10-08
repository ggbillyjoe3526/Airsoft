# src/ui/menus

Every screen before, between and after matches. `Menus` shows one screen at a time over one backdrop (plain navy on the title, one blurred picture elsewhere) and reports
choices to `src/game.ts`.

- `menus.ts`: `Menus` (`go`, `setBlocked` makes the screens inert). Each screen is built the first time it opens and
  reused. `menusOptions.ts` is what the menus are given; `playModel.ts` is the Match screen's picks (`PlayPicks`: each
  change saved and reported). `chrome.ts` is the top bar (the wordmark is the way back; no version) and the
  backdrop: no picture on the title, the pre-blurred one elsewhere (nothing blurs live). No key prompts are drawn along the bottom (M100): a screen's `hints` are
  only the keys it answers to (C, /, Space, T; Esc is handled by `Menus`).
- `menuNav.ts`: where Back goes and which menu opens when play stops (title, pause, summary, result). Leaving a match
  calls `onLeaveMatch`, which unloads it.
- Screens: `titleScreen.ts` (plain: Airsoft, the tagline, START, the Tutorial on a clean save, the version at the
  foot; `tutorialOffered`); `setupScreen.ts` (the Match screen: Map and Mode as `choiceCards.ts` with Practice, the
  mode cards' last, an extra card that is never saved; `matchPanel.ts`; and a "Your match" text from `playView.ts`);
  `loadoutScreen.ts` with `customiseView.ts`; `armoryScreen.ts` (the collection, a column per kind; a card's spares scrap from a right-click / Menu key / Shift+F10 menu, `contextMenu.ts`: built once, reused, listeners on the page only while open);
  `settingsScreen.ts` (groups with a search, a note on every row); `pauseScreen.ts`; `summaryScreen.ts`;
  `resultScreen.ts`.
- Pictures: replica, part and scheme pictures come from `render/itemPictures.ts` via `menuPictures.ts`; map and mode
  stills are files in `public/menu/`, made by `pipeline/map-stills.mjs` (`config/menuArt.ts`); Practice's is drawn
  (`icons.ts` › `PRACTICE_ART`).
- Choices are saved in the browser and read back by `savedChoices.ts` (`loadMatchStarted`: the title's Tutorial offer).
  Map, mode, difficulty and loadout are picked only on the Match screen, with no match loaded.
- Styles: `menus.css` imports `css/`; the typeface is Inter (`css/fonts.css`, `src/assets/fonts/`). Tuning:
  `config/menus.ts`, `config/menuArt.ts`.
- Tests: `menus.test.ts`, `menuRedesign.test.ts`, `choiceCards.test.ts`, `chrome.test.ts`, `contextMenu.test.ts`, `armoryScrapMenu.test.ts` (with `menuTestSupport.ts`), `settingsRows.test.ts`,
  `rulesText.test.ts`.
