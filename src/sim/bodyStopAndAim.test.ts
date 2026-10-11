import { describe, expect, it } from 'vitest';
import { aimErrorSize } from '../ai/aim';
import { duel } from '../ai/testSupport';
import { BALLISTICS } from '../config/ballistics';
import { BOT_SKILL, type Difficulty } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { FOOTSTEPS } from '../config/footsteps';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { fitOptics } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { createCharacter } from './character';
import { createCommand } from './commands';
import type { GameEvent } from './events';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV, openFieldElimination } from './testSupport';
import { vec3 } from './vec';

/** Extra QA checks for M85 (first body stops the BB) and M84 (aimed spread, Shift creep, bot skill scaling). */
const DT = 1 / 60;
const LEVELS: Difficulty[] = ['easy', 'normal', 'hard', 'pro'];
const DEAD = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]];

/** A BB from a team-0 shooter at the origin, `height` m up, along -Z (optionally tilted); returns who got hit. */
function shoot(targets: { id: number; z: number; crouch?: number; status?: 'calling' }[], height: number, dy = 0) {
  const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
  const characters = [shooter];
  for (const t of targets) {
    const c = createCharacter(t.id, vec3(0, 0, t.z), 0, LOADOUT, 1);
    c.crouchAmount = t.crouch ?? 0;
    characters.push(c);
  }
  const pool = createBBPool(4);
  const dir = vec3(0, dy, -1);
  const len = Math.hypot(dir.y, dir.z);
  dir.y /= len;
  dir.z /= len;
  const bb = spawnBB(pool, 1, vec3(0, height, 0), dir, 88, 0, 0.25e-3);
  const events: GameEvent[] = [];
  const bbTargets: BBTargets = { characters, hits: HITS, elimination: openFieldElimination(DEAD) };
  for (let i = 0; i < 90 && bb.active; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, -10, events, DT, bbTargets);
  return { characters, events, hitIds: events.flatMap((e) => (e.type === 'characterHit' ? [e.victimId] : [])) };
}

describe('M85: a BB stops on a body, and only on a body that is drawn there', () => {
  it('flies over a crouched bot in front and hits the standing bot behind it (the BB meets only what is drawn in its path)', () => {
    // Head-high shot (1.6 m) along the line: the crouched near bot (top ~1.1 m) is below it, the standing one is not.
    const r = shoot([{ id: 2, z: -4, crouch: 1 }, { id: 3, z: -9 }], 1.6);
    expect(r.hitIds).toEqual([3]);
    expect(r.characters[1]!.status).toBe('alive');
  });

  it('a chest-high BB at the nearer of two standing bots hits it, and the second BB at the same line does not reach the one behind', () => {
    const r = shoot([{ id: 2, z: -4 }, { id: 3, z: -9 }], 1.3);
    expect(r.hitIds).toEqual([2]);
    expect(r.characters[2]!.status).toBe('alive');
  });
});

describe('M85 probe: what a BB stopped on a body shows', () => {
  it('reports a plain bbImpact (no characterHit) for a body that is already out, at the body, not at a wall', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const out = createCharacter(2, vec3(0, 0, -5), 0, LOADOUT, 1);
    out.status = 'calling';
    const pool = createBBPool(2);
    const bb = spawnBB(pool, 1, vec3(0, 1.3, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, -10, events, DT, { characters: [shooter, out], hits: HITS, elimination: openFieldElimination(DEAD) });
    const impact = events.find((e) => e.type === 'bbImpact');
    expect(impact).toBeDefined();
    if (impact?.type === 'bbImpact') expect(Math.abs(impact.position.z + 5)).toBeLessThan(0.5);
    expect(events.some((e) => e.type === 'characterHit')).toBe(false);
    // It names the body, so the presentation shows a knock on it, never the floor's concrete dust (M85).
    if (impact?.type === 'bbImpact') expect(impact.bodyId).toBe(2);
  });

  it('a BB that stops on a wall names no body', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const pool = createBBPool(2);
    const bb = spawnBB(pool, 1, vec3(0, 1.3, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, { raycastStatic: (_o, _d, max) => (max > 0.5 ? 0.5 : -1) }, -10, events, DT, { characters: [shooter], hits: HITS, elimination: openFieldElimination(DEAD) });
    const impact = events.find((e) => e.type === 'bbImpact');
    expect(impact?.type === 'bbImpact' && impact.bodyId).toBe(undefined);
  });
});

describe('M84: aimed spread through optics, hip unchanged', () => {
  const floor: CharacterMover = {
    move(c, d, out) {
      out.x = d.x;
      out.z = d.z;
      const y = c.position.y + d.y;
      out.y = y <= 0 ? -c.position.y : d.y;
      return y <= 0;
    },
    probeGround(c, maxDrop) {
      return c.position.y <= maxDrop ? -c.position.y : Number.NaN;
    },
  };
  const RIFLE = LOADOUT.findIndex((r) => r.look.aimHold !== undefined);
  function settledScale(optic: 'redDot' | 'scope2x' | null, aim: boolean): number {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    if (optic) fitOptics(c.armament, LOADOUT.map((_, i) => (i === RIFLE ? optic : null)));
    c.armament.active = RIFLE;
    state.characters.push(c);
    const ctx = createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
    const cmd = createCommand();
    cmd.aim = aim;
    for (let i = 0; i < 180; i++) stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    return c.spreadScale;
  }

  it('halves the still-standing spread by the same factor with iron sights, a red dot and a scope; the hip is untouched', () => {
    const hip = settledScale(null, false);
    expect(hip).toBeCloseTo(MOVEMENT.accuracy.steady, 6);
    for (const optic of [null, 'redDot', 'scope2x'] as const) {
      const aimed = settledScale(optic, true);
      expect(aimed, String(optic)).toBeCloseTo(hip * MOVEMENT.accuracy.aimed, 6);
      expect(aimed, `${optic}: clearly tighter than the hip`).toBeLessThan(hip * 0.75);
      expect(settledScale(optic, false), `${optic} hip`).toBeCloseTo(hip, 6);
    }
  });
});

describe('M84: bot skill still scales with difficulty after aimErrorTracking x 11/9', () => {
  it('tracking error against a strafing target shrinks Easy > Normal > Hard > Pro at every range and speed', () => {
    for (const dist of [4, 10, 25]) {
      for (const sideways of [1, 3, 5]) {
        const e = LEVELS.map((l) => aimErrorSize(10, false, dist, sideways, BOT_SKILL[l]));
        for (let i = 1; i < e.length; i++) expect(e[i]!, `${dist} m, ${sideways} m/s: ${e.join(' ')}`).toBeLessThan(e[i - 1]!);
      }
    }
  });

  it('the tracking constant alone orders Easy > Normal > Hard > Pro, Normal about 11/9 of the old 0.09', () => {
    const t = LEVELS.map((l) => BOT_SKILL[l].aimErrorTracking);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeLessThan(t[i - 1]!);
    expect(BOT_SKILL.normal.aimErrorTracking).toBeCloseTo(0.09 * 11 / 9, 2);
  });

  it('bots never aim down sights, so the aimed multiplier does not make them tighter than their level says', () => {
    const { bot, run } = duel(15, () => {}, undefined, undefined, 3);
    run(3, () => {});
    expect(bot.aiming).toBe(false);
    expect(bot.aimRaise).toBe(0);
  });
});
