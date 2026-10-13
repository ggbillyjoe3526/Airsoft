# Ideas (not approved)

The parking lot for future features the owner hasn't placed in a version yet. Don't implement any of them unless asked.

New ideas go here until the owner places them. The feature triage (owner, 2026-10-05) emptied the list: every idea
parked here was placed in a version on the roadmap (`docs/ROADMAP.md`, Beta and "After 0.1") or declined below.

## Levelling up in place of the Armory's Shots

The owner is thinking about replacing the Armory's gacha, Field Credits and Tokens spent on Shots, with plain levelling
up (owner, 2026-10-13). It is undecided: he decides after he has played the Armory properly. If he picks it, it goes
in 0.1 Dev 6 or a 0.1 Dev 7 added for it (`docs/ROADMAP.md` › 0.1 Dev 6). Nothing is built before he decides.

### The idea

- **Matches give XP.** Playing a match earns XP instead of Field Credits, and XP fills your level.
- **Levels unlock things.** Each level, or every few levels, gives a reward: a replica, an attachment, a skin and so
  on. His example: the Cyber Pistol at level 10.
- **Everyone starts with the same kit.** The GBB Pistol and the AEG Rifle, with today's Standard Battery and Green Gas.
- **The level cap starts at 10.** It goes up over time as new content comes in.

### Open questions

For the owner when he decides. Claude's suggestions are marked as such; none is a decision.

1. **Replace or sit beside?** Does levelling replace the whole Armory (Field Credits, Tokens, Shots, Pity and
   scrapping), or does some of it stay, such as Shots for skins later?
2. **Rarity tiers.** Today every item comes in six tiers, Common to Legendary, and a higher tier handles up to 15 %
   better (`pool.md` › Rarity). With levels, are the tiers dropped (one of each item), or are higher tiers rewards
   too ("a Rare AEG Rifle at level 7")? Claude's suggestion: one of each item, so a level never makes your replica
   better than the next player's.
3. **What you already have.** What happens to the items in your collection, the Field Credits and Tokens you have
   left and your Pity count? Claude's suggestion: keep every item you own, turn what you have left into XP at a fixed
   rate so nobody loses progress, and start you at the level that XP reaches. Save fields are permanent
   (`docs/DECISIONS.md` › Save and settings storage), so XP and your level are added beside the old ones.
4. **Where XP comes from, and how much.** The simplest start is today's Field Credits table read as XP: 40 for a
   match, 60 for a win, 10 a round won and 5 a hit, times the difficulty (Easy 0.5 to Pro 2), and nothing from the
   range, the tutorial, dev content or a cheat (`pool.md` › Field Credits). A first-to-5 win on Normal pays 150 plus
   the hits. Still open: how many matches a level takes, whether later levels take longer, and what Extraction's cases
   and the Progression Update's challenges pay instead of Field Credits.
5. **What each level gives.** Beyond the starting kit, 15 items can be won today: the Cyber Pistol, the LiPo battery,
   Red and Black Gas and eleven attachments. Levels 2 to 10 are nine rewards, so some levels give two items, or some
   items come in the starting kit. Skins are planned for the Progression Update, so until then the rewards are
   replicas and attachments, unless skins come forward.
6. **Raising the cap.** Each themed update could raise the cap with its own content, such as the Replica Update's
   sniper and optics. What does XP do at the cap until it rises? Claude's suggestion: it keeps counting, so a raised
   cap gives you the levels you have already earned.
7. **What else changes.** The Armory screen becomes a levels and rewards screen; the top bar shows your level and XP
   in place of Field Credits and Tokens; the Dev settings give XP and levels on demand in place of Field Credits and
   Tokens (M90); Disable Armory and Unlock all gear need new meanings. 0.1 Dev 6's "Bots' gear keeps up with yours"
   (item 23) is built around tiers, so it follows question 2. The Cyber Pistol stops being a 1-in-400 chase item.
8. **Rulings it would replace.** "Progression is earned by unlocking replicas and gear, never by levels" (owner,
   2026-10-01), the feature triage's "the Armory is the progression" (owner, 2026-10-05) and the Shots and Pity rulings
   (owner, 2026-10-04), all in `docs/DECISIONS.md`. Levels that only unlock things, and never make you stronger, keep
   the spirit of the first.
9. **Where it lands.** 0.1 Dev 6, a 0.1 Dev 7, or the 0.5 Progression Update ("things to earn")? Claude's suggestion:
   before 0.1.0, in Dev 6 or Dev 7. It changes how everything is earned, and making that change after Early Access
   opens would rework public players' saves under them. The Progression Update then fills the levels: challenges that
   pay XP, badges, and skins as rewards.

## Maybe

New ideas the owner wants to think about (owner, 2026-10-06). Roadmap items he marked maybe stay in their place in
`docs/ROADMAP.md`.

- **Clutch moments.** A "last one standing" banner and a clutch count in your records.
- **Match wagers.** Stake some Field Credits on winning before a match for a bigger payout.
- **A downside for the 11.1 V LiPo Battery.** It fires 15 % faster with no number made worse; a cost (more kick, a
  shorter battery life, or slower trigger response) would make it a real trade-off (owner, 2026-10-11: leave it for
  now).

## No for now

From the owner's Dev 6 and Dev 7 picks (owner, 2026-10-06). He may change his mind later, so these can come back when
he raises them; don't propose them again before that:

- Bang-bang surrender or a rubber-knife tag.
- The dead rag, a light on hit players at night and a shouted "HIT!" (the hit system is good enough as it is).
- Throwing a decoy to lure bots.
- A key to glance at your magazine (the option to hide the ammo counter is a yes).
- Hand-made scenarios rated with stars.
- A "good game" line-up after the match.
- Slide into cover: a short sprint slide that ends crouched behind cover (owner, 2026-10-12; vaulting went to
  0.1 Dev 6 instead).
- Ray traced or path traced light (built as RT1 and scrapped by the owner, 2026-10-11: too much work for what it adds;
  the code is archived in the project's shared files, `archive/ray-tracing/`).

## Declined in the feature triage

Cut for adding more complexity than player value (owner, 2026-10-05; reasons in `docs/DECISIONS.md`). Don't propose
these again unless the owner brings them up:

- Bomb (Attack / Defend with another prop).
- Intel grab (Extraction already is "grab it and get out").
- Free-for-all.
- The overshooting rule (bots never overshoot).
- Tracer BBs as their own option (glowing BBs do it).
- Supply weekends and dated events.
- VIP escort.
- Hostage rescue.
- A referee NPC (the whistles cover it).
- Tuning the hop-up during a match (the Customise dial covers it).
- A who-hit-you replay (the "what got you" card covers it).
- A separate speedsoft mode and surrender rule (the field rule presets and the bang-bang rule cover them).

## Declined from the third research list

Offered in the third research list (`future-features-2026-10-04.md` in the project files) and turned down (owner,
2026-10-04). Don't propose these again unless the owner brings them up:

- Infection.
- A game day playlist.
- A shoot house time trial.
- King of the Hill as a Domination option.
- Hi-cap winding.
- A riot shield.
- 40 mm shower shells and claymores.
- A goggle view.
- Site dressing at the dead zone.
- A Tour mode.
- Photo mode.
- Match replays.
- Site sounds on the menus.
- Controller support.

Also offered on 2026-10-03 and not picked: captions for hit calls and whistles, a map editor / mod support, a "gun hits
count" house rule.
