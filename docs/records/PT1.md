# PT1 · The owner's 0.1 Dev 5 playtest fixes (ten notes, 2026-10-13)

**Review:** 3 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✓ 20 s | ✗ 583 s (the draft record) | ✗ 1008 s (boot counted 4 volume sliders) | ✗ 1920 s (runs read a commit made mid-run) | ✓ | ✓ | – (gates red) | The boot check counted the old sliders and crosshair previews | ~2.5 h | UI worker (Sonnet) 240k, changelog (Haiku) 28k |
| 2026-10-13 | 2 | Opus 5.5 (build thread) | ✓ 21 s | ✓ 571 s | ✓ 1016 s | ✓ 1952 s | ✗ (the re-recorded baseline not in touches) | ✓ | 6/8 Retry (Opus) | Check 2: bbGlow left QualitySettings with no contract change; check 3: a string per shot | ~1.5 h | QA (Sonnet) 129k, critic (Opus) 182k |
| 2026-10-13 | 3 | Opus 5.5 (build thread) | ✓ 22 s | ✓ 601 s | ✓ 1151 s | ✓ 1954 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1.25 h | critic (Opus) 37k |

## Decisions

- **On the run the spread is ×3.5 and each shot kicks 1.5 times as hard; the replica comes up out of the sprint carry in 0.06 s to fire and stays up 0.35 s after the trigger is let go.** Three times walking's spread and a third wider than running's, so a sprint-and-spray lands only close in, and the barrel is square for the shot (also in DECISIONS).
- **A toggled sprint still ends on a fire press, and that press now fires.** The toggle's old lost shot came from the post-sprint lockout, which is gone; its KNOWN_ISSUES row is deleted.
- **Bots still stop sprinting to fight.** Whether bold bots spray on the run belongs to the bot personalities thread.
- **A vault keeps its own fire hold (0.3 s after it), now `Character.fireLockout`.** M102 reused the sprint's lockout, which this task removed; the merge with main gave the vault a field of its own and the same behaviour.
- **Shots 1 → 1.4 (+2.9 dB), each shot's power part on its own buffer at 1.4 under the Power source slider, the AEG's motor 0.8 → 1.1, footsteps 0.48 → 0.54 (+1 dB).** Louder shots as asked, and a bot's sprint is still heard within 28 dB of your own shot at 20 m (audit CORE-26) (also in DECISIONS).
- **The Power source slider sits under Effects and sets each power sound as it starts, with no bus of its own.** The sounds last a fraction of a second, so a change is heard from the next shot; the slider previews the gas pop.
- **The title sound budget goes from 1.5e6 to 1.6e6 samples (1,499,747 in all).** Each shot's power part keeps its own tail; every cue still fits one spare moment.
- **The hit marker is a bold red X (12 px arms, 7 px gap, 3 px thick, dark outline) with scale 0.5–2.5, thickness 1–6 px, outline and red, white, yellow, green, pink or a custom colour; still Off by default.** The owner asked for Off at M97; blue and orange are left out as the teams' colours (also in DECISIONS).
- **No BB has a halo; FA8's halo and its Graphics quality field are gone.** Glowing BBs keep their lit green ball and longer streak, and bloom never picks a BB up (also in DECISIONS).
- **The 2x scope zooms the whole view 2× as before; aimed, the replica stays drawn and a depth-only disc 0.2 mm inside the rear glass opens it to the world, with a fine crosshair (3vh arms) and a 6 px red dot over it.** It reads like the red dot; a zoom in the glass alone would draw the world twice a frame (also in DECISIONS).
- **Both 2x scopes have a dark core behind their glass: the built-in one a shoulder, an eyepiece glass and a core; the Blender one a core lathed in `attachments_v2.blend`, re-exported into `replicaParts/aeg.glb` with only `optic_scope2x` changed.** The Blender scope was a hollow shell you could see through and the built-in one had an open ring between tube and bell (ASSETS updated).
- **Esc while you are out skips the round at once; the game then holds with "Click to play · Esc for the menu".** The browser takes the mouse back on Esc, so a click plays on and a second Esc opens the pause menu; its Skip button stays (also in DECISIONS).
- **The ammo count shrinks with its digits (42, 32, 26 px) and the replica panel's chips wrap.** Three digits ran into the fire mode chip at 1280 px.
- **Map cards with a Dev tag or Day and Night buttons grow to keep them off the map's name.** About 190 px tall at 1280 px wide, Dev content only.
- **Neon Heights Extraction's Low perf baseline was re-recorded on this branch (43.66 draw calls; it was 40.15, from 8e90a4b); main's own re-record (BN1, 44.85) replaced it at the merge.** It predated M102's vault wall on the map; main read 43.79 (M102) and 43.64 (SL1), this branch 44.24 then 43.66, so the drift was main's and the run noise, not this change.
- **`bbGlow` leaves `QualitySettings` with its row, and an old save's `graphics.bbGlow` is left unread, never reused.** Its effect is gone, so the row would do nothing; the contract (ARCHITECTURE › QualitySettings and the settings store keys) now says so, pinned in `settings/storage.test.ts`.
- **The Esc skip's state stays in `game.ts` beside the pause flow it replaces (about 75 lines), its rules in `core/escSkip.ts`.** It shares the pause's pointer-lock handling; moving it out is for a later tidy-up (the critic's note, not blocking).
- **Note 7 is a report, no change: the first-person arms are built in code, and no Blender arms exist yet.** The figure redesign plans the approved figure as the first-person body; the Dev switch defaults stay as they are.
- **Another UI redesign is parked in IDEAS, its version not set.** The owner's later note; no redesign work now (also in DECISIONS).

## Known issues left

- The 2x scope zooms the whole view, not only what is in its glass (KNOWN_ISSUES › Replicas, loadout and the Armory, document).
- The first shot on the run, or just after a sprint, can leave a barrel still coming up out of the carry (KNOWN_ISSUES › Movement and shooting, can wait).
- With Dev content on, a Match screen map card with a Dev tag is about twice as tall at 1280 px (KNOWN_ISSUES › Menus, HUD and input, can wait).
