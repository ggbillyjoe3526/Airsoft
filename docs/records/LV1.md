# LV1 · Levelling up in place of the Armory's Shots (owner, 2026-10-13)

**Review:** 6 attempts · 8/8 · Accept (Opus) · 4 to 6 re-gated the saved loadouts merge

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✗ 0 s (build) | ✗ 1 s | ✗ 0 s (no playwright report) | ✗ 24 s (16 unread) | ✗ | ✓ | – | The main merge, prepared in a scratch worktree, committed its `node_modules` symlink and replaced the real one; merge rebuilt without it, packages reinstalled | ~2.5 h | test workers (Opus) 314k, 184k and one unreported, docs (Opus) 182k, QA (Opus) 56k, changelog (Haiku) 26k |
| 2026-10-13 | 2 | Opus 5.5 (build thread) | ✓ 21 s | ✓ 535 s | ✗ 906 s (3 failed) | ✗ 1875 s (16 unread) | ✓ | ✓ | – | 3 browser checks wrong in the test: the Armory button also matched the level badge's label, the tutorial's coach waited 5 s while the range built under load, and the Ghost run expected the dev content reason; perf files carried the head re-signed mid-run | ~1 h | – |
| 2026-10-13 | 3 | Opus 5.5 (build thread) | ✓ 20 s | ✓ 503 s | ✓ 1009 s | ✓ 1898 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic (Opus) 90k |
| 2026-10-13 | 4 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 494 s | ✓ 879 s | ✗ 1759 s (neon extraction low) | ✓ | ✓ | – | The re-gate on the saved loadouts merge (SL1, save format 3): Neon Extraction Low read 44.2 draw calls against a baseline recorded low (40.15; every task since 10 Oct reads 43.2 to 45.0); baseline re-recorded at 43.72 | ~2 h | – |
| 2026-10-13 | 5 | Opus 5.5 (build thread) | ✓ 19 s | ✗ 502 s (2 failed: Report a Bug link (IM7) copies the whole report a…) | ✓ 940 s | ✓ 1777 s | ✓ | ✓ | – | 2 of 5263, a known issue in a file this task doesn't touch: the bug report's two copy tests. A longer wait went in first; M102 then found the cause on main (test files share a worker's module cache, so one run earlier loads the real clipboard, which never answers) and its fix came in with the merge, the wait taken back out | ~1 h | – |
| 2026-10-13 | 6 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 495 s | ✓ 917 s | ✓ 1812 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic (Opus) 86k |

## Decisions

- **No rarity tiers, and the rebalance that goes with it.** The Cyber Pistol keeps its old Legendary numbers (14 BBs a second, 1.1 s reload, 0.28 s draw, 1.0 J, 0.30°); the Low-Cap Magazine carries two more and changes and draws quicker; the Long Barrel adds 10 % energy and groups 10 % tighter; AEG Rifle, GBB Pistol and the LiPo stay; bots lose the tier bonus. Balance runs on the change, 48 figures: Depot 16 of 16 in band (Extraction from 43.1 XP a minute against Easy to 15.6 against Pro, Pro Elimination west end 48.7 %, Pro Attack / Defend attackers 54.2 %); Woodland, Neon Heights and close range 29 of 32 in band, 2 near an edge (Neon Heights by Night Pro west end 43.7 %, Woodland Pro attackers 57.1 %), and Hard's first hit at 5 m inside 0.75 s at 15.8 % against ≤ 15 %, within noise and below the 19 % already in KNOWN_ISSUES (also in DECISIONS).
- **Levels 0 to 10, by name in `levels.md`.** Level 0 is the GBB Pistol, the AEG Rifle and their power sources; sights and grips come first (Red Dot 1, Vertical Grip and Red Laser 2), magazines and the Silencer next (3, 4), the trade-off parts after (5 to 9) and the Cyber Pistol at 10, so each level adds one new way to play (also in DECISIONS).
- **The curve: 100, 300, 400 … 1,200 XP a level, 6,500 to level 10.** The first unlock comes after one match, then a level every one to five Normal matches, about 26 to the cap.
- **XP carries the Field Credits rules over.** Match played 100, Match won 100, Round won 20, Hit 10, scaled by rounds to win ÷ 5 and multiplied by the difficulty (Easy 0.5 to Pro 2, custom at most 1.5), so a Normal match gives about 250 XP and the pace the owner tuned for credits holds (also in DECISIONS).
- **Extraction cases hold XP in the same ranges the credits had.** The mode's balance bands stay as they were; the measured figures above sit inside them.
- **Old Armory items don't carry over: save format 3** (2 is SL1's saved loadouts, which landed first). A format 1 or 2 save loads at level 0 with its settings, records and saved loadouts; the collection store is dropped and the browser's old `airsoft.collection` key is left unread (deleting it buys nothing) (also in DECISIONS).
- **Disable levelling keeps the old Unlock all gear setting's id (`unlockAllGear`).** A switch already on stays on; it unlocks everything without touching the player's level and counts as a cheat (also in DECISIONS).
- **The Armory's next row is the next level with something offered.** A level whose items are all dev content (Dev content off) reads locked, so the row and the next-unlock card always name the same level.
- **Saved picks drop an old rarity tier on read** (`parseItemKey`), so a returning player's Loadout comes back as far as their level allows.
- **The right-click menu stays for the saved loadouts.** `ui/menus/contextMenu.ts`, `menuPlacement.ts` and `css/context.css` lost the Armory's scrap but are SL1's tab menus now; only the scrap choices went.
- **A saved loadout's locked pick says the level that unlocks it** ("Cyber Pistol: unlocks at level 10: GBB Pistol instead"), from the same `lockedAt` the Loadout's greyed cards use; with Disable levelling on every saved set is whole. A format 2 save's saved picks carry rarity tiers, read as plain ids.
- **Six attempts, not four.** Attempt 3 was accepted; 4 to 6 re-ran the gate after merging SL1, and both failures were outside LV1's work. Neon Extraction Low's perf baseline (8e90a4b) read 40.15 draw calls where G11, IM7, M94, SL1 and LV1 measured 43.2 to 45.0, so each passed or failed by chance against its 44.17 bar: re-recorded at 43.72 (b124f19), then BN1 re-recorded it on main at 44.85 and main's file is kept. The bug report's copy tests failed on attempt 5 as their known issue said; the longer wait the row suggested was not the cause, M102's fix on main is (`vi.resetModules` before the import), so the file is main's and the row is gone.

## Known issues left

- The Armory lights a level's items by your level, so an item moved up in `levels.md` shows locked to a player who already has it (KNOWN_ISSUES › Replicas, loadout and the Armory, can wait).
