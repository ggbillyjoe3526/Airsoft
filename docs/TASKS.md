# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M32 · Cyber Pistol: a Legendary-only chase replica (owner's design)
tier: core
perf: required
touches: pool.md, stats.md, src/config/replicas.ts, src/config/sounds.ts, src/config/bots.ts, src/config/menus.ts, src/config/dev.ts, src/pool/pool.ts, src/pool/collection.ts, src/pool/loadoutModel.ts, src/pool/armory.ts, src/pool/botKit.ts, src/audio/sfx.ts, src/render/combatPresentation.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/armoryScreen.ts, src/matchSession.ts, src/game.ts, src/style.css, CHANGELOG.md, docs/
contract: pool.md's format (two optional columns, Tiers and Drop %, and the tag built-in-power); stats.md's Replicas table (a cyber row); MatchSetup (an optional chaseOwned list)
acceptance:
  1. pool.md has the Cyber Pistol (000019, key cyber) with Tiers `Legendary` and Drop % 0.25; a bad tier name or Drop % is reported with its line and the row skipped; blank cells change nothing
  2. Carried at Legendary it has the approved numbers: 1.00 J on 0.25 g, 14 BBs/s, 0.30° spread, 0.06° kick, 50 BBs × 3, 1.1 s reload, 0.28 s draw, Semi (default) / Burst / Auto, on target to about 33 m out of the box and short of a tuned AEG at best
  3. Shots: each item is the Cyber Pistol on its own 0.25 % chance, always Legendary; the rest stay equally likely; a pool with no chase rows draws exactly as before; the ten-Shot guarantee holds
  4. It never exists below Legendary: Unlock all gear lends it at Legendary only, bots carry it at Legendary, as it comes is Legendary
  5. Customise shows Built-in battery and its own magazine and no part choices (Optic, Grip, Laser, Barrel, Muzzle greyed); hop-up and BB weight still turn
  6. On Hard, once the player owns it (or Unlock all gear is on), 5 % of matches (seeded) give one opponent the Cyber Pistol as their primary, on Auto, keeping their secondary; never on Easy or Normal, never for teammates
  7. Its shots, dry fire and magazine sound its own (quiet, electronic, no AEG motor), heard by bots as far as any replica; every replica a character carries has its sounds, even when the player doesn't carry it
  8. Its first-person model is its own chunky pistol in mint, hot pink and black, in the replicas' procedural style; the Armory shows it as a chase item with its odds
status: building
attempts: 0
