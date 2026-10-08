# Stats: how every replica and part performs

The performance numbers of every replica, power source and part: muzzle energy, BB weight, rate of fire, magazines,
handling, and what a higher rarity tier improves. [pool.md](pool.md) is the register of what exists (IDs, names, tags,
rarity odds and the economy); this file says how each of those things shoots and handles.

**The game reads this file**, the same way it reads pool.md: it is bundled into the build and parsed when the game
starts (`src/config/statsFile.ts`, `src/config/gameStats.ts`). Change a number, run the game, and it changes, for bots
too (they carry each replica as it comes, at Common). After editing, run `npm run test`: `src/config/stats.test.ts`
reads this file and fails with the line number of anything it can't understand. A cell the game can't read keeps its
built-in number, with a warning in the browser console, so a typo never stops the game from starting.

One hit is still one hit. Nothing here is "damage": energy changes how fast and how far a BB flies, the rest how a
replica handles.

---

## How to read and edit this file

- **Rows** are matched by their first column: a replica or part by its **Key** (as in pool.md's Key column), a power
  source by its pool.md **ID**. The **Name** column is only there to make the table readable; pool.md's name is the one
  shown.
- **Column units.** `(×)` columns multiply a time or an amount: below 1 is quicker or smaller, above 1 slower or
  bigger. `%` columns add that share on top (10 is 10 % more, −10 is 10 % less).
- **New rows.** A new replica or part needs its pool.md row and a row here. A brand new behaviour (a new Key) needs
  code first.

### Muzzle energy and BB weight

**Energy (J)** is the muzzle energy with the replica's factory BB weight (**BB (g)**), the way a site's chrono rates
it. With the BB weight it sets the speed the BB leaves the barrel at (E = ½·m·v²). Other BB weights shift the energy a
little (a heavier BB takes more of the push); every BB weight is free and picked on the Loadout's slider. What happens
to the BB after it leaves the barrel (drag, hop-up lift, spin) is in `src/config/ballistics.ts`.

### Power sources

What drives the replica, by type (pool.md's power source Type):

- **Battery.** Sets the rate of fire, as in a real AEG (the spring inside the replica sets its energy).
- **Gas.** Sets the energy: a stronger gas pushes harder, and kicks harder too.
- **Spring** (no spring replicas yet). Sets the energy.

### Rarity tiers

A tier's **Bonus %** (pool.md's Rarity table: 0 % at Common up to 15 % at Legendary) improves an item's stats. The
**Tier scaling** table says which stats, and how much of the Bonus each one gets: `Replica · Energy · 50` means a
Legendary replica (15 %) gets 7.5 % more energy. A stat not listed doesn't change with the tier. "Improves" always
means the better way: more energy and rate of fire, less spread, quicker reload, draw and raise, a steadier aim.

### Site limits

Like a real site's chrono, the energy a replica may leave the barrel with is capped by its **Class** (rifle or pistol).
Stacked bonuses (a rare replica on a strong gas, say) stop at the limit, and the Loadout says so.

---

## Replicas

| Key | Name | Class | Energy (J) | BB (g) | Fire rate (BBs/s) | Magazine (BBs) | Magazines | Reload (s) | Draw (s) | Spread (°) | Recoil (°) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aeg | AEG Rifle | rifle | 0.97 | 0.25 | 13 | 60 | 4 | 1.8 | 0.45 | 0.45 | 0.18 |
| pistol | Gas Pistol | pistol | 0.52 | 0.2 | 7 | 18 | 4 | 1.2 | 0.3 | 0.8 | 0.5 |
| cyber | Cyber Pistol | pistol | 0.93 | 0.25 | 13.03 | 50 | 3 | 1.294 | 0.329 | 0.353 | 0.06 |

- **Fire rate.** BBs a second with the trigger held (auto, and within a burst), or the fastest you can click (semi).
- **Magazines.** Carried per round, the loaded one included.
- **Spread.** The random scatter of the shots from the hip (degrees), before stance and movement.
- **Recoil.** The upward kick of each shot (degrees). Light: these are toys, not firearms.
- **Cyber Pistol** (M32). It only comes at Legendary (pool.md's Tiers column), so its row is set for the Legendary
  bonus to land on what you get: 1.00 J (the pistol limit), 14 BBs/s, 0.30° spread, 50 BBs × 3, 1.1 s reload, 0.28 s
  draw, 0.06° kick. Its battery is built in (no power source fits it), and nothing else fits it either.

## Power sources

| ID | Name | Energy % | Fire rate % | Recoil % |
|---|---|---|---|---|
| 000003 | Standard Battery | 0 | 0 | 0 |
| 000015 | 11.1 V LiPo Battery | 0 | 15 | 0 |
| 000004 | Green Gas | 0 | 0 | 0 |
| 000008 | Red Gas | 10 | 0 | 10 |
| 000009 | Black Gas | 20 | 0 | 20 |

## Optics

| Key | Name | Zoom (×) | Raise time (×) |
|---|---|---|---|
| redDot | Red Dot | 1.25 | 1 |
| scope2x | 2x Scope | 2 | 1.6 |

- **Zoom.** How much aiming through it narrows the view (1 is none).
- **Raise time.** The time to bring it to your eye.

## Grips

| Key | Name | Handling (×) | Shake (×) |
|---|---|---|---|
| vertical | Vertical Grip | 1.25 | 0.6 |
| angled | Angled Grip | 0.8 | 1.3 |

- **Handling.** The time to bring the replica up after a switch and to raise a fitted optic.
- **Shake.** How long the shake of a sprint or a landing stays in your aim.

## Lasers

| Key | Name | Spread (×) |
|---|---|---|
| redLaser | Red Laser | 0.8 |

## Magazines

Each replica's standard magazine is how it comes (its Magazine and Magazines above); these are the alternatives.

| Key | Name | Capacity (×) | Carried (+) | Reload (×) | Draw (×) | Rattles |
|---|---|---|---|---|---|---|
| hiCap | Hi-Cap Magazine | 2 | -2 | 1 | 1 | yes |
| lowCap | Low-Cap Magazine | 0.5 | 1 | 0.8 | 1 | no |
| extended | Extended Magazine | 1.5 | 0 | 1 | 1.35 | no |

- **Carried.** Magazines carried, added to the replica's own (at least one is always carried).
- **Rattles.** The loose BBs rattle as you move, so bots close by hear you even walking.

## Barrels

Only replicas tagged `barrel-mount` in pool.md take a barrel (the AEG Rifle); as it comes, a replica has its standard
barrel.

| Key | Name | Energy % | Spread (×) | Handling (×) |
|---|---|---|---|---|
| tightBore | Tight-Bore Barrel | 3 | 0.85 | 1 |
| long | Long Barrel | 8 | 1 | 1.15 |

- **Handling.** The time to bring the replica up after a switch and to raise a fitted optic (a long barrel is
  front-heavy).

## Muzzle parts

Screwed onto a replica tagged `muzzle-thread` in pool.md (the Gas Pistol and the AEG Rifle).

| Key | Name | Energy % | Handling (×) | Heard from (×) |
|---|---|---|---|---|
| silencer | Silencer | -5 | 1.1 | 0.5 |

- **Heard from.** How far away its shots are heard, by bots, on the minimap and in the sound cues (0.5 is half as
  far). A silencer's shots also sound muffled.

## Lights

A weapon torch (M33h) on any replica it fits (pool.md's Lights table), switched with the Weapon torch key. No rarity
tier improves it: a brighter torch is a new row.

| Key | Name | Reach (m) | Beam (°) | Spill (°) |
|---|---|---|---|---|
| weaponTorch | Weapon Torch | 40 | 14 | 28 |

- **Reach.** How far its beam lights someone well enough to be made out at night, by you and by bots (no further than
  a light pool lets them be seen).
- **Beam.** The bright hotspot's full angle.
- **Spill.** The dimmer cone round it, full angle. Anyone inside it within its reach is lit.

## Tier scaling

- **Categories:** Replica, Battery, Gas, Spring, Optic, Grip, Laser, Magazine, Barrel, Muzzle.
- **Stats:** Energy, Fire rate, Spread, Reload, Draw, Raise, Shake.

Which category takes which stat is in the table. A pairing the code has no use for is flagged, and the test fails.

| Category | Stat | Share % |
|---|---|---|
| Replica | Spread | 100 |
| Replica | Reload | 100 |
| Replica | Draw | 100 |
| Replica | Energy | 50 |
| Replica | Fire rate | 50 |
| Battery | Fire rate | 50 |
| Gas | Energy | 50 |
| Spring | Energy | 50 |
| Optic | Raise | 100 |
| Grip | Raise | 50 |
| Grip | Draw | 50 |
| Grip | Shake | 50 |
| Laser | Spread | 50 |
| Magazine | Reload | 100 |
| Barrel | Spread | 50 |
| Barrel | Draw | 50 |
| Barrel | Raise | 50 |
| Muzzle | Draw | 50 |
| Muzzle | Raise | 50 |

## Site limits

| Class | Limit (J) |
|---|---|
| rifle | 1.2 |
| pistol | 1.0 |
