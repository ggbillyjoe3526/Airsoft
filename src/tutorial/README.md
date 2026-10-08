# src/tutorial

The tutorial's progress tracking. It reads the game and never writes it.

- `tutorial.ts`: `TutorialTracker` watches the player and each tick's events against the steps in `config/tutorial.ts`;
  `keySegments` shows a step's keys as the player has them bound.
- It runs on the practice range (`src/rangeSession.ts`), with `ui/coachPanel.ts` showing the current step (the range
  readout takes over once it is finished). `Game` saves `tutorialDone` when the tracker reports the end.
- The step text "about 39 m" is tied to the stock rifle's hop-up reach: its test fails when a ballistics retune
  (`spinPerHop` in `config/ballistics.ts`) moves the reach, so update the text then.
- Tests: `tutorial.test.ts`.
