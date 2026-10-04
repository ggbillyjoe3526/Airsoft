# Pool: every asset you can own

This file is the game's register of **pooled assets**: every replica, power source, optic, grip, laser, magazine,
barrel, muzzle part and (later) grenade the player can own. It also holds the numbers behind the Armory: what Field Credits you earn,
what Tokens and Shots cost, the rarity tiers and their odds, and what scrapping pays.

**The game reads this file.** It is bundled into the build, and the tables below are parsed when the game starts
(`src/pool/poolFile.ts`, `src/pool/pool.ts`). Change a number or a row here, run the game, and it changes (the Loadout
screen uses the assets from M26b, the Armory the economy from M26c). Run
`npm run test` after editing: `src/pool/pool.test.ts` reads this file and fails with the line number of anything it
can't understand (a typo in a tag, a duplicate ID, a missing column). A row the game can't read is skipped, with a
warning in the browser console, so a typo never stops the game from starting.

BBs are not pooled assets: every BB weight is free and unlimited, picked on the Loadout's slider.

**How each asset performs** (muzzle energy, BB weight, rate of fire, handling, and what a higher tier improves) is in
[stats.md](stats.md), next to this file. This file says what exists; that one says how it shoots.

---

## How to read and edit this file

### Identifiers

Every asset has a six-digit **ID**, given in the order assets were added: `000001` is the Gas Pistol, `000002` the AEG
Rifle, and so on. The ID is what the player's save remembers, so:

- **Never change or reuse an ID.** Renaming an asset (the Name column) is fine; its ID stays.
- **A new asset takes the next free number** (the highest ID in this file plus one), whatever its category.
- The **Name** is what the game shows. Use Title Case (each word starts with a capital).

### Tags and Fits: what goes with what

Compatibility works by **tags**, not by naming replicas, so a part is never tied to one replica:

- Each **replica** lists the **Tags** that describe it: what drives it (`electric`, `gas`, `spring`), what rails it
  has (`top-rail` for an optic, `under-rail` for a grip, `pistol-rail` for a laser), what magazines it takes
  (`aeg-mag`, `pistol-mag`), whether its barrel can be swapped (`barrel-mount`) and whether its muzzle is threaded for
  a silencer (`muzzle-thread`).
- Each **part** lists in **Fits** the tags it needs. It fits every replica that has **any one** of those tags.
- Fits can also name a replica by its ID, for a part that should go on one replica only (for example `000002`).

So Green Gas (`Fits: gas`) works with the Gas Pistol today and with any gas replica added later, with no change to
Green Gas. To let the AEG Rifle take the Red Laser, either add `under-rail` to the Red Laser's Fits, or add
`pistol-rail` to the AEG Rifle's Tags. Tags are lower case, words joined with `-`, separated by commas.

### The Key column

Replicas, optics, grips, lasers and magazines have a **Key**: the name of the code that says how they behave. Their
numbers (the replica's fire rate, the optic's zoom, the grip's handling) are in stats.md, by the same Key. Keys are
listed in `src/pool/pool.ts` (`REPLICA_KEYS` and its neighbours). A new row can reuse an existing key: for example a
second red dot with the same behaviour but its own name and ID. A brand new behaviour needs code first.

Power sources need no key: their **Type** says what drives them, and stats.md's Power sources table (by ID) what they do.

### Power sources

Every replica needs one, picked on its Customise screen from the ones you own that fit it.

- **Type** is `battery`, `gas` or `spring`. It must match how the replica is driven (its tags: `electric`, `gas` or
  `spring`), which Fits takes care of.
- What it does is in stats.md's Power sources table, by its ID: a battery sets the rate of fire (as in a real AEG,
  where the spring inside sets the energy), a gas or a spring the energy. A new power source needs a row there too.
- Each spring is its own asset (an M100 spring, an M110 spring …), not a slider on one spring: swapping springs is
  how a spring replica is tuned. There are no spring replicas yet, so the Springs table below is empty.

### Starter and In Shots

- **Starter** `yes`: every player owns it from the start (at Common), so it is equipped by default.
- **In Shots** `yes`: Shots in the Armory can dispense it. Set it to `no` to keep an asset in the file (and in the
  saves of players who already own it) without giving out any more.

### Adding an asset: an example

To add a higher spec battery for every electric replica, take the next free ID and add a row to Power sources:

```
| 000021 | High Output Battery | battery | electric | no | yes |
```

and a row to stats.md's Power sources table saying what it does (say `| 000021 | High Output Battery | 0 | 25 | 0 |`
for 25 % more rate of fire). It then drops from Shots, and once owned it shows in the Power row of every replica tagged
`electric`.

### Chase items: Tiers and Drop %

The Replicas table has two more columns (any other asset table can take them too, with the same headers); leave both
blank for an ordinary asset.

- **Tiers** lists the only tiers the asset comes in (tier names from the Rarity table, separated by commas). The
  Cyber Pistol says `Legendary`: there is no Common, Rare or Epic one. Shots, Unlock all gear and bots only ever give
  it in those tiers.
- **Drop %** makes it a **chase item**: each item a Shot gives has this chance of being it, drawn before and apart
  from the rest (which stay equally likely among themselves). The Cyber Pistol's 0.25 is 1 in 400 items, about 1 in
  133 Shots. A chase item comes in its Tiers, drawn by their odds.
- A chase replica can also turn up in an opponent's hands on Hard once you own it (about 5 matches in 100,
  `RANDOM_LOADOUT.chaseChance` in `src/config/bots.ts`).

A replica tagged `built-in-power` has its power source built in (the Cyber Pistol's battery): no power source fits
it, and it needs none to shoot.

### Rarity tiers

Every asset comes in every rarity tier (unless its Tiers column says otherwise) (a Legendary AEG Rifle, a Rare Green Gas …), and each copy is a separate item
you own. Higher tiers carry a **Bonus %** that improves the asset a little (stats.md's Tier scaling table says which
stats each category improves, and by how much of the Bonus). One hit is still one hit: rarity improves how a replica
shoots and handles, never "damage".

- **Odds %** is the chance that a dispensed asset comes in that tier. The odds must add up to 100.
- **Scrap FC** is what one spare copy pays back when you scrap it in the Armory (you always keep one).
- The tiers are read from the table top to bottom, rarest last. **Adding a tier is just a new row**, wherever it
  belongs in the order; give it odds and take those odds from the others so they still add up to 100.
- **Never rename a tier.** Saves remember copies by tier name, so renaming one (say "Very Rare" to "Super Rare") hides
  every copy players own in it. Odds, Bonus % and Scrap FC can change freely.

Tiers planned for later, in order after Legendary (not in the game yet; add a row to switch one on):
Mythic, Relic, Fabled, Artifact, Divine, Immortal, Godlike, Transcendent, Ascended, Ultimate.

---

## Economy

### Field Credits

Field Credits (FC) are the free currency, earned by playing matches (not the practice range or the tutorial). They are
never bought with money: the whole Armory is free. A match you lose still pays, just less.

| Event | FC |
|---|---|
| Match played | 40 |
| Match won | 60 |
| Round won | 10 |
| Hit on an opponent | 5 |

A shorter custom match pays less: Match played, Match won and each Round won are scaled by the match's rounds to win
÷ 5 (at most 1), so a first-to-5 match pays them in full. A Round won pays only for a round you played a part in (you
hit an opponent in it, or were still in when it ended), so sitting a match out earns no more than taking part. The
total is then multiplied by the difficulty, the lower of the opponents' and your teammates' (the opponents' alone
when you have none):

| Difficulty | Multiplier |
|---|---|
| Easy | 0.5 |
| Normal | 1 |
| Hard | 1.5 |
| Pro | 2 |

### Tokens and Shots

Shots are paid in Tokens. FC can be exchanged for Tokens at the rate below (0.00625 Tokens per FC, so 160 FC buys one
Token), and a Shot you can't cover in Tokens can be paid for in FC at the same rate.

| Setting | Value |
|---|---|
| Tokens per FC | 0.00625 |
| Tokens per Shot | 1 |
| Tokens per 10 Shots | 10 |
| Assets per Shot | 3 |
| Ten Shots guarantee | Rare |
| Unowned item weight | 2 |

"Ten Shots guarantee" is the lowest tier a ten-Shot always holds at least one of (`none` to switch it off).

Each dispensed asset first gets its tier by the Rarity odds below, then one of the assets in Shots: "Unowned item
weight" makes an asset you don't own yet at that tier that many times likelier than one you do (1: all equally likely).
The tier odds are never changed by it.

### Pity

However the draws fall, you never go more Shots than this without an asset of the tier or rarer: the Shot that
reaches the count holds one. The count carries on between visits; a single Shot and each Shot of a ten-Shot count
alike. Add a row for another tier
(`| Very Rare or rarer within | 10 |`), or take one out to switch it off.

| Guarantee | Shots |
|---|---|
| Epic or rarer within | 20 |
| Legendary or rarer within | 100 |

### Rarity

| Tier | Odds % | Bonus % | Scrap FC |
|---|---|---|---|
| Common | 46 | 0 | 5 |
| Uncommon | 26 | 3 | 10 |
| Rare | 15 | 6 | 20 |
| Very Rare | 8 | 9 | 40 |
| Epic | 4 | 12 | 80 |
| Legendary | 1 | 15 | 160 |

What the Bonus % improves is stats.md's **Tier scaling** table: with the numbers as shipped, a Legendary (15 %) replica
has 15 % less spread, a 15 % quicker reload and draw, and 7.5 % more energy and rate of fire; a Legendary battery 7.5 %
more rate of fire; a Legendary gas 7.5 % more energy; optics, grips, lasers, magazines, barrels and muzzle parts
handle better (and a barrel shoots a little tighter).

---

## Assets

### Replicas

| ID | Name | Key | Tags | Starter | In Shots | Tiers | Drop % |
|---|---|---|---|---|---|---|---|
| 000001 | Gas Pistol | pistol | pistol, gas, pistol-mag, pistol-rail, muzzle-thread | yes | yes | | |
| 000002 | AEG Rifle | aeg | rifle, electric, aeg-mag, top-rail, under-rail, barrel-mount, muzzle-thread | yes | yes | | |
| 000019 | Cyber Pistol | cyber | pistol, built-in-power | no | yes | Legendary | 0.25 |

### Power sources

| ID | Name | Type | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000003 | Standard Battery | battery | electric | yes | yes |
| 000015 | 11.1 V LiPo Battery | battery | electric | no | yes |
| 000004 | Green Gas | gas | gas | yes | yes |
| 000008 | Red Gas | gas | gas | no | yes |
| 000009 | Black Gas | gas | gas | no | yes |

### Springs

Spring replicas aren't in the game yet. Springs go in Power sources above, with Type `spring` and Fits `spring`.

### Optics

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000007 | Red Dot | redDot | top-rail | no | yes |
| 000010 | 2x Scope | scope2x | top-rail | no | yes |

### Grips

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000006 | Vertical Grip | vertical | under-rail | no | yes |
| 000011 | Angled Grip | angled | under-rail | no | yes |

### Lasers

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000005 | Red Laser | redLaser | pistol-rail | no | yes |

### Magazines

Each replica's standard magazine is built in (as are iron sights and no grip): these are the alternatives.

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000012 | Hi-Cap Magazine | hiCap | aeg-mag | no | yes |
| 000013 | Low-Cap Magazine | lowCap | aeg-mag | no | yes |
| 000014 | Extended Magazine | extended | pistol-mag | no | yes |

### Barrels

Each replica's standard barrel is built in: these are the alternatives. Later: barrels for the pistol, more lengths.

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000016 | Tight-Bore Barrel | tightBore | barrel-mount | no | yes |
| 000017 | Long Barrel | long | barrel-mount | no | yes |

### Muzzle parts

Later: a tracer unit (with tracer BBs, v0.3).

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
| 000018 | Silencer | silencer | muzzle-thread | no | yes |

### Grenades

Grenades, smoke and flash bombs come in a later version (v0.3). The Loadout's Grenades slot waits for them.

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
