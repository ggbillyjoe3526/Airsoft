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

## G7 · Characters and arms (graphics overhaul, 0.1 Dev 5)
tier: core
perf: required
touches: src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/figureMix.ts, src/render/figureParts.ts, src/render/figureShapes.ts, src/render/figurePalette.ts, src/render/figureHuman.ts, src/render/figureRobot.ts, src/render/figureHands.ts, src/render/figureReplicas.ts, src/render/handModels.ts, src/render/robotHands.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/render/matchPresentation.ts, src/matchSession.ts, src/rangeSession.ts, src/config/characters.ts, src/config/replicaFinish.ts, src/config/look.ts
contract: none (buildFigure's rig, figureMuzzle and FIGURE.rifle / FIGURE.pistol stay; a figure model's parts still replace the built ones)
acceptance:
  1. Figures are humans and robots built in code. With Robots on, every team of two or more mixes both looks from the match seed (robotFigures, apart from the sim's stream); off, every figure is human. No skin shows on any head.
  2. Four masked human heads (high-cut helmet, bump helmet, balaclava, full-face visor) and a robot head; the team colour is exact on every part of every figure (plate carrier all round the torso, knee pads, armbands), colour-blind sets included; robots wear a light or dark shell by team; third-person replicas are the blocky two-tone replicas in the team's bot scheme (Realistic colours honoured, the Cyber Pistol in its own colours).
  3. The rig behaves as before: six merged meshes on one vertex-coloured material, muzzles where figureMuzzle says, aim, pistol and hit poses, the HIT! callout, a fitted silencer and torch; a figure model's named parts still replace the code-built ones, on robots too.
  4. Low draws no more triangles per part and no more draw calls per figure than before G7 (legs 424, body 1,392, rifle arms 1,064, pistol arms 824, hit pose 1,028; four drawn at once); High stays under 7,500 triangles drawn per figure.
  5. First-person arms in the new style: dark gloves, camo sleeves from the team colour, the team armband; robot arms (shell, joints, team panel) when the player's own slot is a robot; hands keep every grip pose; Low no dearer in triangles or draw calls.
  6. Every geometry and material made is disposed when a figure or the arms are rebuilt and when the match ends.
status: building
attempts: 0
