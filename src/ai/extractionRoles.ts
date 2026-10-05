import type { BotSkill } from '../config/bots';
import { floorAt, isWalkableAt } from '../nav/navGrid';
import { isInPlay } from '../sim/elimination';
import type { RunCase } from '../sim/extraction';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, lastSeenAt, type PatrolRound, pick } from './bot';
import { teammateSpots } from './botMovement';
import { createCoverSpot, type CoverSearch, findCover, type TakenSpots } from './cover';
import { lineClear } from './perception';

/**
 * Extraction (M46; plan, section 3): the home team's jobs in a run. At the start the bots nearest the marshal's locker
 * guard it (lockerGuards of them), with one more on a field case when the rest would leave a patrol alone; the rest
 * walk rounds of the other cases in pairs. From huntersFrom of the run on, the patrols and everyone back in a wave hunt
 * the squad instead; a bot back in a wave first fills a guard's place left empty. A guard whose case is opened takes
 * the next job going. One per run, kept by the BotController: no allocation per tick.
 */

/** A guarded case and how many guard it. */
interface GuardSlot {
  caseIndex: number;
  want: number;
}

/** The marshal's locker: the run's best case (pool.md Caches), the one guarded hardest. */
const LOCKER = 'locker';
/** A field case: the next best, which an odd bot out guards. */
const FIELD_CASE = 'field-case';

const DEG = Math.PI / 180;

// Scratch, each used only within one call of the function that fills it.
const front = vec3();
const threat = vec3();
const lookOut = vec3();
const standEye = vec3();
const caseMiddle = vec3();
const spot = createCoverSpot();
const postSearch: CoverSearch = { radius: 0, randomCandidates: 0, peekable: true };

export class RunRoles {
  /** The guarded cases, the locker first. */
  private readonly slots: GuardSlot[] = [];
  /** The patrols and returners hunt from now on. */
  private hunting = false;
  /** The cases within insertionBerth of the squad's insertion: never guarded nor patrolled. */
  private readonly berth: boolean[] = [];
  /** The latest place the home team saw or heard the squad, and when (s). */
  private readonly news = vec3();
  private newsAt = Number.NEGATIVE_INFINITY;

  /**
   * `home`: the home team; `runTime`: the run's length (s), the clock at its start; `skill`: how the home team plays.
   */
  constructor(
    readonly home: number,
    private readonly runTime: number,
    private readonly skill: BotSkill,
  ) {}

  /**
   * The run's start: guards to the locker (and a field case), patrols in pairs over the rest; none of it within
   * insertionBerth of `insertion` (the middle of the squad's insertion).
   */
  start(bots: readonly Bot[], w: BotWorld, insertion: Vec3): void {
    const cases = w.round.run.cases;
    for (const k of cases) this.berth.push(flat(k.position, insertion) < w.cfg.insertionBerth);
    const team = bots.filter((b) => b.character.team === this.home && isInPlay(b.character));
    const locker = cases.findIndex((k, i) => k.kind === LOCKER && !k.open && !this.berth[i]);
    const lockerGuards = locker >= 0 ? Math.min(this.skill.lockerGuards, team.length) : 0;
    if (lockerGuards > 0) this.slots.push({ caseIndex: locker, want: lockerGuards });
    // An odd one out of three or more left over guards a field case (the one furthest from the locker) rather than
    // patrol alone.
    const rest = team.length - lockerGuards;
    const field = rest >= 3 && rest % 2 === 1 ? farthestCase(cases, this.berth, FIELD_CASE, locker >= 0 ? cases[locker]!.position : undefined) : -1;
    if (field >= 0) this.slots.push({ caseIndex: field, want: 1 });
    this.hunting = this.huntTime(w);
    const free = [...team];
    for (const slot of this.slots) {
      const at = cases[slot.caseIndex]!.position;
      free.sort((a, b) => flat(a.character.position, at) - flat(b.character.position, at));
      for (const b of free.splice(0, slot.want)) this.post(b, slot.caseIndex, w);
    }
    // The rest in pairs, each pair the two nearest each other of those left.
    while (free.length > 0) {
      const first = free.shift()!;
      if (this.hunting) {
        hunt(first);
        continue;
      }
      free.sort((a, b) => flat(a.character.position, first.character.position) - flat(b.character.position, first.character.position));
      const second = free.shift();
      this.patrol(first, w, second);
    }
  }

  /**
   * Before the bots think, each tick: keep the team's news of the squad, and once hunting time comes, turn the patrols
   * into hunters.
   */
  update(bots: readonly Bot[], w: BotWorld): void {
    for (const b of bots) {
      if (b.character.team !== this.home || !isInPlay(b.character) || !b.hasLastKnown) continue;
      const at = Math.max(lastSeenAt(b), b.heardAt);
      if (at <= this.newsAt) continue;
      this.newsAt = at;
      this.news.x = b.lastKnown.x;
      this.news.y = b.lastKnown.y;
      this.news.z = b.lastKnown.z;
    }
    if (this.hunting || !this.huntTime(w)) return;
    this.hunting = true;
    for (const b of bots) if (b.character.team === this.home && b.role === 'patrol') hunt(b);
  }

  /** The team's latest news of the squad into `out`, and when (s); -Infinity for the squad's own team. */
  newsFor(team: number, out: Vec3): number {
    if (team !== this.home) return Number.NEGATIVE_INFINITY;
    out.x = this.news.x;
    out.y = this.news.y;
    out.z = this.news.z;
    return this.newsAt;
  }

  /** Bot `b` is back in a wave (its controller has just reset it): an empty guard's place, else a hunt or a patrol. */
  returned(b: Bot, bots: readonly Bot[], w: BotWorld): void {
    this.assign(b, bots, w);
  }

  /** Case `index` was opened: its guards take the next job going. */
  caseOpened(index: number, bots: readonly Bot[], w: BotWorld): void {
    for (const b of bots) {
      if (b.role !== 'guard' || b.guardCase !== index || !isInPlay(b.character)) continue;
      b.role = 'none';
      b.guardCase = -1;
      this.assign(b, bots, w);
    }
  }

  /** The next job going for `b`: a guard's empty place, else (by the clock) a hunt, else a patrol. */
  private assign(b: Bot, bots: readonly Bot[], w: BotWorld): void {
    if (b.character.team !== this.home) return;
    b.routeState = 'none';
    b.route.length = 0;
    const cases = w.round.run.cases;
    for (const slot of this.slots) {
      if (cases[slot.caseIndex]!.open) continue;
      let posted = 0;
      for (const o of bots) if (o !== b && o.role === 'guard' && o.guardCase === slot.caseIndex && isInPlay(o.character)) posted++;
      if (posted >= slot.want) continue;
      this.post(b, slot.caseIndex, w);
      return;
    }
    if (this.hunting) {
      hunt(b);
      return;
    }
    // Join a patrol walking alone (its partner hit, or never had one), else start a round of its own.
    for (const o of bots) {
      if (o === b || o.role !== 'patrol' || !isInPlay(o.character)) continue;
      const mate = o.patrolPartner;
      if (mate && mate.role === 'patrol' && isInPlay(mate.character)) continue;
      b.role = 'patrol';
      b.patrol = o.patrol;
      b.patrolIndex = Math.max(-1, o.patrolIndex - 1); // the stop its partner is making for comes next
      b.patrolPartner = o;
      b.patrolLead = false;
      o.patrolPartner = b;
      o.patrolLead = true;
      b.hunting = false;
      return;
    }
    this.patrol(b, w);
  }

  /** Hunting time: at least huntersFrom of the run gone (never without it). */
  private huntTime(w: BotWorld): boolean {
    const from = this.skill.huntersFrom;
    return from !== null && this.runTime > 0 && 1 - w.round.clock / this.runTime >= from;
  }

  /**
   * Posts `b` on case `index`: a cover spot within guardPostRadius of the case, hidden from where the way in is (in front
   * of the case, as far as guardThreatDistance or the wall short of it), away from teammates' spots, facing that way;
   * failing that, in front of the case.
   */
  private post(b: Bot, index: number, w: BotWorld): void {
    const cfg = w.cfg;
    const k = w.round.run.cases[index]!;
    b.role = 'guard';
    b.guardCase = index;
    b.patrol = undefined;
    b.patrolPartner = undefined;
    b.hunting = false;
    caseFront(k, cfg.patrolStandOff, w, front);
    // The way in: out from the case's front, at standing eye height, short of the first wall.
    const eyeUp = w.body.standEyeHeight;
    lookOut.x = -Math.sin(k.yaw);
    lookOut.y = 0;
    lookOut.z = -Math.cos(k.yaw);
    threat.x = front.x;
    threat.y = front.y + eyeUp;
    threat.z = front.z;
    const wall = w.query.raycastStatic(threat, lookOut, cfg.guardThreatDistance);
    const reach = wall < 0 ? cfg.guardThreatDistance : Math.max(0, wall - w.body.radius);
    threat.x += lookOut.x * reach;
    threat.z += lookOut.z * reach;
    postSearch.radius = cfg.guardPostRadius;
    const taken = teammateSpots(b, w);
    const at = findCover(k.position, threat, w, b.rng, spot, postSearch, taken) ? spot.position : openPost(k, w, taken, front);
    b.post.x = at.x;
    b.post.y = at.y;
    b.post.z = at.z;
    b.postYaw = Math.atan2(-(threat.x - at.x), -(threat.z - at.z));
  }

  /** Starts `b` (and `partner`, a moment behind) on a round of the shut cases nobody guards, nearest first. */
  private patrol(b: Bot, w: BotWorld, partner?: Bot): void {
    const round = patrolRound(w.round.run.cases, this.slots, this.berth, b.character.position, w);
    for (const p of partner ? [b, partner] : [b]) {
      p.role = 'patrol';
      p.guardCase = -1;
      p.patrol = round;
      p.patrolIndex = -1;
      p.patrolPartner = p === b ? partner : b;
      p.patrolLead = p === b;
      p.hunting = false;
    }
    if (partner) partner.holdLeft = Math.max(partner.holdLeft, pick(partner.rng, w.cfg.laneFollowDelay));
  }
}

/**
 * A guard's post by a case with no cover near it (see guardOpenRadius): the first spot round the case, from straight out
 * in front, that is walkable on the case's floor, sees the case and keeps clear of `taken`; `fallback` if none does.
 */
function openPost(k: RunCase, w: BotWorld, taken: TakenSpots, fallback: Vec3): Vec3 {
  const cfg = w.cfg;
  caseMiddle.x = k.position.x;
  caseMiddle.y = k.position.y + w.body.height / 2;
  caseMiddle.z = k.position.z;
  const steps = Math.floor(90 / cfg.guardOpenTurnDeg);
  for (let i = 0; i <= 2 * steps; i++) {
    // 0, +1, -1, +2, -2 … turns.
    const turn = (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * cfg.guardOpenTurnDeg * DEG;
    const x = k.position.x - Math.sin(k.yaw + turn) * cfg.guardOpenRadius;
    const z = k.position.z - Math.cos(k.yaw + turn) * cfg.guardOpenRadius;
    if (!isWalkableAt(w.nav, x, k.position.y, z)) continue;
    const y = floorAt(w.nav, x, k.position.y, z);
    if (Math.abs(y - k.position.y) > w.nav.maxStep) continue;
    let clear = true;
    for (let t = 0; t < taken.count && clear; t++) clear = Math.hypot(taken.points[t]!.x - x, taken.points[t]!.z - z) >= taken.minGap;
    if (!clear) continue;
    standEye.x = x;
    standEye.y = y + w.body.standEyeHeight;
    standEye.z = z;
    if (!lineClear(w.query, standEye, caseMiddle)) continue;
    spot.position.x = x;
    spot.position.y = y;
    spot.position.z = z;
    return spot.position;
  }
  return fallback;
}

/** Makes `b` a hunter: it drops what it was doing for its first goal (see the movement's run goals). */
function hunt(b: Bot): void {
  b.role = 'hunter';
  b.guardCase = -1;
  b.patrol = undefined;
  b.patrolPartner = undefined;
  b.hunting = true;
  b.holdLeft = 0;
  b.waitForTeam = false;
  b.routeState = 'none';
  b.route.length = 0;
}

/**
 * A round of the shut cases not guarded, starting at the one nearest `from` and going on to the nearest not yet on it
 * (a loop it walks again and again): each stop patrolStandOff in front of its case.
 */
function patrolRound(cases: readonly RunCase[], slots: readonly GuardSlot[], berth: readonly boolean[], from: Vec3, w: BotWorld): PatrolRound {
  const left: number[] = [];
  for (let i = 0; i < cases.length; i++) if (!cases[i]!.open && !cases[i]!.dropped && !berth[i] && !slots.some((s) => s.caseIndex === i)) left.push(i);
  const round: PatrolRound = { stops: [], cases: [] };
  let at = from;
  while (left.length > 0) {
    let best = 0;
    for (let j = 1; j < left.length; j++) if (flat(cases[left[j]!]!.position, at) < flat(cases[left[best]!]!.position, at)) best = j;
    const index = left.splice(best, 1)[0]!;
    const stop = caseFront(cases[index]!, w.cfg.patrolStandOff, w, vec3());
    round.stops.push(stop);
    round.cases.push(index);
    at = stop;
  }
  return round;
}

/**
 * The spot `distance` in front of case `k` on its floor, into `out`, stepping back towards the case until the floor is
 * walkable (the case's own spot if none is).
 */
export function caseFront(k: RunCase, distance: number, w: BotWorld, out: Vec3): Vec3 {
  const fx = -Math.sin(k.yaw);
  const fz = -Math.cos(k.yaw);
  for (let d = distance; d > 0; d -= w.nav.cell) {
    const x = k.position.x + fx * d;
    const z = k.position.z + fz * d;
    if (!isWalkableAt(w.nav, x, k.position.y, z)) continue;
    out.x = x;
    out.y = floorAt(w.nav, x, k.position.y, z);
    out.z = z;
    return out;
  }
  out.x = k.position.x;
  out.y = k.position.y;
  out.z = k.position.z;
  return out;
}

/** The shut case of `kind`, outside the berth, furthest from `from` (the first one without `from`), or -1. */
function farthestCase(cases: readonly RunCase[], berth: readonly boolean[], kind: string, from: Vec3 | undefined): number {
  let best = -1;
  for (let i = 0; i < cases.length; i++) {
    const k = cases[i]!;
    if (k.kind !== kind || k.open || berth[i]) continue;
    if (best < 0 || (from && flat(k.position, from) > flat(cases[best]!.position, from))) best = i;
  }
  return best;
}

function flat(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

