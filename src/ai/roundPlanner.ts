import { FLAG, unknownMode } from '../config/modes';
import { planSeed } from '../core/seed';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, pick, resetBot } from './bot';
import { anchorHolding } from './personality';
import { assignLanes, pickTeamPlan, shuffledLanes, takeOwnLanes, type TeamPlan } from './teamPlan';

/**
 * Each round's plan per team (DX7, out of ai/botController.ts): where each team starts and which way its enemy is, the
 * team plan and the lanes it deals its bots, how far each walks them, and a bot back mid-round (an Extraction wave) set
 * on a lane again. Between plans it answers where a bot stands on the field (`inEnemyHalf`, `aheadOfTeam`). Its own
 * random stream (`planSeed`), separate from each bot's. `pickRetakers` and `pickRaiser` hand out Attack / Defend's flag
 * jobs each tick.
 */
export class RoundPlanner {
  /** Per team, this round's plan. */
  readonly plans: TeamPlan[] = ['split', 'split'];
  /** Per team, the middle of its spawns this round (teams swap ends at half-time). */
  readonly spawnCentre: Vec3[] = [vec3(), vec3()];
  /** Per team, the way its enemy's spawn is (yaw) this round. */
  readonly enemyYaw: number[] = [0, 0];
  /** Per team, the unit direction (x, z) from its spawn towards the enemy's this round. */
  private readonly attackDir: { x: number; z: number }[] = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
  ];
  /** Per team, the end of the map it starts from this round. */
  private readonly ends: number[] = [0, 1];
  /** The team plans' own random stream (separate from each bot's). */
  private readonly rng: RngState;

  constructor(seed: number) {
    this.rng = createRng(planSeed(seed));
  }

  /**
   * A fresh round for every bot: per team, pick a plan, deal out the lanes in a random order, and have
   * bots that share a lane set off a moment apart. In Attack / Defend, defenders don't advance: each holds
   * the first point of its lane (nearest home), or the second (see defendForwardChance), and they never
   * stack all on one lane. Attackers walk their lane only as far as the first point past the middle of
   * the map, then head for the pole. True for an Extraction run, which the home team plays by jobs, not lanes
   * (BotController starts its RunRoles).
   */
  plan(w: BotWorld): boolean {
    this.measureEnds(w.characters);
    const cfg = w.cfg;
    const round = w.round;
    // What the mode asks of the bots (CT3: every mode answers here): the lanes alone, the flag, or the run's jobs.
    let objective = false;
    let run = false;
    switch (round.mode) {
      case 'elimination':
        break;
      case 'attackDefend':
        objective = round.attackers >= 0;
        break;
      case 'extraction':
        run = true;
        break;
      default:
        unknownMode(round.mode);
    }
    for (let team = 0; team < this.plans.length; team++) {
      const members = w.bots.filter((b) => b.character.team === team);
      const defending = objective && team !== round.attackers;
      const attacking = objective && team === round.attackers;
      let plan = pickTeamPlan(this.rng, cfg);
      if (defending && plan === 'stack') plan = 'pair'; // three bots holding one lane point would stand in a heap
      this.plans[team] = plan;
      const lanes = assignLanes(plan, members.length, shuffledLanes(this.rng, w.lanes.length));
      // A personality that keeps a lane of its own (BN1, the flanker) leaves a shared lane for the free one furthest from
      // its team's. Not on defence: defenders hold the points they were dealt.
      if (!defending) takeOwnLanes(members.map((b) => b.style.ownLane), lanes, w.lanes);
      const onLane = new Map<number, number>();
      members.forEach((b, i) => {
        const lane = lanes[i]!;
        const ahead = onLane.get(lane) ?? 0;
        onLane.set(lane, ahead + 1);
        let hold = 0;
        for (let k = 0; k < ahead; k++) hold += pick(b.rng, cfg.laneFollowDelay);
        let points = Number.POSITIVE_INFINITY;
        if (defending) {
          const shared = lanes.filter((l) => l === lane).length > 1;
          const forward = ahead === 0 && (shared || rngNext(this.rng) < cfg.defendForwardChance);
          // Bots that play as a team (M38) both hold a shared lane's forward point, in a crossfire (see crossfireSpot).
          points = forward || (shared && b.skill.teamPlay) ? 2 : 1;
        } else if (attacking) {
          points = this.pointsToMidfield(w.lanes, team, lane);
        } else if (round.mode === 'elimination' && b.style.holdUntil !== null) {
          // An anchor (BN1) walks its lane only to the last point short of the middle, and holds there (anchorHolding).
          points = Math.max(1, this.pointsToMidfield(w.lanes, team, lane) - 1);
        }
        resetBot(b, lane, hold, cfg, points);
      });
    }
    return run;
  }

  /** Where each team starts this round (its spawns' middle and end), and which way its enemy is. */
  private measureEnds(chars: readonly Character[]): void {
    for (let team = 0; team < 2; team++) {
      const centre = this.spawnCentre[team]!;
      let n = 0;
      centre.x = 0;
      centre.z = 0;
      for (const c of chars) {
        if (c.team !== team) continue;
        centre.x += c.spawnPosition.x;
        centre.z += c.spawnPosition.z;
        this.ends[team] = c.end;
        n++;
      }
      centre.x /= Math.max(1, n);
      centre.z /= Math.max(1, n);
    }
    const [blue, orange] = this.spawnCentre as [Vec3, Vec3];
    this.enemyYaw[0] = Math.atan2(-(orange.x - blue.x), -(orange.z - blue.z));
    this.enemyYaw[1] = Math.atan2(-(blue.x - orange.x), -(blue.z - orange.z));
    const span = Math.max(1e-6, Math.hypot(orange.x - blue.x, orange.z - blue.z));
    const ux = (orange.x - blue.x) / span;
    const uz = (orange.z - blue.z) / span;
    this.attackDir[0]!.x = ux;
    this.attackDir[0]!.z = uz;
    this.attackDir[1]!.x = -ux;
    this.attackDir[1]!.z = -uz;
  }

  /**
   * How many of `lane`'s points `team` walks to reach the first one past the middle of the map (all of
   * them if none is): attackers go for the pole from there.
   */
  private pointsToMidfield(allLanes: readonly (readonly Vec3[])[], team: number, lane: number): number {
    const points = allLanes[lane];
    if (!points) return Number.POSITIVE_INFINITY;
    const home = this.spawnCentre[team]!;
    const dir = this.attackDir[team]!;
    const enemy = this.spawnCentre[1 - team]!;
    const half = Math.hypot(enemy.x - home.x, enemy.z - home.z) / 2;
    const n = points.length;
    for (let k = 0; k < n; k++) {
      // Walking order: from end 0 the points go first to last, from end 1 last to first (see resetBot).
      const p = points[this.ends[team] === 0 ? k : n - 1 - k]!;
      if ((p.x - home.x) * dir.x + (p.z - home.z) * dir.z >= half) return k + 1;
    }
    return n;
  }

  /** How far `c` is from its spawn towards the enemy side (metres). */
  private progress(c: Character): number {
    const home = this.spawnCentre[c.team]!;
    const dir = this.attackDir[c.team]!;
    return (c.position.x - home.x) * dir.x + (c.position.z - home.z) * dir.z;
  }

  /** True if `bot` stands more than halfway from its spawns to the enemy's. */
  inEnemyHalf(bot: Bot): boolean {
    const team = bot.character.team;
    const home = this.spawnCentre[team]!;
    const enemy = this.spawnCentre[1 - team]!;
    return this.progress(bot.character) > Math.hypot(enemy.x - home.x, enemy.z - home.z) / 2;
  }

  /** True if `bot` is more than teamSpread ahead of its rearmost teammate bot in play (players don't hold bots back). */
  aheadOfTeam(bot: Bot, w: BotWorld): boolean {
    const me = bot.character;
    let rear = Number.POSITIVE_INFINITY;
    for (const b of w.bots) {
      const c = b.character;
      // Bots under a squad order go their own way, and an anchor holds short of the middle (BN1): nobody waits for them.
      if (c === me || c.team !== me.team || !isInPlay(c) || b.order !== 'none' || anchorHolding(b, w)) continue;
      rear = Math.min(rear, this.progress(c));
    }
    return this.progress(me) - rear > w.cfg.teamSpread;
  }

  /**
   * A bot back in play mid-round (an Extraction wave, M45): what it knew is forgotten, and it walks a random lane on
   * from that lane's point nearest its regen point, towards the other end, as if it had come that far.
   */
  sendBack(b: Bot, w: BotWorld): void {
    const lanes = w.lanes;
    const lane = lanes.length > 0 ? Math.floor(rngNext(this.rng) * lanes.length) : 0;
    resetBot(b, lane, 0, w.cfg);
    const points = lanes[lane];
    if (!points || points.length === 0) return;
    const p = b.character.position;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.hypot(points[i]!.x - p.x, points[i]!.z - p.z) < Math.hypot(points[nearest]!.x - p.x, points[nearest]!.z - p.z)) nearest = i;
    }
    // laneIndex is the point last reached: the nearest one comes next.
    b.laneIndex = nearest - b.laneDir;
  }
}

/**
 * Attack / Defend: the `retakers` defending bots in play nearest the pole are the ones who go and pull
 * the flag down once it's off the bottom; the rest hold their posts, so tagging the pole doesn't empty
 * every lane. Re-picked every tick, so if a retaker is hit the next nearest takes over.
 */
export function pickRetakers(w: BotWorld): void {
  const r = w.round;
  const pole = r.flag.position;
  for (const b of w.bots) {
    const c = b.character;
    b.retake = false;
    // A bot under a squad order isn't picked: it does what it was told, and the next nearest goes.
    if (r.mode !== 'attackDefend' || r.attackers < 0 || c.team === r.attackers || !isInPlay(c) || b.order !== 'none') continue;
    const d = Math.hypot(c.position.x - pole.x, c.position.z - pole.z);
    let closer = 0;
    for (const o of w.bots) {
      const oc = o.character;
      if (o === b || oc.team !== c.team || !isInPlay(oc) || o.order !== 'none') continue;
      const od = Math.hypot(oc.position.x - pole.x, oc.position.z - pole.z);
      if (od < d || (od === d && oc.id < c.id)) closer++;
    }
    b.retake = closer < w.cfg.retakers;
  }
}

/**
 * Attack / Defend (audit AI-06): of the attacking bots in play that have swept their lane, one raises the flag and the
 * others guard the pole from cover; a second raiser adds nothing (the rope goes up no faster). The raiser is the bot
 * in flag mode nearest the pole, the current one kept unless another is raiserSwitchMargin nearer; one drawn into a
 * fight or into cover elsewhere hands the rope over, so a guard never waits on a raiser that is busy or far off.
 * Nobody raises while a teammate who isn't a bot (the player) is already at the pole: `botCharacters` are the bots'.
 */
export function pickRaiser(w: BotWorld, botCharacters: ReadonlySet<Character>): void {
  const r = w.round;
  let raiser: Bot | undefined;
  // Bots in flag mode first, then anyone else; then the nearest to the pole, the raiser counted raiserSwitchMargin nearer.
  let bestRank = Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const b of w.bots) {
    const keep = b.raiser;
    b.raiser = false;
    const c = b.character;
    if (r.mode !== 'attackDefend' || c.team !== r.attackers || !isInPlay(c) || !b.laneDone || b.order !== 'none') continue;
    const rank = b.mode === 'flag' ? 0 : 1;
    const d = Math.hypot(c.position.x - r.flag.position.x, c.position.z - r.flag.position.z) - (keep ? w.cfg.raiserSwitchMargin : 0);
    if (rank < bestRank || (rank === bestRank && d < best)) {
      bestRank = rank;
      best = d;
      raiser = b;
    }
  }
  if (!raiser) return;
  for (const c of w.characters) {
    if (c.team !== r.attackers || !isInPlay(c) || botCharacters.has(c)) continue;
    if (Math.hypot(c.position.x - r.flag.position.x, c.position.z - r.flag.position.z) <= FLAG.radius) return;
  }
  raiser.raiser = true;
}
