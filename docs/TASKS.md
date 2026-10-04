# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M27 · Walk-off route searches rationed to one per tick
tier: core
perf: required
touches: src/sim/elimination.ts, src/sim/elimination.test.ts, src/sim/character.ts, src/sim/simulation.ts, docs/KNOWN_ISSUES.md
contract: GameState (a field on Character is allowed), stepSimulation (its phase order is unchanged)
acceptance:
  1. A hit no longer runs the victim's walk-off route search inside the hit itself: the search happens in the elimination step over the following ticks, at most one route search per tick across all victims (two hits in one tick: one search that tick, one the next; a test counts the searches)
  2. A victim reaches its dead zone as before (the existing elimination and depot match tests pass unchanged); while its route is not found yet it stands calling, which the 1.4 s call already covers
  3. No new per-tick allocation: the route array and the pending flag live on the character and are reused
  4. The KNOWN_ISSUES row about the walk-off route search inside the tick is removed
status: done
attempts: 1

## M28 · Impact puffs start at half size
tier: trivial
perf: skip
touches: src/render/impactPuffs.ts, src/config/render.ts, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. A puff's first drawn frame is at least 50 % of its full size (today about 28 %), so a close-range hit shows a puff at once
  2. The puff's full size and lifetime are unchanged (its tuning values stay in config)
  3. The KNOWN_ISSUES row about the first frame of a puff is removed
status: open
attempts: 0

## FA6 · Audio: range, pause ramps, mix, ambience
tier: core
perf: required
touches: src/audio/, src/config/audio.ts, src/config/sounds.ts, src/config/menus.ts, src/core/awayWatch.ts, src/game.ts, docs/KNOWN_ISSUES.md
contract: none (no Contracts line changes; the three volume buses and their sliders stay as they are)
acceptance:
  1. CORE-01: a one-off world sound (BB impact, body hit off a channel, the flag's rope, a bird) further than `AUDIO.spatial.maxDistance` builds no nodes and plays nothing, and a far impact doesn't use up the impact window; the practice range's targets carry to `targetMaxDistance` (a test: 61 m nothing, 59 m one source and one panner)
  2. CORE-02: pause and resume ease the match's outlets (setTargetAtTime) instead of jumping, and the context is suspended only once the `pauseFade` is over (a Resume within it keeps it running); tests with fake timers
  3. CORE-03 + CORE-17: every cue and the outdoor bed are rendered once at `AUDIO.renderRate` whatever the context's rate (a 44.1 kHz test context renders at 48 kHz and makes 48 kHz buffers); the reverb impulse is seeded (two engines make identical impulses) and made a channel per warm-up step at the context's rate
  4. CORE-16: the limiter sits on the effects bus only (effects → ducking → limiter → master); the interface bus goes straight to master (a test walks the graph); the debug overlay shows the audio output latency
  5. CORE-20: the window losing focus stops play as a hidden tab does (`core/awayWatch.ts`, unit-tested with event targets; Game disposes it)
  6. CORE-21: a `resume()` that is refused, or still not running after `blockedCheck`, calls `AudioEngine.onBlocked`, and a refused volume preview too; the Game shows `BROWSER_NOTES.audioBlocked` under the menu buttons and again on each pause until play resumes (tests: rejected and pending resume)
  7. CORE-26: positional sounds use refDistance 4 and rolloff 1 (was 3 and 1.4); a test with the panner's formula keeps a bot's quietest sprint step within 28 dB of your loudest shot at 20 m, and a shot louder than a step at every distance
  8. CORE-30: your own hit dips the effects bus (never the interface) to `duck.hit.depth` for its hold, the round and match whistles to `duck.whistle.depth`; a dip during a deeper one keeps the deeper depth and the later end (tests on the ducking gain's automation)
  9. CORE-34: while you are not alive the world is low-passed and turned down (`AUDIO.out`), cleared when you're back in play; a quiet, seeded, seamless outdoor bed loop plays from the first moment of play on two panned copies into the world (effects slider), stopped on dispose; birds chirp from a seeded timer 22–45 m away (tests: graph, offsets, loop seam, birds' timing and distance)
  10. CORE-35: a character's channel is moved only when they moved more than `moveEpsilon`, not while beyond `maxDistance` or out in the dead zone, and is put where they are for their next sound; no muffling rays for them (counted in a test)
  11. CORE-31: tests for a long spare moment rendering several cues and stopping at the budget, and the whistle envelope's order and stop time
  12. No new per-frame or per-tick allocation; sfx.ts's shot path is unchanged (M29 owns it)
status: gates
attempts: 1
