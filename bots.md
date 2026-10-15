# Bots: names and personalities

Who the bots are and how each kind plays: every bot's name and personality, and what each personality changes. Read
it to add a name, or to make a personality play differently. What each personality carries comes with the bot gear
table (Dev 6 item 23), not here.

**The game reads this file**, as it reads [pool.md](pool.md) and [stats.md](stats.md): it is bundled into the build
and parsed when the game starts (`src/config/botsFile.ts`, `src/config/botPersonalities.ts`). Change a name or a
number, run the game, and it changes. After editing, run `npm run test`: `src/config/botsFile.test.ts` reads this file
and fails with the line number of anything it can't understand. A cell the game can't read plays as if the
personality changed nothing there, with a warning in the browser console, so a typo never stops the game from
starting.

A personality changes how a bot plays, never how well: its reaction, turning and aim stay its difficulty's
(`src/config/bots.ts`).

---

## How to read and edit this file

- **Names.** Each name always plays the same personality, so you learn who to watch. A match gives every bot a
  different name, and each team gets different personalities while there are enough. Keep names short (they sit over
  heads and in the hit feed: 12 characters at most), friendly and made up: no real people and no brands.
- **A new personality** is a row in every table below with the same name in its first column, and at least one name
  in the Roster. What each column does is coded; a new kind of behaviour needs code first.
- **(×) columns** multiply the difficulty's number: 1 changes nothing, below 1 is less, above 1 more. **(+) columns**
  add to it (a chance from 0 to 1). **(s)** is seconds, a range written `1.5–3`.
- **Yes, no or –.** Yes turns a habit on, no turns it off, and – leaves it as the difficulty plays it (off where the
  difficulty has no such habit).
- **Card note.** The line the "What got you" card adds about the bot that hit you; `{name}` is the bot's name.

### What the columns do

- **Lane pause (×).** How long it stops at each point of its lane to look ahead.
- **Cover at a lane point (×).** The chance it steps into crouch cover by a lane point to hold from there.
- **Cover on contact from (×).** On a fresh sighting at least this far away it gets behind close cover before
  fighting; nearer, it fights where it is.
- **Walk the last (×).** Closing in on where someone was seen or heard, it walks (quietly) for the last this-many
  metres.
- **Flank chance (+).** The chance a search of a far spot goes round to one side first; in overtime, the chance it
  goes for the flag round the side.
- **Burst (×) and Burst pause (×).** How long it holds the trigger, and how long it waits between bursts.
- **Watch where you ducked (s).** Having lost sight of you, how long it keeps watching the spot before coming after
  you.
- **Pushes in.** In a fight it closes in as it sidesteps, it takes no cover on a fresh sighting, and it runs at
  where someone was instead of walking.
- **Waits for the team.** Well ahead of its teammates at a lane point, it waits for them to catch up.
- **Own lane.** When the team's plan puts it on a lane with a teammate, it takes a free lane, the one furthest from
  the others.
- **Holds until (s left).** In Elimination it walks its lane only to the last point short of the middle and holds
  there, from crouch cover when there is some, going after noises only nearby; it moves on once the round clock is
  down to this or it is the last of its team in play. – never holds.
- **Aims from cover.** Standing still to fight or hold, it raises its sight; over a ledge or crate the replica rests
  on it (steadier, as yours does).
- **Holds angles.** Holding still, it aims at the corners and doorways someone would step out of.
- **Slices corners.** Near the enemy it walks and aims at each corner as it opens, and tops up its magazine from
  cover.
- **Watches the flag first (s).** In Elimination's overtime it first holds cover near the flag for this long, aiming at
  it, before it goes in to touch it; it goes at once when it is the last of its team in play, and every bot goes in
  for the overtime's last seconds. – goes straight for the flag. The column can be left out: then nobody watches first.

## Roster

| Name | Personality |
|---|---|
| Dash | Rusher |
| Turbo | Rusher |
| Zippy | Rusher |
| Rocket | Rusher |
| Scooter | Rusher |
| Nitro | Rusher |
| Comet | Rusher |
| Whippet | Rusher |
| Rook | Anchor |
| Brick | Anchor |
| Boulder | Anchor |
| Anvil | Anchor |
| Stump | Anchor |
| Moss | Anchor |
| Bollard | Anchor |
| Oak | Anchor |
| Fox | Flanker |
| Ferret | Flanker |
| Magpie | Flanker |
| Kite | Flanker |
| Slink | Flanker |
| Swivel | Flanker |
| Weasel | Flanker |
| Jinx | Flanker |
| Owl | Careful |
| Specs | Careful |
| Ledger | Careful |
| Hush | Careful |
| Pip | Careful |
| Patch | Careful |
| Tortoise | Careful |
| Cricket | Careful |

## Personalities

| Personality | Card note |
|---|---|
| Rusher | {name} rushes: first through the gap, running to where you were and pushing in once they see you. |
| Anchor | {name} anchors: holds one spot short of the middle, aiming over cover, until late in the round. |
| Flanker | {name} flanks: takes a lane of their own and comes round the side of where you were. |
| Careful | {name} plays it careful: walks quietly, clears each corner and watches where you ducked out of sight. |

## How they move

| Personality | Lane pause (×) | Cover at a lane point (×) | Cover on contact from (×) | Walk the last (×) | Flank chance (+) | Burst (×) | Burst pause (×) | Watch where you ducked (s) |
|---|---|---|---|---|---|---|---|---|
| Rusher | 0.3 | 0.3 | 1 | 0.25 | -0.25 | 1.2 | 0.8 | – |
| Anchor | 1.5 | 1.5 | 0.7 | 1 | 0 | 1 | 1 | 1–2.5 |
| Flanker | 0.8 | 1 | 1 | 1.5 | 0.5 | 1 | 1 | – |
| Careful | 1.4 | 1.3 | 0.7 | 2 | 0 | 0.8 | 1.2 | 1.5–3 |

## Habits

| Personality | Pushes in | Waits for the team | Own lane | Holds until (s left) | Aims from cover | Holds angles | Slices corners | Watches the flag first (s) |
|---|---|---|---|---|---|---|---|---|
| Rusher | yes | no | no | – | no | – | – | – |
| Anchor | no | yes | no | 60 | yes | yes | – | 12 |
| Flanker | no | no | yes | – | no | – | – | – |
| Careful | no | yes | no | – | no | – | yes | 5 |
