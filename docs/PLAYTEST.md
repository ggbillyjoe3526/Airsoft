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
  (Start, then Loadout; or Change setup on the result screen before the next match).

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
  stays on target (rifle: 88 m/s, 20 m in 0.28 s, best about 65%, ~38 m).
- [ ] **Pick 0.28 g on the rifle.** It leaves slower (about 84 m/s) and the hop-up line now says it is on target to
  about 34 m: heavy BBs need more hop. Turn the dial up to the 75% the weight line suggests: on target to about 40 m.
- [ ] **Pick 0.20 g on the rifle with the dial at 65%.** The hop-up line warns it's too much (light BBs rise more on
  the same hop). In a match, far shots fly high and float; turn the dial down to about 55% and they fly flat.
- [ ] **Is the choice worth having?** The differences are small on purpose, as at a real site (DECISIONS): 0.28 g
  carries a couple of metres further past Depot's longest sightlines (~34 m), 0.20 g gets to 10–20 m a hundredth of a
  second sooner (by ~30 m they arrive together). On the pistol the gap is bigger (25 → 34 m of reach on full hop). If you can't feel
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

## Hop-up

Hop-up puts backspin on the BB, and the spin lifts it so it flies flat for longer. Each replica has a dial in the
**Loadout** screen (0–100%; click the replica on the left to see its dial); the line under it says what the
setting does.

- [ ] **Leave both on the factory setting (rifle 65%, pistol 55%) and shoot at a bot or a wall far away (30 m and
  more).** Rifle BBs rise a little (about a hand's width) around 20 m and are still on target at Depot's longest
  sightlines (about 34 m). The pistol's BBs drop sooner, from about 25 m.
- [ ] **Turn the rifle's hop-up right down (0%).** BBs start dropping from about 14 m; far shots land low.
- [ ] **Turn it right up (90–100%).** The BBs climb about half a metre over your aim and float before they fall.
  The line under the slider says so.
- [ ] **Find a setting you like.** The game remembers it. Bots always use the factory setting.

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
  after round 4, and round 5 starts you in the west yard. In bot-only tests the east end wins a little more often (about 54%); say if either end feels unfair.
- [ ] **Watch where hit players walk.** Each end has its own dead zone, away from the fighting.

## Menus (M15, M15b)

- [ ] **Load the game.** A title screen says **AIRSOFT** in the middle on a plain dark background (no field behind
  it: no map is loaded yet), and **Start** at the bottom left. Nothing else.
- [ ] **Click Start.** The New game screen has five big buttons: **Map**, **Mode**, **Difficulty**, **Loadout** and
  **Settings**, each showing what is picked now, the rules of the picked mode under them, **Back** (to the title)
  and **Play**. No controls list here any more: the keys are under Settings, Key bindings.
- [ ] **Click Map.** A pop-up lists Depot (picked, the only map for now). Esc or × closes it.
- [ ] **Click Mode, then Attack and Defend.** A pop-up lists both modes with a line each; picking one closes it, and
  the Mode button and the rules underneath change. Open it again and press Esc or ×: it closes with no change.
  Do the same with **Difficulty** (Easy, Normal, Hard).
- [ ] **Click Loadout.** The AEG rifle (primary) and gas pistol (secondary) are on the left, with "More replicas
  later" under each. On the right: the replica in that slot, the optic, BB weight, hop-up dial, grip and magazine for
  the rifle, then power and skins greyed out and marked LATER. Click the pistol: its own BB weight, hop-up dial and
  magazine, and its gas type and skins marked LATER. Back returns to New game, and the Loadout button shows your
  optic, any parts that differ from stock, BB weights and dials.
- [ ] **Click Settings.** Tabs on the left: **Controls** (see Comfort and controls below), **Key bindings**,
  **Graphics**, **Crosshair**, **Audio** (volumes, see Sound below) and **Accessibility**. Back returns to New game.
- [ ] **Graphics.** A **Field of view** slider at 100°, and the **Quality** picker (High; see the M14 section). No
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
  Let go and it's gone. Tab can be rebound under Settings → Key bindings ("Scoreboard (hold)").
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
- [ ] **Key bindings: mouse buttons.** **Fire** and **Aim** are at the top of the list (Left mouse, Right mouse). Click
  the Reload box, then click the same box with a side button (Mouse 4 or 5): Reload now shows **Mouse 4**, and the
  browser does not go back a page. In a match the side button reloads, and pressing it never leaves the game. Click
  the Aim box and click it with the left button: Aim becomes Left mouse and Fire takes Right mouse (a swap). Reset to
  defaults puts them back.
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
- [ ] **Fullscreen.** Settings → Graphics → **Go fullscreen**; the button then reads Leave fullscreen. In a match press
  **F10**: fullscreen on and off. Esc leaves fullscreen (and pauses). Rebind it under Key bindings.
- [ ] **Hardware acceleration.** Turn off the browser's graphics acceleration and restart it: the title screen warns
  that the game will run slowly and says where to turn it back on. With it on, no warning.

## Practice range (M21)

- [ ] **Title screen, Practice range.** You're alone behind a painted line on a long concrete range, facing three
  lanes of targets: white steel plates on the left, standing plywood figures in the middle, crouched ones on the
  right. Boards on both walls and lines on the floor say 10 m to 60 m. No whistle, no clock, no score.
- [ ] **Shoot each kind.** A plate rings (you should still hear it at 60 m) and swings back, away from you; a figure falls back and
  stands up again after a second and a half. The readout at the top says "Last BB: 31 m · hit Steel 30 m", or
  "· miss" with where it landed. Can you tell from it how far the rifle carries with the hop-up as it is?
- [ ] **Lob one.** Aim well above the backstop and fire: the readout says the BB flew out of the range. Shoot the post
  under a plate: the BB stops on it and reads as a miss at that distance (the plate doesn't ring).
- [ ] **Reload.** Empty a magazine and reload: the spare gauges never run down.
- [ ] **Esc, Loadout.** The pause menu has a Loadout button. Change the BB weight or the hop-up, go Back and Resume:
  you're where you stood, with the new setup (the HUD's replica name and the readout follow it). Then Quit to title
  screen and start a normal match: it plays as before.
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
- [ ] **Rebind.** Settings → Controls → Key bindings has the three squad keys.
- [ ] **Hearing through walls.** Sneak up to Orange behind a wall (running, not walking): they should notice you
  later than in the open. Do bots still seem to hear you through walls like a wallhack, or now too little?

## Tutorial (M16)

- [ ] **Title screen.** A **Tutorial** button sits next to Start and Practice range, tagged "New? Start here" (until
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

## Pause, menus and tabbing away

- [ ] **Press Esc mid-round.** Everything freezes, the mouse is freed, and the pause menu shows the round and score
  with **Resume**, **Settings** and **Quit to title screen** on a solid background (the match doesn't show
  through). Resume puts you back exactly where you were.
- [ ] **Change keys.** In the pause menu click **Settings**, then **Key bindings**, click an action and press a new
  key. **Back** returns to the pause menu; back in the game the new key works. **Reset to defaults** puts
  everything back.
- [ ] **Change the mouse sensitivity** (Settings, Controls) from the pause menu. Mouse look feels faster or slower
  straight away, and the setting is still there after you reload the page.
- [ ] **Quit to title screen.** The title screen comes back with nothing behind it. Start, change the mode or
  difficulty, then Play: a fresh match from round 1, 0–0, in what you picked. Do this a few times: it loads just as
  quickly each time (nothing piles up).
- [ ] **Win or lose a match.** The result screen shows MATCH OVER, YOU WIN! (or YOU LOSE) and the score, with
  **Play Again** (same setup), **Change setup** (back to New game) and **Title screen**.
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

## Reporting what you find

Post each problem in the project chat, one message per problem. These four things let it be fixed without guessing:

1. **What you did**, step by step ("crouched behind the crate by the office door, leaned right with E").
2. **What happened**, and what you expected instead.
3. **The seed** from the ` / F3 box, plus the mode and difficulty.
4. **A screenshot or short clip** if you can (Windows: Win+Shift+S; Mac: Cmd+Shift+4).

Feelings count too: "bots are too good on Normal" or "leaning feels slow" is useful feedback, not just bugs.
A few things are already known and on the list, such as bots never using the pistol, the figures' simple walk
cycle, and arm hits not counting (owner's choice).
