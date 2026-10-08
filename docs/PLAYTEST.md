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

What is new since 0.1 Dev 4. Each line points to the section with the full checks.

- [ ] **New menus.** The plain title screen, the bar across the top, the Match screen's picture cards (Practice the last mode) and the grouped
  Settings with a search box ([Menus](#menus), [Settings and controls](#settings-and-controls)).
- [ ] **New players and hands.** Masked humans and robots in team colours, and your own gloved or robot arms
  ([Players and replicas](#players-and-replicas)).
- [ ] **New replicas and colours.** Blockier two-tone replicas, a colour per replica in Customise, and Settings ›
  Look › Realistic colours ([Players and replicas](#players-and-replicas), [Loadout and Customise](#loadout-and-customise)).
- [ ] **Depot's new light and dressing.** A lower, warmer sun with light bounced into the shade, new walls and
  gabions, dirt, junk, puddles and a skyline on Medium and up ([Depot](#depot)).
- [ ] **Ultra and the new effects.** The Ultra preset and the effects each preset adds
  ([Graphics and performance](#graphics-and-performance)).
- [ ] **Bots at night and in the hunt.** Every level hunts the middle once its lane is clear, keeps out of lantern
  light at night and switches the torch on only up close ([Bots](#bots)).
- [ ] **Hit players walk off quickly** on every map, by a sensible route ([Rounds and matches](#rounds-and-matches)).
- [ ] **Extraction's home team by level** and the 3-second grace when you come in (dev content,
  [Extraction](#extraction-dev-content)).

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
- **Desktop Ultra baseline.** On your desktop run
  `node pipeline/perf-run.mjs --env desktop --preset all --viewport 3840x2160 --baseline` and commit
  `pipeline/baseline/desktop*.json`.
- **Save in Firefox and Edge.** The automated tests run Chromium only ([Save](#save)).
- **Woodland and Neon Heights** stay dev content until you have played them; you make each one public.

## Movement

Play › Mode Elimination on Depot, Match › Opponents Normal. Set the mouse sensitivity in Settings › Controls first.

- [ ] **Look around with the mouse.** The view turns smoothly, with no jumps, and no drift once the mouse stops.
- [ ] **Move with W A S D.** You run at a steady pace and hear your own footsteps.
- [ ] **Hold Shift and move.** You walk slowly and your footsteps go silent.
- [ ] **Hold Left Alt and run forward.** You sprint. Try to shoot while sprinting: nothing fires until a moment
  after you stop.
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
- [ ] **Let go of sprint and click at once with the pistol.** The shot fires a moment later instead of being lost.
- [ ] **Shoot at a far wall.** You see the BBs fly, take a moment to arrive and drop at long range; the pistol's
  drop sooner.
- [ ] **Fire half a magazine, then press R.** A magazine swap plays (rifle 1.8 s, pistol 1.2 s). The small gauges
  by the BB count show your spares; the half-used one goes back in the pouch.
- [ ] **Empty a magazine, then pull the trigger.** The empty pull starts a reload by itself.
- [ ] **Press R with a full magazine in.** Nothing swaps and the screen says why: no topping up.
- [ ] **Use up every magazine.** You can't fire again that round. The next round starts you full.

## Aiming and optics

The rifle comes with flip-up iron sights; a red dot or a 2× scope is a part you fit in Loadout › Customise.

- [ ] **Play with iron sights.** Small flip-up sights stand on the rails and holding right click does nothing:
  aiming down sights needs an optic.
- [ ] **Fit the red dot, then play.** It sits on the rifle and the iron sights fold flat under it.
- [ ] **Hold right click.** The rifle comes up, the view narrows a little, the crosshair gives way to the red dot,
  and you move at a quiet walk (no sprint while aiming). Let go and it all goes back.
- [ ] **Shoot while aiming.** BBs go where the dot is. Standing still is still what makes you accurate; aiming adds
  none of its own.
- [ ] **Move the mouse while aiming.** It turns at Settings › Controls › Aiming sensitivity (×0.80 of your mouse
  sensitivity at first, so the world moves across the screen as fast as from the hip).
- [ ] **Reload, or switch to the pistol, while aiming.** The sight drops for the reload and comes back up if you
  still hold right click. The pistol has no optic, so it never aims down sights.
- [ ] **Fit the 2× scope and hold right click.** It comes up a little slower than the red dot; only a round eyepiece
  with a crosshair and a red centre dot shows (find it against a dark wall), twice as close. Turning feels the same
  across the eyepiece as with the red dot. Worth it on long lanes, and is the blind surround a fair cost?
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
- [ ] **Settings › Look › Robots.** Mixed (the default) puts humans and robots on both teams each match; Off makes
  everyone human.
- [ ] **Your hands.** Dark gloves, sleeves in your team's camo and its armband; robot arms when your player is a
  robot. The support hand holds the rifle's handguard, thumb up the near side, no finger through it; through a
  reload it takes the magazine and comes back.
- [ ] **Hit call.** Hit a bot: the HIT! sign, the hand up, the replica hanging; still readable at 20 to 30 m.
- [ ] **Replicas.** The held rifle and pistol look like toys: blocky, two-tone, with stippled grips; the red dot is a
  square hood and the silencer six-sided. Other players' replicas are in their team's colours.
- [ ] **Colour schemes.** Your rifle starts Cobalt and your pistol Ghost; Loadout › Customise › Colour picks one of
  eight two-tone schemes per replica.
- [ ] **Settings › Look › Realistic colours.** Every replica shows in one real colour instead (black, wolf grey,
  ranger green or tan, by its scheme); others' replicas turn plain.
- [ ] **Replica detail on High.** Fine speckle on the plastic, rounded lit edges, rail slots and sights. In Loadout
  try every optic, grip and magazine: nothing floats or clips the hands.
- [ ] **Gas puffs and impacts.** The pistol puffs a little gas at the muzzle and ejection port each shot; the rifle
  none. No flash, no casings. Impacts make pale dust on concrete, tan crumbs on wood, a grey puff on steel: soft puffs,
  never sparks. On High a BB carries a soft warm glow and a wall hit throws a few chips back towards the shooter.
- [ ] **Name tags.** Walk up to a teammate (1 to 2 m): the tag sits just above the head; at 30 m and more it still
  sits above it. Try a field of view of 80.

## Loadout and Customise

Loadout (the title screen or the top bar). The slots are Primary, Secondary and Grenades (greyed: none yet); your
replicas are listed with their tier. Right-click an equipped replica, or use Customise, to change its parts.

- [ ] **Swap slots.** Put the Gas Pistol in Primary: the AEG rifle moves to Secondary. Any replica goes in either slot.
- [ ] **Customise.** Colour first, then the optic, BB weight, hop-up, grip, laser, magazine, power source, barrel,
  muzzle and light, each offering only parts you own that fit. Skins say they come later. Esc goes back.
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
  (you hear it too, quieter: tolerable over a long walk?). Low-cap: 30 BBs, four spares, a quicker change. The
  pistol's extended magazine: 27 BBs, slower to draw. Each part shows on the replica.
- [ ] **Barrels and the silencer** (Settings › Dev › Unlock all gear, if you don't own them). The Tight-Bore Barrel:
  spread −15 %, energy +3 %. The Long Barrel: energy +8 %, Draw and Aim raise +15 %, visibly longer. The Silencer (both
  replicas): energy −5 %, a slower draw, "Shots heard from" 22 m becomes 11 m; shots sound duller and quieter.
- [ ] **Bots hear a silencer less.** On Normal, fire the silenced rifle from about 15 m behind a bot that can't see
  you: it doesn't turn (unsilenced it does). On the minimap, with sound cues on, a silenced bot shows only within half
  the usual range.
- [ ] **Performance panel.** Beside the parts: energy, muzzle speed, BB weight, rate of fire, on-target range, time
  to 20 m, spread, recoil, magazines, reload, draw, aim raise and shots heard from. Change a part or drag the BB
  weight: each changed stat is marked better or worse with a percentage; a trade-off (the hi-cap's "120 × 2") isn't
  coloured. As it comes the AEG reads about 0.97 J, 13 BBs/s, 60 BBs; the pistol 0.52 J, 7 BBs/s, 18 BBs.
- [ ] **Tiers.** With Unlock all gear, a Legendary AEG Rifle reads about 1.04 J, 14 BBs/s, spread −15 %; a Legendary
  pistol on Legendary Black Gas about 0.71 J with recoil +20 %. The line under the replica's name says what its tier
  adds ("Common: no tier bonus" otherwise).
- [ ] **The 11.1 V LiPo battery** on the rifle: rate of fire +15 %, energy unchanged; it sounds and empties faster.
- [ ] **Glowing BBs** (per replica): At Night (the default) glows only on night fields, Always or Off. A glowing BB is
  green, a little larger at range, with a longer streak.
- [ ] **Light** (dev content, night fields). Every replica has a starter Light, switched with **T**. "No light" takes
  the torch off. Known bug: on the AEG rifle the Light row won't take "No light" (bug pass BP2 fixes it).
- [ ] **Your setup is kept.** Reload the page: every pick is still there. Bots carry their replicas as they come,
  except Hard opponents (see [Bots](#bots)).
- [ ] **Edit `stats.md`.** Set the AEG's `Fire rate (BBs/s)` to 20 and run `npm run dev` again: the panel says
  20 BBs/s and every rifle fires faster. A typo (`2O`) shows in the browser console and `npm run test` names its
  line. Put it back.

## Cyber Pistol

The chase replica: Legendary only, from the Armory at a 1 in 400 chance per item. To try it now, turn on Settings ›
Dev › Unlock all gear.

- [ ] **Equip it.** It is in the Loadout at Legendary only and goes in either slot.
- [ ] **Its look.** A white slab with glowing cyan lines and a magenta core, the same on either team. With Realistic
  colours it is plain grey and unlit. Does it read as rare and special?
- [ ] **Customise.** Power source reads Built-in battery and the magazine "Its own, 50 BBs"; the optic, grip, laser,
  barrel and muzzle rows are greyed. BB weight and hop-up still turn. The panel shows 1.00 J, 14 BBs/s, a 1.1 s reload.
- [ ] **On the range.** It starts on Semi and the selector steps Burst and Auto. Even on Auto the sight barely climbs.
  Out of the box it stays on target to about 33 m.
- [ ] **Its sound.** A quiet electronic chirp and a soft pop with no motor whine; an empty trigger blips; a reload
  ends in a two-note chime. Futuristic but still a toy?
- [ ] **Leave the AEG at home.** Carry the Cyber Pistol and the Gas Pistol on Normal: the bots' AEG shots still sound.
- [ ] **The Armory.** Its Chase line names the Cyber Pistol, Legendary only, 0.25 %, about 1 in 400. In your
  collection its row has one pip, Legendary. When one drops for real (about 130 Shots on average), its tile glows and
  the reveal says "Chase item: Cyber Pistol!".
- [ ] **Bots with it.** With it owned (or Unlock all gear on), about 1 Hard match in 20 has an opponent with it on
  Auto. Never on Easy or Normal, never a teammate.

## Armory and Field Credits

Completely free: Field Credits (FC) come from playing, and nothing is ever sold.

- [ ] **Earn FC.** Win a standard match: the summary lists FC for the match, the win, the rounds and your hits; the
  top bar shows the new total. A loss pays less; a round your team won while you were out without a hit pays nothing.
  Hard opponents with Easy teammates show "difficulty ×0.5".
- [ ] **Shots.** The buttons read "1 Shot · 160 FC" and "10 Shots · 1,600 FC". 10 Shots asks first, with the keyboard
  on Cancel (Enter cancels). Holding Enter on 1 Shot takes exactly one.
- [ ] **The reveal.** Each Shot gives three assets with their rarity; a first copy says New, a repeat Spare. After ten,
  the tiles come in rarest first, an Epic or Legendary glowing in its colour, with a line like "1 Epic, 4 Rare,
  25 others · 3 new". With reduced motion they appear at once.
- [ ] **Pity.** "Epic or rarer within 20 more Shots" and "Legendary or rarer within 100 more Shots" count down a Shot
  at a time and survive a reload.
- [ ] **Your collection.** Under the balance and the odds, one column per kind (replicas, power sources, optics, grips,
  and the rest), each with a heading. Every asset Shots can give, owned or not (dimmed), with a pip per tier and "N / 84 items".
  Right-click an item (or focus it and press the Menu key or Shift+F10) for its Scrap 1 / Scrap N menu; Esc, a click
  elsewhere or a choice closes it. Scrap 1 scraps the lower copy; fit the Common on Customise first, scrap it, and Customise shows the Rare fitted.
  Scrap all spares asks first and keeps your best copy of everything.
- [ ] **Rarity odds.** The odds table has its caption, and each Rare-or-better copy lists what its tier adds.
- [ ] **Settings › Dev › Disable Armory.** The Armory is greyed and won't open; a match pays nothing and says why.
  Turn it off: the next match pays.
- [ ] **Settings › Dev › Unlock all gear.** The Loadout offers every replica and part at every tier and the match stays
  out of your records. Turn it off: your own picks are back.
- [ ] **A Dev-assisted match** (Bottomless magazines on, to the end): "No Field Credits: Dev settings changed how this
  match played."

## Bots

You're on Blue with two bot teammates against three Orange bots by default.

- [ ] **Hit an Orange bot.** It raises its hand, walks off to the dead zone, and you get a clear sign of the hit.
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
- [ ] **Fight a bot beside a wall or container.** It sidesteps away from the wall and keeps you in sight; on the
  dock's edge it never steps off.
- [ ] **Hit a bot's teammate from 30 m or more.** The others turn towards roughly the right side, not straight at you.
  Once your fight is over, a bot heads for where your teammate was heard.
- [ ] **Bots fighting by door frames** don't fire into the frame beside them or dive for cover from their own BB.
- [ ] **Every level hunts.** Once their lane is swept, bots of every level hunt the map's middle; a round shouldn't
  drag to the clock with nobody left to find.
- [ ] **Difficulty.** Easy should feel clearly weaker than Hard. Hard bots sometimes come at a spot from the side;
  Easy never. A change mid-match applies from the next round, and the screen says so.
- [ ] **Hard opponents' kit.** Their rifles differ (faster, silenced, longer-ranged); Play again rolls new kits. Easy
  and Normal opponents and your teammates carry replicas as they come.
- [ ] **At night** (Woodland, Neon Heights by Night): Normal, Hard and Pro bots hold their posts out of lantern light
  when a dark spot is near. A bot switches its torch on for a fight within about 20 m and for the last stretch of a
  search (12 m from the spot on Normal, 20 m on Hard, 30 m on Pro): a beam far off across the field is rare. Easy
  bots keep theirs on as they move.

## Rounds and matches

One BB hit puts anyone out. A round lasts up to 2:30 and the first team to 5 round wins takes the match.

- [ ] **Get hit.** A sharp tick, a sign of where it came from, and your view walks off. Then you watch a teammate;
  left click (or your fire key) moves to the next one.
- [ ] **Shoot a teammate (carefully).** Friendly fire counts, so they go out too. On purpose.
- [ ] **Walk-offs.** Hit players walk all the way to their dead zone by a sensible route, promptly, on every map,
  even from the far end. Teammates in the dead zone stand on separate spots.
- [ ] **End a round.** A banner says who won, the score updates and the next round starts by itself. The first round
  of a fresh page load starts with the referee's two short whistle blasts.
- [ ] **A drawn round** (both last players out together) replays the same round number; the summary counts it.
- [ ] **Half-time.** The teams swap ends after round 4; the banner says so.
- [ ] **Finish a match.** The Match summary comes first (see [HUD and match info](#hud-and-match-info)), then the
  result screen. Finish, then go straight to Stats without pausing: the match is counted and paid at once.
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
- [ ] **The east end** (Blue's start in Elimination) has no way out to the north road: the team leaves past the
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
Meadow, and Creek with the cabin). 4v4 by default, up to 5v5. Turn on Settings › Dev › Dev content, then pick it on
the Play screen.

- [ ] **The night.** A dark sky under a low moon over the Knoll; camp fires flicker with embers, lanterns glow and
  light the ground; on Medium and up the nearest ones light players too (Settings › Graphics › Night lights).
- [ ] **Readable on Medium with your torch off.** The tracks, the creek and the cabin's boards stay readable.
- [ ] **Bushes** hide you from bots when you're deep in or behind one; BBs and people pass through. The minimap
  draws them.
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
  big maps with Dev content), Opponents, Teammates, Friendly fire and Ricochets count; Custom adds Overtime, Time-out,
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
- [ ] **Custom pays at most ×1.5** and never counts for records.

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

### Tutorial

- [ ] **The title screen** offers Tutorial under START on a clean save, until you've finished it once or started a
  first match (also after a reload).
- [ ] **Play it through.** The coach says "Tutorial · 1 of 10 · Look around" and moves on as you do each thing: look
  around, walk to the line, ring a plate, knock down a figure at 50 m or more (the coach shows where your last BB
  landed), reload, aim (or, with iron sights, a pointer to the optics), crouch, lean, switch replica and hit
  something, the fire selector, shooting out of a sprint, then the "one hit" card. Each finished step ticks green.
  Did any step feel stuck or unclear?
- [ ] **Your keys.** Rebind reload, start the tutorial again: the coach names your key.
- [ ] **Esc mid-tutorial.** The pause menu names your step and offers Skip step and Skip tutorial. Change the
  loadout and come back: same step. Quit at step 5 and start again: it picks up at step 5. Skip tutorial: free
  practice, and the title stops tagging it.
- [ ] **After the last step** the coach goes and the range readout appears.

### Extraction (dev content)

Your squad against a home team on a timed run. Turn on Dev content, then Play › Mode › Extraction (Depot, Woodland or
Neon Heights). While it is dev content a run keeps nothing and pays nothing; the summary says "Not kept".

- [ ] **Play screen.** The Match line reads like "Squad of 3 · 5 in the home team" and "One 8:00 run"; the rules text
  explains the run. With Dev content off, Extraction isn't offered and a saved pick plays as Elimination.
- [ ] **Exits.** The strip under the clock names the open exits and when the late one opens; green EXIT rings with
  cones and a sign, a marker with the distance and a square on the minimap. No exit stands next to your insertion.
  On slopes each ring, cone and sign stands on the ground.
- [ ] **Counted out.** Stand in an open exit: a beep a second, "Counting you out · 9 … 1", then "Counted out · you made
  it!". Step out at 5 and it starts again; an Orange bot in the ring pauses it.
- [ ] **Respawn.** Hit once: back at the insertion, "Back in at the insertion · no respawn left". Hit again: "Out of
  the run".
- [ ] **Coming in.** For 3 seconds after you come in, and after a respawn, BBs neither hit you nor leave your replica.
  Does the first fight now start after you've had a look round?
- [ ] **The clock.** A whistle at 1:00 left; the late exit opens at 3:00 (its sign turns green); at 0:00 "Caught out".
- [ ] **Cases.** An olive ammo can, a black field case with an orange band and a grey locker with a yellow band stand
  by cover, elsewhere each run. Walk up: "Hold G to open the field case". Holding G fills a bar (about 2 s for a can,
  4 for a field case, 7 for the locker) with a rummaging sound; let go and it starts again. The lid swings up and the
  line says what it held ("+35 FC", "BB resupply · magazines topped up", "Rare Red Dot · +120 FC").
- [ ] **Carrying.** The strip reads "Respawn ready · Carrying 155 FC and 1 part". Hit while carrying: "You dropped
  what you carried where you were hit · go back for it", and a small bag lies where you fell; hold G on it to pick it
  all up. A resupply fills your spares.
- [ ] **The haul.** Get out carrying finds: the summary's haul line lists them, parts as tiles in tier colours. Any
  other end: "Lost: … Only what you get out with is yours."
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
- [ ] **Supply events.** From Friday to Sunday the Mode card says "Supply weekend, until Sunday: cases hold +25 % Field
  Credits and +50 % parts", and cases hold more. Set the computer's date to 30 October to 1 November 2026: it names
  the Halloween night run (+50 % FC, +100 % parts). Change a row in `pool.md`'s Supply events table: the line follows.
- [ ] **Pay and records** (only once the mode is public): the FC you get out with plus your hits, times the
  difficulty; an Extraction column in your records and its own bests.
- [ ] **The Use key.** Settings › Controls › Keys has "Use: open a case (hold)"; rebind it and the prompt follows.

## Pro difficulty (dev content)

Turn on Dev content, then Play › Match › Opponents › Pro. Play each map once in Elimination and once in Attack /
Defend: Depot, Woodland and Neon Heights (Day, then Night). Pro pays ×2 but counts for nothing while it is dev content.

- [ ] **Slow down.** Pro bots hold still aiming at corners and doorways and walk quietly towards where they heard you.
  Run past a corner and you lose; slice it a step at a time or peek short and step back, and you win.
- [ ] **What got you.** After you're hit a card shows, for example, "Orange 2 · from your left · 14 m", whether that
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
  or your first match. The build ("0.1 Dev 4+N · …" on `main`, just the release name on a release download; hover it
  for how many commits after the release it is) sits small at the bottom left. Nothing else: no tip, no next match, no
  FC or Tokens. No map is loaded behind the menus.
- [ ] **Keys.** On the title, Enter presses START, T starts the tutorial (while it is offered) and Esc opens
  Settings. No key prompts are drawn along the bottom of any screen; every screen works with the mouse alone (the
  Airsoft wordmark on the top bar goes back to the title) and the keys still work (Esc is Back, C customises, / searches
  Settings, Space takes a Shot).
- [ ] **The top bar** on every screen after the title: MATCH, LOADOUT, ARMORY, SETTINGS from the left, your FC and
  Tokens on the far right, no version; the current place is marked. Opened from the pause menu, only the current place
  shows and the wordmark reads Back.
- [ ] **The Match screen** (START). 01 Map as picture cards (a Day | Night switch on maps that have both, kept per
  map), 02 Mode as cards with **Practice last**, 03 Match rules. On the right, Your match: the map, Mode, Rules, Teams,
  your Loadout with Change, and **Start match**. Picking Practice hides the map and the rules, and the button reads
  **Start practice** (the range). Start loads the field with a short pause at most.
- [ ] **Inter.** All menu and HUD text is one typeface, Inter; numbers (FC, Tokens, stats, scores) keep their width as
  they change; headings and labels are still in capitals.
- [ ] **Pause (Esc).** Everything freezes, the mouse is freed, and a solid screen shows the round and score with
  Resume, Settings and Quit. Resume puts you back exactly where you were; so does Esc.
- [ ] **Quit.** The title screen comes back with nothing behind it. Change the mode and Play: a fresh match in what
  you picked, from 0–0.
- [ ] **The result screen.** MATCH OVER, YOU WIN! (or YOU LOSE) and the score, with Play again (same setup), New game,
  Summary and Quit.
- [ ] **Pause and result text.** "Round 2 · Blue (you) 1 – 0 Orange · first to 5"; in Attack / Defend "you attack" or
  "you defend"; at half-time "After round 4 · … you defend next".
- [ ] **The look.** Every screen at 1280×720 and 1920×1080 is tidy: one type scale, buttons in capitals, pictures of
  maps, modes and replicas. Pointing at a button lifts it a little; Tab moves an orange focus ring round every control.
  With reduced motion, screens and dialogs appear with no fade.
- [ ] **The loading screen** (production build: `npm run build`, then `npm run preview`; DevTools › Network › Slow
  4G, cache off). The dark page with "AIRSOFT." and a thin orange bar shows at once with no white flash; the bar fills
  through "Loading physics…", "Starting physics…" and "Starting the game…", then the title appears.
- [ ] **The tab.** The orange-dot "A" icon; the tab strip takes the dark theme colour where the browser supports it.

## HUD and match info

- [ ] **Hit feed.** Each hit adds a line at the top right, newest on top: "Orange 2 called HIT · Blue 3" (who called
  it, then whose BB), names in team colours with a thin bar in the shooter's colour. Lines about you say "You" and
  stand out; friendly fire says FRIENDLY and a ricochet RICOCHET, each with a small glyph. Lines fade after about six
  seconds and a new round clears them.
- [ ] **Teammate markers.** A small name tag and a blue arrow over each teammate, also through walls; grey and "hit"
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
- [ ] **The order wheel (hold Z).** Four orders round the crosshair, each with its key under it. The view and replica
  stay still while a small pointer lights the order it's on; let go on one to give it, or without moving to give
  none. You keep walking with Z held; firing stops and needs a new pull after. Settings › Controls › Order wheel ›
  Click: point and click instead (that click fires no BB).
- [ ] **The minimap.** A square map at the top left on a navy panel, "Depot · Round 2" under it, the way you look
  always up, you the white arrow. Teammates are blue dots (pinned to the edge when off it), grey once hit. An opponent you hear shows as an orange patch roughly where
  (dashed for steps, a dot for a shot) for a few seconds; far sounds give wider patches; nothing for one you can't
  hear. A teammate whose marker would sit inside the minimap square has none there.
- [ ] **Floors.** On Neon Heights the minimap shows your floor (floors below darker) and marks teammates on other
  floors with an up or down arrow.
- [ ] **A second screen.** Drag the window to a screen with other scaling mid-match (or zoom the browser), pause and
  resume: the minimap is sharp and the right size.

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
  "Airsoft diagnostics" with your GPU and settings.
- [ ] **Retro pixels** (Dev). Chunky pixels and a small dithered palette, like a 1990s shooter; Pixel size and Colours
  change it; the HUD and menus stay sharp.

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
- [ ] **Getting hit.** The tick stands out: the world dips for a moment. While you walk off and wait, the field sounds
  muffled and quieter; the whistle stays clear and sits a little above the field.
- [ ] **Pause mid-burst, then Resume.** No click either way: the sound fades out and back.
- [ ] **Settings › Audio.** Master, Effects (replicas, steps, impacts) and Interface (hit tick, marker, whistle), each at
  once and kept. Effects at 0 leaves only the interface cues.
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
  settings, Loadout, Armory items, FC and records are as you left them.
- [ ] **Download.** `airsoft-save-<today>.json` lands in Downloads, readable in a text editor (the game, version, date,
  a summary and the stores). The tab says "Last downloaded just now".
- [ ] **Load in another browser** (or a private window). Load file (or drag the file onto the tab): both saves side by
  side; Replace reloads with yours. Undo brings back what was there.
- [ ] **Clear and restore.** Clear the site's data and reload: a fresh game. Load your file: everything is back.
- [ ] **An edited file.** Change `fc` in a download and load it: the pop-up warns it was changed and the button reads
  Load anyway. Cancel changes nothing. Any other JSON or text file: "That file isn't an Airsoft save".
- [ ] **Mid-match.** Download works; Load, Restore, Undo and Delete are greyed with "Leave the match to load a save."
- [ ] **Restore points.** One per day you play (three at most); restoring shows the same side-by-side pop-up, and Undo
  works after it.
- [ ] **Delete.** It offers Download first; Delete reloads a fresh game (the tutorial tagged "New?" again); Undo brings
  it back.
- [ ] **Two tabs.** A second tab shows "Airsoft is open in another tab" and waits; Play here moves the game to it.
  Take a Shot in one, switch: nothing is lost.
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

- [ ] **Hit a bot, press Esc and resume** (and after Play again): no hit marker or white flash replays.
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
