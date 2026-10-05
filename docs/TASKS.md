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

## G2 · Replica and part models, item pictures (graphics overhaul, 0.1 Dev 5)
tier: core
perf: skip
touches: src/render/replicaModels.ts, src/render/itemPictures.ts, src/config/itemPictures.ts, src/config/replicaFinish.ts, src/config/schemes.ts
contract: none (the part tables keep every name; every hand point, the handguard envelope, the optic axis and the muzzle layouts stay as they are)
acceptance:
  1. The rifle, Gas Pistol and Cyber Pistol and every part in their tables are the concept's blockier, two-tone builds: body, furniture, details, a thin accent line (glowing on Ghost) and steel in the replica's scheme; the Cyber Pistol a white slab with glowing cyan lines and a magenta core over a dark frame, grey and unlit under Realistic colours.
  2. Low draws no more triangles than before G2 (rifle 10,844, pistol 7,944 at once) and stays plain (no texture coordinates, vertex colours or maps); High stays within its budget (rifle 17,500, pistols 11,000) and every part stays at most four draw calls.
  3. Aiming, reloads and muzzles work as before: the red dot's window holds the view centre at the strongest kick, the BB leaves each fitted device's front face, the support hand reaches each magazine's base.
  4. An item-picture renderer draws a replica (with any parts fitted, in any scheme) or one part on its own off screen, from the same models without hands, at most one a frame, kept for the visit; a failed draw is retried on the next ask.
status: building
attempts: 0
