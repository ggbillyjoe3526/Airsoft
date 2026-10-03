# Playtest guide

How the owner plays the game to check a change. Each pull request names the sections to play; a bug pass
before a release plays all of them. Written 2026-10-02 for the game as of M10 (leaning, magazines, BB physics,
the 2σ crosshair); updated 2026-10-03 for M12a (fire modes, crouch toggle, steadier aim when still, quicker
reloads), M12b (the red dot as an accessory, aiming down sights, the crosshair's instant lock) and M11 (the
reworked Depot). Update a section when a change alters what it describes.

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
7. **Open http://localhost:5173 in your browser** and you'll see the start screen.

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

On the start screen, pick **Elimination** and **Normal**, set the mouse sensitivity, then click **Click to play**.
Tick each box once it behaves as described; anything else is a bug worth noting.

- [ ] **Look around with the mouse.** The view turns smoothly, with no jumps or drift when you stop moving the mouse.
- [ ] **Move with W A S D.** You run at a steady pace and you hear your own footsteps.
- [ ] **Hold Shift and move.** You walk slowly and your footsteps go silent.
- [ ] **Hold Left Alt and run forward.** You sprint, faster than running. Try to shoot while sprinting: nothing
  fires until a moment after you stop.
- [ ] **Press C.** You crouch and move slowly and silently, without holding the key. Press C again and you
  stand up. Crouch again, then press Left Alt or Space: you stand up (the Space press only stands you up).
- [ ] **On the start screen, set Crouch to Hold.** Now you crouch only while C is held. Set it back to Toggle if
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
on the start screen.

- [ ] **Leave Optic on Iron sights and play.** The rifle has small flip-up sights standing on its rails and no red
  dot. Holding right click does nothing: aiming down sights needs an optic.
- [ ] **On the start screen, pick Optic: Red dot, then play.** The red dot sits on the rifle, and the iron sights
  fold flat under it.
- [ ] **Hold right click.** The rifle comes up to your eye, the view narrows a little, the crosshair gives way to the
  red dot, and you move at a quiet walk (sprint does nothing while aiming). Let go and it all goes back.
- [ ] **Shoot while aiming.** BBs go where the red dot is. Standing still is still what makes you accurate; aiming
  adds no extra accuracy of its own.
- [ ] **Move the mouse while aiming.** It turns at the **Aiming sensitivity** set on the start screen (×0.80 of your
  mouse sensitivity at first, so the world moves across the screen at the same speed as from the hip). Try other
  values; the game remembers your choice.
- [ ] **Reload or switch to the pistol while aiming.** The sight drops for the reload and comes back up if you are
  still holding right click. The pistol has no optic, so it never aims down sights.
- [ ] **Change the optic during a match (Esc, pick the other one).** The screen says it is fitted from the next
  round, and it is.

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
  You can step off the edge on purpose (it's a 1.2 m drop), but walking up to it shouldn't push you off.
- [ ] **Stand on the dock and look around.** It's a good spot to watch Dock Road and the Bay, but from most of
  it you can't see down into Container Alley.
- [ ] **Look for the other team's spawn from yours** (standing and crouched). You shouldn't be able to see it.
- [ ] **Shoot through a barricade port and a building window.** BBs go through the openings; the walls stop them.
- [ ] **Play Attack / Defend for a full match.** You attack first (from the west). Note whether attacking or
  defending feels easier, and which lane the bots pick. In bot-only tests the attackers win about half the rounds.
- [ ] **Play Elimination across half-time.** The banner says ends swap after round 4, and round 5 starts you at
  the other end. In bot-only tests the east end wins more rounds (about 6 in 10); say if it feels unfair.
- [ ] **Watch where hit players walk.** Each end has its own dead zone, away from the fighting.

## Pause, menus and tabbing away

- [ ] **Press Esc mid-round.** Everything freezes, the mouse is freed, and a pause screen shows the round and score
  with **Click to resume**. Clicking it puts you back exactly where you were.
- [ ] **Change keys.** On the pause screen click **Key bindings**, click an action and press a new key. Back in the
  game the new key works. **Reset to defaults** puts everything back.
- [ ] **Change the sensitivity slider** on the pause screen. Mouse look feels faster or slower straight away, and
  the setting is still there after you reload the page.
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
A few things are already known and on the list, such as bots never using the pistol, the greybox look of the
figures, and arm hits not counting (owner's choice).
