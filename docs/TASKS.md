# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M33d · Woodland's layout, playable only with Dev settings › Access maps in development
tier: core
perf: required
touches: src/map/woodland.ts, src/map/maps.ts, src/map/mapTypes.ts, src/config/materials.ts, src/config/dev.ts, src/config/matchRules.ts, src/render/mapMeshes.ts, src/ui/optionPicker.ts, src/ui/menus/choiceDialog.ts, src/ui/menus/menus.ts, src/ui/recordsView.ts, src/matchSession.ts, src/game.ts, docs/
contract: MapData gains an optional `inDevelopment` (additive); BlockKind gains `tree`, `boulder`, `log` and `fence` (additive); the Dev settings gain `mapsInDevelopment` (a new `dev.` field, no version change); the team size setting accepts 4 and 5
acceptance:
  1. Woodland follows the approved concept: 120 × 80 m on sloping ground (end 0 low, a 3.4% rise to the Knoll, the Knoll's top +6.5 m with a log fort and the flag, end 1's camp behind its crest), three lanes (Pine Belt, Meadow, Creek with the cabin and the sunken track), trees, boulders and logs as cover, a fence round the edge; every slope walkable; each lane clear and walkable; spawns, dead zones and the flag on walkable ground; the two camps can't see each other
  2. Woodland is a night field (glowing BBs at night) with five spawns a side; picking it sets 4v4, the Match pop-up offers up to 5v5 on Woodland and up to 3v3 on Depot
  3. By default Woodland stays greyed out as Coming soon and can't be played; Dev settings › Access maps in development (off by default) opens it in the Map pop-up with an In development tag; turning it off again plays Depot, at no more than 3v3
  4. Matches on a map in development don't go into the records, and New game and the summary say why; Field Credits are paid as usual
  5. Bots play full matches on Woodland in both modes without getting stuck (headless match tests); Depot plays exactly as before
status: building
attempts: 1
