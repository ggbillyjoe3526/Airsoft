import { EXTRACTION, type ExtractionRules } from '../config/extraction';
import type { BodyConfig } from '../config/movement';
import type { ExitZone, ExtractionData, SpawnPoint } from '../map/mapTypes';
import type { WorldQuery } from './armament';
import { type Character, eyeHeight, respawnCharacter } from './character';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';
import { refillSpares } from './rangeTargets';
import { createRng, rngNext } from './rng';
import { copy, type Vec3, vec3 } from './vec';

/**
 * Extraction's run (M43): one long "round" against the clock. The squad goes in at an insertion point, and the run ends
 * when the runner (the player) has stood in an open exit for `extractTime` ("extracted"), is hit with no respawn left
 * ("out"), or time runs out ("time": caught out). A hit squad member comes back at the insertion once per run, the
 * moment the hit call ends (owner, 2026-10-04: automatically, no walk back). Exits within `minExitDistance` of the
 * insertion are closed for the run; a late exit opens with `lateExitAt` seconds left. Cases (M44): the runner opens one
 * by holding the Use key beside it (its kind's opening time, making its noise as it goes), and carries what it held;
 * a hit drops all of it as a case where they fell, and it is theirs only if they extract. Waves (M45): hit opponents come
 * back together, every so often or once none is left in play, at regen points out of the squad's sight, up to the
 * run's cap (one more in its last third). Plain data, stepped by sim/round.ts.
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

/** A part found in a case (M44): a pool asset id and its rarity tier id, as the collection stores them. */
export interface FoundItem {
  asset: string;
  tier: string;
}

/**
 * What a case holds (M44, rolled from pool.md's Caches table by pool/caches.ts): Field Credits, a BB resupply (used
 * the moment it is opened: the runner's spare magazines are topped up) and at most one part.
 */
export interface CaseFind {
  fc: number;
  resupply: boolean;
  item: FoundItem | null;
}

/** A case placed for the run: its kind (pool.md's Key), where it stands, how it opens and what it holds. */
export interface CaseSetup {
  kind: string;
  name: string;
  position: Vec3;
  yaw: number;
  /** Seconds the Use key is held to open it. */
  openTime: number;
  /** How far its noise carries while it is opened (m); 0 is silent. */
  heard: number;
  find: CaseFind;
}

/** A case in this run: one placed at the start, or what the runner dropped when hit (`dropped`). */
export interface RunCase {
  kind: string;
  name: string;
  position: Vec3;
  yaw: number;
  openTime: number;
  heard: number;
  /** What it holds: one find for a placed case, everything carried for a dropped one. */
  finds: CaseFind[];
  open: boolean;
  dropped: boolean;
}

/** The kind of a case the runner dropped when hit (no pool.md row: it holds what they carried). */
export const DROPPED_CASE = 'dropped';

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
  /** The run's cases (M44): those placed at the start, then any the runner dropped. */
  cases: RunCase[];
  /** The shut case the runner could open now (within reach), or -1: the HUD's prompt. */
  inReach: number;
  /** The case the runner is opening (holding Use), or -1, and for how long so far (s). */
  opening: number;
  openProgress: number;
  /** Seconds until the case being opened makes its noise again. */
  noiseIn: number;
  /** What the runner carries: theirs if they extract, dropped as a case if they are hit. */
  carried: CaseFind[];
  /** Seconds until the home team's next wave (M45), and whether one is due (waiting for its returners to fit in). */
  waveIn: number;
  waveDue: boolean;
  /** Waves released so far. */
  waves: number;
  /** The regen point the next returner tries first: they take turns, so a wave doesn't come in on one spot. */
  nextRegen: number;
}

/**
 * The home team's waves in a run (M45): where and how often hit opponents come back, and how many may be in play.
 * Without it (a test's run, a map without regen points) a hit opponent stays out.
 */
export interface WaveSetup {
  regens: readonly SpawnPoint[];
  /** A regen point is used only this far (m, horizontal) from every squad member. */
  regenDistance: number;
  /** Seconds between waves (EXTRACTION.waveEvery for the opponents' difficulty). */
  every: number;
  /** Opponents in play at most (base + squad), and how many more once `lateFrom` seconds are left. */
  cap: number;
  lateExtra: number;
  lateFrom: number;
  /** For the out-of-sight check: the world's static surfaces and the body a line of sight runs from and to. */
  sight?: { query: WorldQuery; body: BodyConfig } | undefined;
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
  /** The run's cases, placed and rolled (pool/caches.ts rollRunCases); none on a map without case spots. */
  cases: readonly CaseSetup[];
  /** The home team's waves (M45); without them a hit opponent stays out. */
  waves?: WaveSetup | undefined;
  /**
   * Where the home team's reserve waits until the run's last part (the dead zone at their end): the characters past
   * the run's cap, who join in its waves once `lateFrom` seconds are left.
   */
  reserveAt?: readonly SpawnPoint[] | undefined;
}

export function createRunState(): RunState {
  return {
    exits: [],
    respawnsUsed: [],
    count: 0,
    countExit: -1,
    countStatus: 'idle',
    lateOpened: false,
    warned: false,
    outcome: 'none',
    cases: [],
    inReach: -1,
    opening: -1,
    openProgress: 0,
    noiseIn: 0,
    carried: [],
    waveIn: 0,
    waveDue: false,
    waves: 0,
    nextRegen: 0,
  };
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
  run.cases = ctx.cases.map((c) => ({
    kind: c.kind,
    name: c.name,
    position: vec3(c.position.x, c.position.y, c.position.z),
    yaw: c.yaw,
    openTime: c.openTime,
    heard: c.heard,
    finds: [c.find],
    open: false,
    dropped: false,
  }));
  run.inReach = -1;
  stopOpening(run);
  run.carried = [];
  run.waveIn = ctx.waves?.every ?? 0;
  run.waveDue = false;
  run.waves = 0;
  run.nextRegen = 0;
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
  let reserve = 0;
  for (const c of characters) {
    const home = c.team !== ctx.squadTeam;
    c.end = home ? 1 - ctx.insertionEnd : ctx.insertionEnd;
    // The home team past the run's cap waits as the reserve, out of play in its dead zone, until the last part.
    const reserved = home && ctx.waves !== undefined && start >= ctx.waves.cap;
    const s = reserved ? ctx.reserveAt?.[reserve++ % Math.max(1, ctx.reserveAt.length)] : home ? ctx.opponentStarts[start++] : ctx.insertion[slot++];
    if (s) setSpawn(c, s, ctx.spawnLift);
    respawnCharacter(c);
    if (reserved) {
      c.status = 'out';
      c.statusTime = 0;
      c.deadZoneYaw = c.spawnYaw;
    }
  }
}

function setSpawn(c: Character, s: SpawnPoint, lift: number): void {
  c.spawnPosition.x = s.position.x;
  c.spawnPosition.y = s.position.y + lift;
  c.spawnPosition.z = s.position.z;
  c.spawnYaw = s.yaw;
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
  /** The run's cases (pool/caches.ts rollRunCases), rolled from the same seed; none if absent. */
  cases?: readonly CaseSetup[];
  /**
   * Waves (M45): seconds between them (EXTRACTION.waveEvery for the opponents' difficulty) and what the out-of-sight
   * check sees through; none (hit opponents stay out) if absent or the map has no regen points.
   */
  waveEvery?: number;
  sight?: WaveSetup['sight'];
  /** The map's dead zones, per end: the reserve waits in the home team's. */
  deadZones?: readonly (readonly SpawnPoint[])[];
}

/**
 * A run's places on a map with Extraction `data`: the insertion picked from the run's seed, the home team's starts
 * (base + squad of them) far from it, and the exits.
 */
export function createRunContext(data: ExtractionData, setup: RunSetup): ExtractionContext {
  const rng = createRng(setup.seed);
  const insertion = data.insertions[Math.floor(rngNext(rng) * data.insertions.length)] ?? data.insertions[0]!;
  const rules = setup.rules ?? EXTRACTION;
  const cap = data.baseOpponents + setup.squad;
  const waves: WaveSetup | undefined =
    setup.waveEvery !== undefined && data.regens.length > 0
      ? { regens: data.regens, regenDistance: data.regenDistance, every: setup.waveEvery, cap, lateExtra: rules.lateExtra, lateFrom: data.runTime * rules.lateShare, sight: setup.sight }
      : undefined;
  // The reserve takes the home dead zone's spots from its far end, so hit teammates walking off to its first ones
  // don't stand on it.
  const reserveAt = [...(setup.deadZones?.[1 - insertion.end] ?? [])].reverse();
  return {
    rules,
    runner: setup.runner,
    squadTeam: setup.squadTeam,
    insertion: insertion.spawns,
    insertionEnd: insertion.end,
    opponentStarts: pickOpponentStarts(data.opponentStarts, insertion.spawns, cap),
    exits: data.exits,
    respawnAfter: setup.respawnAfter,
    spawnLift: setup.spawnLift,
    cases: setup.cases ?? [],
    waves,
    reserveAt,
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
  for (const c of characters) if (c.id === ctx.runner) runner = c;
  // Hit: what the runner carries stays where they fell, before the respawn takes them back to the insertion.
  if (runner && !isInPlay(runner) && run.carried.length > 0) dropCarried(run, runner, rules, events);
  for (const c of characters) {
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
  if (ctx.waves) stepWaves(run, characters, ctx, ctx.waves, clock, events, dt);

  if (runner && isInPlay(runner)) {
    stepCases(run, runner, rules, events, dt);
    stepCount(run, runner, characters, ctx, events, dt);
  } else {
    run.inReach = -1;
    stopOpening(run);
    clearCount(run);
  }
  if (run.count >= rules.extractTime) return endRun(run, 'extracted');
  if (clock <= 0) return endRun(run, 'time');
  return 'none';
}

/** Opponents in play at most with `clock` seconds left: the run's cap, and its late extra in the last part. */
export function waveCap(waves: WaveSetup, clock: number): number {
  return waves.cap + (clock <= waves.lateFrom ? waves.lateExtra : 0);
}

/** A hit opponent ready to come back: out of play and done calling the hit (walking off, or out). */
function waiting(c: Character, ctx: ExtractionContext): boolean {
  return c.team !== ctx.squadTeam && !isInPlay(c) && c.status !== 'calling';
}

/**
 * The home team's waves: one is due every `every` seconds (nobody waiting: that wave is empty), or as soon as nobody
 * of theirs is left in play or calling a hit with someone waiting. A due wave brings back those waiting, up to the cap,
 * each at the next regen point that is out of the squad's sight; whoever can't come in yet (no such point free) tries
 * again next tick, until the wave is in.
 */
function stepWaves(run: RunState, characters: readonly Character[], ctx: ExtractionContext, waves: WaveSetup, clock: number, events: GameEvent[], dt: number): void {
  let inPlay = 0;
  let ready = 0;
  let calling = 0;
  for (const c of characters) {
    if (c.team === ctx.squadTeam) continue;
    if (isInPlay(c)) inPlay++;
    else if (c.status === 'calling') calling++;
    else ready++;
  }
  run.waveIn -= dt;
  if (!run.waveDue) {
    const cleared = inPlay === 0 && calling === 0 && ready > 0;
    if (run.waveIn > 0 && !cleared) return;
    run.waveIn = waves.every;
    if (ready === 0) return;
    run.waveDue = true;
    run.waves++;
  }
  const cap = waveCap(waves, clock);
  for (const c of characters) {
    if (inPlay >= cap || ready === 0) break;
    if (!waiting(c, ctx)) continue;
    const at = freeRegen(run, characters, ctx, waves);
    if (!at) break;
    setSpawn(c, at, ctx.spawnLift);
    respawnCharacter(c);
    events.push({ type: 'returned', characterId: c.id });
    inPlay++;
    ready--;
  }
  // In (or as many as fit): the next wave counts from when this one was due.
  if (ready === 0 || inPlay >= cap) run.waveDue = false;
}

/**
 * The next regen point (taking turns from `run.nextRegen`) nobody in play stands on, far enough from and out of sight
 * of the squad, or none.
 */
function freeRegen(run: RunState, characters: readonly Character[], ctx: ExtractionContext, waves: WaveSetup): SpawnPoint | undefined {
  const n = waves.regens.length;
  for (let k = 0; k < n; k++) {
    const i = (run.nextRegen + k) % n;
    const r = waves.regens[i]!;
    if (taken(r, characters, ctx.rules) || !regenClear(r, characters, ctx, waves)) continue;
    run.nextRegen = (i + 1) % n;
    return r;
  }
  return undefined;
}

/** Whether someone in play stands within `regenClearance` of regen point `r`, on its floor (about a storey). */
function taken(r: SpawnPoint, characters: readonly Character[], rules: ExtractionRules): boolean {
  for (const c of characters) {
    if (isInPlay(c) && flat(c.position, r.position) < rules.regenClearance && Math.abs(c.position.y - r.position.y) <= rules.exitHeightReach) return true;
  }
  return false;
}

// Scratch for the out-of-sight check (used only within one call).
const eye = vec3();
const seen = vec3();
const dir = vec3();

/** Whether regen point `r` is at least `regenDistance` from every squad member still on the field and out of their sight. */
export function regenClear(r: SpawnPoint, characters: readonly Character[], ctx: Pick<ExtractionContext, 'squadTeam' | 'spawnLift' | 'rules'>, waves: WaveSetup): boolean {
  for (const c of characters) {
    if (c.team !== ctx.squadTeam || c.status === 'out') continue;
    if (flat(c.position, r.position) < waves.regenDistance) return false;
    const sight = waves.sight;
    if (!sight) continue;
    copy(eye, c.position);
    eye.y += eyeHeight(c.crouchAmount, sight.body);
    for (const share of ctx.rules.regenSeenAt) {
      copy(seen, r.position);
      seen.y += ctx.spawnLift + share * sight.body.height;
      if (lineClear(sight.query, eye, seen)) return false;
    }
  }
  return true;
}

/** True if nothing static stands between `a` and `b`. */
function lineClear(query: WorldQuery, a: Vec3, b: Vec3): boolean {
  dir.x = b.x - a.x;
  dir.y = b.y - a.y;
  dir.z = b.z - a.z;
  const d = Math.hypot(dir.x, dir.y, dir.z);
  if (d < 1e-6) return true;
  dir.x /= d;
  dir.y /= d;
  dir.z /= d;
  return query.raycastStatic(a, dir, d) < 0;
}

/** Respawns `c` has left this run (0 for anyone outside the squad). */
export function respawnsLeft(run: RunState, c: Character, ctx: Pick<ExtractionContext, 'rules' | 'squadTeam'>): number {
  if (c.team !== ctx.squadTeam) return 0;
  return Math.max(0, ctx.rules.respawns - (run.respawnsUsed[c.id] ?? 0));
}

function endRun(run: RunState, outcome: RunOutcome): RunOutcome {
  run.outcome = outcome;
  clearCount(run);
  stopOpening(run);
  run.inReach = -1;
  return outcome;
}

/**
 * The haul (M44): what the runner carried out, once the run ended with them counted out at an exit; nothing for any
 * other end (hit, caught out), so a run that ends otherwise keeps nothing.
 */
export function runHaul(run: RunState): readonly CaseFind[] {
  return run.outcome === 'extracted' ? run.carried : [];
}

/** Everything the runner found this run (each placed case they opened; a BB resupply aside), kept or not. */
export function runFinds(run: RunState): CaseFind[] {
  const out: CaseFind[] = [];
  for (const k of run.cases) if (k.open && !k.dropped) for (const f of k.finds) if (f.fc > 0 || f.item) out.push(f);
  return out;
}

/** The haul's Field Credits and parts, in the order they were found. */
export function haulTotals(finds: readonly CaseFind[]): { fc: number; items: FoundItem[] } {
  let fc = 0;
  const items: FoundItem[] = [];
  for (const f of finds) {
    fc += f.fc;
    if (f.item) items.push(f.item);
  }
  return { fc, items };
}

function stopOpening(run: RunState): void {
  run.opening = -1;
  run.openProgress = 0;
  run.noiseIn = 0;
}

/** Ticks summed to a whole opening time land a hair short of it (1/60 isn't exact): within this, it's done. */
const SUM_SLACK = 1e-9;

/** The nearest shut case within the runner's reach, or -1. */
export function caseInReach(run: RunState, c: Character, rules: Pick<ExtractionRules, 'caseReach' | 'caseHeightReach'>): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < run.cases.length; i++) {
    const k = run.cases[i]!;
    if (k.open || Math.abs(c.position.y - k.position.y) > rules.caseHeightReach) continue;
    const d = flat(c.position, k.position);
    if (d <= rules.caseReach && d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * The runner's Use key on the case in reach: held, it opens over the case's opening time, making its noise at the
 * start and every `caseNoiseEvery` seconds; let go, or out of reach, and the next try starts again. Opened, its finds
 * are carried (a BB resupply is used there and then).
 */
function stepCases(run: RunState, runner: Character, rules: ExtractionRules, events: GameEvent[], dt: number): void {
  const at = caseInReach(run, runner, rules);
  run.inReach = at;
  if (at < 0 || !runner.using) {
    stopOpening(run);
    return;
  }
  const k = run.cases[at]!;
  if (at !== run.opening) {
    run.opening = at;
    run.openProgress = 0;
    run.noiseIn = 0;
  }
  run.openProgress += dt;
  if (run.openProgress < k.openTime - SUM_SLACK) {
    if (k.heard <= 0) return;
    run.noiseIn -= dt;
    if (run.noiseIn > 0) return;
    run.noiseIn += rules.caseNoiseEvery;
    events.push({ type: 'caseNoise', characterId: runner.id, case: at, kind: k.kind, position: k.position, range: k.heard });
    return;
  }
  k.open = true;
  for (const f of k.finds) {
    // A resupply was used where it was found; what you dropped holds only what you carried.
    if (f.resupply && !k.dropped) refillSpares(runner.armament);
    if (f.fc > 0 || f.item) run.carried.push(f);
  }
  stopOpening(run);
  run.inReach = -1;
  events.push({ type: 'caseOpened', characterId: runner.id, case: at, kind: k.kind, position: k.position });
}

/** The runner was hit carrying finds: they stay where the runner fell, as a case to come back for (no opening time). */
function dropCarried(run: RunState, runner: Character, rules: ExtractionRules, events: GameEvent[]): void {
  const position = vec3();
  copy(position, runner.position);
  run.cases.push({ kind: DROPPED_CASE, name: 'Dropped case', position, yaw: runner.yaw, openTime: rules.dropOpenTime, heard: 0, finds: run.carried, open: false, dropped: true });
  run.carried = [];
  stopOpening(run);
  events.push({ type: 'caseDropped', characterId: runner.id, case: run.cases.length - 1 });
}

function clearCount(run: RunState): void {
  run.count = 0;
  run.countExit = -1;
  run.countStatus = 'idle';
}

/** The runner's count at the exit they stand in: reset on leaving it, paused while an opponent in play is in it too. */
function stepCount(run: RunState, runner: Character, characters: readonly Character[], ctx: ExtractionContext, events: GameEvent[], dt: number): void {
  const reach = ctx.rules.exitHeightReach;
  const at = exitAt(run, runner, reach);
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
    if (flat(c.position, exit.position) <= exit.radius && Math.abs(c.position.y - exit.position.y) <= reach) {
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
