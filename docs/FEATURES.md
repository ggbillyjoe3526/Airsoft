# Features

What the game has today, by area, one line per feature with the milestone (or phase) that added it. The changelog
agent (`.claude/agents/changelog.md`) keeps this file; `CHANGELOG.md` has the same changes by release.

## Movement and stance

- Walk (hold Shift, quiet), run, sprint (Alt, no shooting for a moment) and a small jump (Phase 1, M1)
- Crouch, as a hold or a toggle (Phase 1, M12a)
- Lean left and right with Q and E to peek round cover; leaning slows you to walking pace (M7b)
- Accuracy by stance and movement: steadier crouched and still, worse walking, running or in the air (M10)

## Replicas and BBs

- An AEG rifle (single, burst or auto on the fire selector) and a gas pistol, switched with the wheel or keys (Phase 1, M12a)
- BBs are real projectiles: visible flight with air physics and drag, travel time, drop, and hop-up lift set by a dial per replica (Phase 1, M9, M12c, M30)
- BB weight from 0.20 to 0.30 g per replica, with the speed, reach and flight time shown (M17a, M26b)
- Wind: a light breeze each match drifts BBs downwind; dust in the air drifts with it too (M30)
- A limited set of magazines each round; a reload swaps in the fullest spare, no topping up (M8)
- Optics: iron sights, a red dot or a 2× scope; aiming down sights with right click, at its own sensitivity (M12b, M17b)
- Grips (vertical, angled) and magazines (hi-cap, low-cap, the pistol's extended one) trade handling for noise and sway (M17b)
- A laser module and a choice of power source on the pistol, from the pool (M26b)
- BBs can ricochet off concrete and steel; whether a ricochet counts as a hit is a match setting, off by default (M20)

## Hits and elimination

- One hit and you're out: a tick, a hit marker, hand up, walk to the dead zone, then spectate your team (Phase 1)
- Bots always call their hits (Phase 1)
- Friendly fire, on by default, as a match setting (Phase 1, M20)
- Hit flinch, impact puffs and a crosshair that opens with your real spread (M3, M10)

## Bots

- Bots patrol lanes, spot, react with a human delay, shoot with inaccuracy, take cover and search (Phase 1)
- Three difficulty levels, picked for your teammates and the other team separately (M4a, M20)
- Bots crouch-peek over low cover, lean round corners, move as a team on varied routes and walk when it pays (M4b, M10)
- Bots hear shots, near misses, hit calls and footsteps, less through walls (M2, M22)
- In Attack / Defend defenders hold near the pole and attackers push to it (M5)

## Modes and matches

- Elimination: knock out the whole other team (Phase 1)
- Attack / Defend: raise your flag on the other team's pole or keep yours down; overtime; sides swap at half-time (M5)
- 3v3 by default with a round clock; first to 5 rounds wins; a whistle starts each round (Phase 1)
- Custom matches: rounds to win, round time, 1v1 to 3v3, friendly fire, ricochets; only the standard match counts for the records (M20)

## Maps

- Depot: an asymmetric 50 × 32 m yard with Container Alley, the Office, a raised loading dock with ramps, site props and one flagpole (M1, M11, M25b)
- Ramps and raised floors that players and bots use (Phase 3)

## Loadout, pool and Armory

- Loadout screen: Primary, Secondary and Grenades slots, listing what you own (M17a, M26b)
- A Customise view per replica: optic, BB weight, hop-up, grip, laser, magazine, power source (M26b)
- The asset pool (`pool.md`): every item at a rarity tier with a small handling bonus; starters are yours from the start (M26a)
- Your collection is saved apart from the settings (M26a)
- Armory, beta and free: earn Field Credits from matches, buy Tokens, draw assets from the pool at rarity odds (M26c)

## Menus and settings

- Title screen, New game (Map, Match, Difficulty, Loadout, Settings, Play), pause, match summary and result screens (M15, M15b, M24); the pause screen shows the match's seed for bug reports (BP1)
- No map is loaded until Play (M15b)
- Settings tabs: Graphics (quality presets, field of view), Audio, Controls (every action rebindable, mouse buttons too), Crosshair, HUD, Accessibility (M15, M18a, M19, M24)
- Mouse sensitivity as cm/360 at a typed DPI, invert mouse, aim and sprint as hold or toggle (M18a)
- A hidden Dev tab: debug info, BB paths, game speed, bottomless magazines, ghost, Disable Armory, Unlock all gear (M24, M26d)
- The build's version on the title screen (M24)

## HUD and match info

- Crosshair with the spread gap; shape, size, thickness, gap, outline and colour from Settings (Phase 1, M19)
- Ammo and magazine gauges; the empty-magazine hint names your reload key (Phase 1, M8)
- Round clock, score, round banners worded from your side (Phase 1)
- Hit feed, teammate markers, the scoreboard on Tab, round stats between rounds (M19)
- End-of-match summary with your stats and local records (wins, accuracy, streaks) (M19)

## Squad orders and minimap

- Follow me (F), Hold here (X), Regroup (V), and a wheel on hold Z with Team plan; a HUD line shows the order (M22, M23)
- A minimap: the field, teammates always, the other team where last heard (M23)

## Audio

- Every sound is synthesised: replica shots by power source (electric, gas), the AEG motor winding up and down (M2, M13)
- Footsteps by surface, landing thuds, kit rustle when you crouch, stand or lean (M2, M13)
- Sounds you can locate by ear, muffled through walls; BB impacts sound by material (M13)
- Master, effects and interface volume sliders (M13)

## Graphics and art

- Procedural daylight with a sky, haze and trees; dressed Depot surfaces and props; figures in airsoft kit with team tape (M14)
- Gas puffs, impact dust by material, dust in the sunlight (M3, M14)
- Quality presets Low, Medium and High, switchable mid-match; Low is picked on its own for software rendering (M14)
- An optional glTF player model dropped into the assets folder replaces the built-in figures (M25a)

## Practice range and tutorial

- A practice range from the title screen: steel plates that ring, figures that fall, at 10–60 m, with a readout of your last BB (M21)
- A tutorial of ten coached steps on the range, with your own key bindings (M16)

## Accessibility and comfort

- Team colour sets checked for colour blindness, patterns on the gauges, on-screen sound cues round the crosshair (M18b)
- Reduced motion, pause on a hidden tab, recovery from a lost graphics context, fullscreen on F10 (M18a, M18b)

## Developer and debug

- Debug overlay (` or F3): frame rate, frame time, seed, position, draw calls, triangles, GPU object counts (Phase 1, Phase 3)
- BB flight paths drawn in the world (]) (Phase 1)
- `?seed=N`, `?quality=low|medium|high`, `?nolock` on the dev server and in the smoke test build (Phase 3)
