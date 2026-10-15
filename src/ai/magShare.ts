import { MAG_SHARE } from '../config/magShare';
import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import { canTossTo, chooseSpare, createSparePick, leavesLow, lowOnMags, pouchRoom } from '../sim/magShare';
import { type Bot, type BotWorld, wantsFlag } from './bot';
import { walkTo } from './squadOrders';

/**
 * The bots' side of the magazine hand-off (MG1, the owner's Dev 6 item 43): who asks whom, who brings one, and how.
 * The rules of the toss itself are the simulation's (sim/magShare.ts); a bot only names a teammate in its command.
 *
 * - A bot low on BBs for the replica it fights with (lowOnMags) asks the nearest teammate within MAG_SHARE.askRange
 *   with one to spare (hasMagFor: one that fits, and a full spare of its own kept): a bot, which comes over and tosses
 *   it while the asker waits where it is, or a player, whom the asker goes to and waits by. It asks again no sooner than
 *   botAskGap after an ask ends or finds nobody.
 * - A player asks through `ask` (the Mag key or the order wheel, src/magHandoff.ts): the nearest such bot teammate comes
 *   to them and tosses it.
 * - An ask lapses after askTime; it ends when the magazine lands or is lost, or when its giver can't give any more. The
 *   giver drops it when the asker is hit or no longer has room, or it is picked for the pole (Attack / Defend).
 *
 * Fights and cover come first (botBrain); bringing one comes before a squad order, waiting for one after the order and
 * the pole. The same at every difficulty. Both teams share alike; your teammates' asks and answers are put into words
 * by the callouts (ai/callouts.ts), which never change any of this.
 */

/** What a player's ask came to (MagShare.ask). */
export type MagAskResult = 'asked' | 'already' | 'notLow' | 'nobody' | 'notNow';

const pick = createSparePick();

/** Whether `giver` has a magazine to spare for `receiver`'s replica in hand, keeping a full spare of its own (keepMags). */
export function hasMagFor(giver: Character, receiver: Character): boolean {
  const a = receiver.armament;
  const need = a.replicas[a.active];
  if (!need || !chooseSpare(giver.armament, need, pouchRoom(a, a.active), pick)) return false;
  return !leavesLow(giver.armament, pick);
}

/** A bot free to bring a teammate one: in play, not already bringing one, not low and asking itself, not off to the pole. */
function freeToGive(b: Bot, w: BotWorld): boolean {
  return isInPlay(b.character) && b.magFor === undefined && b.magAskAt === Number.NEGATIVE_INFINITY && !wantsFlag(b, w);
}

/** `b`'s own ask is open. */
export function asking(b: Bot): boolean {
  return b.magAskAt > Number.NEGATIVE_INFINITY;
}

/**
 * The magazine hand-off for one match's bots (BotController holds it): `update` before the bots think, `observe` with
 * each tick's events. It keeps no state of its own but the bots' (Bot.magFor and the rest), so a round's resetBot
 * clears it.
 */
export class MagShare {
  /** The bot of each character the bots drive. */
  private readonly byCharacter = new Map<Character, Bot>();

  constructor(private readonly bots: readonly Bot[]) {
    for (const b of bots) this.byCharacter.set(b.character, b);
  }

  /** The bot driving `c`, or undefined for a player. */
  botOf(c: Character): Bot | undefined {
    return this.byCharacter.get(c);
  }

  /** The bot bringing `to` a magazine now, or undefined. */
  bringing(to: Character): Bot | undefined {
    for (const b of this.bots) if (b.magFor === to) return b;
    return undefined;
  }

  /**
   * `asker` (a player) asks for a magazine for the replica in hand: the nearest bot teammate free to bring one with one
   * to spare takes it on ('asked'; `bringing` names it). Refused while out of play or between rounds, while one is
   * already on its way, before the pouch is low, or with nobody to give one.
   */
  ask(asker: Character, w: BotWorld): MagAskResult {
    if (!isInPlay(asker) || !w.live) return 'notNow';
    if (this.bringing(asker)) return 'already';
    if (!lowOnMags(asker.armament)) return 'notLow';
    const giver = this.nearestGiver(asker, w, false);
    const gb = giver && this.botOf(giver);
    if (!gb) return 'nobody';
    this.take(gb, asker, w.time);
    return 'asked';
  }

  /** The bot teammate an ask from `asker` (a player) would go to now, or undefined: what `ask` would pick. */
  giverFor(asker: Character, w: BotWorld): Character | undefined {
    return isInPlay(asker) && w.live && !this.bringing(asker) ? this.nearestGiver(asker, w, false) : undefined;
  }

  /**
   * Before the bots think: jobs and asks that ended are let go, and each bot low on BBs that may ask again asks the
   * nearest teammate with one to spare.
   */
  update(w: BotWorld): void {
    for (const b of this.bots) {
      const to = b.magFor;
      if (to && !this.stillGiving(b, to, w)) this.dropJob(b, w);
    }
    for (const b of this.bots) {
      if (asking(b)) {
        if (!this.stillAsking(b, w)) this.endAsk(b, w.time);
        continue;
      }
      const me = b.character;
      if (!w.live || !isInPlay(me) || w.time < b.magAskGap || b.magFor || !lowOnMags(me.armament)) continue;
      const giver = this.nearestGiver(me, w, true);
      if (!giver) {
        b.magAskGap = w.time + MAG_SHARE.botAskGap;
        continue;
      }
      b.magAskAt = w.time;
      b.magFrom = giver;
      const gb = this.botOf(giver);
      b.magFromPlayer = gb === undefined;
      b.magInAir = false;
      if (gb) this.take(gb, me, w.time);
    }
  }

  /** After a tick, its events: a toss ends its thrower's job, and a magazine landed or lost ends its catcher's ask. */
  observe(events: readonly GameEvent[], characters: readonly Character[], time: number): void {
    for (const e of events) {
      if (e.type !== 'magToss' && e.type !== 'magCaught' && e.type !== 'magLost') continue;
      const to = characters[e.toId];
      const catcher = to?.id === e.toId ? this.botOf(to) : undefined;
      if (e.type === 'magToss') {
        const from = characters[e.fromId];
        const thrower = from?.id === e.fromId ? this.botOf(from) : undefined;
        if (thrower && thrower.magFor === to) thrower.magFor = undefined;
        if (catcher && asking(catcher)) catcher.magInAir = true;
      } else if (catcher && asking(catcher)) {
        this.endAsk(catcher, time);
      }
    }
  }

  /** The nearest teammate of `asker` within askRange with one to spare: bots free to give, and players too if `players`. */
  private nearestGiver(asker: Character, w: BotWorld, players: boolean): Character | undefined {
    let best: Character | undefined;
    let bestD: number = MAG_SHARE.askRange;
    for (const c of w.characters) {
      if (c === asker || c.team !== asker.team || !isInPlay(c)) continue;
      const b = this.botOf(c);
      if (b ? !freeToGive(b, w) : !players) continue;
      const d = Math.hypot(c.position.x - asker.position.x, c.position.z - asker.position.z);
      if (d > bestD || !hasMagFor(c, asker)) continue;
      best = c;
      bestD = d;
    }
    return best;
  }

  private take(giver: Bot, to: Character, time: number): void {
    giver.magFor = to;
    giver.magForAt = time;
    giver.magRush = false;
    giver.routeState = 'none';
    giver.route.length = 0;
  }

  /** Whether `b` still brings `to` one: both in play, not lapsed, still able to, not off to the pole, and still wanted. */
  private stillGiving(b: Bot, to: Character, w: BotWorld): boolean {
    if (!w.live || !isInPlay(b.character) || !isInPlay(to) || w.time - b.magForAt > MAG_SHARE.askTime || wantsFlag(b, w)) return false;
    if (!hasMagFor(b.character, to)) return false;
    // A bot that asked waits for this one; a player's ask stands until it lapses.
    const asker = this.botOf(to);
    return !asker || (asking(asker) && asker.magFrom === b.character);
  }

  /** `b` stops bringing one: the bot that asked it may ask someone else after its gap. */
  private dropJob(b: Bot, w: BotWorld): void {
    const to = b.magFor;
    b.magFor = undefined;
    b.magRush = false;
    const asker = to ? this.botOf(to) : undefined;
    if (asker && asking(asker) && asker.magFrom === b.character && !asker.magInAir) this.endAsk(asker, w.time);
  }

  /** Whether `b`'s ask still stands: in play, not lapsed, its giver in play and (a bot) still bringing it, or one in the air. */
  private stillAsking(b: Bot, w: BotWorld): boolean {
    if (b.magInAir) return w.live && isInPlay(b.character);
    const from = b.magFrom;
    if (!w.live || !isInPlay(b.character) || !from || !isInPlay(from) || w.time - b.magAskAt > MAG_SHARE.askTime) return false;
    const giver = this.botOf(from);
    return giver ? giver.magFor === b.character : hasMagFor(from, b.character);
  }

  private endAsk(b: Bot, time: number): void {
    b.magAskAt = Number.NEGATIVE_INFINITY;
    b.magFrom = undefined;
    b.magFromPlayer = false;
    b.magInAir = false;
    b.magAskGap = time + MAG_SHARE.botAskGap;
  }
}

/**
 * A bot's 'mag' mode for this tick (moveBot): bringing one, it tosses once canTossTo allows (it stops there), else
 * walks over, sprinting while further than hurryDistance; asking a player, it walks over to them and waits within
 * walkUpTo; asking a bot, it waits where it is. Returns whether it walks a route.
 */
export function moveMag(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): boolean {
  b.magRush = false;
  const to = b.magFor;
  if (to) {
    if (canTossTo(b.character, to, w, pick)) {
      cmd.tossMag = to.id;
      b.routeState = 'none';
      return false;
    }
    const p = b.character.position;
    b.magRush = Math.hypot(to.position.x - p.x, to.position.z - p.z) > MAG_SHARE.hurryDistance;
    return walkTo(b, w, to.position, MAG_SHARE.walkUpTo, dt, false);
  }
  const from = b.magFrom;
  if (!from || !b.magFromPlayer || b.magInAir) return false;
  return walkTo(b, w, from.position, MAG_SHARE.walkUpTo, dt, false);
}
