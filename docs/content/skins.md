# Skins

The rulebook for replica skins. Today a skin is a replica colour scheme (Customise › Colour, `config/schemes.ts`);
patterned skins arrive in 0.5 and keep these rules. The checks are toolkit part 4 (CT4). The steps are in
`docs/content/README.md`.

## Rules

Must:

- **Looks only.** A skin never changes a number: the replica shoots the same with and without it.
- **Readable teams.** Never a team colour, and nothing that hides the team armband, at a distance and against each
  map's colours.
- **The orange tip stays.** The orange tip setting still applies.
- **No mixed families.** The "Realistic colours" families never mix on one replica.
- **Drawn on every replica it claims,** at Low and High, within the texture memory budget.
- **A permanent ID,** like any pool asset, dev first.

## Brief

1. **Name, and the plain family it becomes under Realistic colours.** (A plain made-up name; the nearest family.)
2. **Which replicas.** (Every replica of one type.)
3. **Colours and pattern.** (Two colours, away from both team colours.)
4. **Level.** (None: colour schemes are free to everyone. Patterned skins join `levels.md`'s Unlocks with the
   Progression Update.)

## Checks

`node pipeline/content-check.mjs skin:<id>` (`skin:cobalt`, `skin:all`). Levels 1 and 2, the team colours and the
texture budget run for every skin in every pull request (`src/content/skinChecks.test.ts`);
the pictures and each map's colours need the browser. A skin has no balance run: it changes no number.

| Level | Check | What is checked |
|---|---|---|
| Rules | `skin.registered` | A Title Case name with no brand, a one-word camel-case id (the save key), real colours; no twin. |
| | `skin.family` | The Realistic colours family it turns into exists. |
| | `skin.access`, `skin.offered` | Tagged dev or public; a public one is in `PUBLIC_SKINS`; Customise offers it as its tag says. |
| | `skin.id`, `skin.pinned` | A shipped id is pinned (`SHIPPED_SCHEME_IDS`) and never goes away. |
| | `skin.claims`, `skin.defaults` | It fits every replica that takes a skin; new players and bots wear public skins. |
| Fit | `skin.drawn` | Drawn on every replica it claims at Low and High (and from the model files), every painted part in its colours, which cover at least 60 % of the replica; the Cyber Pistol keeps its own. |
| | `skin.orangeTip` | With the orange tip setting on, the tip is drawn, at least 20 apart in colour (CIEDE2000) from what sits around it (a warning when closer). |
| | `skin.realistic` | Under Realistic colours, every part turns its one family. |
| | `skin.numbers`, `skin.looksOnly` | The kit plays the same with it and without; nothing that decides play reads a skin's colours. |
| Spec | `skin.teams` | A colour that shows at a distance (at least 10 % of a bot figure's replica) never reads as another team's on a bot; one that reads as a team's needs its reason in `TEAM_COLOUR_SKINS`. |
| | `skin.texture` | Its painted textures within 2.8 MB at High. |
| | `skin.map` | Against each map's common colours, as painted before light: at least one colour that shows stands 10 or more apart (blending in is a warning when bots carry it, a figure when only a player does). |
| | Pictures | Each claimed replica in the menu, bold and Realistic. |
| Balance | `skin.balance` | None: shown as information. |

The numbers are `SKIN_RULES` in `src/config/contentRules.ts`.
