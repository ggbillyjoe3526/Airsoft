# Callouts: what the bots say

What the bots call to their team in a match: which events they call, how often, and the words. Read it to change a
line, add one, or make the bots talk more or less.

**The game reads this file**, as it reads [bots.md](bots.md): it is bundled into the build and parsed when the game
starts (`src/config/calloutsFile.ts`, `src/config/calloutLines.ts`). Change a line or a number, run the game, and it
changes. After editing, run `npm run test`: `src/config/calloutsFile.test.ts` reads this file and fails with the line
number of anything it can't understand. A row the game can't read is left out, with a warning in the browser console,
so a typo never stops the game from starting.

Callouts are words, never a voice: your teammates' lines show in the callout feed at the bottom left with a radio
click from where they stand, and an enemy calling close by gives a muffled click from where they stand. What a bot
says never changes how it plays: the calls are what it already does, put into words.

---

## How to read and edit this file

- **Events are fixed.** What each one means is coded (the list below); a new kind of event needs code first.
- **When they call.** Chance is how likely a bot is to say something when its event happens, from 0 to 1. Team gap
  is how long (s) the team waits before calling that event again. **Rows higher up win** when two calls come at once,
  so the urgent ones go first.
- **Pace** keeps the feed calm, whatever the chances say: one bot never talks twice within its gap, the team never
  within its gap, and the same enemy is not called twice within its gap. A call the team gap holds back waits at most
  the last row's seconds, then is dropped.
- **Personalities.** Talks (×) multiplies every chance: 1 changes nothing, above 1 is chattier. It never makes the
  answers to your ping, or the asks and answers for a magazine, less likely. Every personality in [bots.md](bots.md) needs a row.
- **Marks.** A teammate calling Contact or Contacts that still sees the enemy may also mark them for you, a ping over
  where they are: the chance is how likely, and the team marks at most once in its seconds. Marks only show; they
  never change how anyone plays.
- **Lines** are what a bot says: one picked at random from the event's rows for its personality and the rows for
  Any. Words in braces are filled in: `{area}` is the named area ("Dock"), `{count}` how many ("Two") and `{left}` how
  many of the other team are left. A line with `{area}` is skipped when there is no area to name. Keep lines short (48
  characters at most, with the longest area name in), friendly and airsoft, with no swearing.
- **Named areas** are each map's own (`areas` in its map file, `src/map/`). The minimap shows the one you stand in.

### The events

- **Contact.** It sees one enemy nobody on its team has called lately. Fills `{area}` (where the enemy is).
- **Contacts.** It sees two or more at once. Fills `{count}` and `{area}`.
- **Heard.** It hears an enemy it can't see while nobody on its team sees one. Fills `{area}` (its guess).
- **Down.** Its team hits someone and more are left: the bot that hit, or the teammate nearest to whoever did. Fills
  `{left}`. Not in Extraction, where the home team comes back.
- **Last one.** As Down, with one left. Fills `{area}` when the team has seen them in the last few seconds.
- **Tagged.** Down in Extraction. Fills nothing.
- **Reloading.** It starts a reload with an enemy seen or heard in the last few seconds.
- **Pushing.** A bot that pushes in (bots.md › Habits) goes after where someone was. Fills `{area}`.
- **Flanking.** It goes round the side of where someone was. Fills `{area}`.
- **Checking.** Any other bot goes to look where someone was. Fills `{area}`.
- **Holding.** It settles at the spot it holds (a defender's post, an anchor's last lane point), once a round. Fills
  `{area}` (where it holds).
- **Raising.** Attack / Defend: its team starts raising the flag; the attacker nearest the pole says it.
- **Flag.** Attack / Defend: the other team is raising the flag; the defender nearest the pole says it.
- **Overtime.** Elimination: the clock ran out level and the overtime flag went up; on each team, the bot nearest it
  says it. Fills `{area}` (where the flag stands).
- **Going to your ping.** You ping a spot or an enemy (the Ping key) and a teammate sets off to look: the one nearest
  it says so. Fills `{area}` (the spot's). Its Checking, Pushing or Flanking is not called as well.
- **Watching your ping.** As above, when none of them goes (under your order, at its post, holding): the nearest that
  took it says it watches. Fills `{area}`. One answer per ping, so a line with no `{area}` is worth keeping.
- **Need a mag.** It runs low on BBs (less than a full spare left) and asks the nearest teammate with one to spare:
  you, when you are nearest, or a bot. Said as soon as its own gap lets it, while it still asks. Fills nothing.
- **Mag coming.** It sets off to bring a teammate a magazine: one who asked it, or you, when you asked (the Mag key or
  the order wheel's Need a Mag). Said as soon as its own gap lets it, while it still brings it. Fills nothing.
- **Thanks for the mag.** It catches a magazine a teammate tossed it. Fills nothing.

Hit players never talk: they raise a hand, call their hit and walk off, as on a real field ("dead men don't talk").

## When they call

| Event | Chance | Team gap (s) |
|---|---|---|
| Last one | 1 | 0 |
| Down | 0.9 | 0 |
| Tagged | 0.6 | 3 |
| Going to your ping | 1 | 0 |
| Watching your ping | 1 | 0 |
| Need a mag | 1 | 3 |
| Mag coming | 1 | 0 |
| Overtime | 1 | 0 |
| Flag | 1 | 10 |
| Raising | 1 | 10 |
| Contacts | 0.9 | 3 |
| Contact | 0.85 | 3 |
| Reloading | 0.5 | 6 |
| Thanks for the mag | 0.7 | 5 |
| Heard | 0.5 | 8 |
| Pushing | 0.6 | 8 |
| Flanking | 0.7 | 10 |
| Checking | 0.35 | 10 |
| Holding | 0.5 | 10 |

## Pace

| Rule | Seconds |
|---|---|
| One bot's calls apart | 4 |
| The team's calls apart | 1.5 |
| The same enemy again after | 10 |
| A call waits at most | 1.5 |

## Marks

| Rule | Value |
|---|---|
| A sighting is marked (chance) | 0.35 |
| The team's marks apart (s) | 12 |

## Personalities

| Personality | Talks (×) |
|---|---|
| Rusher | 1.2 |
| Anchor | 0.8 |
| Flanker | 0.7 |
| Careful | 1.1 |

## Lines

| Event | Who | Line |
|---|---|---|
| Contact | Any | Contact, {area}! |
| Contact | Any | One, {area}! |
| Contact | Any | Eyes on one, {area}. |
| Contact | Rusher | One, {area}! Let's get them! |
| Contact | Anchor | Got one, {area}. I'm on it. |
| Contact | Flanker | Spotted one, {area}. |
| Contact | Careful | Contact {area}. Heads down. |
| Contacts | Any | {count}, {area}! |
| Contacts | Any | Contact, {count}, {area}! |
| Contacts | Rusher | {count}, {area}! Let's go! |
| Contacts | Careful | {count}, {area}. Slow down. |
| Heard | Any | Movement, {area}. |
| Heard | Any | Heard someone, {area}. |
| Heard | Careful | Listen. Movement, {area}. |
| Heard | Flanker | Noise, {area}. |
| Down | Any | Got one! {left} left. |
| Down | Any | One down, {left} left. |
| Down | Any | {left} left! |
| Down | Rusher | Tagged! {left} to go! |
| Down | Anchor | {left} left. Hold steady. |
| Last one | Any | Last one! |
| Last one | Any | One left! |
| Last one | Any | Last one, {area}! |
| Last one | Rusher | One left, let's finish it! |
| Last one | Careful | Last one. Don't rush it. |
| Tagged | Any | Got one! |
| Tagged | Any | Tagged one! |
| Tagged | Any | One down! |
| Going to your ping | Any | On it, {area}. |
| Going to your ping | Any | Going to check {area}. |
| Going to your ping | Any | Copy, on my way. |
| Going to your ping | Rusher | On my way to {area}! |
| Going to your ping | Flanker | Going round to {area}. |
| Going to your ping | Careful | Checking {area}, slowly. |
| Watching your ping | Any | Eyes on {area}. |
| Watching your ping | Any | Watching {area}. |
| Watching your ping | Any | Copy, watching it. |
| Watching your ping | Anchor | Got {area} covered. |
| Reloading | Any | Reloading! |
| Reloading | Any | Changing mags! |
| Reloading | Any | Mag change, cover me! |
| Reloading | Rusher | Reloading, keep pushing! |
| Pushing | Any | Pushing {area}! |
| Pushing | Any | Going in, {area}! |
| Pushing | Rusher | Pushing {area}, follow me! |
| Flanking | Any | Going round to {area}. |
| Flanking | Any | Flanking {area}. |
| Flanking | Flanker | Taking the long way to {area}. |
| Checking | Any | Checking {area}. |
| Checking | Any | Looking at {area}. |
| Checking | Careful | Clearing {area}, slowly. |
| Holding | Any | Holding {area}. |
| Holding | Any | Watching {area}. |
| Holding | Anchor | Holding {area}. Nothing gets past. |
| Raising | Any | On the flag, cover me! |
| Raising | Any | Raising the flag! |
| Flag | Any | They're on the flag! |
| Flag | Any | Flag's going up! |
| Overtime | Any | Overtime! Flag's up, {area}! |
| Overtime | Any | Flag's up! First hand on it wins! |
| Overtime | Rusher | Flag's up! I'm going for it! |
| Overtime | Anchor | Flag's up. I'll cover it first. |
| Overtime | Flanker | Flag's up. Going round for it. |
| Overtime | Careful | Overtime. Watch the flag, then go. |
| Need a mag | Any | Need a mag! |
| Need a mag | Any | Low on BBs, anyone got a mag? |
| Need a mag | Any | Mag, anyone? I'm nearly dry. |
| Need a mag | Rusher | Throw me a mag, I'm going back in! |
| Need a mag | Anchor | Running dry here. Need a mag. |
| Need a mag | Flanker | Need a mag before I go round. |
| Need a mag | Careful | Low on BBs. A mag when you can? |
| Mag coming | Any | Mag coming! |
| Mag coming | Any | Got a spare, coming to you. |
| Mag coming | Any | Hang on, bringing you a mag. |
| Mag coming | Rusher | On my way with a mag! |
| Mag coming | Anchor | Got one spare. Coming over. |
| Mag coming | Flanker | Mag coming, keep your head down. |
| Mag coming | Careful | Mag on the way. Stay put. |
| Thanks for the mag | Any | Thanks for the mag! |
| Thanks for the mag | Any | Cheers, got it. |
| Thanks for the mag | Any | Got it, thanks! |
| Thanks for the mag | Rusher | Cheers! Back to it! |
| Thanks for the mag | Anchor | Got it. Back on my lane. |
| Thanks for the mag | Flanker | Nice throw, thanks. |
| Thanks for the mag | Careful | Got it. Thanks. |
