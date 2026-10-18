# Bot kits: what the other team's bots carry

The kits the opposing bots pick from, and how often each difficulty picks each one. Every opponent picks its own kit
at the start of a match: replicas, parts and power sources from [pool.md](pool.md). Your teammates carry the replicas
as they come, and everyone does under the Factory kit house rule. Read it to change what bots carry, or how often.

**The game reads this file.** It is bundled into the build and its table is read when the game starts
(`src/pool/gameBotKits.ts`). Change a name or a number, run the game, and the bots change. After editing, run
`npm run test`: `src/pool/botKitTable.test.ts` reads this file and fails with the line number of anything it can't
understand (a name that isn't in pool.md, a part that doesn't fit, two parts for one slot, a weight that isn't a
number). A row the game can't read is skipped with a warning in the browser console, so a typo never stops the game
from starting.

The kits are the bots' own: what you have unlocked never changes them.

---

## How to read and edit this file

- **Kit** is the kit's name, shown nowhere yet. Each name once.
- **Primary** and **Secondary** are replicas, by their Name (or ID) in pool.md: the primary is the one a bot fights
  with, the secondary its sidearm. Secondary may be left empty: the bot then carries the primary only. Bots don't draw
  their sidearm yet (docs/KNOWN_ISSUES.md), so for now the secondary and its parts are carried, not used.
- **Primary parts** and **Secondary parts** list what is fitted to each, by Name (or ID) in pool.md, separated by
  commas: optics, grips, lasers, barrels, muzzle parts, magazines and power sources. Each must fit its replica (pool.md's
  Fits), one per slot. Empty: the replica as it comes (its standard magazine, battery or gas, iron sights).
- **Suits** lists the bot personalities that lean towards the kit (rusher, anchor, flanker, careful: the
  Personalities table in bots.md), separated by commas, or nothing. A bot whose personality is listed picks the kit 3
  times as often as the other kits with Suits (`BOT_KIT_SUIT_LEAN` in `src/config/bots.ts`). Kits with nothing in
  Suits, such as the Factory, keep their chance, and a weight of 0 stays 0: the difficulty decides how often a bot
  carries gear, its personality which. The column may be left out.
- **Easy**, **Normal**, **Hard** and **Pro** are each difficulty's weight for the kit: how likely an opponent on that
  difficulty is to carry it, against the other kits in the same column. Each column here adds up to 100, so the weights
  read as a chance in 100, but they don't have to: a kit weighted 2 is picked twice as often as one weighted 1. 0 (or
  empty) means never. A column with no weight above 0 means that difficulty's bots all carry the replicas as they come.
- **Dev gear.** A kit holding a pool.md asset whose Access is `dev` is picked only with Dev content on, and such a
  match stays out of the records.
- **Not here.** Weapon torches: on a night field every bot carries one by rule (pool.md › Lights). BB weight and the
  hop-up stay as each replica comes. Grenades come later (the Replica Update).

The kits are first guesses for the owner's playtest. Easy is mostly factory; each level up carries more and better
matched gear; Pro never factory. The Cyber Pistol turns up now and then from Hard up. Rushers lean to Support,
Pointman and the Cyber Pistol, anchors to Marksman and Support, flankers to Stealth and Pointman, careful bots to
Rifleman and Marksman.

## Kits

| Kit | Primary | Primary parts | Secondary | Secondary parts | Suits | Easy | Normal | Hard | Pro |
|---|---|---|---|---|---|---|---|---|---|
| Factory | AEG Rifle | | GBB Pistol | | | 60 | 30 | 10 | 0 |
| Rifleman | AEG Rifle | Red Dot, Vertical Grip | GBB Pistol | | careful | 20 | 25 | 20 | 15 |
| Marksman | AEG Rifle | 2x Scope, Tight-Bore Barrel, Vertical Grip | GBB Pistol | Red Laser | anchor, careful | 5 | 10 | 15 | 20 |
| Support | AEG Rifle | Red Dot, Vertical Grip, Hi-Cap Magazine, 11.1 V LiPo Battery | GBB Pistol | Extended Magazine | anchor, rusher | 5 | 10 | 20 | 20 |
| Stealth | AEG Rifle | Red Dot, Silencer, Low-Cap Magazine | GBB Pistol | Silencer | flanker | 5 | 10 | 15 | 20 |
| Pointman | AEG Rifle | Red Dot, Angled Grip | GBB Pistol | Red Laser, Extended Magazine, Red Gas | rusher, flanker | 5 | 15 | 18 | 23 |
| Cyber | Cyber Pistol | | GBB Pistol | Red Laser | rusher | 0 | 0 | 2 | 2 |
