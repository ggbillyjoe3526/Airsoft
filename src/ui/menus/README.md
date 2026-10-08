# src/ui/menus

Every screen before, between and after matches. `Menus` shows one screen at a time over one backdrop picture and reports
choices to `src/game.ts`.

- `menus.ts`: `Menus` (`go`, `setBlocked` makes the screens inert). Each screen is built the first time it opens and
  reused. `chrome.ts` is the top bar, key hints and the pre-blurred backdrop (nothing blurs live).
- `menuNav.ts`: where Back goes and which menu opens when play stops (title, pause, summary, result). Leaving a match
  calls `onLeaveMatch`, which unloads it.
- Screens: `titleScreen.ts`; `setupScreen.ts` (Play: Map and Mode as `choiceCards.ts`, `matchPanel.ts`, and a "Your
  match" text from `playView.ts`); `loadoutScreen.ts` with `customiseView.ts`; `armoryScreen.ts`; `settingsScreen.ts`
  (groups with a search, a note on every row); `pauseScreen.ts`; `summaryScreen.ts`; `resultScreen.ts`.
- Pictures: replica, part and scheme pictures come from `render/itemPictures.ts` via `menuPictures.ts`; map and mode
  stills are files in `public/menu/`, made by `pipeline/map-stills.mjs` (`config/menuArt.ts`).
- Choices are saved in the browser and read back by `savedChoices.ts`. Map, mode, difficulty and loadout are picked only
  on New game, with no match loaded.
- Styles: `menus.css` imports `css/`. Tuning: `config/menus.ts`, `config/menuArt.ts`.
- Tests: `menus.test.ts`, `choiceCards.test.ts`, `chrome.test.ts`, `settingsRows.test.ts`, `rulesText.test.ts`.
