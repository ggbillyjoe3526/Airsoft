# BP2 · Bug pass 2 and KNOWN_ISSUES sweep

**Review:** 3 attempts · 7/8 · Accept (Opus) · check 7: the QA test files are named after the task

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-08 | 1 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 350 s | ✓ 365 s | ✓ 690 s | ✗ | ✓ | – | scope: the QA commit carried two ignored report files | ~2.5 h | QA (Sonnet) 75k, changelog (Haiku) 20k |
| 2026-10-08 | 2 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 354 s | ✓ 362 s | ✓ 667 s | ✓ | ✓ | 7/8 Retry (Opus) | AC4: Neon Heights by Night not played in two modes | ~35 min | critic (Opus) 103k |
| 2026-10-08 | 3 | Opus 5.5 (build thread) | – same tree as attempt 2 | – same tree as attempt 2 | – same tree as attempt 2 | – same tree as attempt 2 | ✓ | ✓ | 7/8 Accept (Opus) | – | ~15 min | critic (Opus) 25k |

## Decisions

- **BP2 ran before the last Audit 2 tasks M77–M79, which now follow it, before BP3.** The coordinator started it
  straight after token step 4, as the project's Dev 5 queue has it; the ROADMAP said BP2 came after them, so its
  line and HANDOFF now give the order the work took.
- **A saved "As it comes" stays empty, in every slot but the power source.** "No light" was saved as none and read back
  as never picked, so the default torch came back; a replica can't run without power, so a saved none there still
  takes the default.
- **A hunter looks at once whether its push keeps the target in sight, in a new fight or on a new target.** Once per
  sidestep (M55) still holds within a fight, so the ray budget is the same.
- **The pause between bursts stays as it was (Beta).** Counting it down while the line is blocked tipped the spacing
  guard's seed 1 to 0.51 % (limit 0.5 %) through one more side-by-side walk; it waits for the spacing fix.
- **No give-way rule for bots inside each other.** Letting the one behind, or the higher id, slow down held followers
  inside stopped leaders longer (seed 3 0.27 → 1.04 %); the row in KNOWN_ISSUES says what a fix needs.
- **A carried route search is kept while its bot still wants a route within `replanDistance` of the goal.** Follow
  me's spot moves every tick, so an exact match dropped the search every frame; a bot hit while waiting gets no search.
- **The post stack copies the multisampled scene out before a pass that blends in place.** Three discards the
  samples after each resolve, so blending onto the target itself is undefined where a driver honours that.
- **A camera jump past 3 m in a frame forgets the temporal history (`POST.taa.cutDistance`).** A new round's spawn and
  the next player watched are cuts; a sprint covers about 0.1 m a frame.
- **The title screen warms one surface texture per idle moment.** At High one surface takes most of a second to draw,
  and the whole set in one idle task froze the title screen for seconds.
- **A picture drawn on a lost context fails rather than being kept blank.** The menus ask again on the next visit.
- **The balance report (on `772b0f2`): 74 figures, 0 outside, 1 outside within noise, 9 near an edge.** The one, Neon
  Heights by Day Pro Attack / Defend attackers 60.3 % ±3.3 on seeds 1-32, was re-measured on seeds 1-96: 60.1 % with
  BP2 and 60.2 % with the bot code before it, so it is the map's own edge, not this pass; logged for the playtest.
- **The Woodland's logs sound as wood and its boulders as stone underfoot.** They aren't floors, so the footsteps take
  their top from the block's box.

## Known issues left

- Weathering's dirt creep measures from world y = 0 (KNOWN_ISSUES › Graphics and performance, can wait).
- A library surface takes ~0.7-0.9 s to draw at High; a Texture detail change redraws the set at once (KNOWN_ISSUES ›
  Graphics and performance, can wait).
- Medium keeps two multisampled buffers (KNOWN_ISSUES › Graphics and performance, can wait).
- Neon Heights by Day, Pro Attack / Defend attackers ~60 % (KNOWN_ISSUES › Maps, playtest).
- Teammates walk side by side inside each other through a tight spot (KNOWN_ISSUES › Bot behaviour, can wait).
