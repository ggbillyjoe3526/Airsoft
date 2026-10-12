# Bot figure (Blender source)

The realistic bot figures built in Blender for the owner's review: a human player figure and a bare robot. **Not in
the game yet**: the owner approves the pictures first, and in the game they stay behind the Dev switches "Disable
figure models" and "Disable all models" (#175). Pictures are in the project files (`concepts/bot-figure-v10-2026-10-12/`;
earlier rounds in `concepts/bot-figure-v8-2026-10-11/`, `concepts/bot-figure-v6-2026-10-11/` and
`concepts/bot-figure-v5-2026-10-10/`).

## What is here

- `scripts/`: every script that builds the figures, in load order (`load.py` lists it): `bot_helpers`, `bot_body`,
  `bot_kit`, `bot2`-`bot4`, `bot_main`, `bot5`, `bot_final`, `bot6`-`bot16`, `bot_render`; then `session.py`
  (build, pose, render and export helpers) and `session16.py` (checking helpers: bake one clip, arm-in-torso and
  wrist metrics, finger solves on the real replicas and magazines, `export_v(kind, stem)`).
- `v10/`: the current figures (12 Oct 2026): v6 plus the trigger finger, the reload that throws the old magazine and
  the hand and arm fixes of bot15-bot16, 23 clips. `v8/`, `v7/` and `v6/`: the previous rounds.
- `v5/`: the previous figures. `bot_human_v5.glb` (19,832 triangles, high-cut helmet head only) and `bot_robot_v5.glb`
  (15,332, bare body with team-paint panels), each with LOD1/LOD2 meshes and 21 animation clips, plus
  `*_animations.json` sidecars (clip lengths, loops, speeds, `fitTo` stats, first-person parts to hide, and
  `replicaOnGrip`: where each replica glb sits on the `Grip_R` bone).

## Facts the game needs

- Metres, facing glTF +Z; human 1.73 m, robot 1.75 m to the top of its optic (`heightMetres` in the sidecar). Team colour: tint materials whose names start with `Team` (Alpha 0x3d8bff,
  Beta 0xff8a2a).
- Replicas are the game's own `aeg.glb` / `pistol.glb` (X right, Y forward, Z up). Hang the held one on `Grip_R` with
  the sidecar's `replicaOnGrip` matrix (Blender axes, row-major). `Pistol_*` clips, and `Switch` from 35 %, hold the
  pistol; all other clips hold the AEG.
- Upper-body clips (`upperBodyOnly`) are authored over a still pelvis: layer them over the legs' clip as they are.
- First person: hide the parts listed under `firstPerson.hide` (the head) to see the body when looking down.

## Rebuild (Blender 5.2)

1. Put the scripts in `Documents\Airsoft models\work\` and `aeg_rifle.glb` / `gas_pistol.glb` in
   `Documents\Airsoft models\`.
2. In Blender's Python console: `bpy.app.driver_namespace['bot'] = {}`, then run `load.py`, then `session.py` with
   `exec(..., bpy.app.driver_namespace['bot'])`.
3. Then `session16.py` the same way. `B = bpy.app.driver_namespace['bot']`; `B['export_v']('human', 'bot_human_v10')`
   (or `'robot'`) builds the figure with its own finger tables, exports the glb and sidecar and saves the .blend.
4. Pictures: `B['proxies']()` then `B['figure_shots'](prefix, parts, head, first_person_parts)`.

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
"views":[{"n":"a","target":"Hand_R","dist":0.5,"yaw":45,"pitch":-30}]}` (yaw 0 is in front of the figure).
