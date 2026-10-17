# Playtest guide archive: the full wording before the 2026-10-17 trim

`docs/PLAYTEST.md` passed 93 KB, nearly twice the 50 KB rule, so DX2 cut each check to what to do and what should
happen. This file is the whole guide as it stood on 2026-10-16, kept word for word: the reasons, the exact figures,
the Extraction and Pro tuning tables, "Your five calls, confirmed" and every longer check. Grep it for the detail
behind a short check; do not edit it.

---

# Playtest guide

How to run the game and what to check when you play it. Each pull request names the sections to play; a bug pass
plays them all. A change that alters what a section describes updates that section.

Tick a box when the game behaves as described. Anything else is worth reporting ([Reporting what you find](#reporting-what-you-find)).

## Get the game running

You need a desktop computer with Chrome, Edge or Firefox. The first setup takes about 10 minutes.

1. **Install Node.js (once).** From nodejs.org, download the **LTS** version (22 or newer) and install it with the
   default options. It runs a small web server on your computer; nothing is installed into your browser.
2. **Download the game.** For a release, use the ZIP link in the README. For the latest work, open
   github.com/ggbillyjoe3526/Airsoft, click the green **Code** button, then **Download ZIP** (that is `main`). To try
   a pull request before it merges, first pick its branch in the branch menu (it says `main`).
3. **Unzip it** somewhere easy, like your Desktop.
4. **Open a terminal in that folder.** Windows: open the folder, click the address bar, type `cmd` and press Enter.
   Mac: right-click the folder and choose **New Terminal at Folder**.
5. **Type `npm install` and press Enter.** It downloads the game's building blocks; wait until you can type again
   (about a minute).
6. **Type `npm run dev` and press Enter.** It prints an address. Leave the window open: closing it stops the game.
7. **Open http://localhost:5173** in your browser. The title screen appears.

To stop, click the terminal and press **Ctrl+C**. Next time, repeat steps 4 and 6 only (steps 2 to 7 for a new
download).

| If this happens | Try this |
|---|---|
| `npm` is "not recognized" or "command not found" | Close and reopen the terminal. Still failing? Restart the computer. |
| The page can't be reached | Check the terminal still runs `npm run dev`, and use the exact address it printed. |
| Black screen or "Failed to start" | Update your browser. |
| Clicking doesn't take the mouse | Wait a second and click again: browsers refuse right after Esc. |

While you play, **`** (under Esc) or **F3** shows the frame rate and the match's **seed**. Note the seed when something
goes wrong: it replays the same match.

## Play these first

What is new since 0.1 Dev 5. Each line points to the section with more checks.

- [ ] **Holster.** Press 3 to holster the replica. You move faster than with it out, but never faster than a Left Alt
  sprint, and bringing it up to aim takes longer ([Movement](#movement)).
- [ ] **Vaulting.** Jump at a low wall (0.7 to 0.9 m) and you vault it, loudly. Aiming at a ledge, crate or window
  changes nothing: there is no rest on cover ([Movement](#movement)).
- [ ] **Practice upgrades.** Moving targets, new target types and a timed challenge (off by default), Practice on any
  map with targets in place of bots, and any replica you own ([Practice range](#practice-range)).
- [ ] **Levels in the Armory.** The Armory's random unlocks are gone: matches give XP and levels 0 to 10 unlock the
  gear, the Cyber Pistol last ([Levels and the Armory](#levels-and-the-armory)).
- [ ] **Saved loadouts.** Several named loadouts, picked on the Loadout screen or from the list beside Change on the
  Match screen ([Loadout and Customise](#loadout-and-customise)).
- [ ] **Bot names, personalities and gear.** Named bots that rush, hold a spot, flank or play it careful, with kits by
  level and scoped bots that aim differently ([Bots](#bots)).
- [ ] **Adaptive difficulty.** Settings › Dev, off by default: bots get a little better when you win and a little
  easier when you lose ([Bots](#bots)).
- [ ] **Bot callouts.** A text feed at the bottom left: teammates call "Contact, Dock!" or "Two left", and the minimap
  names the area you are in ([Squad orders and minimap](#squad-orders-and-minimap)).
- [ ] **Pings and magazine requests.** Middle mouse pings a spot or an enemy and teammates act on it; H asks a teammate
  for a magazine, and they can ask you ([Squad orders and minimap](#squad-orders-and-minimap)).
- [ ] **Bushes stop BBs.** Thick leaves stop a BB and an edge throws it off ([Woodland](#woodland-dev-content)).
- [ ] **Noisy ground and props.** Running into skips and crates knocks them and bots hear it; gravel and steel steps
  carry further ([Bots](#bots)).
- [ ] **Overtime flag.** In timed Elimination, when the clock runs out a flag appears in the middle and the first team
  to touch it wins ([Rounds and matches](#rounds-and-matches)).
- [ ] **Hide the ammo counter.** Settings › Gameplay › HUD › Ammo counter Off takes the BB counts away and leaves each
  magazine's bar ([HUD and match info](#hud-and-match-info)).
- [ ] **Your Dev 5 playtest fixes.** Louder shots and a Power source volume ([Sound](#sound)), firing while sprinting
  allowed but much less accurate ([Movement](#movement)), red X hit marker options, off by default
  ([HUD and match info](#hud-and-match-info)), and Esc while out skips the round
  ([Rounds and matches](#rounds-and-matches)).
- [ ] **Redesigned figures.** The new human and robot figures, with their vault and holstered poses: turn off both
  figure switches in Settings › Dev to see them ([Players and replicas](#players-and-replicas)).

### Your five calls, confirmed

You confirmed these on 2026-10-05. They are facts to feel in play, not decisions to make; say if one feels wrong.

- **Running up ramps** costs up to a quarter of a sprint's pace. The fix is built but off, because it let attackers
  reach Depot's pole sooner.
- **Your own ricochets** knock you out when Ricochets count is on, as a teammate's would.
- **The laser beam** is off on every preset (Settings › Graphics › Custom › Laser beam turns it on).
- **Against Easy opponents** your teammates play on Normal.
- **Depot's two ends** are close to even: the west end wins about 48 % of bot-only rounds.

### Only you can do these

- **Laptop baseline.** On the low-spec laptop run `node pipeline/perf-run.mjs --env laptop --preset all --baseline`
  and commit the `pipeline/baseline/laptop*.json` files it writes. It gives the frame-time budgets real numbers.
- **Desktop Ultra baseline.** On your desktop run `npm run perf:desktop` (about 15 minutes; leave the window alone)
  and send the thread `pipeline/out/perf-desktop-summary.md` and `pipeline/baseline/desktop*.json`.
- **Save in Firefox and Edge.** The automated tests run Chromium only ([Save](#save)).
- **Woodland and Neon Heights** stay dev content until you have played them; you make each one public.

## Movement

Play › Mode Elimination on Depot, Match › Opponents Normal. Set the mouse sensitivity in Settings › Controls first.

- [ ] **Look around with the mouse.** The view turns smoothly, with no jumps, and no drift once the mouse stops.
- [ ] **Move with W A S D.** You run at a steady pace and hear your own footsteps.
- [ ] **Hold Shift and move.** You walk slowly and your footsteps go silent, and the crosshair closes to about what it
  is standing still: a walk pays off in accuracy, a run doesn't. Is the gain clear enough? (Dev 6 note 29.)
- [ ] **Press 3, then run.** Holstered, you run faster than with the replica out. Hold Left Alt too: the sprint is the
  same as armed, never faster. (Dev 6 note 27.)
- [ ] **Hold Left Alt and run forward.** You sprint. Shoot while sprinting: it fires (the replica comes up from the
  carry), but the BBs spread far wider than walking and the rifle climbs faster. Let go of the trigger and it drops
  back into the carry a moment later. (Dev 5 playtest, note 9.)
- [ ] **Press C.** You crouch and move slowly and silently without holding the key; C again stands you up. Crouch,
  then press Left Alt or Space: you stand up (Space only stands you up).
- [ ] **Settings › Controls › Crouch key: Hold.** You crouch only while C is held. The game remembers your choice.
- [ ] **Hold Q, then E, beside a wall or crate.** You lean left or right round it, tilting a little. Up against a
  wall the lean stops short, so you never see through it.
- [ ] **Press Space.** A small hop, not a big jump. Press it just before landing from a crate, or while standing up
  from a crouch: the jump happens, never twice. Does it feel right or too forgiving?
- [ ] **Watch the crosshair as you move.** It opens when you run or jump and tightens when you stand still or
  crouch. Stepping off something low (a 0.15 m kerb), even while aiming, doesn't flash it wide.
- [ ] **Run, then let go of the keys.** The crosshair snaps tight almost at once. Crouched and still is tightest;
  walking opens it a little, running a lot; straight after a sprint or a jump it takes a moment to settle.
- [ ] **Crouch-walk and fire at a range figure.** The crosshair is a little wider than crouched still and a little
  tighter than walking upright. Is the cost noticeable but fair?
- [ ] **Sprint up and down Depot's dock ramps.** Uphill loses about a quarter of a sprint's pace (your confirmed
  call, above).
- [ ] **Walk into walls, crates and corners.** You slide along them and never stick or fall through the floor.
- [ ] **Controls through a vault (BP5).** Run at a low wall and jump to vault it (Depot's office hall has one). On Semi
  (press B), hold left click through the vault: one BB, not a second when you land. Hold right click through it: the
  sight drops during the vault and comes back after. Press R, 1 or 2, 3 (holster) or B mid-vault: it happens when you
  land.

## Shooting and reloads

The rifle holds 60 BBs and the pistol 18, each with 4 magazines a round. Nothing refills until the next round.

- [ ] **Hold left click with the rifle.** A steady stream; the BB count at the bottom right drops. The box by the
  rifle's name says **Auto**.
- [ ] **Press B.** A small click and **Semi**: one BB per click. B again: **Burst**, three BBs a click. B again:
  **Auto**. The setting carries into the next round.
- [ ] **Empty the rifle in Burst.** With fewer than three BBs left, the burst fires what's there, clicks once and
  starts a reload.
- [ ] **Press 2, or turn the mouse wheel.** You switch to the pistol: one shot per click, holding doesn't keep
  firing. 1 switches back.
- [ ] **Let go of sprint and click at once with the pistol.** The shot fires at once.
- [ ] **Shoot at a far wall.** You see the BBs fly, take a moment to arrive and drop at long range; the pistol's
  drop sooner.
- [ ] **Fire half a magazine, then press R.** A magazine swap plays (rifle 1.8 s, pistol 1.2 s). The small gauges
  by the BB count show your spares; the half-used one goes back in the pouch.
- [ ] **Empty a magazine, then pull the trigger.** The empty pull starts a reload by itself.
- [ ] **Press R with a full magazine in.** Nothing swaps and the screen says why: no topping up.
- [ ] **Use up every magazine.** You can't fire again that round. The next round starts you full.

## Aiming and optics

The rifle comes with flip-up iron sights; a red dot or a 2× scope is a part you fit in Loadout › Customise.

- [ ] **Play with iron sights, and hold right click.** Small flip-up sights stand on the rails; the rifle comes up to
  your eye, the view narrows a touch (less than the red dot) and the crosshair goes: the front post sits in the rear
  ring. Do the AEG, the pistol and the Cyber pistol each line up straight, nothing blocking the view? (M84)
- [ ] **Fit the red dot, then play.** It sits on the rifle and the iron sights fold flat under it.
- [ ] **Hold right click.** The rifle comes up, the view narrows a little, the crosshair gives way to the red dot,
  and you move at a quiet walk (no sprint while aiming). Let go and it all goes back.
- [ ] **Shoot while aiming.** BBs go where the dot (or the front post) is. Aiming halves the spread, on top of standing
  still (M84): at 25 to 35 m it should be clearly tighter, and from the hip up close should still feel fine.
- [ ] **Hold Shift while aiming.** You creep slower than the aiming walk (1.4 m/s against 2.3). Does it feel steady,
  not stuck?
- [ ] **Move the mouse while aiming.** It turns at Settings › Controls › Aiming sensitivity (×0.80 of your mouse
  sensitivity at first, so the world moves across the screen as fast as from the hip).
- [ ] **Reload, or switch to the pistol, while aiming.** The sight drops for the reload and comes back up if you
  still hold right click. The pistol has no optic, so it aims down its own iron sights.
- [ ] **Fit the 2× scope and hold right click.** It comes up a little slower than the red dot, and looks like it:
  the rifle and the scope stay in view and the world shows clearly round them, twice as close. Through the scope's
  rear glass you see the world, with a fine crosshair and a red centre dot (find it against a dark wall). Turning
  feels the same as with the red dot. (Dev 5 playtest, note 5.)
- [ ] **Look at the 2× scope from the hip, and in Loadout › Customise.** Each glass is dark glass over black: no
  gap, and no view through the scope's body (Dev 5 playtest, note 6).
- [ ] **Press Esc in a match.** The pause menu has no Loadout: parts are set between matches (on the range the pause
  menu does have one).

## BBs

### Out of the muzzle

- [ ] **Fire the rifle from the hip: single shots and a burst.** Each BB and its short streak start at the barrel's
  tip and fly out along it towards the crosshair. Nothing streaks up from below the rifle.
- [ ] **Let go of sprint and fire at once, then spray full auto.** The first BBs and a long burst still leave the
  barrel in line; the rifle kicks back and up a little rather than tipping.
- [ ] **Do the same aiming, and with the pistol.** BBs leave the muzzle under the sight and rise into the dot or
  crosshair. The pistol leans only slightly to the left; the rifle points straight ahead.
- [ ] **With a silencer, flash hider or long barrel fitted, fire at a wall close up.** BBs and streaks leave the
  front of the part, not inside it.

### Hop-up, flight and wind

Hop-up puts backspin on the BB, which lifts it so it flies flat for longer. Each replica has a dial in Loadout ›
Customise; the line under it says what the setting does. BBs fly by real air physics: drag slows them, the backspin
wears off, and each match has a light breeze (calm to about 2 m/s) that pushes BBs, never players.

- [ ] **Factory hop (rifle 65 %, pistol 55 %), at a target 30 m or more away.** Rifle BBs rise about a hand's width
  near 20 m and stay on target to about 39 m, past Depot's longest sightlines (about 34 m); they take about half a
  second to get there and slow visibly at the end. The pistol's drop from about 27 m.
- [ ] **Hop-up at 0 %.** BBs start dropping from about 14 m; far shots land low.
- [ ] **Hop-up at 90 to 100 %.** BBs climb about half a metre over your aim and float before they fall; the line
  under the dial says so.
- [ ] **Find a setting you like.** It is kept. Bots always use the factory setting.
- [ ] **Watch the dust in the air for a few seconds (Medium or up).** It drifts one way: that's the wind. It changes
  from match to match.
- [ ] **Fire a long burst across the wind at 30 m or more.** BBs curve gently downwind, more towards the end (up to
  about half a metre at 34 m in the strongest breeze); at 10 m you can't see it. Into the wind they arrive a touch
  later and drop a little sooner. Settings › Dev › BB paths shows the curve.
- [ ] **Practice range, every target to 60 m.** Each can be hit: from 40 m aim high (or turn the hop up) and a little
  upwind. On the factory hop a level shot at the 60 m plate lands short (about 53 m); about 3° high rings it.
- [ ] **Aim steeply up (about 60°) on the range and fire a magazine.** The BBs spread as wide sideways as up and down.

### Walls and ricochets

- [ ] **BBs stop on everything.** On Depot, shoot crates, container sides and ends, wall tops and corners, the dock
  and its steel ramps, a gabion, the toilets: every BB stops or bounces where it meets the surface, never inside or
  through it. Settings › Dev › BB paths makes it easy to see.
- [ ] **Shoot through a barricade port and a building window.** BBs go through the openings; the walls stop them.
- [ ] **Fire at concrete or a container at an angle.** BBs glance off and fly on, slower. Into a crate they stop.
- [ ] **Ricochets count Off (the default).** A bounced BB that hits you knocks and shows "Ricochet · doesn't count,
  play on". One of yours that reaches a bot shows a small grey puff and "Your BB ricocheted · doesn't count". Stand
  2 m from a container's side and fire one shot square at it: the same notice, and you play on.
- [ ] **Ricochets count On** (Play › Match). The same shot knocks you out: the hit feed says you called a hit off
  yourself, tagged RICOCHET (not FRIENDLY); the scoreboard counts you hit once and no hit for you.
- [ ] **Is the ricochet notice useful,** or does it come up too often in a 3v3?

## Players and replicas

- [ ] **Players.** Teammates and opponents are masked humans (a high-cut or bump helmet, a balaclava, a visor; never
  a bare face) in team camo with a plate carrier in the team colour, or robots in a light or dark shell by team. No
  two look the same. At 30 m, on Low too, can you tell the teams apart at a glance from the front, side and back?
  Try Settings › Accessibility › Team colours › High contrast too.
- [ ] **Team camo** (Medium and up). Trousers, shirt and sleeves wear clear dark and light blotches in the team's
  colour, a hand or two across, crisp up close and blending to the team colour far off without shimmering. Does the
  camo still let you pick Alpha blue from Beta orange at a glance? Low keeps plain clothes.
- [ ] **Settings › Looks › Robots.** Mixed (the default) puts humans and robots on both teams each match; Off makes
  everyone human.
- [ ] **Your hands.** Dark gloves, both sleeves printed in your team's camo (Hand detail High; plain on Low) and
  the team armband in view on the left forearm; robot arms when your player is a robot. The support hand holds the rifle's handguard, thumb up the near side, no finger through it; through a
  reload it takes the magazine and comes back.
- [ ] **Hit call.** Hit a bot: the HIT! sign, the hand up, the replica hanging; still readable at 20 to 30 m.
- [ ] **Replicas.** The held rifle and pistol look like toys: blocky, two-tone, with stippled grips; the red dot is a
  square hood and the silencer six-sided. Other players' replicas are in their team's colours.
- [ ] **Colour schemes.** Your rifle starts Cobalt and your pistol Ghost; Loadout › Customise › Colour picks one of
  eight two-tone schemes per replica.
- [ ] **Realistic colours** (on the Loadout's Colour tab from MR1; no longer in Settings). Every replica shows in one
  real colour instead (black, wolf grey, ranger green or tan, by its scheme); others' replicas turn plain.
- [ ] **Replica detail on High.** Fine speckle on the plastic, rounded lit edges, rail slots and sights. In Loadout
  try every optic, grip and magazine: nothing floats or clips the hands.
- [ ] **Gas puffs and impacts.** The pistol puffs a little gas at the muzzle and ejection port each shot; the rifle
  none. No flash, no casings. Impacts make pale dust on concrete, tan crumbs on wood, a grey puff on steel: soft puffs,
  never sparks. No BB has a glow round it (a glowing BB is lit itself); on High a wall hit throws a few chips back
  towards the shooter.
- [ ] **Name tags.** Walk up to a teammate (1 to 2 m): the tag sits just above the head; at 30 m and more it still
  sits above it. Try a field of view of 80.
- [ ] **Blender models** (the default since BD1). Bots are the
  Blender humans and robots holding the Blender replicas and parts. Bots holster for a calm sprint through their own
  half (watch your teammates at the round start): the arms pump, the rifle hangs across the back clear of a pack and
  the ground, and as they draw again it leaves the back partway through without a pop. A bot's BB leaves its own
  muzzle, with a silencer or long barrel too. Walk away from a bot past 12 m and 28 m: no flicker as its detail steps down. A red dot or scope folds
  the AEG's iron sights, in the menus too. (BP4)

## Loadout and Customise

Loadout (the title screen or the top bar). The slots are Primary, Secondary and Grenades (greyed: none yet); your
replicas are listed below, and one still to unlock is greyed with a lock and its level. Right-click an equipped
replica, or use Customise, to change its parts. To try every part below before you have levelled, turn on Settings ›
Dev › Disable levelling.

- [ ] **Swap slots.** Put the GBB Pistol in Primary: the AEG rifle moves to Secondary. Any replica goes in either slot.
- [ ] **Customise.** Colour first, then the optic, BB weight, hop-up, grip, laser, magazine, power source, barrel,
  muzzle and light, each offering the parts that fit. Skins say they come later. Esc goes back.
- [ ] **Locked parts.** At a low level each part's options list the ones still to unlock after the ones you have, greyed
  with a lock and "Level N" (the level that unlocks it), and they can't be picked. Under them: "Level up to unlock more:
  the Armory shows what each level gives." With everything in a row unlocked, the line goes.
- [ ] **BB weight.** 0.25 g on the rifle and 0.20 g on the pistol as they come. 0.28 g on the rifle leaves slower
  (about 84 m/s) and needs more hop: at about 75 % it stays on target to about 41 m. 0.20 g with the dial at 65 % is
  too much hop (far shots fly high and float); about 50 % flies flat.
- [ ] **Is the BB weight worth choosing?** The differences are small on purpose, as at a real site: 0.28 g carries a
  couple of metres further past Depot's longest lines, 0.20 g reaches 10 to 20 m a hundredth of a second sooner. On
  the pistol the gap is bigger (best reach about 31 against 35 m). If you can't feel it on Depot, say so.
- [ ] **Grips.** Vertical: after a sprint the crosshair closes sooner; switching to the rifle is a touch slower.
  Angled: switching and raising the sight are a little quicker; after a sprint the crosshair stays wide a moment
  longer.
- [ ] **Magazines.** Hi-cap: 120 BBs and one spare; a bot facing away hears its rattle and turns within about 7 m
  (you hear it too, quieter: tolerable over a long walk?). Low-cap: 30 BBs, five spares, a change 25 % quicker and a
  draw 10 % quicker. Is it worth picking now? The pistol's extended magazine: 27 BBs, slower to draw. Each part shows on
  the replica.
- [ ] **Barrels and the silencer.** The Tight-Bore Barrel: spread −15 %, energy +3 %. The Long Barrel: energy +10 %,
  spread −10 %, Draw and Aim raise +15 %, visibly longer: the reach pick, unlocked late. The Silencer (both
  replicas): energy −5 %, a slower draw, "Shots heard from" 22 m becomes 11 m; shots sound duller and quieter.
- [ ] **Bots hear a silencer less.** On Normal, fire the silenced rifle from about 15 m behind a bot that can't see
  you: it doesn't turn (unsilenced it does). On the minimap, with sound cues on, a silenced bot shows only within half
  the usual range.
- [ ] **Performance panel.** Beside the parts: energy, muzzle speed, BB weight, rate of fire, on-target range, time
  to 20 m, spread, recoil, magazines, reload, draw, aim raise and shots heard from. Change a part or drag the BB
  weight: each changed stat is marked better or worse with a percentage; a trade-off (the hi-cap's "120 × 2") isn't
  coloured. As it comes the AEG reads about 0.97 J, 13 BBs/s, 60 BBs; the pistol 0.52 J, 7 BBs/s, 18 BBs.
- [ ] **The 11.1 V LiPo battery** on the rifle: rate of fire +15 %, energy unchanged; it sounds and empties faster.
- [ ] **Glowing BBs** (per replica): At Night (the default) glows only on night fields, Always or Off. A glowing BB is
  green, a little larger at range, with a longer streak.
- [ ] **Light** (dev content, night fields). Every replica has the Weapon Torch from level 0, switched with **T**. "No
  light" takes the torch off. Known bug: on the AEG rifle the Light row won't take "No light" (bug pass BP2 fixes it).
- [ ] **Your setup is kept.** Reload the page: every pick is still there. Your teammates carry their replicas as they
  come; opponents carry kits of their own (see [Bots](#bots)).
- [ ] **Edit `stats.md`.** Set the AEG's `Fire rate (BBs/s)` to 20 and run `npm run dev` again: the panel says
  20 BBs/s and every rifle fires faster. A typo (`2O`) shows in the browser console and `npm run test` names its
  line. Put it back.

## Cyber Pistol

The level 10 reward, the last thing the levels unlock. To try it now, turn on Settings › Dev › Disable levelling, or
press Settings › Dev › Level up until you reach 10.

- [ ] **Equip it.** Below level 10 the Loadout shows it greyed with a lock and "Level 10". Once unlocked it goes in
  either slot.
- [ ] **Its look.** A white slab with glowing cyan lines and a magenta core, the same on either team. With Realistic
  colours it is plain grey and unlit. Does it read as rare and special?
- [ ] **Customise.** Power source reads Built-in battery and the magazine "Its own, 50 BBs"; the optic, grip, laser,
  barrel and muzzle rows are greyed. BB weight and hop-up still turn. The panel shows 1.00 J, 14 BBs/s, a 1.1 s reload.
- [ ] **On the range.** It starts on Semi and the selector steps Burst and Auto. Even on Auto the sight barely climbs.
  Out of the box it stays on target to about 33 m.
- [ ] **Its sound.** A quiet electronic chirp and a soft pop with no motor whine; an empty trigger blips; a reload
  ends in a two-note chime. Futuristic but still a toy?
- [ ] **Leave the AEG at home.** Carry the Cyber Pistol and the GBB Pistol on Normal: the bots' AEG shots still sound.
- [ ] **The Armory.** Level 10's row holds the Cyber Pistol. Reaching it, the summary says "Level 10!" and
  "Unlocked: Cyber Pistol".
- [ ] **Bots with it.** With it unlocked (or Disable levelling on), about 1 Hard match in 20 has an opponent with it on
  Auto. Never on Easy or Normal, never a teammate. The same goes for any replica a level above 0 unlocks.

## Levels and the Armory

Completely free: finished matches give XP, each level up to 10 unlocks parts for good, and nothing is ever sold. What
each level unlocks is in `levels.md` at the repository root; the Armory shows it in the game.

- [ ] **Level 0 to start.** On a fresh save (a private window, or Settings › Save › Delete): the top bar reads "Lv 0"
  with an empty bar. The Loadout offers the AEG Rifle and the GBB Pistol; Customise offers the Standard Battery, Green
  Gas and the Weapon Torch, and every other part greyed with its level.
- [ ] **The level badge.** On every screen after the title, "Lv N" with a thin XP bar at the far right of the top bar.
  Point at it: "Level N, X XP to level N+1. Open the Armory". Click it: the Armory opens. From the pause menu it shows
  but does nothing.
- [ ] **The Armory.** Top bar › Armory. On the left your level "of 10", the XP bar ("120 / 300 XP"), how much to the
  next level, the XP earned in all, and how XP is earned (every match 100, a win 100 more, each round won 20, each hit
  10, then times the difficulty; the practice range and the tutorial give none). In the middle what the next level
  unlocks. On the right every level from the starting kit to 10, each with its XP and its items' pictures, the reached
  ones lit and marked Unlocked, the next marked Next. Easy to read at a glance?
- [ ] **XP on the summary.** Win a standard first-to-5 match on Normal: "XP earned +N XP", then what gave it ("Match
  played 100 · Match won 100 · 5 rounds won 100 · 3 hits on an opponent 30"), then "Level N: X / Y XP" over a bar. A
  loss gives less; a round your team won while you were out without a hit gives nothing. Hard opponents with Easy
  teammates add "difficulty ×0.5". The badge shows the new level.
- [ ] **A level up.** Your first finished standard match takes you to level 1: the summary says "Level 1!" and
  "Unlocked: Red Dot", and the Red Dot is in Customise's optics with no lock. Several levels at once list everything
  they unlocked.
- [ ] **No XP.** The practice range and the tutorial give none. A match with Dev content on and a dev map or mode:
  "No XP: this match used content still being built." A match with a Dev aid (Bottomless magazines, to the end): "No
  XP: Dev settings changed how this match played."
- [ ] **Settings › Dev › Disable levelling.** The badge goes; the Armory says levelling is off and every level reads
  Unlocked; the Loadout and Customise offer every replica and part with no locks. A match gives no XP and stays out of
  your records. Turn it off: your own level, unlocks and picks are back.
- [ ] **Dev XP buttons.** Settings › Dev: **+500 XP** adds 500 XP (the badge moves, and a level it reaches unlocks
  its items); **Level up** adds exactly what the next level takes; at 10 it says "At the top level". **Reset level**
  asks first, then puts you back at level 0 with the starting kit. Each survives a reload.
- [ ] **At the cap.** At level 10 the Armory and the summary say "Top level reached. XP counts again when the level
  cap goes up." and the bar is full.
- [ ] **An old save.** Load a save downloaded before the levels came in (it had Field Credits and the Armory's items):
  it loads at level 0 with the starting kit, your settings and records kept.
- [ ] **Edit `levels.md`.** Swap the Red Dot (level 1) and the Silencer (level 4) and run `npm run dev` again: at
  level 1 the Armory lists the Silencer and Customise offers it. A typo (`Silencr`) shows in the browser console and
  `npm run test` names its line. Put it back.

## Bots

You're on Alpha (blue) with two bot teammates against three Beta (orange) bots by default; the Match screen's Your
team puts you on Beta instead.

- [ ] **Hit a Beta bot.** It raises its hand, walks off to the dead zone, and you get a clear sign of the hit.
- [ ] **Watch the bots for a few rounds** (spectate once you're out to see what they do unseen). They patrol, take
  cover, crouch behind crates and lean round corners. Note any bot stuck or walking into a wall.
- [ ] **Two bots on one lane** hold side by side about a metre apart, never inside each other; bots passing bend
  round each other. Turning a corner, they don't brush the wall or door frame.
- [ ] **A bot holding a lane point** crouches after a moment where it can still see ahead and sweeps its view slowly;
  some (more on Hard, fewer on Easy) step into crouch cover first. It doesn't bob down before running for cover.
- [ ] **Run near a bot, then walk past one with Shift.** Running gets you heard; walking lets you sneak closer.
- [ ] **Sneak up behind a wall, running.** They notice you later than in the open. Do they still hear through walls
  like a wallhack, or too little?
- [ ] **Shoot near a bot from past 22 m, unseen.** It ducks and comes looking or takes cover. A search that finds
  nobody ends with a crouched look round.
- [ ] **Noisy props (NP1).** Run (not walk) straight into a skip, container, crate stack, rack or the like: a boom,
  rattle or knock from where you hit it and a puff of dust, and a Beta bot 15 m off, facing away, turns and comes
  looking. Walk or crouch into the same prop, slide along its side, or keep pushing against it: silent. Does a knock
  feel fair, or does it catch you out where you didn't expect a prop to be noisy?
- [ ] **A BB off steel (NP1).** From cover, shoot the side of a skip or container near an idle bot that hasn't seen
  you: it turns to look at the skip, not at you. Shoot one near a bot that's fighting: it ignores it.
- [ ] **Noisy ground (NP1).** Sprint across Woodland's creek gravel or up a steel ramp (Depot's docks, Neon Heights'
  stairs): your steps are louder, and bots hear you a little further off than on grass or concrete. Walking there
  stays silent.
- [ ] **Fight a bot beside a wall or container.** It sidesteps away from the wall and keeps you in sight; on the
  dock's edge it never steps off.
- [ ] **Hit a bot's teammate from 30 m or more.** The others turn towards roughly the right side, not straight at you.
  Once your fight is over, a bot heads for where your teammate was heard.
- [ ] **Bots fighting by door frames** don't fire into the frame beside them or dive for cover from their own BB.
- [ ] **Every level hunts.** Once their lane is swept, bots of every level hunt the map's middle; a round shouldn't
  drag to the clock with nobody left to find.
- [ ] **No trips into empty corners (M87).** Spectate a hunting bot: it shouldn't walk into a corner or pocket it (or
  a teammate) can already see is empty; it turns off for the next spot as soon as it sees one. A spot it hasn't seen
  into (behind a crate, round a wall) is still worth the walk. It looks again after a while: about 20 s on Easy, 40 s on
  Normal, 50 s on Hard, 60 s on Pro. Easy should still feel the sloppiest.
- [ ] **Up close, a fair moment.** Walk into a Normal bot at 5 to 10 m: its first BBs go wide to one side and walk
  in, so you have a moment to see them coming and answer (its first hit takes about 1.5 s, rarely under 0.75 s). Do
  Hard and Pro still punish a slow answer? Do Normal bots still feel a threat?
- [ ] **Difficulty.** Easy should feel clearly weaker than Hard. Hard bots sometimes come at a spot from the side;
  Easy never. A change mid-match applies from the next round, and the screen says so.
- [ ] **The bots' kits (BG1).** Opponents on every level carry kits from `bot-kits.md`: on Easy mostly as they come,
  each level up more of them scoped, silenced or with a red dot, Pro never plain; now and then a Cyber Pistol from Hard
  up. Spectate a few: a scope or red dot shows on their rifle, and a silenced bot is heard nearer. Your teammates carry
  replicas as they come. Rushers and flankers lean to Pointman, Support and Stealth kits, anchors and careful bots to
  scopes (the scoreboard shows each bot's personality). Does gear make Normal feel unfair, or Hard too easy? Change a
  weight in `bot-kits.md` and say which.
- [ ] **A scoped bot (BG1).** At 25 m and more it holds its aim on you closer than an iron-sight bot once it has
  settled, but takes a little longer to settle; up close, or when you cross its view, it is slower to find you. Does a
  scoped bot read differently from a plain one?
- [ ] **Bot names and personalities (BN1).** Every bot has a name (Dash, Rook, Fox, Owl…) on the scoreboard, in the
  hit feed, over your teammates' heads and on the "What got you" card, and the same name plays the same way every
  match. Over a few rounds can you tell them apart? A **Rusher** is first through the gap and runs at where you were;
  an **Anchor** holds one spot short of the middle, aiming over cover, until about a minute is left; a **Flanker**
  takes a lane of its own and comes round the side; a **Careful** bot walks, clears each corner and watches where you
  ducked. The scoreboard tags each bot's personality. Does any feel unfair, or too samey? (Edit `bots.md` to rename
  them or retune a personality.)
- [ ] **At night** (Woodland, Neon Heights by Night): Normal, Hard and Pro bots hold their posts out of lantern light
  when a dark spot is near. A bot switches its torch on for a fight within about 20 m and for the last stretch of a
  search (12 m from the spot on Normal, 20 m on Hard, 30 m on Pro): a beam far off across the field is rare. Easy
  bots keep theirs on as they move.
- [ ] **Anchors (BP5).** In Elimination, with more than a minute left, give an anchor teammate Follow me (F), then end
  it with F again: it goes hunting instead of standing where the order ended. In a fight in the open an anchor aims
  down its sights only while standing still behind cover, never while it sidesteps.

## Rounds and matches

One BB hit puts anyone out. A round lasts up to 2:30 and the first team to 5 round wins takes the match.

- [ ] **Get hit.** A sharp tick, a sign of where it came from, and your view walks off. Then you watch a teammate;
  left click (or your fire key) moves to the next one.
- [ ] **Skip to next round** (M83). Out and spectating, the line under the view ends "Esc to skip the round"; Esc
  skips at once with no pause menu (Dev 5 playtest, note 10): "Skipping the round…" shows for a second or few (the
  page keeps drawing), then "Click to play · Esc for the menu" holds the next round until you click (Esc again opens
  the pause menu, whose **Skip to next round** button still works). The next round starts with the score as it
  played out. On match point (either team one win away) the line and the button read **Skip to the result** and may
  end on the summary; the result counts in Stats and gives XP as a watched one. Not offered while you are in play or
  calling your hit, between rounds, in Extraction or on the practice range. Same seed: skipping and watching a round
  give the same score (check with `?seed=`).
- [ ] **Shoot a teammate (carefully).** Friendly fire counts, so they go out too. On purpose.
- [ ] **Walk-offs.** Hit players walk all the way to their dead zone by a sensible route, promptly, on every map,
  even from the far end. Teammates in the dead zone stand on separate spots.
- [ ] **End a round.** A banner says who won, the score updates and the next round starts by itself. The first round
  of a fresh page load starts with the referee's two short whistle blasts.
- [ ] **A drawn round** (both last players out together) replays the same round number; the summary counts it.
- [ ] **Overtime flag (OT1).** In Elimination, hide until the clock runs out with both teams still in (Round
  time 1:30 is quickest). Three quick whistle blasts, "Overtime · touch the flag" across the middle, and a chequered
  flag pops up near the middle: in front of Depot's Main Gate, in Woodland's east meadow, on Neon Heights' Neon Avenue.
  The clock counts 0:30 down in red with "Overtime" under it, the strip says "first hand on the flag wins", the
  marker shows the flag's distance and the minimap marks it. Run and touch it (stand within about a metre): your team
  wins the round, the flag and its ring turn your colour, and the banner says "Flag touched". Try once more letting a
  bot get there first, once with both teams at it (the ring turns yellow, "Both teams at the flag", nobody wins), and
  once leaving it alone: after 30 s, "Nobody touched the flag · draw" and the round is played again. Bots should head
  for it within a second or two on Normal, slower on Easy; anchors and careful bots first watch it from cover nearby,
  flankers may come round the side, and a teammate calls "Flag's up". Does 30 s feel right on each map? Custom ›
  Time-out › More players left: a time-out with your team ahead wins at once, no flag. Attack / Defend has no overtime
  flag.
- [ ] **Overtime banner (BP5).** The OVERTIME · TOUCH THE FLAG banner fits on one line at 1280 px wide. The bottom-left
  callout feed hides while the scoreboard (Tab) is up.
- [ ] **Half-time.** The teams swap ends after round 4; the banner says so.
- [ ] **Finish a match.** The Match summary comes first (see [HUD and match info](#hud-and-match-info)), then the
  result screen. Finish, then go straight to Stats without pausing: the match is counted and its XP given at once.
- [ ] **Play again** shows a new seed in the F3 box; that seed in a new page replays the match's start.
- [ ] **Quit, then Play again on the same map, a few times.** It starts almost at once each time and looks exactly
  like the first Play; after changing Map detail, the map shows the new detail.

## Maps

### Depot

An asymmetric warehouse yard. Attackers start in the west yard, defenders in the north-east corner, and the one
flagpole stands in the walled loading bay (the Bay). Three lanes lead there: **Dock Road** (north, along a raised
loading dock), **Container Alley** (the middle, through the Main Gate) and the **Office** (south, close quarters,
with a back door near the pole).

- [ ] **Walk all three lanes from the west yard to the pole.** Each gets there with no dead end, and you can tell
  which lane you're in.
- [ ] **The dock.** Its ramps have no bumps; you can step off its open edge on purpose (a 1.2 m drop) but walking up
  to it doesn't push you off. Halfway down a ramp, turn and run back: the crosshair doesn't jump wide. From the dock
  you watch Dock Road and the Bay, but mostly can't see into Container Alley.
- [ ] **Jump against crates, the ramp kerbs and the dock edge.** You never land on top or hang on an edge.
- [ ] **Look for the other team's spawn from yours,** standing and crouched: you can't see it.
- [ ] **Cover.** A pallet rack, a gabion barrier and a portable toilet are full cover. Crouched behind an IBC tank, a
  generator or the sandbags you're hidden; standing you can shoot over. BBs bounce off steel (the skip, racks, IBC
  cages, generators) and sink into sandbags and gabions.
- [ ] **The east end** (Alpha's start in Elimination) has no way out to the north road: the team leaves past the
  wall's south end, so the dock and the Main Gate are about as far from both ends. Nobody gets stuck in the yard's
  north corner.
- [ ] **Balance.** In Attack / Defend, does attacking or defending feel easier, and which lane do the bots pick? In
  Elimination, does either end feel stronger over a half?
- [ ] **The look by day.** A low, warm sun with longer shadows and a blue sky; light bounces off walls and containers
  into the shade, so shaded sides stay readable. Grey precast concrete walls, rubble gabions in wire, rust and rain
  streaks, stains on the ground (Medium and up).
- [ ] **Set dressing (Medium and up).** Dirt at the foot of walls, junk and litter against them, glossy puddles, a
  few logos, sprays, warning signs and glow strips. Nothing to hide behind that wasn't cover before, and no new long
  sightline.
- [ ] **Beyond the walls (Trees › Detailed).** Sheds, a water tower, a crane, stacked containers, a power line and two
  smoking chimneys; from the dock nothing floats or pops.
- [ ] **Dust.** Sprinting and landing kick up a little dust; the dust in the air is grey and hangs low. On Low it all
  looks as before.
- [ ] **Signs.** Bay numbers on the containers, hazard chevrons, a site roundel and SAFE ZONE by each dead zone:
  readable, never mirrored, never half inside a prop.

### Woodland (dev content)

A wide wood at night: 120 × 80 m on a gentle slope up to the Knoll and its log fort, with three lanes (Pine Belt,
Meadow, and Creek with the cabin). 5v5 by default, or 6v6; nothing smaller. Turn on Settings › Dev › Dev content,
then pick it on the Play screen.

- [ ] **Hidden starts (M88).** From either camp, and for the first few steps out of it, you can't see the other team:
  the west camp sits behind the West Rise (a low ridge across the meadow), the east camp behind the Knoll. Play both
  halves: the east end is only a little higher now. Picking Woodland sets 5v5; the Team size row offers only 5v5 and
  6v6. Check 6v6 on Low still feels smooth.

- [ ] **The night.** A dark sky under a low moon over the Knoll; camp fires flicker with embers, lanterns glow and
  light the ground; on Medium and up the nearest ones light players too (Settings › Graphics › Night lights).
- [ ] **Readable on Medium with your torch off.** The tracks, the creek and the cabin's boards stay readable.
- [ ] **Bushes** hide you from bots when you're deep in or behind one, and you walk through them. The minimap draws
  them.
- [ ] **Bushes stop BBs (FO1).** Shoot into the middle of a bush: the BB never comes out the far side, you hear a soft
  leafy rustle and a few green leaves pop out and drift down. Shoot through just the edge: the BB comes out the other
  side, a little off its line and slower, with a quieter rustle. Stand deep inside a bush and fire out: "Leaves in the
  way · step clear to shoot" under the crosshair. Stand just inside a bush's edge where a Normal bot can still see you:
  it holds fire until it has a clearer line; an Easy bot fires into the leaves anyway. On Neon Heights, a BB that lands in a planter's shrubs
  rustles too. On Low and Ultra alike nothing stutters.
- [ ] **Night sight.** Bots see about 40 m into a light pool, 25 m in the open and 10 m under the trees; the fires and
  lanterns give you away.
- [ ] **The look.** Bark trunks and log walls, faceted boulders, plank fences, pine and broadleaf crowns against the
  sky, a gravel creek, earth tracks and leaf litter, a moon and stars on every preset.
- [ ] **The sound.** Wind in the pines, insects and a distant owl, a crackle at each camp fire, and footsteps that
  sound like the ground (grass, leaf litter, earth, the creek's gravel, the cabin's boards), as loud as on concrete.
- [ ] **Frame rate on Medium.** Smooth in a full match, also in Extraction.

### Neon Heights (dev content)

A small three-floor market city with stairs, a Sky Bridge and a balcony, 4v4 to 5v5, Day or Night (Night by
default). Turn on Dev content, then pick it with its Day | Night switch on the Play screen.

- [ ] **The look.** Playful pastel buildings (mint, pink, cyan, amber), a paved street with a dark road, zebra
  crossings, neon strips on the Arcade, Tower and Sky Bridge. Arcade cabinets, vending machines, market stalls,
  planters, phone booths and a delivery van read as what they are. Nothing is in team blue or orange.
- [ ] **By Night.** The avenue, the atrium round the flag and the shopfronts sit in lamp light; stairwells and Level 1
  rooms are dark. Neon signs glow; windows high on the perimeter walls are lit or dark; no sign flickers against its
  wall or covers a door. The sky is a soft purple with stars.
- [ ] **By Day.** No lamps or glows: the signs are painted boards and the windows dark glass. Ceilings look plaster
  white (a little olive by Night is known).
- [ ] **Night sight.** In a dark room a bot spots you only close up (about 15 m), in lamp light from far off. Fair next
  to the moonlit street (25 m)?
- [ ] **Ceilings with few lights.** Settings › Graphics › Custom › Night lights Off, then Nearest 4: ceilings stay
  readable. On Medium or High a lamp's light can show on the floor above its room (known): distracting?
- [ ] **The sound.** By Day a low traffic hum, a drone passing now and then, a shop door's chime; by Night quieter
  traffic, the neon's hum and faint sizzle, arcade bleeps; no birds. Listen to the sizzle for a while: you shouldn't
  hear a click every 3 s. If you hear a pulse that often, it is the flicker's swell, not a click; say so.
- [ ] **Balance.** Play Elimination by Day and by Night: are the two ends even? The middle lane's holds should keep
  either end from running away with it.
- [ ] **The Plaza stair (BP5).** Walk up the outdoor stair from the plaza to the landing without jumping: you reach
  the landing without stopping. Sprint down it: no drop.

## Modes

### Attack / Defend

- [ ] **Raise the flag.** Stand in the painted ring at the pole for 5 seconds. The strip under the score shows how
  far up it is and a marker shows the pole. Sides swap after round 4. Esc mid-round: the pole marker doesn't show
  through the pause screen.
- [ ] **Attacking with bots.** One bot works the rope; the others hold cover a few metres out. With you at the rope,
  no bot crowds in.
- [ ] **The flag (Medium and up).** A ball on top, a rope to a cleat and a painted flag that ripples less near the pole.

### Custom matches and rules

Play › Match. The Rules row comes first: Skirmish (the standard match), Tournament and Pro CQB (dev content), or
Custom, which opens every row.

- [ ] **The rows.** Rounds to win (3, 5, 7, 10), Round time (1:30 to 5:00), Team size (1v1 to 3v3; 4v4 and 5v5 on
  Neon Heights, 5v5 and 6v6 only on Woodland, with Dev content), Opponents, Teammates, Friendly fire and Ricochets count; Custom adds Win by two, Time-out,
  Minimap, Fire modes, Magazines and Kit. Each change shows in Your match at once and is kept after a reload.
- [ ] **A 1v1 and a 2v2.** No teammate (or one) against one bot (or two); the scoreboard and the pips match. Do rounds
  feel too long or too quick at that size?
- [ ] **First to 3.** The pause menu says "first to 3", ends swap after round 2, the match ends at 3. A 1:30 round
  time starts the clock at 1:30.
- [ ] **Opponents Easy, Teammates Hard.** Your teammates should win their fights clearly more often. The rules text
  says this match won't go into your records, and the summary marks no cell. With no Teammates level picked,
  Opponents Easy shows Teammates Normal, and that default pair counts.
- [ ] **Friendly fire off.** A BB at a teammate passes by; your bot teammates stop holding fire when you're in line.
- [ ] **Tournament** (dev content): first to 7, win by two, 2:00 rounds, a time-out goes to the team with more
  players left, the minimap shows teammates only. **Pro CQB** adds semi only and real-cap magazines.
- [ ] **Custom gives XP at most ×1.5** and never counts for records.

### Practice range

The Match screen's Practice card (the last mode), then Start practice.

- [ ] **The range.** You're alone behind a painted line facing three lanes: white steel plates on the left, standing
  plywood figures in the middle, crouched ones on the right, 10 m to 60 m marked on boards and the floor. No whistle,
  clock or score. The plates hang from chains and show BB scuffs; a shelf of BB bottles stands by the line.
- [ ] **Shoot each kind.** A plate rings (still heard at 60 m) and swings back; a figure falls and stands up after a
  second and a half. The readout says "Last BB: 31 m · hit Steel 30 m", or "· miss" with where it landed.
- [ ] **Lob one over the backstop:** the readout says it flew out. Shoot a plate's post: it reads as a miss.
- [ ] **Reload.** The spare gauges never run down.
- [ ] **Esc › Loadout.** Change the BB weight or hop-up, go back and Resume: you're where you stood with the new setup
  at once, looking the same. Quit and start a match: it plays as before.
- [ ] **Walk downrange.** Nothing stops you; BBs fired from there still hit the targets.
- [ ] **Dev help isn't a best (BP5).** Press Esc and switch Timed challenge on, then set Settings › Dev › Game speed or
  Bottomless magazines before you shoot the START plate. When the time is up the result says "not kept (Dev settings)"
  and your best doesn't change. With the Dev aid off, a run can set a best again.

### Tutorial

- [ ] **The title screen** offers Tutorial under START on a clean save, until you've finished it once or started a
  first match (also after a reload).
- [ ] **Play it through.** The coach says "Tutorial · 1 of 15 · Look around" and moves on as you do each thing: look
  around, walk to the line, ring a plate, knock down a figure at 50 m or more (the coach shows where your last BB
  landed), reload, the fire selector, aim (or, with iron sights, a pointer to the optics), crouch, shooting out of a
  sprint, vault, switch replica and hit something, then four cards to read: one hit, the scoreboard, the order wheel,
  winning a match. Each finished step ticks green. Did any step feel stuck or unclear?
- [ ] **Short and quick (TT1).** Every card is a sentence or two. The four read cards show a thin bar filling as they
  read and move on by themselves within 5 to 8 seconds. Is there time to read each, without waiting around?
- [ ] **It shows what it teaches (M80).** The scoreboard card opens the scoreboard (a sample match) under it, and the
  order wheel card opens the wheel with its pointer moving from order to order; each closes as the next card comes up,
  and both hide on the pause menu.
- [ ] **Your keys.** Rebind reload, start the tutorial again: the coach names your key.
- [ ] **Esc mid-tutorial.** The pause menu names your step and offers Skip step and Skip tutorial. Change the
  loadout and come back: same step. Quit at step 5 and start again: it picks up at step 5. Skip tutorial: free
  practice, and the title stops tagging it.
- [ ] **After the last step (M80)** a "Tutorial complete" pop-up offers Practice range (Enter: back on the range, the
  readout in the coach's place) or Menu (the Match screen, to start a match). Esc closes it to the pause menu.
- [ ] **Fitting an optic (BP5).** The "Aim down the sight" card also says you can fit a red dot or scope on the
  Loadout (Esc, then Loadout).

### Extraction (dev content)

Your squad against a home team on a timed run. Turn on Dev content, then Play › Mode › Extraction (Depot, Woodland or
Neon Heights). While it is dev content a run gives no XP; the summary says "this run gives no XP".

- [ ] **Play screen.** The Match line reads like "Squad of 3 · 5 in the home team" and "One 8:00 run"; the rules text
  explains the run. With Dev content off, Extraction isn't offered and a saved pick plays as Elimination.
- [ ] **Exits.** The strip under the clock names the open exits and when the late one opens; green EXIT rings with
  cones and a sign, a marker with the distance and a square on the minimap. No exit stands next to your insertion.
  On slopes each ring, cone and sign stands on the ground.
- [ ] **Counted out.** Stand in an open exit: a beep a second, "Counting you out · 9 … 1", then "Counted out · you made
  it!". Step out at 5 and it starts again; a Beta bot in the ring pauses it.
- [ ] **Respawn.** Hit once: back at the insertion, "Back in at the insertion · no respawn left". Hit again: "Out of
  the run".
- [ ] **Coming in.** For 3 seconds after you come in, and after a respawn, BBs neither hit you nor leave your replica.
  Does the first fight now start after you've had a look round?
- [ ] **The clock.** A whistle at 1:00 left; the late exit opens at 3:00 (its sign turns green); at 0:00 "Caught out".
- [ ] **Cases.** An olive ammo can, a black field case with an orange band and a grey locker with a yellow band stand
  by cover, elsewhere each run. Walk up: "Hold G to open the field case". Holding G fills a bar (about 2 s for a can,
  4 for a field case, 7 for the locker) with a rummaging sound; let go and it starts again. The lid swings up and the
  line says what it held ("+35 XP" or "BB resupply · magazines topped up"; never a part: levels unlock those).
- [ ] **Carrying.** The strip reads "Respawn ready · Carrying 155 XP". Hit while carrying: "You dropped
  what you carried where you were hit · go back for it", and a small bag lies where you fell; hold G on it to pick it
  all up. A resupply fills your spares.
- [ ] **The haul.** Get out carrying finds: the summary's haul line says what you got out with ("You got out with
  145 XP"). Any other end: "Lost: 145 XP. Only what you get out with counts."
- [ ] **Noise.** Open the locker with a bot near: it comes to look.
- [ ] **Guards.** Two guards by the locker in cover, watching the way in (one on Easy); sometimes one at a far field
  case. A guard you shoot at or pass close by chases you but never strays more than about 8 m from its case. At the
  start no field-case guard or patrol is within about 15 m of where you come in (the locker's guards can be: fair?).
- [ ] **Patrols and hunters.** The rest of the home team walks between the shut cases in pairs. From halfway through
  the run (a third of the way on Hard and Pro, never on Easy) they hunt you, pushing in close. Tense late without
  feeling unfair?
- [ ] **Waves.** A bot you hit comes back about 75 s later on Normal (100 s Easy, 60 s Hard and Pro), out of your
  sight and never within about 15 m of you; clear the field and the wave comes back at once. With 2:40 left one more
  joins.
- [ ] **Your teammates** follow you from the start and after a respawn, and cover you at a case, each facing outwards.
- [ ] **The home team by level.** It is the map's base plus your squad, one more on Pro: with a squad of three on
  Depot, 5 on Easy, Normal and Hard, 6 on Pro. Easy should let you out with three cases most runs, Normal about a
  third, Hard rarely, Pro hardly ever.
- [ ] **Woodland.** A 15-minute run against four to seven; you start at the west camp or in the south-east woods, never
  beside the fort or cabin, and nobody of the home team stands within about 30 m of you at the start. The locker is in
  the cabin's west room or the fort's north-east corner. The gates on the logging track (north) and the cabin road
  (south) are open from the start; a late exit opens in the north-west or north-east woods. Does Hard feel harder than
  Normal? (The bot runs say not much.)
- [ ] **Neon Heights.** A 10-minute run against three to six; the locker is on Level 2, field cases upstairs, ammo cans
  on the street, every exit on the street at a corner of the site; waves come back on every floor.
- [ ] **Supply events.** From Friday to Sunday the Mode card says "Supply weekend, until Sunday: cases hold +25 %
  XP", and cases hold more. Set the computer's date to 30 October to 1 November 2026: it names the Halloween night run
  (+50 % XP). Change a row in `pool.md`'s Supply events table: the line follows.
- [ ] **XP and records** (only once the mode is public): the XP you get out with plus your hits, times the
  difficulty, with no match or round lines; an Extraction column in your records and its own bests.
- [ ] **The Use key.** Settings › Controls › Keys has "Use: open a case (hold)"; rebind it and the prompt follows.

## Pro difficulty (dev content)

Turn on Dev content, then Play › Match › Opponents › Pro. Play each map once in Elimination and once in Attack /
Defend: Depot, Woodland and Neon Heights (Day, then Night). Pro gives XP ×2 but counts for nothing while it is dev
content.

- [ ] **Slow down.** Pro bots hold still aiming at corners and doorways and walk quietly towards where they heard you.
  Run past a corner and you lose; slice it a step at a time or peek short and step back, and you win.
- [ ] **What got you.** After you're hit a card shows, for example, "Beta 2 · from your left · 14 m", whether that
  bot held the angle, how long you were in view and whether you moved. It makes sense every time, including a shot
  from behind and a ricochet.
- [ ] **Tips.** Between rounds (and holding Tab) a Tip line sits under the board against Pro, a different one each
  round; none against Hard.
- [ ] **Teammates on Pro** hold angles, trade your hits and win their duels.
- [ ] **Per map.** Is any approach unfair to attackers or defenders? Does one end win far more?

**What to turn** when a map plays wrong (all in `src/config/bots.ts`, "Pro tuning", plus `BOT_SKILL.pro`; the comment
there maps each symptom to its numbers):

| Symptom | Numbers |
|---|---|
| Too easy or too hard to out-aim | `BOT_SKILL.pro`: `reactionTime`, `preAimReactionTime`, `aimErrorSettledDeg`, `aimSettleTime`, `aimErrorMovingDeg` |
| Misses the corner you hide at, or holds odd gaps (bushes, trunks, stairs) | `angle*`, then `preAimConeDeg` |
| Too slow or too bold near the enemy | `sliceLeanDistance`, `BOT_SKILL.pro.peekWatchTime`, `holdTime` |
| Bunches up or trades badly | `tradeTime`, `tradeCoverRadius`, `boundDistance`, `crossfireTurnDeg` |
| One end wins, or rounds run to the clock | `huntMiddleBias`, `latePushTime` |
| Stands in the light at night | `darkSpotRadius`, `darkSpotStep` |
| Torch on too early, or fights in the dark too long | `BOT_TORCH.fightReach`, then `searchWalkDistance` per level |
| The card's "moving" | `WHAT_GOT_YOU.movingSpeed` in `src/config/matchInfo.ts`; the tips are `PRO_TIPS` in `src/config/tutorial.ts` |

## Menus

- [ ] **The title screen.** Only "AIRSOFT", the tagline "Call your hit. Go again." and a **START** button; on a clean
  save (tutorial never finished, no match started) a **Tutorial** button under START, gone for good after the tutorial
  or your first match. The build ("0.1 Dev 6+N · …" on `main`, just the release name on a release download; hover it
  for how many commits after the release it is) sits small at the bottom left. Nothing else: no tip, no next match, no
  level badge. No map is loaded behind the menus.
- [ ] **Keys.** On the title, Enter presses START, T starts the tutorial (while it is offered) and Esc opens
  Settings. No key prompts are drawn along the bottom of any screen; every screen works with the mouse alone (the
  Airsoft wordmark on the top bar goes back to the title) and the keys still work (Esc is Back, C customises, / searches
  Settings).
- [ ] **The top bar** on every screen after the title: MATCH, LOADOUT, ARMORY, SETTINGS from the left, your level
  ("Lv 3" and its XP bar) on the far right, no version; the current place is marked. Opened from the pause menu, only
  the current place shows and the wordmark reads Back.
- [ ] **The Match screen** (START). 01 Map as picture cards (a Day | Night switch on maps that have both, kept per
  map), 02 Mode as cards with **Practice last**, 03 Match rules. On the right, Your match: the map, Mode, Rules, Teams,
  your Loadout with Change, and **Start match**. Picking Practice hides the map and the rules, and the button reads
  **Start practice** (the range). Start loads the field with a short pause at most.
- [ ] **Your team** (M98). In 03 Match, a Your team row: Alpha and Beta, each with its colour dot (light blue and dark
  orange under Settings › Accessibility › High contrast), Alpha until you pick. Your match's Teams line starts with
  your team ("Beta · Normal bots") and the rules text says "(Beta) against Alpha", Beta defends first and starts
  Elimination at the west end. Leave the game and come back: still Beta. Pick Extraction: the row goes (the squad is
  always Alpha).
- [ ] **A match on Beta** (each mode, each map). You start at Beta's end with your teammates, wear the orange armband,
  and the HUD is yours in orange: the YOU tag on the score bar's Beta side (Alpha stays on the left), teammate markers,
  minimap dots, the order wheel and hold marker. Bot opponents are "Alpha 1…3" in the hit feed. At half-time you swap
  ends (and in Attack / Defend go from defending to attacking). Squad orders reach your Beta teammates. The result,
  the summary ("Beta (you) · …" first) and the records count your win or loss.
- [ ] **Inter.** All menu and HUD text is one typeface, Inter; numbers (XP, stats, scores) keep their width as
  they change; headings and labels are still in capitals.
- [ ] **Pause (Esc).** Everything freezes, the mouse is freed, and a solid screen shows the round and score with
  Resume, Settings and Quit. Resume puts you back exactly where you were; so does Esc.
- [ ] **Quit.** The title screen comes back with nothing behind it. Change the mode and Play: a fresh match in what
  you picked, from 0–0.
- [ ] **The result screen.** MATCH OVER, YOU WIN! (or YOU LOSE) and the score, with Play again (same setup), New game,
  Summary and Quit.
- [ ] **Pause and result text.** "Round 2 · Alpha (you) 1 – 0 Beta · first to 5"; in Attack / Defend "you attack" or
  "you defend"; at half-time "After round 4 · … you defend next".
- [ ] **The look.** Every screen at 1280×720 and 1920×1080 is tidy: one type scale, buttons in capitals, pictures of
  maps, modes and replicas. Pointing at a button lifts it a little; Tab moves an orange focus ring round every control.
  With reduced motion, screens and dialogs appear with no fade.
- [ ] **Whole replicas (M99).** On the Loadout's Your replicas, Customise's colour tiles, the Armory's levels and a
  run's haul, every replica picture shows the whole replica, muzzle to stock, nothing under its name or the picked
  tile's tick (now at the foot, by the words). Resize the window from 1280×720 up to full screen: still whole.
- [ ] **The loading screen** (production build: `npm run build`, then `npm run preview`; DevTools › Network › Slow
  4G, cache off). The dark page with "AIRSOFT." and a thin orange bar shows at once with no white flash; the bar fills
  through "Loading physics…", "Starting physics…" and "Starting the game…", then the title appears.
- [ ] **The tab.** The orange-dot "A" icon; the tab strip takes the dark theme colour where the browser supports it.

## HUD and match info

- [ ] **Hit feed.** Each hit adds a line at the top right, newest on top: "Beta 2 called HIT · Alpha 3" (who called
  it, then whose BB), names in team colours with a thin bar in the shooter's colour. Lines about you say "You" and
  stand out; friendly fire says FRIENDLY and a ricochet RICOCHET, each with a small glyph. Lines fade after about six
  seconds and a new round clears them.
- [ ] **Teammate markers.** A small name tag and an arrow in your team's colour (blue on Alpha) over each teammate, also through walls; grey and "hit"
  once hit, gone at the dead zone. Enemies never get one. Holding Tab hides every marker over the field. Helpful, or
  too much on screen?
- [ ] **Hold Tab.** The scoreboard: hits, times hit, friendly hits, BBs fired, accuracy and time alive per player, your
  team first with its rounds won, your line highlighted, players hit this round greyed. Between rounds it shows that
  round alone. Tab can be rebound.
- [ ] **The Match summary.** The result, everyone's numbers, and Your records (wins and losses per difficulty and
  mode, the one you just played marked, best accuracy and wins in a row, NEW RECORD on a best you beat). Continue goes
  to the result screen, whose Summary button brings it back. Records carry on after a reload; a quit match counts as
  nothing; best accuracy needs at least 30 BBs fired.
- [ ] **What got you** (Settings › Gameplay): Auto shows the card against Pro only; On shows it on every level; Off
  hides it. The pick is kept.
- [ ] **Crosshair** (Settings › Gameplay › Crosshair). Two previews (still, and opened as when moving), then Shape,
  Size, Thickness, Gap, Colour (no blue or orange: those are the teams'; a custom colour box at the end), Opacity,
  Spread (Static keeps the gap while moving) and Outline. In a match it looks the same and still opens as you move.
- [ ] **Hit marker** (Settings › Gameplay › Crosshair, M97). Off by default: hit a bot and no red X flashes over the
  crosshair, but the hit tick still sounds. On: a bold red X with a dark edge pops over the crosshair and fades (a
  teammate hit marks it light blue). Flip it in the pause menu mid-match: it applies at once, and the pick is kept
  next visit.
- [ ] **Hit marker look** (Dev 5 playtest, note 4). Marker scale, thickness, outline and colour (a custom colour box
  at the end) change the preview at once and the X in a match. Is the default easy to see on every map?
- [ ] **Replay tutorial** (Settings › Gameplay › Tutorial, M97). From the title or the top bar it starts the
  tutorial on the range at once, from its first step, even after you finished it. From the pause menu in a match it
  asks first ("This leaves what you are playing now") and then leaves the match (not recorded) for the tutorial.
- [ ] **HUD size** (Settings › Gameplay › HUD). 150 % makes the replica panel, score bar, minimap, hit feed,
  round messages, order wheel and teammate markers bigger with nothing overlapping at 1280×720; the crosshair
  keeps its size. On a 1440p or 4K screen without system scaling, 100 % is already larger than on 1080p.
- [ ] **The G4 HUD.** A score bar at the top middle (team blocks, the clock, "First to N" under it); the replica panel
  at the bottom right (its picture, the mode chips with the current one orange, the loaded count over "/ N · M spare",
  the magazine bars with the next one marked); no squad cards, order line or key hints on screen (orders live on the
  Z wheel). Low quality looks the same.
- [ ] **HUD opacity** (Settings › Gameplay › HUD opacity, 50 to 100 %, default 90 %). The panels fade while the text,
  team blocks and bars stay solid; the value is kept after a reload.
- [ ] **ROUND banner.** At a round start "ROUND 1" shows large, in heavy capitals on its own panel, with the same
  timing as before; the between-rounds result fits on one line at 1280 px.
- [ ] **Scoreboard size.** At 200 % in a window about 1366 wide it stops growing where the hit feed needs room, and
  when you're hit, HIT! and the OUT tag stay readable.
- [ ] **Hit feed Keep.** The last 10 hits stay up through every round; Play again starts with none. Back to Fade
  mid-match: the lines fade over the next few seconds.
- [ ] **Wide screens.** At 1920×1080 and on 21:9 (2560×1080) the corners keep the same margin; on 21:9 the ammo and
  minimap sit inside a 16:9 area. The scoreboard's "out" pips read against a bright sky.
- [ ] **Ammo counter** (Settings › Gameplay › HUD, AC1). On by default. Off in a match: no big BB count and no
  "/ N · M spare" line; the magazine bars stay, each full until that magazine is empty, then hollow. Fire a magazine
  dry: the replica clicks (pistol) or whirs (AEG) and the panel says Empty; reload and the bar you swapped out goes
  hollow. Low on spares, H's "Low on BBs" hint still shows, and a caught magazine says "+1 mag from …" with no count.
  Flip it on the pause menu: it changes at once, in Practice too. With it off, the tutorial's Reload step says to keep
  count yourself. Does playing without numbers feel fun, or just frustrating?
- [ ] **Name tags up close (BP5).** Stand with two teammates close together: their name tags stack, never on top of
  each other.

## Squad orders and minimap

- [ ] **Follow me (F).** A radio double-click answers (a screen reader hears SQUAD · FOLLOW ME; nothing is printed on
  screen). Your teammates
  keep up a few metres behind, either side, sprinting to catch up; stop and one looks back the way you came, the other
  to a side. Walk or crouch and they do too. They still fight, then come back. F again: "Back to the team plan".
- [ ] **Hold here (X).** Look at a spot and press X: both go there side by side, watch the way you looked and stay
  when you walk off; a diamond marker with the distance shows it. X at the sky: each holds where it stands. X again on
  the same spot: back to the plan.
- [ ] **Regroup (V).** They sprint back to you, then follow. Get hit: the order ends, and order keys say "Orders wait
  for the next round". A new round starts with no order.
- [ ] **The order wheel (hold Z).** Five items round the crosshair (Need a Mag upper left), each with its key under
  it. The view and replica stay still while a small pointer lights the order it's on; let go on one to give it, or
  without moving to give none. You keep walking with Z held; firing stops and needs a new pull after. Settings ›
  Controls › Order wheel › Click: point and click instead (that click fires no BB).
- [ ] **Pings (middle mouse).** Ping the floor or a wall: a soft pip, a ring in your team's colour with "Ping · 24 m"
  under it, on the minimap too; it pops in, sits faint on the screen's edge when you turn away and fades after about
  8 s. Ping again: the old one goes. A teammate answers once ("On it, Dock." or "Eyes on Dock.") and one goes to look,
  each its own way (a rusher runs, a careful one walks in); under Follow me they stay with you. Ping the sky: nothing.
- [ ] **Ping an enemy.** Ping an opponent you can see: an orange diamond "Contact · 30 m" where they stood, and your
  teammates treat it as a threat. One hidden in a bush or the dark is not marked (you get the spot behind). Sometimes
  a teammate calling "Contact" marks the enemy for you the same way. On Easy and Pro alike nothing stutters.
- [ ] **Settings › HUD › Ping markers.** Off: no markers over the field or on the minimap, but teammates still answer
  and go. Rebind Ping under Settings › Controls and the new key pings.
- [ ] **Ask for a mag (H).** Fire until your pouch holds less than one full magazine (the ammo counter's spares): for
  5 s the line under the crosshair says "Low on BBs · H to ask for a mag". Press H: the nearest teammate says "Mag
  coming!" (each personality its own way), comes to you, tosses a magazine you can see arc into your hands with a swish
  and a slap, and the line says "+1 mag from Dash · 60 BBs"; your spares go up by that much and theirs down. H with a
  full spare: "You still have a full spare mag". H with nobody near: "Nobody near has a mag to spare".
- [ ] **A teammate asks you.** Settings › Dev › Bots run low on BBs, then play: 8 s into each round one bot of each
  team is down to its last magazine and calls "Need a mag!" to its nearest teammate. When that is you, its name tag
  gets "· mag" and the line says "Dash needs a mag · 12 m"; they walk to you, and once in reach the line reads
  "H · Toss Dash a mag" over a bar in your team's colour, and the wheel's item reads Toss a Mag (the line hides while
  the wheel is open). Press H: "Mag to Dash", the magazine flies, and they say thanks. A pistol only gets a pistol's
  magazine. When it asks a bot, the giver walks over and tosses. On Easy and Pro alike it works the same.
- [ ] **Settings › HUD › Mag hand-off.** Off: no line or tag, but H still asks and tosses and teammates still call
  it. Rebind it under Settings › Controls (Squad: ask for a mag / toss one), and unbound the lines name the order
  wheel.
- [ ] **The minimap.** A square map at the top left on a navy panel, "Depot · Round 2" under it, the way you look
  always up, you the white arrow. Teammates are dots in your team's colour (blue on Alpha; pinned to the edge when off it), grey once hit. An opponent you hear shows as a patch in theirs (orange on Alpha) roughly where
  (dashed for steps, a dot for a shot) for a few seconds; far sounds give wider patches; nothing for one you can't
  hear. A teammate whose marker would sit inside the minimap square has none there.
- [ ] **Settings › Gameplay › HUD › Minimap** (M83). Rotating (the default) is the minimap above. Fixed: the map
  stays still, north (the map's far end) up, and the white arrow turns as you look; teammates, heard patches, the
  flag, exits and the hold spot stay where they are on the map. It applies at once mid-match and is kept.
- [ ] **Floors.** On Neon Heights the minimap shows your floor (floors below darker) and marks teammates on other
  floors with an up or down arrow.
- [ ] **A second screen.** Drag the window to a screen with other scaling mid-match (or zoom the browser), pause and
  resume: the minimap is sharp and the right size.
- [ ] **Markers off the minimap (BP5).** Turn so a ping, the overtime flag, an Extraction exit or a hold marker is off
  to your left: its edge marker sits under the minimap, never behind it. Two moved there sit one under the other.
  (Two markers in almost the same direction can still overlap on an edge: known.)

## Settings and controls

Settings has groups down the left (Graphics, Display, Audio, Controls, Gameplay, Accessibility, Look, Save file) and a
"Dev settings" box under them that shows the Dev group.

- [ ] **Search.** Type "shadow": only matching rows show, with "N settings found". Nonsense: "Nothing matches".
- [ ] **Notes.** Point at a row (or Tab to it): the side panel says what it does, and in Graphics what it costs.
- [ ] **Changes apply at once** (from the pause menu, on Resume) and are kept after a reload.
- [ ] **Mouse.** Under the sensitivity, Turn distance (cm/360) with a cm box and a DPI box (800 at first), and the same
  sensitivity for CS2 and Valorant. Drag the slider: the cm and the CS2 and Valorant numbers follow. Type your DPI:
  the cm changes, the slider doesn't. Type the cm/360 you use elsewhere (say 36.4): the slider jumps to match and keeps
  36.4, and one sweep of that many centimetres turns you a full circle. Arrow keys move the slider in 0.01 steps.
- [ ] **Invert mouse** On: mouse forward looks down.
- [ ] **Aim button: Toggle.** One right click keeps the sight up; another drops it. Sprint or a switch to the pistol
  drops it, and switching back doesn't raise it by itself.
- [ ] **Sprint key: Toggle.** Hold W and tap Left Alt: you keep sprinting. Let go of W and the sprint ends. Crouch, aim,
  walk or fire: each ends it.
- [ ] **Raw mouse input.** After the first Play the line under it says "Raw input is active" in Chrome and Edge, "no
  raw input" in Firefox. Off: the system's acceleration applies.
- [ ] **Keys** (Settings › Controls › Keys). Fire and Aim are at the top. Each action has a main and a second key box.
  Rebind Move forward's main key: ↑ stays as its second. Bind Jump to R: the line under says "R was Reload: Reload is
  now Space" and Reload's row flashes. Backspace clears a box (Move forward's last key refuses). The mouse wheel binds
  "Wheel up" or "Wheel down", and that direction stops switching replicas. A side button (Mouse 4 or 5) binds and never
  takes the browser back a page. Binding Aim to the left button swaps it with Fire. F5, F11 and F12 are refused.
  Reset All asks "Click Again To Reset" first.
- [ ] **Keys by keyboard only.** Tab to a box, Enter, press a key: the focus stays on that box. Space and Enter bind
  this way without the box waiting again.
- [ ] **Your keyboard layout** (Chrome or Edge with AZERTY or QWERTZ). Move forward shows as Z (AZERTY) and the order
  wheel as W (AZERTY) or Y (QWERTZ); the tutorial and the reload hint use the same letters, and switching layout while
  the game is open updates them. Firefox says names follow a US keyboard; the keys still work by position.
- [ ] **Display.** Field of view starts at 90°: 120° shows more at the sides and 80° less, and the red dot still zooms.
  Fullscreen (or F10 in a match) goes fullscreen and back with play carrying on; Esc leaves it and pauses. Tone mapping
  Neutral (the default), AgX and ACES each change the colours at once, team colours clear on Neutral. Show FPS adds a
  small "NN FPS · N.N ms" counter.
- [ ] **Dev group.** Debug info shows the panel in a match; BB paths draws the BBs' flight; Game speed at 25 % and
  200 % slows and speeds the round (mouse look stays normal); Bottomless magazines never empties; Ghost lets BBs pass
  through you. With any of them on, the summary says Dev settings kept the match out of your records. Untick the box
  and Play again: everything is back to normal and the match counts. Diagnostics › Copy pastes a report starting
  "Airsoft diagnostics" with your GPU and settings, where you stand ("Player: at …"), "Frames: last 10 s of play", and
  "Recent events" naming shots, hits and bot changes from the last moments. Type a note in the box first: it is the
  report's "Note:" line. **Report a Bug** opens a new GitHub issue on the game's page (sign in if asked) titled "Bug:"
  and your note, with the report below it.
- [ ] **Dev playtesting aids** (M90). **+500 XP**, **Level up** and **Reset level** change your level at once (and
  stay after a reload; [Levels and the Armory](#levels-and-the-armory)). **Time of
  day** Night on Depot (or Day on Woodland), then Start match: the map plays under that light, bots with torches at
  night (the lighting may look rough where the map's bounce light was baked for the other time). **Bots hold fire**:
  no bot shoots. **Spectate any bot**: in a match your view follows a bot while you stand still; your fire key moves
  to the next, on either team (pair it with Ghost or Bots hold fire to stay in). **Bot intentions**: a small tag over
  each bot in play ("Advancing", "Holding", "Fighting"; in Extraction its job first in yellow, "Guard"). **End the round now**
  from the pause menu's Settings › Dev, then Resume: the round ends as on time. Each of those (not the XP buttons)
  keeps the match out of your records. **Reset the save** asks first, then reloads as a new player;
  Settings › Save › Undo brings it back.
- [ ] **Settings › Dev › Retro look** (M96; back on the Dev tab since ST1). Off by default; On gives chunky pixels
  and a small dithered palette, like a 1990s shooter, at once; Pixel size and Colours change it; the HUD and menus
  stay sharp. Untick the Dev settings box and the picture goes back to normal at once; tick it and the Retro look
  returns as you left it. Settings › Looks no longer lists it.

## Sound

Headphones help: direction (in front, behind, above) comes through best on them. Every sound is made by the game.

- [ ] **The rifle on auto, then single.** Each shot is a gearbox cycle (a whirr, a plastic slap, a puff of air): a toy,
  never a gunshot. A burst starts with the motor winding up and coasts down after you let go. On a fresh trigger pull,
  is the wind-up heard before the first shot? (Known: it may be masked.)
- [ ] **The pistol.** A sharp pop of gas, a short hiss and the slide clacking back and home: clearly another replica
  with your eyes shut. Empty, the rifle still whirrs (an AEG cycles with no BBs) and the pistol only clicks; the
  reloads sound different too.
- [ ] **Impacts.** A ringing ping off steel, a hollow knock on wood, a dry tick off concrete.
- [ ] **Steps.** A clank on the steel ramps, a scuff on concrete; louder with kit rattling when you sprint and land.
  Crouching, standing and leaning rustle softly.
- [ ] **Bots by ear.** Close your eyes when you hear one: you can point at it, behind you too. Behind a container it
  sounds duller and quieter; behind low cover in between. A bot sprinting at you from about 20 m is heard most of the
  way, quieter than any shot.
- [ ] **The field.** A very quiet outdoor bed with no audible loop and now and then a small bird; barely there, never
  a hiss. Each field has its own echo. Effects turns it down with the rest.
- [ ] **More going on round the field (M86).** Depot: now and then a crow far off and a dog a few gardens away, among
  the birds. Woodland at night: a branch creaking between the owl's hoots. Neon Heights: pigeons by day and a small
  car's "meep meep" a few streets off. Each is rare, quiet and far away: does any of it make you turn round, or sound
  like a player?
- [ ] **Getting hit.** The tick stands out: the world dips for a moment. While you walk off and wait, the field sounds
  muffled and quieter; the whistle stays clear and sits a little above the field.
- [ ] **Pause mid-burst, then Resume.** No click either way: the sound fades out and back.
- [ ] **Settings › Audio.** Master, Effects (replicas, steps, impacts), Power source volume (each replica's motor,
  gas and spring as it fires, yours and the bots'), Ambience (the field's background) and Interface (hit tick, marker,
  whistle), each at once and kept. Power source at 0 leaves the shots' snap but no motor, gas or spring (Dev 5
  playtest, note 2: shots are louder too). Ambience at 0 leaves the field silent but every step and shot
  as loud as before; Effects at 0 leaves only the interface cues.
- [ ] **Practice range.** The 50 m and 60 m plates still ring.
- [ ] **Output devices.** On a 44.1 kHz or 96 kHz device (many USB headsets, HDMI receivers) shots sound as crisp as on
  48 kHz. F3 shows the audio latency (about 10 to 40 ms).
- [ ] **Anything that sounds like a firearm, harsh, or too loud next to the rest?** Say which.

## Graphics and performance

Settings › Graphics › Quality: Low, Medium, High, Ultra or Custom.

- [ ] **First start.** With nothing saved (a private window): integrated graphics (Intel, AMD Ryzen) starts on Medium,
  a discrete card on High; Ultra is never picked for you. The debug panel's quality line ends "(auto)".
- [ ] **The ladder.** Switch presets mid-match; each applies at once with a short pause at most, and the mouse stays
  captured after Resume.
  - **Low:** 80 % resolution, no shadows, plain surfaces, a soft dark disc under every player. It should hold 60 fps
    on a laptop and look as before.
  - **Medium:** shadows, relief, smooth edges, map detail (lighter edges, corner shading, ground variation, signs),
    clouds and the sun's disc, bloom.
  - **High:** sharper textures, finer shadows, replica sheen, dust, ambient occlusion, temporal smoothing and light
    shafts.
  - **Ultra** (fast graphics cards): soft 4096 shadows, up to 2× resolution, the most dust and night lights,
    reflections in puddles and glass, film grain and lens fringe.
- [ ] **Custom.** Pick Medium, then Shadows Off: the picker jumps to Custom; back On: Medium again. Render scale 60 %
  softens the picture while the HUD and menus stay sharp. Custom is kept after a reload. The Custom rows fold away
  until you pick Custom.
- [ ] **Custom rows to try.** Baked light (Off, Vertex, Per pixel) and Weathering on Depot; Relief maps › Bump for the
  old look; Trees None, Simple or Detailed and Clouds at once; Environment lighting off removes the sky's reflections
  in players and steel; Player, Replica and Hand detail Low or High mid-match without a hitch you notice.
- [ ] **Shadows on High.** Rails, posts, cage bars and arms throw crisp shadows close by; walking and turning, edges
  stay still. About 25 m ahead they stop: is the line on the floor bothering you? (Shadow range › Whole field keeps
  them everywhere, softer.) No dark speckle and no shadow floating off a wall's foot. The dock throws a shadow on the
  yard from Medium.
- [ ] **The sky.** A pale haze at the horizon, blue above, warm towards the sun; no sky showing through wall edges.
- [ ] **BB streaks** read as thin bright lines at 20 to 30 m, the same on a high-DPI laptop as on a monitor.
- [ ] **Frame-rate limit.** On a 120 Hz or faster screen set 60: Show FPS reads about 60 and the game plays the same.
- [ ] **Automatic step-down.** Only with nothing saved, on a machine that struggles: after a few slow seconds, at the
  round's end, "Graphics set to Low to keep the game smooth". Not saved; never once you pick a preset.
- [ ] **Edge smoothing in Firefox on Linux.** If it says "Not available in this browser", the game draws without it.
- [ ] **Debug panel (F3).** "frame ms (sim / draw / GPU)" (GPU is "n/a" in Firefox), the antialias line, draw calls.
  Note the frame rate and draw calls on each preset in the open yard and in the office.
- [ ] **First Play and load time.** From the title wait a moment, then Play: no long hitch. On the laptop Medium starts
  no more than about half a second after Low.
- [ ] **The build's phases** (add `?perf` to the address, open the console): each Play logs a "match build … ms"
  line; a second Play on the same map says "(map meshes reused)". Send the lines from the laptop on Low and High.
- [ ] **A full-auto firefight on Low** feels smooth (F3).
- [ ] **A slow machine** (or DevTools CPU throttling 6×): the game keeps real-time pace down to about 6 frames a
  second.

## Accessibility

- [ ] **Team colours › High contrast.** Light blue and dark orange on the figures, the flag, your armband, the
  scoreboard, hit feed and markers, from the next match.
- [ ] **Spare magazines.** A nearly empty spare is striped as well as orange, and the one a reload takes has a yellow
  caret.
- [ ] **On-screen sound cues** (Off by default). A marker round the crosshair points to enemy footsteps (two dots),
  shots (an arrowhead) and hit calls (a HIT tag), fainter further away; turn towards one and it moves to the top. Your
  own and your teammates' sounds show nothing. Sound cue size 200 % and colour Yellow make them big and yellow; a HIT
  tag never sits on a shot arrow.
- [ ] **Reduced motion.** The replica stops bobbing and swaying, each shot kicks half as much, leaning tips the view
  only slightly, and the dust in the air goes; the view still climbs a little in full auto. Your computer's own
  "reduce motion" setting turns it on until you pick.
- [ ] **Windows High Contrast** (or DevTools › Rendering › forced-colors: active). The crosshair, team pips, hit wedge
  and sound cues keep their colours; the selected group's bar and the loading bar still show.
- [ ] **A screen reader** (NVDA or VoiceOver). Being hit is read out ("Hit! You called your hit"), the round result
  once, and a squad order as it is given.

## Save

Settings › Save file. Everything saves as it changes; nothing to press.

- [ ] **Saved automatically.** Change the field of view: the Save tab says "Last saved just now". Reload: your
  settings, Loadout, level and records are as you left them.
- [ ] **Download.** `airsoft-save-<today>.json` lands in Downloads, readable in a text editor (the game, version, date,
  a summary and the stores). The tab says "Last downloaded just now".
- [ ] **Load in another browser** (or a private window). Load file (or drag the file onto the tab): both saves side by
  side; Replace reloads with yours. Undo brings back what was there.
- [ ] **Clear and restore.** Clear the site's data and reload: a fresh game. Load your file: everything is back.
- [ ] **An edited file.** Change `xp` in a download and load it: the pop-up warns it was changed and the button reads
  Load anyway. Cancel changes nothing. Any other JSON or text file: "That file isn't an Airsoft save".
- [ ] **Mid-match.** Download works; Load, Restore, Undo and Delete are greyed with "Leave the match to load a save."
- [ ] **Restore points.** One per day you play (three at most); restoring shows the same side-by-side pop-up, and Undo
  works after it.
- [ ] **Delete.** It offers Download first; Delete reloads a fresh game (the tutorial tagged "New?" again); Undo brings
  it back.
- [ ] **Two tabs.** A second tab shows "Airsoft is open in another tab" and waits; Play here moves the game to it.
  Press Settings › Dev › +500 XP in one, switch: nothing is lost.
- [ ] **Protect.** Chrome and Edge answer at once (often "said no for now" on a site you rarely visit); Firefox asks.
  Once allowed it reads Protected.
- [ ] **Firefox and Edge.** Download, Load (button and drag and drop), the two-tab notice and Protect once in each.

## Browsers and builds

- [ ] **Firefox, production build** (`npm run build`, `npm run preview`). It boots to the title with no console errors
  (no "Content-Security-Policy" errors either); Play takes the mouse; Esc pauses and Resume takes it back; a bot's shot
  to your left or right comes from that side; the back and forward side buttons don't leave the page.
- [ ] **Edge, production build.** The same boot, Play, Esc and Resume. `npm run dev` still boots and reloads on edits.
- [ ] **Mouse look in Chrome, production build.** Smooth, with no jump on the first move after Play or Resume.
- [ ] **Esc on the pause screen** resumes. Right after pausing, Chrome may need a moment and shows "click again"; a
  second Esc a second later resumes.
- [ ] **Tabbing away.** Switch tab or Alt+Tab to another program mid-round, or click a window on a second screen (or
  open an overlay such as Discord's): the match pauses and nothing happened while you were away. Away while running
  forward: on Resume you stand still.
- [ ] **Hardware acceleration off** in the browser (then restart it): the title screen warns the game will run slowly
  and says where to turn it back on.
- [ ] **Sound blocked** (Firefox › Settings › Privacy & Security › Autoplay › Block Audio and Video): a line under
  Resume says the browser blocks sound. Allow it and the next Resume has sound.
- [ ] **JavaScript off** (DevTools › Settings › Debugger › Disable JavaScript): the loading page says the game needs it.
- [ ] **A crash** (dev server, mouse locked; in the console `airsoft.session.advance = () => { throw new Error('test') }`):
  the game stops, the cursor comes back, and "Something went wrong" shows the seed; Copy Report puts it on the
  clipboard (Chrome and Firefox) and Reload starts again.
- [ ] **Precompressed files** (only on a host that serves them, README › Hosting): the `rapier-….js` response has
  `content-encoding: br` and about 1.2 MB transferred.

## Old bugs to recheck

Fixed in earlier bug passes; a bug pass checks they stay fixed.

- [ ] **Hit a bot, press Esc and resume** (and after Play again; Hit marker On): no hit marker or white flash replays.
- [ ] **At the start of each round** the replica in your hands stays still; it doesn't swing in from the side.
- [ ] **Empty the AEG with the trigger held, press 2 then 1 while holding:** it clicks dry and starts a reload.
- [ ] **Customise › Muzzle** with nothing fitted reads "Bots hear your shots from 22 m."; with a silencer "… from
  11 m (22 m without a silencer)."
- [ ] **New game at 1920×1080 and 2560×1440:** "Elimination" stays inside its card.

## Reporting what you find

Post each problem in the project chat, one message per problem. These four things let it be fixed without guessing:

1. **What you did,** step by step ("crouched behind the crate by the office door, leaned right with E").
2. **What happened,** and what you expected instead.
3. **The seed** from the F3 box, with the map, mode and difficulty.
4. **A screenshot or short clip** if you can (Windows: Win+Shift+S; Mac: Cmd+Shift+4).

Feelings count too: "bots are too good on Normal" or "leaning feels slow" is useful, not just bugs. Some things are
already known and listed in `docs/KNOWN_ISSUES.md`, such as bots never using the pistol and arm hits not counting
(your choice).
