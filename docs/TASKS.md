# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M33b · Glowing BBs: a Customise option on each replica, on at night by default
tier: ui
perf: required
touches: src/config/glowBBs.ts, src/config/render.ts, src/map/mapTypes.ts, src/pool/loadoutModel.ts, src/settings/storage.ts, src/render/bbRenderer.ts, src/render/combatPresentation.ts, src/matchSession.ts, src/rangeSession.ts, src/ui/menus/loadoutScreen.ts, docs/
contract: MapData gains an optional `night` field (additive; the map block format is unchanged); the settings store gains `glowBBs.<replica id>` (a new field, no version change)
acceptance:
  1. Each replica's Customise screen has a Glowing BBs row beside BB weight and hop-up: At Night (the default), Always, Off; the pick is saved per replica
  2. Glowing BBs are drawn green, a little larger far away and with a longer streak; other BBs look as before; nothing about their flight changes
  3. With At Night they glow only on a field played at night (MapData.night); Always glows on every field, the practice range included; Off never
  4. Bots (teammates and opponents) load glowing BBs on night fields only
  5. No per-frame allocation and no extra draw calls (the same instanced mesh and line buffer)
status: building
attempts: 1
