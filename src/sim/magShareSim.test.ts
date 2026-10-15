import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { MAG_SHARE } from '../config/magShare';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { spareBBs } from './armament';
import { createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { GameEvent } from './events';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState, type GameState } from './state';
import { OPEN_NAV } from './testSupport';
import { vec3 } from './vec';

/**
 * MG1 criterion 2 through stepSimulation: a `tossMag` command is acted on only while the round is live, the magazine's
 * BBs leave the thrower's spare at once and land in the catcher's after the flight, a round decided meanwhile loses it,
 * and two runs of one seed with a toss are identical.
 */

const DT = 1 / 60;
const openSky = { raycastStatic: () => -1 };
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

/** Three on Blue (ids 0, 1, 2) 4 m apart and an Orange far off (id 3), so the round stays live. */
function match(seed = 9) {
  const state = createGameState(seed, BALLISTICS.maxBBs, ROUNDS);
  const spots = [vec3(0, 0, 0), vec3(4, 0, 0), vec3(0, 0, 4), vec3(60, 0, 60)];
  spots.forEach((p, id) => state.characters.push(createCharacter(id, p, 0, LOADOUT, id < 3 ? 0 : 1)));
  const ctx = createSimContext({
    mover: floor,
    query: openSky,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    killY: -10,
    hits: HITS,
    deadZones: [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]],
    rounds: ROUNDS,
    nav: OPEN_NAV,
    navSnap: NAV.snap,
  });
  const commands = new Map<number, PlayerCommand>(state.characters.map((c) => [c.id, createCommand()]));
  const events: GameEvent[] = [];
  /** One tick; `toss` as [thrower, catcher] puts a tossMag in that thrower's command for this tick only. */
  const tick = (toss?: [number, number]) => {
    for (const cmd of commands.values()) cmd.tossMag = -1;
    if (toss) commands.get(toss[0])!.tossMag = toss[1];
    stepSimulation(state, commands, ctx, DT);
    events.push(...state.events.filter((e) => e.type.startsWith('mag')));
  };
  return { state, tick, events, c: state.characters };
}

const bbsOf = (s: GameState, slot = 0) => s.characters.filter((c) => c.team === 0).reduce((n, c) => n + c.armament.ammo[slot]!.mag + spareBBs(c.armament.ammo[slot]!), 0);

describe('MG1: a tossMag command through stepSimulation', () => {
  it('takes the BBs out of the thrower at once and lands them in the catcher after the flight, none made', () => {
    const m = match();
    const [giver, catcher] = [m.c[0]!, m.c[1]!];
    catcher.armament.ammo[0]!.pouch.fill(0);
    const before = bbsOf(m.state);
    m.tick([0, 1]);
    expect(m.events).toEqual([{ type: 'magToss', fromId: 0, toId: 1, bbs: AEG.magSize, replicaId: AEG.id }]);
    expect(bbsOf(m.state)).toBe(before - AEG.magSize); // in the air
    expect(spareBBs(giver.armament.ammo[0]!)).toBe(2 * AEG.magSize); // one of its three spares gone
    expect(spareBBs(catcher.armament.ammo[0]!)).toBe(0);
    const flight = m.state.magTosses.find((t) => t.active)!.flight;
    for (let i = 0; i < flight / DT + 2 && m.events.length < 2; i++) m.tick();
    expect(m.events.map((e) => e.type)).toEqual(['magToss', 'magCaught']);
    expect(spareBBs(catcher.armament.ammo[0]!)).toBe(AEG.magSize);
    expect(bbsOf(m.state)).toBe(before);
    expect(m.state.magTosses.every((t) => !t.active)).toBe(true);
  });

  it('does nothing in a round that is not live', () => {
    const m = match();
    m.c[1]!.armament.ammo[0]!.pouch.fill(0);
    m.state.round.phase = 'matchOver';
    const before = bbsOf(m.state);
    m.tick([0, 1]);
    expect(m.events).toEqual([]);
    expect(bbsOf(m.state)).toBe(before);
    expect(m.state.magTosses.every((t) => !t.active)).toBe(true);
  });

  it('loses the magazine in the air when the round is decided meanwhile', () => {
    const m = match();
    m.c[1]!.armament.ammo[0]!.pouch.fill(0);
    const before = bbsOf(m.state);
    m.tick([0, 1]);
    m.state.round.phase = 'matchOver';
    m.tick();
    expect(m.events.map((e) => e.type)).toEqual(['magToss', 'magLost']);
    expect(bbsOf(m.state)).toBe(before - AEG.magSize);
    expect(spareBBs(m.c[1]!.armament.ammo[0]!)).toBe(0);
  });

  it('tosses a pistol magazine only, into the pistol spares, for a catcher with the pistol in hand', () => {
    const m = match();
    const catcher = m.c[1]!;
    catcher.armament.active = 1;
    catcher.armament.ammo[1]!.pouch.fill(0);
    const rifleBefore = bbsOf(m.state, 0);
    m.tick([0, 1]);
    expect(m.events[0]).toEqual({ type: 'magToss', fromId: 0, toId: 1, bbs: GAS_PISTOL.magSize, replicaId: GAS_PISTOL.id });
    expect(m.state.magTosses.find((t) => t.active)!.slot).toBe(1);
    for (let i = 0; i < 600 && m.events.length < 2; i++) m.tick();
    expect(m.events[1]).toMatchObject({ type: 'magCaught', bbs: GAS_PISTOL.magSize, replicaId: GAS_PISTOL.id });
    expect(spareBBs(catcher.armament.ammo[1]!)).toBe(GAS_PISTOL.magSize);
    expect(bbsOf(m.state, 0)).toBe(rifleBefore); // no rifle BB moved
  });

  it('is refused for a catcher out of reach, and for a toss at an enemy', () => {
    const m = match();
    m.c[1]!.armament.ammo[0]!.pouch.fill(0);
    m.c[1]!.position.x = MAG_SHARE.tossRange + 3;
    m.c[3]!.armament.ammo[0]!.pouch.fill(0);
    m.c[3]!.position = vec3(3, 0, 0);
    m.tick([0, 1]);
    m.tick([0, 3]);
    expect(m.events).toEqual([]);
  });

  it('is deterministic: two runs of one seed with a toss end in the same state', () => {
    const run = () => {
      const m = match(33);
      m.c[1]!.armament.ammo[0]!.pouch.fill(0);
      for (let i = 0; i < 240; i++) m.tick(i === 5 ? [0, 1] : undefined);
      return JSON.stringify({ t: m.state.time, chars: m.state.characters, tosses: m.state.magTosses, events: m.events, rng: m.state.rng });
    };
    const a = run();
    expect(a).toContain('magCaught');
    expect(run()).toBe(a);
  });
});
