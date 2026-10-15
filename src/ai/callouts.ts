import { CALLOUTS } from '../config/callouts';
import { CALLOUT_EVENTS, type CalloutEvent, type CalloutsFile, fillLine } from '../config/calloutsFile';
import { areaAt } from '../map/areas';
import type { MapArea } from '../map/mapTypes';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import { createRng, type RngState, rngNext } from '../sim/rng';
import type { GameState } from '../sim/state';
import type { Vec3 } from '../sim/vec';
import { type Bot, type BotMode, lastSeenAt, onPingSpot } from './bot';
import { pushesIn } from './personality';

/**
 * The bots' callouts (CL1): after each tick, what the bots just did put into words for their team, as callouts.md says
 * ("Contact, Dock!", "Two left"). It reads the bots and the state and never writes either, with a seeded generator of
 * its own, so callouts never change how anyone plays (the bots' own team talk is their teamPlay hearing, M38).
 *
 * Each tick, every event a bot calls is offered for its team: kept only outside its team gap, its speaker's gap and, for
 * a sighting, the same-enemy gap, then rolled against its chance (× the personality's Talks). The team says one call at
 * a time, at least Pace's team gap apart, the most urgent first (higher in When they call): the others wait in a short
 * queue (CALLOUTS.queue, the least urgent dropped when it is full), each dropped after Pace's wait, or when a gap it
 * waited through now stops it. Hit players never talk.
 */

/** One call said this tick: who, on which team, and the line as it reads. */
export interface Callout {
  speakerId: number;
  team: number;
  event: CalloutEvent;
  text: string;
  /** A sighting that marks the enemy it calls for the team's players (PG1, callouts.md › Marks): their id, or -1. */
  markId: number;
}

/** A call waiting for its team's gap: the event, the bot (index into the bots) and what its line fills in. */
interface Pending {
  event: CalloutEvent;
  priority: number;
  bot: number;
  area: string;
  count: number;
  left: number;
  /** The enemy a sighting is of (character index), or -1. */
  enemy: number;
  /** Simulation time it is dropped at; -Infinity: the slot is empty. */
  until: number;
}

/**
 * Per team: when it last said anything and each event, the enemies it called, the last noise it called, its queue, the
 * last ping it answered (PG1: the time the bots took it) and when it last marked a sighting.
 */
interface TeamTalk {
  saidAt: number;
  eventAt: Float64Array;
  enemyAt: Float64Array;
  heardArea: string;
  heardAt: number;
  queue: Pending[];
  pingAnswered: number;
  markedAt: number;
}

const EVENT_INDEX: ReadonlyMap<CalloutEvent, number> = new Map(CALLOUT_EVENTS.map((e, i) => [e.id, i]));
/**
 * The events any teammate may say (the nearest to where it happened), not only the bot it happened to: its own gap
 * doesn't hold one back. The answers to a ping (PG1) are picked a speaker the same way.
 */
const TEAM_EVENTS: ReadonlySet<CalloutEvent> = new Set(['down', 'lastOne', 'tagged', 'raising', 'flag', 'overtime', 'pingGoing', 'pingWatching']);
/**
 * The answers to a player's ping (PG1), and the asks and answers for a magazine (MG1): a personality's Talks (×) never
 * makes them less likely.
 */
const ANSWERS: ReadonlySet<CalloutEvent> = new Set(['pingGoing', 'pingWatching', 'needMag', 'magComing']);
/** The events that say how many are left: a newer one makes any still waiting out of date. */
const COUNTS: ReadonlySet<CalloutEvent> = new Set(['down', 'lastOne', 'tagged']);
/** Salts the match seed so the callouts' generator never runs in step with another. */
const SEED_SALT = 0x5ca11;
/** The marks' own (PG1), so marking a sighting or not never changes which lines are said. */
const MARK_SALT = 0x3a7c5;

/** The character with this id (ids are indices, as MatchSession checks; the loop keeps a mismatch harmless). */
function characterOf(chars: readonly Character[], id: number): Character | undefined {
  if (chars[id]?.id === id) return chars[id];
  for (const c of chars) if (c.id === id) return c;
  return undefined;
}

/** The index of the bot playing character `id` among the bots, or -1. */
function botOf(bots: readonly Bot[], id: number): number {
  for (let i = 0; i < bots.length; i++) if (bots[i]!.character.id === id) return i;
  return -1;
}

export class CalloutDirector {
  /** What was said this tick (`saidCount` of them; at most one a team), reused tick to tick. */
  readonly said: Callout[] = [0, 1].map((team) => ({ speakerId: -1, team, event: 'contact' as CalloutEvent, text: '', markId: -1 }));
  saidCount = 0;

  private readonly rng: RngState;
  private readonly markRng: RngState;
  private readonly teams: TeamTalk[];
  /** Per bot (index into the bots): when it last spoke, its mode and post last tick, and whether it called its hold. */
  private saidAt = new Float64Array(0);
  private lastMode: BotMode[] = [];
  private wasAtPost: boolean[] = [];
  private heldCalled: boolean[] = [];
  /** Per bot: the start of the last ask for a magazine, and of the last one it set off to bring, it called (MG1). */
  private askedAt = new Float64Array(0);
  private bringAt = new Float64Array(0);
  /** Per bot and character (bot × characters + character): the start of the last sighting looked at. */
  private firstSeen = new Float64Array(0);
  private characters = 0;
  private now = 0;

  /**
   * `countsLeft`: a hit is called with how many are left (not in Extraction, where the home team comes back). `areas`:
   * the map's named areas (MapData.areas).
   */
  constructor(
    private readonly file: CalloutsFile,
    seed: number,
    private readonly areas: readonly MapArea[],
    private readonly countsLeft: boolean,
  ) {
    this.rng = createRng((seed ^ SEED_SALT) >>> 0);
    this.markRng = createRng((seed ^ MARK_SALT) >>> 0);
    this.teams = [0, 1].map(() => ({
      saidAt: Number.NEGATIVE_INFINITY,
      eventAt: new Float64Array(CALLOUT_EVENTS.length).fill(Number.NEGATIVE_INFINITY),
      enemyAt: new Float64Array(0),
      heardArea: '',
      heardAt: Number.NEGATIVE_INFINITY,
      queue: Array.from({ length: CALLOUTS.queue }, (): Pending => ({ event: 'contact', priority: 0, bot: -1, area: '', count: 0, left: 0, enemy: -1, until: Number.NEGATIVE_INFINITY })),
      pingAnswered: Number.NEGATIVE_INFINITY,
      markedAt: Number.NEGATIVE_INFINITY,
    }));
  }

  /** After a simulation tick (and BotController.observe), while its events are still in the state. */
  observe(state: GameState, bots: readonly Bot[]): void {
    this.saidCount = 0;
    this.now = state.time;
    if (this.saidAt.length !== bots.length || this.characters !== state.characters.length) this.size(state, bots);
    const live = state.round.phase === 'live';
    for (const e of state.events) {
      if (e.type === 'roundStart') this.reset();
      else if (live) this.onEvent(e, state, bots);
    }
    if (live) {
      for (let t = 0; t < this.teams.length; t++) this.answerPing(t, bots);
      for (let i = 0; i < bots.length; i++) this.watch(i, state, bots);
    }
    for (let t = 0; t < this.teams.length; t++) this.flush(t, state, bots, live);
    for (let i = 0; i < bots.length; i++) {
      this.lastMode[i] = bots[i]!.mode;
      this.wasAtPost[i] = bots[i]!.atPost;
    }
  }

  /** The name of the area at `p` ('' outside every one, or on a map without names). */
  areaOf(p: Readonly<Vec3>): string {
    return areaAt(this.areas, p.x, p.y, p.z);
  }

  /** Sizes the memory for these bots and characters (once; again only if either changes). */
  private size(state: GameState, bots: readonly Bot[]): void {
    const n = state.characters.length;
    this.characters = n;
    this.saidAt = new Float64Array(bots.length).fill(Number.NEGATIVE_INFINITY);
    this.firstSeen = new Float64Array(bots.length * n).fill(Number.NaN);
    this.lastMode = bots.map((b) => b.mode);
    this.wasAtPost = bots.map((b) => b.atPost);
    this.heldCalled = bots.map(() => false);
    this.askedAt = new Float64Array(bots.length).fill(Number.NEGATIVE_INFINITY);
    this.bringAt = new Float64Array(bots.length).fill(Number.NEGATIVE_INFINITY);
    for (const t of this.teams) t.enemyAt = new Float64Array(n).fill(Number.NEGATIVE_INFINITY);
  }

  /** A new round: nothing waits, nothing was called. */
  private reset(): void {
    for (const t of this.teams) {
      t.saidAt = Number.NEGATIVE_INFINITY;
      t.eventAt.fill(Number.NEGATIVE_INFINITY);
      t.enemyAt.fill(Number.NEGATIVE_INFINITY);
      t.heardArea = '';
      t.heardAt = Number.NEGATIVE_INFINITY;
      for (const p of t.queue) p.until = Number.NEGATIVE_INFINITY;
      t.pingAnswered = Number.NEGATIVE_INFINITY;
      t.markedAt = Number.NEGATIVE_INFINITY;
    }
    this.saidAt.fill(Number.NEGATIVE_INFINITY);
    this.heldCalled.fill(false);
    this.askedAt.fill(Number.NEGATIVE_INFINITY);
    this.bringAt.fill(Number.NEGATIVE_INFINITY);
  }

  /** What this tick's events give to call: hits, reloads, the flag going up, a magazine caught. */
  private onEvent(e: GameEvent, state: GameState, bots: readonly Bot[]): void {
    const chars = state.characters;
    if (e.type === 'characterHit') {
      const victim = characterOf(chars, e.victimId);
      const shooter = characterOf(chars, e.shooterId);
      if (!victim || !shooter || victim.team === shooter.team) return;
      // A newer hit makes a count still waiting out of date ("Two left" when one is).
      for (const p of this.teams[shooter.team]!.queue) if (COUNTS.has(p.event)) p.until = Number.NEGATIVE_INFINITY;
      let left = 0;
      let last = -1;
      for (let k = 0; k < chars.length; k++) {
        if (chars[k]!.team !== victim.team || !isInPlay(chars[k]!)) continue;
        left++;
        last = k;
      }
      if (left === 0) return; // the round is over
      const event: CalloutEvent = !this.countsLeft ? 'tagged' : left === 1 ? 'lastOne' : 'down';
      const area = event === 'lastOne' && this.teamSaw(shooter.team, chars[last]!, bots) ? this.areaOf(chars[last]!.position) : '';
      const own = botOf(bots, shooter.id);
      this.offerFromTeam(shooter.team, event, own, shooter.position, bots, area, 0, left);
    } else if (e.type === 'reloadStart') {
      const i = botOf(bots, e.characterId);
      const b = bots[i];
      if (!b || !isInPlay(b.character)) return;
      if (this.now - Math.max(b.lastThreatAt, lastSeenAt(b)) <= CALLOUTS.reloadThreat) this.offer(b.character.team, 'reloading', i, bots, '', 0, 0, -1);
    } else if (e.type === 'magCaught') {
      const i = botOf(bots, e.toId);
      const b = bots[i];
      if (b && isInPlay(b.character) && e.bbs > 0) this.offer(b.character.team, 'magThanks', i, bots, '', 0, 0, -1);
    } else if (e.type === 'flagRope' && e.raising) {
      const attackers = state.round.attackers;
      if (attackers < 0) return;
      this.offerFromTeam(attackers, 'raising', -1, e.position, bots, '', 0, 0);
      this.offerFromTeam(1 - attackers, 'flag', -1, e.position, bots, '', 0, 0);
    } else if (e.type === 'overtime') {
      // Elimination's overtime flag went up (Dev 6 item 45): on each team, the bot nearest it says so.
      const area = this.areaOf(e.position);
      for (let t = 0; t < 2; t++) this.offerFromTeam(t, 'overtime', -1, e.position, bots, area, 0, 0);
    }
  }

  /**
   * A player's ping that `team`'s bots took since the last one it answered (PG1, ai/pings.ts takePing, which the bots
   * have thought on since): one of them says what it does. Going to your ping by the one nearest the spot that set off
   * to look (a search), else Watching your ping by the nearest of the others that took it (under an order, at a post,
   * watching from where it holds). The spot names the area.
   */
  private answerPing(team: number, bots: readonly Bot[]): void {
    const talk = this.teams[team]!;
    let newest = talk.pingAnswered;
    for (const b of bots) if (b.character.team === team && isInPlay(b.character) && b.pingAt > newest) newest = b.pingAt;
    if (newest === talk.pingAnswered) return;
    talk.pingAnswered = newest;
    let speaker = -1;
    let going = false;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i]!;
      if (b.character.team !== team || !isInPlay(b.character) || b.pingAt !== newest) continue;
      const goes = b.mode === 'search';
      const d = Math.hypot(b.character.position.x - b.pingSpot.x, b.character.position.z - b.pingSpot.z);
      if ((goes && !going) || (goes === going && d < best)) {
        speaker = i;
        going = goes;
        best = d;
      }
    }
    if (speaker >= 0) this.offer(team, going ? 'pingGoing' : 'pingWatching', speaker, bots, this.areaOf(bots[speaker]!.pingSpot), 0, 0, -1);
  }

  /**
   * What bot `i` is doing now that it calls: a fresh sighting, a noise, a search setting off, a hold settled, an ask for
   * a magazine or setting off to bring one (MG1, ai/magShare.ts).
   */
  private watch(i: number, state: GameState, bots: readonly Bot[]): void {
    const b = bots[i]!;
    const me = b.character;
    if (!isInPlay(me)) return;
    const t = me.team;
    const chars = state.characters;
    // Sightings: how many enemies it sees, and the first of them freshly seen that its team hasn't called lately.
    let seen = 0;
    let fresh = -1;
    for (let k = 0; k < chars.length; k++) {
      const c = chars[k]!;
      if (c.team === t || !isInPlay(c)) continue;
      const contact = b.contacts.get(c.id);
      if (!contact || this.now - contact.seenAt > CALLOUTS.inSight) continue;
      seen++;
      const slot = i * this.characters + k;
      if (contact.firstSeenAt === this.firstSeen[slot]) continue;
      this.firstSeen[slot] = contact.firstSeenAt;
      if (fresh < 0 && this.now - this.teams[t]!.enemyAt[k]! >= this.file.pace.sameEnemyGap) fresh = k;
    }
    if (fresh >= 0) this.offer(t, seen >= 2 ? 'contacts' : 'contact', i, bots, this.areaOf(chars[fresh]!.position), seen, 0, fresh);
    // A noise heard this tick, while nobody on the team has anyone in sight.
    if (b.heardAt === this.now && b.hasLastKnown && seen === 0 && !this.teamSees(t, bots)) {
      const area = this.areaOf(b.lastKnown);
      const team = this.teams[t]!;
      if (area !== team.heardArea || this.now - team.heardAt >= this.file.pace.sameEnemyGap) this.offer(t, 'heard', i, bots, area, 0, 0, -1);
    }
    // Setting off to where someone was; not to a ping, which the team's answer to it already said (PG1).
    if (b.mode === 'search' && this.lastMode[i] !== 'search' && !onPingSpot(b)) this.offer(t, pushesIn(b) ? 'pushing' : b.flanking ? 'flanking' : 'checking', i, bots, this.areaOf(b.lastKnown), 0, 0, -1);
    // Asking for a magazine, or setting off to bring one (MG1): each ask and each job once, as soon as the pace lets the
    // bot speak (its own gap, the team's, nothing else waiting) while it still asks or brings it, so neither waits in the
    // queue to be dropped: an ask often comes just after its "Reloading", and its answer in the same tick as the ask.
    if (b.magAskAt > this.askedAt[i]! && this.paceAllows(i, bots)) {
      this.askedAt[i] = b.magAskAt;
      this.offer(t, 'needMag', i, bots, '', 0, 0, -1);
    }
    if (b.magFor && b.magForAt > this.bringAt[i]! && this.paceAllows(i, bots)) {
      this.bringAt[i] = b.magForAt;
      this.offer(t, 'magComing', i, bots, '', 0, 0, -1);
    }
    // Settled at the spot it holds: once a round, whether it says so or not.
    if (b.atPost && !this.wasAtPost[i] && !this.heldCalled[i]) {
      this.heldCalled[i] = true;
      this.offer(t, 'holding', i, bots, this.areaOf(me.position), 0, 0, -1);
    }
  }

  /** Whether any bot on `team` has an enemy in sight now. */
  private teamSees(team: number, bots: readonly Bot[]): boolean {
    for (const b of bots) if (b.character.team === team && isInPlay(b.character) && b.targetVisible) return true;
    return false;
  }

  /** Whether a bot on `team` saw `enemy` within CALLOUTS.lastOneSeen. */
  private teamSaw(team: number, enemy: Character, bots: readonly Bot[]): boolean {
    for (const b of bots) {
      if (b.character.team !== team) continue;
      const contact = b.contacts.get(enemy.id);
      if (contact && this.now - contact.seenAt <= CALLOUTS.lastOneSeen) return true;
    }
    return false;
  }

  /**
   * A team event (a hit, the flag): said by bot `own` if it may speak, else by the team's bot nearest `at` that may (in
   * play and outside its own gap).
   */
  private offerFromTeam(team: number, event: CalloutEvent, own: number, at: Readonly<Vec3>, bots: readonly Bot[], area: string, count: number, left: number): void {
    let speaker = own >= 0 && this.maySpeak(own, bots) ? own : -1;
    if (speaker < 0) {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < bots.length; i++) {
        const c = bots[i]!.character;
        if (c.team !== team || !this.maySpeak(i, bots)) continue;
        const d = Math.hypot(c.position.x - at.x, c.position.z - at.z);
        if (d < best) {
          best = d;
          speaker = i;
        }
      }
    }
    if (speaker >= 0) this.offer(team, event, speaker, bots, area, count, left, -1);
  }

  /** Bot `i` may speak now (maySpeak), and its team is outside Pace's team gap with no call waiting. */
  private paceAllows(i: number, bots: readonly Bot[]): boolean {
    const talk = this.teams[bots[i]!.character.team]!;
    if (!this.maySpeak(i, bots) || this.now - talk.saidAt < this.file.pace.teamGap) return false;
    for (const p of talk.queue) if (p.until >= this.now) return false;
    return true;
  }

  /** Bot `i` is in play and outside its own gap. */
  private maySpeak(i: number, bots: readonly Bot[]): boolean {
    return isInPlay(bots[i]!.character) && this.now - this.saidAt[i]! >= this.file.pace.botGap;
  }

  /**
   * Offers bot `i`'s call of `event` to its team: kept if no gap stops it and its chance comes up, in a free place in the
   * queue or in place of a less urgent call.
   */
  private offer(team: number, event: CalloutEvent, i: number, bots: readonly Bot[], area: string, count: number, left: number, enemy: number): void {
    const rule = this.file.rules[event];
    const b = bots[i]!;
    const talk = this.teams[team]!;
    if (rule.chance <= 0 || !this.allowed(talk, event, i, bots, area, enemy)) return;
    if (this.lineCount(event, b.personality, area) === 0) return;
    // The place it takes: a free one, else the least urgent call's if this one is more urgent.
    let slot: Pending | undefined;
    for (const p of talk.queue) {
      if (p.until < this.now) slot = p;
      else if (!slot || (slot.until >= this.now && p.priority > slot.priority)) slot = p;
    }
    if (!slot || (slot.until >= this.now && slot.priority <= rule.priority)) return;
    const talks = ANSWERS.has(event) ? 1 : (this.file.talks.get(b.personality) ?? 1);
    if (rngNext(this.rng) >= Math.min(1, rule.chance * talks)) return;
    slot.event = event;
    slot.priority = rule.priority;
    slot.bot = i;
    slot.area = area;
    slot.count = count;
    slot.left = left;
    slot.enemy = enemy;
    slot.until = this.now + this.file.pace.maxWait;
  }

  /** Whether no gap stops `event` by bot `i` now: its team gap, the bot's own (but for a team event), the enemy's or noise's. */
  private allowed(talk: TeamTalk, event: CalloutEvent, i: number, bots: readonly Bot[], area: string, enemy: number): boolean {
    const pace = this.file.pace;
    if (this.now - talk.eventAt[EVENT_INDEX.get(event)!]! < this.file.rules[event].teamGap) return false;
    if (TEAM_EVENTS.has(event) ? !isInPlay(bots[i]!.character) : !this.maySpeak(i, bots)) return false;
    if (enemy >= 0 && this.now - talk.enemyAt[enemy]! < pace.sameEnemyGap) return false;
    return event !== 'heard' || area !== talk.heardArea || this.now - talk.heardAt >= pace.sameEnemyGap;
  }

  /**
   * Says team `t`'s most urgent waiting call once its team gap has passed. A call too old, or one a gap now stops (its
   * caller hit, or a teammate called the same since), goes.
   */
  private flush(t: number, state: GameState, bots: readonly Bot[], live: boolean): void {
    const talk = this.teams[t]!;
    const ready = this.now - talk.saidAt >= this.file.pace.teamGap;
    let next: Pending | undefined;
    for (const p of talk.queue) {
      if (p.until < this.now) continue;
      if (!live || !bots[p.bot] || !isInPlay(bots[p.bot]!.character) || (ready && !this.allowed(talk, p.event, p.bot, bots, p.area, p.enemy))) {
        p.until = Number.NEGATIVE_INFINITY;
        continue;
      }
      if (!next || p.priority < next.priority) next = p;
    }
    if (!ready || !next) return;
    next.until = Number.NEGATIVE_INFINITY;
    const b = bots[next.bot]!;
    const text = this.line(next.event, b.personality, next.area, next.count, next.left);
    if (text === '') return;
    talk.saidAt = this.now;
    talk.eventAt[EVENT_INDEX.get(next.event)!] = this.now;
    this.saidAt[next.bot] = this.now;
    if (next.event === 'heard') {
      talk.heardArea = next.area;
      talk.heardAt = this.now;
    }
    // A sighting calls every enemy the speaker sees now, so a teammate doesn't call the same ones again.
    if (next.event === 'contact' || next.event === 'contacts') {
      const chars = state.characters;
      for (let k = 0; k < chars.length; k++) {
        const contact = b.contacts.get(chars[k]!.id);
        if (k === next.enemy || (contact && chars[k]!.team !== t && this.now - contact.seenAt <= CALLOUTS.inSight)) talk.enemyAt[k] = this.now;
      }
    }
    const out = this.said[this.saidCount++]!;
    out.speakerId = b.character.id;
    out.team = t;
    out.event = next.event;
    out.text = text;
    out.markId = this.mark(talk, next, b, state);
  }

  /**
   * Whether a sighting just said marks the enemy it calls (PG1, callouts.md › Marks): the speaker still sees them, the
   * team hasn't marked one within the gap, and the chance comes up (on the marks' own generator). Their id, or -1.
   */
  private mark(talk: TeamTalk, said: Pending, b: Bot, state: GameState): number {
    const marks = this.file.marks;
    if ((said.event !== 'contact' && said.event !== 'contacts') || said.enemy < 0 || marks.chance <= 0) return -1;
    if (this.now - talk.markedAt < marks.gap) return -1;
    const enemy = state.characters[said.enemy];
    const contact = enemy && b.contacts.get(enemy.id);
    if (!enemy || !isInPlay(enemy) || !contact || this.now - contact.seenAt > CALLOUTS.inSight) return -1;
    if (rngNext(this.markRng) >= marks.chance) return -1;
    talk.markedAt = this.now;
    return enemy.id;
  }

  /** How many of `event`'s lines a bot of `personality` can say, with `area` named or not ('' leaves out {area} lines). */
  private lineCount(event: CalloutEvent, personality: string, area: string): number {
    let n = 0;
    for (const l of this.file.lines[event]) if ((l.who === '' || l.who === personality) && (area !== '' || !l.needsArea)) n++;
    return n;
  }

  /** One of those lines at random, filled in ('' when there is none). */
  private line(event: CalloutEvent, personality: string, area: string, count: number, left: number): string {
    let k = Math.floor(rngNext(this.rng) * this.lineCount(event, personality, area));
    for (const l of this.file.lines[event]) {
      if (!((l.who === '' || l.who === personality) && (area !== '' || !l.needsArea))) continue;
      if (k-- === 0) return fillLine(l.text, area, count, left);
    }
    return '';
  }
}
