# Pool: every item there is

The register of **pooled assets**: every replica, power source, optic, grip, laser, magazine, barrel, muzzle part, light
and (later) grenade the player can unlock. It also holds Extraction's cases. Read it to add or tune an
asset.

**The game reads this file.** It is bundled into the build and its tables are parsed when the game starts
(`src/pool/poolFile.ts`, `src/pool/pool.ts`). Change a number or a row, run the game, and it changes: the Loadout
screen and the Armory use the assets. After editing, run `npm run test`: `src/pool/pool.test.ts` reads this file and
fails with the line number of anything it can't understand (a typo in a tag, a duplicate ID, a missing column). A row
the game can't read is skipped with a warning in the browser console, so a typo never stops the game from starting.

BBs are not pooled assets: every BB weight is free and unlimited, picked on the Loadout's slider.

**How each asset performs** (muzzle energy, BB weight, rate of fire, handling) is in [stats.md](stats.md), and **the
level that unlocks it** in [levels.md](levels.md), both next to this file. This file says what exists; stats.md how it
shoots; levels.md when you get it.

---

## How to read and edit this file

### Identifiers

Every asset has a six-digit **ID**, given in the order assets were added: `000001` is the GBB Pistol, `000002` the AEG
Rifle, and so on. The player's save remembers the ID, so:

- **Never change or reuse an ID.** Renaming an asset (the Name column) is fine; its ID stays.
- **A new asset takes the next free number**: the highest ID in this file plus one, whatever its category.
- **Name** is what the game shows, in Title Case (each word starts with a capital).

### Tags and Fits: what goes with what

Compatibility works by **tags**, not by naming replicas, so a part is never tied to one replica:

- **Tags** (on a replica) describe it: what drives it (`electric`, `gas`, `spring`), what rails it has (`top-rail` for
  an optic, `under-rail` for a grip, `pistol-rail` for a laser), what magazines it takes (`aeg-mag`, `pistol-mag`),
  whether its barrel can be swapped (`barrel-mount`) and whether its muzzle is threaded for a silencer
  (`muzzle-thread`).
- **Fits** (on a part) lists the tags the part needs. It fits every replica that has **any one** of them.
- **By ID.** Fits can also name a replica by its ID (for example `000002`), for a part that goes on one replica only.

So Green Gas (`Fits: gas`) works with the GBB Pistol today and with any gas replica added later, with no change to
Green Gas. To let the AEG Rifle take the Red Laser, either add `under-rail` to the Red Laser's Fits or add
`pistol-rail` to the AEG Rifle's Tags. Tags are lower case, words joined with `-`, separated by commas.

### The Key column

Every asset except a power source has a **Key**: the name of the code that says how it behaves. Its numbers (a
replica's fire rate, an optic's zoom, a grip's handling) are in stats.md, by the same Key. The keys are listed in
`src/pool/pool.ts` (`REPLICA_KEYS` and its neighbours). A new row can reuse an existing key: for example a second red
dot with the same behaviour but its own name and ID. A brand new behaviour needs code first.

Power sources need no key: their **Type** says what drives them, and stats.md's Power sources table (by ID) says what
they do.

### Power sources

Every replica needs one, picked on its Customise screen from the ones you have unlocked that fit it.

- **Type** is `battery`, `gas` or `spring`. It must match how the replica is driven (its tags: `electric`, `gas` or
  `spring`), which Fits takes care of.
- **What it does** is in stats.md's Power sources table, by its ID. A battery sets the rate of fire (as in a real AEG,
  where the spring inside sets the energy); a gas or a spring sets the energy. A new power source needs a row there
  too.
- **Springs.** Each spring is its own asset (an M100 spring, an M110 spring …), not a slider on one spring: swapping
  springs is how a spring replica is tuned. There are no spring replicas yet, so the Springs table below is empty.

### Levels

Every asset here is unlocked by a level in [levels.md](levels.md), by its Name: level 0 is what every player starts
with. A new asset needs a level there too (the test says so if one has none). There is one of each: once unlocked, an
item is yours for good.

### Access: public or dev

Every asset has an **Access** tag, `public` or `dev` (the same tag maps, modes and difficulties carry in the game's
config; owner, 2026-10-04).

- `public`: there for everyone. Its level unlocks it, bots can carry it and the Loadout offers it.
- `dev`: still being built. It shows only while **Dev content** is on (tick "Dev settings" in Settings, then use the
  Dev tab), and then looks like any other asset, unlocked at its level (or with Disable levelling). An item someone
  has unlocked stays in their save, hidden while Dev content is off. A match that uses it doesn't go into the records
  or give XP.
- **Going public.** Changing `dev` to `public` makes a finished asset available to everyone. A blank cell reads as
  `public`; any other word leaves the row out, so a typo never hands out something unfinished.

### Adding an asset: an example

To add a higher spec battery for every electric replica, take the next free ID and add a row to Power sources:

```
| 000021 | High Output Battery | battery | electric | dev |
```

Then add a row to stats.md's Power sources table saying what it does (`| 000021 | High Output Battery | 0 | 25 | 0 |`
gives 25 % more rate of fire), and its Name to a level's Unlocks in levels.md (say level 11, raising the cap). Its
Access says `dev`, so it shows only with Dev content on while you try it out. Change it to `public` and it is
everyone's at its level; once unlocked it shows in the Power row of every replica tagged `electric`.

### Built-in power

A replica tagged `built-in-power` has its power source built in (the Cyber Pistol's battery): no power source fits it,
and it needs none to shoot.

---

## Extraction

### Caches

The cases an Extraction run places (M44, dev content for now). Each run's seed picks how many of each kind it gets
(Per run), which of the map's case spots they stand on, and what each holds.

- **Opening.** Hold the Use key beside a case for Open s seconds. While you do, it makes a noise the bots hear within
  Heard m.
- **Contents.** XP rolled in the XP range, or, on its BB resupply % chance, a resupply instead (your spare magazines
  topped up there and then). Cases never hold gear: levels unlock it.
- **Keeping it.** What you find counts only if you extract: it is added to the run's XP (levels.md's XP section). A hit
  drops it where you fell (go back for it); a run that ends any other way keeps nothing.
- **Key** is what the maps' case spots use; leave it as it is.

| Case | Key | Per run | Open s | Heard m | XP | BB resupply % |
|---|---|---|---|---|---|---|
| Ammo can | ammo-can | 4 to 6 | 2 | 8 | 15 to 40 | 40 |
| Field case | field-case | 2 to 3 | 4 | 14 | 40 to 80 | 0 |
| Marshal's locker | locker | 1 | 7 | 30 | 100 to 150 | 0 |

---

## Assets

### Replicas

| ID | Name | Key | Tags | Access |
|---|---|---|---|---|
| 000001 | GBB Pistol | pistol | pistol, gas, pistol-mag, pistol-rail, muzzle-thread | public |
| 000002 | AEG Rifle | aeg | rifle, electric, aeg-mag, top-rail, under-rail, barrel-mount, muzzle-thread | public |
| 000019 | Cyber Pistol | cyber | pistol, built-in-power | public |

### Power sources

| ID | Name | Type | Fits | Access |
|---|---|---|---|---|
| 000003 | Standard Battery | battery | electric | public |
| 000015 | 11.1 V LiPo Battery | battery | electric | public |
| 000004 | Green Gas | gas | gas | public |
| 000008 | Red Gas | gas | gas | public |
| 000009 | Black Gas | gas | gas | public |

### Springs

Spring replicas aren't in the game yet. Springs go in Power sources above, with Type `spring` and Fits `spring`.

### Optics

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000007 | Red Dot | redDot | top-rail | public |
| 000010 | 2x Scope | scope2x | top-rail | public |

### Grips

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000006 | Vertical Grip | vertical | under-rail | public |
| 000011 | Angled Grip | angled | under-rail | public |

### Lasers

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000005 | Red Laser | redLaser | pistol-rail | public |

### Magazines

Each replica's standard magazine is built in (as are iron sights and no grip): these are the alternatives.

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000012 | Hi-Cap Magazine | hiCap | aeg-mag | public |
| 000013 | Low-Cap Magazine | lowCap | aeg-mag | public |
| 000014 | Extended Magazine | extended | pistol-mag | public |

### Barrels

Each replica's standard barrel is built in: these are the alternatives. Later: barrels for the pistol, more lengths.

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000016 | Tight-Bore Barrel | tightBore | barrel-mount | public |
| 000017 | Long Barrel | long | barrel-mount | public |

### Muzzle parts

Later: a tracer unit (with tracer BBs, v0.3).

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000018 | Silencer | silencer | muzzle-thread | public |

### Lights

A weapon torch on its own mount (M33h): the Weapon torch key (T) switches it on and off. At night it lights a cone you
and the bots see further in, and it gives you away. By day it does nothing and isn't fitted. Every bot carries one on a
night field.

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
| 000020 | Weapon Torch | weaponTorch | pistol, rifle | dev |

### Grenades

Grenades, smoke and flash bombs come in a later version (the Replica Update). The Loadout's Grenades slot waits for them.

| ID | Name | Key | Fits | Access |
|---|---|---|---|---|
