# BG1 · Bots' gear keeps up with yours (Dev 6 item 23)

**Review:** 2 attempts · 8/8 · Accept (Opus) · 2 re-gated the BN1 and LV1 merges and the personality lean

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 429 s | ✓ 753 s | ✓ 1611 s | ✓ | ✗ (no BG1 line yet: the changelog agent runs after the critic) | 8/8 Accept (Opus) | – | ~2.5 h | QA 68.7k, changelog 23.0k, critic (Opus) 121.6k |
| 2026-10-13 | 2 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 479 s | ✓ 810 s | ✓ 1776 s | ✓ | ✓ | 8/8 Accept (Opus) | Re-gate after the BN1 and LV1 merges and the personality lean | ~2.5 h (most of it waiting on LV1) | changelog 20.9k, critic (Opus) 70.9k |

## Decisions

- **Kits, not a roll** (also in DECISIONS): the other team's bots pick named kits from the hand-edited `bot-kits.md`
  (Factory, Rifleman, Marksman, Support, Stealth, Pointman, Cyber), each with a weight per level, in place of Hard and
  Pro's random part per slot (M29b). A kit is gear that belongs together (a scope with a tight-bore barrel, a silencer
  with a low-cap magazine), and the owner edits what bots carry and how often in one table. Every opponent picks its
  own, seeded by the match seed and its id (`botKitSeed`), so a replay keeps them.
- **Every level carries kits, Easy mostly factory** (first guesses for the owner's playtest): Factory 60 / 30 / 10 / 0
  in 100 at Easy / Normal / Hard / Pro, the rest spread over the six kits, more and better matched gear each level up;
  the Cyber Pistol 2 in 100 from Hard up. What the kits are worth (`src/ai/balance/botKits.balance.ts`, Depot
  Elimination, 32 seeds, the kitted side, each bot on its drawn personality, against the same level on the factory
  loadout): Easy 44.9 % (57 of 127 decided), Normal 56.8 % (79 of 139), Hard 52.9 % (91 of 172), all inside the
  levels' 35–65 % band. A kit helps; it never decides a match.
- **Kits lean to the bot's personality** (also in DECISIONS, with BN1's personalities): `bot-kits.md`'s optional Suits
  column names the personalities a kit suits, and a bot picks a kit that suits it `BOT_KIT_SUIT_LEAN` (3) times as
  often as the other kits with Suits: rushers Support, Pointman and Cyber, anchors Marksman and Support, flankers
  Stealth and Pointman, careful bots Rifleman and Marksman. The lean shares out only the kits with Suits, so the
  Factory keeps its chance: the difficulty decides how often a bot carries gear, its personality which (a plain ×3
  lean had cut Easy's factory bots from 65 to 49 in 96). One draw per bot, so a bot with no personality picks as
  before.
- **Teammates stay factory** (owner, 2026-10-04): kits are the other team's only. The factory kit house rule (M39)
  still sends everyone out on `LOADOUT`; on a night field the torch is still fitted to every bot by rule (M33h), never
  as part of a kit.
- **Nothing of the player's enters** (the brief): no level, unlock or saved loadout is read. The Cyber Pistol's chase
  carrier (M32: one opponent now and then, once you had one; LV1 kept it for a replica earned by levelling) goes, with
  `MatchSetup.earnedReplicas` and `earnedOf`; the Cyber kit replaces it. A kit's replicas and parts are pool items as
  LV1 made them, one set of numbers each.
- **Sights change a bot's aim, never its senses** (also in DECISIONS): `BOT_SIGHT_AIM` scales the level's aim error by
  the sight on the replica in hand. 2x scope: settled error ×0.6, settle time ×1.1, the up-close floor ×1.4, a crossing
  target ×1.5; red dot: ×0.85 and ×0.9. Iron sights ×1, so every seeded test without an optic is unchanged. Bots strafe
  as they fire, so a "moving" penalty would have cancelled the scope's gain: the error on the move stays the level's.
  Measured (Normal, 25 m, seeds 1–4, 6 s after settling): the mean angle off target falls through a red dot and by more
  than 10 % through a scope.
- **Silencers, lasers, barrels, magazines, power sources** needed nothing new: a kitted bot's replica goes through the
  player's kit maths (`pool/kit.ts` `kitSlot`) and the same armament (heard nearer, spread, rate, capacity, site
  limit). Bots fire held bursts, so a kitted replica that has full auto is set to it (the Cyber Pistol starts on semi).
- **Figures show the kit** (also in DECISIONS): the built-in figure's rifle carries its red dot or scope at every
  detail (a mount, a tube and on a scope an objective bell; `FIGURE.optic`), so a scoped bot reads at range. The rigged
  figures (behind the Dev switches) hold each replica's own model with its optic, grip, laser and barrel from the parts
  files, and the muzzle device sits at a longer barrel's end (`barrelReach`). A kit change between rounds rebuilds only
  that figure. No new model files.
- **The content check** (`replica.bots`) now builds a bot with the replica as it comes and with each part that fits it,
  and warns when no kit in `bot-kits.md` weighted above 0 brings it.
- `MatchSetup.earnedReplicas` (before LV1 `chaseOwned`) and `matchUsesDev`'s earned argument go; `botsMayCarryDev`
  asks the kit table (`kitsMayHoldDev`), so New game's records note and the match agree before any pick.

## Known issues left

- The built-in figures show only the rifle's optic (and its silencer on Player detail High); the rigged figures draw no
  parts on their far model and keep the iron sights up under an optic (KNOWN_ISSUES, Figures and art).
- Bots fight with their primary only, so a kit's sidearm and its parts are carried, not used (KNOWN_ISSUES, Bot
  behaviour).
- With the personality lean the Easy figure reads 44.9 % against 52.8 % before (in band, within noise): Easy's few
  kitted bots now lean to Support and Pointman. The weights are first guesses for the owner's playtest.
