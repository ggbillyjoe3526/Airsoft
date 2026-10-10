# Bot figure (Blender source)

The realistic bot figures built in Blender for the owner's review: a human player figure and a bare robot. **Not in
the game yet**: the owner approves the pictures first. Pictures of v5 are in the project files
(`concepts/bot-figure-v5-2026-10-10/`).

## What is here

- `scripts/`: every script that builds the figures, in load order (`load.py` lists it): `bot_helpers`, `bot_body`,
  `bot_kit`, `bot2`-`bot4`, `bot_main`, `bot5`, `bot_final`, `bot6`-`bot13`, `bot_render`; then `session.py`
  (build, pose, render and export helpers).
- `v5/`: the exported figures. `bot_human_v5.glb` (19,832 triangles, high-cut helmet head only) and `bot_robot_v5.glb`
  (15,332, bare body with team-paint panels), each with LOD1/LOD2 meshes and 21 animation clips, plus
  `*_animations.json` sidecars (clip lengths, loops, speeds, `fitTo` stats, first-person parts to hide, and
  `replicaOnGrip`: where each replica glb sits on the `Grip_R` bone).

## Facts the game needs

- Metres, 1.73 m tall, facing glTF +Z. Team colour: tint materials whose names start with `Team` (Alpha 0x3d8bff,
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
3. `B = bpy.app.driver_namespace['bot']`; `meshes, lods, info = B['build_human_full']()`;
   `B['export_figure']('bot_human_v5', info, extra=B['grip_info']())`. For the robot use `build_robot_full`.
4. Pictures: `B['proxies']()` then `B['figure_shots'](prefix, parts, head, first_person_parts)`.

## How the hands hold the replicas (bot13)

- The right fist sits low and turned 40 degrees on the AEG grip (`RIFLE_SEAT`), so the web is on the backstrap, the
  thumb wraps the far side and the trigger finger lies straight along the frame. The pistol grip is fitted into the
  same fist (`PISTOL_IN_RIFLE_GRIP`).
- Finger poses (`HOLDS`) were solved against the real replica meshes (`wrap_finger`, `lay_finger`, `thumb_to`
  helpers), with no finger segment more than about 2 mm into the surface.
- Rifle poses stand bladed (`RIFLE_TWIST` -30 degrees, -60 aiming high) so the left hand reaches the handguard
  (`SUPPORT_ON_REPLICA`) with the butt kept in the shoulder. On the pistol the left hand wraps over the right.

## Paused (10 Oct 2026)

Work paused on the owner's word. What is left: the pistol trigger finger should lie straight along the frame, ease
the aim-up neck (`HEAD_UNTWIST` is in bot13 but not yet exported), show the magazine in the reload pose, and ask him
whether the robot's headband, ear module and thigh cable count as accessories. The full handoff is in the project
files at `plans/bot-figure-handoff.md`.
