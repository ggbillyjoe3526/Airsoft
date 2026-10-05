import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_SKILL, type Difficulty } from '../config/bots';
import { HITS } from '../config/hits';
import { PHYSICS } from '../config/physics';
import { DEPOT_LAYOUT } from '../map/depot';
import { isWalkableAt } from '../nav/navGrid';
import { initPhysics } from '../physics/physicsWorld';
import { createCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { wrapAngle } from '../sim/vec';
import type { Bot } from './bot';
import { moveBot } from './botMovement';
import { DT } from './depotMatchSupport';
import { setUpRun } from './extractionRunSupport';
import { lineClear } from './perception';

/**
 * The home team's jobs in an Extraction run (M46), headless on Depot with real physics: you (a ghost, standing where the
 * test puts you) and your squad against guards, patrols and hunters.
 */
const cfg = BOT_BEHAVIOUR;
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const home = (bots: readonly Bot[]) => bots.filter((b) => b.character.team === 1);

/** A run whose locker stands outside the insertion's berth (so it is guarded), from the first seed that has one. */
function runWithGuardedLocker(opponents: Difficulty = 'normal', squad = 3) {
  for (let seed = 1; seed < 40; seed++) {
    const r = setUpRun({ seed, opponents, squad });
    const centre = r.run.insertion.reduce((s, p) => ({ x: s.x + p.position.x / r.run.insertion.length, z: s.z + p.position.z / r.run.insertion.length }), { x: 0, z: 0 });
    const locker = r.state.round.run.cases.findIndex((k) => k.kind === 'locker');
    if (locker >= 0 && flat(r.state.round.run.cases[locker]!.position, centre) >= cfg.insertionBerth) return { ...r, locker, centre };
    r.dispose();
  }
  throw new Error('no seed with the locker away from the insertion');
}

describe('Extraction: the home team’s jobs (M46)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('posts lockerGuards on the locker, at cover near it facing the way in, and sends the rest round the other cases in pairs', () => {
    const r = runWithGuardedLocker();
    const cases = r.state.round.run.cases;
    const team = home(r.bots.bots).filter((b) => isInPlay(b.character));
    expect(team.every((b) => b.role !== 'none')).toBe(true);
    const guards = team.filter((b) => b.role === 'guard' && b.guardCase === r.locker);
    expect(guards).toHaveLength(BOT_SKILL.normal.lockerGuards);
    const locker = cases[r.locker]!;
    for (const g of guards) {
      expect(flat(g.post, locker.position)).toBeLessThanOrEqual(cfg.guardPostRadius + 0.5);
      // Facing out from the case's front, the way in.
      expect(Math.cos(wrapAngle(g.postYaw - locker.yaw))).toBeGreaterThan(0);
    }
    // The two guards hold apart.
    expect(flat(guards[0]!.post, guards[1]!.post)).toBeGreaterThan(1);
    const patrols = team.filter((b) => b.role === 'patrol');
    expect(patrols.length).toBeGreaterThan(0);
    for (const p of patrols) {
      // A round of the shut cases nobody guards, none by the insertion.
      for (const i of p.patrol!.cases) {
        expect(team.some((b) => b.role === 'guard' && b.guardCase === i)).toBe(false);
        expect(flat(cases[i]!.position, r.centre)).toBeGreaterThanOrEqual(cfg.insertionBerth);
      }
      if (p.patrolPartner) {
        expect(p.patrolPartner.patrolPartner).toBe(p);
        expect(p.patrolPartner.patrol).toBe(p.patrol);
      }
    }
    // Pairs: at most one patrol walks alone.
    expect(patrols.filter((p) => !p.patrolPartner).length).toBeLessThanOrEqual(1);
    r.dispose();
  });

  it('keeps a guard leashed: a noise beyond guardLeash of its case is watched from the post, one within it is searched', () => {
    const r = runWithGuardedLocker();
    r.play(20);
    const locker = r.state.round.run.cases[r.locker]!;
    const guard = home(r.bots.bots).find((b) => b.role === 'guard' && b.guardCase === r.locker && isInPlay(b.character) && b.mode === 'advance')!;
    expect(guard).toBeDefined();
    // Settled at its post, holding.
    expect(flat(guard.character.position, guard.post)).toBeLessThan(cfg.coverArrive + 0.3);
    const hearAt = (d: number) => {
      // Heard something d metres from the case, back the way in.
      guard.lastKnown.x = locker.position.x - Math.sin(locker.yaw) * d;
      guard.lastKnown.y = locker.position.y;
      guard.lastKnown.z = locker.position.z - Math.cos(locker.yaw) * d;
      guard.hasLastKnown = true;
      guard.heardAt = r.state.time;
    };
    hearAt(cfg.guardLeash + 4);
    r.play(0.2);
    expect(guard.mode).toBe('advance');
    expect(flat(guard.character.position, guard.post)).toBeLessThan(cfg.coverArrive + 0.3);
    hearAt(cfg.guardLeash - 3);
    r.play(0.2);
    expect(guard.mode).toBe('search');
    r.dispose();
  });

  it('walks the patrols round their cases, the two of a pair keeping together', () => {
    const r = runWithGuardedLocker('normal', 2);
    const patrols = home(r.bots.bots).filter((b) => b.role === 'patrol' && b.patrolPartner);
    expect(patrols.length).toBeGreaterThanOrEqual(2);
    const reached = new Set<string>();
    let together = 0;
    let both = 0;
    r.play(60, () => {
      for (const p of patrols) {
        if (p.role !== 'patrol' || !isInPlay(p.character)) continue;
        p.patrol!.stops.forEach((s, i) => {
          if (flat(p.character.position, s) < cfg.laneJitter + 1) reached.add(`${p.character.id}:${i}`);
        });
        const mate = p.patrolPartner;
        if (!mate || !isInPlay(mate.character) || p.mode !== 'advance' || mate.mode !== 'advance') continue;
        both++;
        if (flat(p.character.position, mate.character.position) <= cfg.patrolPairGap + 4) together++;
      }
    });
    // Each patrol got round at least two stops.
    for (const p of patrols) expect([...reached].filter((k) => k.startsWith(`${p.character.id}:`)).length, `Red ${p.character.id}`).toBeGreaterThanOrEqual(2);
    expect(together / Math.max(1, both)).toBeGreaterThan(0.7);
    r.dispose();
  });

  it('turns the patrols into hunters at huntersFrom of the run, who make for the latest news of the squad', () => {
    const r = runWithGuardedLocker();
    const runTime = r.state.round.clock;
    r.play(1);
    expect(home(r.bots.bots).some((b) => b.role === 'hunter')).toBe(false);
    // Just past halfway (Normal's huntersFrom).
    r.state.round.clock = runTime * (1 - BOT_SKILL.normal.huntersFrom!) - 0.1;
    r.play(DT);
    const team = home(r.bots.bots);
    expect(team.some((b) => b.role === 'patrol')).toBe(false);
    const hunters = team.filter((b) => b.role === 'hunter' && isInPlay(b.character));
    expect(hunters.length).toBeGreaterThan(0);
    // The guards stay on their case.
    expect(team.filter((b) => b.role === 'guard' && b.guardCase === r.locker).length).toBeGreaterThan(0);
    // A guard hears the squad at the locker's door: the hunters' next goal is there.
    const guard = team.find((b) => b.role === 'guard' && isInPlay(b.character))!;
    const news = { x: r.you.position.x, y: r.you.position.y, z: r.you.position.z };
    guard.lastKnown.x = news.x;
    guard.lastKnown.y = news.y;
    guard.lastKnown.z = news.z;
    guard.hasLastKnown = true;
    guard.heardAt = r.state.time;
    r.play(1);
    for (const h of hunters) {
      if (!isInPlay(h.character) || h.mode !== 'advance') continue;
      expect(flat(h.huntGoal, news), `Red ${h.character.id}`).toBeLessThan(0.01);
    }
    r.dispose();
  });

  it('never sends hunters on Easy', () => {
    const r = runWithGuardedLocker('easy');
    r.state.round.clock = 1;
    r.play(DT);
    expect(home(r.bots.bots).some((b) => b.role === 'hunter')).toBe(false);
    r.dispose();
  });

  it('has a hunter push in a fight, closing in while it sidesteps until pushDistance off', () => {
    const r = runWithGuardedLocker();
    const w = r.bots.worldForTests;
    const b = home(r.bots.bots).find((x) => isInPlay(x.character))!;
    const you = r.you;
    // A clear straight stretch of open ground along x: you at its west end, the bot along it to the east, facing you.
    const span = cfg.pushDistance + 4;
    const eye = (x: number, z: number) => ({ x, y: 1.6, z });
    let x0 = Number.NaN;
    let z = 0;
    for (let zz = -DEPOT_LAYOUT.halfZ + 2; zz < DEPOT_LAYOUT.halfZ - 2 && Number.isNaN(x0); zz += 1) {
      for (let x = -DEPOT_LAYOUT.halfX + 2; x + span < DEPOT_LAYOUT.halfX - 2 && Number.isNaN(x0); x += 0.5) {
        let open = lineClear(w.query, eye(x, zz), eye(x + span, zz));
        for (let d = 0; d <= span && open; d += 0.5) open = isWalkableAt(w.nav, x + d, 0, zz);
        if (open) {
          x0 = x;
          z = zz;
        }
      }
    }
    expect(Number.isNaN(x0)).toBe(false);
    const from = { x: x0, y: 0, z };
    const out = 1;
    const put = (d: number) => {
      const c = b.character;
      c.position.x = from.x + out * d;
      c.position.y = PHYSICS.groundRestGap;
      c.position.z = from.z;
      c.prevPosition.x = c.position.x;
      c.prevPosition.z = c.position.z;
      b.aim.yaw = Math.atan2(out, 0); // looking back at you (-sin yaw = -out along x)
    };
    r.moveYou(from);
    b.mode = 'fight';
    b.targetVisible = true;
    b.targetId = you.id;
    b.fromCover = false;
    const cmd = createCommand();
    const forwardAt = (d: number, role: Bot['role']) => {
      put(d);
      b.role = role;
      b.strafeLeft = 1; // no new sidestep drawn
      cmd.forward = 0;
      cmd.right = 0;
      moveBot(b, w, cmd, DT, you);
      return cmd.forward;
    };
    expect(forwardAt(cfg.pushDistance + 3, 'hunter')).toBe(cfg.strafeInput);
    expect(forwardAt(cfg.pushDistance + 3, 'patrol')).not.toBe(cfg.strafeInput);
    expect(forwardAt(cfg.pushDistance - 2, 'hunter')).not.toBe(cfg.strafeInput);
    r.dispose();
  });

  it('fills an empty guard’s place with the next one back in a wave, and moves a guard on once its case is opened', () => {
    const r = runWithGuardedLocker();
    r.play(1);
    const run = r.state.round.run;
    const guard = home(r.bots.bots).find((b) => b.role === 'guard' && b.guardCase === r.locker)!;
    r.hitThem(guard.character);
    r.play(HITS.callTime + 0.2);
    run.waveIn = 0;
    let back: Bot | undefined;
    r.play(10, () => {
      for (const e of r.state.events) if (e.type === 'returned' && !back) back = r.bots.bots.find((b) => b.character.id === e.characterId);
    });
    expect(back).toBeDefined();
    expect(back!.role).toBe('guard');
    expect(back!.guardCase).toBe(r.locker);
    // You open the locker (a ghost: its guards can't stop you).
    const locker = run.cases[r.locker]!;
    r.moveYou({ x: locker.position.x - Math.sin(locker.yaw) * 0.9, y: locker.position.y, z: locker.position.z - Math.cos(locker.yaw) * 0.9 });
    r.yours.use = true;
    r.play(locker.openTime + 0.3);
    r.yours.use = false;
    expect(locker.open).toBe(true);
    for (const b of home(r.bots.bots)) if (isInPlay(b.character)) expect(b.role === 'guard' && b.guardCase === r.locker, `Red ${b.character.id}`).toBe(false);
    r.dispose();
  });

  it('has your bot teammates cover you from close by, watching behind you, while you open a case', () => {
    const r = runWithGuardedLocker('normal', 3);
    r.play(2);
    const run = r.state.round.run;
    // The shut case nearest you (by the insertion, where nobody guards).
    let at = 0;
    for (let i = 1; i < run.cases.length; i++) if (flat(run.cases[i]!.position, r.you.position) < flat(run.cases[at]!.position, r.you.position)) at = i;
    const k = run.cases[at]!;
    r.moveYou({ x: k.position.x - Math.sin(k.yaw) * 0.9, y: k.position.y, z: k.position.z - Math.cos(k.yaw) * 0.9 });
    // Facing the case; your teammates catch up first.
    r.yours.yaw = wrapAngle(k.yaw + Math.PI);
    r.play(4);
    r.yours.use = true;
    const mates = r.bots.bots.filter((b) => b.character.team === 0);
    r.play(k.openTime - 0.2);
    expect(run.opening).toBe(at);
    for (const m of mates) {
      if (!isInPlay(m.character) || m.mode !== 'order') continue;
      expect(m.orderCovering).toBe(true);
      expect(flat(m.character.position, r.you.position), `Blue ${m.character.id}`).toBeLessThanOrEqual(cfg.openCoverRadius + 1);
      // Watching behind you, to its slot's side.
      const watch = cfg.openWatchDeg[m.orderSlot % cfg.openWatchDeg.length]!;
      expect(Math.abs(wrapAngle(m.orderYaw - r.you.yaw - (watch * Math.PI) / 180))).toBeLessThan(1e-6);
    }
    r.yours.use = false;
    r.play(0.5);
    for (const m of mates) if (m.mode === 'order') expect(m.orderCovering).toBe(false);
    r.dispose();
  });
});
