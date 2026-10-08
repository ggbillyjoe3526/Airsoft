# Features

What the game has on `main` today, by area: one line per feature, with the ids that added it. The changelog agent keeps
this file (`.claude/agents/changelog.md`); `CHANGELOG.md` has the same changes by release.

## Movement and stance

- Walk (hold Shift, quiet), run, sprint (Alt, no shooting for a moment) and a small jump (Phase 1, M1)
- Crouch, as a hold or a toggle (Phase 1, M12a)
- Lean left and right with Q and E to peek round cover; leaning slows you to walking pace (M7b)
- Accuracy by stance and movement: steadier crouched and still, worse walking, running or in the air; crouch-walking is
  slightly less accurate than standing still (M10, FA1)

## Replicas and BBs

- An AEG rifle (single, burst or auto on the fire selector), a gas pistol and an electric Cyber Pistol, switched with
  the wheel or keys (Phase 1, M12a, M32)
- Cyber Pistol: electric semi, burst and auto; white slab with glowing cyan lines and magenta core, plain grey and unlit
  with Realistic colours; built-in battery, fits either gear slot (M32, G2)
- Replica colour schemes: eight two-tone colours (Cobalt, Signal, Acid, Teal, Hazard, Coral, Onyx, Ghost); rifles Cobalt
  and pistols Ghost until the Customise screen lets players pick one per replica (G1)
- BBs are real projectiles: visible flight with air physics and drag, travel time, drop, and hop-up lift set by a dial
  per replica (Phase 1, M9, M12c, M30)
- BB weight from 0.20 to 0.30 g per replica, with the speed, reach and flight time shown (M17a, M26b)
- Wind: a light breeze each match drifts BBs downwind; dust in the air drifts with it too (M30)
- A limited set of magazines each round; a reload swaps in the fullest spare, no topping up (M8)
- Optics: iron sights, a red dot or a 2× scope; aiming down sights with right click, at its own sensitivity (M12b, M17b)
- Grips (vertical, angled) and magazines (hi-cap, low-cap, the pistol's extended one) trade handling for noise and sway
  (M17b)
- A laser module and a choice of power source on the pistol, from the pool (M26b)
- BBs can ricochet off concrete and steel; own ricochets can hit you; whether ricochets count as hits is a match
  setting, off by default (M20, FA12)

## Hits and elimination

- One hit and you're out: a tick, a hit marker, hand up, walk to the dead zone, then spectate your team (Phase 1)
- Bots always call their hits (Phase 1)
- Friendly fire, on by default, as a match setting (Phase 1, M20)
- Hit flinch, impact puffs that show at once and a crosshair that opens with your real spread (M3, M10, M28)

## Bots

- Bots patrol lanes, spot, react with a human delay, shoot with inaccuracy, take cover, keep apart from teammates and
  search (Phase 1, FA4)
- Difficulty levels Easy, Normal and Hard, picked for your teammates and the other team separately; each changes
  reactions, aim and tactics (cover, flanking); all hunt the map's middle once their lane is swept; Normal and Hard hold
  their posts out of lantern light at night (M4a, M20, FA4, M71)
- Pro difficulty, a fourth level shown only with Dev content on: holds angles at corners, answers pre-aimed peeks
  faster, slices corners, trades hits and holds crossfires as a team on bush edges, tree gaps and stair tops; holds its
  posts out of lantern light at night (M36, M37, M38, M40, M71)
- Bots crouch-peek over low cover, lean round corners, move as a team on varied routes and walk when it pays (M4b, M10)
- Bots hear shots, near misses, hit calls and footsteps, less through walls (M2, M22)
- In Attack / Defend defenders hold near the pole; one attacking bot raises the flag while the others guard it from
  cover (M5, FA4)

## Modes and matches

- Elimination: knock out the whole other team (Phase 1)
- Attack / Defend: raise your flag on the other team's pole or keep yours down; overtime; sides swap at half-time (M5)
- Extraction: your squad against a home team on an 8:00 run; exits counted out in 10 s, a late exit, one automatic
  respawn; home team size follows the difficulty (one more on Pro); a 3 s grace at insertion and respawn (BBs don't hit
  you or from you); dev content, Depot (M43, M72)
- Extraction cases: ammo cans, field cases and a marshal's locker opened by holding Use (G), heard by bots; FC, BB
  resupplies and parts, dropped when hit, kept only on extraction, shown on the summary in rarity colours (M44)
- Extraction waves: hit opponents come back together every 75 s on Normal (100 Easy, 60 Hard and Pro) or once all are
  out, at regen points out of the squad's sight; one more for the last third (M45)
- Extraction guards and hunters: two guards by the locker (one on Easy) who lean out and watch the way in; patrols in
  pairs between the cases; hunters from half the run on Normal (a third on Hard and Pro); teammates cover you at a case
  (M46, M72)
- Extraction pay and records: the FC you get out with plus your hits, times the difficulty (hits only if you don't get
  out); runs and extractions per difficulty, best haul, extractions in a row, fastest extraction with a case (M47)
- Extraction on Woodland (15 min against 4 to 7, the locker in the cabin or the fort, home team keeps 30 m from the
  insertion at the start) and Neon Heights (10 min against 3 to 6, the locker on Level 2, exits on the street) (M48,
  M72)
- Extraction supply events: a Supply weekend every Friday to Sunday (+25 % FC, +50 % parts) and dated events from
  pool.md (Halloween night run 2026), by the device's clock; the Play screen says which is on under Extraction (M49)
- 3v3 by default with a round clock; first to 5 rounds wins; a whistle starts each round (Phase 1)
- Custom matches: rounds to win, round time, 1v1 to 3v3 (to 5v5 on maps with room, M33d), friendly fire, ricochets; only
  the standard match counts for the records (M20)
- Rules: Skirmish, Tournament and Pro CQB (dev) and Custom; named rulesets keep their own records, Custom never counts
  (M39)

## Maps

- Depot: an asymmetric 50 × 32 m yard with Container Alley, the Office, a raised loading dock with ramps, site props and
  one flagpole; both ends about as far from the dock and the Main Gate (M1, M11, M25b, FA4)
- Woodland: a 120 × 80 m field on a gentle slope up to the Knoll and its log fort, with three lanes (Pine Belt, Meadow,
  Creek with the cabin), trees, boulders and logs; 4v4 by default, up to 5v5; dev content, playable with the Dev content
  switch on, and its matches aren't recorded or paid (M33d, M35)
- Sloping ground (terrain) for maps: walkable slopes and hills, BBs stop in earth with no bounce; first used by Woodland
  (M33c)
- Bushes on any map that lists them: bots can't see someone deep in or behind one, BBs and people pass through, drawn on
  the minimap; Woodland has 70 (M33e)
- Night sight on any night map: bots see 40 m into a light pool, 25 m in the open, 10 m under the trees, and 15 m in
  unlit spots under roofs or indoors (M33g, M34e)
- Night lighting on any map that asks for it: a dark sky and haze, a low moon as the key light, light pools that glow
  and light the ground on every preset and light players on Medium and High (Graphics › Night lights: Off, Nearest 2,
  Nearest 4, Nearest 8); Depot stays day (M33f)
- Weapon torch on any night map (dev content, a starter Light on every replica): T switches it; its beam lights where
  you look, bots see 40 m into it and spot a lit torch facing them; your own is a real light on Medium and High in place
  of one pool light; the held replica is lit by the night (M33h)
- Day or Night selector: maps offering both modes show a Day | Night switch on their picture card on the Play screen;
  your choice is saved per map (M34d, G3)
- Neon Heights: three-floor greybox market city with stairs, Sky Bridge and balcony, dev content, 4v4 to 5v5,
  Elimination and Attack / Defend, with Day and Night modes (M34c, M34d)
- Neon Heights by Night: 12 lamps light separate floors, neon signs glow, lit and dark windows on the perimeter (M34e)
- Neon Heights art: pastel painted buildings (mint, pink, cyan, amber on slate), paved street with asphalt, neon trim
  strips, lit arcade cabinets; night: softer purple sky with city lighting and 180 stars (M34f)
- The woodland look on any map that asks for it: trees, logs and boulders drawn as bark and stone inside their boxes,
  crowns over the trees, ground patches (gravel, earth, wood, leaf litter under the trees), camp fires with flickering
  flames and embers, lanterns, and a moon and stars under the night preset; first used by Woodland (M33i)
- The field's sound from map data: ambience by day or night (no birds at night on any map); wind, insects, an owl and
  crackling camp fires in the woods at night (Woodland); traffic hum, drones and shop chimes by day with neon sizzle and
  arcade bleeps by night (Neon Heights); footsteps by the ground underfoot on terrain (M33j, M34g)
- Ramps and raised floors that players and bots use (Phase 3)

## Loadout, pool and Armory

- Loadout screen: Primary, Secondary and Grenades slots, listing what you own (M17a, M26b)
- A Customise view per replica: optic, BB weight, hop-up, grip, laser, magazine, power source (M26b)
- Every replica's and part's numbers in a hand-editable `stats.md`; a Performance sheet in Customise compares your setup
  with the replica as it comes (M29a)
- Higher tiers add energy and rate of fire; batteries set the rate of fire (11.1 V LiPo battery); stronger gas kicks
  harder; a site energy limit (M29a)
- Barrel and Muzzle parts: a Tight-Bore Barrel and a Long Barrel for the AEG, a Silencer for both replicas that halves
  how far bots, the minimap and sound cues hear your shots (M29b)
- On Hard, each opponent carries its own kit rolled from the pool by the match's seed (M29b)
- Glowing BBs per replica in Customise: At Night (the default, glowing only on night fields), Always or Off; a glowing
  BB is green, a little larger at range and leaves a longer streak; bots load them on night fields (M33b)
- The asset pool (`pool.md`): every item at a rarity tier with a small handling bonus; starters are yours from the start
  (M26a)
- Your collection is saved apart from the settings (M26a)
- Armory, free to play: earn Field Credits (scaled by participation and match length), buy Tokens, draw with pity (an
  Epic or better within 20 Shots, a Legendary within 100); the catalogue shows all items by rarity tier (M26c, FA10)
- Chase items: a Legendary-only replica with its own 0.25 % chance per Shot item, shown on the Armory's Chase line (M32)

## Menus and settings

- Menus in a navy and orange look in Inter type (G3, M100): a plain title (wordmark, tagline, START, the Tutorial on a
  clean save), then a top bar of Match, Loadout, Armory and Settings with your Field Credits and Tokens at the right;
  no key strip, every screen works by mouse and the keys still work; Practice is the last mode on the Match screen
- Play screen: map and mode picture cards (a Dev tag on maps still being built), the match rows and a Your match panel
  on one page; no map is loaded until Play (M15, M15b, G3)
- Title screen, pause, match summary and result screens; the pause screen shows the match's seed for bug reports (M15,
  M24, BP1, G3)
- Replica pictures on Loadout, Customise and Armory; Customise lists the parts down the left, Colour first, each option
  a picture tile beside the replica and its numbers (G3)
- Error screen on a crash with the seed, a report, Reload and Copy Report buttons; Play Again starts a new match with
  its own seed (FA1)
- Settings groups: Graphics (quality presets with Custom option, frame-rate limit), Display (fullscreen, field of view,
  tone mapping, show FPS), Audio, Controls (every action rebindable, mouse buttons and mouse wheel), Gameplay
  (crosshair, HUD), Accessibility, Look (Robots, Realistic colours), Save file; a search box and a note on every row
  (M15, M18a, M19, M24, FA2, FA5, G1, G3)
- Save system: automatic saving in the browser, download to a JSON file, load from file with a side-by-side comparison,
  restore points (one per day), Undo the last load, Delete and start over; warns if storage is blocked or full, or if
  the save is from a newer version (M31)
- Mouse sensitivity as cm/360 at a typed DPI, invert mouse, aim and sprint as hold or toggle; raw mouse input setting
  (M18a, FA5)
- Key names follow your keyboard layout (AZERTY, QWERTZ, etc.) where the browser can tell; second key per action;
  Backspace or Delete clears a binding (FA5)
- HUD size slider (0.8–1.5) in Settings › Gameplay (FA5)
- A hidden Dev group (tick Dev settings under the list): debug info, BB paths, game speed, bottomless magazines, ghost,
  Disable Armory, Unlock all gear, Diagnostics Copy, Dev content switch, Retro pixels (M24, M26d, FA1, M35, M42)
- The build's version on the title screen (M24)

## HUD and match info

- Crosshair with the spread gap; shape, size, thickness, gap, outline, colour, opacity and static gap option from
  Settings (Phase 1, M19, FA5)
- Ammo and magazine gauges; the empty-magazine hint names your reload key (Phase 1, M8)
- Round clock, score, round banners worded from your side (Phase 1)
- Hit feed with team colour bars, teammate markers, the scoreboard on Tab, round stats between rounds (M19, FA9)
- HUD in the menus' look (G4): a score bar with slanted pips, score blocks and the match's aim under the clock; a framed
  square minimap with the map and round; hit feed rows with a BB mark and a Hit tag; a replica panel with the replica's
  picture, fire-mode chips and magazine bars; squad cards with the order keys; the Tab scoreboard on a navy panel
- End-of-match summary with your stats and local records (wins, accuracy, streaks) (M19)
- What got you: after you're hit, a card with the shot's direction and distance, whether the bot held the angle, your
  time in view and if you moved; Auto, On or Off; Pro tips between rounds (M41)

## Squad orders and minimap

- Follow me (F), Hold here (X), Regroup (V), and a wheel on hold Z with Team plan showing each order's key; a HUD line
  shows the order (M22, M23, FA5)
- A minimap: the field, teammates always, the other team where last heard (M23)
- Minimap on multi-level maps shows the floor you stand on (floors below darker) and marks teammates on other floors
  with an up or down arrow (M34c)

## Audio

- Every sound is synthesised: replica shots by power source (electric, gas), the AEG motor winding up and down (M2, M13)
- Footsteps by surface, landing thuds, kit rustle when you crouch, stand or lean (M2, M13)
- Sounds you can locate by ear, muffled through walls and when eliminated; BB impacts sound by material; world sounds
  carry further (M13, FA6)
- Getting hit and the round and match whistles briefly dip the rest of the mix (FA6)
- Outdoor ambience with distant birds plays during play (FA6)
- Pause fades audio in 30 ms; hint when the browser blocks audio (FA6)
- Master, effects and interface volume sliders (M13)

## Graphics and art

- Dark loading screen with a progress bar for the physics module; favicon and web manifest (FA9)
- Procedural daylight with a sky, haze and trees lit by the environment; field trees in None, Simple or Detailed with
  layered crowns and a hedge; clouds and sun disc on Medium and High; dressed Depot surfaces and props; figures in
  airsoft kit with team tape (M14, FA7)
- Gas puffs, impact dust by material, dust in the sunlight (M3, M14)
- Quality presets Low, Medium, High and Ultra, switchable mid-match: Low has 80 % resolution with no shadows, Medium
  adds shadows and relief, High adds sharp textures and dust (M14, FA2, FA3)
- Map detail from Medium: bevelled edges, corner shading, ground variation, prop detail and signs (FA7)
- Ultra, for fast graphics cards: soft 4096 shadows, up to 2× resolution and the most dust and night lights; never
  picked automatically (G5)
- Graphics effects per preset: bloom from Medium; ambient occlusion, temporal smoothing and light shafts on High;
  reflections in puddles and glass, film grain and lens fringe on Ultra; each a Custom row; Low draws none (G5)
- Custom graphics option: pick a preset and modify any row (shadows, shadow detail, softness, range, render scale, edge
  smoothing, surface relief (Normal or Bump), texture detail, dust and more); Custom is saved (FA2, FA7)
- Graphics settings: frame-rate limit (Unlimited, 30, 60, 120, 144, 240), show FPS counter and tone mapping choice
  (Neutral, AgX, ACES); the first run picks a preset from the graphics card (Medium for integrated, High for discrete)
  (FA2, FA7, G5)
- Raised dock and ramps cast shadows; BB streaks consistent on any screen; replica sheen now on Medium and preserved
  across preset switches; contact shadows under every player on all presets (FA3, FA7)
- Players, replicas, parts and hands rebuilt in Counter-Strike / Valorant style with more detail on Medium and High;
  barrels and silencer model details on High; third-person rifles show a fitted silencer (FA8)
- Replicas and attachments redesigned: blockier two-tone style with stippled grips; red dot as enclosed square hood,
  silencer hexagonal body (G2)
- Players as masked humans (high-cut or bump helmet, balaclava, visor; no bare faces) in team camo with a team-colour
  plate carrier, or robots in a light or dark shell by team, mixed on both teams when Look › Robots is on; their
  replicas in the team's colours (G7)
- Your first-person arms: dark gloves, team camo sleeves and armband, or robot arms when your player is a robot (G7)
- An optional glTF player model dropped into the assets folder replaces the built-in figures (M25a)
- Block surface finishes and paints (plaster, metal, glazed tiles, asphalt, paving); six city props (arcade cabinet,
  vending machine, market stall, planter, phone booth, delivery van); painted ground markings and plaster ceilings under
  raised floors; flat finishes at 512 × 512 on Medium, High and Ultra (M34f, M78)
- Baked bounce light on Depot (per pixel on Medium and High, in the map's vertices on Low, on the players too),
  weathered surfaces and ground stains, precast concrete walls and rubble gabions, a lower, warmer day sun (G6)
- Set dressing on Depot from Medium: dirt, junk, litter, puddles, logos, sprays, signs and glow strips; an industrial
  skyline with chimney smoke on Detailed trees; dust kicked up by feet (G8)

## Practice range and tutorial

- A practice range, from the title screen or the top bar's Range: steel plates that ring, figures that fall, at 10–60 m,
  with a readout of your last BB; figures stand at the same height as match characters (M21, FA1)
- Range detail: chains, bands, brackets, a BB shelf and scuffed plates, with fewer draw calls than before (FA7)
- A tutorial of ten coached steps on the range, with your own key bindings; skip and resume from pause (M16, FA10)

## Accessibility and comfort

- Team colour sets checked for colour blindness, patterns on the gauges, on-screen sound cues round the crosshair (M18b)
- High-contrast styling; hit, out and round messages read by screen readers (FA5)
- Reduced motion, pause on a hidden tab or when the window loses focus, recovery from a lost graphics context,
  fullscreen on F10 (M18a, M18b, FA6)

## Developer and debug

- Debug overlay (`` ` `` or F3): frame rate, frame time, seed, position, draw calls, triangles, GPU object counts (Phase
  1, Phase 3)
- BB flight paths drawn in the world (`]`) (Phase 1)
- `?seed=N`, `?quality=<preset>` and `?perf` in any build; `?nolock` and `?script=perf` on the dev server and in the
  smoke test's build (Phase 3, FA11b)
- `npm run t` and `npm run t:all`: tests with dots and failures only (TE1)
