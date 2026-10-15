# Maps

The rulebook, brief and checks for a new map (toolkit part 2, CT2). The steps are in `docs/content/README.md`; the
command is `node pipeline/content-check.mjs map:<id>`.

## Rules

Must:

- **A real field.** The owner's checklist: cover, barricades, buildings, windows, doorways, choke points, flanking
  routes, objective spots, dead zones and spawn areas.
- **Nothing map-only.** Every effect (night, lights, fog, sound) is an engine feature the map switches on in its data.
- **Room for the largest team.** Enough spawns and dead-zone spots for the largest team size it offers.
- **Fair ends.** Neither spawn sees the other; no sightline longer than its kind of field allows; both teams reach the
  middle and the flag in about the same time (within about 15 %), and Elimination's overtime flag too (within 15 %, and
  inside the overtime's 30 s at a run).
- **On the floor.** Every spawn, dead-zone spot, lane point and flag sits on the floor; ramps are walkable; nothing is
  inside anything else; the floor of last resort is below everything.
- **No team colours.** No paint in a team colour, so who is who stays clear.
- **Dark for everyone.** Light pools count for the bots too.
- **Fast enough.** It holds 60 fps on Low on a modest laptop.
- **A fixed id, dev first.** Registered in `src/map/maps.ts`, tagged `dev` until the owner makes it public.
- **Named areas.** Short names for its places (`MapData.areas`), the ones a player would shout: the bots call them
  ("Contact, Dock!") and the minimap shows the one you stand in. Every walkable spot is in one.

The standard is Depot's measured layout (sightlines, walk times, lanes); a map that differs says why in its brief
(owner, 2026-10-05).

## Brief

The questions Claude asks, with the default in brackets:

1. **Kind of field.** CQB, woodland, urban or mixed. (Mixed.)
2. **Size and team sizes.** (Depot's size, 3v3 to 5v5.)
3. **Modes.** Attack / Defend needs a flag spot; Extraction needs cases and exits; Elimination's overtime needs an
   overtime flag spot near the middle, out of the bushes. (Elimination and Attack / Defend, with an overtime flag.)
4. **Time of day.** Day, night or both. (Both.)
5. **Look and sound.** (Greybox with its kind's colours and ambience.)
6. **A sketch** for the owner to approve before the build, as Depot's rework had.

## Checks

Every map in `src/map/maps.ts` gets levels 1 to 3's fast checks in every test run (`src/content/mapChecks.test.ts`), so
a new map is checked the moment it is registered. The numbers are `MAP_STANDARD` in `src/config/contentRules.ts`, set
from Depot's measured layout; a map that differs for a reason goes into `MAP_EXCEPTIONS` with the owner's word.

| Level | What is checked |
|---|---|
| Rules | Registered with a blurb and team sizes; `dev`, or `public` and in `PUBLIC_MAPS`; spawns and dead-zone spots for the largest team; every spawn, dead-zone spot, lane point and flag on walkable floor; ramps and ground 1:2 or gentler; the floor of last resort under everything; no block inside another (written-down exceptions only); nothing painted in a team colour (neon light is not paint); look-only blocks lying flat; night and lights agree; named areas (for the bots' callouts and the minimap) covering every walkable spot, each name at most 14 characters. The modes it plays and its Extraction data are shown (Extraction data has its own tests over every map). |
| Layout | Lanes (Depot's 3; 2 asks for a look, 1 fails); every lane walks end to end, from end 0 towards end 1; every spawn reaches the other end, the flag and the middle on foot; nobody near one end's spawns sees anyone near the other's, standing or crouched; the longest clear sightline (Depot's 34 m); each end's walk to the middle within 15 % (25 % asks for a look); the attackers walk at least 1.6 times as far to the flag as the defenders, and can't see it from their spawn; each end walks to the overtime flag within 15 % (over 15 % asks for a look, over 25 % fails), inside the overtime's time at a run (else a look), and it stands out of the bushes (a map without one asks for a look); every block drawn inside its own box, so a BB never passes through what a player sees. The report sets the map's figures beside every other map's. |
| Spec test | The perf gate measures the map (perf-budget.json's matrix); on demand, the perf run in Elimination on Low, Medium and High against its budget and baseline, and pictures: from above, the minimap, and the view from each end's spawns, per lighting. |
| Balance run | On demand: every lighting and round mode it offers, every level, at its standard team size. Each end wins 40 to 60 % of decided rounds at Pro (35 to 65 % below, Audit 2 decision 3); under 1 round in 10 runs out the clock; under 1 bot in 20 never leaves spawn in a round; under 1 bot stuck with nothing to do per 10 bot-minutes; nobody falls through. In Extraction, whole runs against the map's bands (`src/ai/balance/extractionBands.ts`), under 1 run in 10 on time, each harder level harder to get out from; a round mode other than Elimination also has the objective decide some rounds and pays in line with Elimination (`docs/content/modes.md` › Checks). Judged on a public map, mode and level; shown as figures otherwise. |
