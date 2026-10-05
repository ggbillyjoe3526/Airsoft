import { beforeAll, describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createBBPool } from '../sim/ballistics';
import { type Character, createCharacter, eyeHeight } from '../sim/character';
import { isInPlay, stepElimination } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import { createRunContext, regenClear } from '../sim/extraction';
import { createRng, rngNext } from '../sim/rng';
import { createRoundState, type RoundContext, type RoundRules, startRun, stepRound } from '../sim/round';
import { vec3 } from '../sim/vec';
import { DEPOT, DEPOT_LAYOUT } from './depot';

/**
 * Depot's regen points (M45, acceptance 2) against random squads: seeded walkable positions over the real level
 * (Rapier's world as the game sees it), standing or crouched, on the ground or up on the dock. Whatever a squad does,
 * a regen point a wave uses is far enough from every member and out of their sight, and one is nearly always free.
 */
const X = DEPOT.extraction!;
const CTX = { squadTeam: 0, spawnLift: PHYSICS.groundRestGap, rules: EXTRACTION };
const SAMPLES = 3000;
/** Three members spread over the whole field can see most points between them: a few in a thousand leave a wave waiting. */
const MOST_FREE = 0.005;
const LIFT = PHYSICS.groundRestGap;

let physics: PhysicsWorld;
const nav = buildNavGrid(DEPOT, NAV);
const eyeRay = vec3();

/** A walkable spot on the ground or on the dock, uniformly over the field (a seeded draw). */
function walkableSpot(rng: ReturnType<typeof createRng>): { x: number; y: number; z: number } {
  for (;;) {
    const x = (rngNext(rng) * 2 - 1) * DEPOT_LAYOUT.halfX;
    const z = (rngNext(rng) * 2 - 1) * DEPOT_LAYOUT.halfZ;
    const y = rngNext(rng) < 0.25 ? DEPOT_LAYOUT.dockHeight : 0;
    if (isWalkableAt(nav, x, y, z)) return { x, y, z };
  }
}

function squadAt(rng: ReturnType<typeof createRng>, size: number): Character[] {
  return Array.from({ length: size }, (_, id) => {
    const p = walkableSpot(rng);
    const c = createCharacter(id, vec3(p.x, p.y + LIFT, p.z), 0, LOADOUT, 0);
    c.crouchAmount = rngNext(rng) < 0.3 ? 1 : 0;
    return c;
  });
}

/** The brief's rule, spelled out with the level's own ray: not within regenDistance, no line from any eye to chest or head. */
function meetsRule(r: { position: { x: number; y: number; z: number } }, squad: readonly Character[]): boolean {
  for (const c of squad) {
    if (Math.hypot(c.position.x - r.position.x, c.position.z - r.position.z) < X.regenDistance) return false;
    const eye = vec3(c.position.x, c.position.y + eyeHeight(c.crouchAmount, BODY), c.position.z);
    for (const share of EXTRACTION.regenSeenAt) {
      eyeRay.x = r.position.x - eye.x;
      eyeRay.y = r.position.y + LIFT + share * BODY.height - eye.y;
      eyeRay.z = r.position.z - eye.z;
      const d = Math.hypot(eyeRay.x, eyeRay.y, eyeRay.z);
      eyeRay.x /= d;
      eyeRay.y /= d;
      eyeRay.z /= d;
      if (physics.raycastStatic(eye, eyeRay, d) < 0) return false;
    }
  }
  return true;
}

describe('Depot regen points against random squads (M45)', () => {
  beforeAll(async () => {
    await initPhysics();
    physics = new PhysicsWorld(DEPOT, BODY, 1 / 60);
  });

  const waves = () => ({ regens: X.regens, regenDistance: X.regenDistance, every: 75, cap: 5, lateExtra: 1, lateFrom: 0, sight: { query: physics, body: BODY } });

  it('calls a regen point clear only when it is 15 m from every member and unseen by all of them', () => {
    const rng = createRng(4501);
    let clear = 0;
    for (let n = 0; n < SAMPLES; n++) {
      const squad = squadAt(rng, 1 + (n % 3));
      for (const r of X.regens) {
        const ok = regenClear(r, squad, CTX, waves());
        if (ok) clear++;
        expect(ok, `sample ${n} regen ${JSON.stringify(r.position)}`).toBe(meetsRule(r, squad));
      }
    }
    // The sampling must exercise both answers.
    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(SAMPLES * X.regens.length);
  });

  it('leaves a regen point free wherever a squad of up to three stands', () => {
    const rng = createRng(4502);
    const none: string[] = [];
    for (let n = 0; n < SAMPLES; n++) {
      const squad = squadAt(rng, 1 + (n % 3));
      if (!X.regens.some((r) => regenClear(r, squad, CTX, waves()))) none.push(squad.map((c) => `(${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)} c${c.crouchAmount})`).join(' '));
    }
    expect(none.length / SAMPLES, `squads with no usable point: ${none.slice(0, 3).join(' | ')}`).toBeLessThanOrEqual(MOST_FREE);
  });

  it('brings every returner of a run in at a free regen point, out of the squad\u2019s sight, with the squad wherever it stands then', () => {
    const rules: RoundRules = { roundTime: 480, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
    const rng = createRng(4503);
    const squadSize = 2;
    const x = createRunContext(X, { squad: squadSize, seed: 11, runner: 0, squadTeam: 0, respawnAfter: HITS.callTime, spawnLift: LIFT, waveEvery: 15, sight: { query: physics, body: BODY }, deadZones: DEPOT.deadZones });
    const cs = Array.from({ length: squadSize + x.waves!.cap + EXTRACTION.lateExtra }, (_, id) => createCharacter(id, vec3(), 0, LOADOUT, id < squadSize ? 0 : 1));
    const ctx: RoundContext = { rules, spawns: [], spawnLift: LIFT, extraction: x };
    const round = createRoundState(rules, 'extraction');
    startRun(round, cs, ctx);
    const squad = cs.filter((c) => c.team === 0);
    const home = cs.filter((c) => c.team === 1);
    const bbs = createBBPool(4);
    const events: GameEvent[] = [];
    let returns = 0;
    let most = 0;
    for (let tick = 0; tick < 240 * 60 && round.phase === 'live'; tick++) {
      if (tick % 240 === 0) {
        // Every four seconds the squad is somewhere else, and whoever of the home team is in play is hit.
        for (const c of squad) {
          const p = walkableSpot(rng);
          c.position.x = p.x;
          c.position.y = p.y + LIFT;
          c.position.z = p.z;
          c.crouchAmount = rngNext(rng) < 0.3 ? 1 : 0;
        }
        for (const c of home) if (isInPlay(c) && rngNext(rng) < 0.7) c.status = 'calling';
      }
      for (const c of cs) stepElimination(c, HITS, 1 / 60);
      events.length = 0;
      stepRound(round, cs, bbs, ctx, events, 1 / 60);
      for (const e of events) {
        if (e.type !== 'returned') continue;
        returns++;
        const c = cs[e.characterId]!;
        const regen = X.regens.find((r) => r.position.x === c.position.x && r.position.z === c.position.z);
        expect(regen, `Orange ${c.id} came back on a regen point`).toBeDefined();
        expect(meetsRule(regen!, squad), `tick ${tick}: Orange ${c.id} at ${JSON.stringify(regen!.position)}`).toBe(true);
      }
      most = Math.max(most, home.filter(isInPlay).length);
    }
    expect(returns).toBeGreaterThan(20);
    expect(most).toBeLessThanOrEqual(x.waves!.cap + EXTRACTION.lateExtra);
  });
});
