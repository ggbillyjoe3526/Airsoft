# Adding content

How a new replica, part, map, mode or skin gets into the game: the rulebooks, the briefs, the checks and the report.
Read it before adding any content; the `new-content` skill (`.claude/skills/new-content/SKILL.md`) walks a thread
through it.

## The steps

1. **Ask.** The owner tells Claude in a thread what he wants ("a DMR", "a holo sight") (owner, 2026-10-05).
2. **Brief.** Claude asks the questions in that type's rulebook, offers a default for each, and writes a spec sheet from
   the answers for the owner to approve: the item's numbers beside the content already in the game, what it is good and
   bad at, its look and its sound.
3. **Build.** Claude adds the rows to `pool.md` and `stats.md`, any code, the model and the sounds. New content is
   always tagged `dev`, so only the owner sees it (Settings › Dev › Dev content).
4. **Check.** `node pipeline/content-check.mjs <item>` runs the checks, quickest first (below).
5. **Report.** The command writes a one-page report in plain words, with pictures. The thread attaches it.
6. **Playtest.** The owner tries it with Dev content on. When he says "make it public", the public gate runs and only
   then does `dev` become `public`.

A fail stops an item going public. A warning ("look at this") is shown to the owner and he decides.

## The rulebooks

| Type | Rulebook | Checks built |
|---|---|---|
| Replicas | `docs/content/replicas.md` | All four levels |
| Parts (optics, grips, lasers, magazines, barrels, muzzles, lights, power sources) | `docs/content/attachments.md` | All four levels |
| Maps | `docs/content/maps.md` | Not yet (toolkit part 2) |
| Game modes | `docs/content/modes.md` | Not yet (toolkit part 3) |
| Skins | `docs/content/skins.md` | Not yet (toolkit part 4, with skins) |

Every type keeps the standing rules: one hit is one hit, toys not firearms, no real brand names or copied trademarked
designs, nothing map-only, and an ID (pool ID, map id, mode id) never changes once given.

## The four levels

1. **Rules:** is everything filled in, correctly, and wired up? (seconds)
2. **Compatibility:** does it work with everything it is meant to work with? (seconds)
3. **Spec test:** does it shoot, look and cost what the spec sheet says? Numbers, model cost, sound and pictures.
   (about a minute, 2026-10-11)
4. **Balance run:** headless bot matches on every map, lighting, round mode and level: is it fair? (about 3 minutes per
   map, lighting and pairing at the default 8 seeds; the maps run in parallel, 2026-10-11)

Levels 1 and 2 run for every asset in every pull request (`src/content/content.test.ts`). Levels 3 and 4 run on demand.

## The command

```
node pipeline/content-check.mjs <item|all> [--balance] [--public] [--levels a,b] [--maps a,b]
                                [--seeds n] [--seconds n] [--no-pictures] [--url u]
```

- **`<item>`** is a pool ID, name or Key (`000007`, `"Red Dot"`, `redDot`). `all` runs levels 1 to 3 on every asset,
  without pictures.
- **`--balance`** adds level 4. **`--public`** is the public gate: all four levels at full length.
- **`--maps`** limits the balance run (`depot,woodland`); each map runs in its own process, in parallel.
- **`--no-pictures`** skips the pictures, which need the e2e build and a browser (it builds and serves the build
  itself; set `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` in a cloud container).

It writes `pipeline/out/content/<id>/report.md`, `report.html` (one file, the pictures inside it), `report.json` and
`pictures/`, and exits 1 when a check fails or a runner could not run. The thread copies the report to
`/mnt/project-files/content-reports/<id>/` and attaches the HTML page.

## Balance

- **The target.** A new replica's or part's team wins 40 to 60 % of decided rounds against what is there
  (owner, 2026-10-05). A replica plays each ordinary public replica of its class; a part plays its replica with and
  without it. Its team should also land at least half as many hits as the other.
- **Public counts.** Figures on public maps, modes and levels are judged. Dev ones are shown as information
  (owner, 2026-10-05).
- **Noise.** A figure outside its band but within noise asks for a look: re-run on more seeds (`--seeds 16`) before
  acting.
- **Overrides.** A failed balance check can be overridden by the owner with a reason. The reason goes into
  `docs/DECISIONS.md` and the item into `ALLOWED_STRONGER` (`src/config/contentRules.ts`): its figures are then shown
  and never judged (the Cyber Pistol, a chase item, is the first).
- **Extraction** is not in the balance run yet: it plays as runs, not rounds, and gets its sweep with the mode checks.

## Going public

1. The owner has played it and says "make it public".
2. Run `node pipeline/content-check.mjs <item> --public`. Every fail is fixed or overridden (above); every warning is
   put to the owner and he accepts it.
3. Change its Access to `public` in `pool.md` (or its tag in the map or mode registry) and add it to `PUBLIC_ITEMS` in
   `src/config/contentRules.ts` with the date and the owner's word. A `public` item missing from that register fails
   the rules check, so nothing skips the gate.

## Where the rules live

- **Rulebooks and briefs:** `docs/content/`.
- **The numbers the checks use** (normal ranges, budgets, the balance band, the registers of exceptions):
  `src/config/contentRules.ts`. Changing a range or a band is an owner decision.
- **The checks:** `src/content/` (`src/content/README.md`). **The command and the report:** `pipeline/content-check.mjs`,
  `pipeline/contentReport.mjs`, `pipeline/content-pictures.mjs`.
