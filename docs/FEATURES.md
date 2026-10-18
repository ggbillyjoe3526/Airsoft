# Features

What the game has on `main` today, by area: one line per feature, with the ids that added it. The changelog agent keeps
this file (`.claude/agents/changelog.md`); `CHANGELOG.md` has the same changes by release.

## Movement and stance

- Walk (hold Shift, quiet), run, sprint (Alt) and a small jump (Phase 1, M1); you can fire while sprinting, less accurately, with wider spread and more kick (PT1)
- Crouch, as a hold or a toggle (Phase 1, M12a)
- Lean left and right with Q and E to peek round cover; leaning slows you to walking pace (M7b)
- Accuracy by stance and movement: steadier crouched and still, worse walking, running or in the air; crouch-walking is
  slightly less accurate than standing still (M10, FA1)
- Walking while aiming: hold Shift while aiming and you creep slower than the aiming pace; walking with Shift is as steady as standing still (M84, MV1)
- Holster on 3 (1 and 2 pick primary and secondary): holstered you run faster (5.4 against 4.2 m/s), never past the 6.3 m/s sprint; the draw
  takes longer; a fresh trigger pull, aim, reload or slot key draws it; bots holster the same way (M92, MV1)
- Vault: Jump at a low wall about waist high (0.6 to 0.95 m) to go over it; vaults are loud (bots hear one from 18 m),
  and bots vault too where it saves them a walk (M102)

## Replicas and BBs

- An AEG rifle (single, burst or auto on the fire selector), a GBB Pistol and an electric Cyber Pistol, switched with
  the wheel or keys (Phase 1, M12a, M32)
- Cyber Pistol: electric semi, burst and auto; white top cover with slanted vents, dark slide with a pink core window,
  hex plate and toothed grip, plain grey and unlit with Realistic colours; small low iron sights; only the slide kicks
  back on a shot; its model is drawn in Blender and shows on figures too; built-in battery, fits either gear slot
  (M32, G2, M101, RM5)
- GBB Pistol: gas blowback semi-auto with the Gas Pistol's numbers; the slide kicks back on every shot and stays
  locked back on an empty magazine until a reload (RM7)
- Replica colour schemes: eight two-tone colours (Cobalt, Signal, Acid, Teal, Hazard, Coral, Onyx, Ghost); rifles Cobalt
  and pistols Ghost until the Customise screen lets players pick one per replica (G1)
- BBs are real projectiles: visible flight with air physics and drag, travel time, drop, and hop-up lift set by a dial
  per replica, turned mid-match with 4 and 5 (Phase 1, M9, M12c, M30, HD1)
- BB weight from 0.20 to 0.30 g per replica, with the speed, reach and flight time shown (M17a, M26b)
- Wind: a light breeze each match drifts BBs downwind; dust in the air drifts with it too (M30)
- A limited set of magazines each round; a reload swaps in the fullest spare, no topping up (M8)
- Optics: iron sights on every replica, a red dot or a 2× scope on top; aiming down sights with right click, at its own sensitivity; aimed fire twice as tight as hip fire; the 2× scope keeps the replica and the world in view round it, with a fine crosshair and red dot in the eyepiece (M12b, M17b, M84, PT1)
- Grips (vertical, angled) and magazines (hi-cap, low-cap, the pistol's extended one) trade handling for noise and sway
  (M17b)
- A laser module and a choice of power source on the pistol, from the pool (M26b)
- BBs can ricochet off concrete and steel; own ricochets can hit you; whether ricochets count as hits is a match
  setting, off by default (M20, FA12)
- Inspect (Y, rebindable): the replica in your hands turns side on and its parts move; AEG, GBB Pistol and Cyber Pistol
  each have their own check, and a shot ends it (RM2)

## Hits and elimination

- One hit and you're out: a tick, a hit marker (a bold red X; on or off in Settings, Off by default; scale, thickness, outline and colour in Gameplay › Crosshair), hand up, walk to the dead zone, then spectate your team (Phase 1, M97, PT1)
- Skip to next round from the spectator camera while you are out: the rest of the round plays out at once; Esc does the same without opening the pause menu (M83, PT1)
- Bots always call their hits (Phase 1)
- BBs stop at the first body they hit; hit areas follow the drawn figure in every pose, and on Dev figures the legs follow their walk, run and crouch (M85, IM8); a BB that hits a player already out knocks on the body (M85)
- Hit areas fit each figure, human and robot: head, chest, shoulders and hips follow the body as it moves, and each character's hit area takes its figure's shape (HV1)
- Friendly fire, on by default, as a match setting (Phase 1, M20)
- Hit flinch, impact puffs that show at once and a crosshair that opens with your real spread (M3, M10, M28)

## Bots

- Bots patrol lanes, spot, react with a human delay, shoot with inaccuracy, take cover, keep apart from teammates and
  search; hunters check spots by eye, share what their team has checked and turn away from a goal the team has already checked (Phase 1, FA4, M87)
- Difficulty levels Easy, Normal and Hard, picked for your teammates and the other team separately; each changes
  reactions, aim and tactics (cover, flanking); all hunt the map's middle once their lane is swept; Normal and Hard hold
  their posts out of lantern light at night (M4a, M20, FA4, M71)
- Pro difficulty, a fourth level shown only with Dev content on: holds angles at corners, answers pre-aimed peeks
  faster, slices corners, trades hits and holds crossfires as a team on bush edges, tree gaps and stair tops; holds its
  posts out of lantern light at night (M36, M37, M38, M40, M71)
- Bots crouch-peek over low cover, lean round corners, move as a team on varied routes and walk when it pays (M4b, M10)
- Bots hear shots, near misses, hit calls and footsteps, less through walls (M2, M22)
- Bot names and personalities: each bot has a name and one of four personalities (Rusher, Anchor, Flanker, Careful) that
  changes how it plays, never its senses, reaction or aim; set in bots.md (BN1)
- Bot callouts: teammates call sightings, hits, reloads and pushes in a text feed with a radio click, one at a time per team;
  enemies close by are heard keying up, never their words; Settings › HUD › Callouts (CL1)
- In Attack / Defend defenders hold near the pole; one attacking bot raises the flag while the others guard it from
  cover (M5, FA4)
- Adaptive difficulty (Dev setting): the other team gets a little sharper after you win and gentler after you lose, from your Opponents level (AD1)
- Bot kits: opponents on every difficulty carry kits from bot-kits.md by level, leaning to personality (Easy mostly
  plain, Pro never plain, Cyber Pistols from Hard); a bot aims through its own scope or red dot, silenced bots are
  heard nearer, and bots' figures show their gear (BG1)
- Bushes: bots hold fire into thick bush (more than 0.25 m of leaves in the way); Easy fires into the leaves anyway (FO1)

## Modes and matches

- Elimination: knock out the whole other team (Phase 1)
- Overtime flag: a time-out with nobody ahead raises a flag near the middle; first team to touch it wins; 30 s, never in Attack / Defend or Extraction (OT1)
- Attack / Defend: raise your flag on the other team's pole or keep yours down; overtime; sides swap at half-time (M5)
- Extraction: your squad against a home team on an 8:00 run; exits counted out in 10 s, a late exit, one automatic
  respawn; home team size follows the difficulty (one more on Pro); a 3 s grace at insertion and respawn (BBs don't hit
  you or from you); dev content, Depot (M43, M72)
- Extraction cases: ammo cans, field cases and a marshal's locker opened by holding Use (G), heard by bots; XP, BB
  resupplies and parts, dropped when hit, kept only on extraction, shown on the summary (M44)
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
- 3v3 by default with a round clock; first to 5 rounds wins; a whistle starts each round (Phase 1)
- Teams: Alpha (blue) and Beta (orange); Your team on the Match screen picks your side, and an Extraction run is always Alpha (M98)
- Custom matches: rounds to win, round time, 1v1 to 3v3 (to 5v5 on maps with room, M33d), friendly fire, ricochets; only
  the standard match counts for the records (M20)
- Rules: Skirmish, Tournament and Pro CQB (dev) and Custom; Extraction offers Skirmish and Custom only; named rulesets keep their own
  records, Custom never counts; a setting hidden for a mode is ignored (M39, M89)

## Maps

- Depot: an asymmetric 50 × 32 m yard with Container Alley, the Office, a raised loading dock with ramps, site props and
  one flagpole; both ends about as far from the dock and the Main Gate (M1, M11, M25b, FA4)
- Woodland: a 120 × 80 m field on a gentle slope up to the Knoll and its log fort, with three lanes (Pine Belt, Meadow,
  Creek with the cabin), trees, boulders and logs; both teams start hidden behind cover (a West Rise, thick trees), the
  blue end's height edge is smaller, and the lanes stop at two points in the fort; 5v5 by default, 6v6 allowed, only 5v5
  and 6v6 offered; dev content, playable with the Dev content switch on, and its matches aren't recorded or paid (M33d,
  M35, M88)
- Sloping ground (terrain) for maps: walkable slopes and hills, BBs stop in earth with no bounce; first used by Woodland
  (M33c)
- Bushes on any map that lists them: bots can't see someone deep in or behind one, and it hides you too; a BB stops
  0.6 m deep in the leaves, an edge shot comes out thrown off and slower; people walk through; drawn on the minimap;
  Woodland has 70 (M33e, FO1)
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
- Map surroundings: the world beyond each field, drawn only where a player can see it; Depot's industrial skyline, Woodland's
  cabin roof and layered pines, Neon Heights' ring of towers, adverts and skybridges (MS1)
- The woodland look on any map that asks for it: trees, logs and boulders drawn as bark and stone inside their boxes,
  crowns over the trees, ground patches (gravel, earth, wood, leaf litter under the trees), camp fires with flickering
  flames and embers, lanterns, and a moon and stars under the night preset; first used by Woodland (M33i)
- The field's sound from map data: ambience by day or night (no birds at night on any map); wind, insects, an owl and
  crackling camp fires in the woods at night (Woodland); traffic hum, drones and shop chimes by day with neon sizzle and
  arcade bleeps by night (Neon Heights); footsteps by the ground underfoot on terrain (M33j, M34g)
- Noisy props and ground: running into a skip, container, van, rack, crate or fence makes a noise bots hear from 13 to 20 m;
  creek gravel and steel steps carry a third further (NP1)
- Ramps and raised floors that players and bots use (Phase 3)

## Loadout, pool and Armory

- Loadout screen: Primary, Secondary and Grenades slots, listing what you own (M17a, M26b)
- A Customise view per replica: optic, BB weight, hop-up, grip, laser, magazine, power source (M26b)
- Every replica's and part's numbers in a hand-editable `stats.md`; a Performance sheet in Customise compares your setup
  with the replica as it comes (M29a)
- Higher parts add energy and rate of fire; batteries set the rate of fire (11.1 V LiPo battery); stronger gas kicks
  harder; a site energy limit (M29a)
- Barrel and Muzzle parts: a Tight-Bore Barrel and a Long Barrel for the AEG, a Silencer for both replicas that halves
  how far bots, the minimap and sound cues hear your shots (M29b)
- Glowing BBs per replica in Customise: At Night (the default, glowing only on night fields), Always or Off; a glowing
  BB is green, a little larger at range and leaves a longer streak; bots load them on night fields (M33b)
- Levels and XP: every match gives XP (match played, won, rounds won, hits); you level from 0 to 10, each level unlocks parts
  for good, and the table is in `levels.md` (LV1)
- Starters: the GBB Pistol and AEG Rifle, with battery and gas, are yours at level 0 (LV1)
- Your collection is saved apart from the settings (M26a)
- Armory: your level and XP in a band with the next unlock beside it; every level as a column on a progress line that
  scrolls sideways (unlocked, next, locked) (LV1, MR1)
- Locked items show greyed in Loadout and Customise, with the level that unlocks them (LV1)
- Saved loadouts: five slots in a dropdown on the Loadout hold whole kits, with Rename, Duplicate, New and Delete; keys 1 to 5 switch, edits go to the current slot, Disable levelling keeps its own set (SL1, MR1)

## Menus and settings

- Menus in a navy and orange look in Inter type (G3, M100): a plain title on navy (wordmark, tagline, START, the Tutorial on a
  clean save), then a top bar of Match, Loadout, Armory and Settings with your level badge at the right;
  no key strip, every screen works by mouse and the keys still work; Practice is the last mode on the Match screen- Match screen: map picture cards (a Dev tag on maps still being built), mode cards as text boxes with their sign, each map
  offering only its own modes; Match and Teams on the left and House rules on the right, one line each, ruleset-set rules
  locked as "set by Skirmish", unused rules hidden, one help line at the foot; Your match lists rules as chips with no map
  picture; no map is loaded until Play (M15, M15b, G3, MR1)
- Menus scale with the window height like the HUD, up to 1.5× at 4K; a menu page stays pinned to the window and only its long list scrolls, fading at its foot (UX1)
- Title screen with a Fullscreen button at the bottom left (it reads Exit fullscreen while in fullscreen) and a Licences link and the version at
  the bottom right (MR1, LC1); pause, match summary and result screens; the pause screen shows the match's seed for bug reports (M15,
  M24, BP1, G3)
- Replica, battery and gas bottle pictures on Loadout, Customise and Armory; Customise lists the parts down the left, Colour first, each option
  a picture tile beside the replica and its numbers; a Back button, no Skins part; Colour offers the bold schemes and four
  realistic colours (Black, Wolf Grey, Ranger Green, Tan) per replica (G3, RM3, MR1)
- Error screen on a crash with the seed, a report, a note box, Reload, Copy Report and Report a Bug buttons; Play Again starts a new match with
  its own seed (FA1, IM7)
- Settings groups, opening on Display: Display (fullscreen, field of view, show FPS), Graphics (quality presets with
  Custom option, frame-rate limit), Gameplay (crosshair, hit marker, HUD), Looks (Robots), Audio, Controls (every action rebindable,
  mouse buttons and mouse wheel), Accessibility, Save file, Dev; a search box and a note on every row
  (M15, M18a, M19, M24, FA2, FA5, G1, G3, M96, M97)
- Save system: automatic saving in the browser, download to a JSON file, load from file with a side-by-side comparison,
  restore points (one per day), Undo the last load, Delete and start over; warns if storage is blocked or full, or if
  the save is from a newer version (M31)
- Mouse sensitivity as cm/360 at a typed DPI, invert mouse, aim and sprint as hold or toggle; raw mouse input setting
  (M18a, FA5)
- Key names follow your keyboard layout (AZERTY, QWERTZ, etc.) where the browser can tell; second key per action;
  Backspace or Delete clears a binding (FA5)
- HUD size slider (0.8–1.5) in Settings › Gameplay (FA5)
- A hidden Dev group (tick Dev settings under the list): debug info, BB paths, game speed, bottomless magazines, ghost,
  Disable levelling (unlocks every item; a cheat with no XP and no records), +500 XP, Level up and Reset level buttons,
  free case openings, time of day, bots hold fire, spectate any bot, bot intentions, adaptive difficulty, end the round now, reset the save,
  Diagnostics Copy and Report a Bug, Dev content switch, Retro pixels, tone mapping (Neutral, AgX or ACES; applies at once, Neutral when off)
  (M24, M26d, FA1, M35, M42, M83, M90, IM7, RV2)
- The build's version on the title screen (M24)
- Screens fetched on first use: the Loadout, Armory and Settings, and the range, load in the background after the title; a failed download says so and tries again (IM1)

## HUD and match info

- Crosshair with the spread gap; shape, size, thickness, gap, outline, colour, opacity and static gap option from
  Settings (Phase 1, M19, FA5)
- Ammo and magazine gauges; the empty-magazine hint names your reload key (Phase 1, M8)
- Ammo counter option (Settings › Gameplay › HUD, On by default): Off hides the BB counts, leaving each spare magazine full or hollow (AC1)
- Round clock, score, round banners worded from your side (Phase 1)
- One feed of hits and callouts (top right, or bottom left under Settings › HUD › Feed position), a WON, LOST or DRAW stamp
  that a click skips past, a smaller replica panel, and a hop-up readout over the ammo panel (HD1, M19, FA9)
- Hit feed with team colour bars, teammate markers, the scoreboard on Tab, round stats between rounds (M19, FA9)
- HUD in the menus' look (G4): a score bar with slanted pips, score blocks and the match's aim under the clock; a framed
  square minimap with the map and round; hit feed rows with a BB mark and a Hit tag; the Tab scoreboard on a navy panel; a "ROUND 1" banner in heavy capitals;
  HUD opacity (Settings → Gameplay, 50–100 %, 90 % by default); squad orders on the order wheel only
- End-of-match summary with your stats and local records (wins, accuracy, streaks) (M19)
- What got you: after you're hit, a card with the shot's direction and distance, whether the bot held the angle, your
  time in view and if you moved; Auto, On or Off; Pro tips between rounds (M41)

## Squad orders and minimap

- Follow me (F), Hold here (X), Regroup (V), and a wheel on hold Z with Team plan showing each order's key; a HUD line
  shows the order (M22, M23, FA5)
- A minimap: the field, teammates always, the other team where last heard; a setting picks Fixed (north up) or Rotating (M23, M83)
- Minimap on multi-level maps shows the floor you stand on (floors below darker) and marks teammates on other floors
  with an up or down arrow (M34c)
- Pings: middle mouse marks a spot for your team, bot teammates go to it or watch it, and Ping markers hides the marks (PG1)
- Ask for a mag: H or the order wheel asks a teammate for a magazine when you run low, or tosses one to a teammate who asked (MG1)

## Audio

- Every sound is synthesised: replica shots by power source (electric, gas), the AEG motor winding up and down (M2, M13)
- Footsteps by surface, landing thuds, kit rustle when you crouch, stand or lean (M2, M13)
- Sounds you can locate by ear, muffled through walls and when eliminated; BB impacts sound by material; world sounds
  carry further (M13, FA6)
- Getting hit and the round and match whistles briefly dip the rest of the mix (FA6)
- Outdoor ambience with distant birds plays during play (FA6); rare, distant crows, dogs, pigeons, a creaking branch and a car horn by map (M86)
- Pause fades audio in 30 ms; hint when the browser blocks audio (FA6)
- Master, effects, ambience and interface volume sliders; ambience turns only the field's background down; a Power source slider under Effects covers each replica's battery motor, gas and spring sounds (M13, M86, PT1)

## Graphics and art

- Dark loading screen with a progress bar that follows the physics engine's download; favicon and web manifest (FA9, IM3)
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
- Graphics settings: frame-rate limit (Unlimited, 30, 60, 120, 144, 240) and show FPS counter; the first run picks a
  preset from the graphics card (Medium for integrated, High for discrete)
  (FA2, FA7, G5)
- Raised dock and ramps cast shadows; BB streaks consistent on any screen; replica sheen now on Medium and preserved
  across preset switches; contact shadows under every player on all presets (FA3, FA7)
- Players, replicas, parts and hands rebuilt in Counter-Strike / Valorant style with more detail on High, and on Medium figures drop to lower detail with distance;
  barrels and silencer model details on High; third-person rifles show a fitted silencer (FA8)
- Replicas and attachments redesigned: blockier two-tone style with stippled grips; red dot as enclosed square hood,
  silencer hexagonal body (G2)
- AEG and gas pistol drawn from Blender models, with fittable parts from Blender; in first person the AEG's trigger,
  fire selector, iron sights and magazine release move, and the pistol's trigger and magazine release (RM1)
- Attachments from Blender models: a compact red dot and a short 2× scope sit lower over the rail and the aim follows
  them, round silencers keep their length, and torches are smaller; the Cyber Pistol has a torch model (RM8)
- Players as masked humans (high-cut or bump helmet, balaclava, visor; no bare faces) in team camo with a team-colour
  plate carrier, or robots in a light or dark shell by team, mixed on both teams when Look › Robots is on; their
  replicas in the team's colours (G7)
- Your first-person arms: dark gloves, team camo sleeves and armband, or robot arms when your player is a robot; the firing wrist sits low behind the grip; your own body is never drawn in first person (G7, BD1, MV2)
- An optional glTF player model dropped into the assets folder replaces the built-in figures (M25a)
- Blender human figure, realistic body, gloved hands that grip the AEG and pistol, four heads (high-cut helmet, goggled cap, boonie hat, full-cut helmet) and team colour on the vest, armbands and bands (RM9)
- Blender robot figure, boxier mechanical limbs, visor head with headset and antenna, white suit with team shoulder caps; both Blender figures vault with their own animations (RM10)
- Players and bots are the rigged Blender humans and robots by default, and every menu picture shows the Blender models (BD1)
- Blender figures have a holstered pose: arms hang with the replica holstered, and the rifle is slung across the back until drawn (BP4)
- Block surface finishes and paints (plaster, metal, glazed tiles, asphalt, paving); six city props (arcade cabinet,
  vending machine, market stall, planter, phone booth, delivery van); painted ground markings and plaster ceilings under
  raised floors; flat finishes at 512 × 512 on Medium, High and Ultra (M34f, M78)
- Baked bounce light on Depot (per pixel on Medium and High, in the map's vertices on Low, on the players too),
  weathered surfaces and ground stains, precast concrete walls and rubble gabions, a lower, warmer day sun (G6)
- Set dressing on Depot from Medium: dirt, junk, litter, puddles, logos, sprays, signs and glow strips; an industrial
  skyline with chimney smoke on Detailed trees; dust kicked up by feet (G8)
- Set dressing on Woodland and Neon Heights from Medium: Woodland gets leaf litter, fallen branches and logs, mud and
  puddles on its paths, moss on its trunks and boulders, a conifer treeline and wooded hills beyond the fence, and
  fireflies at night; Neon Heights gets street litter, puddles, pasted posters and sprays, tube-letter neon signs that
  flicker now and then, steam from its vents and drains, and a lit city skyline with a plane crossing it (G9)
- Renderer choice: Auto (WebGPU where the browser has it, WebGL otherwise), WebGPU or WebGL, from the next load; a lost
  graphics device is replaced without leaving the match, or WebGL takes over if no new WebGPU device comes (W1, W6a); the maps look the same on either (W2), and players and
  held replicas too, with every night lamp near you lighting what stands by it on WebGPU (W3), and every preset's
  screen effects and the retro filter (W4); on WebGPU at Medium and up Woodland adds swaying grass on its meadows and
  a deep wood beyond the fence (W5)
- Night torch beams are soft and diffused, with a soft-edged lit spot; Low keeps the old beams (M91)
- Torch shadows (High and Ultra): your own torch casts shadows, so a tree or bot in its beam shades what is behind it; off on Low and Medium (M91)
- Shaders built before round 1: round 1 holds on a still field until fades, light shafts, shadows, magazines, the 2× scope and the overtime flag are ready (PF1)

## Practice and tutorial

- A practice range, picked as Practice (the last mode) on the Match screen: steel plates that ring, figures that fall, at 10–60 m,
  with a readout of your last BB; figures stand at the same height as match characters; moving targets (sliding figures, a swinging plate, pop-up figures) and an optional Timed challenge with a best score, off by default (M21, FA1, M93)
- Range in Depot's new look: baked light, post effects, props behind the firing line (portable toilet, replica rack, water tank, generator, crate bench), a sandbag berm at the backstop, dirt, litter, puddles and sprays, and wooded hills, treelines, site huts, a water tower and a power line beyond the walls; chains, bands and brackets on the plates (FA7, M81)
- A tutorial of sixteen coached steps on the range, with short cards, your own key bindings and the real scoreboard and order wheel; a Lean step after Crouch ticks once you've leaned both ways; read-only cards move on after 10 s with a bar; finishing opens Tutorial complete with Practice or Menu; skip and resume from pause; Replay tutorial in Settings starts it again at once (M16, FA10, M80, M97, TT2)
- Practice on any map: the Range or any map (dev maps with Dev content on), picked on the Match screen's Map cards, never changing the match's map; on a map no bots, and plates, figures, pop-ups, sliders and swingers stand where the other team's bots would play, facing you; minimap and torch at night; the timed challenge has its own best per map, a START plate a few steps ahead, and targets light only once in your sight, within 50 m (M94)
- In Practice, L opens the Loadout from play to try and customise any replica you own (everything with Disable levelling); Back to practice returns you where you stood (M95)

## Accessibility and comfort

- Team colour sets checked for colour blindness, patterns on the gauges, on-screen sound cues round the crosshair (M18b)
- High-contrast styling; hit, out and round messages read by screen readers (FA5)
- High Contrast team colours: exits turn hi-vis yellow, and team paint glows faintly on day fields (AX1)
- Reduced motion, pause on a hidden tab or when the window loses focus, recovery from a lost graphics context,
  fullscreen on F10 (M18a, M18b, FA6); after Esc a click on the pause screen resumes if the browser won't return the mouse,
  and in Firefox F10 asks for one click where it refuses fullscreen (IN1)

## Developer and debug

- Debug overlay (`` ` `` or F3): frame rate, frame time, seed, position, draw calls, triangles, GPU object counts (Phase
  1, Phase 3)
- BB flight paths drawn in the world (`]`) (Phase 1)
- `?seed=N`, `?quality=<preset>` and `?perf` in any build; `?nolock` and `?script=perf` on the dev server and in the
  smoke test's build (Phase 3, FA11b)
- `npm run t` and `npm run t:all`: tests with dots and failures only (TE1)
- Dev settings › Bots run low on BBs: 8 s into each round one bot per team is down to its last magazine, to watch the hand-off (MG1)
- Bug reports: Diagnostics and the crash screen take a note and a Report a Bug button that opens a GitHub issue with the report filled in; long reports are cut and copied whole (IM7)
