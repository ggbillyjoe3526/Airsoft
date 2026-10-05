# Features

What the game has today, by area, one line per feature with the milestone (or phase) that added it. The changelog
agent (`.claude/agents/changelog.md`) keeps this file; `CHANGELOG.md` has the same changes by release.

## Movement and stance

- Walk (hold Shift, quiet), run, sprint (Alt, no shooting for a moment) and a small jump (Phase 1, M1)
- Crouch, as a hold or a toggle (Phase 1, M12a)
- Lean left and right with Q and E to peek round cover; leaning slows you to walking pace (M7b)
- Accuracy by stance and movement: steadier crouched and still, worse walking, running or in the air; crouch-walking is slightly less accurate than standing still (M10, FA1)

## Replicas and BBs

- An AEG rifle (single, burst or auto on the fire selector), a gas pistol and an electric Cyber Pistol, switched with the wheel or keys (Phase 1, M12a, M32)
- Cyber Pistol: electric semi, burst and auto; built-in battery, fits either gear slot (M32)
- BBs are real projectiles: visible flight with air physics and drag, travel time, drop, and hop-up lift set by a dial per replica (Phase 1, M9, M12c, M30)
- BB weight from 0.20 to 0.30 g per replica, with the speed, reach and flight time shown (M17a, M26b)
- Wind: a light breeze each match drifts BBs downwind; dust in the air drifts with it too (M30)
- A limited set of magazines each round; a reload swaps in the fullest spare, no topping up (M8)
- Optics: iron sights, a red dot or a 2× scope; aiming down sights with right click, at its own sensitivity (M12b, M17b)
- Grips (vertical, angled) and magazines (hi-cap, low-cap, the pistol's extended one) trade handling for noise and sway (M17b)
- A laser module and a choice of power source on the pistol, from the pool (M26b)
- BBs can ricochet off concrete and steel; own ricochets can hit you; whether ricochets count as hits is a match setting, off by default (M20, FA12)

## Hits and elimination

- One hit and you're out: a tick, a hit marker, hand up, walk to the dead zone, then spectate your team (Phase 1)
- Bots always call their hits (Phase 1)
- Friendly fire, on by default, as a match setting (Phase 1, M20)
- Hit flinch, impact puffs that show at once and a crosshair that opens with your real spread (M3, M10, M28)

## Bots

- Bots patrol lanes, spot, react with a human delay, shoot with inaccuracy, take cover, keep apart from teammates and search (Phase 1, FA4)
- Four difficulty levels (Easy, Normal, Hard, Pro), picked for your teammates and the other team separately; each level changes reactions, aim and tactics (cover, flanking); Pro holds angles at corners, answers pre-aimed peeks faster, slices corners, trades hits and holds crossfires as a team, holds bush edges, tree gaps and stair tops and keeps out of the light at night, shown only with Dev content on (M4a, M20, FA4, M36, M37, M38, M40)
- Bots crouch-peek over low cover, lean round corners, move as a team on varied routes and walk when it pays (M4b, M10)
- Bots hear shots, near misses, hit calls and footsteps, less through walls (M2, M22)
- In Attack / Defend defenders hold near the pole; one attacking bot raises the flag while the others guard it from cover (M5, FA4)

## Modes and matches

- Elimination: knock out the whole other team (Phase 1)
- Attack / Defend: raise your flag on the other team's pole or keep yours down; overtime; sides swap at half-time (M5)
- Extraction: your squad against a home team on an 8:00 run; exits counted out in 10 s, a late exit, one automatic respawn; dev content, Depot (M43)
- Extraction cases: ammo cans, field cases and a marshal's locker opened by holding Use (G), heard by bots; FC, BB resupplies and parts, dropped when hit, kept only on extraction, shown on the summary in rarity colours (M44)
- 3v3 by default with a round clock; first to 5 rounds wins; a whistle starts each round (Phase 1)
- Custom matches: rounds to win, round time, 1v1 to 3v3 (to 5v5 on maps with room, M33d), friendly fire, ricochets; only the standard match counts for the records (M20)
- Rules picker: Skirmish, Tournament, Pro CQB (dev) and Custom; named rulesets keep their own records, Custom never counts (M39)

## Maps

- Depot: an asymmetric 50 × 32 m yard with Container Alley, the Office, a raised loading dock with ramps, site props and one flagpole; both ends about as far from the dock and the Main Gate (M1, M11, M25b, FA4)
- Woodland: a second field coming soon, shown as disabled in the Map pop-up only with Dev content on (M33a, M35)
- Sloping ground (terrain) for maps: walkable slopes and hills, BBs stop in earth with no bounce; first used by Woodland (M33c)
- Woodland's layout: 120 × 80 m on a gentle slope up to the Knoll and its log fort, three lanes (Pine Belt, Meadow, Creek with the cabin), trees, boulders and logs; 4v4 by default, up to 5v5; dev content, playable with the Dev content switch on, and its matches aren't recorded or paid (M33d)
- Bushes on any map that lists them: bots can't see someone deep in or behind one, BBs and people pass through, drawn on the minimap; Woodland has 70 (M33e)
- Night sight on any night map: bots see 40 m into a light pool, 25 m in the open, 10 m under the trees, and 15 m in unlit spots under roofs or indoors (M33g, M34e)
- Night lighting on any map that asks for it: a dark sky and haze, a low moon as the key light, light pools that glow and light the ground on every preset and light players on Medium and High (Graphics › Night lights: Off, Nearest 2, Nearest 4); Depot stays day (M33f)
- Day or Night selector: maps offering both modes show a switch in the Map pop-up; your choice is saved per map (M34d)
- Neon Heights: three-floor greybox market city with stairs, Sky Bridge and balcony, dev content, 4v4 to 5v5, Elimination and Attack / Defend, with Day and Night modes (M34c, M34d)
- Neon Heights by Night: 12 lamps light separate floors, neon signs glow, lit and dark windows on the perimeter (M34e)
- Ramps and raised floors that players and bots use (Phase 3)

## Loadout, pool and Armory

- Loadout screen: Primary, Secondary and Grenades slots, listing what you own (M17a, M26b)
- A Customise view per replica: optic, BB weight, hop-up, grip, laser, magazine, power source (M26b)
- Every replica's and part's numbers in a hand-editable `stats.md`; a Performance sheet in Customise compares your setup with the replica as it comes (M29a)
- Higher tiers add energy and rate of fire; batteries set the rate of fire (11.1 V LiPo battery); stronger gas kicks harder; a site energy limit (M29a)
- Barrel and Muzzle parts: a Tight-Bore Barrel and a Long Barrel for the AEG, a Silencer for both replicas that halves how far bots, the minimap and sound cues hear your shots (M29b)
- On Hard, each opponent carries its own kit rolled from the pool by the match's seed (M29b)
- Glowing BBs per replica in Customise: At Night (the default, glowing only on night fields), Always or Off; a glowing BB is green, a little larger at range and leaves a longer streak; bots load them on night fields (M33b)
- The asset pool (`pool.md`): every item at a rarity tier with a small handling bonus; starters are yours from the start (M26a)
- Your collection is saved apart from the settings (M26a)
- Armory, free to play: earn Field Credits (scaled by participation and match length), buy Tokens, draw with pity (an Epic or better within 20 Shots, a Legendary within 100); catalogue shows all items by rarity tier (M26c, FA10)
- Chase items: a Legendary-only replica with its own 0.25 % chance per Shot item, shown on the Armory's Chase line (M32)

## Menus and settings

- Title screen, New game (Map, Match, Difficulty, Loadout, Settings, Play), pause, match summary and result screens (M15, M15b, M24); the pause screen shows the match's seed for bug reports (BP1)
- Error screen on crash with the seed, a report, Reload and Copy Report buttons; Play Again starts a new match with its own seed (FA1)
- No map is loaded until Play (M15b)
- Settings tabs: Graphics (quality presets with Custom option, frame-rate limit, show FPS, field of view), Audio, Controls (every action rebindable, mouse buttons and mouse wheel), Crosshair, HUD, Accessibility (M15, M18a, M19, M24, FA2, FA5)
- Save system: automatic saving in the browser, download to a JSON file, load from file with a side-by-side comparison, restore points (one per day), Undo the last load, Delete and start over; warns if storage is blocked or full, or if the save is from a newer version (M31)
- Mouse sensitivity as cm/360 at a typed DPI, invert mouse, aim and sprint as hold or toggle; raw mouse input setting (M18a, FA5)
- Key names in Settings follow your keyboard layout (AZERTY, QWERTZ, etc.) where the browser can tell; second key per action; Backspace or Delete clears a binding (FA5)
- HUD size slider (0.8–1.5) in Settings > HUD (FA5)
- A hidden Dev tab: debug info, BB paths, game speed, bottomless magazines, ghost, Disable Armory, Unlock all gear, Diagnostics Copy, Dev content switch, Retro pixels (M24, M26d, FA1, M35, M42)
- The build's version on the title screen (M24)

## HUD and match info

- Crosshair with the spread gap; shape, size, thickness, gap, outline, colour, opacity and static gap option from Settings (Phase 1, M19, FA5)
- Ammo and magazine gauges; the empty-magazine hint names your reload key (Phase 1, M8)
- Round clock, score, round banners worded from your side (Phase 1)
- Hit feed with team colour bars, teammate markers, the scoreboard on Tab, round stats between rounds (M19, FA9)
- End-of-match summary with your stats and local records (wins, accuracy, streaks) (M19)

## Squad orders and minimap

- Follow me (F), Hold here (X), Regroup (V), and a wheel on hold Z with Team plan showing each order's key; a HUD line shows the order (M22, M23, FA5)
- A minimap: the field, teammates always, the other team where last heard (M23)
- Minimap on multi-level maps shows the floor you stand on (floors below darker) and marks teammates on other floors with an up or down arrow (M34c)

## Audio

- Every sound is synthesised: replica shots by power source (electric, gas), the AEG motor winding up and down (M2, M13)
- Footsteps by surface, landing thuds, kit rustle when you crouch, stand or lean (M2, M13)
- Sounds you can locate by ear, muffled through walls and when eliminated; BB impacts sound by material; world sounds carry further (M13, FA6)
- Getting hit and the round and match whistles briefly dip the rest of the mix (FA6)
- Outdoor ambience with distant birds plays during play (FA6)
- Pause fades audio in 30 ms; hint when the browser blocks audio (FA6)
- Master, effects and interface volume sliders (M13)

## Graphics and art

- Dark loading screen with a progress bar for the physics module; favicon and web manifest (FA9)
- Procedural daylight with a sky, haze and trees lit by the environment; field trees in None, Simple or Detailed with layered crowns and a hedge; clouds and sun disc on Medium and High; dressed Depot surfaces and props; figures in airsoft kit with team tape (M14, FA7)
- Gas puffs, impact dust by material, dust in the sunlight (M3, M14)
- Quality presets Low, Medium and High, switchable mid-match; Low has 80 % resolution with no shadows, Medium adds shadows and relief, High adds sharp textures and dust; Medium and High add map detail (bevelled edges, corner shading, ground variation, prop detail and signs) (M14, FA2, FA3, FA7)
- Custom graphics option: pick a preset and modify any row (shadows, shadow detail, softness, range, render scale, edge smoothing, surface relief (Normal or Bump), texture detail, dust and more); Custom is saved (FA2, FA7)
- Graphics Settings: frame-rate limit, show FPS counter and tone mapping choice (Neutral, AgX, ACES); preset selected from graphics card on first run (Medium for integrated, High for discrete) (FA2, FA7)
- Raised dock and ramps cast shadows; BB streaks consistent on any screen; replica sheen now on Medium and preserved across preset switches; contact shadows under every player on all presets (FA3, FA7)
- Players, replicas, parts and hands rebuilt in Counter-Strike / Valorant style with more detail on Medium and High; barrels and silencer model details on High; third-person rifles show a fitted silencer (FA8)
- An optional glTF player model dropped into the assets folder replaces the built-in figures (M25a)

## Practice range and tutorial

- A practice range from the title screen: steel plates that ring, figures that fall, at 10–60 m, with a readout of your last BB; figures stand at the same height as match characters; detail includes chains, bands, brackets, a BB shelf and scuffed plates, with fewer draw calls than before (M21, FA1, FA7)
- A tutorial of ten coached steps on the range, with your own key bindings; skip and resume from pause (M16, FA10)

## Accessibility and comfort

- Team colour sets checked for colour blindness, patterns on the gauges, on-screen sound cues round the crosshair (M18b)
- High-contrast styling; hit, out and round messages read by screen readers (FA5)
- Reduced motion, pause on a hidden tab or when the window loses focus, recovery from a lost graphics context, fullscreen on F10 (M18a, M18b, FA6)

## Developer and debug

- Debug overlay (` or F3): frame rate, frame time, seed, position, draw calls, triangles, GPU object counts (Phase 1, Phase 3)
- BB flight paths drawn in the world (]) (Phase 1)
- `?seed=N`, `?quality=low|medium|high`, `?nolock` on the dev server and in the smoke test build (Phase 3)
