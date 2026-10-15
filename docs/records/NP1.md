# NP1 · Noisy ground and props (Dev 6 item 41)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 471 s | ✓ 855 s | ✓ 1645 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~4 h | QA (Sonnet) 85k, changelog (Haiku) 25k, critic (Opus) 103k |

- Reports in `pipeline/runs/NP1/attempt-1/` (project files): the gate report, QA's and the critic's, and the balance
  figures against main.

## Decisions

- **Running into a noisy prop knocks it, and a BB landing hard on steel rings it (also in DECISIONS).** The props, their sounds and ranges are `NOISE.props` in `config/noise.ts`: steel (skip, container, van) 20 m and a 12 m ring, clank (generator, IBC) 17 m and 10 m, rattle (rack, stall, vending machine) 16 m, glass (phone booth) 15 m, plastic (site toilet, arcade cabinet) 14 m, wood (crate, pallet load, Woodland's board fence) 13 m; everything a level is built from is silent.
- **A knock is the wanted move's speed into the face it was stopped by, 3 m/s or more, with at least 2 mm of the move lost.** Rapier's character controller keeps a skin and zeroes the velocity it lost, so the speed lost is unreliable; the wanted move along the stop's direction is a run (4.2) or sprint straight in, never a walk (2.3), a crouch (2.1), a run glancing in under about 45° or a push held against the prop (the velocity rebuilds 0.75 m/s a tick). The prop must be the nearest noisy one within 0.08 m of the body's side, that way (cosine 0.5), and not underfoot.
- **One quiet time per prop (1.2 s), whoever sets it off, by knock or ring (`GameState.propQuiet`).** One prop can't be drummed on, and determinism keeps (no randomness).
- **Bots hear a knock as a step: placed on whoever hit it, walls muffling it, shared by teamPlay bots.** A ring is `faint`: heard where it rang, only by a bot with nobody in sight and nothing seen or heard within `hearingContactTime`, and not shared, so it draws an idle bot's look and never pulls one off a fight.
- **Steps on gravel and steel plate carry ×1.35 (also in DECISIONS), named by the simulation.** `WorldQuery.surfaceUnder` (`map/underfoot.ts`, moved out of `audio/soundMaterials.ts`; the physics world shares the soundscape's ground grid through `groundGridOf`) puts the surface on run, sprint and landing steps, so the bots, the audio and the sound cues read one answer. Walking stays silent; the step sounds themselves are unchanged (their fingerprints hold) and play ×1.35 louder there.
- **The tuning is a TS config (`config/noise.ts`), not an editable .md table.** It sits beside the bots' hearing ranges it is measured against, and the noisy kinds are typed against `BlockKind`. `createSimContext` reads `NOISE` itself rather than through `SimServices` (critic's note): one table the whole game shares, and tests pass their own context to `stepPropBump` and `ringProp`.
- **Six prop sounds are map cues (`prop.steel`, `clank`, `rattle`, `wood`, `plastic`, `glass`, 3 variants each, seeds 3711–3716, appended last).** Each map renders only those of its props (Depot five, Neon Heights five, Woodland one, the range four); the title screen renders nothing more and no older cue moved. They play from the knock at `AUDIO.levels.propBump` (0.85) out to 26 m (`AUDIO.propNoise`); a ring plays only as the BB's impact.
- **The visual cue is a puff of the prop's dust, 4 times a BB's (`PROP_BUMP_DUST`).** The props are merged meshes, so nothing wobbles; the puff reuses the impact puffs' pool.
- **The Sound cues ring and the minimap show an enemy's knock as a step out to the knock's range, and the ring fades each sound over its own reach.** Before, a sound that carried further than its kind was accepted and dropped the same frame; a silenced shot's marker now also fades over its shorter reach.
- **Balance figures (balance.mjs on 9fa44f2 against main 67e9e01, all 105).** Nothing moved more than 1.5 standard errors; the same three figures sit outside within noise as on main (Woodland Normal and Pro Attack / Defend, the 5 m Hard duel). In 4-minute 5v5 matches bots knocked about 2 props a round on Depot and 1 on Neon Heights, and rang steel about 6 times a round on Depot.

## Known issues left

- Noisy props, rings and noisy ground are first guesses to tune in play (KNOWN_ISSUES › Bot behaviour, playtest).
