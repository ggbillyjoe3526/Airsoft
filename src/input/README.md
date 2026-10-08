# src/input

Raw keyboard and mouse into the player's `PlayerCommand`. Pointer Lock API, keyboard and mouse only.

- `keyboard.ts`, `pointerLock.ts`: raw input. Mouse buttons go into the keyboard as binding codes (`Mouse0` …), so every
  action binds to a key or a button; unlocked play (`?nolock`) counts the buttons and wheel without the lock.
- `playerInput.ts`: `PlayerInput` latches one-shot actions (jump, reload, switch, trigger clicks) until a tick consumes
  them, runs the hold or toggle modes of crouch, aim and sprint, and fills the command (`fillCommand`).
- `keyBindings.ts`, `keyboardLayout.ts`: the saved bindings and the player's keyboard layout (key names follow it).
- `orderWheel.ts`: `WheelPointer`, owned by `PlayerInput`; it takes the mouse while the wheel key is held and is on only
  in a match (`ordersEnabled`), not on the range.
- `sensitivity.ts`: sensitivity as cm/360. `scriptedInput.ts`: the perf harness's scripted player.
- Tuning: `config/controls.ts` (actions, default keys, `MOVED_DEFAULTS`).
- Tests: `playerInput.test.ts` (a contract's pin), `keyBindings.test.ts`, `keyboard.test.ts`, `orderWheel.test.ts`.
- Rules: read fire and aim through the bindings, never the mouse. A toggled sprint pressed before forward waits for
  forward. A default key that moves goes in `MOVED_DEFAULTS` so old saved bindings follow. Key bindings are their own
  save store (`airsoft.keyBindings`).
