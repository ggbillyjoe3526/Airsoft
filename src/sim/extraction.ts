import { EXTRACTION, type ExtractionRules } from '../config/extraction';
import type { ExitZone, ExtractionData, SpawnPoint } from '../map/mapTypes';
import { type Character, respawnCharacter } from './character';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';
import { createRng, rngNext } from './rng';
import { type Vec3, vec3 } from './vec';

/**
 * Extraction's run (M43): one long "round" against the clock. The squad goes in at an insertion point, and the run ends
 * when the runner (the player) has stood in an open exit for `extractTime` ("extracted"), is hit with no respawn left
 * ("out"), or time runs out ("time": caught out). A hit squad member comes back at the insertion once per run, the
 * moment the hit call ends (owner, 2026-10-04: automatically, no walk back). Exits within `minExitDistance` of the
 * insertion are closed for the run; a late exit opens with `lateExitAt` seconds left. Plain data, stepped by
 * sim/round.ts.
 */

export type RunOutcome = 'none' | 'extracted' | 'out' | 'time';

/** One of the map's exits as this run has it. */
export interface RunExit {
  name: string;
  position: Vec3;
  radius: number;
  late: boolean;
  /** Too close to this run's insertion: never opens. */
  closed: boolean;
  /** Open now (a late exit from `lateExitAt`, the others from the start, unless closed). */
  open: boolean;
}

/** What the exit count is doing, for the HUD: nobody at an exit, counting, or paused by an opponent in the zone. */
export type ExitCountStatus = 'idle' | 'counting' | 'paused';

export interface RunState {
  exits: RunExit[];
  /** Respawns each squad member has used, by character id (0 for the home team: they don't respawn here). */
  respawnsUsed: number[];
  /** Seconds the runner has been counted at `countExit` (reset when they leave it). */
  count: number;
  /** The exit the runner is being counted at, or -1. */
  countExit: number;
  countStatus: ExitCountStatus;
  /** The late exits have opened, and the one-minute whistle has gone. */
  lateOpened: boolean;
  warned: boolean;
  outcome: RunOutcome;
}

/** What a run needs from the session: the rules, who the runner and the squad are, and the run's places. */
export interface ExtractionContext {
  rules: ExtractionRules;
  /** The character whose extraction ends the run (the player). */
  runner: number;
  squadTeam: number;
  /** The run's insertion: the squad's spawn points, and the end its lanes and dead zones count as. */
  insertion: readonly SpawnPoint[];
  insertionEnd: number;
  /** Where the home team starts, one per opponent (see pickOpponentStarts). */
  opponentStarts: readonly SpawnPoint[];
  /** The map's exits. */
  exits: readonly ExitZone[];
  /** A squad member comes back this long after the hit (s): when the hit call ends (HitConfig.callTime). */
  respawnAfter: number;
  /** Characters stand this far above a spawn's floor point (the physics rest gap). */
  spawnLift: number;
}

export function createRunState(): RunState {
  return { exits: [], respawnsUsed: [], count: 0, countExit: -1, countStatus: 'idle', lateOpened: false, warned: false, outcome: 'none' };
}

/** Horizontal distance from `a` to `b`. */
function flat(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Exits that stay closed for a run from `insertion`: any within `minDistance` of one of its spawn points. */
export function exitClosedFor(exit: ExitZone, insertion: readonly SpawnPoint[], minDistance: number): boolean {
  return insertion.some((s) => flat(s.position, exit.position) < minDistance);
}

/** The run's first state: its exits (closed near the insertion, late ones shut), nobody counted, nothing used. */
export function resetRun(run: RunState, ctx: ExtractionContext, characterCount: number): void {
  run.exits = ctx.exits.map((e) => {
    const closed = exitClosedFor(e, ctx.insertion, ctx.rules.minExitDistance);
    const late = e.late ?? false;
    return { name: e.name, position: vec3(e.position.x, e.position.y, e.position.z), radius: e.radius, late, closed, open: !closed && !late };
  });
  run.respawnsUsed = new Array<number>(characterCount).fill(0);
  run.count = 0;
  run.countExit = -1;
  run.countStatus = 'idle';
  run.lateOpened = false;
  run.warned = false;
  run.outcome = 'none';
}

/**
 * Puts the squad at the insertion (the middle of its line when the squad is smaller, as placeTeams does) and the home
 * team at its starts, each with its end (dead zones, lanes), then respawns everyone there.
 */
export function placeRun(characters: readonly Character[], ctx: ExtractionContext): void {
  let squad = 0;
  for (const c of characters) if (c.team === ctx.squadTeam) squad++;
  let slot = Math.max(0, Math.floor((ctx.insertion.length - squad) / 2));
  let start = 0;
  for (const c of characters) {
    const home = c.team !== ctx.squadTeam;
    c.end = home ? 1 - ctx.insertionEnd : ctx.insertionEnd;
    const s = home ? ctx.opponentStarts[start++] : ctx.insertion[slot++];
    if (s) {
      c.spawnPosition.x = s.position.x;
      c.spawnPosition.y = s.position.y + ctx.spawnLift;
      c.spawnPosition.z = s.position.z;
      c.spawnYaw = s.yaw;
    }
    respawnCharacter(c);
  }
}

/**
 * The home team's starts for a run: the `count` spots farthest from the insertion (by its first spawn point), so
 * nobody starts on top of the squad. Map data tests check every map has enough of them.
 */
export function pickOpponentStarts(starts: readonly SpawnPoint[], insertion: readonly SpawnPoint[], count: number): SpawnPoint[] {
  const from = insertion[0]?.position ?? vec3();
  return [...starts].sort((a, b) => flat(b.position, from) - flat(a.position, from)).slice(0, count);
}

/** Who runs and how, for createRunContext. */
export interface RunSetup {
  /** Squad members, the runner included (1–3). */
  squad: number;
  /** The run's own seed stream (core/seed.ts runSeed): it picks the insertion. */
  seed: number;
  runner: number;
  squadTeam: number;
  respawnAfter: number;
  spawnLift: number;
  rules?: ExtractionRules;
}

/**
 * A run's places on a map with Extraction `data`: the insertion picked from the run's seed, the home team's starts
 * (base + squad of them) far from it, and the exits.
 */
export function createRunContext(data: ExtractionData, setup: RunSetup): ExtractionContext {
  const rng = createRng(setup.seed);
  const insertion = data.insertions[Math.floor(rngNext(rng) * data.insertions.length)] ?? data.insertions[0]!;
  return {
    rules: setup.rules ?? EXTRACTION,
    runner: setup.runner,
    squadTeam: setup.squadTeam,
    insertion: insertion.spawns,
    insertionEnd: insertion.end,
    opponentStarts: pickOpponentStarts(data.opponentStarts, insertion.spawns, data.baseOpponents + setup.squad),
    exits: data.exits,
    respawnAfter: setup.respawnAfter,
    spawnLift: setup.spawnLift,
  };
}

/** The open exit `c` stands in (within its radius, about its floor's height), or -1. */
export function exitAt(run: RunState, c: Character, heightReach: number): number {
  for (let i = 0; i < run.exits.length; i++) {
    const e = run.exits[i]!;
    if (e.open && flat(c.position, e.position) <= e.radius && Math.abs(c.position.y - e.position.y) <= heightReach) return i;
  }
  return -1;
}

/** Vertical reach of an exit zone (m): about a storey, so a dock above an exit isn't in it. */
const EXIT_HEIGHT_REACH = 1;

/**
 * One tick of the run, after the round clock has moved (`clock`: seconds left): the late exits, the one-minute
 * whistle, squad respawns, the runner's exit count. Returns how the run ended this tick, or 'none'.
 */
export function stepRun(run: RunState, characters: readonly Character[], ctx: ExtractionContext, clock: number, events: GameEvent[], dt: number): RunOutcome {
  if (run.outcome !== 'none') return run.outcome;
  const rules = ctx.rules;
  if (!run.lateOpened && clock <= rules.lateExitAt) {
    run.lateOpened = true;
    for (let i = 0; i < run.exits.length; i++) {
      const e = run.exits[i]!;
      if (!e.late || e.closed) continue;
      e.open = true;
      events.push({ type: 'exitOpened', exit: i });
    }
  }
  if (!run.warned && clock <= rules.warnAt) {
    run.warned = true;
    events.push({ type: 'runWarning', secondsLeft: rules.warnAt });
  }

  let runner: Character | undefined;
  for (const c of characters) {
    if (c.id === ctx.runner) runner = c;
    if (c.team !== ctx.squadTeam || isInPlay(c) || c.status === 'out') continue;
    // Back at the insertion the moment the hit call ends; a walk-off never starts (owner, 2026-10-04).
    if (c.status === 'calling' && c.statusTime < ctx.respawnAfter) continue;
    const used = run.respawnsUsed[c.id] ?? 0;
    if (used >= rules.respawns) {
      if (c.id === ctx.runner) return endRun(run, 'out');
      continue;
    }
    run.respawnsUsed[c.id] = used + 1;
    respawnCharacter(c);
    events.push({ type: 'respawned', characterId: c.id, respawnsLeft: rules.respawns - used - 1 });
  }

  if (runner && isInPlay(runner)) stepCount(run, runner, characters, ctx, events, dt);
  else clearCount(run);
  if (run.count >= rules.extractTime) return endRun(run, 'extracted');
  if (clock <= 0) return endRun(run, 'time');
  return 'none';
}

/** Respawns `c` has left this run (0 for anyone outside the squad). */
export function respawnsLeft(run: RunState, c: Character, ctx: Pick<ExtractionContext, 'rules' | 'squadTeam'>): number {
  if (c.team !== ctx.squadTeam) return 0;
  return Math.max(0, ctx.rules.respawns - (run.respawnsUsed[c.id] ?? 0));
}

function endRun(run: RunState, outcome: RunOutcome): RunOutcome {
  run.outcome = outcome;
  clearCount(run);
  return outcome;
}

function clearCount(run: RunState): void {
  run.count = 0;
  run.countExit = -1;
  run.countStatus = 'idle';
}

/** The runner's count at the exit they stand in: reset on leaving it, paused while an opponent in play is in it too. */
function stepCount(run: RunState, runner: Character, characters: readonly Character[], ctx: ExtractionContext, events: GameEvent[], dt: number): void {
  const at = exitAt(run, runner, EXIT_HEIGHT_REACH);
  if (at < 0) {
    clearCount(run);
    return;
  }
  if (at !== run.countExit) {
    run.count = 0;
    run.countExit = at;
  }
  const exit = run.exits[at]!;
  let contested = false;
  for (const c of characters) {
    if (c.team === ctx.squadTeam || !isInPlay(c)) continue;
    if (flat(c.position, exit.position) <= exit.radius && Math.abs(c.position.y - exit.position.y) <= EXIT_HEIGHT_REACH) {
      contested = true;
      break;
    }
  }
  if (contested) {
    run.countStatus = 'paused';
    return;
  }
  run.countStatus = 'counting';
  const step = ctx.rules.countStep;
  const before = Math.floor(run.count / step);
  run.count = Math.min(ctx.rules.extractTime, run.count + dt);
  const after = Math.floor(run.count / step);
  if (after !== before) events.push({ type: 'exitCount', exit: at, secondsLeft: Math.max(0, Math.ceil(ctx.rules.extractTime - run.count - 1e-9)) });
}
