# Playtest guide

How the owner plays the game to check a change. Each pull request names the sections to play; a bug pass
before a release plays all of them. Written 2026-10-02 for the game as of M10 (leaning, magazines, BB physics,
the 2σ crosshair); updated 2026-10-03 for M12a (fire modes, crouch toggle, steadier aim when still, quicker
reloads), M12b (the red dot as an accessory, aiming down sights, the crosshair's instant lock), M11 (the
reworked Depot) and M15 (the new menus). Update a section when a change alters what it describes.

## Get the game running

Needs a desktop computer with Chrome, Edge or Firefox. Setup takes about 10 minutes the first time.

1. **Install Node.js (one time only).** Go to nodejs.org, download the **LTS** version (22 or newer) and
   install it with the default options. Node.js runs a small web server on your own computer; nothing gets
   installed into your browser.
2. **Download the code.** Sign in to GitHub, open github.com/ggbillyjoe3526/Airsoft, click the green **Code**
   button, then **Download ZIP**. That gives you `main`, the latest merged version.
   - **To test a pull request before merging it**, first pick its branch: on the repository page, click the
     branch menu (it says `main`), choose the branch named at the top of the pull request, then **Code** →
     **Download ZIP**.
3. **Unzip it** somewhere easy, like your Desktop. The folder is named after the branch (`Airsoft-main` for `main`).
4. **Open a terminal in that folder.**
   - Windows: open the folder, click the address bar at the top, type `cmd` and press Enter.
   - Mac: right-click the folder and choose **New Terminal at Folder**.
5. **Type `npm install` and press Enter.** It downloads the game's building blocks. Wait until you can type
   again (about a minute).
6. **Type `npm run dev` and press Enter.** It prints an address. Leave this window open: closing it stops the game.
7. **Open http://localhost:5173 in your browser** and you'll see the title screen.

To stop, click the terminal and press **Ctrl+C**. Next time, repeat steps 4 and 6 only (steps 2–7 for a new download).

| If this happens | Try this |
|---|---|
| `npm` is "not recognized" or "command not found" | Close and reopen the terminal. Still failing? Restart the computer. |
| The page says it can't be reached | Check the terminal still shows `npm run dev` running, and use the exact address it printed. |
| Black screen or "Failed to start" | Update your browser. |
| Clicking doesn't grab the mouse | Wait a second and click again. Browsers refuse right after Esc. |

Tip: press **`** (top-left, under Esc) or **F3** while playing to show the frame rate and the game's **seed**.
Note the seed when something goes wrong; it lets the same match be replayed.

## Final alpha audit: start here (2026-10-04)

The audit's fixes are all on `main` (FA1–FA12; each has its own section below). If time is short, play these first:

1. **Graphics:** Settings → Graphics on Low, Medium, High and a Custom mix. Low should hold 60 fps on the laptop and look as
   before. Medium and High should show the new lighting, map detail, trees and clouds, and the rebuilt players, replicas and gloves.
   Turn on the FPS counter.
2. **A full Elimination and a full Attack / Defend match on Normal and Hard:** bots should keep apart, use cover and react
   to shots landing near them.
3. **Quit, then Play again on the same map:** it should start almost at once now.
4. **Esc on the pause screen** should resume the game and take the mouse back (Chrome sometimes asks for one more click).
5. **The Armory:** ten Shots, scrapping and the pity counter. **The tutorial:** skip it and resume it.

Your calls after playing (each currently on the default shown):
- **Running up ramps** (SIM-17): the fix is built but off (`MOVEMENT.rampPace` 0), because it moved Attack / Defend balance.
- **Your own ricochets** (SIM-07): with "Ricochets count" on, a ricochet of your own BB now knocks you out, under the same
  rules as a teammate's. Say whether that should stay.
- **The laser beam:** off on every preset (Custom → Laser beam turns it on).
- **Against Easy opponents, your teammates start on Normal.**
- **Depot's ends:** the west end now wins 48.4 % of bot-only rounds over 64 seeds.

Once on the laptop, run `node pipeline/perf-run.mjs --env laptop --preset all --baseline` and commit the files it writes.
That gives the frame-time budgets a baseline on real hardware.

## Movement

Click **Start**. On the New game screen, pick **Elimination** (Mode) and **Normal** (Difficulty), set the mouse
sensitivity under **Settings**, then click **Play**.
Tick each box once it behaves as described; anything else is a bug worth noting.

- [ ] **Look around with the mouse.** The view turns smoothly, with no jumps or drift when you stop moving the mouse.
- [ ] **Move with W A S D.** You run at a steady pace and you hear your own footsteps.
- [ ] **Hold Shift and move.** You walk slowly and your footsteps go silent.
- [ ] **Hold Left Alt and run forward.** You sprint, faster than running. Try to shoot while sprinting: nothing
  fires until a moment after you stop.
- [ ] **Press C.** You crouch and move slowly and silently, without holding the key. Press C again and you
  stand up. Crouch again, then press Left Alt or Space: you stand up (the Space press only stands you up).
- [ ] **In Settings (Controls), set Crouch key to Hold.** Now you crouch only while C is held. Set it back to Toggle if
  you prefer that; the game remembers your choice.
- [ ] **Hold Q, then E, beside a wall or crate.** Your view leans left or right around it and tilts a little.
  Up against a wall, the lean stops short so you never see through it.
- [ ] **Press Space.** You do a small hop, not a big jump.
- [ ] **Watch the crosshair while you move.** It opens up when you run or jump and tightens when you stand still
  or crouch. It does not flash wide when you land or step off something low, only when you jump.
- [ ] **Run, then let go of the keys.** The crosshair snaps tight almost as soon as you stop (an "instant lock"),
  instead of easing in. Crouched and still is tightest. Walking with Shift opens it only a little; running opens it a
  lot. Straight after a sprint or a jump it still takes a moment to settle.
- [ ] **Walk into walls, crates and corners.** You slide along them and never get stuck or fall through the floor.

## Shooting and reloads

The rifle holds 60 BBs and the pistol 18, and each comes with 4 magazines per round. Nothing refills until the next round.

- [ ] **Hold left click with the rifle.** It fires a steady stream and the BB count at the bottom right drops.
  The small box next to the rifle's name says **Auto**.
- [ ] **Press B.** You hear a small click and the box says **Semi**: one BB per click, however long you hold.
  Press B again for **Burst**: each click fires three BBs. Press B again to get back to **Auto**. The setting stays
  where you left it in the next round.
- [ ] **Empty the rifle in Burst.** With fewer than three BBs left, the burst fires what's there, clicks once and
  starts a reload.
- [ ] **Press 2, or scroll the mouse wheel.** You switch to the pistol. Each click fires one shot; holding the
  button does not keep firing. Press 1 to switch back.
- [ ] **Shoot at a wall far away.** You can see the BBs fly, take a moment to arrive, and drop at long range.
  The pistol's BBs drop sooner than the rifle's.
- [ ] **Fire about half a magazine, then press R.** A magazine swap plays, a little quicker than in `v0.1-alpha.3`
  (rifle 1.8 s, pistol 1.2 s). The small gauges next to the BB count
  show your spares, and the half-used one goes back into the pouch.
- [ ] **Empty a magazine completely, then pull the trigger.** An empty trigger pull starts a reload by itself.
- [ ] **Press R with a full magazine loaded.** Nothing swaps and the screen tells you why. That's on purpose: no topping up.
- [ ] **Use up every magazine.** When all are empty you can't fire any more that round. The next round starts you full again.

## Optics and aiming down sights

The rifle has no optic of its own any more: it comes with flip-up iron sights, and the red dot is an accessory you fit
on the **Loadout** screen (**Start**, then **Loadout**; between matches only, it is not on the pause menu).

- [ ] **Leave Optic on Iron sights and play.** The rifle has small flip-up sights standing on its rails and no red
  dot. Holding right click does nothing: aiming down sights needs an optic.
- [ ] **On the Loadout screen, pick Red dot for the AEG rifle, then play.** The red dot sits on the rifle, and the iron sights
  fold flat under it.
- [ ] **Hold right click.** The rifle comes up to your eye, the view narrows a little, the crosshair gives way to the
  red dot, and you move at a quiet walk (sprint does nothing while aiming). Let go and it all goes back.
- [ ] **Shoot while aiming.** BBs go where the red dot is. Standing still is still what makes you accurate; aiming
  adds no extra accuracy of its own.
- [ ] **Move the mouse while aiming.** It turns at the **Aiming sensitivity** set in Settings, Controls (×0.80 of your
  mouse sensitivity at first, so the world moves across the screen at the same speed as from the hip). Try other
  values; the game remembers your choice.
- [ ] **Reload or switch to the pistol while aiming.** The sight drops for the reload and comes back up if you are
  still holding right click. The pistol has no optic, so it never aims down sights.
- [ ] **Press Esc during a match.** The pause menu has no Loadout: the optic and hop-up are set between matches
  (Start, then Loadout; or New Game on the result screen before the next match).

## BBs leaving the muzzle

- [ ] **Fire the rifle from the hip, a few single shots and a burst.** Each BB and its short streak start at the tip
  of the barrel and fly out along it towards the crosshair. Nothing streaks up from below the rifle.
- [ ] **Sprint, let go and fire at once, and spray full auto.** The first BBs out of a sprint and a long burst still
  leave the barrel in line; the rifle kicks back and up a little rather than tipping up.
- [ ] **Do the same aiming down the red dot, and with the pistol.** The BBs come out of the muzzle under the sight
  (or the pistol's barrel) and rise into the dot or crosshair.
- [ ] **Switch to the pistol (2).** It leans only slightly to the left, much less than it used to, not dead straight.
  The rifle points straight ahead.

## Loadout: replicas and BBs (M17a)

Start, then Loadout. Each slot (Primary, Secondary) shows its replica; the right side has a **Replica** row (one
replica per slot for now), then the optic, the **BB weight** (0.20, 0.25 or 0.28 g) and the hop-up dial set for it.

- [ ] **The BB weight starts where each replica comes set up:** 0.25 g on the rifle, 0.20 g on the pistol. The line
  under it gives both sides: how fast the BB leaves and reaches 20 m, and the hop-up that gives it the longest reach and how far it then
  stays on target (rifle: 88 m/s, 20 m in 0.30 s, best about 65%, ~39 m).
- [ ] **Pick 0.28 g on the rifle.** It leaves slower (about 84 m/s) and the hop-up line now says it is on target to
  about 35 m: heavy BBs need more hop. Turn the dial up to the 75% the weight line suggests: on target to about 41 m.
- [ ] **Pick 0.20 g on the rifle with the dial at 65%.** The hop-up line warns it's too much (light BBs rise more on
  the same hop). In a match, far shots fly high and float; turn the dial down to about 50% and they fly flat.
- [ ] **Is the choice worth having?** The differences are small on purpose, as at a real site (DECISIONS): 0.28 g
  carries a couple of metres further past Depot's longest sightlines (~34 m), 0.20 g gets to 10–20 m a hundredth of a
  second sooner (by ~30 m they arrive together). On the pistol the gap is bigger (about 31 → 35 m of best reach). If you can't feel
  it on Depot, say so and it can be widened (for example, light BBs scattering more).
- [ ] **Back on New game** the Loadout button lists the weights (e.g. "0.28 g / 0.20 g BBs"), and they are still
  picked after reloading the page. Bots always shoot their replicas' standard BBs.

## Loadout: attachments (M17b)

Start, then Loadout, rifle. Under the hop-up: **Grip** (none, vertical, angled) and **Magazine** (standard, hi-cap,
low-cap), each with a line in numbers; the optic row has a **2× scope**. The pistol has its own Magazine row
(standard, extended); its optic and grip rows say it has no rail. **Skins** is greyed and marked LATER.

- [ ] **2× scope:** hold the right button. The sight comes up a little slower than the red dot, then only a round
  eyepiece with a crosshair and a red centre dot shows (check you can find it against a dark wall), and the view is twice as close. Turning feels the same speed across the
  eyepiece as with the red dot. Is it worth it on Depot's long lanes, and is the blind surround a fair cost?
- [ ] **Vertical grip:** sprint, stop and fire at once. The crosshair closes up sooner than with no grip. Switching to
  the rifle is a touch slower.
- [ ] **Angled grip:** switch to the rifle and raise the sight: both a little quicker. After a sprint the crosshair
  stays wide a moment longer.
- [ ] **Hi-cap:** the HUD shows 120 BBs and one spare. Walk (or crouch-walk) near a bot that faces away: it hears a
  rattle of loose BBs (you hear it too, quieter: is it tolerable over a long walk?) and turns round within about 7 m; with the standard magazine walking stays silent.
- [ ] **Low-cap:** 30 BBs and four spares; the change is quicker, and the left hand reaches the shorter magazine's base. **Pistol extended:** 27 BBs, slower to draw.
- [ ] **Each part shows on the rifle** (simple shapes for now): the scope, the grip under the handguard, the hi-cap's
  winding wheel, the shorter low-cap, the pistol's longer magazine.
- [ ] **Back on New game** the Loadout button lists the parts that differ from stock (e.g. "2× scope · Angled grip ·
  Hi-cap mag"), and they are still picked after reloading the page. Bots keep stock parts.

## Loadout and Armory (M26)

The Loadout (M26b) has replaced the M17 screens above: three square slots (Primary, Secondary, Grenades); click one
for the replicas you own, right-click an equipped replica to customise it. The Armory (M26c, beta) sits next to it.

- [ ] **Click Primary, pick the Gas Pistol.** It moves to Primary and the AEG rifle to Secondary. Grenades is greyed
  (none yet).
- [ ] **Right-click Primary.** Optic, BB weight, hop-up, grip, laser, magazine and power source, each offering only
  owned parts that fit; Skins says LATER. Esc goes back to the slots.
- [ ] **Win a standard match.** The summary lists Field Credits earned (match played, match won, rounds, hits). The
  Armory tile on New game shows the new total. Lose one: it pays less.
- [ ] **Armory: buy a Token, take 1 Shot.** Three assets come out with their rarity; the first copy says New, a repeat
  says Spare. With 10 Tokens, 10 Shots always hold a Rare or better. Scrap all spares pays FC and keeps one of each.
- [ ] **Dev settings → Disable Armory On.** The Armory tile reads Off, greyed, and won't open. Finish a match: no Field
  Credits on the summary and the total is unchanged. Turn it off: the next match pays.
- [ ] **Dev settings → Unlock all gear On.** The Loadout offers every replica and part at every rarity, and the match
  stays out of your records. Fit a Legendary optic, then turn it off: your own picks are back as they were.

## Weapon performance (M29a)

The numbers live in `stats.md` beside `pool.md`. Start, then Loadout; right-click the rifle to customise it.

- [ ] **Gear slots.** Each replica's slot shows a line under its tier, e.g. "0.97 J · 13 BBs/s · 60 BBs" for the
  AEG as it comes and "0.52 J · 7 BBs/s · 18 BBs" for the pistol.
- [ ] **Performance sheet.** Customise shows a Performance panel beside the parts (above them in a narrow window):
  energy, muzzle speed (m/s, and fps on 0.20 g), BB weight, rate of fire, on-target range, time to 20 m, spread,
  recoil, magazines, reload, draw, aim raise. As it comes, nothing is coloured.
- [ ] **It follows you.** Drag the BB weight to 0.28 g and the hop-up about: the energy, speed, range and time change
  as you drag, marked green (better) or red (worse) with a percentage. Fit the vertical grip: Draw goes red. Fit the
  hi-cap: Magazines shows "120 × 2 (240)" without a colour (a trade-off).
- [ ] **Tiers scale.** With Dev settings → Unlock all gear, equip a Legendary AEG Rifle: 1.04 J, 14 BBs/s, spread
  −15 %. A Legendary pistol on Legendary Black Gas: about 0.71 J, recoil +20 %.
- [ ] **Batteries.** Fit the 11.1 V LiPo Battery to the rifle: rate of fire +15 %, energy unchanged; a match with it
  sounds and empties the magazine faster.
- [ ] **Armory.** A Rare or better copy lists what its tier adds (e.g. "+6% energy" on an Epic gas) on its tile and in
  the collection list; Common copies list nothing.
- [ ] **Edit the file.** Change the AEG's `Fire rate (BBs/s)` in `stats.md` to 20 and run `npm run dev`: the sheet
  says 20 BBs/s and the rifle (and the bots' rifles) fire faster. Put it back. A typo (`2O`) shows in the console and
  `npm run test` names its line.

## Barrels, silencer and Hard opponents' kit (M29b)

Turn on Dev settings → Unlock all gear, then Loadout; right-click the rifle to customise it.

- [ ] **Rows.** The rifle has Barrel and Muzzle rows; the pistol's Barrel row says it has a fixed barrel and its
  Muzzle row offers the Silencer.
- [ ] **Tight-Bore Barrel.** Spread −15 % and energy +3 % on the sheet; the first-person rifle looks the same length.
- [ ] **Long Barrel.** Energy +8 %, Draw and Aim raise +15 % (red); the rifle's barrel is visibly longer in first
  person and BBs leave from its new end.
- [ ] **Silencer.** On both replicas: a can on the muzzle, energy −5 %, Draw slower, "Shots heard from" 22 m → 11 m
  (green). In a match the shots sound duller and quieter.
- [ ] **Bots hear less.** In a Normal match with the silenced rifle, fire from about 15 m behind a bot that can't see
  you: it shouldn't turn round (unsilenced it does). On the minimap (Sound cues on too) a silenced bot shows up only
  within half the usual range.
- [ ] **Hard opponents.** Start a Hard match and play a few rounds: opponents' rifles differ (some faster, some with a
  silencer you hear muffled, some longer-ranged). Play Again rolls new kits. Easy and Normal opponents, and your
  teammates on any level, are as before.
- [ ] **Shots.** A ten-Shot can dispense the Tight-Bore Barrel, Long Barrel or Silencer; the Armory lists them under
  Barrels and Muzzle parts.

## Hop-up

Hop-up puts backspin on the BB, and the spin lifts it so it flies flat for longer. Each replica has a dial in the
**Loadout** screen (0–100%; click the replica on the left to see its dial); the line under it says what the
setting does.

- [ ] **Leave both on the factory setting (rifle 65%, pistol 55%) and shoot at a bot or a wall far away (30 m and
  more).** Rifle BBs rise a little (about a hand's width) around 20 m and are still on target at Depot's longest
  sightlines (about 34 m), on target to about 39 m. The pistol's BBs drop sooner, from about 27 m.
- [ ] **Turn the rifle's hop-up right down (0%).** BBs start dropping from about 14 m; far shots land low.
- [ ] **Turn it right up (90–100%).** The BBs climb about half a metre over your aim and float before they fall.
  The line under the slider says so.
- [ ] **Find a setting you like.** The game remembers it. Bots always use the factory setting.

## BB flight and wind (M30)

BBs now fly by real air physics: drag slows them the way air slows a real 6 mm BB, the hop-up's backspin holds them up
until it wears off and the BB slows, and each match has its own light breeze (calm to about 2 m/s, gusting a little)
that pushes BBs, never players. The dust floating in the air (Medium and High quality) drifts with it.

- [ ] **Shoot the rifle at a wall 30 m or more away, on the factory hop.** The BBs take about half a second to get there,
  fly flat and then drop away past about 40 m, slowing visibly at the end.
- [ ] **Look at the dust in the air for a few seconds on Medium or High.** It drifts one way: that's the wind. Start a
  few matches: the strength and direction change from match to match.
- [ ] **Fire a long burst across the wind at 30 m or more.** The BBs curve gently downwind, more and more towards the
  end (in the strongest breeze up to about half a metre at 34 m); at 10 m you can't see it. Aiming a little upwind
  brings them back on. Dev tab › BB paths shows the curve from above.
- [ ] **Shoot with the wind and into it.** Into the wind BBs arrive a touch later and drop a little sooner.
- [ ] **On the practice range** every target out to 60 m can still be hit: from 40 m out aim high (or turn the hop-up up)
  and a little upwind. The readout's miss line shows where the last BB landed.
- [ ] **Bots:** they hit you as often as before at short range and lead you better when you run across their aim at
  range. In a strong breeze their long shots miss downwind as yours do. Say if bots feel too weak or too strong.
- [ ] **Frame rate:** a full-auto firefight on Low feels as smooth as before.

## BB hot path and own ricochets (FA12)

BBs now find walls with the game's own ray test instead of the physics engine's (the same answer, much cheaper), and a
ricochet can come back and hit whoever fired it.

- [ ] **BBs still stop on everything.** On Depot, shoot crates, container sides and ends, wall tops and corners, the
  dock and its steel ramps, a gabion, the toilets: every BB stops or bounces where it meets the surface, never inside or
  through it, and steel and concrete still ricochet as before. Dev tab › BB paths makes it easy to see.
- [ ] **Your own ricochet, ricochets on.** Custom match with "Ricochets count" on: stand 2 m from a container's side
  and fire one shot square at it. The BB comes back and you're hit: the hit feed says you called a hit off yourself,
  tagged "ricochet" (not "friendly"); the scoreboard counts you hit once and no hit for you.
- [ ] **Your own ricochet, ricochets off (the default).** Same shot: the "Ricochet · doesn't count, play on" notice, and you
  play on.
- [ ] **Practice range, 60 m plate:** a level shot on the factory hop lands short (about 53 m); aiming about 3° high (some
  3.5 m above the plate) rings it.
- [ ] **Frame rate:** a long full-auto firefight on Low (Dev tab FPS) is as smooth as before or smoother.

## Bots and rounds

You're on Blue with two bot teammates against three Orange bots. One BB hit puts anyone out, a round lasts up
to 2:30, and the first team to win 5 rounds takes the match.

- [ ] **Hit an Orange bot.** It raises its hand, walks off to the dead zone, and you get a clear sign that you hit it.
- [ ] **Get hit yourself.** You hear a sharp tick, see which way it came from, and your view walks off. You then
  watch a teammate; left click switches to the next one.
- [ ] **Watch the bots for a few rounds.** They patrol, take cover, crouch behind crates and lean round corners to
  peek. Note any bot that stands stuck or walks into a wall.
- [ ] **Run near a bot, then walk past one with Shift.** Running gets you noticed by sound; walking quietly lets you sneak closer.
- [ ] **Shoot a teammate (carefully).** Friendly fire counts, so they go out too. That's on purpose.
- [ ] **Finish a round.** When one team is all out, a banner shows who won, the score updates and the next round
  starts by itself a few seconds later.
- [ ] **Play a whole match.** At 5 wins a result screen says "You win!" or "You lose" with the score.
  **Play again** starts a fresh match.
- [ ] **Try Attack / Defend.** Press Esc, pick **Attack / Defend**, and play the next match. Stand inside the
  painted ring at the flagpole for 5 seconds to raise the flag. The strip under the score shows how far up it
  is, and a marker shows where the pole is. Sides swap after round 4.
- [ ] **Try Easy and Hard.** Bots on Easy should feel clearly weaker than on Hard. A change made mid-match starts
  with the next round, and the screen says so.

## The Depot (M11 rework)

The map follows the layout sketch approved on 2026-10-03. Attackers start in the west yard and the defenders in
the north-east corner. There's one flagpole, in the walled loading bay (the Bay) on the defenders' side. Three
ways lead there: **Dock Road** (north, along a raised loading dock), **Container Alley** (the middle, through the
Main Gate) and the **Office** (south, close quarters, with a back door near the pole). In both modes the teams
swap ends after round 4.

- [ ] **Walk all three lanes from the west yard to the pole.** Each one gets you there without dead ends, and
  you can tell which lane you're in.
- [ ] **Walk up and down both dock ramps, then walk along the dock's open edge.** No bumps or hops on the ramps.
  You can step off the edge on purpose (it's a 1.2 m drop), but walking up to it shouldn't push you off. Turn
  round halfway down a ramp and run back: the crosshair shouldn't jump wide.
- [ ] **Jump against crates, the ramp kerbs and the dock edge from the road.** You never land on top of them or
  hang on an edge, and stepping off the dock is one clean drop.
- [ ] **Stand on the dock and look around.** It's a good spot to watch Dock Road and the Bay, but from most of
  it you can't see down into Container Alley.
- [ ] **Look for the other team's spawn from yours** (standing and crouched). You shouldn't be able to see it.
- [ ] **Shoot through a barricade port and a building window.** BBs go through the openings; the walls stop them.
- [ ] **Play Attack / Defend for a full match.** You attack first (from the west). Note whether attacking or
  defending feels easier, and which lane the bots pick. In bot-only tests the attackers win about half the rounds.
- [ ] **Play Elimination across half-time.** You start in the east (by the Bay). The banner says ends swap
  after round 4, and round 5 starts you in the west yard. In bot-only tests the east end wins a little more often (the west about 48%); say if either end feels unfair.
- [ ] **Watch where hit players walk.** Each end has its own dead zone, away from the fighting.

### Depot props (M25b)

Most two-high crate stacks are now single site props on the same spots: portable toilets by the west yard, pallet
racks in the staging yard, car park and Bay, gabion barriers on the road and in the crate yard, wrapped pallet loads,
IBC tanks, sandbags, two generators and a skip. Four stacks are now waist high. Two crate stacks are left.

- [ ] **Walk all three lanes and look around.** It should feel less cluttered and less tall than before, and every
  object should read as what it is (compare with the concept sketch, `concepts/depot-rework-plan-after-v2.png`).
- [ ] **Hide behind a rack, a gabion barrier and a portable toilet.** Each is full cover: nobody sees or shoots through it.
- [ ] **Crouch behind an IBC tank, the generator and the sandbags.** Crouched you're hidden; standing you can shoot over.
- [ ] **Shoot sandbags, a gabion barrier and a skip with ricochets on.** BBs bounce off the steel (skip, racks, IBC
  cages, generators) and sink into the sandbags and gabions.
- [ ] **Play a few rounds of each mode.** Do the lanes still feel like the same map, with no new long sightline that
  dominates?

## Menus (M15, M15b)

- [ ] **Load the game.** A title screen says **AIRSOFT** in the middle on a plain dark background (no field behind
  it: no map is loaded yet), and **Start** at the bottom left. Nothing else.
- [ ] **Click Start.** The New game screen has five big buttons: **Map**, **Mode**, **Difficulty**, **Loadout** and
  **Settings**, each showing what is picked now, the rules of the picked mode under them, **Back** (to the title)
  and **Play**. No controls list here any more: the keys are under Settings, Key Bindings.
- [ ] **Click Map.** A pop-up lists Depot (picked, the only map for now). Esc or × closes it.
- [ ] **Click Mode, then Attack and Defend.** A pop-up lists both modes with a line each; picking one closes it, and
  the Mode button and the rules underneath change. Open it again and press Esc or ×: it closes with no change.
  Do the same with **Difficulty** (Easy, Normal, Hard).
- [ ] **Click Loadout.** The AEG rifle (primary) and gas pistol (secondary) are on the left, with "More replicas
  later" under each. On the right: the replica in that slot, the optic, BB weight, hop-up dial, grip and magazine for
  the rifle, then power and skins greyed out and marked LATER. Click the pistol: its own BB weight, hop-up dial and
  magazine, and its gas type and skins marked LATER. Back returns to New game, and the Loadout button shows your
  optic, any parts that differ from stock, BB weights and dials.
- [ ] **Click Settings.** Tabs on the left: **Controls** (see Comfort and controls below), **Key Bindings**,
  **Graphics**, **Crosshair**, **HUD** (M24), **Audio** (volumes, see Sound below) and **Accessibility**, with a
  **Dev settings** box under them (M24). Back returns to New game.
- [ ] **Graphics.** A **Field of view** slider at 90°, and the **Quality** picker (High; see the M14 section). No
  Brightness.
- [ ] **Field of view in a match.** Play, press Esc, Settings, Graphics: drag the slider to 120°. Back and Resume:
  you see more at the sides. Aim down the red dot: it still zooms in. Set it to 80°: a narrower view. Reload the
  page: the slider keeps your setting.
- [ ] **Headings are in capitals** (NEW GAME, LOADOUT, MODE, HOP-UP …); descriptions are in normal writing.
- [ ] **Click Play.** The field loads (a moment's pause at most) and the match starts as before.

## Sound (M13)

Headphones help: direction (in front, behind, above) comes through best on them.

- [ ] **Fire the rifle on auto, then on single.** Each shot is a gearbox cycle: a whirr, a plastic slap and a puff
  of air, with more body than before but still a toy, never a gunshot. A burst starts with the motor winding up and
  ends with it coasting down a moment after you let go; single shots each get a short wind-down.
- [ ] **Fire the pistol.** A sharp pop of gas, a short hiss and the slide clacking back and home: clearly a different
  replica from the rifle with your eyes shut.
- [ ] **Empty a magazine.** The empty rifle still whirrs and slaps (an AEG cycles with no BBs); the empty pistol only
  clicks. Reloads sound different too: the rifle's plastic mag, the pistol's heavier metal one.
- [ ] **Shoot a container, a crate and a wall.** A ringing ping off the steel, a hollow knock on the wood, a dry tick
  off concrete.
- [ ] **Walk up a dock ramp, then along the dock.** Steps clank on the steel ramp and scuff on concrete. Sprint and
  land a jump: louder, with kit rattling.
- [ ] **Crouch, stand and lean (Q / E).** A soft rustle of clothing and kit each time a move starts (quieter for you
  than for a bot doing it near you).
- [ ] **Listen for bots.** Close your eyes when you hear one: you should be able to point at it, including behind
  you. A bot behind a container or wall sounds duller and quieter than one in the open; one behind low cover is
  in between. Steps further than about 22 m aren't played, as before.
- [ ] **Settings → Audio.** Three sliders: Master, Effects (the replicas, steps and impacts) and Interface (hit tick,
  hit marker and whistle). Each changes the sound at once (from the pause menu, on Resume), and they're kept after a
  reload. Effects at 0 leaves only the interface cues.
- [ ] **Anything that sounds like a firearm, harsh, or too loud next to the rest?** Say which sound.

## Match info (M19)

- [ ] **Hit feed.** Whenever someone is hit, a line appears in the top-right corner, newest on top: "Orange 2 called
  HIT · Blue 3" (who called the hit, then whose BB it was), each name in its team's colour. Lines about you say "You"
  and stand out a little. A teammate hit by a teammate (or by you) says FRIENDLY. Lines fade after about six seconds;
  a new round clears them.
- [ ] **Teammate markers.** Your two teammates each have a small name tag with a blue arrow over their head, also
  through walls, so you know where they are before you fire. When one is hit the tag turns grey and says "hit"; once
  they reach the dead zone it goes. Enemies never get one. Is it helpful, or too much on screen?
- [ ] **Hold Tab.** A scoreboard shows the match so far: for every player hits, times hit, friendly hits, BBs fired,
  accuracy and time alive, your team first with its rounds won, your line highlighted, players hit this round greyed.
  Let go and it's gone. Tab can be rebound under Settings → Key Bindings ("Scoreboard (hold)").
- [ ] **End a round.** For the few seconds before the next one, the same table shows that round's numbers on its own.
- [ ] **Finish a match.** A **Match summary** screen comes first: the result, everyone's numbers for the whole match,
  and **Your records** (wins and losses per difficulty and mode, the one you just played in orange, best accuracy and
  wins in a row, with NEW RECORD on a best you just beat). **Continue** goes to the result screen, whose new **Match
  summary** button brings it back.
- [ ] **Records are kept.** Reload the page and finish another match: the counts carry on. Quitting a match part-way
  counts as nothing. Best accuracy only counts matches where you fired at least 30 BBs.
- [ ] **Settings → Crosshair.** Two previews (standing still, and opened up as when moving), then Shape (Cross and dot,
  Cross, Circle, Dot only), Size, Thickness, Gap, Colour (no blue or orange: those are the teams') and Outline. The
  previews change as you do. In a match the crosshair looks the same and still opens as you move (Dot only stays a
  dot). Change it from the pause menu: it applies on Resume. It's kept after a reload. The default is the crosshair
  you had before.

## Comfort and controls (M18a)

- [ ] **Settings, Controls.** Under the mouse sensitivity: **Turn distance (cm/360)** with a cm box and a DPI box
  (800 to start), and a line with the same sensitivity for CS2 and Valorant. Drag the slider: the cm figure and the
  CS2 / Valorant numbers follow. Type your mouse's DPI and press Enter: the cm figure changes, the slider doesn't.
- [ ] **Match another shooter.** Type the cm/360 you use elsewhere and press Enter: the slider jumps to match, and in a
  match one sweep of that many centimetres turns you a full circle. Reload the page: both boxes keep their values.
- [ ] **Invert mouse.** Turn it On: mouse forward looks down. Off again: back to normal.
- [ ] **Aim button: Toggle.** With the red dot fitted, click right once: the sight stays up without holding. Click
  again: it drops. Raise it and press sprint: it drops and you sprint. Raise it and switch to the pistol: it drops,
  and switching back to the rifle doesn't raise it by itself. On Hold (the default) it works as before.
- [ ] **Sprint key: Toggle.** Hold W and tap Left Alt: you keep sprinting with Alt let go. Let go of W: the sprint
  ends, and pressing W again just runs. Sprint again, then crouch, aim, walk or click fire: each one ends the sprint.
- [ ] **Key Bindings: mouse buttons.** **Fire** and **Aim** are at the top of the list (Left mouse, Right mouse). Click
  the Reload box, then click the same box with a side button (Mouse 4 or 5): Reload now shows **Mouse 4**, and the
  browser does not go back a page. In a match the side button reloads, and pressing it never leaves the game. Click
  the Aim box and click it with the left button: Aim becomes Left mouse and Fire takes Right mouse (a swap). **Reset
  All** puts them back.
- [ ] **Spectating hint.** Get hit: the label reads "Spectating … · Left mouse for next", or names your fire key.
- [ ] **Settings, Accessibility: Reduced motion.** Turn it On, then play: the replica no longer bobs as you walk or
  sways behind turns, each shot kicks it half as much, and leaning tips the view only slightly. The view still climbs a
  little in full auto (that shows where the BBs go). If your computer's own "reduce motion" setting is on, the game
  starts with it On until you pick.

## Custom matches (M20)

- [ ] **New game, Match.** A sixth button, **Match**, reads "3V3 · FIRST TO 5" with "2:30 rounds. Friendly fire on;
  ricochets don't count." Click it: a pop-up with **Rounds to win** (3, 5, 7, 10), **Round time** (a slider, 1:30 to
  5:00), **Team size** (1v1, 2v2, 3v3), **Friendly fire** and **Ricochets count**. Each change shows on the button and
  in the rules under the buttons straight away, and is kept after a reload. Esc or × closes it.
- [ ] **Play a 1v1 and a 2v2.** You start with no teammates (or one), against one bot (or two); the scoreboard (Tab)
  and the pips at the top have that many players. Do the rounds feel too long or too quick on Depot at that size?
- [ ] **First to 3.** The score line on the pause menu says "first to 3", teams swap ends after round 2, and the match
  ends at 3 wins. Try a 1:30 round time: the clock starts at 1:30.
- [ ] **Difficulty: Opponents and Teammates.** The pop-up has a row for each. Put Opponents on Easy and Teammates on
  Hard: the button reads "EASY / HARD", and your teammates should win their fights clearly more often than the
  enemy. The rules under the buttons now end with "This match won't go into your records". Finish
  that match: the summary says custom rules aren't in your records (only the standard 3v3, first to 5,
  with both teams at one difficulty counts), and marks no cell.
- [ ] **Friendly fire off.** Shoot a teammate in the back: nothing happens (the BB goes past). Your bot teammates also
  stop holding fire when you're in their line.
- [ ] **Ricochets.** Fire at a concrete wall or a container at an angle: BBs glance off and fly on, slower (watch with
  ] for BB paths). Into a crate: they stop. When a bounced BB hits you, you hear a knock and see "Ricochet · doesn't
  count, play on". A bounced BB of yours that reaches a bot shows a small grey puff (not the bigger hit puff) and "Your
  BB ricocheted · doesn't count". With **Ricochets count** on, the same BB knocks you out, and the hit feed line says
  RICOCHET. Is the ricochet notice useful, or does it come up too often in a 3v3?

## Accessibility and browser basics (M18b)

- [ ] **Team colours.** Settings → Accessibility → **Team colours: High contrast**. The swatches show light blue and
  dark orange. Start a match: the figures' tape and armbands, the flag, your own armband, the scoreboard, hit feed and
  teammate markers all use them. Standard puts them back from the next match.
- [ ] **Spare magazines.** Fire most of a magazine and reload a few times: a nearly empty spare is striped as well as
  orange, and the one a reload takes has a yellow caret under it as well as the outline.
- [ ] **On-screen sound cues.** Accessibility → **On-screen sound cues: On**. In a match a marker round the crosshair
  points to enemy footsteps (two dots), shots (an arrowhead) and hit calls (a HIT tag), fainter further away; turn
  towards one and it moves to the top. Your own steps and shots and your teammates' steps show nothing. Off by default.
- [ ] **Tab away.** Mid-round, switch to another tab (Ctrl+Tab) and back: the match is paused on the pause menu.
- [ ] **Fullscreen.** Settings → Graphics → **Enter Fullscreen**; the button then reads Exit Fullscreen. In a match press
  **F10**: fullscreen on and off. Esc leaves fullscreen (and pauses). Rebind it under Key Bindings.
- [ ] **Hardware acceleration.** Turn off the browser's graphics acceleration and restart it: the title screen warns
  that the game will run slowly and says where to turn it back on. With it on, no warning.

## Practice range (M21)

- [ ] **Title screen, Practice Range.** You're alone behind a painted line on a long concrete range, facing three
  lanes of targets: white steel plates on the left, standing plywood figures in the middle, crouched ones on the
  right. Boards on both walls and lines on the floor say 10 m to 60 m. No whistle, no clock, no score.
- [ ] **Shoot each kind.** A plate rings (you should still hear it at 60 m) and swings back, away from you; a figure falls back and
  stands up again after a second and a half. The readout at the top says "Last BB: 31 m · hit Steel 30 m", or
  "· miss" with where it landed. Can you tell from it how far the rifle carries with the hop-up as it is?
- [ ] **Lob one.** Aim well above the backstop and fire: the readout says the BB flew out of the range. Shoot the post
  under a plate: the BB stops on it and reads as a miss at that distance (the plate doesn't ring).
- [ ] **Reload.** Empty a magazine and reload: the spare gauges never run down.
- [ ] **Esc, Loadout.** The pause menu has a Loadout button. Change the BB weight or the hop-up, go Back and Resume:
  you're where you stood, with the new setup (the HUD's replica name and the readout follow it). Then Quit
  and start a normal match: it plays as before.
- [ ] **Walk downrange.** Nothing stops you walking among the targets; BBs fired from there still hit them.

## Minimap and order wheel (M23)

- [ ] **Minimap.** Start a match: a round map top left, the way you look always up, you the white arrow in the middle.
  Your teammates are blue dots wherever they are (on the rim when off the map's edge), grey once hit.
- [ ] **Hearing the other team.** Stand still and listen: when an opponent's footsteps or shots reach you, an orange
  patch shows roughly where (dashed for steps, with a dot for a shot), fading after a few seconds. Far-off sounds give a
  wider patch. Nothing shows for opponents you can't hear, and a patch goes once that player is hit.
- [ ] **Order wheel (hover).** Hold **Z**: four orders round the crosshair. Move the mouse: the view and replica stay
  still, a small pointer moves and lights the order it's on. Let go of Z on Follow Me: they follow (the bottom-left
  line says so). Hold Z and let go without moving: nothing changes. Team Plan sends them back to the plan.
- [ ] **Walk while choosing.** Hold Z and W together: you keep walking. Hold the trigger, then Z: firing stops, and
  after the wheel closes it needs a new pull.
- [ ] **Order wheel (click).** Settings → Controls → Order wheel → Click. Now letting go of Z gives nothing; point and
  click instead. No BB is fired by that click.
- [ ] **Keys.** F is Follow me now (X and V as before); Key bindings lists "Squad: order wheel (hold)".

## Squad orders and hearing (M22)

- [ ] **Follow me (F; Z until the order wheel, M23).** Start a match and press **F**: a radio double-click answers and the HUD's bottom-left line
  reads SQUAD · FOLLOW ME. Walk round Depot: your two teammates keep up a few metres behind you, either side, sprinting
  to catch up if left behind; stop and one looks back the way you came, the other to a side. Walk (Shift) or crouch
  and they walk too. They still fight anyone they see, then come back. Press **F** again: "Back to the team plan".
- [ ] **Hold here (X).** Look at a spot (a doorway, a crate's corner) and press **X**: both go there side by side and
  watch the way you looked, and stay when you walk off. A diamond marker with the distance shows the held spot (none when each holds where it stands).
  Look somewhere else and press X: the hold moves; at the sky: each holds where it stands; press X again on the same
  spot (or at the sky again): back to the team plan.
- [ ] **Regroup (V).** With teammates far off, press **V**: they sprint back to you, then follow (the line changes to
  FOLLOW ME once both are back). Get hit: the order ends and they play their plan; order keys then say "Orders wait for
  the next round". A new round starts with no order.
- [ ] **Rebind.** Settings → Controls → Key Bindings has the three squad keys.
- [ ] **Hearing through walls.** Sneak up to Orange behind a wall (running, not walking): they should notice you
  later than in the open. Do bots still seem to hear you through walls like a wallhack, or now too little?

## Tutorial (M16)

- [ ] **Title screen.** A **Tutorial** button sits next to Start and Practice Range, tagged "New? Start here" (until
  you've finished it once).
- [ ] **Play it through.** The coach at the top says "Tutorial · 1 of 10 · Look around" and moves on when you've done
  each thing: look around, walk to the line, ring a plate, knock down a figure at 50 m or more (past the stock hop-up's reach; the coach shows where your last BB landed), reload, aim (or, with
  iron sights, a pointer to the Loadout's optics), crouch, lean, switch replica and hit something, then the "one hit"
  card. Each finished step shows a green tick for a moment. Did any step feel stuck or unclear?
- [ ] **Keys.** Rebind a key (e.g. reload) in Settings, start the Tutorial again: the coach shows your key.
- [ ] **Esc mid-tutorial.** The pause menu says which step you're on. Change the loadout and come back: same step.
- [ ] **After the last step** the coach goes and the range readout appears; the "New? Start here" tag is gone from the
  title screen, also after reloading the page.

## Art, VFX and lighting (M14)

- [ ] **Daylight.** Start a match on Depot: a sunny day, a blue sky paler towards the horizon and warmer towards the
  sun, trees beyond the walls, short soft shadows. Nothing gloomy; shaded sides of containers stay readable.
- [ ] **Surfaces.** Walk round: the concrete has joints, stains and hairline cracks; walls are painted blocks with a
  concrete coping on top; containers have a darker steel frame and locking bars on one end; crates on the ground
  stand on pallets; the dock ramps are tread plate. Walls and props darken a little where they meet the ground.
  Nothing you can see sticks out further than what you collide with: brush along a container and a crate.
- [ ] **Figures.** Look at your teammates and the opponents up close: players at a weekend game, not soldiers. Hoodies
  and tees over jeans or work trousers, a chest rig or a plate carrier, a cap, a helmet or bare hair; goggles on
  everyone, most faces showing (two wear a mesh mask). No two players in a match look the same. The team colour is
  tape: a broad band round the middle, the shoulders, both arms, the headgear and both thighs. At 30 m, on **Low**
  too, can you tell the teams apart at a glance, from the front, the side and the back? Try High contrast colours too.
- [ ] **Hit call.** Hit a bot: the "HIT!" sign, the hand up in a glove, the rifle hanging; still clear at range.
- [ ] **Replicas.** The held rifle and pistol look like moulded toy plastic with a soft sheen, not metal guns. The
  pistol's glove fingers look slimmer than before.
- [ ] **Gas puffs.** Switch to the pistol and fire: a small puff of gas leaves the muzzle, and a smaller one the
  ejection port, on each shot. The rifle shows none. No flash, no casings.
- [ ] **Impact dust.** Shoot concrete, a crate and a container: pale dust off concrete, tan crumbs off wood, a small
  grey puff off steel. Soft round puffs, never sparks.
- [ ] **Dust in the air.** On High, a few specks drift slowly round you in the sun. None ever turns into a big blurry
  blob next to the gun or your face. Settings → Accessibility → Reduced motion: On, and they're gone.
- [ ] **Quality.** Settings → Graphics → **Quality**: Low, Medium, High (High at first). Mid-match from the pause menu,
  pick Low: shadows, surface relief, dust and the replica's sheen go at once; pick High: they come back. It is saved
  for the next visit. Low turns off edge smoothing only after a reload. Does Low run noticeably smoother on a laptop?
- [ ] **Frame rate.** Open the debug overlay (`` ` `` or F3) on each preset: note the frame rate and draw calls on your
  machine, in the open yard and in the office.

## Menus and settings polish (M24)

- [ ] **Labels.** Title: Start, Tutorial, **Practice Range**. Pause: Resume, Settings, **Quit**, with no note under
  them. Result: Play Again, **New Game**, **Summary**, **Quit**. Settings has no "Changes save as you make them." line.
- [ ] **Version.** The title screen's bottom-right corner names this build (`v0.1-alpha.3+N · commit` on `main`, just
  the tag on a release download); hover it for how many commits after the release it is.
- [ ] **Field of view** starts at 90° (unless you'd moved the slider before: then it keeps yours). New game's Map tile
  says "An abandoned warehouse yard."
- [ ] **Sound cues.** Settings → Accessibility, cues On: set **Sound cue size** to 200% and the colour to Yellow. In a
  match the markers round the crosshair are big and yellow, and a HIT tag never sits on top of a shot arrow.
- [ ] **Scoreboard size.** Settings → HUD: the scoreboard is bigger than before at 130%. Try 200% in a window about
  1366 wide: it stops growing where the hit feed needs room, and when you're hit, HIT! and the OUT tag stay readable.
- [ ] **Hit feed Keep.** Settings → HUD → Hit feed **Keep**: play three rounds; the last 10 hits stay up through every
  round, and Play Again starts with none. Switch back to Fade mid-match: the lines fade over the next few seconds.
- [ ] **Dev settings.** Tick **Dev settings** under the tabs: a Dev tab opens. Debug info On shows the panel in the
  match; BB paths draws the BBs' flight; Game speed at 25% and 200% slows and speeds the round (mouse look stays
  normal); Bottomless magazines never empties; Ghost lets BBs pass through you. With Ghost on, finish a match: the
  summary says Dev settings kept it out of your records. Untick the box and Play Again: everything is back to normal
  and that match counts. Disable Armory and Unlock all gear: see "Loadout and Armory (M26)".

## Save (M31)

Settings → **Save**, the tab before Dev. Nothing to press for saving itself: everything saves as it changes.

- [ ] **Saved automatically.** Change the field of view, open the Save tab: "Last saved just now". Reload the page:
  the setting, your Loadout, Armory items, FC and records are all as you left them.
- [ ] **Download.** Press Download: `airsoft-save-<today>.json` lands in your Downloads folder. Open it in a text
  editor: readable, with the game, version, date, a summary (FC, Tokens, items, matches) and the stores. The tab now
  says "Last downloaded just now".
- [ ] **Load in another browser.** Open the game in a second browser (or a private window), Settings → Save → Load
  file, pick the download (or drag it onto the tab). The pop-up shows both saves side by side; Replace reloads the
  game with your settings, Loadout, Armory and records. Undo on the Save tab brings back what was there.
- [ ] **Clear and restore.** Clear the site's data (browser settings, or F12 → Application → Clear site data), reload:
  a fresh game. Load your file: everything is back.
- [ ] **Edited file.** Change the `fc` number in a downloaded file and load it: the pop-up warns the file was changed
  or damaged and the button reads **Load anyway**. Cancel changes nothing.
- [ ] **Not a save.** Load any other JSON or text file: "That file isn't an Airsoft save", nothing changes.
- [ ] **Mid-match.** Pause a match, Settings → Save: Download works, Load, Restore, Undo and Delete are greyed with
  "Leave the match to load a save."
- [ ] **Restore points.** Open the game on two different days: the Save tab lists one restore point per day (three at
  most). Restore one: same side-by-side pop-up, and Undo works after it.
- [ ] **Delete.** Delete save → the pop-up offers Download first; Delete reloads a fresh game (tutorial tagged
  "New? Start here" again). Undo on the Save tab brings it all back.
- [ ] **Two tabs.** Open the game in a second tab: it shows "Airsoft is open in another tab" and doesn't start. Play
  here: that tab loads the game and the first one shows the notice instead. Earn FC in one, switch: nothing is lost.
- [ ] **Protect.** Press Protect: Chrome and Edge answer straight away (often "said no for now" on a site you rarely
  visit); Firefox asks with its own prompt. Once allowed, the button reads Protected.
- [ ] **Firefox and Edge** (the automated tests run Chromium only): do Download, Load (button and drag and drop), the
  two-tab notice and Protect once in each. Firefox: the download prompt or Downloads list shows the `.json` file.
## Graphics presets and Custom (FA2)

- [ ] **First start.** Clear the site's data (or use a private window) and load the game. On a laptop with Intel or AMD
  integrated graphics, Settings → Graphics shows **Medium**; on a desktop with an NVIDIA or AMD RX card, **High**. Press
  `` ` `` in a match: the debug panel's quality line ends with "(auto)".
- [ ] **The ladder.** In a match, switch Low → Medium → High and back. Low: softer picture (80 % resolution), no
  shadows, plain surfaces, jagged edges. Medium: shadows, players darker inside a container's shade, relief, smooth
  edges. High: sharper floor textures up close and into the distance, finer shadow edges, the replica's sheen, dust.
  Each switch applies at once with at most a short pause (edge smoothing makes a new graphics context), and the game
  keeps the mouse captured after Resume.
- [ ] **Custom.** Pick Medium, then set Shadows Off: the picker jumps to **Custom**. Set it back On: **Medium** again.
  Pick Custom, move Render scale to 60 %: the picture softens at once; the HUD and menus stay sharp. Reload the page:
  Custom and 60 % are still picked. Each row's help ends with what it costs.
- [ ] **Edge smoothing in Firefox on Linux.** Set Edge smoothing On: if the line under it says "Not available in this
  browser", the game draws without it (that browser refuses multisampling), as the debug panel's antialias line says.
- [ ] **Frame-rate limit.** On a 120 Hz or faster screen set it to 60: Show FPS reads about 60, the laptop runs cooler;
  the game plays the same (movement and BBs at the same speed). Off returns to the screen's rate.
- [ ] **Show FPS.** On: a small "NN FPS · N.N ms" counter in the top-left corner while you play; Off hides it.
- [ ] **Automatic step-down.** Only with nothing saved (clear the site's data) on a machine that struggles: after a few
  seconds of slow frames, at the end of the round, the HUD says "Graphics set to Low to keep the game smooth" and the
  picker shows Low. It is not saved: a reload starts on the GPU's preset again. It never happens once you pick a preset.
- [ ] **Debug panel.** `` ` `` in a match shows "frame ms (sim / draw / GPU)" (GPU is "n/a" in Firefox) and the
  antialias line ("on asked, on given (4 samples)" on Chrome).

## Render cost fixes (FA3)

- [ ] **Shadows near you on High.** On High, walk Depot: rails, container posts, the IBC cage bars and players' arms
  throw crisp shadows close by. Walk and turn slowly: shadow edges stay still (no crawling or shimmer). About 25 m ahead
  the shadows stop: look down the long sightlines for a hard line on the floor where they end, and say if it bothers
  you (Custom → Shadow range → Whole field keeps them everywhere, softer). No dark speckle (acne) on the floor or
  walls, and no shadow floating off a wall's foot.
- [ ] **The sky.** On every preset the sky looks as before: a pale haze at the horizon, blue above, warm towards the
  sun; no sky colour showing through wall edges or corners (edge smoothing on).
- [ ] **The dock.** The raised dock and its ramps throw a shadow on the yard on Medium and High.
- [ ] **BB streaks.** Fire across the field: each BB's streak reads as a thin bright line at 20–30 m, the same
  thickness on a high-DPI laptop as on a desktop monitor, and fades towards its tail; your own shots still leave the
  muzzle in line with the barrel.
- [ ] **Hands.** Look at the gloved hands on the rifle and the pistol: fingers and thumb look as round as before.
- [ ] **First Play.** From the title screen, wait a couple of seconds, then Play: the match starts with no longer
  hitch than before (the surface textures are made while the title screen waits).
- [ ] **Sheen.** On High the held replica has its soft reflections from the first match; switch to Low (none) and back
  to High: they return.
- [ ] **Dust on high-DPI.** On High with dust, near motes look the same size on a 150 % or 200 % scaled screen as on a
  100 % one.
- [ ] **The laptop baseline.** Once, on the target laptop (pipeline/README.md, "The laptop run"):
  `node pipeline/perf-run.mjs --env laptop --preset all --baseline`, then commit `pipeline/baseline/laptop*.json`.

## Cyber Pistol (M32)

The owner's chase replica: Legendary only, from the Armory on a 1 in 400 chance per item. To try it straight away,
tick Settings → Dev settings → **Unlock all gear**.

- [ ] **Equip it.** Loadout → Primary or Secondary: the Cyber Pistol is there at Legendary only (no Common or Rare
  copy). It goes in either slot.
- [ ] **Its look.** In your hands it is its own chunky pistol: a stepped mint slide with a pink stripe and three
  vents, a black frame with a short pink-toothed rail and a square trigger guard, mint grip panels and a long magazine
  with a wide pink base plate. The same colours on either team; the Orange tips setting still paints its muzzle. On
  Graphics High (Replica detail High) it gains rear ridges, a pink charge light and the moulded speckle; Low draws the
  plain shape. Does it read as rare and special?
- [ ] **Customise.** Right-click it: Power Source reads **Built-in battery**, Magazine **Its own, 50 BBs**, and Optic,
  Grip, Laser, Barrel and Muzzle are greyed out. BB weight and hop-up still turn. The Performance sheet shows 1.00 J,
  14 BBs/s, a 1.1 s reload; the summary line reads Electric · Semi, Burst, Auto · 50 BBs a magazine.
- [ ] **Shoot it on the range.** It starts on Semi; the selector steps Burst and Auto. Even on Auto the sight barely
  climbs. Out of the box BBs stay on target to about 33 m (the AEG about 39 m, the Gas Pistol about 27 m).
- [ ] **Its sound.** A quiet electronic chirp and a soft pop, with no motor whine; an empty trigger blips, and a reload
  ends in a two-note chime. Does it feel futuristic but still a toy?
- [ ] **Leave the AEG at home.** Equip the Cyber Pistol and the Gas Pistol, play a match on Normal: the bots' AEG shots
  still sound (they used to need your AEG).
- [ ] **The Armory.** The left column has a **Chase** line: "the Cyber Pistol, Legendary only … 0.25% … about 1 in
  400". In your collection its row has one pip, Legendary; the other tiers are dashed and empty. Getting one for real
  takes a long while (about 130 Shots on average); when it drops, its tile glows and the reveal line starts "Chase
  item: Cyber Pistol!".
- [ ] **Bots with it.** With Unlock all gear on (or one owned), play matches on **Hard**: about 1 match in 20, one
  opponent fights with it on Auto (its quiet pop, its 50-BB magazines). Never on Easy or Normal, never a teammate.
  The figure still shows a plain pistol until the figures show replicas properly.

## Pause, menus and tabbing away

- [ ] **Press Esc mid-round.** Everything freezes, the mouse is freed, and the pause menu shows the round and score
  with **Resume**, **Settings** and **Quit** on a solid background (the match doesn't show
  through). Resume puts you back exactly where you were.
- [ ] **Change keys.** In the pause menu click **Settings**, then **Key Bindings**, click an action and press a new
  key. **Back** returns to the pause menu; back in the game the new key works. **Reset All** puts
  everything back.
- [ ] **Change the mouse sensitivity** (Settings, Controls) from the pause menu. Mouse look feels faster or slower
  straight away, and the setting is still there after you reload the page.
- [ ] **Quit.** The title screen comes back with nothing behind it. Start, change the mode or
  difficulty, then Play: a fresh match from round 1, 0–0, in what you picked. Do this a few times: it loads just as
  quickly each time (nothing piles up).
- [ ] **Win or lose a match.** The result screen shows MATCH OVER, YOU WIN! (or YOU LOSE) and the score, with
  **Play Again** (same setup), **New Game** (back to New game), **Summary** and **Quit**.
- [ ] **Switch to another browser tab, then come back.** The game pauses by itself and nothing happened while you
  were away: no surprise hits, the round clock didn't run.
- [ ] **Alt+Tab to another program, then come back.** Same as above: paused and frozen until you click to resume.
- [ ] **Alt+Tab away while running forward, then come back.** When you resume you're standing still, not stuck
  running on your own.
- [ ] **Press ` or F3.** A box shows the frame rate and the seed. Around 60 is smooth (more on a fast screen);
  well below that, note your computer and browser.

## Fixed in the code bug pass (2026-10-02)

Quick checks that these stay fixed:

- [ ] **The first round of a fresh page load** starts with the referee's two short whistle blasts.
- [ ] **Hit a bot, then press Esc and resume.** No hit marker or white flash appears again on resume (same after
  **Play again**).
- [ ] **Attack / Defend: press Esc mid-round.** The pole marker is not visible through the pause screen.
- [ ] **At the start of each round** the replica in your hands stays still; it doesn't swing in from the side.
- [ ] **Watch the dead zone after two teammates are out.** They stand on separate spots, not inside each other.
- [ ] **Empty the AEG with the trigger held, press 2 then 1 while still holding.** It clicks dry and starts a reload.
- [ ] **Watch bots fighting near door frames.** They shouldn't fire into the frame right beside them, or dive for
  cover after their own BB hits the wall next to them.

## Bot spacing, cover, behaviour and difficulty (FA4)

Play Elimination on Depot at Normal, then a round each on Easy and Hard, and one Attack / Defend match. Spectate
(after you're out) to watch bots that can't see you.

- [ ] **Two bots on one lane** hold side by side at a lane point, about a metre apart, never inside each other;
  bots walking past each other bend round instead of passing through.
- [ ] **Bots holding a lane point** crouch after a moment where crouched they can still see ahead, and slowly sweep
  their view left and right; some (more on Hard, fewer on Easy) step into crouch cover by the point first.
- [ ] **A bot waiting to run for cover** doesn't bob down for a few frames before it runs.
- [ ] **Shoot near a bot from far away** (past 22 m, unseen): it ducks and comes looking for you, or takes cover.
- [ ] **A bot that searched where it heard you and found nobody** crouches and looks round for a second or two
  before it moves on.
- [ ] **Fight a bot standing beside a wall or a container**: it sidesteps away from the wall, not into it, and keeps
  you in sight; on the dock's edge it never steps off, and where both sides are blocked it steps forward or back
  rather than stand still.
- [ ] **Hit a bot's teammate from far off** (30 m+): the others turn towards roughly the right side, not straight to
  where you stand.
- [ ] **Fight one bot while a teammate of yours fires from elsewhere**: once your bot is down, the other heads for
  where your teammate was heard.
- [ ] **Hard bots** sometimes come at a spot from the side instead of straight down the lane; **Easy bots** never do.
- [ ] **Attack / Defend, your team attacking with bots**: one bot works the rope; the others hold cover a few metres
  out, watching. With you at the rope, no bot crowds in.
- [ ] **Depot's east end (Blue's start in Elimination)**: the spawn yard has no way out to the north road any more;
  the team leaves past the wall's south end, so the dock and the Main Gate take about as long to reach from both
  ends. Check nobody gets stuck in the yard's north corner. The east spawns stand near the yard's back wall now: does
  either end still feel stronger over a half?
- [ ] **Bots turning a corner** no longer brush the wall or door frame as they pass.
- [ ] **New game → Bot difficulty, with no Teammates level picked yet**: set Opponents to Easy and Teammates shows
  Normal; Normal or Hard opponents bring the teammates along to the same level. That default (Easy opponents, Normal
  teammates) has no "won't go into your records" note, and its summary counts it.

## Audio pass (FA6)

Headphones help. Every sound is still generated by the game (nothing downloaded).

- [ ] **Stand still in the yard between rounds.** A very quiet outdoor bed (distant air and traffic hum, slow gusts)
  sits under everything, with no audible loop point; now and then a small bird chirps somewhere round you. It should
  be barely there, never a hiss. The Effects slider turns it down with the rest.
- [ ] **Press Esc while a burst or a reverb tail is sounding, then Resume.** No click either way: the sound fades out
  and back in.
- [ ] **Get hit.** The hit tick stands out clearly: the world dips for a moment under it and comes back.
- [ ] **While you walk off and wait in the dead zone,** the field sounds muffled and quieter (as from the side line);
  the whistle stays clear. At the next round it's clear again.
- [ ] **Listen for a bot sprinting at you from about 20 m** (Depot, behind the containers). You should hear it
  coming from most of the way, quieter than any shot. Distant firefights are a little louder than before.
- [ ] **At the end of a round,** the whistle sits a little above the field instead of fighting it.
- [ ] **Practice range:** the steel plates at 50 and 60 m still ring when you hit them.
- [ ] **Click on another window on a second monitor (or open an overlay such as Discord's) while playing.** The game
  pauses as it does for Alt+Tab.
- [ ] **Firefox: Settings › Privacy & Security › Autoplay › Block Audio and Video,** then play. A short line under
  Resume says sound is blocked by the browser. Allow it for the site and the next Resume has sound.
- [ ] **F3:** the box shows `audio latency (ms)` (about 10–40 depending on the system).
- [ ] **On a 44.1 kHz or 96 kHz output device** (many USB headsets, HDMI receivers), shots and clicks sound as crisp
  as on 48 kHz.
## Crash handling, movement and match flow (FA1)

- [ ] **Crash pane with the real mouse lock (dev server).** Start a match, click in to lock the mouse, then in the
  console run `airsoft.session.advance = () => { throw new Error('test') }`. The game stops, the cursor comes back,
  and a "Something went wrong" pane matching the menus shows the seed; **Copy Report** puts it on the clipboard
  (try Chrome and Firefox) and **Reload** starts again.
- [ ] **Settings › Dev › Diagnostics › Copy** pastes a report starting "Airsoft diagnostics" with your GPU and settings.
- [ ] **Jump buffer.** Press jump just before landing from a crate, and while standing up from a crouch: the jump
  happens, never twice. Does it feel right or too forgiving?
- [ ] **Ramps.** Sprint up and down Depot's dock ramps: uphill still loses about a quarter of a sprint's pace (unchanged). A fix is built but off (`rampPace` 0 in `config/movement.ts`; 1 keeps the pace both ways): say whether you want it, knowing it lets attackers reach the pole sooner.
- [ ] **Crouch-walking accuracy.** Crouch-walk and fire at a range figure: the crosshair is a little wider than when
  crouched still, a little tighter than walking upright. Is the cost noticeable but fair?
- [ ] **Stepping off a kerb** (a 0.15 m step) while aiming: the crosshair doesn't flash wide.
- [ ] **Pistol out of a sprint.** Let go of sprint and click at once: the shot fires a moment later instead of being lost.
- [ ] **A drawn Elimination round** (both last players out together) replays the same round number; the summary
  counts it under rounds played.
- [ ] **Play again** shows a new seed in the F3 box, and that seed in a new page reproduces the match's start.
- [ ] **A finished match is recorded at once:** finish a match, go straight to Stats without pausing; it is counted
  and paid.
- [ ] **Walk-off from the far quarter of Depot.** Get hit at one end; you walk all the way to your dead zone instead of
  fading out on the way.
- [ ] **A slow machine** (or DevTools CPU throttling 6×): the game keeps real-time pace down to about 6 frames a second.

## Input, key bindings and HUD fixes (FA5)

- [ ] **Chrome or Edge with a French (AZERTY) or German (QWERTZ) keyboard layout.** Settings → Key Bindings shows
  Move forward as **Z** (AZERTY) and the order wheel as **W** (AZERTY) or **Y** (QWERTZ); the tutorial's hints and
  the "press R to reload" hint use the same letters. Switch the system layout while the game is open, click back
  into the window: the names follow.
- [ ] **Firefox:** Key Bindings shows a line saying names follow a US keyboard; the keys still work by position.
- [ ] **Key Bindings:** each row has a main and a second key box. Rebind Move forward's main key: ↑ stays as its
  second key. Bind Jump to R: the line under the list says "R was Reload: Reload is now Space" and Reload's row
  flashes. Click a box and press Backspace: it clears (Move forward's last key refuses, saying it needs a key).
  Click a box and turn the mouse wheel: it binds "Wheel up" / "Wheel down", and in a match that direction no longer
  switches replicas. F5, F11 and F12 are refused ("the browser uses it").
- [ ] **Keyboard only:** Tab to a key box, press Enter, press a key: the focus stays on that box (Tab moves on to the
  next one). Bind Space and Enter this way: the box doesn't start waiting again.
- [ ] **Reset All** asks "Click Again To Reset" and resets only on a second click within 3 s.
- [ ] **Esc on the pause menu resumes** (with the mouse lock: right after pausing, Chrome may need a moment and
  shows "click again"; a second Esc a second later resumes).
- [ ] **F10 mid-match (Chrome, Edge, Firefox):** the page goes fullscreen and play carries on without the pause menu
  (if the browser keeps the pause menu up, Resume works as before). Same leaving fullscreen with F10. Then strike
  KNOWN_ISSUES "The fullscreen key drops the mouse lock".
- [ ] **Raw mouse input** (Settings → Controls): after the first Play the line under it says "Raw input is active"
  in Chrome/Edge, "no raw input" in Firefox. Turn it off, Resume: the system's acceleration applies.
- [ ] **Turn distance:** type 36.4 in the cm/360 box and press Enter: it still says 36.4. The sensitivity slider
  moves in 0.01 steps with the arrow keys.
- [ ] **HUD size** (Settings → HUD): 150 % makes the replica panel, scoreboard, minimap, hit feed, squad line, round
  messages, order wheel and teammate markers bigger, nothing overlaps at 1280×720; the crosshair keeps its size. On a
  1440p or 4K screen (without system scaling) 100 % is already larger than on 1080p.
- [ ] **Minimap on a second screen:** drag the window to a screen with another scaling mid-match (or zoom the
  browser), pause and resume: the minimap is sharp and the right size.
- [ ] **Teammate markers:** a teammate whose marker would sit inside the minimap circle has none there; holding Tab
  hides every marker over the field (teammates, the flag, the hold spot).
- [ ] **Crosshair:** Custom colour (the colour box at the end of the colour buttons), Opacity and Spread (Static keeps
  the gap while moving and firing) show in the preview and in a match.
- [ ] **Order wheel:** each order shows its own key (F, X, V) under its name; rebind one and open the wheel again.
- [ ] **New game at 1920×1080 and 2560×1440:** "Elimination" stays inside its tile.
- [ ] **Settings at 1280×720:** Controls, Key Bindings and Crosshair fade out above the Back button while there is
  more below; scrolled to the end, the fade goes.
- [ ] **Windows High Contrast** (or Chrome DevTools → Rendering → forced-colors: active): the crosshair, team pips,
  hit wedge and sound cues keep their colours in a match.
- [ ] **Screen reader (NVDA/VoiceOver):** being hit is read out ("Hit! You called your hit"), the round result once
  (not the countdown), and a squad order as it is given.

## UI polish (FA9)

- [ ] **Loading screen** (production build, `npm run build` then `npm run preview`; DevTools → Network → Slow 4G,
  cache disabled): the dark page with "AIRSOFT." and a thin orange bar shows at once, with no white flash; the bar
  fills while "Loading physics…" downloads, then "Starting physics…", "Starting the game…", and the title appears.
  In the Network tab the `rapier-….js` file is downloaded once (the second request is from the cache).
- [ ] **Tab and favicon:** the tab shows the orange-dot "A" icon; the address bar / tab strip takes the dark theme
  colour where the browser supports it.
- [ ] **Firefox and Edge, production build:** the game boots and plays a round; the console shows no
  "Content-Security-Policy" errors. `npm run dev` still boots and hot-reloads.
- [ ] **JavaScript off** (DevTools → Settings → Debugger → Disable JavaScript, reload): the loading page says the
  game needs JavaScript, with no sliding bar.
- [ ] **Menus at 1280×720 and 1920×1080:** title, New game, the Mode / Match / Difficulty dialogs, Loadout, Armory,
  every Settings tab, pause, summary and result look tidy: one type scale, square-ish corners, buttons in capitals,
  the same order and wording as before. Hover a button and a New game tile: a quick lift/brighten. Tab through a
  screen: an orange ring with a dark gap around every focused control, also on the orange Play button.
- [ ] **Settings tabs and Loadout columns:** the current tab / column has an orange 3 px bar on its left; each tab
  has a small icon beside its name; New game tiles and pause buttons have icons too.
- [ ] **Dialogs:** opening Mode or Match blurs the page behind (Chrome, Edge, Firefox 103+) and the box scales in;
  the Match dialog's labels line up like Settings' rows.
- [ ] **Reduced motion** (Settings → Accessibility, or the system setting): screens and dialogs appear with no
  fade or scale, buttons change with no transition.
- [ ] **Windows High Contrast / forced-colors:** the selected tab's bar and the loading bar still show (system
  highlight colour).
- [ ] **HUD at 1920×1080 and on a 21:9 window (e.g. 2560×1080):** the four corners keep the same margin; on 21:9
  the ammo and minimap sit inside a 16:9 area, not at the screen's edges. The scoreboard's "out" pips read
  against a bright sky.
- [ ] **Hit feed:** each line has a thin bar on its left in the shooter's team colour (try a colour-blind option in
  Accessibility: the bar follows); friendly-fire and ricochet tags show a small glyph beside the word.
- [ ] **Summary and result tables:** striped rows, numbers aligned, your row keeps its team bar.

## Build, tests and pipeline (FA11a)

- [ ] **Firefox, production build** (`npm run build`, `npm run preview`, open it in Firefox): the game boots to the
  title with no console errors; Play takes the mouse (Settings → Controls says raw input is unavailable, as expected);
  Esc pauses and Resume takes the mouse again; sounds come from the right side when a bot shoots to your left or right
  (the listener fallback); the back / forward side buttons don't leave the page while playing.
- [ ] **Edge, production build:** the same boot, Play, Esc and Resume.
- [ ] **Mouse look** in Chrome on the production build: smooth, no jump on the first move after Play or Resume.
- [ ] **Precompressed files** (only when the game is put on a host that serves them, README › Hosting): in DevTools →
  Network the `rapier-….js` response has `content-encoding: br` and a transfer of about 1.2 MB.

## Screenshot pass fixes (FA13)

- [ ] **The support hand** (any match or the range, Hand detail Low and High): the left hand holds the rifle's
  handguard, its thumb up the near side where you can see it, not a glove hanging below it; no finger shows through the
  handguard. Reload: the hand still takes the magazine and comes back.
- [ ] **The raised hand** (get hit in a match): one olive glove, the fingers
  joined to the palm, no grey-blue palm; the same with Hand detail Low.
- [ ] **Name tags:** walk up to a teammate (1–2 m): the tag sits just above the head; at 30 m and more it is still above
  the head, not on it. Try a Field of view of 80.
- [ ] **Loadout and Armory tiles:** each Loadout tile shows a drawing (rifle, pistol) at the top, the empty Grenades slot a
  grenade; the Armory's Last Shot tiles have a small drawing beside the category, their heads in line. Nothing else moved.
- [ ] **Customise → Muzzle** with nothing fitted reads "Bots hear your shots from 22 m."; with a silencer "… from 11 m (22 m
  without a silencer)."

## Session plan, kept map meshes and the build split (FA11b)

- [ ] **The build split on the laptop:** open the game with `?perf` (e.g. `…/index.html?perf`), open DevTools → Console,
  play a match on Low, then Quit → Play, then the same on High. Each Play logs one `match build … ms · map meshes … ·
  lighting … · …` line; the second on the same map says `(map meshes reused)` with map meshes near 0. Send the four lines.
- [ ] **Quit → Play on the same map** looks exactly like the first Play (signs, bevels, shading on Medium and High); after
  changing Map detail on the title and playing again, the map shows the new detail (no stale map).
- [ ] **The range after a Loadout change** (pause on the range → Loadout → change a replica → Resume) comes back at once
  and looks the same.
- [ ] **Pause and result text** unchanged: "Round 2 · Blue (you) 1 – 0 Orange · first to 5", in Attack / Defend "you
  attack" / "you defend", between rounds "After round 4 · … you defend next" at half-time; the result screen's headline
  and "· N rounds, M drawn".

## Armory, economy, records and tutorial (FA10)

- [ ] **Armory, Shots:** the buttons read "1 Shot · 160 FC" and "10 Shots · 1,600 FC", with "Paid in FC" or "Paid with
  2 Tokens + …" under them. 10 Shots opens "Take 10 Shots?" with the keyboard on Cancel; Enter there cancels. Hold
  Enter on 1 Shot for a second: exactly one Shot is taken.
- [ ] **Reveal:** after a ten-Shot the tiles come in one after another, rarest first, an Epic or Legendary glowing in
  its colour, with a line like "1 Epic, 4 Rare, 25 others · 3 new" above; the keyboard sits on "Last Shot". With
  Reduced motion on, the tiles appear at once. A screen reader reads the first Shot too.
- [ ] **Pity:** under the Shots, "Epic or rarer within 20 more Shots" and "Legendary or rarer within 100 more Shots"
  count down a Shot at a time and survive a reload of the page.
- [ ] **Catalogue:** "Your collection" lists every asset Shots can give, owned or not (dimmed), with a pip per tier
  and "N / 84 items" in the heading. Own a part at Common and Rare: "Scrap 1" scraps the Common; fit the Common on
  Customise first, scrap it, and Customise shows the Rare fitted. "Scrap all spares" asks first and keeps the best
  copy of everything.
- [ ] **Two tabs** (M31's tab lock): open the game in a second tab: it waits behind the "Airsoft is open in another tab"
  notice. Take a Shot in the first, then let the second take over: its Armory shows the Shot (balance and items).
- [ ] **Customise:** under the replica's name a line says what its tier adds ("Legendary: +7.5% energy · …", or
  "Common: no tier bonus"); hovering any item tile shows the same.
- [ ] **Summary after a Dev-assisted match** (Dev settings → Bottomless magazines on, play a match to the end): "No
  Field Credits: Dev settings changed how this match played." With Disable Armory on: "…the Armory is switched off…".
- [ ] **Pay:** a first-to-5 3v3 on Normal pays as before when you play; a round your team won while you were out
  with no hit isn't in the "rounds won" line. Hard opponents with Easy teammates show "difficulty ×0.5".
- [ ] **Tutorial:** press Esc during it: Skip step and Skip tutorial are there (not on the practice range alone or in
  a match). Skip step moves the pause line to the next step. Quit at step 5, start the tutorial again from the title:
  it picks up at step 5. Skip tutorial: free practice, and the title stops tagging the Tutorial "New?". The new steps
  (fire selector, sprint then shoot, "In a match") each finish by doing what they say.
- [ ] **Spread looking up:** on the range, aim the rifle steeply up (about 60°) and fire a magazine: the BBs spread
  as wide sideways as up and down (before FA10 they bunched into a vertical line).
- [ ] **AEG spin-up** (KNOWN_ISSUES): on a fresh trigger pull, is the motor's wind-up heard before or under the first
  shot? If not, say so: it can be raised or the shot led by a few milliseconds now that M29 has merged.
## Visual overhaul (FA7)

- [ ] **Low looks as before.** On Low, Depot, the trees and the sky look as they did (only the colours a touch cleaner:
  Neutral tone mapping); a soft dark disc sits under every player's feet.
- [ ] **Edges and corners on Medium.** Walk Depot on Medium: boxes, walls, containers and props have a thin lighter edge
  (no razor edges); the floor darkens softly along wall feet, under the dock's lip and between close props; no dark
  blotch on an open wall or floor, and no flicker where a sign or chevron sits on its face.
- [ ] **Relief.** Concrete, block walls and container ribs show relief that follows the light; on High no wall looks
  pitted. Custom → Relief maps → Bump brings back the old look.
- [ ] **Sky and trees.** Clouds and a soft sun disc in the sky on Medium and High; layered trees and a hedge round the
  walls; from the dock or a stack nothing floats or pops. Custom → Clouds off and Trees Simple/None change them at once.
- [ ] **Reflections.** On Medium and High the held replica and the figures pick up a blue sky above and warm ground
  below; the dock's steel plate has a soft sheen; Environment lighting off removes both.
- [ ] **Tone mapping.** Settings → Graphics → Tone mapping: Neutral (default), AgX and ACES each change the colours at
  once; the team blue and orange read clearly on Neutral; the choice is kept after a reload.
- [ ] **Signs.** Bay numbers on the containers, hazard chevrons on the barriers, a site roundel on the long walls and
  SAFE ZONE by each dead zone: readable, never mirrored, never half inside a prop.
- [ ] **Flag and range.** In Attack and Defend on Medium the pole has a ball on top, a rope to a cleat, and a painted
  flag that ripples less near the pole. On the practice range the plates show BB scuffs, hang from chains, and the
  posts have an orange band; a shelf of BB bottles stands by the firing line.
- [ ] **Load time.** Play on Medium on the laptop: the match starts no more than about half a second later than on Low.

## Figures, replicas, hands and effects (FA8)

- [ ] **Figures on High** (Settings → Graphics → Quality High, a match on each map: every effect here is engine-level, on every map): bots have a shaped head with ears,
  goggles with a dark rim and a glossy lens that catches the sky, glossy helmets, gloves with a thumb, boots with
  soles; vest and pouch edges catch a lighter line. Team colours still read at once, also with each colour-blind
  option (Accessibility). Switch Player detail Low ↔ High in Custom mid-match: the figures rebuild without a hitch
  you notice, and Low looks as before.
- [ ] **HIT! sign at range:** hit a bot 20–30 m away: the sign stays readable (about the size it is at 6 m).
- [ ] **AEG on High:** a fine speckle on the polymer, rounded lit edges, worn charging handle and grip front, rail
  slots, the selector, ring rear sight and front sight post; in the Loadout try every optic, grip and magazine
  (standard: BBs in the side window; hi-cap: the wheel; low-cap: steel ribs). Nothing floats or clips the hands.
- [ ] **Barrels and silencers on High and Low** (Loadout → Customise, M29b's parts): the AEG's Long Barrel adds a
  fluted length with a steel collar at the join, the Tight-Bore a heavier fluted steel sleeve with a tan band (High
  only; on Low it looks as it comes); the Silencer (AEG and pistol) has steel end caps, two rubber bands and a dark bore. With each fitted, fire at a wall
  close up: the BBs and their streaks leave the front of the silencer, flash hider or long barrel, not inside it.
- [ ] **Pistol on High:** slide serrations, rubber grip panels; with the Red Laser the lens glows red. Custom →
  Laser beam on: a faint fading line from the lens (off on every preset).
- [ ] **Hands on High:** a lighter knuckle pad, seams at the finger joints, a strap and buckle at the wrist, the
  sleeve's fold; fingers still wrap the grip and handguard on both replicas (look through a reload).
- [ ] **BB glow and grit on High:** BBs in flight carry a soft warm glow (easy to follow against the sky and dark
  walls), not a beam; a BB landing on a wall throws a few small chips back towards whoever shot it (stand beside a
  wall a bot is shooting: they fly towards the bot, not at you), plus a faint ring. Low: no glow, no chips, as before.
- [ ] **Helmets on High:** a helmeted figure at 5–15 m: the blue or orange tape round the shell is clean, no tan
  showing through it.
- [ ] **Low unchanged:** Quality Low looks and runs as it did (F3 overlay: draw calls and triangles as before).

## Extraction (M43, dev content)

Turn on Settings › Dev settings › Dev content, then New game › Mode › Extraction on Depot.

- [ ] **New game:** the Match button reads "Squad of 3 · 5 in the home team" and "One 8:00 run"; the rules text under
  it explains the run, and says it won't be recorded or paid. With Dev content off, Extraction isn't in the Mode list
  and a saved Extraction pick plays as Elimination.
- [ ] **The run:** the strip under the clock names the open exit(s) and when the late one opens; green EXIT rings with
  cones and a sign, a marker with the distance, and a square on the minimap. Exits next to your insertion aren't there.
- [ ] **Counted out:** stand in an open exit: a beep each second, "Counting you out · 9 … 1", then "Counted out · you
  made it!". Step out at 5: the count starts again. Let an Orange bot into the ring: "Count paused".
- [ ] **Respawn:** get hit once: HIT!, then straight back at the insertion facing the field, "Back in at the insertion ·
  no respawn left", and the strip says "No respawn left". Hit again: "Out of the run".
- [ ] **Teammates:** both bots follow you from the start and again after they respawn; Z wheel orders still work.
- [ ] **Clock:** a whistle at 1:00 left; the late exit opens at 3:00 (its sign turns green); at 0:00 "Caught out".
- [ ] **Summary:** the teams read "your squad" and "home team"; no Field Credits; the records table has no
  Extraction column.

## Extraction cases and loot (M44, dev content)

Dev content on, Extraction on Depot, as above. While Extraction is dev content a run keeps nothing (M35's rule), so the
summary says "Not kept"; everything else plays as it will.

- [ ] **Cases:** an olive ammo can, a black field case with an orange band, a grey locker with a yellow band (in the
  office stores or at the dock's east end) stand by cover; each run (another seed) puts them elsewhere.
- [ ] **Opening:** walk up to one: "Hold G to open the field case" under the crosshair. Hold G: "Opening …" with a bar
  (about 2 s for a can, 4 for a field case, 7 for the locker) and a rummaging sound (the locker ratchets). Let go
  halfway: it starts again. Then the lid swings up (the locker's door out) and the line says what it held ("+35 FC",
  "BB resupply · magazines topped up", "Rare Red Dot · +120 FC").
- [ ] **Noise:** open the locker with an Orange bot nearby: it comes to look.
- [ ] **Carrying:** the strip by the clock reads "Respawn ready · Carrying 155 FC and 1 part".
- [ ] **Resupply:** empty a few magazines, open an ammo can with a resupply: your spares are full again.
- [ ] **Hit:** get hit carrying finds: "You dropped what you carried where you were hit · go back for it"; back at the
  insertion, the strip no longer says Carrying; a small bag in your team colour lies where you fell. Walk to it and hold
  G: "Picked up …" at once, and Carrying is back.
- [ ] **Extract:** get counted out carrying finds: the summary's "The haul" line says what you got out with (and, while
  Extraction is dev content, "Not kept"), with the parts as tiles in their tier colours, rarest first.
- [ ] **Caught out or out:** end a run any other way carrying finds: "Lost: … Only what you get out with is yours."
- [ ] **Key:** Settings › Key bindings has "Use: open a case (hold)"; rebind it and the prompt names the new key.

## Extraction waves (M45, dev content)

Dev content on, Extraction on Depot, Normal, as above.

- [ ] **A wave:** hit one Orange bot early. It walks off; about a minute and a quarter into the run (75 s on Normal) it
  is back in play somewhere you can't see, and comes your way along a lane. On Easy the wait is longer (100 s), on Hard
  shorter (60 s).
- [ ] **A cleared field:** hit every Orange bot in play. A couple of seconds after the last hit call, the wave comes back
  at once rather than waiting for the clock: never a long safe spell.
- [ ] **Never in your face:** nobody comes back within about 15 m of you or anywhere you're looking at (watch the regen
  spots: both spawn yards, the office rooms, the stores and hall, the yards, the Bay, the back lot, the car park, the
  dock). Tell me if one ever appears in view.
- [ ] **The last third:** with 2:40 left one more Orange bot joins the next wave (the scoreboard keeps its usual pips).
- [ ] **The rules text:** New game › Mode › Extraction says hit opponents come back in waves.

## Extraction guards, patrols and hunters (M46, dev content)

Dev content on, Extraction on Depot, Normal, as above.

- [ ] **Guards:** the locker has two Orange bots near it, tucked behind cover and watching the way you'd come in;
  sometimes a field case far from you has one too. A guard you shoot at or pass close by comes after you, but never
  much more than about 8 m from its case: it goes back once you're gone.
- [ ] **Nothing next to your door:** at the start no guard or patrol is within about 15 m of where you come in.
- [ ] **Patrols:** the rest of the home team walks between the shut cases in pairs, one following the other, and
  re-takes its round after a fight. Do they read as a pair?
- [ ] **Hunters:** from halfway through the run (a third of the way on Hard and Pro, never on Easy) the patrols stop
  patrolling and come for you, running to where you were last seen or heard, and push in close in a fight rather than
  holding back. Does the run get tense late without feeling unfair?
- [ ] **Back in a wave:** a bot back in a wave takes an empty guard post first, else hunts or joins a patrol.
- [ ] **Your teammates cover you:** hold G at a case with your two bot teammates following. They crouch at cover near
  you, each facing a different way outwards, until you're done.
- [ ] **Difficulty:** Easy should let you out with three cases most runs, Normal some runs, Hard rarely: say how it felt.

## Neon Heights by Night (M34e, dev content)

Turn on Dev content (Settings → Dev), pick Neon Heights in the Map pop-up (Night is its default).

- [ ] Night: the avenue, the atrium round the flag and the shopfronts (Arcade, bar, Repair Shop, Noodle Alley, Lantern Lane, Back Alley, Drone Dock) sit in lamp light; the stairwells and the Level 1 rooms are dark.
- [ ] Night: neon signs glow on the walls, and the city's windows high on the perimeter walls are lit or dark; no sign flickers against its wall or covers a door or window.
- [ ] Night: in a dark room a bot spots you only close up (about 15 m), in lamp light from far off; does that feel fair next to the moonlit street (25 m)?
- [ ] Night on Medium or High: a lamp's light can show on the floor above its room (known issue); is it distracting?
- [ ] Day: no lamps or glows anywhere; the signs are painted boards and the windows dark glass.
- [ ] Woodland by night looks as before: the camp fires and lanterns, and bots see you anywhere in their light.

## Reporting what you find

Post each problem in the project chat, one message per problem. These four things let it be fixed without guessing:

1. **What you did**, step by step ("crouched behind the crate by the office door, leaned right with E").
2. **What happened**, and what you expected instead.
3. **The seed** from the ` / F3 box, plus the mode and difficulty.
4. **A screenshot or short clip** if you can (Windows: Win+Shift+S; Mac: Cmd+Shift+4).

Feelings count too: "bots are too good on Normal" or "leaning feels slow" is useful feedback, not just bugs.
A few things are already known and on the list, such as bots never using the pistol, the figures' simple walk
cycle, and arm hits not counting (owner's choice).
