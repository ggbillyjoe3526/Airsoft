import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_SKILL, BOTS, type Difficulty } from '../config/bots';
import { EXTRACTION } from '../config/extraction';
import { HITS, ROUNDS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { type Vec3, vec3, wrapAngle } from '../sim/vec';
import { type Bot, type BotWorld, createBot, holdYaw, resetBot } from './bot';
import { DT, playMatch } from './depotMatchSupport';
import { setUpRun } from './extractionRunSupport';
import { endOrder, startOrder } from './squadOrders';

/**
 * M46's edges, beside extractionRoles.test.ts: nothing changes outside Extraction, Easy's smaller team, the hunting clock's
 * boundaries per level, the berth round the insertion, the facing of a guard, and what resets and ends clear.
 */
const cfg = BOT_BEHAVIOUR;
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const home = (bots: readonly Bot[]) => bots.filter((b) => b.character.team === 1);
const centreOf = (pts: readonly { position: Vec3 }[]) => ({ x: pts.reduce((s, p) => s + p.position.x / pts.length, 0), z: pts.reduce((s, p) => s + p.position.z / pts.length, 0) });

/** A run with a locker outside the berth (so it is guarded), from the first seed that has one. */
function guardedRun(opponents: Difficulty) {
  for (let seed = 1; seed < 40; seed++) {
    const r = setUpRun({ seed, opponents, squad: 3 });
    const c = centreOf(r.run.insertion);
    const locker = r.state.round.run.cases.findIndex((k) => k.kind === 'locker');
    if (locker >= 0 && flat(r.state.round.run.cases[locker]!.position, c) >= cfg.insertionBerth) return { ...r, locker };
    r.dispose();
  }
  throw new Error('no seed with a guarded locker');
}

/** `b`, a hit home-team bot, back from the next wave: its job (the run's own events say when it is back). */
function backInWave(r: ReturnType<typeof guardedRun>, hit: Bot): Bot {
  r.hitThem(hit.character);
  r.play(HITS.callTime + 0.2);
  r.state.round.run.waveIn = 0;
  let back: Bot | undefined;
  r.play(10, () => {
    for (const e of r.state.events) if (e.type === 'returned' && e.characterId === hit.character.id) back = hit;
  });
  expect(back).toBeDefined();
  return back!;
}

describe('Extraction: M46 edges', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('gives no bot a role, and the controller no run jobs, in Elimination and Attack / Defend matches', () => {
    for (const mode of ['elimination', 'attackDefend'] as const) {
      const seen = new Set<string>();
      const out = vec3();
      let news = 0;
      let bots = 0;
      playMatch(6, 3, undefined, BOTS, mode, ROUNDS, DEPOT, ROUNDS.teamSize, HITS, (_state, ctl) => {
        for (const b of ctl.bots) {
          seen.add(b.role);
          bots++;
          // Nothing is hunted by news of a squad: there is none.
          if (ctl.worldForTests.squadNews(b.character.team, out) !== Number.NEGATIVE_INFINITY) news++;
          expect(b.guardCase).toBe(-1);
          expect(b.patrol).toBeUndefined();
        }
      });
      expect(bots, mode).toBeGreaterThan(0);
      expect([...seen], mode).toEqual(['none']);
      expect(news, mode).toBe(0);
    }
  });

  it('puts one guard on the locker at Easy and never a hunter, however late in the run, even for a bot back in a wave', () => {
    const r = guardedRun('easy');
    expect(BOT_SKILL.easy.lockerGuards).toBe(1);
    expect(BOT_SKILL.easy.huntersFrom).toBeNull();
    expect(home(r.bots.bots).filter((b) => b.role === 'guard' && b.guardCase === r.locker)).toHaveLength(1);
    const runTime = r.state.round.clock;
    r.state.round.clock = runTime * 0.05;
    r.play(DT);
    expect(home(r.bots.bots).some((b) => b.role === 'hunter')).toBe(false);
    const patrol = home(r.bots.bots).find((b) => b.role === 'patrol' && isInPlay(b.character))!;
    const back = backInWave(r, patrol);
    expect(back.role).not.toBe('hunter');
    expect(home(r.bots.bots).some((b) => b.role === 'hunter')).toBe(false);
    r.dispose();
  });

  it.each(['normal', 'hard', 'pro'] as const)('starts hunting at %s only once huntersFrom of the run is gone, and a bot back in a wave then hunts', (level) => {
    const r = guardedRun(level);
    const from = BOT_SKILL[level].huntersFrom!;
    const runTime = r.state.round.clock;
    // A little short of it: still patrolling.
    r.state.round.clock = runTime * (1 - from) + 1;
    r.play(DT);
    expect(home(r.bots.bots).some((b) => b.role === 'hunter'), 'before').toBe(false);
    expect(home(r.bots.bots).some((b) => b.role === 'patrol')).toBe(true);
    r.state.round.clock = runTime * (1 - from) - 0.1;
    r.play(DT);
    expect(home(r.bots.bots).some((b) => b.role === 'patrol'), 'after').toBe(false);
    expect(home(r.bots.bots).some((b) => b.role === 'hunter')).toBe(true);
    // One of them hit and back: hunting too (the guards' places are full).
    const hunter = home(r.bots.bots).find((b) => b.role === 'hunter' && isInPlay(b.character))!;
    expect(backInWave(r, hunter).role).toBe('hunter');
    r.dispose();
  });

  it('never guards nor patrols a case within insertionBerth of the squad’s insertion, the locker included', () => {
    let within = 0;
    let lockerWithin = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = setUpRun({ seed });
      const c = centreOf(r.run.insertion);
      const cases = r.state.round.run.cases;
      const near = cases.map((k) => flat(k.position, c) < cfg.insertionBerth);
      const team = home(r.bots.bots);
      near.forEach((n, i) => {
        if (!n) return;
        within++;
        if (cases[i]!.kind === 'locker') lockerWithin++;
        expect(
          team.some((b) => b.role === 'guard' && b.guardCase === i),
          `seed ${seed} case ${i} guarded`,
        ).toBe(false);
        expect(
          team.some((b) => b.patrol?.cases.includes(i)),
          `seed ${seed} case ${i} patrolled`,
        ).toBe(false);
      });
      // The rest still have their jobs: a bot only goes without if it is in the reserve (not in play yet).
      for (const b of team) if (isInPlay(b.character)) expect(b.role, `seed ${seed}`).not.toBe('none');
      r.dispose();
    }
    // The seeds do put a case (and, in some, the locker) by the door, so this is a real check.
    expect(within).toBeGreaterThan(0);
    expect(lockerWithin).toBeGreaterThan(0);
  });

  it('has a guard at its post face the way into its case (postYaw), not the enemy side', () => {
    const r = guardedRun('normal');
    r.play(20);
    const guard = home(r.bots.bots).find((b) => b.role === 'guard' && b.guardCase === r.locker && isInPlay(b.character) && b.mode === 'advance' && b.holding)!;
    expect(guard).toBeDefined();
    // Looking along postYaw, give or take the hold sweep (the sweep is centred on it).
    expect(Math.abs(wrapAngle(guard.character.yaw - guard.postYaw))).toBeLessThanOrEqual((cfg.holdSweepDeg * Math.PI) / 180 + 0.2);
    expect(holdYaw(guard, r.bots.worldForTests)).toBe(guard.postYaw);
    r.dispose();
  });

  it('holdYaw: a guard’s post yaw, anyone else the enemy’s side', () => {
    const w = { enemyYaw: [1.25, -2.5] } as unknown as BotWorld;
    const mk = (team: number) => createBot(createCharacter(team, vec3(), 0, LOADOUT, team), 1, cfg, BOT_SKILL.normal);
    const b = mk(1);
    b.postYaw = 0.5;
    for (const role of ['none', 'patrol', 'hunter'] as const) {
      b.role = role;
      expect(holdYaw(b, w), role).toBe(-2.5);
    }
    b.role = 'guard';
    expect(holdYaw(b, w)).toBe(0.5);
    const blue = mk(0);
    expect(holdYaw(blue, w)).toBe(1.25);
    // No yaw for the team: 0, as before.
    expect(holdYaw(mk(5), w)).toBe(0);
  });

  it('resetBot clears a bot’s run job and what it had taken from the news; a fresh bot has none', () => {
    const b = createBot(createCharacter(1, vec3(), 0, LOADOUT, 1), 1, cfg, BOT_SKILL.normal);
    expect(b.role).toBe('none');
    expect(b.guardCase).toBe(-1);
    const mate = createBot(createCharacter(2, vec3(), 0, LOADOUT, 1), 1, cfg, BOT_SKILL.normal);
    b.role = 'patrol';
    b.guardCase = 3;
    b.patrol = { stops: [vec3()], cases: [0] };
    b.patrolIndex = 2;
    b.patrolPartner = mate;
    b.newsTaken = 40;
    b.orderCovering = true;
    resetBot(b, -1, 0, cfg);
    expect(b.role).toBe('none');
    expect(b.guardCase).toBe(-1);
    expect(b.patrol).toBeUndefined();
    expect(b.patrolIndex).toBe(-1);
    expect(b.patrolPartner).toBeUndefined();
    expect(b.newsTaken).toBe(Number.NEGATIVE_INFINITY);
    expect(b.orderCovering).toBe(false);
  });

  it('clears orderCovering when a new order starts or the order ends', () => {
    const leader = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const b = createBot(createCharacter(1, vec3(), 0, LOADOUT, 0), 1, cfg, BOT_SKILL.normal);
    b.orderCovering = true;
    startOrder(b, leader, 'follow', 1);
    expect(b.orderCovering).toBe(false);
    b.orderCovering = true;
    endOrder(b, { round: { mode: 'extraction' } } as unknown as BotWorld);
    expect(b.orderCovering).toBe(false);
  });

  it('has no teammate cover you while you hold Use where there is no case to open', () => {
    const r = guardedRun('normal');
    r.play(3);
    const run = r.state.round.run;
    // On the insertion's middle, out of reach of every case (the guards ignore a ghost): Use opens nothing.
    const spot = centreOf(r.run.insertion);
    for (const k of run.cases) expect(flat(k.position, spot)).toBeGreaterThan(EXTRACTION.caseReach + 1);
    r.moveYou({ x: spot.x, y: r.run.insertion[0]!.position.y, z: spot.z });
    r.play(3);
    expect(r.bots.orderOf(r.you)).toBe('follow');
    r.yours.use = true;
    let ordered = 0;
    let covering = 0;
    r.play(2, () => {
      for (const b of r.bots.bots) {
        if (b.character.team !== 0 || b.character === r.you) continue;
        if (b.mode === 'order') ordered++;
        if (b.orderCovering) covering++;
      }
    });
    expect(r.you.using).toBe(true);
    expect(run.opening).toBe(-1);
    expect(ordered).toBeGreaterThan(0);
    expect(covering).toBe(0);
    r.dispose();
  });
});
