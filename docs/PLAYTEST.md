# Playtest guide

How to run the game and what to check when you play it. Each pull request names the sections to play; a bug pass
plays them all. A change that alters what a section describes updates that section. Tick a box when the game behaves
as described; anything else is worth reporting ([Reporting what you find](#reporting-what-you-find)). Earlier wording
of these checks, with the reasons and exact figures: `docs/archive/0.1-beta/PLAYTEST.md`.

## Get the game running

You need a desktop computer with Chrome, Edge or Firefox. The first setup takes about 10 minutes.

1. **Install Node.js (once).** From nodejs.org, download the **LTS** version (22 or newer) with the default options.
2. **Download the game.** For a release, use the ZIP link in the README. For the latest work, open
   github.com/ggbillyjoe3526/Airsoft, click **Code**, then **Download ZIP** (that is `main`). To try a pull request
   first pick its branch in the branch menu.
3. **Unzip it** somewhere easy, like your Desktop, and **open a terminal in that folder** (Windows: click the address
   bar, type `cmd`, Enter. Mac: right-click the folder, **New Terminal at Folder**).
4. **Type `npm install`** and wait until you can type again (about a minute), then **`npm run dev`**. It prints an
   address; leave the window open.
5. **Open http://localhost:5173** in your browser. The title screen appears.

To stop, press **Ctrl+C** in the terminal. Next time, repeat steps 3 and 4's `npm run dev` only.

| If this happens | Try this |
|---|---|
| `npm` is "not recognized" or "command not found" | Close and reopen the terminal. Still failing? Restart the computer. |
| The page can't be reached | Check the terminal still runs `npm run dev`, and use the exact address it printed. |
| Black screen or "Failed to start" | Update your browser. |
| Clicking doesn't take the mouse | Wait a second and click again: browsers refuse right after Esc. |

While you play, **`** (under Esc) or **F3** shows the frame rate and the match's **seed**. Note the seed when
something goes wrong: it replays the same match.

## Play these first

What changed in 0.1 Beta 1, from your Dev 6 playtest. Each line points to the section with more checks.

- [ ] **Settings.** Opens on Display; the tabs run Display to Dev. A fresh save starts with aim Toggle, crouch Hold,
  red sound cues and new volumes; Retro look is a Dev setting ([Settings and controls](#settings-and-controls)).
- [ ] **Match, Loadout and Armory.** Tidier: mode cards as text boxes, rules in two columns with "set by Skirmish"
  locks, saved loadouts in one dropdown, the Armory's levels on a sideways line, LVL in the top bar and a Fullscreen
  button on the title ([Menus](#menus), [Loadout and Customise](#loadout-and-customise)).
- [ ] **The HUD.** Hop-up mid-match with 4 / 5 and a readout over the ammo panel, one feed for hits and callouts, a
  smaller replica panel, a WON / LOST / DRAW stamp you click past, Settings › HUD › Feed position
  ([HUD and match info](#hud-and-match-info)).
- [ ] **Blender figures by default.** Players and bots are the rigged humans and robots, with hit areas fitted to each
  body; your own body never shows in first person, even looking straight down ([Players and replicas](#players-and-replicas)).
- [ ] **Map surroundings.** Cranes and a water tower over Depot's walls; Woodland's cabin, layered pines and brighter
  nights; Neon Heights ringed by lit towers and signs ([Maps](#maps)).
- [ ] **A shorter tutorial.** One or two sentences a card; read-only cards fill a bar and move on after 10 s; a lean
  step after Crouch teaches peeking with Q and E ([Tutorial](#tutorial)).
- [ ] **Movement and hands.** Holstered you run faster than armed, never past a sprint; no resting on cover; walking
  with Shift aims as steadily as standing; the first replica switch no longer stutters ([Movement](#movement)).
- [ ] **Menus at 4K and in a small window.** 1.5× at 4K; at 1280×720 only a page's long list scrolls ([Menus](#menus)).
- [ ] **Bug fixes.** The Q/E lean eases, a double-tap on the fire selector steps twice, a ricochet's grit flies off
  the wall, edge markers point the way to turn ([Old bugs to recheck](#old-bugs-to-recheck)).

### Your Beta 1 playtest (2026-10-17)

Your first pass (the checklist is `playtest/beta1-checklist.md` in the project's shared files): Settings, the menus,
the HUD, movement, the figures and their hit areas, Depot and BBs in bushes passed. These became tasks: more compact
menus and replica panel (UI2), a longer round-end stamp and table (RE1), a faster holstered run, a natural wrist and
no own body in view (MV2), Woodland's hill roof, grey blocks and middle tree (WL2), the lean step and 10 s read cards
in the tutorial (TT2), and Neon Heights' doors and interiors (NH2, the Maps Update). Still to play: the bots at each
difficulty and adaptive difficulty, Woodland Attack / Defend, Neon Heights by Day, the overtime flag, and the hitch and
[old bug](#old-bugs-to-recheck) rechecks.

### Only you can do these

- **Laptop baseline.** On the low-spec laptop run `node pipeline/perf-run.mjs --env laptop --preset all --baseline`
  and commit the `pipeline/baseline/laptop*.json` files it writes.
- **Desktop Ultra baseline, Neon Heights Extraction.** The 2026-10-17 run measured that row's results screen. In a new
  download run `npm install` first, then `npm run perf:desktop` (about 15 minutes; leave the window alone), and send
  the thread `pipeline/out/perf-desktop-summary.md` and `pipeline/baseline/desktop*.json`.
- **Playing Woodland and Neon Heights**, which stay dev content until you make each public. (Save in Edge: done
  2026-10-17, [Save](#save).)

## Movement

Play › Mode Elimination on Depot, Match › Opponents Normal. Set the mouse sensitivity in Settings › Controls first.

- [ ] **Look and move (mouse, W A S D).** The view turns smoothly with no jumps or drift; you run at a steady pace and
  hear your footsteps.
- [ ] **Hold Shift and move.** You walk slowly and silently, and the crosshair closes to about its standing-still
  size. Is the gain clear enough? (Dev 6 note 29.)
- [ ] **Press 3, then run.** Holstered, you run faster than with the replica out (5.4 m/s against 4.2); with Left Alt
  the sprint is the same as armed, never faster. Fast enough now? (Dev 6 note 27, Beta 1 item 18.)
- [ ] **Hold Left Alt and fire while sprinting.** It fires, but the spread is far wider and the rifle climbs faster;
  let go of the trigger and it drops back into the carry. (Dev 5 playtest, note 9.)
- [ ] **Press C.** You crouch, slow and silent, and C again stands you up; Left Alt or Space also stands you up. With
  Settings › Controls › Crouch key on Hold, you crouch only while C is held.
- [ ] **Hold Q, then E, beside a wall or crate.** You lean round it; against a wall the lean stops short, so you never
  see through it.
- [ ] **Press Space.** A small hop. Pressed just before landing, or while standing from a crouch, it jumps once,
  never twice. Does it feel right or too forgiving?
- [ ] **Watch the crosshair.** It opens when you run or jump, closes almost at once when you stop, and is tightest
  crouched and still; crouch-walking sits between standing still and walking.
- [ ] **Sprint up and down Depot's dock ramps.** Uphill loses about a quarter of a sprint's pace (a confirmed call).
- [ ] **Controls through a vault (BP5).** Vault a low wall (Depot's office hall has one). On Semi, hold left click
  through it: one BB, not two. Hold right click: the sight drops and comes back.

## Shooting and reloads

The rifle holds 60 BBs and the pistol 18, each with 4 magazines a round. Nothing refills until the next round.

- [ ] **Hold left click with the rifle.** A steady stream; the BB count drops and the box by the name says **Auto**.
- [ ] **Press B.** **Semi** (one BB a click), then **Burst** (three), then **Auto**; the setting carries into the next
  round.
- [ ] **Press 2 or turn the wheel.** The pistol: one shot per click, and a click straight after sprinting fires at
  once. 1 switches back.
- [ ] **Shoot at a far wall.** BBs fly, take a moment to arrive and drop at long range; the pistol's drop sooner.
- [ ] **Fire half a magazine, then press R.** A magazine swap plays (rifle 1.8 s, pistol 1.2 s); the gauges show your
  spares and the half-used one goes back in the pouch.
- [ ] **Empty a magazine, then pull the trigger.** The empty pull starts a reload by itself. With a full magazine in,
  R does nothing and says why (no topping up).
- [ ] **Use up every magazine.** You can't fire again that round; the next round starts you full.

## Aiming and optics

The rifle comes with flip-up iron sights; a red dot or a 2× scope is a part you fit in Loadout › Customise.

- [ ] **Hold right click with iron sights.** The rifle comes up to your eye, the view narrows a touch and the
  crosshair goes: the front post sits in the rear ring.
- [ ] **Fit the red dot and aim.** It sits on the rifle with the iron sights folded under it; the crosshair gives way
  to the dot and you move at a quiet walk (no sprint while aiming). Let go and it all goes back.
- [ ] **Shoot while aiming.** BBs go where the dot (or post) is. Aiming halves the spread: at 25 to 35 m it should be
  clearly tighter, and the hip up close should still feel fine.
- [ ] **Hold Shift while aiming.** You creep slower than the aiming walk (1.4 m/s against 2.3). Steady, not stuck?
- [ ] **Move the mouse while aiming.** It turns at Settings › Controls › Aiming sensitivity (×0.80 at first).
- [ ] **Reload or switch to the pistol while aiming.** The sight drops and comes back if you still hold right click.
- [ ] **Fit the 2× scope and aim.** It comes up a little slower than the red dot; the rifle stays in view with the
  world twice as close through its glass, a fine crosshair and a red centre dot.
- [ ] **Press Esc in a match.** The pause menu has no Loadout: parts are set between matches (the range's has one).

## BBs

### Out of the muzzle

- [ ] **Fire from the hip: single shots, a burst, a spray.** Each BB and its short streak start at the barrel's tip
  and fly out towards the crosshair, also straight after sprinting; the rifle kicks back and up a little rather than
  tipping.
- [ ] **Do the same aiming, and with the pistol.** BBs leave the muzzle under the sight and rise into the dot or
  crosshair.

### Hop-up, flight and wind

Hop-up puts backspin on the BB, which lifts it so it flies flat for longer; each replica has a dial in Loadout ›
Customise. BBs fly by real air physics, and each match has a light breeze (calm to about 2 m/s) that pushes BBs,
never players.

- [ ] **Factory hop (rifle 65 %, pistol 55 %), at a target 30 m or more away.** Rifle BBs rise about a hand's width
  near 20 m and stay on target to about 39 m, taking about half a second; the pistol's drop from about 27 m.
- [ ] **Hop-up at 0 %, then 90 to 100 %.** At 0 BBs drop from about 14 m; at 90 to 100 they climb about half a metre
  over your aim and float before they fall.
- [ ] **Watch the dust (Medium or up).** It drifts one way, the wind, which changes from match to match.
- [ ] **Practice range, every target to 60 m.** Each can be hit: from 40 m aim high (or turn the hop up) and a little
  upwind; a level shot at the 60 m plate lands short.

### Walls and ricochets

- [ ] **BBs stop on everything.** Shoot crates, container sides, wall tops and corners, the dock and its steel ramps,
  a gabion, the toilets: every BB stops or bounces at the surface, never inside or through it (Settings › Dev › BB
  paths).
- [ ] **Fire at concrete or a container at an angle.** BBs glance off and fly on, slower; into a crate they stop.
- [ ] **Ricochets count Off (the default).** A bounced BB that hits you shows "Ricochet · doesn't count, play on"; one
  of yours that reaches a bot shows a grey puff and "Your BB ricocheted · doesn't count".
- [ ] **Ricochets count On** (Play › Match). The same shot knocks you out: the hit feed says RICOCHET (not FRIENDLY).
  Is the notice useful, or does it come up too often in a 3v3?

## Players and replicas

- [ ] **Players.** Teammates and opponents are masked humans (never a bare face) in team camo with a plate carrier in
  the team colour, or robots in a light or dark shell by team.
- [ ] **Team camo** (Medium and up). Clear dark and light blotches in the team's colour, crisp up close and blending
  far off without shimmering; Low keeps plain clothes.
- [ ] **Your hands.** Dark gloves, sleeves in your team's camo (Hand detail High) and the team armband on the left
  forearm. Inspect (Y) the rifle and each pistol: the firing hand's wrist sits low behind the grip, bent a little up from
  a forearm running back about level, the thumb where it was (Beta 1 item 21).
- [ ] **Look straight down.** Standing, crouched and in a vault: you see the ground, never your own body (Beta 1
  item 24).
- [ ] **Hit call.** Hit a bot: the HIT! sign, the hand up, the replica hanging; readable at 20 to 30 m.
- [ ] **Replicas.** The rifle and pistol look like toys: blocky, two-tone, stippled grips; others' replicas are in
  their team's colours.
- [ ] **Replica detail on High.** Fine speckle, rounded lit edges, rail slots and sights. In Loadout try every optic,
  grip and magazine: nothing floats or clips the hands.
- [ ] **Gas puffs and impacts.** The pistol puffs a little gas each shot; the rifle none. No flash, no casings.
  Impacts make pale dust on concrete, tan crumbs on wood, a grey puff on steel: never sparks.
- [ ] **Name tags.** A teammate's tag sits just above the head at 1 to 2 m and at 30 m. Try a field of view of 80.
- [ ] **Blender models** (the default since BD1). Bots are the Blender humans and robots holding the Blender replicas.

## Loadout and Customise

Loadout (the title screen or the top bar). The slots are Primary, Secondary and Grenades (greyed: none yet); a replica
still to unlock is greyed with a lock and its level. Right-click an equipped replica, or use Customise, to change its
parts. To try every part before you have levelled, turn on Settings › Dev › Disable levelling.

- [ ] **Swap slots.** The GBB Pistol in Primary moves the AEG rifle to Secondary. Any replica goes in either slot.
- [ ] **Saved loadouts.** One dropdown picks a saved loadout, with Rename, Duplicate, New and Delete beside it.
- [ ] **Customise.** Colour, optic, BB weight, hop-up, grip, laser, magazine, power source, barrel, muzzle and light,
  each offering the parts that fit. Back (or Esc) returns to the Loadout, named in a plain-text breadcrumb.
- [ ] **Locked parts.** At a low level the options still to unlock follow the ones you have, greyed with a lock and
  "Level N", and can't be picked; "Level up to unlock more" goes once a row is fully unlocked.
- [ ] **BB weight.** 0.25 g on the rifle and 0.20 g on the pistol as they come. 0.28 g on the rifle needs more hop (at
  about 75 % it stays on target to about 41 m); 0.20 g at 65 % hop floats, about 50 % flies flat.
- [ ] **Grips.** Vertical: after a sprint the crosshair closes sooner; switching is a touch slower. Angled: switching
  and raising the sight are quicker; after a sprint the crosshair stays wide a moment longer.
- [ ] **Magazines.** Hi-cap: 120 BBs and one spare; a bot facing away hears its rattle within about 7 m. Low-cap: 30
  BBs, five spares, quicker change and draw. The pistol's extended magazine: 27 BBs, slower to draw.
- [ ] **Barrels and the silencer.** Tight-Bore: spread −15 %. Long Barrel: energy +10 %, spread −10 %, slower to draw
  and raise. Silencer: energy −5 %, a slower draw, shots heard from 22 m become 11 m, duller and quieter; a bot facing
  away 15 m off doesn't turn at a silenced shot.
- [ ] **Performance panel.** Energy, muzzle speed, BB weight, rate of fire, on-target range, time to 20 m, spread,
  recoil, magazines, reload, draw, aim raise, shots heard from.
- [ ] **The 11.1 V LiPo battery** on the rifle: rate of fire +15 %, energy unchanged; it empties faster.
- [ ] **Glowing BBs** (per replica): At Night (the default), Always or Off. A glowing BB is green, a little larger at
  range, with a longer streak.
- [ ] **Light** (dev content, night fields). Every replica has the Weapon Torch from level 0, switched with **T**.
- [ ] **Your setup is kept.** Reload the page: every pick is still there. Teammates carry replicas as they come;
  opponents carry kits of their own ([Bots](#bots)).
- [ ] **Edit `stats.md`.** Set the AEG's `Fire rate (BBs/s)` to 20 and run `npm run dev` again: the panel says 20 and
  every rifle fires faster. A typo shows in the browser console and `npm run test` names its line.

## Cyber Pistol

The level 10 reward. To try it now, turn on Settings › Dev › Disable levelling, or press Settings › Dev › Level up
until 10.

- [ ] **Equip it.** Below level 10 it is greyed with a lock and "Level 10"; once unlocked it goes in either slot.
- [ ] **Its look.** A white slab with glowing cyan lines and a magenta core, the same on either team; with Realistic
  colours plain grey and unlit. Does it read as rare and special?
- [ ] **Customise.** Power source reads Built-in battery, the magazine "Its own, 50 BBs"; optic, grip, laser, barrel
  and muzzle rows are greyed; BB weight and hop-up still turn.
- [ ] **On the range.** It starts on Semi and the selector steps Burst and Auto; even on Auto the sight barely climbs.
  It stays on target to about 33 m.
- [ ] **Its sound.** A quiet electronic chirp and a soft pop, no motor whine; an empty trigger blips; a reload ends in
  a two-note chime. Futuristic but still a toy?
- [ ] **The Armory and the summary.** Level 10's row holds it; reaching it the summary says "Level 10!" and "Unlocked:
  Cyber Pistol".
- [ ] **Bots with it.** With it unlocked (or Disable levelling on), about 1 Hard match in 20 has an opponent with it.
  Never on Easy or Normal, never a teammate.

## Levels and the Armory

Finished matches give XP, each level up to 10 unlocks parts for good, and nothing is ever sold. What each level
unlocks is in `data/levels.md`; the Armory shows it in the game.

- [ ] **Level 0 to start.** On a fresh save (a private window, or Settings › Save › Delete) the top bar reads "LVL 0"
  with an empty bar.
- [ ] **The level badge.** "LVL N" with a thin XP bar at the far right of the top bar on every screen after the title;
  point at it for "X XP to level N+1", click it to open the Armory (from the pause menu it does nothing).
- [ ] **The Armory.** Your level "of 10", the XP bar and how XP is earned (a match 100, a win 100 more, each round won
  20, each hit 10, times the difficulty), what the next level unlocks, and every level with its items (reached ones
  Unlocked, the next Next). Easy to read?
- [ ] **XP on the summary.** Win a standard first-to-5 match on Normal: "XP earned +N XP", what gave it, then "Level
  N: X / Y XP" over a bar. A loss gives less.
- [ ] **A level up.** Your first finished standard match takes you to level 1: the summary says "Level 1!" and
  "Unlocked: Red Dot", and the Red Dot is in Customise with no lock.
- [ ] **No XP.** The range and the tutorial give none; a match with a dev map or mode, or a Dev aid on, says why it
  gave none.
- [ ] **Settings › Dev › Disable levelling.** The badge goes, the Armory says levelling is off, and the Loadout and
  Customise offer everything unlocked. A match gives no XP and stays out of your records.
- [ ] **Dev XP buttons.** **+500 XP** adds 500 (a level it reaches unlocks its items); **Level up** adds exactly what
  the next level takes (at 10: "At the top level"); **Reset level** asks first, then returns you to level 0.
- [ ] **At the cap.** At level 10 the Armory and the summary say "Top level reached. XP counts again when the level
  cap goes up." and the bar is full.
- [ ] **An old save.** A save from before the levels (Field Credits, Armory items) loads at level 0 with the starting
  kit, your settings and records kept.
- [ ] **Edit `levels.md`.** Swap the Red Dot (level 1) and the Silencer (level 4) and run `npm run dev` again: at
  level 1 the Armory lists the Silencer.

## Rounds and matches

One BB hit puts anyone out. A round lasts up to 2:30 and the first team to 5 round wins takes the match.

- [ ] **Get hit.** A sharp tick, a sign of where it came from, and your view walks off. Then you watch a teammate; a
  click moves to the next one.
- [ ] **Skip to next round** (M83). Out and spectating, Esc skips at once with no pause menu (Dev 5 playtest, note
  10), then "Click to play · Esc for the menu" holds the next round; the pause menu's **Skip to next round** still
  works. On match point it reads **Skip to the result**. Not offered in play, between rounds, in Extraction or on the
  range.
- [ ] **Shoot a teammate (carefully).** Friendly fire counts, so they go out too.
- [ ] **Walk-offs.** Hit players walk all the way to their dead zone by a sensible route, promptly, on every map; they
  stand on separate spots.
- [ ] **End a round.** A banner says who won, the score updates and the next round starts by itself. A fresh page load
  starts with the referee's two short whistle blasts.
- [ ] **Overtime flag (OT1).** In Elimination, hide until the clock runs out with both teams in (Round time 1:30 is
  quickest): three whistles, "Overtime · touch the flag", a chequered flag near the middle and a 0:30 clock. Touch it
  (within a metre) and your team wins, "Flag touched"; with both teams at it nobody wins; untouched, "draw" and the
  round replays. Bots head for it; does 30 s feel right? Attack / Defend has none.
- [ ] **Overtime banner (BP5).** It fits on one line at 1280 px wide; the feed (hits and callouts) hides while Tab is up.
- [ ] **Finish a match.** The Match summary ([HUD and match info](#hud-and-match-info)), then the result screen. Go
  straight to Stats: the match is counted and its XP given at once.
- [ ] **Play again** shows a new seed in the F3 box; that seed in a new page replays the match's start. Quitting and
  playing the same map a few times starts almost at once and looks like the first Play.

## Maps

### Depot

An asymmetric warehouse yard. Attackers start in the west yard, defenders in the north-east corner, and the one
flagpole stands in the walled loading bay. Three lanes lead there: **Dock Road** (north, along a raised loading dock),
**Container Alley** (the middle, through the Main Gate) and the **Office** (south, close quarters).

- [ ] **Walk all three lanes from the west yard to the pole.** None has a dead end and you can tell which you're in.
- [ ] **The dock.** Its ramps have no bumps; you can step off its open edge (a 1.2 m drop) but walking up to it
  doesn't push you off.
- [ ] **Jump against crates, the ramp kerbs and the dock edge.** You never land on top or hang on an edge. You can't
  see the other team's spawn from yours, standing or crouched.
- [ ] **Cover.** A pallet rack, a gabion barrier and a portable toilet are full cover; crouched behind an IBC tank, a
  generator or sandbags you're hidden, standing you can shoot over.
- [ ] **The east end** (Alpha's start in Elimination): the team leaves past the wall's south end and nobody gets stuck
  in the yard's north corner.
- [ ] **Balance.** In Attack / Defend, does attacking or defending feel easier, and which lane do the bots pick? In
  Elimination, does either end feel stronger over a half?
- [ ] **The look by day.** A low warm sun with long shadows, a blue sky, light bouncing into the shade; precast
  concrete, gabions, rust and rain streaks, ground stains (Medium and up).
- [ ] **Set dressing (Medium and up).** Dirt, junk and litter against walls, glossy puddles, logos and warning signs:
  nothing new to hide behind and no new long sightline.
- [ ] **Dust and signs.** Sprinting and landing kick up a little dust. Bay numbers, hazard chevrons and SAFE ZONE by
  each dead zone read properly, never mirrored or half inside a prop.

### Woodland (dev content)

A wide wood at night: 120 × 80 m on a gentle slope up to the Knoll and its log fort, with three lanes (Pine Belt,
Meadow, Creek with the cabin). 5v5 by default, or 6v6. Turn on Settings › Dev › Dev content, then pick it on Play.

- [ ] **Hidden starts (M88).** From either camp, and for the first steps out of it, you can't see the other team (the
  West Rise hides the west camp, the Knoll the east). Play both halves.
- [ ] **The night.** A dark sky under a low moon, flickering camp fires, glowing lanterns; on Medium and up the
  nearest ones light players too.
- [ ] **Bushes** hide you from bots when you're deep in or behind one; you walk through them; the minimap draws them.
- [ ] **Bushes stop BBs (FO1).** A BB into a bush's middle never comes out, with a leafy rustle and falling leaves;
  through the edge it comes out off its line and slower. Fire from deep inside: "Leaves in the way · step clear to
  shoot". A Normal bot holds fire until it has a clearer line; an Easy one fires into the leaves.
- [ ] **Night sight.** Bots see about 40 m into a light pool, 25 m in the open and 10 m under the trees; fires and
  lanterns give you away.
- [ ] **The look and sound.** Bark trunks, log walls and log piles, plank fences, a gravel ravine bed; wind in the pines,
  insects, a distant owl, a crackle at each fire, and footsteps that sound like the ground, as loud as on concrete.
- [ ] **The meadow and the fort (WL2).** No lone oak in the middle and no boulders anywhere: the meadow has fallen
  trunks and the three climbs to the fort have log piles you can stand behind. The fort's outer walls are chest high
  (1.5 m): stand to shoot over, crouch to hide. The hut is taller, under a grey tin roof like the cabin's, and the flag
  still shows over the walls from the meadow.
- [ ] **West Hill and the ravine (WL3).** From the Knoll by the east camp you can't see over West Hill into the west
  camp. The meadow has one low swell. The creek lane runs along a dry ravine, deeper from the middle of the field east;
  every slope walks, none needs a jump.

### Neon Heights (dev content)

A small three-floor market city with stairs, a Sky Bridge and a balcony, 4v4 to 5v5, Day or Night (Night by default).
Turn on Dev content, then pick it with its Day | Night switch on Play.

- [ ] **The look.** Pastel buildings (mint, pink, cyan, amber), a paved street, zebra crossings, neon strips; arcade
  cabinets, vending machines, stalls, planters, phone booths and a van read as what they are.
- [ ] **By Night.** The avenue, the atrium and the shopfronts sit in lamp light; stairwells and Level 1 rooms are
  dark.
- [ ] **Night sight.** In a dark room a bot spots you only close up (about 15 m), in lamp light from far off. Fair next
  to the moonlit street (25 m)?
- [ ] **Ceilings with few lights.** Settings › Graphics › Custom › Night lights Off, then Nearest 4: ceilings stay
  readable. On Medium or High a lamp's light can show on the floor above its room (known).
- [ ] **The sound.** By Day a low traffic hum, a passing drone, a shop door's chime; by Night quieter traffic, the
  neon's hum and sizzle, arcade bleeps; no click every 3 s (a pulse that often is the flicker's swell).
- [ ] **Balance.** Play Elimination by Day and by Night: are the two ends even?
- [ ] **The Plaza stair (BP5).** Walk up the outdoor stair without jumping: you reach the landing without stopping.
  Sprint down it: no drop.

## Bots

You're on Alpha (blue) with two bot teammates against three Beta (orange) bots by default; Your team puts you on Beta.

- [ ] **Hit a Beta bot.** It raises its hand, walks off to the dead zone, and you get a clear sign of the hit.
- [ ] **Watch the bots for a few rounds** (spectate once you're out). They patrol, take cover, crouch behind crates
  and lean round corners; note any bot stuck or walking into a wall.
- [ ] **Run near a bot, then walk past one with Shift.** Running gets you heard; walking lets you sneak closer. Behind a
  wall they notice you later: do they hear through walls like a wallhack, or too little?
- [ ] **Shoot near a bot from past 22 m, unseen.** It ducks and comes looking or takes cover; a search that finds
  nobody ends with a crouched look round.
- [ ] **Noisy props (NP1).** Run (not walk) into a skip, container, crate stack or rack: a boom or rattle where you
  hit it, and an idle bot 15 m off turns to look. Walking or crouching into it is silent. A BB off steel near an idle
  bot draws its look; sprinting over gravel or a steel ramp is louder. Does a knock feel fair?
- [ ] **Fight a bot beside a wall or container.** It sidesteps away from the wall and keeps you in sight; on the
  dock's edge it never steps off. Bots by door frames don't fire into the frame.
- [ ] **Every level hunts (M87).** Once their lane is swept, bots hunt the map's middle without walking into corners
  they already saw empty; a round shouldn't drag to the clock.
- [ ] **Up close, a fair moment.** Walk into a Normal bot at 5 to 10 m: its first BBs go wide and walk in (its first
  hit takes about 1.5 s).
- [ ] **The bots' kits (BG1).** Opponents carry kits from `bot-kits.md`: Easy mostly plain, each level up more scoped,
  silenced or red-dot, Pro never plain. Spectate a few: the optic shows on their rifle and a silenced bot is heard
  nearer. Does gear make Normal unfair or Hard too easy?
- [ ] **Bot names and personalities (BN1).** Every bot has a name and plays the same way every match: a **Rusher** is
  first through the gap, an **Anchor** holds one spot aiming over cover, a **Flanker** takes a lane of its own, a
  **Careful** bot clears each corner. Can you tell them apart?
- [ ] **At night** (Woodland, Neon Heights by Night): Normal, Hard and Pro bots hold posts out of lantern light.
- [ ] **Anchors (BP5).** In Elimination with over a minute left, give an anchor teammate Follow me (F), then end it
  with F again: it goes hunting.

## Modes

### Attack / Defend

- [ ] **Raise the flag.** Stand in the painted ring at the pole for 5 seconds; the strip under the score shows how far
  up it is and a marker shows the pole. Sides swap after round 4.

### Custom matches and rules

Play › Match. The Rules row comes first: Skirmish (the standard match), Tournament and Pro CQB (dev content), or
Custom, which opens every row.

- [ ] **The rows.** Rounds to win (3 to 10), Round time (1:30 to 5:00), Team size (1v1 to 3v3; larger on Neon Heights
  and Woodland with Dev content), Opponents, Teammates, Friendly fire and Ricochets count.
- [ ] **A 1v1, a 2v2, first to 3.** The scoreboard and pips match the sizes; first to 3 swaps ends after round 2 and
  ends at 3. Do rounds feel too long or quick at that size?
- [ ] **Opponents Easy, Teammates Hard.** Your teammates win clearly more often. The rules text says this match won't
  go into your records.
- [ ] **Friendly fire off.** A BB at a teammate passes by. **Custom** gives XP at most ×1.5 and never counts for
  records. **Tournament** (dev): first to 7, win by two, 2:00 rounds. **Pro CQB** adds semi only and real-cap
  magazines.

### Practice range

The Match screen's Practice card, then Start practice.

- [ ] **The range.** Alone behind a painted line facing three lanes: steel plates, standing figures, crouched ones, 10
  m to 60 m marked. No whistle, clock or score.
- [ ] **Reload and Esc › Loadout.** The spare gauges never run down. Change the BB weight or hop-up, go back and
  Resume: you're where you stood with the new setup. Walk downrange: nothing stops you.
- [ ] **Dev help isn't a best (BP5).** Switch Timed challenge on, then set Game speed or Bottomless magazines before
  the START plate: the result says "not kept (Dev settings)".

### Tutorial

- [ ] **The title screen** offers Tutorial under START on a clean save until you finish it or start a first match.
- [ ] **Play it through.** The coach says "Tutorial · 1 of 16 · Look around" and moves on as you do each thing (look,
  walk, ring a plate, knock down a figure at 50 m, reload, selector, aim, crouch, lean, sprint-fire, vault, switch
  replica, then four cards to read); finished steps tick green. Does any step feel stuck or unclear?
- [ ] **Lean (TT2).** After Crouch, the Lean card names Q and E (your bindings); it ticks only once you have peeked
  both ways, in either order.
- [ ] **Short and quick (TT1, TT2).** Every card is a sentence or two; the four read cards fill a thin bar and move on
  after 10 s.
- [ ] **Esc mid-tutorial.** The pause menu names your step and offers Skip step and Skip tutorial; quitting at step 5
  and starting again resumes there. Rebinding reload changes the coach's key.

### Extraction (dev content)

Your squad against a home team on a timed run. Turn on Dev content, then Play › Mode › Extraction (Depot, Woodland or
Neon Heights). A run gives no XP while it is dev content.

- [ ] **Play screen and exits.** The Match line reads "Squad of 3 · 5 in the home team", "One 8:00 run"; with Dev
  content off it isn't offered. Exits are green rings with cones and an EXIT sign, yellow with Settings › Accessibility ›
  Team colours on High Contrast (the minimap door and the marker too); a late exit is grey until it opens.
- [ ] **Counted out.** Stand in an open exit: a beep a second, "Counting you out · 9 … 1", "Counted out · you made
  it!"; stepping out restarts it and a Beta bot in the ring pauses it.
- [ ] **Respawn and coming in.** Hit once: back at the insertion, "no respawn left"; hit again: "Out of the run". For 3
  s after coming in or respawning, BBs neither hit you nor leave your replica.
- [ ] **The clock.** A whistle at 1:00 left; the late exit opens at 3:00; at 0:00 "Caught out".
- [ ] **Cases.** Ammo can, field case and locker stand by cover. Hold G (about 2, 4 and 7 s) to open: "+35 XP" or "BB
  resupply" (never a part).
- [ ] **Guards, patrols, hunters, waves.** Two guards by the locker (one on Easy), patrols in pairs, and from halfway
  through the home team hunts you. A hit bot returns about 75 s later on Normal, out of sight. Tense late without
  feeling unfair?
- [ ] **By level and map.** The home team is the map's base plus your squad, one more on Pro: Easy lets you out with
  three cases most runs, Normal about a third, Hard rarely, Pro hardly ever.

## Pro difficulty (dev content)

Turn on Dev content, then Play › Match › Opponents › Pro; play each map once in Elimination and once in Attack /
Defend. Pro pays XP ×2 but counts for nothing while it is dev content.

- [ ] **Slow down.** Pro bots hold still aiming at corners and doorways and walk quietly towards where they heard you.
  Run past a corner and you lose; slice it a step at a time and you win.
- [ ] **What got you.** After you're hit a card shows, for example, "Beta 2 · from your left · 14 m", whether that bot
  held the angle and whether you moved.
- [ ] **Teammates on Pro** hold angles, trade your hits and win their duels. Is any approach unfair on a map, or does
  one end win far more?

## Menus

- [ ] **The title screen.** Only "AIRSOFT", the tagline "Call your hit. Go again." and **START**; on a clean save a
  **Tutorial** button under START. The build sits small at the bottom right with **Licences** over it, a
  **Fullscreen** button at the bottom left. Licences opens the third-party licences in a new tab, as plain text, in a
  built copy (`npm run build`, `npm run preview`; the dev server has no such file).
- [ ] **The top bar** on every screen after the title: MATCH, LOADOUT, ARMORY, SETTINGS, your level and XP bar on the
  right, the current place marked.
- [ ] **The Match screen** (START). 01 Map as picture cards (a Day | Night switch where a map has both), 02 Mode as
  cards with **Practice last**, 03 Match rules; on the right Your match with the Loadout's Change and **Start match**
  (**Start practice** for the range).
- [ ] **Your team** (M98). Alpha or Beta, each with its colour dot, kept after you leave; Extraction hides the row. On
  Beta you start at Beta's end with the orange armband and an orange HUD (YOU tag, markers, minimap, wheel); bot
  opponents are "Alpha 1…3"; ends swap at half-time. Play each mode and map once on Beta.
- [ ] **Pause (Esc).** Everything freezes, the mouse is freed, and a solid screen shows the round and score with
  Resume, Settings and Quit ("Round 2 · Alpha (you) 1 – 0 Beta · first to 5"; Attack / Defend says "you attack" or
  "you defend").
- [ ] **The result screen.** MATCH OVER, YOU WIN! (or YOU LOSE), the score, and Play again, New game, Summary and Quit.
- [ ] **The look.** All text is Inter (numbers keep their width), headings in capitals, tidy at 1280×720 and
  1920×1080; a button lifts when pointed at; Tab shows an orange focus ring; with reduced motion no fades.
- [ ] **Window sizes (UX1).** At 4K with 100 % Windows scaling the menus are about 1.5× their 1080p size, and the
  saved loadouts' menu opens at the pointer. At 1280×720 the top bar, heading and main button always show; the long
  list scrolls, fading at its foot (Settings › Gameplay and Controls scroll a long way, even at 4K: tell me if that
  grates). At 900×600 Start match is in sight.
- [ ] **The loading screen** (`npm run build`, `npm run preview`, DevTools › Network › Slow 4G, cache off).

## HUD and match info

- [ ] **Hop-up mid-match.** 4 turns the hop-up down and 5 up (Page Down / Up too). The readout over the ammo panel
  shows the dial, a tick at the best setting for your BBs and how far they stay flat ("Flat to 39 m").
- [ ] **Round end stamp.** WON, LOST or DRAW stamps at the end of a round and stays 2 s, then the round's table holds
  about 4 s before the next round (RE1); a click after half a second moves on. Long enough to read, never a wait?
  Since BP6b a click held through the skip fires nothing until you let go, and in a 720 px window the word sits clear
  under a two-line banner.
- [ ] **Feed position** (Settings › HUD). Bottom left moves the feed there; top right is the default.
- [ ] **Hit feed.** Hits and callouts share one feed, top right, newest on top: "Beta 2 called HIT · Alpha 3" with names in team colours; lines about
  you say "You"; friendly fire says FRIENDLY and a ricochet RICOCHET.
- [ ] **Teammate markers.** A name tag and arrow in your team's colour over each teammate, also through walls; grey
  and "hit" once hit; enemies never. Holding Tab hides them; tags stack, never on top of each other (BP5). Helpful, or
  too much?
- [ ] **Hold Tab.** The scoreboard: hits, times hit, friendly hits, BBs fired, accuracy and time alive, your team
  first, your line highlighted, players hit this round greyed.
- [ ] **The Match summary.** The result, everyone's numbers and Your records (wins and losses per difficulty and mode,
  best accuracy and wins in a row, NEW RECORD on a best you beat).
- [ ] **What got you** (Settings › Gameplay): Auto shows the card against Pro only, On on every level, Off hides it.
- [ ] **Crosshair** (Settings › Gameplay › Crosshair). Previews, Shape, Size, Thickness, Gap, Colour (no blue or
  orange), Opacity, Spread and Outline; in a match it looks the same and opens as you move.
- [ ] **Hit marker** (M97; Dev 5 playtest, note 4). Off by default: the hit tick sounds but no X. On: a bold red X
  pops over the crosshair and fades; scale, thickness, outline and colour change it at once. Is the default easy to
  see on every map?
- [ ] **Replay tutorial** (Settings › Gameplay, M97). Starts the tutorial at its first step, even after you finished
  it; from a match's pause menu it asks first, then leaves the match (not recorded).
- [ ] **HUD size and opacity** (Settings › Gameplay › HUD). 150 % scales the replica panel, score bar, minimap, feed,
  banners, wheel and markers with nothing overlapping at 1280×720 (the minimap grows a little less there, so an
  Attack / Defend score bar stays clear of it, UX1); the crosshair keeps its size.
- [ ] **The layout.** A score bar top middle (team blocks, the clock, "First to N"); the replica panel bottom right
  (UI2: S / B / A chips over a small box per spare magazine, the count and "/ N" at the right; no picture, no name, no
  reload hint); no squad cards or key hints; "ROUND 1" shows large; corners keep their margin at 1920×1080 and on 21:9.
  Is the panel compact enough, and are the magazine boxes easy to read at a glance?
- [ ] **Ammo counter** (Settings › Gameplay › HUD, AC1). On by default. Off: no BB count and no "/ N · M spare" line;
  each magazine box stays full until empty, then hollow.

## Squad orders and minimap

- [ ] **Follow me (F).** A radio double-click answers. Teammates keep up a few metres behind, sprinting to catch up;
  stop and one looks back, the other to a side; walk or crouch and they do too.
- [ ] **Hold here (X).** Look at a spot and press X: both go there, watch the way you looked and stay when you walk
  off; a diamond marker shows the distance. X at the sky: each holds where it stands.
- [ ] **Regroup (V).** They sprint back to you, then follow. Get hit: the order ends and order keys say "Orders wait
  for the next round".
- [ ] **The order wheel (hold Z).** Five items round the crosshair (Need a Mag upper left), each with its key. The
  view stays still while a pointer lights the order it's on; let go on one to give it, or without moving to give none.
  Walking continues; firing needs a new pull after. Orders > Click points and clicks instead.
- [ ] **Pings (middle mouse).** Ping the floor or a wall: a team-coloured ring with "Ping · 24 m", on the minimap too,
  fading after about 8 s. A teammate answers once and one goes to look, each its own way; ping the sky: nothing. A
  visible opponent gets an orange "Contact" diamond (one hidden in a bush or the dark isn't marked). Settings › HUD ›
  Ping markers Off hides the markers only.
- [ ] **Ask for a mag (H).** With less than one full magazine in your pouch the line under the crosshair says "Low on
  BBs · H to ask for a mag". H: the nearest teammate says "Mag coming!", comes and tosses a magazine you see arc into
  your hands ("+1 mag from Dash · 60 BBs"). With a full spare, or nobody near, it says why not.
- [ ] **A teammate asks you.** Settings › Dev › Bots run low on BBs: 8 s into each round a bot of each team is on its
  last magazine and calls "Need a mag!". When that is you, the line says "Dash needs a mag · 12 m", then "H · Toss
  Dash a mag" in reach; H tosses it and they say thanks. A pistol only gets a pistol's magazine.
- [ ] **The minimap.** Top left, the way you look always up, you the white arrow; teammates are team-coloured dots
  (pinned to the edge when off it), grey once hit; an opponent you hear shows as a patch roughly where (dashed for
  steps, a dot for a shot) for a few seconds. Gameplay › HUD › Minimap Fixed keeps north up (M83). On Neon Heights it
  shows your floor.
- [ ] **Markers off the minimap (BP5).** A ping, the overtime flag, an Extraction exit or a hold marker off to your
  left sits under the minimap, never behind it.

## Settings and controls

Settings opens on Display, with groups down the left (Display, Graphics, Gameplay, Looks, Audio, Controls, Accessibility, Save file) and a
"Dev settings" box that shows the Dev group.

- [ ] **Search and notes.** Typing "shadow" shows only matching rows with "N settings found"; pointing at a row says
  what it does, and in Graphics what it costs.
- [ ] **Mouse.** Under the sensitivity, Turn distance (cm/360) with a cm box and a DPI box (800 at first), and the
  same sensitivity for CS2 and Valorant.
- [ ] **Aim button and Sprint key: Toggle.** One right click keeps the sight up; sprint or a switch to the pistol
  drops it.
- [ ] **Raw mouse input.** After the first Play the line says "Raw input is active" in Chrome and Edge; in Firefox
  it says "Firefox never does" from the start.
- [ ] **Keys** (Settings › Controls › Keys). Each action has a main and a second key box. Binding a used key swaps the
  two ("R was Reload: Reload is now Space"); Backspace clears (Move forward keeps one); the wheel and side buttons
  bind; F5, F11 and F12 are refused; Reset All asks first. By keyboard only: Tab to a box, Enter, press a key.
- [ ] **Your keyboard layout** (Chrome or Edge, AZERTY or QWERTZ). Move forward shows as Z (AZERTY) and the order
  wheel as W or Y; the tutorial and reload hint use the same letters.
- [ ] **Display.** Field of view starts at 90° (120° shows more at the sides, 80° less). Fullscreen (or F10) goes
  fullscreen and back with play carrying on; Esc leaves it and pauses. No Tone mapping row here or in Graphics.
- [ ] **Dev group.** Debug info, BB paths, Game speed (25 % to 200 %), Bottomless magazines and Ghost (BBs pass
  through you) change play; with any on, the summary says Dev settings kept the match out of your records.
- [ ] **Settings › Dev › Tone mapping** (RV2). Neutral by default; AgX and ACES change the colours at once. Untick the
  Dev settings box and the colours go back to Neutral at once; a match played with AgX still counts.
- [ ] **Dev playtesting aids** (M90). **+500 XP**, **Level up** and **Reset level** change your level at once and
  survive a reload. **Time of day** plays the map under the other light; **Bots hold fire**.
- [ ] **Settings › Dev › Retro look** (M96, back on the Dev tab since ST1). Off by default; On gives chunky pixels and
  a small dithered palette at once, with Pixel size and Colours; the HUD and menus stay sharp.

## Sound

Headphones help: direction (in front, behind, above) comes through best on them. Every sound is made by the game.

- [ ] **The rifle.** Each shot is a gearbox cycle (a whirr, a plastic slap, a puff of air): a toy, never a gunshot. A
  burst starts with the motor winding up and coasts down after you let go.
- [ ] **The pistol.** A sharp pop of gas, a short hiss and the slide clacking: clearly another replica with your eyes
  shut. Empty, the rifle still whirrs and the pistol only clicks; the reloads sound different too.
- [ ] **Impacts and steps.** A ringing ping off steel, a hollow knock on wood, a dry tick off concrete; a clank on
  steel ramps, a scuff on concrete, louder with kit rattling when you sprint and land; crouching and leaning rustle
  softly.
- [ ] **Bots by ear.** Close your eyes: you can point at one, behind you too. Behind a container it sounds duller and
  quieter. A bot sprinting at you from about 20 m is heard most of the way, quieter than any shot.
- [ ] **The field.** A very quiet outdoor bed with no audible loop and a small bird now and then; each field has its
  own echo. Rare far-off extras (M86: a crow and a dog on Depot, a creaking branch on Woodland, pigeons on Neon
  Heights): does any make you turn round?
- [ ] **Getting hit.** The tick stands out and the world dips; while you walk off the field sounds muffled, the whistle
  stays clear. Pausing mid-burst and resuming makes no click.
- [ ] **Settings › Audio.** Master, Effects, Power source volume (each replica's motor, gas and spring, yours and the
  bots'), Ambience and Interface (hit tick, marker, whistle), each at once and kept.
- [ ] **Output devices.** On a 44.1 or 96 kHz device shots sound as crisp as on 48 kHz; F3 shows the audio latency
  (about 10 to 40 ms). Anything that sounds like a firearm, harsh, or too loud? Say which.

## Graphics and performance

Settings › Graphics › Quality: Low, Medium, High, Ultra or Custom.

- [ ] **First start.** With nothing saved (a private window) integrated graphics starts on Medium, a discrete card on
  High, never Ultra; the debug panel's quality line ends "(auto)".
- [ ] **The ladder.** Switching presets mid-match applies at once and the mouse stays captured after Resume. **Low:**
  80 % resolution, no shadows, plain surfaces, a soft disc under players.
- [ ] **Custom.** Changing a Medium row (Shadows Off) jumps the picker to Custom; back On returns to Medium. Render
  scale 60 % softens the picture, not the HUD.
- [ ] **Shadows on High.** Rails, posts and arms throw crisp shadows close by; edges stay still as you turn. About 25
  m ahead they stop: does the line bother you?
- [ ] **The sky and BB streaks.** A pale haze at the horizon, blue above, no sky through wall edges. BB streaks read as
  thin bright lines at 20 to 30 m on a high-DPI laptop and a monitor.
- [ ] **Frame-rate limit.** On a 120 Hz screen set 60: Show FPS reads about 60. In Firefox on Linux, edge smoothing may
  say "Not available in this browser".
- [ ] **Debug panel (F3).** "frame ms (sim / draw / GPU)" (GPU is "n/a" in Firefox), the antialias line, draw calls.
  Note the frame rate and draw calls on each preset in the open yard and in the office.
- [ ] **Load time.** Play from the title after a moment: no long hitch; on the laptop Medium starts within about half
  a second of Low.
- [ ] **No shader hitches (PF1).** In a private window open the game with `?perf` and the console open, on Medium,
  High and Ultra in turn (one fresh window each). The first picture of the field holds a moment before round 1 while
  shaders build: note how long. Then turn round, face the sun, switch replicas, reload, aim the 2x scope, watch an
  eliminated figure fade and let overtime raise the flag. No "pipelines built mid-play" line should appear in the
  console.

## Accessibility

- [ ] **Team colours › High contrast.** Light blue and dark orange on the figures, flag, armband, scoreboard, feed and
  markers, from the next match.
- [ ] **Spare magazines.** A nearly empty spare is striped as well as orange; the one a reload takes has a yellow caret.
- [ ] **On-screen sound cues** (Off by default). A marker round the crosshair points to enemy footsteps, shots and hit
  calls, fainter further away; your own and teammates' sounds show nothing. Size 200 % and colour Yellow make them big
  and yellow.
- [ ] **Reduced motion.** The replica stops bobbing and swaying, shots kick half as much, leaning tips the view only
  slightly and the dust goes. Your computer's own "reduce motion" turns it on until you pick.
- [ ] **Windows High Contrast** (or DevTools › Rendering › forced-colors: active): the crosshair, team pips, hit wedge
  and sound cues keep their colours. **A screen reader** (NVDA or VoiceOver) reads out being hit, the round result
  once and each squad order.

## Save

Settings › Save file. Everything saves as it changes; nothing to press.

- [x] **Saved automatically.** Change the field of view: "Last saved just now"; reload and your settings, Loadout,
  level and records are as you left them.
- [x] **Download and load.** `airsoft-save-<today>.json` is readable JSON. In a private window Load file (or drag it
  on) shows both saves side by side; Replace reloads with yours; Undo brings back what was there.
- [ ] **An edited file.** Change `xp` in a download and load it: the pop-up warns and the button reads Load anyway; any
  other file says "That file isn't an Airsoft save".
- [ ] **Mid-match.** Download works; Load, Restore, Undo and Delete are greyed with "Leave the match to load a save."
- [ ] **Restore points and Delete.** One restore point per day you play (three at most), with the same pop-up and an
  Undo.
- [x] **Two tabs.** A second tab shows "Airsoft is open in another tab" and waits; Play here moves the game to it with
  nothing lost. **Protect:** Chrome and Edge answer at once (often "said no for now"); once allowed it reads Protected.
- [x] **Edge.** Download, Load (button and drag and drop), the two-tab notice and Protect once. William, Edge 155,
  Dev 6 build, 2026-10-17: everything kept after a browser restart, a private window started fresh, Protect said
  "no for now". Firefox: the cloud harness (`/mnt/project-files/playtest/firefox-harness/`) runs the save tests
  there; nobody checks it by hand.

## Browsers and builds

You play in Chrome (2026-10-17, no Firefox installed): skip the Firefox lines. CI's `firefox` job runs the boot and
save tests in Firefox on every pull request, and IN1 checked mouse lock, F10 and the raw input line in Firefox 136 in
the cloud.

- [ ] **Edge, production build** (`npm run build`, `npm run preview`). It boots to the title with no
  console errors; Play takes the mouse, Esc pauses and Resume takes it back; the back and forward side buttons don't
  leave the page. `npm run dev` still boots.
- [ ] **Chrome, production build.** Mouse look is smooth with no jump on the first move after Play or Resume.
- [ ] **Esc on the pause screen** (Chrome, Edge). Esc is no click, so the browser usually won't give the mouse
  back: the menu says "Click anywhere to resume" in large type, and one click anywhere on it carries on. A click within
  a second of the first Esc gets "needs a moment, click again" in Chrome. Esc again and Resume still work.
- [ ] **Tabbing away.** Switching tab, Alt+Tab, clicking a window on a second screen or opening an overlay mid-round
  pauses the match and nothing happened while you were away; away while running forward, you stand still on Resume.
- [ ] **Hardware acceleration off** (restart the browser): the title warns the game will run slowly and where to turn
  it on. **Sound blocked** (Firefox only, so unchecked for now: Autoplay › Block Audio and Video): a line under Resume
  says so. **JavaScript off:** the loading page says the game needs it.
- [ ] **A crash** (dev server, mouse locked; console `airsoft.session.advance = () => { throw new Error('test') }`):
  the game stops, the cursor returns, "Something went wrong" shows the seed, Copy Report copies it and Reload starts
  again.
- [ ] **Precompressed files** (a host that serves them, README › Hosting): the `rapier-….js` response has
  `content-encoding: br` and about 1.2 MB transferred.

## Old bugs to recheck

Fixed in earlier bug passes; a bug pass checks they stay fixed.

- [ ] **Hit a bot, press Esc and resume** (also after Play again): no hit marker or white flash replays.
- [ ] **At the start of each round** the replica in your hands stays still; it doesn't swing in from the side.
- [ ] **Empty the AEG with the trigger held, press 2 then 1 while holding:** it clicks dry and starts a reload.
- [ ] **Customise › Muzzle** with nothing fitted reads "Bots hear your shots from 22 m."; with a silencer "… from 11 m
  (22 m without a silencer)."
- [ ] **New game at 1920×1080 and 2560×1440:** "Elimination" stays inside its card.

## Reporting what you find

Post each problem in the project chat, one message per problem. These four things let it be fixed without guessing:

1. **What you did,** step by step ("crouched behind the crate by the office door, leaned right with E").
2. **What happened,** and what you expected instead.
3. **The seed** from the F3 box, with the map, mode and difficulty.
4. **A screenshot or short clip** if you can (Windows: Win+Shift+S; Mac: Cmd+Shift+4).
