# Maps

The rulebook and brief for a new map. Its checks come with toolkit part 2; until then a map is checked by its own tests
and the owner's playtest. The steps are in `docs/content/README.md`.

## Rules

Must:

- **A real field.** The owner's checklist: cover, barricades, buildings, windows, doorways, choke points, flanking
  routes, objective spots, dead zones and spawn areas.
- **Nothing map-only.** Every effect (night, lights, fog, sound) is an engine feature the map switches on in its data.
- **Room for the largest team.** Enough spawns and dead-zone spots for the largest team size it offers.
- **Fair ends.** Neither spawn sees the other; no sightline longer than its kind of field allows; both teams reach the
  middle and the flag in about the same time (within about 15 %).
- **On the floor.** Every spawn, dead-zone spot, lane point and flag sits on the floor; ramps are walkable; nothing is
  inside anything else; the floor of last resort is below everything.
- **No team colours.** No paint in a team colour, so who is who stays clear.
- **Dark for everyone.** Light pools count for the bots too.
- **Fast enough.** It holds 60 fps on Low on a modest laptop.
- **A fixed id, dev first.** Registered in `src/map/maps.ts`, tagged `dev` until the owner makes it public.

The standard is Depot's measured layout (sightlines, walk times, lanes); a map that differs says why in its brief
(owner, 2026-10-05).

## Brief

The questions Claude asks, with the default in brackets:

1. **Kind of field.** CQB, woodland, urban or mixed. (Mixed.)
2. **Size and team sizes.** (Depot's size, 3v3 to 5v5.)
3. **Modes.** Attack / Defend needs a flag spot; Extraction needs cases and exits. (Elimination and Attack / Defend.)
4. **Time of day.** Day, night or both. (Both.)
5. **Look and sound.** (Greybox with its kind's colours and ambience.)
6. **A sketch** for the owner to approve before the build, as Depot's rework had.

## Checks (toolkit part 2)

| Level | What will be checked |
|---|---|
| Rules | Registered and `dev`; everything on the floor; enough spawns and dead-zone spots; no block inside another; no team-colour paint; night and lights agree. |
| Layout | Lanes; spawns can't see each other; the longest sightline; every lane walkable end to end; walk times within about 15 %; no gap a BB passes but a player can't see through; Extraction data gets today's Extraction checks. |
| Spec test | The performance run at Low, Medium and High against the budget; an overhead view, the minimap and views from each spawn. |
| Balance run | Every mode it offers, every level, day and night: each end wins 40 to 60 %, under 1 round in 10 runs out the clock, bots leave spawn, nobody gets stuck or falls through. |
