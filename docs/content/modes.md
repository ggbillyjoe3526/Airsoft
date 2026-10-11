# Game modes

The rulebook and brief for a new mode or field rule set. Its checks come with toolkit part 3; until then a mode is
checked by its own tests and the owner's playtest. The steps are in `docs/content/README.md`.

## Rules

Must:

- **Says what it needs.** Which maps can host it and what it needs from them (a flag spot, cases and exits, capture
  points).
- **Bots understand it.** A mode the bots play as Elimination is not finished.
- **Wired everywhere.** The round rules, the bots' plan, the briefing, the round banner, the end screen, pay, records,
  the menus and the performance run each have an answer for it.
- **A fixed id, dev first.** Its id never changes once given (saved picks and records use it). Tagged `dev` until the
  owner makes it public.
- **Fair sides.** Each side wins 40 to 60 % on every map it lists; the objective decides some rounds; pay per minute
  in line with the other modes.

A field rule set (Tournament, Pro CQB, later Skirmish, CQB, Speedsoft, Milsim) is not a mode: it is one data entry in
`src/config/matchRules.ts`, with the rules and a short balance run.

## Brief

The questions Claude asks, with the default in brackets:

1. **How a round is won.** (By the objective, or by eliminating the other team.)
2. **What each team does.** (One attacks, one defends.)
3. **Which maps.** (Every public map that has what it needs.)
4. **Team sizes.** (Each map's own.)
5. **How bots play each side.**
6. **How it pays.** (In line with Elimination per minute.)
7. **Anything new on screen.** (The banner, briefing and end screen in the existing style.)

## Checks (toolkit part 3)

| Level | What will be checked |
|---|---|
| Rules | Every wiring point answers for it; its id is pinned; each map it lists has what it needs. |
| Compatibility | It works with every field rule set, custom match setting and level it offers, or the menu greys that pairing out. |
| Spec test | A short match in the browser: it starts, a round ends both ways, the end screen shows, nothing errors; the performance run on each map. |
| Balance run | Every map it lists, every level: each side 40 to 60 %, rounds don't run out the clock, the objective decides some rounds, pay in line. |
