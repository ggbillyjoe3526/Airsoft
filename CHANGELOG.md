# Changelog

This changelog follows [Keep a Changelog](https://keepachangelog.com/). Lines name the milestone and pull request number. The changelog is maintained by the changelog agent.

## Unreleased

### Added
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

### Changed
- Pistol leans slightly left again, much less than before (#13)
- **M25b** · Depot: site props instead of most two-high crate stacks (#45)
- **FA6** · World sounds carry further; getting hit and the whistles briefly dip the rest of the mix (#55)

### Fixed
- Empty magazine hint names your reload key (#23)
- **BP1** · The hit-direction marker fades over the hit call instead of being cut off; sprint picks up as soon as you let go of Q / E (#53)
- **BP1** · A semi or burst double-tap never fires a tick early; a BB fired straight up never goes backwards (#53)
- **BP1** · The pause screen shows the match's seed; New game says which end you start at (#53)
- **BP1** · Minimap: stacked crates show as tall cover; the debug panel sits below the minimap (#53)
- **BP1** · Pallet racks soak BBs up instead of bouncing them; turning Dev settings off before a match starts lets it count for records (#53)
- **BP1** · A double-click on Play no longer shows the "needs a moment" hint; Key bindings says why two quick clicks cancel (#53)
- **FA6** · Pause fades audio in 30 ms instead of clicking; pauses when the window loses focus; hint when the browser blocks audio (#55)

### Internal
- Roadmap: the owner's playtest notes, feature picks and second batch (#16, #17, #20, #22)
- Audit fixes: graphics quality, audio, simulation, bots, menus, accessibility, tooling (#34, #35, #36)
- Bug pass: game flow, replica handling, sound, menus, HUD, squad orders on ramps and platforms (#37, #38)
- Roadmap: the owner's third feature picks (#46)
- **M26d** · Dev settings: Disable Armory and Unlock all gear for testing (#48)
- **M27** · Walk-off route searches rationed to one per tick (pull request to follow)
- **BP1** · The rendered sounds are held once (about 9 MB less); the perf script restarts with each match (#53)
- **FA6** · Audio renders at 48 kHz with seeded reverb; debug overlay shows latency (#55)

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
