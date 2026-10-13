# src/ui/menus

Every screen before, between and after matches. `Menus` shows one screen at a time over one backdrop (plain navy on the title, one blurred picture elsewhere) and reports
choices to `src/game.ts`.

- `menus.ts`: `Menus` (`go`, `setBlocked` makes the screens inert). Each screen is built the first time it opens and
  reused. The Loadout (with Customise), the Armory and Settings are also fetched then (IM1): `lazyScreens.ts` is their
  chunk, preloaded once the title is up (`preloadScreens`, `core/onDemand.ts`); opened before it has arrived, the screen
  on show stays (`whenFetched`) and a later choice wins. A new screen reached only from a menu joins `lazyScreens.ts`.
  `menusOptions.ts` is what the menus are given; `playModel.ts` is the Match screen's picks (`PlayPicks`: each change
  saved and reported). `chrome.ts` is the top bar (the wordmark is the way back; no version; `setLevel` shows "Lv N" and
  an XP bar that opens the Armory, hidden while levelling is off) and the backdrop: no picture on the title, the
  pre-blurred one elsewhere (nothing blurs live). No key prompts are drawn along the bottom (M100): a screen's `hints`
  are only the keys it answers to (C, /, T; Esc is handled by `Menus`).
- `menuNav.ts`: where Back goes and which menu opens when play stops (title, pause, summary, result). Leaving a match
  calls `onLeaveMatch`, which unloads it.
- Screens: `titleScreen.ts` (plain: Airsoft, the tagline, START, the Tutorial on a clean save, the version at the
  foot; `tutorialOffered`); `setupScreen.ts` (the Match screen: Map and Mode as `choiceCards.ts` with Practice, the
  mode cards' last, an extra card that is never saved; `matchPanel.ts`, with Your team (M98: Alpha or Beta, hidden for an Extraction run); and a "Your match" text from
  `playView.ts`, whose rules text follows your team, `rulesText.ts` › `sideText`);
  `loadoutScreen.ts` with `customiseView.ts` (items still to unlock greyed with a lock and their level, and a line
  pointing to the Armory; `itemTile.ts`, `kitStrip.ts`); `armoryScreen.ts` (the levelling screen: your level, the XP
  bar and how XP is earned, what the next level unlocks, and every level's items from `progress/track.ts`);
  `settingsScreen.ts` (groups with a search, a note on every row); `pauseScreen.ts` (with
  `tutorialCompleteDialog.ts` over it when the tutorial ends: the practice range or the menu, M80; in Practice the
  Loadout key opens the Loadout over it, `Menus.showPracticeLoadout`, on the slot in hand, with Back to practice on the
  top bar and the key going back too, M95); `summaryScreen.ts` (the match's XP line by line, a level-up line with what
  it unlocked, the level bar, an Extraction haul);
  `resultScreen.ts`.
- Pictures: replica, part and scheme pictures come from `render/itemPictures.ts` via `menuPictures.ts`; map and mode
  stills are files in `public/menu/`, made by `pipeline/map-stills.mjs` (`config/menuArt.ts`); Practice's is drawn
  (`icons.ts` › `PRACTICE_ART`).
- Choices are saved in the browser and read back by `savedChoices.ts` (`loadMatchStarted`: the title's Tutorial offer).
  Map, mode, difficulty and loadout are picked only on the Match screen, with no match loaded.
- Styles: `menus.css` imports `css/`; the typeface is Inter (`css/fonts.css`, `src/assets/fonts/`). Tuning:
  `config/menus.ts`, `config/menuArt.ts`.
- Tests: `menus.test.ts`, `menuRedesign.test.ts`, `teamPick.test.ts`, `choiceCards.test.ts`, `chrome.test.ts`
  (with `menuTestSupport.ts`), `settingsRows.test.ts`, `rulesText.test.ts`, `modeFit.test.ts` (M89: what fits each
  mode), `summaryHaul.test.ts`.
