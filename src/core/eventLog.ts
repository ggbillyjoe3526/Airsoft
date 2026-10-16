import { REPORT_LOG } from '../config/crash';
import { SIM } from '../config/sim';
import { TEAMS } from '../config/teams';
import type { GameEvent } from '../sim/events';

/** One line of the log, overwritten in place as the ring comes round (no allocation per tick). */
interface Slot {
  type: GameEvent['type'] | 'botMode';
  tick: number;
  /** The newest tick a line that counts up (shots, a flapping bot) took in. */
  lastTick: number;
  /** Who did it (the shooter, the reloader, the bot); -1 for none. */
  actor: number;
  /** Who it was done to (the one hit), or a number the line needs (the round, the winner, the exit, the case). */
  other: number;
  count: number;
  flag: boolean;
  /** A word the line needs: the replica, the fire mode, the reason, the case's kind, the bot's new mode. */
  word: string;
  /** A bot's mode before its first change in this line. */
  from: string;
}

/** A bot as the log watches it (ai/bot.ts Bot): its character and its brain's mode. */
export interface WatchedBot {
  readonly character: { readonly id: number };
  readonly mode: string;
}

/** A character as the log names it (sim/character.ts). */
export interface NamedCharacter {
  readonly id: number;
  readonly team: number;
}

/**
 * The last game events (IM7), for a report: "what happened just before" that players can't describe. Shots and hits for
 * everyone, the player's own reloads, draws, fire modes, dry fires and torch, bot mode changes, and the round's start
 * and end; the rest (footsteps, impacts, the flag's rope) would bury them. A ring of preallocated slots filled each tick
 * with no allocation; read only when a report is made. A character's burst of shots, or a bot flapping between modes,
 * counts up one line instead of filling the ring.
 */
export class EventLog {
  private readonly slots: Slot[];
  private next = 0;
  private filled = 0;
  /** Each watched bot's mode at the last tick, by its index in the list watched. */
  private readonly modes: string[] = [];

  constructor(capacity: number = REPORT_LOG.events) {
    this.slots = Array.from({ length: capacity }, () => ({ type: 'shot', tick: 0, lastTick: 0, actor: -1, other: -1, count: 0, flag: false, word: '', from: '' }));
  }

  /** The events of the tick just stepped (`tick`), for the player `playerId`. */
  record(tick: number, events: readonly GameEvent[], playerId: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const line = this.recent('shot', e.characterId, tick, REPORT_LOG.burstTicks);
          if (line && line.word === e.replicaId) {
            line.count++;
            line.lastTick = tick;
          } else this.take('shot', tick, e.characterId, -1, false, e.replicaId);
          break;
        }
        case 'dryFire':
        case 'reloadStart':
        case 'reloadEnd':
        case 'reloadRefused':
        case 'draw':
          if (e.characterId === playerId) this.take(e.type, tick, e.characterId, -1, false, e.replicaId);
          break;
        case 'fireMode':
          if (e.characterId === playerId) this.take(e.type, tick, e.characterId, -1, false, e.mode);
          break;
        case 'torch':
          if (e.characterId === playerId) this.take(e.type, tick, e.characterId, -1, e.on, '');
          break;
        case 'hopUp':
          if (e.characterId === playerId && e.moved) this.take(e.type, tick, e.characterId, -1, false, `${Math.round(e.dial * 100)}%`);
          break;
        case 'characterHit':
          this.take(e.type, tick, e.shooterId, e.victimId, e.ricochet, '');
          break;
        case 'ricochetTick':
          this.take(e.type, tick, e.shooterId, e.victimId, false, '');
          break;
        case 'targetHit':
          this.take(e.type, tick, e.shooterId, e.targetId, e.ricochet, e.kind);
          break;
        case 'roundStart':
          this.take(e.type, tick, -1, e.round, false, '');
          break;
        case 'roundOver':
          this.take(e.type, tick, -1, e.winner, false, e.reason);
          break;
        case 'overtime':
          this.take(e.type, tick, -1, -1, false, '');
          break;
        case 'matchOver':
          this.take(e.type, tick, -1, e.winner, false, '');
          break;
        case 'respawned':
          this.take(e.type, tick, e.characterId, e.respawnsLeft, false, '');
          break;
        case 'returned':
          this.take(e.type, tick, e.characterId, -1, false, '');
          break;
        case 'exitOpened':
          this.take(e.type, tick, -1, e.exit, false, '');
          break;
        case 'runWarning':
          this.take(e.type, tick, -1, e.secondsLeft, false, '');
          break;
        case 'caseOpened':
          this.take(e.type, tick, e.characterId, e.case, false, e.kind);
          break;
        case 'caseDropped':
          this.take(e.type, tick, e.characterId, e.case, false, '');
          break;
        default:
          break;
      }
    }
  }

  /** The bots' modes after they thought on `tick`: a change is a line (the first look at a bot only notes its mode). */
  watchBots(tick: number, bots: readonly WatchedBot[]): void {
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i]!;
      const was = this.modes[i];
      if (was === bot.mode) continue;
      this.modes[i] = bot.mode;
      if (was === undefined) continue;
      const line = this.recent('botMode', bot.character.id, tick, REPORT_LOG.flapTicks);
      if (line) {
        line.count++;
        line.lastTick = tick;
        line.word = bot.mode;
      } else {
        this.take('botMode', tick, bot.character.id, -1, false, bot.mode).from = was;
      }
    }
  }

  /** Each line as a report gives it, oldest first: its tick, how long before `nowTick`, and what happened. */
  lines(nowTick: number, characters: readonly NamedCharacter[], playerId: number): string[] {
    const who = (id: number): string => characterName(id, characters, playerId);
    const out: string[] = [];
    const n = this.filled;
    for (let i = 0; i < n; i++) {
      const s = this.slots[(this.next - n + i + this.slots.length) % this.slots.length]!;
      const ago = ((nowTick - s.tick) / SIM.tickRate).toFixed(1);
      out.push(`tick ${s.tick} (${ago} s ago): ${describe(s, who)}`);
    }
    return out;
  }

  /**
   * `actor`'s newest line of `type` that took a tick within `ticks` of `tick`, looking back past other shots and mode
   * changes only (two players trading shots count up a line each; a hit or a round ends the count), or null.
   */
  private recent(type: 'shot' | 'botMode', actor: number, tick: number, ticks: number): Slot | null {
    const n = this.slots.length;
    for (let i = 1; i <= Math.min(this.filled, REPORT_LOG.lookBack); i++) {
      const s = this.slots[(this.next - i + n) % n]!;
      if (s.type !== 'shot' && s.type !== 'botMode') return null;
      if (s.type === type && s.actor === actor) return tick - s.lastTick <= ticks ? s : null;
    }
    return null;
  }

  private take(type: Slot['type'], tick: number, actor: number, other: number, flag: boolean, word: string): Slot {
    const s = this.slots[this.next]!;
    s.type = type;
    s.tick = s.lastTick = tick;
    s.actor = actor;
    s.other = other;
    s.count = 1;
    s.flag = flag;
    s.word = word;
    s.from = '';
    this.next = (this.next + 1) % this.slots.length;
    if (this.filled < this.slots.length) this.filled++;
    return s;
  }
}

/** "you" for the player, else the team and the character's id ("Beta 4"), or "#4" for one not in the match. */
export function characterName(id: number, characters: readonly NamedCharacter[], playerId: number): string {
  if (id === playerId) return 'you';
  const c = characters.find((x) => x.id === id);
  return c ? `${TEAMS[c.team]?.name ?? `Team ${c.team}`} ${id}` : `#${id}`;
}

function teamWon(team: number): string {
  return team < 0 ? 'a draw' : `${TEAMS[team]?.name ?? `Team ${team}`} won`;
}

function describe(s: Slot, who: (id: number) => string): string {
  const seconds = ((s.lastTick - s.tick) / SIM.tickRate).toFixed(1);
  switch (s.type) {
    case 'shot':
      return s.count > 1 ? `${who(s.actor)} fired ${s.count} BBs over ${seconds} s (${s.word})` : `${who(s.actor)} fired (${s.word})`;
    case 'dryFire':
      return `${who(s.actor)} dry-fired (${s.word})`;
    case 'reloadStart':
      return `${who(s.actor)} started a reload (${s.word})`;
    case 'reloadEnd':
      return `${who(s.actor)} finished the reload (${s.word})`;
    case 'reloadRefused':
      return `${who(s.actor)} pressed reload: no fuller magazine (${s.word})`;
    case 'draw':
      return `${who(s.actor)} drew ${s.word}`;
    case 'fireMode':
      return `${who(s.actor)} switched to ${s.word}`;
    case 'torch':
      return `${who(s.actor)} turned the torch ${s.flag ? 'on' : 'off'}`;
    case 'hopUp':
      return `${who(s.actor)} set the hop-up to ${s.word}`;
    case 'characterHit':
      return `${who(s.actor)} hit ${who(s.other)}${s.flag ? ' (ricochet)' : ''}`;
    case 'ricochetTick':
      return `a ricochet from ${who(s.actor)} ticked ${who(s.other)}`;
    case 'targetHit':
      return `${who(s.actor)} hit target ${s.other} (${s.word}${s.flag ? ', ricochet' : ''})`;
    case 'roundStart':
      return `round ${s.other} started`;
    case 'roundOver':
      return `round over: ${teamWon(s.other)} (${s.word})`;
    case 'overtime':
      return 'overtime: the flag went up';
    case 'matchOver':
      return `match over: ${teamWon(s.other)}`;
    case 'respawned':
      return `${who(s.actor)} respawned (${s.other} left)`;
    case 'returned':
      return `${who(s.actor)} came back in a wave`;
    case 'exitOpened':
      return `exit ${s.other} opened`;
    case 'runWarning':
      return `the marshal's whistle: ${s.other} s left`;
    case 'caseOpened':
      return `${who(s.actor)} opened case ${s.other} (${s.word})`;
    case 'caseDropped':
      return `${who(s.actor)} dropped case ${s.other}`;
    case 'botMode':
      return s.count > 1 ? `${who(s.actor)}: ${s.from} → ${s.word} (${s.count} changes in ${seconds} s)` : `${who(s.actor)}: ${s.from} → ${s.word}`;
    default:
      return s.type;
  }
}
