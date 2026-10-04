# Pool: every asset you can own

This file is the game's register of **pooled assets**: every replica, power source, optic, grip, laser, magazine
and (later) grenade the player can own. It also holds the numbers behind the Armory: what Field Credits you earn,
what Tokens and Shots cost, the rarity tiers and their odds, and what scrapping pays.

**The game reads this file.** It is bundled into the build, and the tables below are parsed when the game starts
(`src/pool/poolFile.ts`, `src/pool/pool.ts`). Change a number or a row here, run the game, and it changes. Run
`npm run test` after editing: `src/pool/pool.test.ts` reads this file and fails with the line number of anything it
can't understand (a typo in a tag, a duplicate ID, a missing column). A row the game can't read is skipped, with a
warning in the browser console, so a typo never stops the game from starting.

BBs are not pooled assets: every BB weight is free and unlimited, picked on the Loadout's slider.

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
  has (`top-rail` for an optic, `under-rail` for a grip, `pistol-rail` for a laser) and what magazines it takes
  (`aeg-mag`, `pistol-mag`).
- Each **part** lists in **Fits** the tags it needs. It fits every replica that has **any one** of those tags.
- Fits can also name a replica by its ID, for a part that should go on one replica only (for example `000002`).

So Green Gas (`Fits: gas`) works with the Gas Pistol today and with any gas replica added later, with no change to
Green Gas. To let the AEG Rifle take the Red Laser, either add `under-rail` to the Red Laser's Fits, or add
`pistol-rail` to the AEG Rifle's Tags. Tags are lower case, words joined with `-`, separated by commas.

### The Key column

Replicas, optics, grips, lasers and magazines have a **Key**: the name of the code that says how they behave (the
replica's fire rate, the optic's zoom, the grip's handling). Keys are listed in `src/pool/pool.ts`
(`REPLICA_KEYS` and its neighbours). A new row can reuse an existing key: for example a second red dot with the same
behaviour but its own name and ID. A brand new behaviour needs code first.

Power sources need no key: their **Type** and **Power %** say everything.

### Power sources

Every replica needs one, picked on its Customise screen from the ones you own that fit it.

- **Type** is `battery`, `gas` or `spring`. It must match how the replica is driven (its tags: `electric`, `gas` or
  `spring`), which Fits takes care of.
- **Power %** is how much harder it shoots than the replica as it comes: the muzzle energy rises by that much (a
  little more speed, a flatter, longer flight). A battery also raises the rate of fire by the same amount.
- Each spring is its own asset (an M100 spring, an M110 spring …), not a slider on one spring: swapping springs is
  how a spring replica is tuned. There are no spring replicas yet, so the Springs table below is empty.

### Starter and In Shots

- **Starter** `yes`: every player owns it from the start (at Common), so it is equipped by default.
- **In Shots** `yes`: Shots in the Armory can dispense it. Set it to `no` to keep an asset in the file (and in the
  saves of players who already own it) without giving out any more.

### Adding an asset: an example

To add a higher spec battery for every electric replica, take the next free ID and add a row to Power sources:

```
| 000015 | High Output Battery | battery | 8 | electric | no | yes |
```

It then drops from Shots, and once owned it shows in the Power row of every replica tagged `electric`.

### Rarity tiers

Every asset comes in every rarity tier (a Legendary AEG Rifle, a Rare Green Gas …), and each copy is a separate item
you own. Higher tiers carry a **Bonus %** that improves the asset a little (the table under Rarity says what each
category improves). One hit is still one hit: rarity improves handling, never "damage".

- **Odds %** is the chance that a dispensed asset comes in that tier. The odds must add up to 100.
- **Scrap FC** is what one spare copy pays back when you scrap it in the Armory (you always keep one).
- The tiers are read from the table top to bottom, rarest last. **Adding a tier is just a new row**, wherever it
  belongs in the order; give it odds and take those odds from the others so they still add up to 100.

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

A shorter custom match pays less: Match played and Match won are scaled by the match's rounds to win ÷ 5 (at most 1),
so a first-to-5 match pays them in full. The total is then multiplied by the opponents' difficulty:

| Difficulty | Multiplier |
|---|---|
| Easy | 0.5 |
| Normal | 1 |
| Hard | 1.5 |

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

"Ten Shots guarantee" is the lowest tier a ten-Shot always holds at least one of (`none` to switch it off).

### Rarity

| Tier | Odds % | Bonus % | Scrap FC |
|---|---|---|---|
| Common | 46 | 0 | 5 |
| Uncommon | 26 | 3 | 10 |
| Rare | 15 | 6 | 20 |
| Very Rare | 8 | 9 | 40 |
| Epic | 4 | 12 | 80 |
| Legendary | 1 | 15 | 160 |

What the Bonus % improves, by category (set in code, `src/pool/kit.ts`):

| Category | A Bonus of 15% means |
|---|---|
| Replica | 15% tighter spread, 15% quicker reload and draw |
| Power source | 7.5% more muzzle energy (and, for a battery, rate of fire), on top of its Power % |
| Optic | 15% quicker to raise to your eye |
| Grip | its steadiness and handling both 7.5% better |
| Laser | 7.5% tighter spread on top of its own |
| Magazine | 15% quicker reload |

---

## Assets

### Replicas

| ID | Name | Key | Tags | Starter | In Shots |
|---|---|---|---|---|---|
| 000001 | Gas Pistol | pistol | pistol, gas, pistol-mag, pistol-rail | yes | yes |
| 000002 | AEG Rifle | aeg | rifle, electric, aeg-mag, top-rail, under-rail | yes | yes |

### Power sources

| ID | Name | Type | Power % | Fits | Starter | In Shots |
|---|---|---|---|---|---|---|
| 000003 | Standard Battery | battery | 0 | electric | yes | yes |
| 000004 | Green Gas | gas | 0 | gas | yes | yes |
| 000008 | Red Gas | gas | 10 | gas | no | yes |
| 000009 | Black Gas | gas | 20 | gas | no | yes |

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

### Grenades

Grenades, smoke and flash bombs come in a later version (v0.3). The Loadout's Grenades slot waits for them.

| ID | Name | Key | Fits | Starter | In Shots |
|---|---|---|---|---|---|
