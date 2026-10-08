# Changelog

Every change, by release, in [Keep a Changelog](https://keepachangelog.com/) form. A line starts with the task id and ends with the pull request number. The changelog agent keeps this file (`.claude/agents/changelog.md`); `docs/patch-notes/` has the player-facing notes of each release.

## Unreleased

### Added
- **G1** · Replica colour schemes (Cobalt, Signal, Acid, Teal, Hazard, Coral, Onyx, Ghost): rifles Cobalt and pistols Ghost for now; Settings › Look: Robots (Mixed by default) and Realistic colours options (#125)
- **G2** · Replicas rebuilt blockier, two-tone with stippled grips; red dot and silencer redesigned; Cyber Pistol white with cyan glow and magenta core, grey and unlit in Realistic mode (#126)
- **G6** · Depot by day: a lower, warmer sun with longer shadows, a bluer sky and fill, and light bounced off walls and containers into the shade (Baked light) (#127)
- **G6** · New surfaces: grey precast concrete walls and rubble gabions in wire (no more sand); weathering on Medium and High (dirt at wall feet, rain streaks, rust) and stains on the ground (#127)
- **G6** · New Custom graphics rows: Baked light (Off, Vertex, Per pixel) and Weathering; Low keeps its cost (#127)
- **G5** · Ultra graphics preset for fast graphics cards: soft 4096 shadows, up to 2× resolution, the most dust and night lights; never picked automatically (#128)
- **G5** · Graphics effects: bloom from Medium; ambient occlusion, temporal smoothing and light shafts on High; reflections and film grain on Ultra (#128)
- **G7** · Players rebuilt: masked humans (high-cut or bump helmet, balaclava, visor) in team camo and a team-colour plate carrier, and robots in a light or dark shell (#131)
- **G7** · Settings › Look › Robots now mixes humans and robots on both teams each match; others' replicas show their team's colours (plain with Realistic colours) (#131)
- **G7** · Your hands: dark gloves, sleeves in your team's camo and its armband; robot arms when your player is a robot (#131)
- **G8** · Depot is dressed on Medium and up: grey dirt at block feet, junk and litter against walls, glossy puddles, a few logos, sprays, warning signs and glow strips (#136)
- **G8** · Beyond Depot's walls on Detailed trees: sheds, a water tower, a crane, stacked containers, a power line and two smoking chimneys (#136)
- **G8** · Sprinting and landing kick up a little dust on Depot (Impact grit); the dust in the air is greyer and hangs low; Low looks as before (#136)

### Changed
- **M71** · Bots hunt the map's middle once their lane is swept (now all levels, not just Pro); Normal and Hard hold their posts out of lantern light at night (#133)
- **M71** · At night, bots switch their weapon torch on only for fights within 20 m and the final approach to search targets, not for the whole journey (#133)
- **M71** · Bots already sidestepping in a fight step further apart when pressed together (#133)
- **M72** · Extraction home team size now follows its level: the map's base plus squad, one more on Pro (#135)
- **M72** · A squad member just in or back from respawn has a 3 s grace: BBs neither hit them nor hit anyone from them (#135)
- **M72** · Woodland's Extraction: the home team keeps 30 m from the insertion at the start (#135)
- **M72** · Extraction guards at their posts lean out and watch the way in instead of turning to the wall (#135)
- **M73** · Neon Heights (dev content): the east team's bots hold the middle from deeper in the bar, so the two ends are closer to even (#137)
- **G5** · A Custom graphics mix saved before this build gets High's new effects (ambient occlusion, temporal smoothing, light shafts, bloom); each can be turned off under Custom (#128)
- **G5** · Frame-rate limit choices are Unlimited (the default), 30, 60, 120, 144 and 240; an older saved limit becomes the nearest choice (#128)
- **G5** · Graphics › Night lights adds Nearest 8 (#128)
- **G3** · New menus: a bold navy and orange look in Barlow type, a top bar (Play, Loadout, Armory, Range, Settings, your Field Credits and Tokens) and key hints along the bottom; text is never smaller than 15 px (#134)
- **G3** · The Play screen shows maps and modes as picture cards (Day | Night on the card, a Dev tag on maps still being built) with the match rows and a Your match panel on the same page; the Map, Mode, Match and Difficulty pop-ups are gone (#134)
- **G3** · Loadout and Customise show your replicas as pictures; Customise lists the parts down the left, Colour first, with each option as a picture tile beside the replica and its numbers (#134)
- **G3** · Settings regrouped into Graphics, Display, Audio, Controls, Gameplay, Accessibility, Look, Save file and Dev, with a search box and a short note on every row (#134)
- **G3** · The Armory's collection is a picture grid with a how-it-works strip; the title, pause, summary, result and loading screens take the new look (#134)
- **G4** · The HUD takes the menus' look: navy panels with cut corners in the menus' type, nothing smaller than 15 px; the panels are more solid (90 %), and Settings → Gameplay → HUD opacity sets them from 50 % to 100 %
- **G4** · Score bar: slanted pips per player, each side's score on a block in its colour, and "First to 5" (or the run) under the clock
- **G4** · The minimap is a framed square with the map and round under it, and is only redrawn when something on it moves
- **G4** · Hit feed rows read shooter, BB, who called it and a Hit tag (screen readers still hear "<who> called HIT · <shooter>"); your rows have an acid edge
- **G4** · Replica panel: a picture of the replica you carry in its colours and parts, a chip per fire mode, the loaded BBs large with the spare BBs and magazines, a bar per spare magazine
- **G4** · The squad cards and order keys leave the bottom left: squad orders show only on the order wheel (Z), and a screen reader still hears each order and notice; the Tab scoreboard gets the navy panel and your row an acid edge
- **G4** · The round banner says "ROUND 1" large in the HUD's heavy capitals on a navy panel with an orange bar; results and the countdown take the same panel
- **G4** · At the largest Scoreboard size the score bar no longer runs under the hit feed or over the minimap (it was sized for a bar 444 px wide, not 730)
- **M78** · High and Ultra draw the city's flat finishes at 512 × 512 as Medium does; Neon Heights on High: 21 MB less graphics memory (#151)

### Fixed
- **M74** · No frame hitches when you're hit or a bot plans a route (#138)
- **BP2** · Customise takes "No light" on every replica's Light row; it stays after a reload, and your match kit carries no torch (#150)
- **BP2** · A hunter checks at once whether pushing keeps you in sight when a new fight starts, not from the last fight's look (#150)
- **BP2** · A bot that reaches the end of a route and steps onto its spot gets its full time to get unstuck (#150)
- **BP2** · A bot waiting for a route no longer holds up teammates' route searches when it's hit; a bot following you (Follow me) no longer restarts its search every frame (#150)
- **BP2** · The round message names an Elimination time-out ("Time's up · your team had more players left") in Tournament (#150)
- **BP2** · Reduced motion in Settings › Accessibility follows a system change while you haven't picked one (#150)
- **BP2** · If the dev maps fail to download, the menus say so by the play buttons (#150)
- **BP2** · An old save whose Fire or move key is now a refused browser key gets its default key back (#150)
- **BP2** · Standing on a Woodland log sounds like wood, on a boulder like stone (#150)
- **BP2** · A replica picture that failed to draw is drawn again next time; a map card's tag (Woodland's Night) shows even when map data arrives late (#150)
- **BP2** · Shade and Light shafts with edge smoothing and no TAA draw correctly on drivers that discard multisampled pixels (#150)
- **BP2** · Turning edge smoothing on or off while spectating frees the old graphics memory; a finished match no longer holds your replica (#150)
- **BP2** · The title screen no longer freezes while it prepares surface textures at High (one at a time now) (#150)
- **BP2** · Temporal antialiasing forgets the old frame on a camera cut (new round, next player watched), so no ghost of the last view (#150)
- **BP2** · A replica picture drawn while the graphics context is lost is no longer left blank (#150)
- **M79** · Leaving a match or the menus no longer leaves listeners behind, so memory doesn't creep up over a long session (#151)

### Internal
- **G8** · Set dressing never collides or blocks sight: Depot's colliders, routes, cover and bot sight are tested identical with and without it (#136)
- **M75** · Rendering optimized on Medium: figure shadows from simplified stand-ins, Extraction exits merged to fewer draws, Woodland night horizon capped at Simple (#140)
- **G5** · The perf harness measures Ultra (`--preset all` and `--preset ultra`), a desktop environment and any window size (`--viewport`) (#128)
- **M76** · Perf gate matrix: every map in both modes on Low and Extraction on Medium with map-scoped baselines; quick builds skip precompression; build label from tags (#141)
- **TE1** · Development uses fewer tokens: a shorter project guide (process detail moved to `docs/PROCESS.md`), a guard against reading huge files whole, automatic session setup, quiet test output (`npm run t`) and no status-only commits (#142)
- **TE2** · Docs rewritten in one house style: finished history archived, one record file per task instead of shared review and metrics tables, a README in each source folder (#147)
- **TE3** · Build checks write a short review file and a failures-only list; agents run only when they can change the outcome, and the changelog reads less (#148)
- **TE4** · Local checks run slow bot-match tests only when bots or maps change, and bot balance figures moved to a report (`npm run balance`) (#149)
- **BP2** · QA tests for each fix; KNOWN_ISSUES swept (8 rows fixed and deleted, stale rows corrected, new rows for what stays); a scripted run started every mode on every map with no errors; bot balance report re-run (#150)
- **M77** · Fewer garbage-collection hitches: BB trails, dust and flag cloth stop making garbage each frame, and standing characters skip the ground check (#151)
- **M79** · Two import cycles broken and a cycle check added to the pipeline; loop-seam audio tests use fixed percentiles (#151)

## 0.1 Dev 4 · 2026-10-06

### Added
- **M12a** · Fire selector with single, burst and auto; faster reloads; crouch toggle; steadier aim when still (#10)
- **M12b** · Red dot as an accessory; aiming down sights with separate sensitivity (#11)
- **M12c** · Loadout off the pause screen; BB streaks from muzzle; pistol faces forward; hop-up dials (#12)
- **M29a** · Weapon stats in stats.md; tiers add energy and rate of fire; 11.1 V LiPo battery; site energy limit; Performance sheet in Customise (#54)
- **M29b** · Barrels and a silencer: Tight-Bore and Long Barrel for the AEG, a Silencer for both (bots hear it from half as far); Hard opponents carry kits of their own (#58)
- **M33b** · Glowing BBs: a per-replica Customise option (At Night by default, Always or Off); bots load them on night fields (#65)
- **M32** · Cyber Pistol: electric pistol with semi, burst and auto, 1.00 J at 14 BBs/s, mint and pink model, unique chirp and pop sound (#75)
- **M32** · Cyber Pistol comes only at Legendary with a 0.25 % chase chance per Armory Shot item; on Hard, bots carry it about 1 in 20 matches (#75)
- **M33h** · Weapon torch (dev content): a starter Light on every replica, switched with T (Settings › Key Bindings › Weapon torch); at night its beam lets you and the bots see further and gives you away; bots switch theirs by what they're doing; your held replica is lit by the night too (#93)
- **M17a** · Loadout: pick primary and secondary replica, BB weight, hop-up dial (#25)
- **M17b** · Loadout attachments: optics, grips, magazines (#26)
- **M26a** · Asset pool: pool.md register, rarity tiers, economy numbers, player's collection saved (#39)
- **M26b** · Loadout screen: Primary, Secondary and Grenades slots; Customise view per replica (#42)
- **M26c** · Armory, beta and free: earn Field Credits from matches, buy Tokens, draw from the pool (#44)
- **FA10** · Armory pity: an Epic or better within 20 Shots, a Legendary within 100; items you don't own are twice as likely; the catalogue lists every item by rarity tier (#63)
- **M35** · pool.md has an Access column: public or dev for each asset (#70)
- **FA4** · Bots keep apart and never take a teammate's cover or lane spot; their routes keep a body's width from walls (#66)
- **FA4** · A BB landing close by tells a bot roughly where the shot came from; a teammate's "HIT!" gives only the direction. Fighting bots sidestep only onto open ground that keeps you in sight; a search that finds nobody ends with a crouched look round (#66)
- **FA4** · Difficulty changes how bots play, not only how they aim: Hard uses cover and flanks more, Easy less; Easy reacts slower (0.6–1.0 s) with wider first shots but settles its aim nearer Normal (#66)
- **FA4** · Against Easy opponents your teammates start on Normal, and that default pair counts for your records under Easy (#66)
- **M36** · Pro difficulty, a fourth bot level above Hard, shown only with Dev content on: Pro bots aim more precisely, lead moving targets more, fire shorter bursts, play slower, hold cover longer and approach silently; opponents carry kits with more parts fitted (#79)
- **M33g** · Night sight: on night maps bots see less far in the dark (40 m by a fire or lantern, 25 m in the open, 10 m under the trees); Woodland's fires and lanterns give you away (#86)
- **M19** · Match info: hit feed, teammate markers, hold-Tab scoreboard, summary, records, crosshair options (#24)
- **M20** · Custom matches: rounds to win, round time, team size, friendly fire, ricochets (#28)
- **M21** · Practice range: steel and figure targets at 10–60 m; distance markers; spare mags stay full (#30)
- **M22** · Squad orders on Z, X, V: Follow me, Hold here, Regroup; bots hear less through walls (#31)
- **M16** · Tutorial: ten coached steps on the practice range for new players (#32)
- **M23** · Minimap: teammates always; other team where last heard; squad order wheel on hold Z (#41)
- **FA10** · Tutorial: skip it or resume it from the pause screen; new steps for the fire selector and shooting after a sprint (#63)
- **M43** · Extraction (dev content, Depot): an 8:00 run against a home team; stand 10 s in an open exit to get out; one automatic respawn at the insertion (#83)
- **M39** · New game › Match: a Rules row first: Skirmish (as before), Tournament and Pro CQB (Dev content only), or Custom with its own switches (#90)
- **M39** · Tournament: first to 7, win by two, 2:00 rounds, time-outs to the team with more left, minimap teammates only; Pro CQB adds semi only, realcap (#90)
- **M39** · Custom adds Overtime, Time-out, Minimap, Fire modes, Magazines and Kit rows; never counts for records, pays at most ×1.5 (#90)
- **M44** · Extraction cases: hold Use (G) to open ammo cans, field cases and a locker for FC, BBs and parts; a hit drops them; kept only if you get out (#92)
- **M41** · After you're hit, a "what got you" card says where the shot came from, whether that bot held the angle, how long you were seen and if you moved (#96)
- **M41** · Settings › HUD › What got you: Auto (on against Pro), On or Off; Pro matches show a tip between rounds (slice corners, short peeks, listen) (#96)
- **M45** · Extraction waves: bots you hit come back together (every 75 s on Normal, or once all are out), out of sight; one more joins late (#97)
- **M46** · Extraction guards and hunters: guards in cover by the locker, patrols in pairs, hunters late in the run; teammates cover you at a case (#98)
- **M47** · Extraction pay and records: a run pays what you get out with plus your hits, times the difficulty; its own bests (#101)
- **M48** · Extraction on Woodland (15 min, 4 to 6 opponents) and Neon Heights (10 min, the locker on Level 2); exits sit on slopes (#103)
- **M49** · Extraction supply events: a Supply weekend every Friday to Sunday and a Halloween night run (30 October to 1 November 2026) fill cases with more Field Credits and parts; the Mode pop-up says which is on (#106)
- **M11** · Depot reworked: asymmetric layout, one flagpole in defenders' bay, raised dock (#14)
- **M33a** · Woodland shown as Coming soon in the Map pop-up (#64)
- **M33d** · Woodland's layout, playable with the Dev content switch on (dev content: its matches aren't recorded or paid); 4v4 and 5v5 on maps with room (#77)
- **M33e** · Bushes: they hide you from bots (BBs and people pass through), on any map that has them; Woodland has 70, shown on the minimap (#81)
- **M34c** · Neon Heights: three-floor greybox market city with stairs, Sky Bridge and balcony, dev content, 4v4 to 5v5, Elimination and Attack / Defend (#85)
- **M34c** · Minimap on multi-level maps shows the floor you stand on (floors below darker) and marks teammates on other floors with an up or down arrow (#85)
- **M33f** · Night lighting: any map picks a day or night look in its data; Woodland is dark under a low moon over the Knoll, its fires and lanterns glow and light the ground, and on Medium and High the nearest ones light players too (Graphics › Night lights) (#87)
- **M34d** · Map pop-up shows a Day or Night switch for maps with both modes; your choice is saved per map (#91)
- **M34d** · Neon Heights by Night has the moon and night sight; neon and lit rooms are M34e (#91)
- **M34e** · Neon Heights by Night: 12 lamps light separate floors, neon signs that glow and are painted by day, lit and dark windows on the perimeter; balanced at 47–48 % west, 52 % attackers (#95)
- **M34e** · Night sight on night maps knows floors and roofs: an unlit spot under a roof is seen from 15 m (#95)
- **M33i** · Woodland's look (dev content): bark trunks and log walls, faceted boulders, plank fences, pine and broadleaf crowns, a gravel creek, earth tracks and leaf litter under the trees, flickering camp fires with embers, lanterns, and a moon and stars at night on every preset; Depot unchanged (#100)
- **M34f** · Block surface finishes and paints (plaster, metal, glazed tiles, asphalt, paving); six city props (arcade, vending, stall, planter, booth, van); painted ground markings; plaster ceilings under raised floors (#104)
- **M34f** · Neon Heights: pastel buildings (mint, pink, cyan, amber on slate), paved street with asphalt, neon trim, lit arcade cabinets; night: softer purple sky with city lighting and 180 stars (#104)
- **M14** · Art pass: daylight with sky and trees, dressed surfaces and props, airsoft-kit figures, dust and impacts (#33)
- **M25a** · CC0 assets guide and optional glTF player model with built-in fallback (#43)
- **FA2** · Settings › Graphics: Custom option to pick a preset and modify any row; changes show Custom, setting back shows the preset again; Custom is saved (#67)
- **FA2** · Graphics Settings has a frame-rate limit and Show FPS counter (#67)
- **FA2** · The first start picks a preset from the graphics card: Medium on integrated graphics (Intel, AMD Ryzen), High on a discrete card (#67)
- **FA8** · Players, replicas, their parts and your gloved hands are rebuilt in a clean, stylised look with more detail on Medium and High; Low looks and costs the same (#69)
- **FA8** · Barrels and silencer have proper models on High (fluted barrels, a coupling collar, silencer end caps and rubber bands) (#69)
- **FA8** · New Custom graphics rows: Player detail, Replica detail, Hand detail, BB glow, Impact grit, Laser beam (#69)
- **FA7** · Environment lighting on Medium and High: sky reflects in players, the flag, range targets and steel; contact shadows under every player on all presets (#71)
- **FA7** · Settings › Graphics: tone mapping choice (Neutral, AgX, ACES) and relief maps option (Normal, Bump) (#71)
- **FA7** · Map detail on Medium and High, on every map: bevelled edges with lighter rims, corner shading, ground variation, prop detail and signs; Low looks as before (#71)
- **FA7** · Trees round the field: None, Simple or Detailed with layered crowns and a hedge; clouds and sun disc on Medium and High (#71)
- **FA7** · The flag gets a finial, rope, cleat and painted cloth; the practice range gets chains, bands, brackets, a BB shelf, scuffed plates and painted figures, with fewer draw calls than before (#71)
- **M42** · Dev tab Retro pixels: 1990s shooter look with chunky pixels, dithering and crushed palette; Pixel size and Colours sliders; HUD and menus stay sharp (#78)
- **M13** · Audio rework: replica profiles, located sounds, volume sliders, HRTF muffled through walls (#19)
- **FA6** · Outdoor ambience bed with distant birds; world sounds muffled when eliminated (#55)
- **M33j** · Woodland's sounds (dev content): wind in the pines, insects and a distant owl at night, camp fire crackle, and footsteps by ground (grass, leaf litter, earth, creek gravel, cabin boards), as loud as on concrete; Depot unchanged (#102)
- **M34g** · Neon Heights (dev content) sound: traffic hum and drones by day with chimes, neon sizzle and arcade bleeps by night; Depot and Woodland unchanged (#105)
- **M15** · Menus: title screen, New game with Mode and Difficulty, Loadout and Settings screens (#15)
- **M15b** · No map loaded until Play; a Map pop-up; opaque menus; a Field of view slider (#18, #21)
- **M18a** · Invert mouse; reduced motion; aim and sprint toggles; mouse button rebinding; cm/360 sensitivity (#27)
- **M18b** · Colour-blind options; sound cues; pause on hidden tab; graphics recovery; fullscreen (#29)
- **M24** · Menu polish: shorter labels, version from git, 90° FOV, map blurbs, sound cue settings (#40)
- **FA5** · Second key per action; mouse wheel binding; HUD size (0.8–1.5); crosshair custom; raw mouse input; cm/360 kept; order wheel shows keys (#59)
- **FA5** · High-contrast styles; hit, out, round messages read by screen readers (#59)
- **FA9** · Dark loading screen with physics module progress bar; favicon and web manifest (#59)
- **M35** · Settings › Dev › Dev content (off by default): maps, modes, difficulties and gear still being built show only with it on, and never drop from Shots (#70)
- **FA1** · Crash handling: "Something went wrong" screen with seed, Reload and Copy Report; Settings › Dev has Diagnostics Copy (#57)
- **FA1** · Play Again starts new matches with their own seed; finished matches record and pay Field Credits immediately (#57)
- **M31** · Settings › Save: download your save as a file and load it back (Undo after), daily restore points; a second tab waits instead of overwriting (#62)

### Changed
- Pistol leans slightly left again, much less than before (#13)
- **M30** · BBs fly by real air physics: full drag (0.52 s to 30 m, was 0.47 s), hop-up spin that wears off, factory reach unchanged (#56)
- **M30** · Each match has a light breeze that drifts BBs downwind (up to about half a metre at 34 m); the dust in the air drifts with it (#56)
- **FA12** · With ricochets set to count, a BB that bounces can hit whoever fired it (not with friendly fire off) (#60)
- **FA12** · BB and line-of-sight checks against the map are 15–25× faster, with the same results (#60)
- **FA10** · Field Credits: a won round pays only if you took part, pay scales with match length, and the difficulty bonus follows the lower of your teammates' and opponents' levels; Armory: 10 Shots and Scrap ask to confirm, holding Enter takes one Shot, the reveal shows rarest first with prices (#63)
- **FA10** · The match summary says why a round paid nothing (#63)
- **FA13** · Loadout and Armory tiles show a small line drawing of the item where the empty space was (#76)
- **M70** · The Armory's odds caption says the odds are for each item drawn, before pity (#122)
- **FA4** · Bots holding a spot crouch where they can still see and sweep their view; a defender at its post decides once on arrival (#66)
- **FA4** · Attack / Defend: one attacking bot raises the flag while the others guard the pole from cover. Depot: the east spawns sit at the north end of their yard and its north exit is closed, so both ends are about as far from the dock and the Main Gate; in bot-only matches the west wins 48 % of rounds (#66)
- **FA4** · Bots plan at most one route per tick in all, so big fights don't hitch (#66)
- **M37** · Pro bots holding still aim at the corners and doorways you'd step out of, and answer a peek there faster; anywhere else no faster than Hard (#82)
- **M38** · Pro bots walk and slice corners near the enemy, share where they heard you, go after a teammate's shooter, hold crossfires, move in pairs and push late when behind (#84)
- **M40** · Pro bots also hold bush edges, gaps between trees and pillars, and stair tops; once a lane is clear they hunt the middle of the map (#94)
- **M40** · Pro bots on a night map keep out of the light round lanterns and fires; Pro matches stay even on Depot, Woodland and Neon Heights (#94)
- **M43** · The summary's records table has no column for a mode still being built (its matches aren't recorded) (#83)
- **M25b** · Depot: site props instead of most two-high crate stacks (#45)
- **M35** · Woodland's Coming soon entry shows only with Dev content on; a match using dev content stays out of the records and pays no Field Credits (#70)
- **FA2** · Shadow detail rows are greyed out when Shadows is Off (#67)
- **FA2** · Low has 80 % resolution with no shadows; Medium adds shadows and relief; High adds sharp textures, finer shadows, sheen and dust (#67)
- **FA3** · Low draws the same frame about 18 % faster in our test, with 20 % fewer triangles and a quarter of the texture memory (#67)
- **FA3** · High has crisp, steady shadows fitted to the view (about 25 m range) with fewer draw calls and triangles (#67)
- **FA3** · Raised dock and ramps cast shadows; BB streaks have consistent thickness on any screen; replica sheen returns after switching presets (#67)
- **FA8** · Third-person rifles on High show a silencer when one is fitted (#69)
- **FA6** · World sounds carry further; getting hit and the whistles briefly dip the rest of the mix (#55)
- **M69** · Woodland and Neon Heights each have an echo of their own (long and dark in the woods, brighter in the city), and the neon hum is easier to hear on small speakers (#124)
- **FA5** · Key names in Settings follow your keyboard layout (AZERTY, QWERTZ, etc.) where the browser can tell (#59)
- **FA9** · Cleaner menus and HUD: consistent style, button states, focus ring, marked tabs, dialogs, fade-in, hit-feed colours (#59)
- **M68** · Settings › Graphics is shorter: the Custom rows fold away under Low, Medium and High and open when you pick Custom or click "Custom settings" (#121)
- **FA11b** · Quit, then Play on the same map, is quicker: the map's meshes are kept and reused instead of rebuilt (#73)

### Fixed
- **M28** · Impact puffs start at half size (#52)
- **M30** · Bots lead moving targets at range by the BB's real, slower flight time under drag (#56)
- **FA1** · Jump pressed up to 0.1 s before landing still happens; click after sprint fires as soon as lockout ends (#57)
- **FA1** · Stepping down a kerb no longer widens the crosshair; drawn Elimination rounds replay (#57)
- **FA1** · A hit player always reaches the dead zone, even from the far end of Depot; crouch-walking is slightly less accurate; practice range figures match character height (#57)
- **FA10** · Shot spread is the same sideways and up-down when aiming steeply up or down (#63)
- **M32** · All carried replicas now have their sounds in the match; hear bots' AEG shots even without an equipped AEG (#75)
- **FA13** · Customise's Muzzle line mentions a silencer only when one is fitted (#76)
- **BP1** · The hit-direction marker fades over the hit call instead of being cut off; sprint picks up as soon as you let go of Q / E (#53)
- **BP1** · A semi or burst double-tap never fires a tick early; a BB fired straight up never goes backwards (#53)
- **BP1** · The pause screen shows the match's seed; New game says which end you start at (#53)
- **BP1** · Minimap: stacked crates show as tall cover; the debug panel sits below the minimap (#53)
- **BP1** · Pallet racks soak BBs up instead of bouncing them; turning Dev settings off before a match starts lets it count for records (#53)
- **BP1** · A double-click on Play no longer shows the "needs a moment" hint; Key bindings says why two quick clicks cancel (#53)
- **M53** · Extraction: the Match pop-up no longer offers rounds or round time; the one-minute warning and a late exit are announced (banner, screen reader, a double beep); the rules text names every switch that is on (#114)
- **M55** · Extraction: a case no longer opens through a wall; guards stand on their post and lean out to watch the way in instead of crouching blind, and openers look from a corner they can see round; a few overlapping blocks on Neon Heights and Woodland are trimmed or moved (#116)
- **FA2** · When nothing is saved and the game runs slowly, it steps down to Low at the end of a round and reports it (#67)
- **FA2** · Turning Edge smoothing on or off no longer causes graphics memory to leak (#67)
- **FA3** · The first Play no longer hitches as surface textures are built during the title screen (#67)
- **FA13** · Your left hand holds the rifle's handguard, thumb up the near side, instead of sitting under it; the raised hand when you're hit is one glove again (#76)
- **FA13** · Teammates' name tags sit just above their heads up close instead of floating high (#76)
- **M52** · At night the ground, wood and faces read in their own colours instead of near black: a bluer, brighter night sky and moon, and on Medium the shadows at night stay sharp near you (#111)
- **FA6** · Pause fades audio in 30 ms instead of clicking; pauses when the window loses focus; hint when the browser blocks audio (#55)
- **M33j** · No birds sing at night any more, on any map (Woodland, Neon Heights by Night); footsteps on Woodland's ground no longer sound like concrete (#102)
- **M53** · Sound: the countdown beep is loud enough to hear, distant sounds fade behind walls smoothly instead of in a step at 60 m, sounds stay placed when you look up or lean, the neon hum no longer doubles, and each match's birds and calls come at different times (#114)
- **M65** · A map's sounds are made while you're on the title screen, so pressing Play on Woodland or Neon Heights starts the match sooner (#119)
- Empty magazine hint names your reload key (#23)
- **FA5** · Esc resumes from the pause screen; the first mouse jump after the lock is ignored; teammate markers hide behind the minimap and while the scoreboard is up (#59)
- **M54** · Accessibility: with no Reduced motion choice saved, the system setting applies as it changes; High Contrast shows the case prompt, coach and range readout; the empty key box's dash is easier to read; the debug overlay sits under the minimap in every browser; the respawn fade no longer stalls a frame (#113)
- **M64** · The reload, case-opening and count bars fill smoothly in one motion (still step by step with Reduced motion on); the Key Bindings screen no longer holds on to the mouse wheel when no key is waiting (#118)
- **FA11c** · A second tab now always waits behind the "open in another tab" notice, even when the first is busy loading (#69)
- **FA16** · Play here in a second tab no longer sometimes lands back on the "open in another tab" notice: the reloaded tab waits a moment for the other tab's save lock to be freed (#89)
- **M50** · The crash report's Quality line reads properly (not "[object Object]") and the report adds the rules, the lighting, Retro pixels and an Extraction run's state (#107)
- **M56** · pool.md: tiny Supply event percentages, a zero Difficulty multiplier, rising Odds and a missing or mis-cased Supply events column are reported at their line; a collection or records file saved by a newer version of the game is never overwritten (#112)
- **M63** · Playing Neon Heights again with the same lighting reuses the built map; a match's shaders compile as it loads, so its first frame and first flag pickup hitch less; the GPU timer comes back after the graphics driver resets (#115)
- **M70** · If another open tab of the game saved your collection first, the Armory now reloads it at once and says so, instead of quietly undoing your Shot later (#122)

### Internal
- **M30** · One midpoint integrator step per tick replaces two Euler sub-steps; drag from a lookup table; BB streak follows its mean velocity, not its end-of-tick velocity (#56)
- **M26d** · Dev settings: Disable Armory and Unlock all gear for testing (#48)
- **M27** · Walk-off route searches rationed to one per tick (#51)
- **M57** · The night balance checks now play with the torches bots carry in a real match, and their bands use the new numbers (#120)
- **M44** · Extraction cases: tests for the Use key, case rolls, drops and the haul, and a browser test of a run that opens the locker (#92)
- **M45** · Extraction waves: tests for wave timing per difficulty, the reserve, regen points on Depot's real level, and bots setting off again (#97)
- **M46** · Extraction guards and hunters: tests for posts, patrols, hunters and cover, and a balance guard per difficulty on Depot (#98)
- **M47** · Extraction pay and records: tests for run pay, the run's records and bests, and older saves (#101)
- **M48** · Extraction on Woodland and Neon Heights: data and balance tests per map, and the perf harness can play a run (#103)
- **M49** · Supply events: a table in pool.md read by the pool, tests for the clock, the order and the case odds, and a browser test of the Mode pop-up with a fixed clock (#106)
- **M34b** · Multi-floor navigation: map cells hold multiple walkable levels, enabling buildings with stairs and balconies (#72)
- **M33c** · Sloping ground for maps (physics, BBs, sight, bot routes, minimap); BBs land in earth with no bounce. Groundwork for Woodland (#74)
- **FA6** · Audio renders at 48 kHz with seeded reverb; debug overlay shows latency (#55)
- **M69** · Sound effects drop their silent tails and the countdown beep renders once, so the sounds take less memory (#124)
- **M68** · Two unused style rules removed (#121)
- **BP1** · The rendered sounds are held once (about 9 MB less); the perf script restarts with each match (#53)
- **FA11a** · Production build compresses with Brotli and gzip; browser test plays real production build with mouse lock (#61)
- **FA11a** · TypeScript stricter (exactOptionalPropertyTypes); GitHub checks verify scope and changelog; dead code removed (#61)
- **FA3** · The perf harness measures Low, Medium and High with `--preset all` (#67)
- **FA11b** · What Play does next and the pause and result text are pure, unit-tested functions; `?perf` logs how long each part of a match build takes (#73)
- **FA11b** · Unit tests share a worker's modules and split into fast and slow projects (`npx vitest run --project fast` for quick feedback); the gate's browser-test failures show the test, the locator and the expected and received values (#73)
- **FA14** · The browser smoke test waits for a match to draw before trying its keys, and gives the scoreboard, order wheel and squad order steps the same wait as firing and reloading, so slow CI frames no longer fail it (#80)
- **FA15** · The perf harness measures heap growth between two forced full garbage collections, so repeated runs agree (+0.9 MB on four of five runs, −3.4 on one, against swings of ±10 MB before) (#88)
- **M50** · Woodland and Neon Heights download only once Dev content is on, the pool and stats tables are a file of their own, and the code size budget is 900 kB with a warning at 90 % (#107)
- **M51** · CI runs the slow tests in three parallel jobs beside the main check; the Extraction balance tests and the map Extraction blocks share one helper each; a smoke test plays Tournament Extraction with Retro pixels and Pro CQB against Pro (#110)
- **M64** · The performance check can play Extraction: its scripted player opens a case on Depot (#118)
- Roadmap: the owner's playtest notes, feature picks and second batch (#16, #17, #20, #22)
- Audit fixes: graphics quality, audio, simulation, bots, menus, accessibility, tooling (#34, #35, #36)
- Bug pass: game flow, replica handling, sound, menus, HUD, squad orders on ramps and platforms (#37, #38)
- Roadmap: the owner's third feature picks (#46)
- Roadmap: the Pro difficulty plan, M36 to M41 (#68)
- Licence: the MIT licence is added (#99)

## 0.1 Dev 3 · 2026-10-03

### Added
- **M7a** · Q and E keys freed for leaning (swap key removed)
- **M7b** · Lean left and right with Q and E to peek around cover
- **M8** · Magazines and reloads: limited per round, swap the fullest spare, HUD gauges
- **M9** · BB physics pass: weight matters, drag and spin, hop-up lift
- **M10** · Movement and positioning: spread by stance and movement, bots lean corners, 2σ crosshair
- **Audit fixes** · Render quality presets (`?quality=`), a steadier crosshair on small drops (#4)
- **Elevation** · Ramps and raised floors for players and bots (#6)

### Fixed
- 9 code bugs: hit effects replay, pole marker over pause, whistle timing, sway, dead-zone, dry-fire, NaN, suppressed shots, wall fire

### Internal
- Docs: every change as a pull request, the repository's new name, the roadmap and playtest guide (#1, #2, #5, #7, #8, #9)
- Automatic checks on every pull request: a browser smoke test and a GitHub workflow (#3)

## 0.1 Dev 2 · 2026-10-01

### Added
- **M1** · Walk and sprint keys; rebindable key bindings; bigger Depot (50 × 32 m)
- **M2** · Footsteps by surface and movement; bots hear them; positional sound and landing thuds
- **M3** · Reload hand animation; hit flinch and puff effects; smooth camera turning
- **M4a** · Difficulty levels (Easy, Normal, Hard); fairer close range; per-enemy contacts; bot brain split
- **M4b** · Crouch-peeking over low cover; moving as a team; varied routes; walking
- **M5** · Attack / Defend: flagpole objective, overtime, half-time swap

### Internal
- Bug pass: bots mind moving teammates; tag policy and docs tidied

## 0.1 Dev 1 · 2026-09-30

### Added
- Scaffold and first-person scene with Three.js and Rapier
- Movement: walk, sprint, crouch, jump with responsive feel
- Depot map: 44 × 28 m greybox warehouse with cover and routes
- Two replicas: AEG rifle and gas pistol with ammo counter and switching
- BB projectiles: visible trails, travel time, gravity arc, hop-up lift
- One-hit elimination with hit calling: hand up, walk to dead zone, spectate after
- Bots: patrol, spot, react with a human delay, shoot with inaccuracy, take cover roughly
- Full matches: 3v3 rounds, round clock, first to 5 rounds, result screen
- Minimal HUD: crosshair, ammo, timer, score, hit feedback
