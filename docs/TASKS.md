# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## G1 · Look settings and replica colours (graphics overhaul, 0.1 Dev 5)
tier: ui
perf: skip
touches: src/config/schemes.ts, src/config/look.ts, src/config/menus.ts, src/config/matchRules.ts, src/render/figureMix.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/pool/loadoutModel.ts, src/settings/storage.ts, src/ui/lookSettings.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/menus.ts, src/ui/menus/savedChoices.ts, src/ui/menus/icons.ts, src/matchSession.ts, src/rangeSession.ts, src/game.ts
contract: settings store keys (by addition: `robots`, `realisticColours`, `scheme.<replica asset id>`)
acceptance:
  1. Eight two-tone schemes (Cobalt, Signal, Acid, Teal, Hazard, Coral, Onyx, Ghost) and four plain families; each scheme maps to one family (Cobalt and Onyx to Black, Signal, Hazard and Coral to Tan, Acid and Teal to Ranger green, Ghost to Wolf grey).
  2. Each replica asset keeps a scheme in the save (`scheme.<asset id>`); before a pick the rifle is Cobalt and the pistol Ghost; an older save without the key reads the default; bots carry their team's schemes.
  3. Settings › Look has Robots (default on) and Realistic colours (default off), saved, passed to the match and the range.
  4. The held replicas are drawn in their scheme's colours (body, furniture, small parts, steel), or the family's under Realistic colours; the Cyber Pistol keeps its own colours unless Realistic colours is on; every material made is disposed.
  5. With Robots on, each team of two or more mixes humans and robots, picked from the match seed apart from the sim's stream; off, none (figures use it from G7).
status: building
attempts: 0
