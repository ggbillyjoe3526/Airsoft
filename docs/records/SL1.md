# SL1 · Saved loadouts (Dev 6 item 19)

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✗ 451 s | ✗ 820 s | ✓ 1474 s | ✓ | ✗ | – | – | – | QA (Sonnet) 84k |
| 2026-10-13 | 2 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 449 s | ✓ 813 s | ✓ 1455 s | ✓ | ✓ | 8/8 Accept (Sonnet) | Attempt 1: a heap count under load in a file this task doesn't touch (`worldTwins.qa.test.ts:251`, KNOWN_ISSUES; passed alone and on the re-run); two older browser tests (save format 2, a second `.context-menu` on the page); the changelog not yet written | ~2.5 h | changelog (Haiku) 19k, critic (Sonnet) 78k |

## Decisions

- **Five slots** (also in DECISIONS): the brief's 3 to 5, at the top so "CQB", "Long range", "Night" and two spares
  fit in one row of tabs at 1280 px. One number in `config/savedLoadouts.ts`; names up to 20 characters.
- **The current slot is the loadout carried, and every change goes to it** (also in DECISIONS): no Save button, so
  nothing is ever unsaved or lost on a switch. Its record is taken from the loadout whenever the set is written, so
  the settings stay the one place the match reads its kit from (`LoadoutModel.kit`, unchanged).
- **A saved loadout is the settings' own pick fields** (`equip.<slot>`, `fit.<replica>.<slot>`, `hopUp.`, `bbWeight.`,
  `glowBBs.`, `scheme.`), read back by `LoadoutModel`'s own rules over the record (`over`). So the one ownership check
  (`Ownership.owns`, and `offers` for dev gear) decides what plays, whatever unlocks gear: the Armory now, levelling
  later. Gear not available is kept as picked: it plays as the Loadout's own default, shows as locked with what plays
  instead (tab line, its tooltip, a list under the tabs, the Match screen's list), and comes back with the gear.
- **New loadout copies the one carried and becomes it,** with its name ready to type; Duplicate puts "<name> copy" in
  the first free slot and leaves the one carried alone. Replace with yours (overwrite) and Delete ask first; the last
  loadout has no Delete, and deleting the one carried carries the next (else the one before).
- **Keys 1 to 5 switch on the Loadout** (an empty slot does nothing); F2 renames, Delete deletes, the Menu key or
  Shift+F10 opens a tab's menu, and the arrows move between tabs. On the Match screen Your match has a list button
  beside Change: the saved loadouts, the current one ticked, then Manage loadouts (the Loadout). It uses the Armory's
  context menu, now with a second line and a current mark.
- **Unlock all gear keeps a set of its own,** made from the real one the first time, as its picks are kept apart
  (`equip.dev.`, M26d): a loadout saved with borrowed gear never lands in the real set. It uses M95's
  `LoadoutModel.lent()`.
- **Its own store, `airsoft.loadouts`, save format 2** (migration: a format 1 save has none). Nothing is written until
  the player changes something; without the store the game starts with one, "Loadout 1", the one carried. A newer
  build's store is never read or overwritten, and unknown fields are kept.
- The Loadout and Match screens only: loadouts still change between matches, never from a match's pause menu (owner,
  2026-10-03). Practice's Loadout (M95) has the tabs too. Bots are unaffected (they never read the player's loadout).
- A saved loadout with an empty gear slot (a player owning a single replica) leaves that slot's last pick in place on a
  switch, and the Loadout fills it as it always does. Everyone owns both starters, so it can't happen today.
- Two older browser tests changed with it: the downloaded save is format 2 (the "newer" file is now format 99, so the
  next bump doesn't break it), and the Armory's scrap-menu checks look at the visible `.context-menu`, as the Match
  screen has a second one. The context menu's styles moved to their own sheet, `css/context.css`.
- Start-up file 928.5 kB to 940.7 kB (75 % of the 1,250 kB limit): the model, the Match screen's picker and the
  words. The tabs load with the Loadout, in the background after the title.

## Known issues left

- None.
