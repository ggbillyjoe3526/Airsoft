# Changelog

This changelog follows [Keep a Changelog](https://keepachangelog.com/). Lines name the milestone and pull request number. The changelog is maintained by the changelog agent.

## Unreleased

### Added
- **FA7** · Environment lighting on Medium and High: sky reflects in players, the flag, range targets and steel; contact shadows under every player on all presets (#71)
- **FA7** · Settings → Graphics: tone mapping choice (Neutral, AgX, ACES) and relief maps option (Normal, Bump) (#71)
- **FA7** · Map detail on Medium and High, on every map: bevelled edges with lighter rims, corner shading, ground variation, prop detail and signs; Low looks as before (#71)
- **FA7** · Trees round the field: None, Simple or Detailed with layered crowns and a hedge; clouds and sun disc on Medium and High (#71)
- **FA7** · The flag gets a finial, rope, cleat and painted cloth; the practice range gets chains, bands, brackets, a BB shelf, scuffed plates and painted figures, drawing fewer calls than before (#71)
- **FA2** · Settings → Graphics: Custom option to pick a preset and modify any row; changes show Custom, setting back shows the preset again; Custom is saved (#67)
- **FA2** · Graphics Settings has a frame-rate limit and Show FPS counter (#67)
- **FA2** · The first start picks a preset from the graphics card: Medium on integrated graphics (Intel, AMD Ryzen), High on a discrete card (#67)
- **FA4** · Bots keep apart and never take a teammate's cover or lane spot; their routes keep a body's width from walls (#66)
- **FA4** · A BB landing close by tells a bot roughly where the shot came from; a teammate's "HIT!" gives only the direction. Fighting bots sidestep only onto open ground that keeps you in sight; a search that finds nobody ends with a crouched look round (#66)
- **FA4** · Difficulty changes how bots play, not only how they aim: Hard uses cover and flanks more, Easy less; Easy reacts slower (0.6–1.0 s) with wider first shots but settles its aim nearer Normal (#66)
- **FA4** · Against Easy opponents your teammates start on Normal, and that default pair counts for your records under Easy (#66)
- **FA8** · Players, replicas, their parts and your gloved hands are rebuilt in a clean, stylised look with more detail on Medium and High; Low looks and costs the same (#69)
- **FA8** · Barrels and silencer have proper models on High (fluted barrels, a coupling collar, silencer end caps and rubber bands) (#69)
- **FA8** · New Custom graphics rows: Player detail, Replica detail, Hand detail, BB glow, Impact grit, Laser beam (#69)
- **FA10** · Armory pity: an Epic or better within 20 Shots, a Legendary within 100; items you don't own are twice as likely; the catalogue lists every item by rarity tier (#63)
- **FA10** · Tutorial: skip it or resume it from the pause screen; new steps for the fire selector and shooting after a sprint (#63)
- **M31** · Settings → Save: download your save as a file and load it back (Undo after), daily restore points; a second tab waits instead of overwriting
- **FA5** · Second key per action; mouse wheel binding; HUD size (0.8–1.5); crosshair custom; raw mouse input; cm/360 kept; order wheel shows keys (#59)
- **FA5** · High-contrast styles; hit, out, round messages read by screen readers (#59)
- **FA9** · Dark loading screen with physics module progress bar; favicon and web manifest (#59)
- **FA1** · Crash handling: "Something went wrong" screen with seed, Reload and Copy Report; Settings > Dev has Diagnostics Copy (#57)
- **M12a** · Fire selector with single, burst and auto; faster reloads; crouch toggle; steadier aim when still (#10)
- **M12b** · Red dot as an accessory; aiming down sights with separate sensitivity (#11)
- **M12c** · Loadout off the pause screen; BB streaks from muzzle; pistol faces forward; hop-up dials (#12)
- **M11** · Depot reworked: asymmetric layout, one flagpole in defenders' bay, raised dock (#14)
- **M15** · Menus: title screen, New game with Mode and Difficulty, Loadout and Settings screens (#15)
- **M15b** · No map loaded until Play; a Map pop-up; opaque menus; a Field of view slider (#18, #21)
- **M13** · Audio rework: replica profiles, located sounds, volume sliders, HRTF muffled through walls (#19)
- **M19** · Match info: hit feed, teammate markers, hold-Tab scoreboard, summary, records, crosshair options (#24)
- **M17a** · Loadout: pick primary and secondary replica, BB weight, hop-up dial (#25)
- **M17b** · Loadout attachments: optics, grips, magazines (#26)
- **M18a** · Invert mouse; reduced motion; aim and sprint toggles; mouse button rebinding; cm/360 sensitivity (#27)
- **M18b** · Colour-blind options; sound cues; pause on hidden tab; graphics recovery; fullscreen (#29)
- **M20** · Custom matches: rounds to win, round time, team size, friendly fire, ricochets (#28)
- **FA1** · Play Again starts new matches with their own seed; finished matches record and pay Field Credits immediately (#57)
- **M21** · Practice range: steel and figure targets at 10–60 m; distance markers; spare mags stay full (#30)
- **M22** · Squad orders on Z, X, V: Follow me, Hold here, Regroup; bots hear less through walls (#31)
- **M16** · Tutorial: ten coached steps on the practice range for new players (#32)
- **M14** · Art pass: daylight with sky and trees, dressed surfaces and props, airsoft-kit figures, dust and impacts (#33)
- **M23** · Minimap: teammates always; other team where last heard; squad order wheel on hold Z (#41)
- **M24** · Menu polish: shorter labels, version from git, 90° FOV, map blurbs, sound cue settings (#40)
- **M25a** · CC0 assets guide and optional glTF player model with built-in fallback (#43)
- **M26a** · Asset pool: pool.md register, rarity tiers, economy numbers, player's collection saved (#39)
- **M26b** · Loadout screen: Primary, Secondary and Grenades slots; Customise view per replica (#42)
- **M26c** · Armory, beta and free: earn Field Credits from matches, buy Tokens, draw from the pool (#44)
- **FA6** · Outdoor ambience bed with distant birds; world sounds muffled when eliminated (#55)
- **M29a** · Weapon stats in stats.md; tiers add energy and rate of fire; 11.1 V LiPo battery; site energy limit; Performance sheet in Customise (#54)
- **M29b** · Barrels and a silencer: Tight-Bore and Long Barrel for the AEG, a Silencer for both (bots hear it from half as far); Hard opponents carry kits of their own (#58)
- **M33a** · Woodland shown as Coming soon in the Map pop-up (#64)
- **M33b** · Glowing BBs: a per-replica Customise option (At Night by default, Always or Off); bots load them on night fields
- **M33d** · Woodland's layout, playable with the Dev content switch on (dev content: its matches aren't recorded or paid); 4v4 and 5v5 on maps with room
- **M33e** · Bushes: they hide you from bots (BBs and people pass through), on any map that has them; Woodland has 70, shown on the minimap
- **M32** · Cyber Pistol: electric pistol with semi, burst and auto, 1.00 J at 14 BBs/s, mint and pink model, unique chirp and pop sound (#75)
- **M32** · Cyber Pistol comes only at Legendary with a 0.25 % chase chance per Armory Shot item; on Hard, bots carry it about 1 in 20 matches (#75)
- **M35** · Settings → Dev → Dev content (off by default): maps, modes, difficulties and gear still being built show only with it on, and never drop from Shots (#70)
- **M35** · pool.md has an Access column: public or dev for each asset (#70)

### Changed
- **FA13** · Loadout and Armory tiles show a small line drawing of the item where the empty space was (#76)
- **FA11b** · Quit, then Play on the same map, is quicker: the map's meshes are kept and reused instead of rebuilt (#73)
- **FA2** · Shadow detail rows are greyed out when Shadows is Off (#67)
- **FA2** · Low has 80 % resolution with no shadows; Medium adds shadows and relief; High adds sharp textures, finer shadows, sheen and dust (#67)
- **FA3** · Low draws the same frame about 18 % faster in our test, with 20 % fewer triangles and a quarter of the texture memory (#67)
- **FA3** · High has crisp, steady shadows fitted to the view (about 25 m range) with fewer draw calls and triangles (#67)
- **FA3** · Raised dock and ramps cast shadows; BB streaks have consistent thickness on any screen; replica sheen returns after switching presets (#67)
- **FA4** · Bots holding a spot crouch where they can still see and sweep their view; a defender at its post decides once on arrival (#66)
- **FA8** · Third-person rifles on High show a silencer when one is fitted (#69)
- **FA4** · Attack / Defend: one attacking bot raises the flag while the others guard the pole from cover. Depot: the east spawns sit at the north end of their yard and its north exit is closed, so both ends are about as far from the dock and the Main Gate; in bot-only matches the west wins 48 % of rounds (#66)
- **FA4** · Bots plan at most one route per tick in all, so big fights don't hitch (#66)
- **FA10** · Field Credits: a won round pays only if you took part, pay scales with match length, and the difficulty bonus follows the lower of your teammates' and opponents' levels; Armory: 10 Shots and Scrap ask to confirm, holding Enter takes one Shot, the reveal shows rarest first with prices (#63)
- **FA10** · The match summary says why a round paid nothing (#63)
- **FA5** · Key names in Settings follow your keyboard layout (AZERTY, QWERTZ, etc.) where the browser can tell (#59)
- **FA9** · Cleaner menus and HUD: consistent style, button states, focus ring, marked tabs, dialogs, fade-in, hit-feed colours (#59)
- Pistol leans slightly left again, much less than before (#13)
- **M25b** · Depot: site props instead of most two-high crate stacks (#45)
- **FA6** · World sounds carry further; getting hit and the whistles briefly dip the rest of the mix (#55)
- **M30** · BBs fly by real air physics: full drag (0.52 s to 30 m, was 0.47 s), hop-up spin that wears off, factory reach unchanged
- **M30** · Each match has a light breeze that drifts BBs downwind (up to about half a metre at 34 m); the dust in the air drifts with it
- **FA12** · With ricochets set to count, a BB that bounces can hit whoever fired it (not with friendly fire off) (#60)
- **FA12** · BB and line-of-sight checks against the map are 15–25× faster, with the same results (#60)
- **M35** · Woodland's Coming soon entry shows only with Dev content on; a match using dev content stays out of the records and pays no Field Credits (#70)

### Fixed
- **FA13** · Your left hand holds the rifle's handguard, thumb up the near side, instead of sitting under it; the raised hand when you're hit is one glove again (#76)
- **FA13** · Teammates' name tags sit just above their heads up close instead of floating high (#76)
- **FA13** · Customise's Muzzle line mentions a silencer only when one is fitted (#76)
- **M32** · All carried replicas now have their sounds in the match; hear bots' AEG shots even without an equipped AEG (#75)
- **FA11c** · A second tab now always waits behind the "open in another tab" notice, even when the first is busy loading (#69)
- **FA2** · When nothing is saved and the game runs slowly, it steps down to Low at the end of a round and reports it (#67)
- **FA2** · Turning Edge smoothing on or off no longer causes graphics memory to leak (#67)
- **FA3** · The first Play no longer hitches as surface textures are built during the title screen (#67)
- **FA10** · Shot spread is the same sideways and up-down when aiming steeply up or down (#63)
- **FA5** · Esc resumes from the pause screen; the first mouse jump after the lock is ignored; teammate markers hide behind the minimap and while the scoreboard is up (#59)
- **FA1** · Jump pressed up to 0.1 s before landing still happens; click after sprint fires as soon as lockout ends (#57)
- **FA1** · Stepping down a kerb no longer widens the crosshair; drawn Elimination rounds replay (#57)
- **FA1** · A hit player always reaches the dead zone, even from the far end of Depot; crouch-walking is slightly less accurate; practice range figures match character height (#57)
- Empty magazine hint names your reload key (#23)
- **M30** · Bots lead moving targets at range by the BB's real, slower flight time under drag
- **BP1** · The hit-direction marker fades over the hit call instead of being cut off; sprint picks up as soon as you let go of Q / E (#53)
- **BP1** · A semi or burst double-tap never fires a tick early; a BB fired straight up never goes backwards (#53)
- **BP1** · The pause screen shows the match's seed; New game says which end you start at (#53)
- **BP1** · Minimap: stacked crates show as tall cover; the debug panel sits below the minimap (#53)
- **BP1** · Pallet racks soak BBs up instead of bouncing them; turning Dev settings off before a match starts lets it count for records (#53)
- **BP1** · A double-click on Play no longer shows the "needs a moment" hint; Key bindings says why two quick clicks cancel (#53)
- **FA6** · Pause fades audio in 30 ms instead of clicking; pauses when the window loses focus; hint when the browser blocks audio (#55)
- **M28** · Impact puffs start at half size

### Internal
- **M34b** · Multi-floor navigation: map cells hold multiple walkable levels, enabling buildings with stairs and balconies
- **FA11b** · What Play does next and the pause and result text are pure, unit-tested functions; `?perf` logs how long each part of a match build takes (#73)
- **FA11b** · Unit tests share a worker's modules and split into fast and slow projects (`npx vitest run --project fast` for quick feedback); the gate's browser-test failures show the test, the locator and the expected and received values (#73)
- **FA3** · The perf harness measures Low, Medium and High with `--preset all` (#67)
- Roadmap: the owner's playtest notes, feature picks and second batch (#16, #17, #20, #22)
- Audit fixes: graphics quality, audio, simulation, bots, menus, accessibility, tooling (#34, #35, #36)
- Bug pass: game flow, replica handling, sound, menus, HUD, squad orders on ramps and platforms (#37, #38)
- Roadmap: the owner's third feature picks (#46)
- **M26d** · Dev settings: Disable Armory and Unlock all gear for testing (#48)
- **M27** · Walk-off route searches rationed to one per tick (pull request to follow)
- **M30** · One midpoint integrator step per tick replaces two Euler sub-steps; drag from a lookup table; BB streak follows its mean velocity, not its end-of-tick velocity
- **BP1** · The rendered sounds are held once (about 9 MB less); the perf script restarts with each match (#53)
- **FA6** · Audio renders at 48 kHz with seeded reverb; debug overlay shows latency (#55)
- **FA11a** · Production build compresses with Brotli and gzip; browser test plays real production build with mouse lock (#61)
- **FA11a** · TypeScript stricter (exactOptionalPropertyTypes); GitHub checks verify scope and changelog; dead code removed (#61)
- **M33c** · Sloping ground for maps (physics, BBs, sight, bot routes, minimap); BBs land in earth with no bounce. Groundwork for Woodland

## v0.1-alpha.3 · 2026-10-03

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

## v0.1-alpha.2 · 2026-10-01

### Added
- **M1** · Walk and sprint keys; rebindable key bindings; bigger Depot (50 × 32 m)
- **M2** · Footsteps by surface and movement; bots hear them; positional sound and landing thuds
- **M3** · Reload hand animation; hit flinch and puff effects; smooth camera turning
- **M4a** · Difficulty levels (Easy, Normal, Hard); fairer close range; per-enemy contacts; bot brain split
- **M4b** · Crouch-peeking over low cover; moving as a team; varied routes; walking
- **M5** · Attack / Defend: flagpole objective, overtime, half-time swap

### Internal
- Bug pass: bots mind moving teammates; tag policy and docs tidied

## v0.1-alpha · 2026-09-30

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
