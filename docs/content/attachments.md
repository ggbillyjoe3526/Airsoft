# Parts

The rulebook, brief and checks for a new part: an optic, grip, laser, magazine, barrel, muzzle device, weapon light or
power source (later grenades and gear, owner, 2026-10-05). The steps are in `docs/content/README.md`.

## Rules

Must:

- **Fits by tags.** It names the tags it fits (`top-rail`, `aeg-mag`, `rifle`), never one replica's ID, unless the
  brief says why. It fits at least one replica, and a public part a public one.
- **Trades something.** The Vertical Grip handles better but steadies sprint shake less; the Long Barrel adds energy
  but is front-heavy. A part better at everything needs the owner's OK (`TRADE_OFF_EXCEPTIONS` in
  `src/config/contentRules.ts`). Optics, lasers and lights carry their cost in play (a narrow view, a dot that shows,
  a beam that gives you away: `CATEGORY_COSTS`).
- **Under the site limit.** It never lifts a replica past the limit; the limit stops the stack.
- **Drawn in place.** Each replica it fits draws it at Low and High, in the right place, never floating or hidden in
  the body, with at most 4 meshes (`MODEL_BUDGET`).
- **Its numbers are data.** Its row in `stats.md`, by Key (a power source by ID).
- **A new ID, dev first,** a Title Case name with no real brand, as for replicas.

Should:

- **Fit a public replica while dev.** A dev part that fits only dev replicas gets a warning: it goes public with
  them.
- **Improve something.** A part that improves nothing would never be fitted.

## Brief

The questions Claude asks, with the default in brackets:

1. **What it is.** (A plain made-up name.)
2. **Which slot.** Optic, grip, laser, magazine, barrel, muzzle, light, power source.
3. **What it fits.** Which tags. (Every replica with that mount.)
4. **What it improves and what it costs.** (One gain, one cost, both a few per cent to a few tens of per cent.)
5. **Which level unlocks it.** Its Name in a level's Unlocks in `levels.md`. (Plain gains early, trade-offs in the
   middle, the strongest last, as `levels.md` › Levels orders them.)
6. **Look.** (Greybox in the style of its slot's parts.)

The spec sheet shows the chrono and range table of each replica it fits without and with it.

## Checks

| Level | What is checked |
|---|---|
| Rules | Its Key is in the code; `stats.md` has its row; it fits by tag and fits a replica (a public part a public one; a dev part may wait, with a warning); it trades something; a level unlocks it; name and access. |
| Compatibility | Every replica it fits draws it; every kit with it, on every replica it fits, has sane numbers under the site limit (every combination of parts is tried, so two parts that clash are found). |
| Spec test | The chrono and range table without and with it, on each replica it fits; its meshes and triangles on each. Pictures: fitted on each, and in first person. |
| Balance run | Each public replica it fits, with it against without it, on every map, lighting, round mode and level: 40 to 60 % of decided rounds on public ones. A big swing means it is too strong or pointless. |
