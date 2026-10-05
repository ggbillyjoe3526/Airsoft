# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

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
