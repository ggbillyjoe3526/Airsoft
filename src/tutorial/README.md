# src/tutorial

The tutorial's progress tracking. It reads the game and never writes it.

- `tutorial.ts`: `TutorialTracker` watches the player and each tick's events against the steps in `config/tutorial.ts`;
  `keySegments` shows a step's keys as the player has them bound. The switch-replica step reads the BB pool (the
  view's `bbs`) to count only a BB its replica fired (KI1), not one from the first replica still in flight.
- It runs on the practice range (`src/rangeSession.ts`), with `ui/coachPanel.ts` showing the current step (the range
  readout takes over once it is finished). A step's `shows` opens the scoreboard or the order wheel on screen while it
  is up (`ui/tutorialShowcase.ts`, M80). `Game` saves `tutorialDone` when the tracker reports the end; played to its
  end, the range gives the mouse back for the "Tutorial complete" pop-up (`ui/menus/tutorialCompleteDialog.ts`).
- Wording (M80, TT1): one or two short sentences, what to do and why; keys only as `{action}`, so the coach names the
  player's binding. The tests fail on a key named outright, a card over 25 words, or a read step that doesn't last
  `READ_TIME` (10 s, TT2). A read step's `readProgress` fills the coach's bar. The lean step (TT2) ticks once the
  player has leaned out both ways.
- The step text "about 39 m" is tied to the stock rifle's hop-up reach: its test fails when a ballistics retune
  (`spinPerHop` in `config/ballistics.ts`) moves the reach, so update the text then.
- Tests: `tutorial.test.ts`; `leanStepQA.test.ts` (TT2, QA: the lean step on the real range geometry).
