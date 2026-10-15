import type { Bot } from './ai/bot';
import type { BotController } from './ai/botController';
import { asking } from './ai/magShare';
import { MAG_SHARE, MAG_WHEEL_LABELS } from './config/magShare';
import type { Character } from './sim/character';
import type { PlayerCommand } from './sim/commands';
import { isInPlay } from './sim/elimination';
import type { GameEvent } from './sim/events';
import { canTossTo, chooseSpare, createSparePick, lowOnMags, type MagShareWorld, pouchRoom } from './sim/magShare';
import { type MagFills, magLine, type MagView, type MagWords } from './ui/magPrompt';

const pick = createSparePick();

/**
 * Dev settings › Bots run low on BBs (MG1): in round `round`, one bot of each team in turn is put on its last magazine,
 * its pouch for the replica in hand emptied, so the hand-off can be watched (MatchSession, MAG_SHARE.devLowAfter in).
 */
export function putOnLastMag(bots: readonly Bot[], round: number): void {
  for (let team = 0; team < 2; team++) {
    const mine = bots.filter((b) => b.character.team === team);
    const b = mine[round % Math.max(1, mine.length)];
    if (!b) continue;
    const a = b.character.armament;
    a.ammo[a.active]?.pouch.fill(0);
  }
}

/**
 * Your side of the magazine hand-off (MG1, the owner's Dev 6 item 43), for MatchSession: the Mag key and the order
 * wheel's Mag item, the toss it names in your command, and the line the HUD shows. The rules are the simulation's
 * (sim/magShare.ts) and who brings one the bots' (ai/magShare.ts); this only decides what a press means now:
 *
 * 1. A teammate asking you is in reach (canTossTo): the nearest gets a magazine on the next tick.
 * 2. Else, low on BBs: you ask (BotController.askForMag), no sooner than MAG_SHARE.playerAskGap after your last ask ended
 *    and never while one is coming (a bot bringing it, or the magazine in the air).
 * 3. Else a notice: who asks you is too far (or no magazine of yours fits theirs), or you aren't low.
 *
 * Out of play or between rounds a press only says so.
 */
export class MagHandoff {
  /** The character a toss goes to on the next tick (-1: none). */
  private tossTo = -1;
  private notice = '';
  private noticeUntil = Number.NEGATIVE_INFINITY;
  /** Your ask has a bot bringing one; when it last ended (playerAskGap). */
  private asked = false;
  /** Magazines in the air to you now (a toss counts as coming until it lands or is lost), and who threw the last. */
  private inAir = 0;
  private airFrom = -1;
  private askEnded = Number.NEGATIVE_INFINITY;
  /** Low on BBs last tick, and until when the hint to ask shows (MAG_SHARE.askHintTime, once each time you run low). */
  private wasLow = false;
  private hintUntil = Number.NEGATIVE_INFINITY;
  readonly view: MagView = { line: '', toss: false, wheel: MAG_WHEEL_LABELS.ask, mates: [] };
  /** The last line lineOf made, and what it was made of (`words` null: none). */
  private readonly cache: { words: MagWords | null; id: number; m: number; line: string } = { words: null, id: -1, m: 0, line: '' };
  /** Settings › HUD › Ammo counter (AC1): off, a caught magazine's notice leaves out how many BBs came. */
  private counts = true;

  constructor(
    private readonly player: Character,
    private readonly bots: BotController,
    private readonly world: MagShareWorld,
    /** A character's name on the HUD (the roster's). */
    private readonly nameOf: (id: number) => string,
    /** The Mag key's name now ('' unbound: the lines name the order wheel). */
    private readonly keyName: () => string,
  ) {}

  /** The Mag key, or the order wheel's Mag item, at simulation time `time`; `live`: the round is in play. */
  press(time: number, live: boolean): void {
    const me = this.player;
    if (!live || !isInPlay(me)) return this.say('notNow', {}, time);
    const asker = this.nearestAsker();
    if (asker && canTossTo(me, asker.character, this.world, pick)) {
      this.tossTo = asker.character.id;
      return;
    }
    if (lowOnMags(me.armament)) {
      // One in the air to you is one coming: no second ask before it lands (the critic's MG1 find).
      if (this.inAir > 0) return this.say('already', { name: this.nameOf(this.airFrom) }, time);
      if (time - this.askEnded < MAG_SHARE.playerAskGap) return this.say('wait', {}, time);
      const result = this.bots.askForMag(me, time, live);
      if (result === 'asked') {
        this.asked = true;
        this.hintUntil = Number.NEGATIVE_INFINITY;
        return;
      }
      const bringer = this.bots.mags.bringing(me);
      return this.say(result, { name: bringer ? this.nameOf(bringer.character.id) : '' }, time);
    }
    if (!asker) return this.say('notLow', {}, time);
    const a = asker.character.armament;
    const need = a.replicas[a.active];
    const fits = need !== undefined && chooseSpare(me.armament, need, pouchRoom(a, a.active), pick);
    this.say(fits ? 'closer' : 'noSpare', { name: this.nameOf(asker.character.id) }, time);
  }

  /** After the player's command is filled for a tick: the toss a press named, once. */
  fill(cmd: PlayerCommand): void {
    cmd.tossMag = this.tossTo;
    this.tossTo = -1;
  }

  /** The ammo counter shown or not (Settings › HUD, AC1): the caught notice names the BBs only while it is. */
  setCounts(shown: boolean): void {
    this.counts = shown;
  }

  /** After each tick (and BotController.observe), while its events are in the state: your tosses and catches. */
  observe(events: readonly GameEvent[], time: number, live: boolean): void {
    const me = this.player.id;
    for (const e of events) {
      if (e.type === 'roundStart') this.reset();
      else if (e.type === 'magToss' && e.fromId === me) this.say('tossed', { name: this.nameOf(e.toId) }, time);
      else if (e.type === 'magCaught' && e.toId === me) this.say(this.counts ? 'caught' : 'caughtUncounted', { name: this.nameOf(e.fromId), bbs: e.bbs }, time);
      else if (e.type === 'magLost' && (e.toId === me || e.fromId === me)) this.say('lost', {}, time);
      if (e.type === 'magToss' && e.toId === me) {
        this.inAir++;
        this.airFrom = e.fromId;
      } else if ((e.type === 'magCaught' || e.type === 'magLost') && e.toId === me) this.inAir = Math.max(0, this.inAir - 1);
    }
    const bringing = this.bots.mags.bringing(this.player) !== undefined || this.inAir > 0;
    if (this.asked && !bringing) {
      this.asked = false;
      this.askEnded = time;
    }
    const low = live && isInPlay(this.player) && !bringing && lowOnMags(this.player.armament);
    if (low && !this.wasLow) this.hintUntil = time + MAG_SHARE.askHintTime;
    this.wasLow = low;
  }

  /**
   * Once a frame: what the prompt says (a notice first, then a toss you can make, a teammate asking you, one on its way
   * to you, the hint to ask), the wheel's Mag item and the name tags to mark.
   */
  frame(time: number, live: boolean): MagView {
    const v = this.view;
    const me = this.player;
    v.mates.length = 0;
    v.toss = false;
    v.wheel = MAG_WHEEL_LABELS.ask;
    const notice = time < this.noticeUntil;
    v.line = notice ? this.notice : '';
    if (!live || !isInPlay(me)) return this.shown(v);
    const asker = this.nearestAsker();
    for (const b of this.bots.bots) if (this.asksMe(b)) v.mates.push(b.character.id);
    const bringer = this.bots.mags.bringing(me);
    if (bringer) v.mates.push(bringer.character.id);
    // Its thrower keeps the tag while the magazine flies.
    else if (this.inAir > 0 && this.airFrom >= 0) v.mates.push(this.airFrom);
    if (asker && canTossTo(me, asker.character, this.world, pick)) {
      v.wheel = MAG_WHEEL_LABELS.toss;
      if (notice) return this.shown(v);
      v.toss = true;
      v.line = this.lineOf('toss', asker.character.id, 0);
    } else if (notice) return this.shown(v);
    else if (asker) {
      const p = asker.character.position;
      v.line = this.lineOf('needs', asker.character.id, Math.round(Math.hypot(p.x - me.position.x, p.z - me.position.z)));
    } else if (bringer) v.line = this.lineOf('bringing', bringer.character.id, 0);
    else if (this.inAir > 0 && this.airFrom >= 0) v.line = this.lineOf('bringing', this.airFrom, 0);
    else if (time < this.hintUntil && lowOnMags(me.armament) && this.bots.magGiverFor(me)) v.line = this.lineOf('ask', -1, 0);
    return this.shown(v);
  }

  /**
   * The line `words` about character `id` at `m` metres, made only when one of them changes (the key's name is read
   * again then, and each time the prompt comes back), so a frame allocates nothing while it stands.
   */
  private lineOf(words: MagWords, id: number, m: number): string {
    const c = this.cache;
    if (words !== c.words || id !== c.id || m !== c.m) {
      c.words = words;
      c.id = id;
      c.m = m;
      c.line = magLine(words, { key: this.keyName(), name: id >= 0 ? this.nameOf(id) : '', m });
    }
    return c.line;
  }

  /** The view as it stands; with nothing of the cache's on it, the next line is made afresh. */
  private shown(v: MagView): MagView {
    if (v.line !== this.cache.line) this.cache.words = null;
    return v;
  }

  /** A bot asking you for a magazine, with none in the air to it yet. */
  private asksMe(b: Bot): boolean {
    return asking(b) && b.magFrom === this.player && !b.magInAir && isInPlay(b.character);
  }

  /** The nearest bot teammate asking you, or undefined. */
  private nearestAsker(): Bot | undefined {
    const p = this.player.position;
    let best: Bot | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (const b of this.bots.bots) {
      if (!this.asksMe(b)) continue;
      const d = Math.hypot(b.character.position.x - p.x, b.character.position.z - p.z);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  private say(words: MagWords, fills: MagFills, time: number): void {
    this.notice = magLine(words, fills);
    this.noticeUntil = time + MAG_SHARE.noticeTime;
  }

  /** A new round: nothing pending, nothing said, nothing asked. */
  private reset(): void {
    this.tossTo = -1;
    this.noticeUntil = Number.NEGATIVE_INFINITY;
    this.asked = false;
    this.askEnded = Number.NEGATIVE_INFINITY;
    this.inAir = 0;
    this.airFrom = -1;
    this.wasLow = false;
    this.hintUntil = Number.NEGATIVE_INFINITY;
  }
}
