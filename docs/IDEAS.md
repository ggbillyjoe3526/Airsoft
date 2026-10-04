# Ideas (not approved)

Parking lot for future features. Do not implement unless asked.

- **Dead-rag / hit cloth**: hit players pull a red dead-rag out, not just a raised hand.
- **VIP escort** (owner, 2026-10-03: an idea for later): one team walks a VIP across the field, the other tries to knock the VIP out.
- **Hostage rescue** (owner, 2026-10-03: an idea for later): one team frees a hostage (a prop or a figure) and brings them out; the other guards them.
- **More game modes** from real sites beyond the roadmap's (TDM, Capture the Flag, Domination, Bomb and a medic mode are planned): speedsoft rules (semi auto only, no minimum distance, short fast rounds).
- **Voiced hit calls**: a shouted "HIT!" (CC0 recording, or the browser's speech synthesis) when someone is hit.
- **Referee NPC** who whistles for round start/end.
- **Surrender rule** at close range (sites often use "bang-bang" or surrender for CQB).
- **Adjustable hop-up**: tweak your BB arc in game (e.g. hold a key and scroll), like tuning a real replica. (Proposed for Phase 2, deferred by the owner to a later update.)
- **Bang-bang surrender**: tag out an unaware enemy within ~3 m without shooting. (Deferred to a later update; see also the surrender rule above.)
- **Who-hit-you view** after being hit (a short replay of the BB's arc). The end-of-match summary moved to the roadmap (M19).
- **Depot variations**: alternative cover layouts and a dusk lighting option.
- **Vaulting** over low obstacles (owner idea, 2026-10-01): parked until the M11 Depot rework, which may add a few 0.7–0.9 m obstacles designed for it (see ROADMAP).
- **Esport difficulty** (owner idea, 2026-10-03; parked, not to be built yet): a fourth bot difficulty above Hard that plays almost like a competitive title such as Counter-Strike or Valorant (sharper, faster, more disciplined bots). Easy, Normal and Hard come first. As an opt-in top level it leaves the default game approachable (CLAUDE.md §11: not esports-first). Notes for when it comes (owner's second batch, 2026-10-03): aim stats (reaction time, accuracy, time to hit); tune first-shot spread with this tier in mind (a still rifle spreads about 11 cm at 20 m today; keep the spread, since BBs aren't perfectly accurate, but it is the top complaint in Valorant); bots must not hear through walls (planned in M22 anyway); sensitivity as cm/360 comes in M18.
- **Rubber-knife tag** (owner, 2026-10-04: maybe later): a rubber-knife tap from behind as a silent takedown, a
  house-rule toggle as at many sites. An alternative to the bang-bang surrender above; one of the two, not both.
- **Slide into cover** (owner, 2026-10-04: maybe later, beside prone): a short sprint slide that ends crouched behind
  a bunker, as speedsoft players do. Prone is on the roadmap (v0.4, with a field built for it).
- **Progression curve for Beta** (audit POOL-23, owner 2026-10-04: an idea for Beta): today everything is owned at
  some tier in ~20 Shots (~2 h), every asset at Rare or better in ~58 Shots (~6 h), then ~1,500 Shots (~100 h) of
  +3 %-per-tier handling with no milestones. Ideas: completion on the Armory tile ("23 / 84 · 3 Legendary");
  milestones in pool.md (`| Milestone | Needs | Gives |`: "Every optic owned → +1 Token", "Every asset Rare+ → a
  Legendary Shot"); more assets before tuning odds (grenades, suppressors, tracers); Legendary 1 → 1.5 % now that pity
  caps the wait; Easy ×0.5 → ×0.7, since Easy players most need their first unlocks.
- **Bots with gear for Beta** (audit POOL-24, owner 2026-10-04: an idea for Beta): the player's kit outgrows bots that
  carry factory gear for ever on Easy and Normal (M29b gave Hard opponents rolled kits). Either give bots a tier dial by
  difficulty (read from `botConfig`), or make higher tiers lateral (Legendary: tighter spread, a touch more recoil or a
  slower draw), as the attachments already are. Decide after a playtest.

## Declined (owner, 2026-10-04)

Offered in the third research list (`future-features-2026-10-04.md` in the project files) and turned down; don't
propose these again unless the owner brings them up: Infection, a game day playlist, a shoot house time trial, King of
the Hill as a Domination option, hi-cap winding, a riot shield, 40 mm shower shells and claymores, a goggle view, site
dressing at the dead zone, a Tour mode, photo mode, match replays, site sounds on the menus, controller support.
Also offered on 2026-10-03 and not picked: captions for hit calls and whistles, a map editor / mod support, a "gun hits
count" house rule.
