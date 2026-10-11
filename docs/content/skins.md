# Skins

The rulebook for replica skins, which arrive in 0.5. Their checks come with toolkit part 4, built with the skins
themselves. The steps are in `docs/content/README.md`.

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
4. **Rarity.** (Every tier.)

## Checks (toolkit part 4)

| Level | What will be checked |
|---|---|
| Rules | Its ID, name and access; its family; it claims replicas that exist. |
| Compatibility | Drawn on every replica it claims at Low and High; the replica's numbers identical with and without it. |
| Spec test | Colour distance from the team colours and each map's palette; texture memory; pictures on each replica. |
