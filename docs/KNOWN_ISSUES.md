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
| The Red Laser draws no dot in the world, only its module and a tighter spread (hip and aimed alike) | can wait | A dot needs a ray per frame; the fading beam (`Settings › Graphics › Laser beam`, off on every preset) stops short of anything. (M26b, FA8, BP6d) |
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
| `stepVaultReady` casts its level rays for bots too, though only the player's vault prompt reads the result | can wait | Small and allocation-free; skip it for bots when profiling says ticks matter. (BP6a) |
| Ledges 0.2–0.3 m tall are climbable only sometimes (sprinting yes, crouching no) | document | Rapier autostep with capsules. Keep map ledges ≤ 0.15 m or at least uncrossable cover height (tested for Depot). |
| Rapier's capsule controller sinks into cuboid colliders along their diagonals | document | Worked around: level blocks are trimeshes (DECISIONS). Never add cuboid level colliders. |
| A capsule spawned overlapping a block is trapped inside it | document | Spawns and bot placement must never overlap level geometry. |
| Movement reads the lean from the previous tick (`stepLean` runs after `stepMovement`) | document | One 60 Hz tick; harmless. |
| The ground probe runs on every falling tick; jumping against cover tops in Rapier is untested | document | Only unit tests and headless matches cover it. (M11) |

## BBs and hits

| Issue | Class | Notes |
|---|---|---|
| Bushes stopping BBs are first guesses: 0.6 m of leaves stops a BB; one through an edge leaves up to 0.5 rad a metre off its line at 0.35 of its speed | playtest | `BALLISTICS.leaves` (FO1). Play Woodland: a shot through a bush's edge should feel like a gamble, and bots holding fire should not leave fights stuck. |
| The hit volume is capsules, so it misses or overhangs the drawn figure by a few cm at the rim (built-in figures: at most 3.5% of the drawn body, 2.7% of the volume; rigged figures: 3.4% and 2.4%) | can wait | `render/figures/figureHitVolume.test.ts` and `riggedHitVolume.test.ts` hold each to its bar. (M85, HV1) |
| Arms and replicas neither count as hits nor stop BBs: a BB through a figure's forearm flies on | document | Owner ruling (DECISIONS 2026-10-01, arm hits off). (M85) |
| Against a bot that strafes, aiming barely raises your share of BBs that hit (Normal, 15 to 35 m: 49 / 31 / 14% hip, 51 / 25 / 14% aimed) | can wait | The strafe, not the spread, decides most misses. (M84) |
| Tracer visibility was reviewed on paper only (no per-replica tracer setting) | can wait | Fine with three replicas; give tracers per-replica settings when more platforms arrive. (M9) |
| Depot IBC tanks bounce BBs like steel though most of one is plastic; sandbag and gabion textures add 2 draw calls | can wait | Their memory (0.7 MB on Low) is in each preset's texture budget. (M25b, FA2) |
| With Ricochets count on, bounced BBs still decide about a fifth of hits, and Attack / Defend's attackers win more of those matches | document | The owner's ruling (2026-10-10): bounced BBs lose more speed. (G12) |
| The spacing and friendly-ricochet guards pass or fail on which fixed seeds a change reshuffles | can wait | `depotMatch.spacing` and `depotMatch.ricochet` sit near their limits. (M87) Beta 1: BT1. |
| The wind can only be read from the dust in the air, and Low quality (and Reduced motion) shows no dust | can wait | The owner's "dust only" default (M30). On Low you learn it from your BBs' drift. |
| A bush doesn't move when a BB goes in: only a few leaves pop out and drift down, with a rustle | can wait | `render/effects/leafFlecks.ts` (FO1). A shiver of the bush's mesh near the hit would read better; it is one merged mesh per map. |
| The BBs' bush is a smooth ellipsoid and the drawn one is lumpy, so a BB can rustle up to a hand's width off the drawn leaves | document | `map/foliage.ts` (shared with bots' sight); since MS1's look (`FOLIAGE_LOOK`: lump 0.18, three lobes, leafy 0.06) the drawn lumps run from about 17 % of the radius inside it to 30 % outside. (FO1, MS1) |
| From deep inside a bush you can still see out (its leaves are drawn from outside only), yet your BBs stop in the leaves | document | "Leaves in the way · step clear to shoot" shows when your own BB stops within 2 m of you. (FO1) |

## Bot behaviour

| Issue | Class | Notes |
|---|---|---|
| Bots still holster on a calm sprint, though a holstered sprint is no longer faster | can wait | Since MV1 holstering speeds up the run (5.4 m/s since MV2), not the sprint, so a bot pays the slower draw for little gain. Tuning: `config/botsMovement.ts` (`holsterAfter`, `holsterCalmFor`). (MV1, MV2) |
| Noisy props are first guesses: a run into a prop is heard by bots 13 to 20 m away, a BB ringing off steel 10 to 12 m, gravel and steel steps 1.35 times as far | playtest | Play Depot and Neon Heights: a knock should feel fair, never a surprise from brushing past. (NP1) |
| Bots switch their torch by mode and distance only: they don't turn it off to hide when a player is near, or point it to blind | playtest | M33h's first policy: on for a fight within 20 m (`BOT_TORCH.fightReach`) and a search's last stretch. (M33h, M71) |
| Hunting bots remember what they saw empty by 4 m square (the hunt sector): a glance into part of one counts for all of it | can wait | M87. A spot behind a crate in a sector partly seen is skipped until `huntMemory` runs out (20–60 s). Playtest whether a hunt still reads as searching. |
| Bots only use their primary, never switch to their sidearm, and jump only to vault (M102) | can wait | Fine for Phase 1. A kit's secondary is carried for the day bots draw it, so they never ask for a pistol's magazine either. |
| Only rushers and Extraction's hunters push to close distance; bots peek only from cover they have taken (crouch cover or a wall corner), never by stepping out | can wait | Stepping out to peek would be a later bot task. (M4b, M10; rushers since BN1) |
| Difficulty numbers are first guesses tuned against headless duels; Easy plays only a little below Normal | can wait | Easy hits 5.5 % of its BBs, Normal 6.5 % (BP6b, 16 seeds; G11 read 6.8 / 6.9), and its first hit at 5 m comes at 2.1 s to Normal's 1.5 s. BL2 wants Easy at 75 % of Normal's share (now 85 %). (`ai/balance/depotDifficulty.balance.ts`) Beta 1: BL2. |
| Up close, a bot's first BBs on a fresh contact go wide and walk in; Pro still lands about half its first hits inside 0.75 s at 5 m | document | Deliberate (G11), so you get a fair moment to answer. |
| At 10–16 m a strafing target is still hit about as fast as a standing one | can wait | The BB stream sweeps across it. Raise `aimErrorTracking` if mid-range strafing should help more. |
| Bots walk only for the last 12 m of a search (Normal; careful bots twice that, rushers a quarter); otherwise they run, and are heard | can wait | Careful bots and Pro also walk all the way with a threat in mind (`ai/botBrain.ts`). |
| Footstep ranges are first guesses: bots hear run 11 m, sprint 16 m, land 12 m; you hear other players' steps to 22 m | can wait | Tune from playtests; the player's range is deliberately a bit longer. |
| A bot fighting from crouch cover stops when its own target goes down, even if a second enemy is about | can wait | It re-acquires the next enemy through normal sight. Beta 1: BT1. |
| Long bot-only rounds (over 130 s) still happen now and then | can wait | BP6b's soak: 9 of about 700 rounds ran over 130 s, none ran out the clock. (M4b, BP6b) Beta 1: BT1. |
| Contact cover starts on first sight, before the reaction delay: at range a bot relocates and holds fire ~1–3 s before peeking | can wait | Deliberate (a beat for you at range), but it may read as the bot ignoring you. Playtest. (M4b) |
| Bots occasionally hit a teammate who runs into BBs already in the air (2 in 128 soak matches, about 4,800 hits, both on Easy, Woodland) | can wait | Bots check where moving teammates will be; what is left is a teammate stepping into BBs already in the air. (BP6b) Beta 1: BT1. |
| Bots don't ration BBs or play differently on their last magazine; they swap a low one only when nobody is in sight | can wait | The run-dry risk is mostly the player's for now. (M8) |
| Bots don't allow for the wind: in the strongest breeze their long shots drift off a moving or far target | can wait | Owner's default (2026-10-04): same physics, no wind reading. (M30) |
| Bots take a corner of full cover on most fresh contacts, so crate crouch-peeking is rarer than before M10 | can wait | Four bot-only Depot matches: 271 corner spots, 35 behind crates, 14 other. (M10) |
| A bot's pause between bursts stands still while its line of fire is blocked, so it waits out the rest once the line clears | can wait | Fix: count `pauseLeft` down before the blocked return (`ai/botCombat.ts` shootBot). KI1 reverted it: it failed the overtime and stackHouse guards, and in BP2 the spacing guard. Bundle it with the spacing fix, 48 seeds. Beta 1: BT1. |
| A drop between a bot and its lean spot stops it short, so it may lean from the wrong place and not see round the corner | can wait | Rare (lean spots sit on walkable cells, within 0.9 m). (C-05) |
| Bots measure most distances in 2D, so on ramps and between floors they under-estimate (~11 % at most) | can wait | Acceptable: heights come from the nav grid where they matter. (Fable audit C-05, KI1) |
| Bots hear gunfire within 22 m (60 % of that through walls) and know roughly where it came from (±30 % of the distance) | document | A BB landing close by tells them at any range; hearing never skips the reaction delay. (M22) |
| Team pacing ignores the player: bots wait for bot teammates only | document | Deliberate (DECISIONS 2026-10-01): a player who holds back must never stall the bots. |
| Spots behind low blocks skip `coverMinRadius`, so a bot may pick a spot under 1 m away | document | Fine for contact cover (that's the point). |
| A lean spot is planned against where the threat was when cover was chosen; if it moves, the bot re-checks at each peek | document | Same as crouch cover, which also judges the spot against the last known position. (M10) |
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
| Pro (dev): side balance and the cost of its held-angle fans are only partly measured | can wait | Bot-only Depot rounds run about as long as Hard's. (M36–M41) |
| The "what got you" card words the direction once, against your view at the hit: it doesn't turn as you look about while spectating | can wait | The red "you're hit" wedge does turn, for the calling seconds. (M41) |
| The card says "was holding that angle", not which one (doorway, corner, bush edge, stair top) | can wait | `HeldAngle` needs a `kind` from `ai/angles.ts` / `angleFeatures.ts`. (M41) |
| "Holding the angle" is judged once, when the bot first sees you; a bot that walked, saw you and stopped to hold reads as not holding | can wait | Sampling at each shot needs per-shot state on the bot. (M41) |
| Pro's tips show between rounds and on Tab, not before round 1 | can wait | No pre-match briefing screen exists or is planned; the Difficulty pop-up's Pro blurb is the only text before round 1. (M41) |
| There is no Playwright step that shows the card | can wait | The setting's row is checked (`e2e/boot.spec.ts`) and a Pro CQB match runs in the browser (`e2e/rulesets.spec.ts`); showing the card needs a staged hit. Unit tests cover the facts, words and setting. (M41) |

## Modes and rules

| Issue | Class | Notes |
|---|---|---|
| Skip to next round shows nothing of the skipped stretch: no hit-feed lines, puffs or sounds for it | can wait | Only the round's end and the next start run the presentation (M83) |
| No pre-round freeze: everyone can move and fire from the round-start whistle | can wait | Spawns are hidden from each other (tested), so nobody can be shot at spawn. Revisit with playtesting. |
| Bot-only Attack / Defend: about 1 round in 6 is won by raising the flag, the rest by wipe-outs; attackers win about half | can wait | BP6b's Depot soak: 20 of 116 rounds at the pole (Easy to Hard 1 in 4.6, Pro none of 24); attackers 54.9 % at Normal. (M10, M11, BP6b) Beta 1: BL1. |
| Overtime flag: whoever already stands at its spot when the clock runs out takes it at once; the cloth hangs edge-on from two sides | playtest | `OVERTIME` (OT1). Seen in BP6b's browser matches: touched 2 s after it rose. If that feels cheap, give the flag a short rise before a touch counts (William's checklist). |
| Attack / Defend: two defenders leave their posts as soon as the flag is tagged, so a human can bait them and flank | can wait | Playtest; a defender could wait to see the pole, or retake only past a few percent. |
| Attack / Defend overtime: an attacker and a defender both at the pole (contested) keep overtime going the full 15 s; a pole tagged for a moment at 0:00 gets none | can wait | Overtime counts time the rope is being worked. |
| Strict marshal (`MatchRules.strictMarshal`) is inert: Tournament and Pro CQB set it, nothing reads it, Custom doesn't offer it | can wait | It doubles the overshooting rule (one warning, then you sit the next round out), which doesn't exist until v0.2. (M39) |
| Your team (M98): the score bar keeps Alpha on the left and Beta on the right whichever you pick; menu stills and Practice's armband are Alpha's | document | Fixed sides read the same every match. (M98) |
| Tutorial: the scoreboard and order wheel cards show them (a sample match, a pointer moving round the orders) but the player can't try them there | can wait | The range has no teams or squad to show or order. (M80) TT1 kept these cards. |
| Attack / Defend: bots know how far up the flag is without seeing the pole | document | Deliberate (a flag on a pole is in plain view at a site). |
| The flagpole has no collider: players walk through it and BBs pass through | document | Deliberate (DECISIONS 2026-10-01). |
| The Attack / Defend capture-rate guard (`depotMatch.flag.test.ts`) sits close to the measured values on some layouts | document | It keeps captures at 9 or more on its 16 seeds (M71 read 14); the attackers' share band, 38–67 %, is reported by `ai/balance/depotFlag.balance.ts` (M71: 57 %). (M11, M71) |

## Maps

| Issue | Class | Notes |
|---|---|---|
| Woodland (dev) Elimination at 5v5: the downhill (west) end's share of decided rounds has swung with each change | playtest | BP6b (after WL3): Normal 38.6 % ±6.4, near its 35 % floor; Hard 45.0 %, Pro 47.3 %. Levers: lane-point spacing near each camp, `RISE_PEAK`, `EAST_FALL`, the meadow swells. (M87, M88, WL2, WL3, BP6b) Beta 1: WL1. |
| Depot Elimination: the east end wins a little more often in bot-only matches | can wait | West end 42.5 % on the balance report's seeds (BP6b), inside its 35–60 % band (`src/ai/balance/depotEnds.balance.ts`). (M71, BN1, BP6b) |
| Low draws no skyline: Depot and Neon Heights show plain sky over their walls | can wait | The skyline joins the tree ring at Trees: Layered (`skylineShown`, Medium and up). (MS1) |
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
| Extraction's cases have no collider: you, bots and BBs pass through an ammo can, a field case or the marshal's locker | can wait | They stand against walls and in corners, out of the lanes, so they don't read as cover. A collider per case adds level geometry and nav blocking; do it with an art pass if playtests find it odd. (M44) |
| In Extraction only you open cases; bot teammates don't loot, and the home team guards and patrols the cases but never opens or moves them | can wait | Since M46 teammates cover you while you open. (M44, M46) |
| An Extraction teammate covering you from crouch-only cover still crouches, and crouched it can't see the way it watches | can wait | Corner spots lean out; crouch cover stays by M46's design. Standing up is an owner call. (M55, audit AI-01) |
| Extraction's balance figures play a bot runner, which walks straight to the nearest cases and falls quicker than a careful player | document | Quick runs end before the home team hunts (`depotMatch.extractionHunters.test.ts`). The owner's playtest sets the targets. (M46, M72) |
| Woodland's Extraction reads easy since WL2 took the boulders out: against a Normal home team 56 % of runs out (18–48 %) and 56 XP a minute (12–52), against Easy 75 % (39–69) | document | BP6b's balance report; was 35 % and 33 XP before WL2. The figures play a bot runner (row above). Tune it after William plays Extraction on Woodland (his checklist), with the case spots and the home team's holds as levers. (WL2, WL3, BP6b) |

## Figures and art

| Issue | Class | Notes |
|---|---|---|
| The pistol armband is off screen | can wait | The glove fingers were slimmed in the art pass. (M14) MV1 kept it. |
| The team camo is printed per part, so its blotches don't run on across a seam, and your sleeves' print is smaller than the figures' | can wait | Readable at play distances on Medium and up. Tune `FIGURE.camo` in `config/characters.ts`. (G11) BD1 kept it. |
| A teammate calling a hit raises an arm to ~0.55 m over the eyes, so up close their grey name tag sits over the raised hand | can wait | RM9 set the tag 0.18 m over the eyes (`config/matchInfo.ts` `aboveEyes`). BD1 kept it. (FA13, RM9) |
| Figure models (M25a): a baked rig turns normals by the bone matrix, not its inverse transpose; copies carry empty bones | can wait | Only rigs with non-uniform bone scale shade wrong (rare in CC0 packs). BD1 kept it. |
| The art pass is mostly procedural: canvas textures, code-built geometry, trees and the built-in figures | can wait | The replicas, parts and rigged figures are Blender GLBs and the font is Inter (OFL). (M14, BP5) |
| Normal maps (Relief maps: Normal, on Medium and up) are worked out from each colour texture's brightness, so a dark stain reads as a slight dent | can wait | Low keeps the bump maps. Proper height data would come with CC0 textures. (FA7, audit F4) |
| Map detail leaves out some of the audit's prop extras | can wait | Container corner castings and door hinges, crate rope handles, the IBC's cage, a cable reel and several signs. (FA7) MS1 left them out too. |
| The built-in figures (drawn only when a model file fails to load): crouching squashes the legs, the walk cycle is a simple leg swing, the rifle isn't shown with the pistol drawn, and the hit pose always hangs the rifle | can wait | The rigged figures (the default since BD1) play walk and crouch-walk clips and sling the rifle with the pistol drawn. (M14, BD1) |
| The built-in figures show only the rifle's optic, both replicas' torches and (on Player detail High) the rifle's silencer, not grips, lasers or barrels | can wait | The rigged figures (the default since BD1) show every fitted part, except on their far model. (M29b, BG1, BP4) BD1 kept it. |
| A leaning figure's tilt is a simple rotation from the hips (the legs don't shift their weight) | can wait | Phase 4 art and animation pass. BD1 kept it. |
| High Contrast's orange team paint still reads poorly for a protanope in Depot's darkest corners | can wait | Measured in the game (AX1): with the paint glow, ΔE 16–18 from the wall for a protanope, 25–26 for a deuteranope and 37–40 for normal vision (8–14 without it). Orange-red looks dark to a protanope whatever its lightness; names, the hit marker and the HUD carry the teams. The built-in figures (drawn only when a model file fails to load) have no glow. |
| A rigged figure that peeks while aiming well up or down points its replica up to about 19° off the shot | can wait | The aim clips pitch the replica in the upper body's frame, then the peek rolls it. BD1 kept it. |
| The rigged robot reloads from its bare chest: it carries no magazine pouch | can wait | Owner's ruling: robots wear no vest, holsters, mags or accessories (2026-10-10). (BF1) BD1 kept it. |
| The rigged figures hold the pistol in the rifle's grip pose in the sprint, the hit call and the walk-off; the Cyber Pistol sits where the gas pistol does | can wait | Those clips were made holding the AEG. (BF1) BD1 kept it. |
| A holstered figure that vaults keeps the Vault clip's arms, its right hand closed as if on the rifle that is slung on its back | can wait | The vault has no holstered version yet; a Holster_Vault clip would fix it. (BP4) BD1 kept it. |
| The figure files still carry the six unused Rest clips (Rifle_ and Pistol_Rest, RestUp, RestDown) | can wait | Rest on cover is gone (MV1); the game ignores the clips, so they cost only download size. (MV1) |
| A figure's held replica casts its shadow from its small version (PF4), so in a close reload the shadow keeps the magazine in place for a moment beside the hand's copy | can wait | A few shadow-map texels for about a second; the whole model's shadow cost ~9k triangles a figure. (PF4) |
| Your own figure casts no shadow | document | It is never drawn in first person, and holds no replica there (the first-person one is in view), so its shadow would show empty hands. (BF1, BD1, MV2) |
| First-person hand poses are hand-tuned numbers, checked by geometry tests rather than by eye | document | Poses live in `replicaModels.ts`; `handPoses.test.ts` and `fileHandPoses.test.ts` measure them against the replicas' triangles. Whether a hold looks natural is the owner's call. |

## Graphics and performance

| Issue | Class | Notes |
|---|---|---|
| Ultra at 4K misses the 240 Hz aim on every map: p95 5.4 to 6.0 ms on WebGPU against 4.17 ms (owner's desktop, 2026-10-17) | can wait | GPU-bound: Depot Ultra at 1080p runs 2.9× as fast. Ultra's p95 is 2.2× High's (2.5 ms). Likely causes, read from the preset and not measured alone: the 4096 shadow map at radius 4, full ambient occlusion, reflections, the lens finish, 8 pool lights, 300 dust motes. The gate's line is today's baseline (DECISIONS). (PF3) |
| WebGL2 on Ultra at 4K is slower than WebGPU on Depot: p95 6.7 ms, p99 10.6 ms (WebGPU 5.6, 6.4), so it holds its own desktop line (7.2, 11.5) | can wait | WebGPU runs the same scene about 13 % faster. The 471 ms worst frame is a first-use compile (PF1). (PF3) |
| The Neon Heights Extraction desktop baseline is missing | playtest | The 2026-10-17 run measured the results screen once the match ended; since PF3 the window stops with the match. Needs `npm run perf:desktop` again. (PF3) |
| Low's frame time with the Blender figures drawn (the default since BD1) is measured in the container only | playtest | Low is inside its budget lines there (35 draw calls of 100, 54k triangles of 150k). (BD1) |
| Map detail (Medium, High) makes building a match's map take ~0.35 s (Node; 9 ms without it) | can wait | The baked occlusion casts ~2.5 M rays at build, on the first Play of a map and on a Map detail change. |
| The graphics-context test runs on SwiftShader only; a real driver reset (or a laptop switching GPUs) is untested | can wait | Three.js uploads everything again except render targets. (M18b, audit W-01) |
| The replica sheen's rebuild after a lost graphics context is checked only in unit tests with a stand-in target | can wait | It needs a GPU, and the smoke test runs on Low (the sheen is Medium and up). |
| Weapon torch: on Low your own beam is only a soft glow and a lit disc; on Medium the spot casts no shadows (High and Ultra do, since M91) | can wait | The owner's Low rule: no real lights on Low. (M33h) |
| Weapon torch: another player's beam lights no surface with real light (a cone and a disc where its axis lands) and casts no shadow | can wait | Real lights per quality stay fixed, so only your own torch is real. (M33h, M33i) |
| Weapon torch shadows (High, Ultra) fall a little off your aim | document | The real spot starts at the rail (`TORCH_BEAMS.ownRight`, `ownDown`), not the eye. (M91) |
| Weapon torch shadows on WebGPU are checked on the container's software adapter only | playtest | Since M91b the torch views draw on WebGPU as on WebGL2 (`webgpu-compare.mjs --views w3`: 0.03 % of pixels or fewer apart). The owner checks a tree's or a bot's shadow in his beam on High at night. (M91, M91b) |
| The perf gate has no High or Ultra night run, so the torch shadow map's cost is unmeasured | playtest | One 1024 spot shadow map, drawn once on its first frame (M91b) and then only while your torch is on. (M91) |
| A bot very close to a torch looks over-bright | can wait | Seen while checking M91 on Woodland at night; the same on main. Tune with the figures' lighting. (M91) |
| Weapon torch: on a night map on Medium and up, if a bot carries a torch and you fit none, the spot for your own torch is still kept | can wait | So the view can follow a spectated bot's beam. (M33h, BP5) |
| The practice range compiles ~24 shader programs on Medium and High (Depot ~13) | can wait | FA7's painted plates, figures, chains and fittings each get their own material variant. |
| No shader builds mid-match is measured on SwiftShader only (WebGL2 and WebGPU); on a real GPU the wait before round 1 and any build left are unmeasured | playtest | PLAYTEST › Graphics and performance, "No shader hitches". Auto picks WebGPU on most desktops. (PF1) |
| Each figure's fade still makes about 20 draw records on the CPU as it turns see-through and back (the shaders come from the warm-up) | can wait | Three re-keys a draw when its material turns transparent; a fade-only material per figure would avoid it. (PF1) |
| A rigged figure's held replica makes two shadow draw records on its first shadowed frame (CPU only, no new pipeline) | can wait | The held replica's shadow is set up on first use. (PF1) |
| Baked light (G6): a `figure.glb` dropped into the assets folder keeps its own materials, so the probes don't dim or tint it | can wait | A model's materials need the same two lines as the built-in one in `externalModels.ts`. (M25a, BP5) |
| Depot's signs and stains are one blended mesh (G6), so where a sign is seen through another see-through surface the order may be wrong | can wait | `mapDecals.ts`. Depot has no glass; splitting the stains costs a draw call. |
| At High (1024 px) one library surface texture takes ~0.7-0.9 s to draw (container), so a map's first Play draws its set in the click | can wait | BP2 moved the title screen's warm-up to one core surface per idle moment. |
| At Medium and up the node renderer keeps three multisampled buffers: the canvas, the post stack's scene target (4 samples, half float) and the held replica's own target | can wait | Estimated ~235 MB at 1920 × 1080, not measured on a GPU (~70 MB the replica's, `nodePostStack.ts` `overlayFor`). Draw the replica into the scene target if the laptop's memory shows it. (BP2, W4, BP5) |
| Night lamps' real point lights (Medium and up) light the slab above them, so a ceiling reads warm (faintly olive on Neon Heights' plaster) and a lamp can light the room above | document | Kept (owner, 2026-10-05): physically right, Medium and up only. |
| Woodland at 6v6 (M88) is unmeasured on Medium and High; the perf harness picks Woodland at its standard 5v5 | document | Low is checked at 6v6 (74 draw calls, 86k triangles). Medium's Extraction run already averages 112 of its 120 draw calls. Needs a laptop run. (BP5) |
| Woodland on Medium at 5v5 sits close to its draw-call ceiling: 112 of 120 (Extraction, container, 2026-10-17) | document | Triangles are well clear since PF4: 126k of 200k (145k before). (M33i, M48, M75, G9, PF4) |
| Neon Heights on Medium (Extraction) sits fairly close to its draw-call budget: about 126 of 145 | document | 138 after G9's dressing; PF4's re-recorded baseline reads 126. The budget is `maps.neon` in `pipeline/perf-budget.json`. (BP5, PF4) |
| Medium keeps a 6.3 MB prefiltered environment map on the GPU | document | Built once from the sky and shared with the replica sheen. (FA7, F1) |
| Baked light (G6): under a roof the probes keep about a third of the sky light, so a covered spot reads lighter than a real one | document | Rays that reach open ground count as open, standing for the hemisphere's ground light. |
| BB streaks, dust motes and flag cloth are checked garbage-free in Node's V8 only | document | After M77 each measures 0 B a frame in Node. The check left is Chrome's Performance panel › Memory, allocation sampling during a 20-BB burst. (audit REN-10) |
| Game events allocate a small vector each (shot, impact, hit) | document | A few per tick at most, not per frame; pool them if profiling shows GC pauses. |
| On WebGPU the nearest fire casts no shadow, other players' torches light the ground as WebGL's lit discs, and neon signs cast no coloured light | can wait | Built and measured in W3: each failed the look bar or doubled the draws. |
| Depot's near and far player views on real WebGPU sit just over the look bar (mean 0.51–0.63 against 0.5) | can wait | Container only (SwiftShader): edges and a faint grain, not a material. The owner ruled. (W3) |
| On WebGPU the stars and the fires' embers carry a little more light than on WebGL (QA at Low: +14 % and +48 %) | can wait | A point a pixel or two wide is a quad on the node path and a point sprite on WebGL, which cover sub-pixel sizes differently. (W2) |
| On real WebGPU the retro filter's picture sits over the look bar's pixel share (1.5–3.1 % of pixels against 1 %) | can wait | Container only: the filter draws at a quarter size, so SwiftShader's edge differences cover 16 pixels each. The owner ruled. (W4, BP3) |
| On the node renderer's WebGL2 back end the GPU grass and tree stand-ins draw every slot, culled ones as nothing | document | Transform-feedback compute has no indirect draws. (W5) |
| On WebGPU the perf harness and the comparison count the grass and stand-ins' triangles at their caps | document | Three counts an indirect draw from the CPU's instance count. (W5, W6a) |
| The tree stand-ins beyond Woodland's fence are flat cards close up and cast no shadow | can wait | Each is a billboard blending two of 8 pictured views. (W5) MS1 kept them. |
| On WebGL2 Three's vertex-array cache still grows by about 5 entries a match quit or Play Again | can wait | About 1 MB of heap over ten quits, settling (BP6c took it from about 18 MB a match). Likely geometries kept between matches; heap snapshots name the entries. (BP6c) |
| The node path's compute passes and lights lean on Three 0.186's private API | document | `computeKit.ts`, `nightLights.ts`, `deferredFrees.ts` and `nodeBackend.ts` log one console error when an upgrade renames what they use. Recheck all on a Three upgrade. (W5, BP3) |
| In the container's software WebGPU, growing the window mid-match on Medium without the retro look stops the page's frames for good | can wait | Seen in BP3 and the same on main before it; likely the software GPU process, not the game. (BP3) |
| In the container's SwiftShader a match's first live frame takes 10 s and more at 2560×1440 | document | The software GPU process, not the game's code: no shader is built then (BP6c, measured). The HUD overflow check waits past it. A real GPU's first frame is the owner's PF1 check. (BP6c) |
| On the node renderer an antialiasing change waits for the next load | document | A node renderer can't change its samples in place. (W1, W6a) |

## Audio

| Issue | Class | Notes |
|---|---|---|
| The silencer's muffled shot (`suppressedCopies`, M29b) is checked by unit tests only | can wait | It is in the game now (the Silencer muzzle part: muffled, and heard from less far by bots, the minimap and the cues). (M13) |
| Muffling uses straight rays only: a sound just around a corner is muffled as if it came through the wall | can wait | Two rays per character (knees and head); diffraction would need a path search. (M13) |
| The AEG's motor spin-up starts with the first shot and may be masked by it | can wait | Playtest whether the wind-up is heard on a fresh trigger pull; if not, raise it or lead the shot by a few ms (`Sfx.shot`). (M13) |
| The AEG's motor wind-down plays up to a frame late after the trigger is let go | can wait | It follows the simulation's clock, checked once per tick; timed on the audio clock, 25–33 ms frames let it start mid-burst. A 17 ms delay isn't audible. (bug pass) |
| The woods' sounds stay in memory for the page once a Woodland match has loaded (6.45 MB by night with its echo) | can wait | Rendered once and kept, so a second Woodland match loads them free. (M33j, M69, audit 2) |
| Sounds are all synthesised; no CC0 samples were added in M13 | document | The roadmap allows samples where synthesis falls short; the owner's playtest decides which sounds (if any) need one. |
| Crouch, stand and lean rustle is presentation only: bots don't hear it | document | Deliberate: the roadmap keeps how far bots hear each sound as it was. You hear it within 9 m. (M13) |
| Footsteps play a little quieter than before M13 so a shot stands out above them | document | A test keeps a shot at least 1.5× a bot's loudest step, so `AUDIO.levels.step` is near its ceiling. (M13) |

## Menus, HUD and input

| Issue | Class | Notes |
|---|---|---|
| The spare-magazine gauges show no number for each magazine | can wait | Beta UX/QoL: the ammo panel already prints the spare BBs ("/ 120"); a gauge's low is striped and next has a caret, so they don't rely on colour. (BP5, HD1) |
| Sound cues for several sounds from the same direction stack on the ring (hit calls sit just outside it) | can wait | One marker per player and kind; playtest whether a busy fight reads. (M18b) |
| The hit feed wraps a long line (friendly fire with a ricochet tag) to two rows to keep clear of the scoreboard | can wait | Since BP3 a plain line fits on one row at 1280 and 1366 px. (bug pass, FA5) |
| A long notice in the compact replica panel (the automatic quality step-down's line, the ricochet and leaves lines) wraps to 3 to 6 lines and makes the panel taller while it shows | can wait | A fix changes the panel's look, so it needs a picture and William's OK first (UI2's rule). (BP6a) |
| With the feed at the bottom left, at 1280×720 and HUD 150 %, while you're out its rows overlap the Spectating line and the "What got you" card | can wait | Only that corner, size and state; the default feed sits top right. (BP6a) |
| On the event-only pointer-lock path (Firefox), a lock granted and dropped before the change handler runs could leave `PointerLock.lockOnce` waiting, so Play and Resume stop working until a reload | can wait | Found by reading, not reproduced. Fix idea: settle false on a change that leaves it unlocked, or a short timeout. (BP6a, passed to BP6c) |
| The minimap draws Depot's loading dock at the floor's level (a lighter shade); a patch for a player heard on the dock looks like one below | can wait | A map with storeys (Neon Heights) gets one drawing per storey. (M23, BP5) |
| Dev settings' Game speed runs the simulation slower or faster, but sounds keep their pitch and the replica's bob and sway run on real time | can wait | A toy for watching BBs fly; timing-sensitive presentation isn't speed-aware. (M24) |
| The Match screen's map stills are 480×270, so they look soft on a 4K screen | can wait | Drawn in code by the menu art script (KI2); a larger still costs download size. (BP6c) |
| With Settings › Ammo counter off the replica panel keeps its width, its right half empty | can wait | The BB count goes and nothing takes its room. A narrower panel is a visible change, so a picture for the owner first. (BP6c) |
| At HUD size 150 % in a window under about 800 px tall, a three-line round banner (the longest half-time line) runs 22 px into the top of WON or LOST | can wait | Since BP6b the word clears a two-line banner at every HUD size; three lines only wrap at 150 % on a 720 px window. A fix places the word from the banner's measured height. (BP6b QA) |
| The crosshair shows the spread only, not the recoil kick | document | Recoil is light on toy-like replicas; revisit in the Phase 4 HUD pass. (M10) |
| The round's table shows by itself between rounds and covers the middle of the screen | document | Since RE1, WON / LOST / DRAW stays 2 s, then the table for the rest of the 6 s reset (about 4 s); a click from 0.5 s after the stamp moves on. The owner's playtest decides whether it should wait for Tab. (M19, HD1, RE1) |
| Dev settings' Ghost: bots still see you and shoot at you (their BBs pass through) | document | Deliberate: for walking the field under fire, not for hiding. (M24) |
| With Dev content on, a Match screen map card with a Dev tag or the Day and Night buttons is about twice as tall at 1280 px wide | can wait | It grows so the tags stay off the map's name (Dev 5 playtest, note 1). Dev content only. (M94, PT1) MR1 kept the taller card. |
| Below about 1390 px wide (1280 and 1366 among them) the Match screen's Time-out rule puts its two options (Overtime flag, More players left) on two lines | can wait | Its row needs 493 px; House rules' column gets 421 at 1280 px. The options wrap rather than cut a word; UI2 brought the line down from about 1540 px. (UI2) |

## Save and browsers

| Issue | Class | Notes |
|---|---|---|
| The side mouse buttons' back / forward is blocked by `preventDefault` on mousedown, mouseup and auxclick; checked in Chromium only | can wait | If Firefox still goes back a page, guard with a history entry or warn on the Key bindings tab. Firefox navigates from the browser itself, out of reach of synthetic clicks: a hand check. (M18a, IN1) |
| The hardware acceleration warning trusts a `failIfMajorPerformanceCaveat` probe where the browser hides the renderer's name | can wait | Checked only on software drivers (SwiftShader; Firefox 136 warns there, as it should, IN1); the owner to confirm no warning shows in Firefox and Chrome with acceleration on. (M18b) |
| Mouse look and Esc's lock exit have no automated test | document | Headless Chromium grants the pointer lock and `e2e/release.spec.ts` plays the release build with it, a refused Esc resume and its click included (IN1). Esc itself is out of reach of a synthetic key. A mouse-look test passed in the cloud container's Chromium but CI's headless shell (Chromium 156) turned the view by nothing, raw input off too, so it was withdrawn (BP6d). (FA11a, audit CORE-09) |
| Firefox gives no raw mouse input (it ignores `unadjustedMovement`) | document | Sensitivity may feel different from Chrome and Edge with OS acceleration on. Settings › Controls says so in Firefox from the start. (IN1) |
| In Firefox the Fullscreen key (F10) asks for a click unless you clicked or fired in the last few seconds | document | Firefox gives function keys and Esc no user activation (Firefox 136): entering pauses on "Click anywhere to go fullscreen", leaving on "Click anywhere to resume"; one click carries on. Chrome keeps the lock both ways. (IN1) |
| Only the boot and save specs run in Firefox | document | CI's `firefox` job (IN1). The other Firefox-only paths (`AudioListener` fallback, `auxclick` blocking, the caveat probe) are hand checks (`docs/PLAYTEST.md` › Browsers and builds). |
| The save can't tell a private window: the browser keeps it only until the window closes, and the game doesn't warn | document | Browsers don't say they are private; the Save tab's first line says so, and Download is the backup. (M31) |
| The save's automated browser tests run in Chromium and, on CI, Firefox; not in Edge itself, on Windows or in Safari | document | William has no Firefox (2026-10-17), so his save check covers Edge: passed by hand on Edge 155 (Dev 6 build, 2026-10-17). CI's `firefox` job runs the save spec in Playwright's Firefox; on 2026-10-17 a cloud thread also ran all ten save specs in Firefox 136 (Ubuntu's build, Playwright 1.50 over WebDriver BiDi, files through the drop path), 10/10, and a close-and-reopen kept FOV, volume and XP; the recipe is in `/mnt/project-files/playtest/firefox-harness/`. Safari is untested. (M31, BP5, IN1) |
| A save file's checksum catches damage, not cheating: anyone can edit a file and recompute it | document | Owner's default (M31). Single-player and public code, so a signature would only stop casual edits. |
| Restore points and Undo live in the same browser storage as the save, so clearing the site's data removes them too | document | They cover a bad write or load; a downloaded file covers a wiped browser. (M31) |
| Chrome logs a harmless "AudioContext was not allowed to start" warning at load | document | The page's one context is made (suspended) before any click so sounds can render in the title screen's spare time; if the browser keeps the sound blocked, the menus say so. (M13, FA6, audit M-09) |

## Build, tests and pipeline

| Issue | Class | Notes |
|---|---|---|
| The smoke test can only open and close the order wheel: it plays without the mouse lock, so it can't move the wheel's pointer | can wait | `playerInput.test.ts` covers picking; checked by hand in a scripted match. (M23) |
| The picture compare's WebGL reference (b10c006) no longer matches Woodland or the figures, so those pairs fail on content, not drawing | document | Since b10c006, M88 rebuilt Woodland and RM4's replicas draw part by part. (W6b) |
| The WebGPU twins' and particles' allocation tests count heap growth, which can run over their limit while the bot-match guards run beside them | can wait | Seen four times on a local gate, never alone; each passed on the re-run. Widen or isolate them if it recurs. |
| A map's team-colour rule reads each block's tint, and a textured block's tint is white, so an orange or blue texture would pass it | can wait | The skin checks measure each map as painted in the browser (`measureMapPalettes`). (CT2, CT4) |
| `config/renderView.ts` and `config/audio.ts` hold small derived helpers (whistle schedule, result-screen delay), and renderView imports audio | can wait | Fine at this size; move derived timing into a module if config grows more logic. (BP2) |
| `config/botsMovement.ts` and `config/botsSenses.ts` import `MOVEMENT` (for `leanRoomMargin` and `friendlyMateSpeed`), so one config file depends on another | can wait | Small; move the shared values if they grow. (M10, RE1, DX7) |
| The menus' focus logic is covered by the e2e smoke test only (vitest has no DOM) | can wait | Screens and Esc (`ui/menus/menus.test.ts`), `KeySettings` (`ui/keySettings.test.ts`) and the teammate level (`newGamePicks.test.ts`) have unit tests on stand-in elements. (M20, FA5, BP5) |
| The smoke, mode and adaptive-difficulty specs end their short matches by writing the score and the opponents' `status` straight into the sim state, skipping `eliminate()` | can wait | Works today; a debug hook (like the tutorial's `debugJumpTo`) would be cleaner. (audit L-27) |
| `MatchSession`'s constructor builds the HUD and sounds, so its round-flow methods are unit-tested only on bare objects (`matchSessionResultDue.test.ts`, `matchSessionRoster.test.ts`) | can wait | Resume and the result pause through `Game` are in `playFlow.test.ts` (DX8); the whole session runs in the smoke test. (audit CORE-23, FA11b, BP6d) |
| A release zip shows its version only if GitHub fills in `.git_archival.txt` (export-subst) | document | Checked in a checkout (`git describe`) and a shallow clone; the 0.1 Beta 1 zip is its first real check. Unfilled, the title says "dev build". (M24, M76) |
| The audio ambience tests (`src/audio/audio.test.ts`) can hit vitest's 5 s timeout on a heavily loaded machine (load average above ~20 on 4 cores) | document | Seen only in the build container with several workers at once. |
| CI's browser smoke has failed twice with no detail in the log (2222aa7, 9bfd038) and passed on the next run | document | FA11b's summary now prints the failing test, locator and values. On GitHub's Chrome 153 only, in-match key steps once timed out on slow early frames. |
| `sim/testSupport.ts` (test fixture) lives in the source tree | document | Harmless (tree-shaken from the build). Test fixtures beside their code as `*Support.ts` are the convention now. (KI1) |
