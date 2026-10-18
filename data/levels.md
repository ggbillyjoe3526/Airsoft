# Levels: what you unlock as you play

Matches give XP, XP raises your level, and each level unlocks the items in its row for good. This file is the whole
plan: what you start with, what each level unlocks, how much XP each level takes and what a match gives. Edit it to
change any of that, or to raise the level cap.

**The game reads this file.** It is bundled into the build and read when the game starts (`src/progress/levels.ts`,
`src/progress/gameLevels.ts`), like [pool.md](pool.md) and [stats.md](stats.md). Change a row, run the game, and it
changes. After editing, run `npm run test`: `src/progress/levels.test.ts` reads this file and fails with the line
number of anything it can't understand. A row the game can't read is left out with a warning in the browser console,
so a typo never stops the game from starting.

---

## How to read and edit this file

- **Level** counts up from 0 with no gaps. Level 0 is the starting kit: every player has it from the first visit.
- **XP** is what a level takes on top of the level before it (level 0 takes none). The Armory shows the running
  total.
- **Unlocks** names items by their pool.md Name, separated by commas. Every item in pool.md is in exactly one row, so
  nothing is left out and nothing is given twice.
- **The level cap is the last row.** To raise it, add rows under it: new levels with the new content in them.
- **Adding an item.** Its pool.md row first (what it is) and its stats.md row (how it shoots), then its Name in a
  level's Unlocks here. An item still being built (pool.md's Access `dev`) shows only with Dev content on.
- **Moving an item later.** Unlocks are never taken away: an item moved to a higher level stays with everyone who has
  it, and one moved to a lower level goes to everyone already past that level, the next time they open the game.
- **Skins** come with the Progression Update. They will go in the Unlocks cells the same way, by name.

## Levels

| Level | XP | Unlocks |
|---|---|---|
| 0 | 0 | GBB Pistol, AEG Rifle, Standard Battery, Green Gas, Weapon Torch |
| 1 | 100 | Red Dot |
| 2 | 300 | Vertical Grip, Red Laser |
| 3 | 400 | Hi-Cap Magazine, Extended Magazine |
| 4 | 500 | Silencer |
| 5 | 600 | Red Gas, Tight-Bore Barrel |
| 6 | 700 | Angled Grip, Low-Cap Magazine |
| 7 | 800 | 2x Scope |
| 8 | 900 | 11.1 V LiPo Battery |
| 9 | 1000 | Long Barrel, Black Gas |
| 10 | 1200 | Cyber Pistol |

- **The order.** The first levels give the parts that help straight away (a clear sight, a steadier aim, more BBs),
  the middle ones the trade-offs (a quiet muzzle, quick handling or a tighter barrel), and the last ones the strongest
  power (the LiPo battery, Black Gas) and the Cyber Pistol.
- **The pace** (2026-10-13). A first-to-5 match on Normal gives about 250 XP, so level 1 comes after the first match
  and level 10 after about 25 matches on Normal (about 17 on Hard, 13 on Pro).
- **At the cap,** XP stops counting until the cap goes up: the Armory and the match summary say so.

## XP

What a finished match gives. The practice range and the tutorial give none, and nor does a match that uses dev
content or Dev settings that change how it plays.

| Event | XP |
|---|---|
| Match played | 100 |
| Match won | 100 |
| Round won | 20 |
| Hit on an opponent | 10 |

- **A shorter custom match gives less:** Match played, Match won and each Round won are scaled by its rounds to win ÷ 5
  (at most 1), so a first-to-5 match gives them in full.
- **A round won counts only if you took part in it** (you hit an opponent in it, or were still in when it ended), so
  sitting a match out gives no more than playing it.
- **An Extraction run** (dev content for now) gives the XP in the cases you get out with, plus Hit on an opponent for
  each hit, with no Match played, Match won or Round won. A run you don't get out of gives your hits only.
- **The difficulty** multiplies the total: the lower of the opponents' and your teammates' (the opponents' alone when
  you have none). Custom rules give at most ×1.5. A multiplier can't be set below 0.1.

| Difficulty | Multiplier |
|---|---|
| Easy | 0.5 |
| Normal | 1 |
| Hard | 1.5 |
| Pro | 2 |
