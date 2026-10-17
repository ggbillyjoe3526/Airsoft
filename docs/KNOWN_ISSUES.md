# Known issues

Every open bug, limit and known gap in the game, so nobody re-reports or re-measures one. The regular bug pass
(`docs/PROCESS.md` › Bug pass) sweeps this file row by row.

- **Fixing a row.** The pull request that fixes it deletes the row; the task's record `docs/records/<id>.md` names it.
- **Leaving an issue.** A task that leaves one adds a row to the right section below.
- **Order.** Each section lists fix now, then playtest, then can wait, then document.
- **History.** Fixed rows, and every row's full notes as they stood on 2026-10-08, are in
  `docs/archive/0.1-dev/KNOWN_ISSUES.md`. A row kept short here (about 300 characters at most) has its full
  measurements and reasoning in `docs/archive/0.1-beta/KNOWN_ISSUES.md`: grep the issue's first words.

| Class | Meaning |
|---|---|
| fix now | A bug to fix in the next bug pass or task. |
| playtest | Waits on the owner trying it in the browser. |
| can wait | Real but minor. Beta or later. |
| document | A known limit we accept and explain. |

## Replicas, loadout and the Armory

| Issue | Class | Notes |
|---|---|---|
| The Red Laser draws no dot in the world, only its module and a tighter hip spread | can wait | A dot needs a ray per frame; the fading beam (`Settings › Graphics › Laser beam`, off on every preset) stops short of anything. (M26b, FA8) |
| The red dot's reticle is the HUD's aim dot, not a dot in the glass; a hit figure's team band doesn't flash | can wait | A dot in the glass would parallax off the pinned aim point. (FA8) |
| On Depot the rifle's BB weight shows only a little | document | On purpose (DECISIONS): a light BB leads to ~25 m, a heavy one carries further. (M17a, FA12) |
| The vertical grip's edge is small | document | Steady 0.09 s sooner after a sprint and steadier after landings, for 0.11 s more draw and a 25 % slower raise. On purpose; the owner's playtest decides. (M17b) |
| The 2x scope zooms the whole view, not only what is in its glass; on Replica detail Low the replicas' parts are simple shapes | document | A zoom in the glass alone would draw the world twice a frame. (M17b, PT1) |
| The best-accuracy record doesn't say what kit it was set with | document | A Tight-Bore or Long Barrel's tighter spread counts like factory gear (DECISIONS M26b accepts it). (audit POOL-21, FA10) |
| Reload is refused when no spare is fuller than the loaded magazine | document | Deliberate (no topping up); the HUD notice and a pat sound explain it. Playtest whether players expect a swap. |
| The Signal colours' orange furniture sits right against the GBB Pistol's orange tip, so with the orange tip setting on the tip hardly shows on it | playtest | The skin check measures them about 5 apart in colour (20 reads). (CT4) |

## Movement and shooting

| Issue | Class | Notes |
|---|---|---|
| A plain jump at one of the maps' 0.9 m vault walls rides over it about one time in thirty (no vault: the jump's landing is heard, not the vault) | document | Rapier's capsule slides up the edge; facing the wall within reach, Jump vaults instead. (M102) |
| Running up a ramp costs up to a quarter of a sprint's pace; running down costs none | playtest | Rapier keeps ~cos²θ of a move up a slope. (audit SIM-17) |
| The first shot fired on the run, or just after a sprint, can leave a barrel still coming up out of the carry | can wait | Presentation only: the replica comes up in 0.06 s to fire on the run and is square 0.15 s after a sprint. (M12c, PT1) |
| `probeGround` and `move` still allocate a little per call inside Rapier's wasm wrappers, and are most of a tick's cost | can wait | Sim alone, ten characters: 16–39 KB a tick. Needs Rapier's raw API. (FA1, audit SIM-04, SIM-06) |
| The lean's wall check casts straight sideways, so a thin post just ahead of the shoulder isn't seen | can wait | The head can come closer than `leanWallClearance`; at worst the near plane clips a post. |
| Ledges 0.2–0.3 m tall are climbable only sometimes (sprinting yes, crouching no) | document | Rapier autostep with capsules. Keep map ledges ≤ 0.15 m or at least uncrossable cover height (tested for Depot). |
| Rapier's capsule controller sinks into cuboid colliders along their diagonals | document | Worked around: level blocks are trimeshes (DECISIONS). Never add cuboid level colliders. |
| A capsule spawned overlapping a block is trapped inside it | document | Spawns and bot placement must never overlap level geometry. |
| Movement reads the lean from the previous tick (`stepLean` runs after `stepMovement`) | document | One 60 Hz tick; harmless. |
| The ground probe runs on every falling tick; jumping against cover tops in Rapier is untested | document | Only unit tests and headless matches cover it. (M11) |

## BBs and hits

| Issue | Class | Notes |
|---|---|---|
| Bushes stopping BBs are first guesses: 0.6 m of leaves stops a BB; one through an edge leaves up to 0.5 rad a metre off its line at 0.35 of its speed | playtest | `BALLISTICS.leaves` (FO1). Play Woodland: a shot through a bush's edge should feel like a gamble, and bots holding fire should not leave fights stuck. |
| The hit volume is capsules, so it misses or overhangs the drawn figure by a few cm at the rim (at most 3.5% of the drawn body, 2.7% of the volume) | can wait | Built-in figures only (`render/figureHitVolume.test.ts`). |
| Arms and replicas neither count as hits nor stop BBs: a BB through a figure's forearm flies on | document | Owner ruling (DECISIONS 2026-10-01, arm hits off). (M85) |
| Against a bot that strafes, aiming barely raises your share of BBs that hit (Normal, 15 to 35 m: 49 / 31 / 14% hip, 51 / 25 / 14% aimed) | can wait | The strafe, not the spread, decides most misses. (M84) |
| Tracer visibility was reviewed on paper only (no per-replica tracer setting) | can wait | Fine with three replicas; give tracers per-replica settings when more platforms arrive. (M9) |
| Depot IBC tanks bounce BBs like steel though most of one is plastic; sandbag and gabion textures add 2 draw calls | can wait | Their memory (0.7 MB on Low) is in each preset's texture budget. (M25b, FA2) |
| With Ricochets count on, bounced BBs still decide about a fifth of hits, and Attack / Defend's attackers win more of those matches | document | The owner's ruling (2026-10-10): bounced BBs lose more speed. (G12) |
| The spacing and friendly-ricochet guards pass or fail on which fixed seeds a change reshuffles | can wait | `depotMatch.spacing` and `depotMatch.ricochet` sit near their limits. (M87) Beta 1: BT1. |
| The wind can only be read from the dust in the air, and Low quality (and Reduced motion) shows no dust | can wait | The owner's "dust only" default (M30). On Low you learn it from your BBs' drift. |
| A bush doesn't move when a BB goes in: only a few leaves pop out and drift down, with a rustle | can wait | `render/leafFlecks.ts` (FO1). A shiver of the bush's mesh near the hit would read better; it is one merged mesh per map. |
| The BBs' bush is a smooth ellipsoid and the drawn one is lumpy, so a BB can rustle up to a hand's width off the drawn leaves | document | `map/foliage.ts` (shared with bots' sight); the drawn lumps sit up to 14 % of the radius either side of it. (FO1) |
| From deep inside a bush you can still see out (its leaves are drawn from outside only), yet your BBs stop in the leaves | document | "Leaves in the way · step clear to shoot" shows when your own BB stops within 2 m of you. (FO1) |

## Bot behaviour

| Issue | Class | Notes |
|---|---|---|
| Bots still holster on a calm sprint, though a holstered sprint is no longer faster | can wait | Since MV1 holstering speeds up the run, not the sprint, so a bot pays the slower draw for little gain. (MV1) |
| Noisy props are first guesses: a run into a prop is heard by bots 13 to 20 m away, a BB ringing off steel 10 to 12 m, gravel and steel steps 1.35 times as far | playtest | Play Depot and Neon Heights: a knock should feel fair, never a surprise from brushing past. (NP1) |
| Bots switch their torch by mode and distance only: they don't turn it off to hide when a player is near, or point it to blind | playtest | M33h's first policy: on for a fight within 20 m (`BOT_TORCH.fightReach`) and a search's last stretch. (M33h, M71) |
| Hunting bots remember what they saw empty by 4 m square (the hunt sector): a glance into part of one counts for all of it | can wait | M87. A spot behind a crate in a sector partly seen is skipped until `huntMemory` runs out (20–60 s). Playtest whether a hunt still reads as searching. |
| Bots only use their primary, never switch to their sidearm, and jump only to vault (M102) | can wait | Fine for Phase 1. A kit's secondary is carried for the day bots draw it, so they never ask for a pistol's magazine either. |
| Only rushers and Extraction's hunters push to close distance; bots peek only from cover they have taken (crouch cover or a wall corner), never by stepping out | can wait | Stepping out to peek would be a later bot task. (M4b, M10; rushers since BN1) |
| Bot personalities lean Depot's Attack / Defend a few points to the attackers; with ricochets counting the balance figure's 16 matches put it over its band | can wait | BN1: attackers' share with ricochets counting is 73.8 % on seeds 1–16 against 58.3 % on main. Beta 1: BL1. |
| Difficulty numbers are first guesses tuned against headless duels; since G11 Easy hits about the same share of its BBs as Normal | can wait | Easy hits 6.8 % of its BBs, Normal 6.9 % (`ai/balance/depotDifficulty.balance.ts`). Beta 1: BL2. |
| Up close, a bot's first BBs on a fresh contact go wide and walk in; Pro still lands about half its first hits inside 0.75 s at 5 m | document | Deliberate (G11), so you get a fair moment to answer. |
| At 10–16 m a strafing target is still hit about as fast as a standing one | can wait | The BB stream sweeps across it. Raise `aimErrorTracking` if mid-range strafing should help more. |
| Bots walk only for the last 12 m of a search (Normal; careful bots twice that, rushers a quarter); otherwise they run, and are heard | can wait | Careful bots and Pro also walk all the way with a threat in mind (`ai/botBrain.ts`). |
| Footstep ranges are first guesses: bots hear run 11 m, sprint 16 m, land 12 m; you hear other players' steps to 22 m | can wait | Tune from playtests; the player's range is deliberately a bit longer. |
| A bot fighting from crouch cover stops when its own target goes down, even if a second enemy is about | can wait | It re-acquires the next enemy through normal sight. Beta 1: BT1. |
| Long bot-only rounds (60–130 s) happen more often since M4b | can wait | 5-seed Normal check: 3 seeds had one (1 before M4b), ~30 % fewer rounds fit in 150 s. (M4b) Beta 1: BT1. |
| Contact cover starts on first sight, before the reaction delay: at range a bot relocates and holds fire ~1–3 s before peeking | can wait | Deliberate (a beat for you at range), but it may (M4b) |
| Bots occasionally hit a teammate who runs into BBs already in the air (~7 hits in 12 hours of bot-only play, mostly Easy) | can wait | Bots check where moving teammates will be; what is left is a teammate stepping into BBs already in the air. Beta 1: BT1. |
| A bot once stood stuck ~6 s at the doorway of an office side room (search mode; seen once in 12 hours of soak) | can wait | It re-plans after `stuckTime` and gets free; the office was rebuilt since (doorways 1.4 m). Beta 1: BT1. |
| Bots don't ration BBs or play differently on their last magazine; they swap a low one only when nobody is in sight | can wait | The run-dry risk is mostly the player's for now. (M8) |
| Bots don't allow for the wind: in the strongest breeze their long shots drift off a moving or far target | can wait | Owner's default (2026-10-04): same physics, no wind reading. (M30) |
| Bots take a corner of full cover on most fresh contacts, so crate crouch-peeking is rarer than before M10 | can wait | Four bot-only Depot matches: 271 corner spots, 35 behind crates, 14 other. (M10) |
| A bot's pause between bursts stands still while its line of fire is blocked, so it waits out the rest once the line clears | can wait | A one-line fix (`botCombat.ts` shootBot Beta 1: BT1. |
| A drop between a bot and its lean spot stops it short, so it may lean from the wrong place and not see round the corner | can wait | Rare (lean spots sit on walkable cells, within 0.9 m). (C-05) |
| Bots measure most distances in 2D, so on ramps and between floors they under-estimate (~11 % at most) | can wait | Acceptable: heights come from the nav grid where they matter. (Fable audit C-05, KI1) |
| Bots hear gunfire within 22 m (60 % of that through walls) and know roughly where it came from (±30 % of the distance) | document | A BB landing close by tells them at any range; hearing never skips the reaction delay. (M22) |
| Team pacing ignores the player: bots wait for bot teammates only | document | Deliberate (DECISIONS 2026-10-01): a player who holds back must never stall the bots. |
| Spots behind low blocks skip `coverMinRadius`, so a bot may pick a spot under 1 m away | document | Fine for contact cover (that's the point). |
| A lean spot is planned against where the threat was when cover was chosen; if it moves, the bot re-checks at each peek | document | Same as crouch cover, which also judges the spot (M10) |
| Bots pay for moving twice: their own `aimErrorMovingDeg` plus the movement spread the player also has | document | Deliberate and measured (DECISIONS 2026-10-02); retune in Beta if moving bots feel too weak. (M10) |
| Bots' "is it a wall?" test past the target is a heuristic: a corner graze or a hit near a wall's top reads as low cover | document | Errs towards holding fire, never towards friendly hits. (M92) |
| Bots that fight from cover, peek, hold or work the rope stand still, so the steadier aim makes them up to 30 % tighter than in 0.1 Dev 3 | document | The owner's playtest decides; if Normal feels deadlier, tune `steady` or the bots' aim error, not the player's rule. (M12a) |
| Adaptive difficulty (Dev setting): every step and limit is a first guess (a clear win about a fifth of a level up, a loss a quarter down, rounds 0.04–0.05) | playtest | Tune through play on Normal in `config/adaptiveDifficulty.ts` (AD1). |
| Adaptive difficulty: the Match screen's Opponents line names the level you picked; from halfway to the next level the other team plays as that one | playtest | The note under the rules is the only place it shows (AD1). |

## Squad orders

| Issue | Class | Notes |
|---|---|---|
| Squad orders are confirmed by a radio double-click and the HUD line only, no voice line or hand sign | can wait | Voices wait for recorded or generated lines; hand signs need the figures' arm animation. (M22) |
| Squad orders end when you are hit and at each round start; Follow me keeps followers on a fixed side of your heading | can wait | Playtest whether orders should carry over a round, and whether followers bunch up in narrow corridors. (M22, M-05) |
| Follow me behind a hard-zigzagging sprinter: a follower can still flick between running and sprinting 6–9 times in 8 s | can wait | Normal running, walking and gentle weaving are steady (tested). (M22) |
| Follow me round a corner: the follower on the inside of the turn stands still ~2 s while its spot swings past | can wait | Deliberate (it would otherwise overtake you), but it can read as idle. (M22) |
| Follow me checks its blended move direction for drops only, not walls: beside a wall a follower can press into it for a moment | can wait | Checking walls too made the direction flip along every wall. (audit M-08) |
| A tossed magazine leaves the thrower's hand with no throw: neither the figures nor your first-person arms swing | can wait | The magazine, its swish and its slap show the hand-off. (MG1) |
| The tossed magazine is a dark code-made box, though the replicas are Blender models | can wait | No model file. A modelled rifle and pistol magazine would replace it. (MG1) |
| A tossed magazine flies on to the catcher's chest wherever they step, through a corner if they duck behind one while it flies | document | The toss needs a clear line when it leaves the hand. (MG1) |
| Bots with factory magazines rarely run low in a normal round, so your teammates seldom ask for a magazine | playtest | In headless matches bots fire 15 to 61 BBs a round out of 240. (MG1) |

## Pro bots and the "what got you" card

| Issue | Class | Notes |
|---|---|---|
| Pro (dev) Woodland Attack / Defend leans to the attackers now bushes stop BBs: 56.0 % over seeds 1–32, inside the 40–60 % band but high | playtest | BP5: seeds 1–16 lean most (about 60 %). Beta 1: WL1. |
| Pro (dev): side balance and the cost of its held-angle fans are only partly measured | can wait | Bot-only Depot rounds run about as long as Hard's. (M36–M41) |
| The "what got you" card words the direction once, against your view at the hit: it doesn't turn as you look about while spectating | can wait | The red "you're hit" wedge does turn, for the calling seconds. (M41) |
| The card says "was holding that angle", not which one (doorway, corner, bush edge, stair top) | can wait | `HeldAngle` needs a `kind` from `ai/angles.ts` / `angleFeatures.ts`. (M41) |
| "Holding the angle" is judged once, when the bot first sees you; a bot that walked, saw you and stopped to hold reads as not holding | can wait | Sampling at each shot needs per-shot state on the bot. (M41) |
| Pro's tips show between rounds and on Tab, not before round 1 | can wait | No pre-match briefing screen exists or is planned; the Difficulty pop-up's Pro blurb is the only text before round 1. (M41) |
| There is no Playwright step that shows the card | can wait | The setting's row is checked (`e2e/boot.spec.ts`) and a Pro CQB match against Pro opponents runs in the browser (M41) |

## Modes and rules

| Issue | Class | Notes |
|---|---|---|
| Skip to next round shows nothing of the skipped stretch: no hit-feed lines, puffs or sounds for it | can wait | Only the round's end and the next start run the presentation (M83) |
| No pre-round freeze: everyone can move and fire from the round-start whistle | can wait | Spawns are hidden from each other (tested), so nobody can be shot at spawn. Revisit with playtesting. |
| Bot-only Attack / Defend: about 1 round in 7 is won by raising the flag, the rest by wipe-outs; attackers win about half | can wait | Beta balance (raise time, defender holds, retakers): 107 captures in 736 rounds over 96 seeds. (M10, M11) Beta 1: BL1. |
| Overtime flag: whoever already stands at its spot when the clock runs out takes it at once; the cloth hangs edge-on from two sides | playtest | `OVERTIME` (OT1). If that feels cheap, give the flag a short rise before a touch counts. The Dev 6 playtest never saw it. |
| Attack / Defend: two defenders leave their posts as soon as the flag is tagged, so a human can bait them and flank | can wait | Playtest; a defender could wait to see the pole, or retake only past a few percent. |
| Attack / Defend overtime: an attacker and a defender both at the pole (contested) keep overtime going the full 15 s; a pole tagged for a moment at 0:00 gets none | can wait | Overtime counts time the rope is being worked. |
| Strict marshal (`MatchRules.strictMarshal`) is inert: Tournament and Pro CQB set it, nothing reads it, Custom doesn't offer it | can wait | It doubles the overshooting rule (one warning, then you sit the next round out), which doesn't exist until v0.2. (M39) |
| Your team (M98): the score bar keeps Alpha on the left and Beta on the right whichever you pick; menu stills and Practice's armband are Alpha's | document | Fixed sides read the same every match. (M98) |
| Tutorial: the scoreboard and order wheel cards show them (a sample match, a pointer moving round the orders) but the player can't try them there | can wait | The range has no teams or squad to show or order. (M80) TT1 kept these cards. |
| Attack / Defend: bots know how far up the flag is without seeing the pole | document | Deliberate (a flag on a pole is in plain view at a site). |
| The flagpole has no collider: players walk through it and BBs pass through | document | Deliberate (DECISIONS 2026-10-01). |
| The Attack / Defend capture-rate guard (`depotMatch.flag.test.ts`) sits close to the measured values on some layouts | document | M11 Depot: attackers win 51 % on the 16 guard seeds against 38–67 %, 15 captures against a floor of 9. |

## Maps

| Issue | Class | Notes |
|---|---|---|
| Neon Heights (dev): the east end wins a little more of Elimination, 44.5 % to the west over seeds 1-96 | playtest | Attack / Defend is even (attackers 54 %). (M34c, M55, M57, M71, M73) |
| Neon Heights (dev) by Day, Pro Attack / Defend: attackers win ~60 %, the top of the 40-60 % band | playtest | BP2's report read 60.3 % ±3.3 on seeds 1-32 (TE4: 57.9 %), outside but within noise. (M40, M71, M73) |
| Neon Heights (dev) Pro Elimination sits near its band's floor: the west end wins about 41 % of decided rounds | playtest | Within noise (±3.7) of the 40 % floor by Day and Night. (M40, M71, M73, M102) |
| Woodland (dev) Elimination at 5v5: the downhill (west) end still wins a little more, about 57 % of decided rounds at Normal | playtest | Levers if it climbs: lane-point spacing near each camp, `RISE_HEIGHT`, `EAST_FALL`. (M87, M88) Beta 1: WL1. |
| Depot Elimination: the east end wins a little more often in bot-only matches | can wait | West end 48 % over 64 seeds, 49 % on the guard's 16 (`src/ai/balance/depotEnds.balance.ts`). |
| Low draws no skyline: Depot and Neon Heights show plain sky over their walls | can wait | The skyline joins the tree ring at Trees: Layered (`skylineShown`, Medium and up). (MS1) |
| Woodland's boulders keep their collision box's silhouette: they read as stone by texture, facets and moss, not by outline | can wait | Owner rule: no point of a block's box (M33i) MS1 kept the box colliders. |
| A map offering Day and Night with fire lights would show its fire pits cold by day | can wait | Flames, embers and lantern panes are built with the light pools, under a night preset only. (M33i) |
| Practice range: on Low the targets are plain greybox (white discs on a post, flat plywood cut-outs) | can wait | With Map detail (Medium and up) FA7 adds scuffed plates, scoring-zone figures, chains, arms and a shelf. (M21, BP5) |
| Practice range: a BB still in the air when its 2.5 s lifetime ends outside the walls reads as "flew out of bounds · aim lower or turn the hop-up down" | can wait | A very steep lob; rare. Playtest whether the wording fits. (M21, BP5) |
| Neon Heights (dev): from a window (1.2 m sill) on Level 1 or 2 the street right under it is out of sight | document | The approved sill: standing back you see the street from ~4 m out on Level 1, 8 m on Level 2. (M34c, BP5) |
| Depot: the 0.5 m sightline scan stays within 34 m, but a finer 0.25 m scan finds two lines of 34.0–34.1 m | document | 3 cm over the cap, along the north wall; not worth new cover. |
| Depot: from the west end of the loading dock (the ramp top) you can see down the connector into Container Alley | document | Deliberate: the west ramp is the attackers' way up. |
| Practice range: no hit marker on the HUD for a target hit, and steel plates stop BBs rather than deflecting them | document | Deliberate (DECISIONS): the "tock" sound, the ring or falling (M21) |

## Extraction (dev content)

| Issue | Class | Notes |
|---|---|---|
| Extraction's cases have no collider: you, bots and BBs pass through an ammo can, a field case or the marshal's locker | can wait | They stand against walls and in corners, out of the (M44) |
| In Extraction only you open cases; bot teammates don't loot, and the home team guards and patrols the cases but never opens or moves them | can wait | Since M46 teammates cover you while you open. (M44, M46) |
| An Extraction teammate covering you from crouch-only cover still crouches, and crouched it can't see the way it watches | can wait | Corner spots lean out; crouch cover stays by M46's design. Standing up is an owner call. (M55, audit AI-01) |
| Extraction's balance figures play a bot runner, which walks straight to the nearest cases and falls quicker than a careful player | document | Quick runs end before the home team hunts (`depotMatch.extractionHunters.test.ts`). The owner's playtest sets the targets. (M46, M72) |
| Neon Heights' Extraction figure against a Normal home team reads 50 FC a minute on its 48 runs, over the 9–49 band | document | Seeds 1–48 are a high block (over 96 runs the haul is inside the band). Re-measure on more seeds in the bug pass. (BN1) |

## Figures and art

| Issue | Class | Notes |
|---|---|---|
| The pistol armband is off screen | can wait | The glove fingers were slimmed in the art pass. (M14) MV1 kept it. |
| The team camo is printed per part, so its blotches don't run on across a seam, and your sleeves' print is smaller than the figures' | can wait | Readable at play distances on Medium and up. Tune `FIGURE.camo` in `config/characters.ts`. (G11) BD1 kept it. |
| A teammate calling a hit raises an arm to ~0.55 m over the eyes, so up close their grey name tag sits over the raised hand | can wait | FA13 lowered the tag to 0.2 m over the eyes. BD1 kept it. |
| Figure models (M25a): a baked rig turns normals by the bone matrix, not its inverse transpose; copies carry empty bones | can wait | Only rigs with non-uniform bone scale shade wrong (rare in CC0 packs). BD1 kept it. |
| The art pass is mostly procedural: canvas textures, code-built geometry, trees and the built-in figures | can wait | The replicas, parts and rigged figures are Blender GLBs and the font is Inter (OFL). (M14, BP5) |
| Normal maps (Relief maps: Normal, on Medium and High) are worked out from each colour texture's brightness, so a dark stain reads as a slight dent | can wait | Low keeps the bump maps. Proper height data would come with CC0 textures. (FA7, audit F4) |
| Map detail leaves out some of the audit's prop extras | can wait | Container corner castings and door hinges, crate rope handles, the IBC's cage, a cable reel and several signs. (FA7) MS1 left them out too. |
| Third-person figures: crouching squashes the legs, the walk cycle is a simple leg swing, the rifle isn't shown with the pistol drawn, and the hit pose always hangs the rifle | can wait | Animation (knees, slinging) is later work. (M14) BD1 kept it. |
| Some kit still leans military: three of the six looks wear plate carriers, two a bump helmet and headset, and vests and pouches are olive, coyote or charcoal | can wait | A brighter vest or two (`config/characters.ts`) if playtests find the figures too mil-sim. (M14) Beta 1: AX1. |
| The figures' colour test leaves out skin and colours under 0.3 saturation; two darker skin tones sit near the High-contrast orange's hue | can wait | The face is small; check in play with High-contrast team colours. (M14) Beta 1: AX1. |
| The built-in figures show only the rifle's optic, both replicas' torches and (on Player detail High) the rifle's silencer, not grips, lasers or barrels | can wait | The rigged figures (the default since BD1) show every fitted part, except on their far model. (M29b, BG1, BP4) BD1 kept it. |
| A leaning figure's tilt is a simple rotation from the hips (the legs don't shift their weight) | can wait | Phase 4 art and animation pass. BD1 kept it. |
| High contrast's dark orange figures (#b8460c) may be hard to pick out in Depot's shaded corners | can wait | The HUD uses a lighter orange (#e0601a) for text contrast on its panels. (M18b) Beta 1: AX1. |
| A rigged figure that peeks while aiming well up or down points its replica up to about 19° off the shot | can wait | The aim clips pitch the replica in the upper body's frame, then the peek rolls it. BD1 kept it. |
| The rigged robot reloads from its bare chest: it carries no magazine pouch | can wait | Owner's ruling: robots wear no vest, holsters, mags or accessories (2026-10-10). (BF1) BD1 kept it. |
| The rigged figures hold the pistol in the rifle's grip pose in the sprint, the hit call and the walk-off; the Cyber Pistol sits where the gas pistol does | can wait | Those clips were made holding the AEG. (BF1) BD1 kept it. |
| A holstered figure that vaults keeps the Vault clip's arms, its right hand closed as if on the rifle that is slung on its back | can wait | The vault has no holstered version yet; a Holster_Vault clip would fix it. (BP4) BD1 kept it. |
| The figure files still carry the six unused Rest clips (Rifle_ and Pistol_Rest, RestUp, RestDown) | can wait | Rest on cover is gone (MV1); the game ignores the clips, so they cost only download size. (MV1) |
| Your own body casts no shadow, and you see it only looking well down | document | It is drawn 0.17 m behind the eyes without its head and arms, so a headless shadow would look wrong. (BF1, BD1) |
| First-person hand poses are hand-tuned numbers, checked by geometry tests rather than by eye | document | Poses live in `replicaModels.ts`; `handPoses.test.ts` and `fileHandPoses.test.ts` measure them against the replicas' triangles. Whether a hold looks natural is the owner's call. |

## Graphics and performance

| Issue | Class | Notes |
|---|---|---|
| Low's frame time with the Blender figures drawn (the default since BD1) is measured in the container only | playtest | Low is inside its budget lines there (35 draw calls of 100, 54k triangles of 150k). (BD1) |
| Map detail (Medium, High) makes building a match's map take ~0.35 s (Node; 9 ms without it) | can wait | The baked occlusion casts ~2.5 M rays at build, on the first Play of a map and on a Map detail change. |
| The graphics-context test runs on SwiftShader only; a real driver reset (or a laptop switching GPUs) is untested | can wait | Three.js uploads everything again except render targets. (M18b, audit W-01) |
| The replica sheen's rebuild after a lost graphics context is checked only in unit tests with a stand-in target | can wait | It needs a GPU, and the smoke test runs on Low (the sheen is Medium and up). |
| Weapon torch: on Low your own beam is only a soft glow and a lit disc; on Medium the spot casts no shadows (High and Ultra do, since M91) | can wait | The owner's Low rule: no real lights on Low. (M33h) |
| Weapon torch: another player's beam lights no surface with real light (a cone and a disc where its axis lands) and casts no shadow | can wait | Real lights per quality stay fixed, so only your own torch is real. (M33h, M33i) |
| Weapon torch shadows (High, Ultra) fall a little off your aim | document | The real spot starts at the rail (`TORCH_BEAMS.ownRight`, `ownDown`), not the eye. (M91) |
| Weapon torch shadows on WebGPU are checked on the container's software adapter only | playtest | Since M91b the torch views draw on WebGPU the same as on WebGL2 (`webgpu-compare.mjs (M91, M91b) |
| The perf gate has no High or Ultra night run, so the torch shadow map's cost is unmeasured | playtest | One 1024 spot shadow map, drawn once on its first frame (M91b) and then only while your torch is on. (M91) |
| A bot very close to a torch looks over-bright | can wait | Seen while checking M91 on Woodland at night; the same on main. Tune with the figures' lighting. (M91) |
| Weapon torch: on a night map on Medium and up, if a bot carries a torch and you fit none, the spot for your own torch is still kept | can wait | So the view can follow a spectated bot's beam. (M33h, BP5) |
| The practice range compiles ~24 shader programs on Medium and High (Depot ~13) | can wait | FA7's painted plates, figures, chains and fittings each get their own material variant. |
| On Medium and up the shadow depth shaders, a figure's first fade and two post-stack pipelines may still compile in a match's first frame | can wait | Three's compile skips the shadow pass, so warming it needs a real shadow draw. (M63, KI1) Beta 1: PF1. |
| On Low, the first switch to the replica not in hand still costs about 10–25 ms of CPU on its first draw | can wait | MV1 compiles every carried replica before the round. (MV1) Beta 1: PF1. |
| Baked light (G6): a `figure.glb` dropped into the assets folder keeps its own materials, so the probes don't dim or tint it | can wait | A model's materials need the same two lines as the built-in one in `externalModels.ts`. (M25a, BP5) |
| Depot's signs and stains are one blended mesh (G6), so where a sign is seen through another see-through surface the order may be wrong | can wait | `mapDecals.ts`. Depot has no glass; splitting the stains costs a draw call. |
| At High (1024 px) one library surface texture takes ~0.7-0.9 s to draw (container), so a map's first Play draws its set in the click | can wait | BP2 moved the title screen's warm-up to one core surface per idle moment. |
| At Medium and up the node renderer keeps three multisampled buffers: the canvas, the post stack's scene target (4 samples, half float) and the held replica's own target | can wait | Estimated ~235 MB at 1920 × 1080 (not measured on a GPU) |
| Night lamps' real point lights (Medium and High) light the slab above them, so a ceiling reads warm (faintly olive on Neon Heights' plaster) and a lamp can light the room above | document | Kept (owner, 2026-10-05): physically right, Medium and High only. |
| Woodland at 6v6 (M88) is unmeasured on Medium and High; the perf harness picks Woodland at its standard 5v5 | document | Low is checked at 6v6 (74 draw calls, 86k triangles). Medium's Extraction run already averages 113 of its 120 draw calls. Needs a laptop run. (BP5) |
| Woodland on Medium at 5v5 sits close to its ceiling: ~197k of 200k triangles and 114 of 120 draw calls (before M75) | document | Ten figures and their shadows take 108k. (M33i, M48, M75, G9) |
| Neon Heights' Medium Extraction run on WebGPU is over its 200k triangle line on main (about 203k in the container; the baseline from c7be475 read 194k) | fix now | Found by UX1's gate, which changes no scene; measured on main at 69d69f5. The gate's perf check fails for any task whose diff reaches it until it is trimmed or the line is raised by a DECISIONS entry. (UX1) |
| Neon Heights on Medium (Extraction) sits close to its draw-call budget: about 138 of 145 after G9's dressing | document | The budget is `maps.neon` in `pipeline/perf-budget.json`. (BP5) |
| Medium keeps a 6.3 MB prefiltered environment map on the GPU | document | Built once from the sky and shared with the replica sheen. (FA7, F1) |
| Baked light (G6): under a roof the probes keep about a third of the sky light, so a covered spot reads lighter than a real one | document | Rays that reach open ground count as open, standing for the hemisphere's ground light. |
| BB streaks, dust motes and flag cloth are checked garbage-free in Node's V8 only | document | After M77 each measures 0 B a frame in Node (before: 3.7–7.9 KB at 20 BBs, 2.2 KB (audit REN-10) |
| Game events allocate a small vector each (shot, impact, hit) | document | A few per tick at most, not per frame; pool them if profiling shows GC pauses. |
| On WebGPU the nearest fire casts no shadow, other players' torches light the ground as WebGL's lit discs, and neon signs cast no coloured light | can wait | Built and measured in W3: each failed the look bar or doubled the draws. |
| Depot's near and far player views on real WebGPU sit just over the look bar (mean 0.51–0.63 against 0.5) | can wait | Container only (SwiftShader): edges and a faint grain, not a material. The owner ruled. (W3) |
| On WebGPU the stars and the fires' embers carry a little more light than on WebGL (QA at Low: +14 % and +48 %) | can wait | A point a pixel or two wide is a quad on the node path and a point sprite on WebGL, which cover sub-pixel sizes differently. (W2) |
| On real WebGPU the retro filter's picture sits over the look bar's pixel share (1.5–3.1 % of pixels against 1 %) | can wait | Container only: the filter draws at a quarter size, so SwiftShader's edge differences cover 16 pixels each. The owner ruled. (W4, BP3) |
| On the node renderer's WebGL2 back end the GPU grass and tree stand-ins draw every slot, culled ones as nothing | document | Transform-feedback compute has no indirect draws. (W5) |
| On WebGPU the perf harness and the comparison count the grass and stand-ins' triangles at their caps | document | Three counts an indirect draw from the CPU's instance count. (W5, W6a) |
| The tree stand-ins beyond Woodland's fence are flat cards close up and cast no shadow | can wait | Each is a billboard blending two of 8 pictured views. (W5) MS1 kept them. |
| The node path's compute passes and lights lean on Three 0.186's private API | document | `computeKit.ts`, `nightLights.ts`, `deferredFrees.ts` and `nodeBackend.ts` log one console error when an upgrade renames what they use. Recheck all on a Three upgrade. (W5, BP3) |
| In the container's software WebGPU, growing the window mid-match on Medium without the retro look stops the page's frames for good | can wait | Seen in BP3 and the same on main before it; likely the software GPU process, not the game. (BP3) |
| On the node renderer an antialiasing change waits for the next load | document | A node renderer can't change its samples in place. (W1, W6a) |

## Audio

| Issue | Class | Notes |
|---|---|---|
| The silencer's muffled shot (`suppressedCopies`, M29b) is checked by unit tests only | can wait | It is in the game now (the Silencer muzzle part: muffled, and heard from less far by bots, the minimap and the cues). (M13) |
| Muffling uses straight rays only: a sound just around a corner is muffled as if it came through the wall | can wait | Two rays per character (knees and head); diffraction would need a path search. (M13) |
| The AEG's motor spin-up starts with the first shot and may be masked by it | can wait | Playtest whether the wind-up is heard on a fresh trigger pull; if not, raise it or lead the shot by a few ms (`Sfx.shot`). (M13) |
| The AEG's motor wind-down plays up to a frame late after the trigger is let go | can wait | It follows the simulation's clock, checked once per tick; timed on the audio clock, 25–33 (bug pass) |
| The woods' sounds stay in memory for the page once a Woodland match has loaded (6.45 MB by night with its echo) | can wait | Rendered once and kept, so a second Woodland match loads them free. (M33j, M69, audit 2) |
| Sounds are all synthesised; no CC0 samples were added in M13 | document | The roadmap allows samples where synthesis falls short; the owner's playtest decides which sounds (if any) need one. |
| Crouch, stand and lean rustle is presentation only: bots don't hear it | document | Deliberate: the roadmap keeps how far bots hear each sound as it was. You hear it within 9 m. (M13) |
| Footsteps play a little quieter than before M13 so a shot stands out above them | document | A test keeps a shot at least 1.5× a bot's loudest step, so `AUDIO.levels.step` is near its ceiling. (M13) |

## Menus, HUD and input

| Issue | Class | Notes |
|---|---|---|
| The spare-magazine gauges show no number for each magazine | can wait | Beta UX/QoL: the ammo panel already prints the spare BBs ("/ 120"); a gauge's low is striped and next has a caret, so they don't rely on colour. (BP5, HD1) |
| Exit rings and markers are one green in every team colour set, which a deuteranope can find muddy beside the orange team | can wait | Decision 17: keep until a (audit UI-15) Beta 1: AX1. |
| Sound cues for several sounds from the same direction stack on the ring (hit calls sit just outside it) | can wait | One marker per player and kind; playtest whether a busy fight reads. (M18b) |
| The hit feed wraps a long line (friendly fire with a ricochet tag) to two rows to keep clear of the scoreboard | can wait | Since BP3 a plain line fits on one row at 1280 and 1366 px. (bug pass, FA5) |
| At 1280 × 720 the held pistol's firing glove and sleeve pass under the ammo panel's left end | document | The pistol, grip included, ends 42 px clear of the panel; the glove reaches about 110 px under it. Clearing it would put the pistol near mid-view, so MV1's hold stays. (BP3, UX1) |
| The minimap draws Depot's loading dock at the floor's level (a lighter shade); a patch for a player heard on the dock looks like one below | can wait | A map with storeys (Neon Heights) gets one drawing per storey. (M23, BP5) |
| Dev settings' Game speed runs the simulation slower or faster, but sounds keep their pitch and the replica's bob and sway run on real time | can wait | A toy for watching BBs fly; timing-sensitive presentation isn't speed-aware. (M24) |
| The crosshair shows the spread only, not the recoil kick | document | Recoil is light on toy-like replicas; revisit in the Phase 4 HUD pass. (M10) |
| The round's table shows by itself between rounds and covers the middle of the screen | document | Since HD1 it waits for the WON or LOST stamp, and a click moves on at once. The owner's playtest decides whether it should wait for Tab. (M19, HD1) |
| Dev settings' Ghost: bots still see you and shoot at you (their BBs pass through) | document | Deliberate: for walking the field under fire, not for hiding. (M24) |
| With Dev content on, a Match screen map card with a Dev tag or the Day and Night buttons is about twice as tall at 1280 px wide | can wait | It grows so the tags stay off the map's name (Dev 5 playtest, note 1). Dev content only. (M94, PT1) MR1 kept the taller card. |

## Save and browsers

| Issue | Class | Notes |
|---|---|---|
| Esc on the pause screen resumes (UI-09), but Esc isn't a user activation, so Chrome may refuse the re-lock and show only the "click again" hint | playtest | Check in Chrome and Firefox: Esc to pause, wait 1 s, Esc again. (FA5/FA9) Beta 1: IN1. |
| Firefox ignores `unadjustedMovement` (raw mouse input) | can wait | Sensitivity may feel different from Chrome and Edge when OS acceleration is on. Beta 1: IN1. |
| No browser test runs in Firefox | can wait | The fix is a Playwright `firefox` project, but the pipeline containers have Chromium only and block the download. (audit CORE-09) Beta 1: IN1. |
| The side mouse buttons' back / forward is blocked by `preventDefault` on mousedown, mouseup and auxclick; checked in Chromium only | can wait | If Firefox still goes back a page, guard with a history entry or warn on the Key bindings tab. (M18a) Beta 1: IN1. |
| The fullscreen key drops the mouse lock in Chrome and Firefox as the page enters or leaves fullscreen | can wait | FA5 takes the lock again straight away; checked only in headless Chromium, which has neither. (audit UI-19) Beta 1: IN1. |
| The hardware acceleration warning trusts a `failIfMajorPerformanceCaveat` probe where the browser hides the renderer's name | can wait | Checked only on SwiftShader; the owner to confirm no warning shows in Firefox and Chrome with acceleration on. (M18b) Beta 1: IN1. |
| Mouse look and Esc's lock exit have no automated test | document | Headless Chromium grants the pointer lock and `e2e/release.spec.ts` plays the release build with it. (FA11a, audit CORE-09) |
| The save can't tell a private window: the browser keeps it only until the window closes, and the game doesn't warn | document | Browsers don't say they are private; the Save tab's first line says so, and Download is the backup. (M31) |
| The save's automated browser tests run Chromium only (Chrome and Edge); Firefox is checked by hand | document | The container has no Firefox; `docs/PLAYTEST.md` › Save lists the checks. Safari is untested. (M31, BP5) |
| A save file's checksum catches damage, not cheating: anyone can edit a file and recompute it | document | Owner's default (M31). Single-player and public code, so a signature would only stop casual edits. |
| Restore points and Undo live in the same browser storage as the save, so clearing the site's data removes them too | document | They cover a bad write or load; a downloaded file covers a wiped browser. (M31) |
| Chrome logs a harmless "AudioContext was not allowed to start" warning at load | document | The page's one context is made (suspended) before any click so sounds can render in (M13, audit M-09) |

## Build, tests and pipeline

| Issue | Class | Notes |
|---|---|---|
| The picture compare's WebGL reference (b10c006) no longer matches Woodland or the figures, so those pairs fail on content, not drawing | document | Since b10c006, M88 rebuilt Woodland and RM4's replicas draw part by part. (W6b) |
| The WebGPU twins' and particles' allocation tests count heap growth, which can run over their limit while the bot-match guards run beside them | can wait | Seen four times on a local gate, never alone; each passed on the re-run. Widen or isolate them if it recurs. |
| A map's team-colour rule reads each block's tint, and a textured block's tint is white, so an orange or blue texture would pass it | can wait | The skin checks measure each map as painted in the browser (`measureMapPalettes`). (CT2, CT4) |
| `config/renderView.ts` and `config/audio.ts` hold small derived helpers (whistle schedule, result-screen delay), and renderView imports audio | can wait | Fine at this size; move derived timing into a module if config grows more logic. (BP2) |
| `config/bots.ts` imports `MOVEMENT` (for `leanRoomMargin`), so one config file depends on another | can wait | Small; move the shared value if it grows. (M10) |
| Menus logic is covered by the e2e smoke test only (vitest has no DOM): screen and focus logic, `KeySettings`, the teammate-level default | can wait | The pure parts have unit tests. Testing the teammate-level rule needs the dialog logic out of `Menus`. (M20, FA5) |
| The smoke test ends its short match by writing the score and the opponents' `status` straight into the sim state, skipping `eliminate()` | can wait | Works today; a debug hook (like the tutorial's `debugJumpTo`) would be cleaner. (audit fixes critic, L-27) |
| `Game` still holds about 30 saved settings, each loaded in its constructor and applied by a Menus callback (a `changeX` per field) | can wait | Audit CORE-05 part 1: a `GameSettings` object with an `apply(target)`. |
| `MatchSession` has no unit test without a renderer: the result pause and `restart` on Resume are checked by the smoke test only | can wait | The constructor builds the HUD and sounds on the page and vitest has no DOM. (audit CORE-23, FA11b) |
| The smoke test can only open and close the order wheel: it plays without the mouse lock, so it can't move the wheel's pointer | can wait | `playerInput.test.ts` covers picking; checked by hand in a scripted match. (M23) |
| `docs/IDEAS.md` lists supply weekends and dated events as declined, but M49 built them | can wait | The owner's ruling text is kept as written; ask him which stands when IDEAS is next reviewed. (TE2) Beta 1: RV1. |
| A release zip shows its version only if GitHub fills in `.git_archival.txt` (export-subst) | document | Checked in a checkout (`git describe`) and a shallow clone; the first tagged zip (M24) |
| The audio ambience tests (`src/audio/audio.test.ts`) can hit vitest's 5 s timeout on a heavily loaded machine (load average above ~20 on 4 cores) | document | Seen only in the build container with several workers at once. |
| CI's browser smoke has failed twice with no detail in the log (2222aa7, 9bfd038) and passed on the next run | document | FA11b's summary now prints the failing test, locator and values. On GitHub's Chrome 153 only, in-match key steps once timed out on slow early frames. |
| `sim/testSupport.ts` (test fixture) lives in the source tree | document | Harmless (tree-shaken from the build). Test fixtures beside their code as `*Support.ts` are the convention now. (KI1) |
