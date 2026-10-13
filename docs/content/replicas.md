# Replicas

The rulebook, brief and checks for a new replica. The steps are in `docs/content/README.md`.

## Rules

Must:

- **One hit is one hit.** A replica differs in how it loads, cycles, sounds, handles and runs out, never in damage.
- **Toy, not firearm.** Light recoil, plastic sounds, no real brand names or copied trademarked designs. The name is in
  Title Case.
- **Under the site limit.** Its energy stays under its class's limit (rifle 1.2 J, pistol 1.0 J, `stats.md` › Site
  limits) with the strongest power source and parts fitted. The limit caps a stack; the replica as it
  comes must be under it on its own.
- **Normal numbers.** Fire rate, energy, BB weight, magazine, reload, draw, spread, kick and hop-up stay inside the
  game's normal ranges for its class (`REPLICA_RANGES` in `src/config/contentRules.ts`), unless the brief says why
  (the reason goes into `RANGE_EXCEPTIONS`).
- **Tagged right.** Its class (`rifle`, `pistol`) and exactly one drive tag (`electric`, `gas`, `spring`), or none
  with the power built in (`built-in-power`, as the Cyber Pistol).
- **Drawn and heard.** A model at Low and High that draws every part that fits it and its magazines, within the model
  budget (`MODEL_BUDGET`); a shot, dry-fire and magazine sounds for how it is driven; an aim hold when an optic fits.
- **A new ID.** The next free pool ID. It never changes once given (saves use it).
- **Dev first.** Tagged `dev` until the owner makes it public (`docs/content/README.md` › Going public).

Should:

- **A power source at its level.** A power source that fits it unlocks at its level or below (`levels.md`), so it
  shoots as soon as it is unlocked. A replica with its power built in needs none.
- **Every tag used.** Each tag it has is used by a part, or the report says so.
- **A trade-off.** Better than the others at something and worse at something else. Better at everything is for a
  top-level reward like the Cyber Pistol (level 10), with the owner's OK (`ALLOWED_STRONGER`).

## Brief

The questions Claude asks, with the default in brackets:

1. **Name and type.** (A plain made-up name, a type the game has: AEG, gas pistol, later SMG, DMR, shotgun, spring.)
2. **What it is for.** Close, middle, long range or all-round. (All-round.)
3. **Fire modes.** (As its type: an AEG full and semi, a pistol semi.)
4. **How it compares.** What it is stronger and weaker at than the replicas there. (A sidegrade: one clear strength,
   one clear weakness.)
5. **Level.** Which level unlocks it: its Name in a level's Unlocks in `levels.md`. (A new level above the cap, so it
   is something to play towards.)
6. **Which parts it takes.** Rails, magazines, barrel mount, muzzle thread. (Those of its type.)
7. **Bots.** Which levels may carry it. (Every level.)
8. **Look and sound.** Colours, shape, how it sounds. (Greybox in its type's style, its drive's sound.)

The spec sheet Claude writes from the answers: its numbers (the `stats.md` row), the chrono and range table beside every
replica there (the spec test's table, below), what it is good and bad at, its look and its sound.

## Checks

| Level | What is checked |
|---|---|
| Rules | Its Key is in the code; `stats.md` has its row and class; class and drive tags; fire modes; numbers inside the ranges; under the site limit as it comes; a level unlocks it; name and access. |
| Compatibility | Its model draws every part that fits it and its magazines; magazines that fit are in its config; a power source fits (one unlocked by its level, or a warning); every tag is used; Customise shows the right rows; its sounds exist; an aim hold when an optic fits; every kit of parts it can wear has sane numbers under the site limit; bots can carry it, as it comes and with each part that fits, and a kit in `bot-kits.md` brings it (a warning if none does); a fitted kit saves and loads. |
| Spec test | Chrono speed and energy for 0.20, 0.25, 0.28 and 0.30 g BBs; how far it stays on target with its factory hop-up and its best; height against the aim line at 20, 30, 40 and 50 m; grouping at 10 and 25 m; fire rate, magazine, time to empty it, reload and draw; all beside the other replicas. Model cost at Low and High against the budget, each part's meshes; shot loudness within 6 dB of the others; a warning if it beats every other replica at everything. Pictures: alone and in first person. |
| Balance run | Its team against a team carrying each ordinary public replica of its class, on every map, lighting, round mode and level: 40 to 60 % of decided rounds on public ones, and at least half as many hits as the other team. |

## Known limits

- Bots lead and judge their friendly line by the first replica of the default loadout, not by the one they carry
  (`docs/KNOWN_ISSUES.md`). A replica whose BBs fly much slower than the AEG's may test weaker with bots than with
  players.
- Bots carry their primary only, so the balance run gives each bot one replica.
