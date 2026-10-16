# MR1 · Match, Loadout and Armory redesign, and the home screen (playtest items 9–14, 16, 17, 19, 21)

**Review:** 3 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 19 s | ✗ 514 s (draft record format) | ✗ 1050 s (old crumb, facts) | – stopped, task perf skip | – not reached | – not reached | – no critic on a red gate | smoke specs still used the crumb | ~2.5 h | tests worker ~100k, QA ~93k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | ✓ 33 s | ✓ 510 s | ✗ 941 s (Skins tab assertion) | ✓ 1833 s | ✓ | ✓ | – no critic on a red gate | boot.spec still expected a Skins tab | ~1 h | perf agent ~40k |
| 2026-10-16 | 3 | Opus 5.5 (build thread) | – not re-run (attempt 2 ✓) | – not re-run (attempt 2 ✓) | ✓ 1017 s | – not re-run (attempt 2 ✓) | – not re-run (attempt 2 ✓) | – not re-run (attempt 2 ✓) | 8/8 Accept (Sonnet) | – | ~25 min | critic ~28k |

## Decisions

- **Concepts first.** Five concept images (Match, its rules, Loadout, Customise, Armory) went to the owner, who chose
  "Approve all" on 2026-10-16; the screens follow them (`/mnt/project-files/concepts/beta1-menus/`, project files).
- **Compact, not smaller than 15 px.** The redesigned screens drop to the menus' smallest type step (15 px) for their
  small text and to 32 to 40 px controls; nothing goes under the 15 px floor (`styleSheet.test.ts`). The top bar and
  Settings keep their sizes, as asked.
- **A mode shows only on a map that hosts it** (`modeOffered` is `mapHosts`, item 12). All three maps host every mode
  today, so nothing visible changes; Attack and Defend on a map without flags would now be hidden, not offered.
- **A rule the mode doesn't read is hidden; one the ruleset sets is shown locked** with its value and the ruleset's
  name ("Off · set by Skirmish"), so the rows don't jump as the ruleset changes. Teammates hides in a 1v1.
- **Every rule's note moves into one help line** at the panel's foot, for the row under the pointer or the keyboard,
  else the ruleset's line. The rows are one line each.
- **The realistic colours are per replica.** The Colour tab offers the bold schemes and four realistic ones (Black,
  Wolf Grey, Ranger Green, Tan), saved under the replica's existing colour key, so old saves load as they were. The
  Settings switch for realistic colours stays until ST1 takes it out; while on, a bold tile says which realistic
  colour it shows as.
- **Saved loadouts are a dropdown.** One button names the loadout carried and opens the list (New loadout last while a
  slot is free); Rename types over the name in place; Duplicate and New carry the new loadout and open its name; keys 1
  to 5 still switch. "Replace with yours" and the Use button went with the tabs; the model keeps `replace`.
- **Customise has a Back button** (Esc too) and a breadcrumb that is text only. The top bar's LOADOUT was already
  inert on the Loadout.
- **The Armory runs across.** The level track is a row of columns on a progress line, the next level scrolled into
  view as it opens. The wheel scrolls it sideways while it can go that way; the track takes the keyboard's arrow
  keys; two arrows at its ends are for the mouse, out of the tab order. "Level N" stays spelled out on the Armory, as
  the summary says it; the top bar's chip reads "LVL N" (item 20).
- **Your match shows the rules as chips** and no picture; the mode stills in `public/menu/` are no longer shown but are
  kept (deleting files waits for the owner).

## Known issues left

- The mode stills (`public/menu/mode-*.jpg`, `MODE_STILLS`, `pipeline/map-stills.mjs`) are unused by the menus
  (KNOWN_ISSUES).
