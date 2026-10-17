# Bot figure (Blender source)

The realistic bot figures built in Blender: a human player figure and a bare robot. The owner approved v10 on
2026-10-12; v11 (IM8) lowers its kneel and crouch walk to the game's crouch. The game draws it (BF1) from
`src/assets/models/characters/human.glb` and `robot.glb` with their sidecars, for every player and bot since BD1 (before
it, behind the Dev switches, #175). Pictures are in the project files (`concepts/bot-figure-v10-2026-10-12/`, v11's
crouch in `concepts/figure-moves-fix-2026-10-12/`; earlier rounds in `concepts/bot-figure-v8-2026-10-11/`,
`concepts/bot-figure-v6-2026-10-11/` and `concepts/bot-figure-v5-2026-10-10/`). The figures are redesigned to look
more realistic in 0.1 Dev 6 from the owner's reference photos (`docs/DECISIONS.md` › Art direction and graphics): the
human (v12, RM9) in his own Blender, the robot (v12, RM10) in a cloud Blender, pictures in
`concepts/robot-figure-redesign-2026-10-13/`. The clips both share for Dev 6's new moves, resting on cover (M104) and the
vault (M102), are `bot18`'s; a file without them plays today's placeholders (`FIGURE_RIG.rest`, and the jump through a
vault, in `src/config/figureRig.ts`).

The human was redesigned first (v12, RM9, 13 Oct 2026, approved on its review pictures in
`concepts/human-figure-redesign-2026-10-13/`): a new body and gloved hands from his reference photos, four heads the
game picks per figure by its id, and the plate carrier and cummerbund in the team colour. It was built in his Blender
by `bot20`-`bot22` on top of the earlier layers; the robot's redesign is the robot thread's own layers (`bot18`,
`bot19`). The two share the skeleton, clip names and these scripts (`plans/bot-figure-handoff.md` in the project files).

## What is here

- `scripts/`: every script that builds the figures, in load order (`load.py` lists it): `bot_helpers`, `bot_body`,
  `bot_kit`, `bot2`-`bot4`, `bot_main`, `bot5`, `bot_final`, `bot6`-`bot23` (`bot18` and `bot19` are the robot
  redesign's, `bot20`-`bot22` the human's, `bot23` both figures' holstered clips), `bot_render`; then `session.py`
  (build, pose, render and export helpers) and `session16.py` (checking helpers: bake one clip, arm-in-torso and
  wrist metrics, finger solves on the real replicas and magazines, `export_v(kind, stem)`). `review_v12.py` (not
  part of the build) renders the v12 review pictures: turnaround, heads, hands on each replica, poses.
- The current figures are the game's `src/assets/models/characters/human.glb` and `robot.glb`, each with LOD1/LOD2
  meshes. The human is v12 (RM9): 19,966 triangles with its largest head (body and kit 17,468; heads high-cut
  2,498, cap 1,652, boonie 1,228, full-cut 1,128), one atlas of three materials (`Outfit`, `TeamColour`, `Lens`),
  1.74 m; v11's 23 clips with `bot18`'s six Rest clips and the Vault spliced in (RM10) and `bot23`'s Holster and
  Holster_Sprint (BP4), 32 in all; 2.95 MB packed.
  Blender's export and .blend are in the project files (`models/bot-human/v12/`). The robot is v12 (RM10, 13 Oct
  2026): `bot19` on v11's skeleton, built whole in the cloud with `bot18`'s clips, `bot23`'s two spliced in (BP4); 32 clips; 19,308 triangles, its
  headset head 2,374. Each has a sidecar (clip lengths, loops, speeds,
  `fitTo` stats, first-person parts to hide, `replicaOnGrip`: where each replica glb sits on the `Grip_R` bone, and
  `magazineInHand`: the reloads' magazines). The game's files are packed with `pack.mjs` (below).
- The figures before them (v11, 12 Oct 2026: v10, which is v6 plus the trigger finger, the reload that throws the old
  magazine and the hand and arm fixes of bot15-bot16, with bot17's `CrouchIdle` and `CrouchWalk`; 23 clips; the human
  19,832 triangles with the high-cut helmet head only, the robot 17,092 with team-paint panels): Blender's own exports
  of v10 are in the project files (`models/bot-human/v10/`), and v11 is those with bot17's two clips spliced in (Rebuild
  in the cloud). The earlier rounds are not kept (owner's tidy-up, 2026-10-12); their pictures are.
- `pack.mjs` (IM5): packs an export into the file the game ships, losslessly: drops the clip tracks the game drops at
  load anyway (a bone within 0.00001 of rest), stores the rest with meshopt's codec and re-deflates the PNGs, so the
  file is about half the size and draws pixel for pixel the same. Its encoder is the `meshoptimizer` package npm
  installs with `@types/three`; if that ever goes, `npm i --no-save meshoptimizer` before running it.
- `headless.py` (IM8): runs the scripts and `export_v` without Blender's window, on pip's `bpy` module (Rebuild in
  the cloud).
- `splice.mjs` (IM8): swaps named clips of an export for the same clips of another export of the same figure, by bone
  name, leaving everything else in the file as it is.
- `unpack.mjs` (BP4): turns a packed game file back into a plain export, so a clip can be spliced into a figure whose
  Blender export isn't kept; `pack.mjs` then packs it to the same bytes plus the new clips.
- `check/`: `arms-check.mjs` (wrists, elbows, skin and snaps per clip) and `render/` (the picture page and its shooter).

## What each script does

The scripts are layers, one per review round: each later one replaces some functions of the earlier ones in the same
namespace, so all of them run, in order, to rebuild v10. Their names are the round they came from, and `load.py`
keeps that order; renaming or merging them would mean re-checking the whole build in Blender, so they stay as made.
Read the newest layer first when looking for a function: it is the one that wins.

| Script | Round | What it adds or replaces |
|---|---|---|
| `bot_helpers` | v1 | Units, axes, mesh and material helpers |
| `bot_body`, `bot_kit` | v1 | Body and clothes; plate carrier, pouches, belt, holster and the high-cut helmet head |
| `bot2`, `bot3` | v2-v3 | Smooth body forms; sealed boots, soft carrier, belt holster and the clipping pass |
| `bot4`, `bot_main`, `bot5`, `bot_final` | v3-v4 | One-piece glove; `build_all`; one-piece trousers; the final join and height |
| `bot6`, `bot7` | v4 | Other heads (dropped in v5); the radio and pack as separate parts |
| `bot8`, `bot9` | v4 | The robot on the same skeleton; UVs and the generated textures |
| `bot10`, `bot11`, `bot12` | v4 | The skeleton and skin weights; the 21 clips; the neck cut for the first-person body |
| `bot13` | v5 | One human head, the bare robot, hands fitted to the replicas |
| `bot14` | v6 | Forearm twist and elbow bones, the arm solve, finger poses, the magazine reloads |
| `bot15`, `bot16` | v7-v10 | Trigger finger, the thrown old magazine, the support hand, arms out of the torso, the pouch draw |
| `bot17` | v11 | The kneel and the crouch walk as low as the game's crouch: the hips 0.62 m under standing (IM8) |
| `bot18` | v12 | Clips only, for either figure: the six Rest clips (resting on cover, M104) and the Vault (M102) |
| `bot19` | v12 | The robot made over: boxy armour, the headset head for all, flush team shoulders, one grey material |
| `bot20` | v12 | The redesigned human: combat shirt and trousers, carrier and pouches, gloves rebuilt finger by finger (knuckles, pads, a knuckle guard), the high-cut head (RM9) |
| `bot21` | v12 | The atlas bake, `finalise_v12` and `export_v12`; `TEAM_CARRIER` puts the carrier in the team colour |
| `bot22` | v12 | The cap, boonie and full-cut heads on copies of the balaclava, cloth a hat hides dropped (`HEAD_ORDER`) |
| `bot23` | v12 | Clips only, for either figure: Holster (arms hanging, hands empty) and Holster_Sprint (arms pumping), BP4 |
| `bot_render` | all | Picture cameras and lights |
| `session`, `session16` | v8-v10 | Build, pose, check and export helpers (`export_v`) |

## Facts the game needs

- The crouch: the game lowers a crouched player's hit volume by 0.62 m above the hips (`HITS.crouchDrop`) and holds
  the figure's upper body upright over its legs, so the kneel and the crouch walk lower the hips by the same 0.62 m
  (`bot17.py`; `render/figureLegs.test.ts` checks it in the shipped files). With the figures drawn, the hit volume's
  legs are the figures' own, read from the leg clips as the file loads (`render/figureLegs.ts`).
- The vault: the game lifts the body straight up onto the top in a crouch (0.6 of the way down), its feet just clear
  of it, and slides it across (`src/sim/vault.ts`). The Vault clip is played by the vault's progress, not by time: its
  first 40 % on the rise, the rest across (`VAULT_TOP`, `FIGURE_RIG.vault.top`), so it is a tucked hop in the body's
  own frame with the hips near the crouched hit volume's; the fall off the far side plays the Jump from its tuck. The
  bake lifts any frame whose boots would go under the root (`bot12` floor fix), so the feet always pass over the top.
  The match's hit-volume legs are the human's, any clip its file lacks taken from the robot's.
- The Rest clips (`Rifle_Rest`, `Rifle_RestUp`, `Rifle_RestDown` and the pistol's) are each aim clip leaned in over
  the cover, held at their first frame; the game blends the aim into them by how settled the rest is.

- Metres, facing glTF +Z; human 1.74 m (v12), robot 1.75 m to its highest point (`heightMetres` in the sidecar). Team colour: tint materials whose names start with `Team` (Alpha 0x3d8bff,
  Beta 0xff8a2a).
- Replicas are the game's own `aeg.glb` / `pistol.glb` (X right, Y forward, Z up). Hang the held one on `Grip_R` with
  the sidecar's `replicaOnGrip` matrix (Blender axes, row-major). `Pistol_*` clips, and `Switch` from 35 %, hold the
  pistol; all other clips hold the AEG.
- Upper-body clips (`upperBodyOnly`) are authored over a still pelvis: layer them over the legs' clip as they are.
- First person: the game never draws your own figure (MV2); `firstPerson.hide` (every head) is no longer read.
- Heads (v12): the human's head parts are listed in `parts.human.head` of `src/config/figureRig.ts`, in
  `HEAD_ORDER`; a figure wears `head[id % 4]`.

## Rebuild (Blender 5.2)

1. Put the scripts in `Documents\Airsoft models\work\` and `aeg_rifle.glb` / `gas_pistol.glb` in
   `Documents\Airsoft models\`.
2. In Blender's Python console: `bpy.app.driver_namespace['bot'] = {}`, then run `load.py`, then `session.py` with
   `exec(..., bpy.app.driver_namespace['bot'])`.
3. Then `session16.py` the same way. `B = bpy.app.driver_namespace['bot']`; `B['export_v']('human', 'bot_human_v10')`
   (or `'robot'`) builds the figure with its own finger tables, exports the glb and sidecar and saves the .blend.
   The v12 human: `B['export_v12']('bot_human_v12')` (make sure `O['Rig'].animation_data` exists first).
4. Pictures: `B['proxies']()` then `B['figure_shots'](prefix, parts, head, first_person_parts)`.
5. Pack each export for the game, from the repo root: `node tools/blender/bot-figure/pack.mjs bot_human_v10.glb
   src/assets/models/characters/human.glb` (and `robot`), and copy the sidecar beside it as `human.json`.

## Rebuild in the cloud (headless, IM8)

The robot (v12) is built whole in the cloud: steps 1 and 2 below, then `BF_HOME=<folder> python
tools/blender/bot-figure/headless.py robot bot_robot_v12` (about 30 s), pack it as in Rebuild step 5 and copy
`bot_robot_v12_animations.json` beside it as `robot.json`.

A new clip for figures already shipped goes into the game's files themselves (BP4: a rebuild moves a few of the
robot's vertices, and the human's export is v12's): build either figure headless with the new layer (step 3 below),
then for each figure `node tools/blender/bot-figure/unpack.mjs src/assets/models/characters/human.glb human_plain.glb`,
`splice.mjs human_plain.glb <folder>/bot_robot_x.glb human_x.glb Holster,Holster_Sprint` (the clips are the same on
both figures' shared skeleton), `pack.mjs human_x.glb src/assets/models/characters/human.glb`, and add the clips'
entries from the build's sidecar to `human.json` (and the same for the robot).

For the human, re-make a clip without the owner's Blender, then put it into the approved v10 export (a headless build
reproduces the clips to about 0.000001 but not the meshes to the bit):

1. A Python 3.11 virtual environment with `pip install bpy==5.0.0` (about 400 MB).
2. A folder (`BF_HOME`) with `aeg_rifle.glb` and `gas_pistol.glb` and `work/mags.json`, from the project files
   (`models/aeg-rifle/`, `models/gas-pistol/`, `models/bot-human/scripts-v4/`).
3. `BF_HOME=<folder> python tools/blender/bot-figure/headless.py human bot_human_v11` (and `robot`): about 40 s each.
4. `node tools/blender/bot-figure/splice.mjs <project files>/models/bot-human/v10/bot_human_v10.glb
   <folder>/bot_human_v11.glb <folder>/bot_human_v11s.glb CrouchIdle,CrouchWalk`, then pack that file for the game
   as in Rebuild step 5. The sidecar stays as it is while the clips' lengths, frames and speeds do (compare
   `<folder>/bot_human_v11_animations.json`).

## How the hands hold the replicas (bot13)

- The right fist sits low and turned 40 degrees on the AEG grip (`RIFLE_SEAT`), so the web is on the backstrap, the
  thumb wraps the far side and the trigger finger lies straight along the frame. The pistol grip is fitted into the
  same fist (`PISTOL_IN_RIFLE_GRIP`).
- Finger poses (`HOLDS`) were solved against the real replica meshes (`wrap_finger`, `lay_finger`, `thumb_to`
  helpers), with no finger segment more than about 2 mm into the surface.
- Rifle poses stand bladed (`RIFLE_TWIST` -30 degrees, -60 aiming high) so the left hand reaches the handguard
  (`SUPPORT_ON_REPLICA`) with the butt kept in the shoulder. On the pistol the left hand wraps over the right.

## Arms, wrists and hands (bot14, v6)

- **Forearm twist bones** `ForearmTwist1-4_L/R` share the hand's turn along the forearm, so the wrist joint itself
  never twists and the skin keeps its thickness. **Elbow helpers** `ElbowHelper_L/R` turn half as far as the forearm
  and carry the crease, so deep bends don't pinch. All are ordinary bones; three.js plays them as they are.
- **Arm solve**: each frame the elbow swings round the shoulder-wrist line to where the wrist bends and the forearm
  turns least, close to the clip's elbow and at most 15 degrees from the previous frame's (no snaps).
- **Seats and fingers** re-solved against the real replicas (`RIFLE_SEAT`, `PISTOL_SEAT`, `SUPPORT_ON_REPLICA`,
  `FINGER_ANGLES`): the right hand wraps the grip with the index on the trigger; the support hand cups the handguard;
  on the pistol the left hand wraps the right.
- **Moving fingers**: `Rifle_Fire` and `Pistol_Fire` are one trigger press each (0.2 s, play additively per shot);
  Idle re-grips; the reloads open and close the hands.
- **Reloads with a magazine**: the left hand takes a spare from the pouch and seats it, in step with the replica's own
  Reload clip; the pistol reload starts with the thumb on the release. The sidecar's `magazineInHand` says when to
  show a copy of the replica's magazine on `Hand_L` and where (`magazineOnBone`).
- Sprint carries the rifle low, muzzle down; the hit call and the switch turn the hands the natural way round (in
  the switch the left hand waits on the chest and meets the pistol there). The pistol reload holds the pistol in front
  of the chest with both elbows down. Aiming low the cheek rests on the stock; aiming high the head stays on it
  (`HEAD_FIX`). The glove's wrist strap and knuckle guard are smooth (`smooth_hand_hard`).

## Trigger, magazines and the arm in the reloads (bot15-bot16, v7-v10)

- **Trigger finger**: the index pad crosses the AEG blade's face and the tip curls past it (`FINGER_ANGLES`, solved
  with the finger capsules no more than 1.2 mm into the replica outside the blade); `Rifle_Fire` / `Pistol_Fire`
  press it (0.1 s).
- **Old magazine thrown**: the left hand catches the dropping magazine, strips it, opens just before release and
  throws it (down and out to the figure's left, `TOSS_DIR` and `TOSS_SPEED`: clear of the fingers one frame after the
  release); the sidecar's `magazineInHand.<clip>.oldMagazine` says when to show it on `Hand_L` (its own
  `magazineOnBone`), when to let it fly and with what velocity and spin. Only one magazine is ever in view
  (`replicaMagazineHidden`). While reloading, show the whole figure (not a merged `Figure` mesh) so the hand copies
  ride on `Hand_L`.
- **New magazine**: the left hand closes on it at the top of the left chest pouch and brings it out (`POUCH_MOUTH`,
  `POUCH_HOLD`, `DRAW_OUT`); it shows in the hand once clear of the vest (`DRAW_SHOW`). The hand closes round it,
  solved against the real magazine meshes per figure (`MAG_FINGERS`, `MAG_KIND`). Pistol: base plate in the middle of the palm, fingers round the lower body (`PALM_SEAT`,
  `seat_in_palm`); the fingers open as it goes into the grip (`PUSH_OPEN`) and the palm pushes it home.
- **Arm outside the body**: in the pistol reload the elbow solve also keeps the left upper arm and forearm out of the
  torso (`torso_clear`, `TORSO_COST`); forearm turn stays within the support hand's palm-up range (about 95 degrees).
- **Vest straps**: Kit vertices on the shoulders copy the Body's shoulder weights (`kit_follow_shoulders`), so the
  shoulder no longer pushes through the strap when the arm reaches for a pouch.

## Arms and hands check

`node tools/blender/bot-figure/check/arms-check.mjs <figure.glb>` (from the repo root) plays every clip and lists
anything over the limits:
- wrist bend over 75 degrees, wrist-joint twist over 60, or a forearm turned more than 95;
- wrist or elbow skin thinner than 85 % of rest;
- an arm bone turning more than 40 degrees in one frame.

It also prints the finger movement per clip. v5 had 111 (human) and 53 (robot) results over the limits; v6 to v10 have 0
on both.

## Pictures without Blender

`check/render/`: a three.js page that poses an exported figure with the game's replicas (and their own Reload clips in
step). In a scratch folder: symlink `three` to the repo's `node_modules/three`, copy the figure glbs and sidecars,
`src/assets/models/replicas/aeg.glb` and `pistol.glb` and `index.html`, run `python3 -m http.server 8765` and make an
`out/` folder. Copy `shoot.mjs` into the repo root (so it finds playwright), run
`node shoot.mjs bot_human_v10,bot_robot_v10 jobs.json` from the scratch folder, then delete the copy. A job:
`{"name":"aim","stem":"bot_human_v10","clip":"Rifle_Aim","t":0.3,"hold":"rifle","rep":null,
"views":[{"n":"a","target":"Hand_R","dist":0.5,"yaw":45,"pitch":-30}]}` (yaw 0 is in front of the figure). A job's
optional `extra` places the figure and adds grey boxes, for a move over cover: `{"root":[x,y,z],
"boxes":[[cx,cy,cz,sx,sy,sz]]}` (metres, the page's axes: y up, the figure facing +z).
