import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { SQUAD_ORDERS } from '../config/squad';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter, respawnCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { vec3, wrapAngle } from '../sim/vec';
import { BotController } from './botController';

const DT = 1 / 60;

beforeAll(async () => {
  await initPhysics();
});

/**
 * Squad orders on the open field with real physics: you (Blue, not a bot) at (-30, 0, 20) with two Blue bots beside
 * you, and one Orange player standing still far off that nobody sees (bots look 20 m here).
 */
function squad() {
  const physics = new PhysicsWorld(OPEN_FIELD, BODY, DT);
  const state = createGameState(5, BALLISTICS.maxBBs, ROUNDS);
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: OPEN_FIELD.killY,
    hits: HITS,
    deadZones: [[{ position: vec3(-45, 0, 45), yaw: 0 }], [{ position: vec3(45, 0, -45), yaw: 0 }]],
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
  const spots = [vec3(-30, 0, 20), vec3(-32, 0, 23), vec3(-28, 0, 23), vec3(40, 0, -40)];
  spots.forEach((p, id) => {
    const c = createCharacter(id, vec3(p.x, PHYSICS.groundRestGap, p.z), 0, LOADOUT, id < 3 ? 0 : 1);
    respawnCharacter(c, LOADOUT);
    c.position = vec3(p.x, PHYSICS.groundRestGap, p.z);
    state.characters.push(c);
    physics.addCharacter(c);
  });
  const [you, ...rest] = state.characters;
  const commands = new Map<number, PlayerCommand>([[0, createCommand()]]);
  // Orange is one player standing still far off (not a bot), so nobody fights.
  const bots = new BotController(state, rest.filter((c) => c.team === 0), commands, {
    query: physics,
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    lanes: OPEN_FIELD.lanes,
    lowCover: [],
    tallCover: [],
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: { ...BOTS, viewDistance: 20 },
    seed: 5,
  });
  const cmd = commands.get(0)!;
  const mates = bots.bots;
  const run = (seconds: number, onTick: () => void = () => {}) => {
    for (let i = 0; i < seconds / DT; i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      onTick();
    }
  };
  // Wait out the start of the round standing still.
  run(0.5);
  return { state, you: you!, bots, mates, cmd, run, commands };
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** Yaw that looks along +x. */
const EAST = -Math.PI / 2;

describe('squad orders (M22)', () => {
  it('follow me: teammates keep up behind you as you move, then stop and cover your back', () => {
    const { you, bots, mates, cmd, run } = squad();
    cmd.yaw = EAST;
    run(0.1);
    expect(bots.giveOrder(you, 'follow')).toBe('follow');
    expect(bots.orderOf(you)).toBe('follow');
    cmd.forward = 1;
    let worst = 0;
    run(10, () => {
      for (const b of mates) worst = Math.max(worst, flat(b.character.position, you.position));
    });
    expect(you.position.x).toBeGreaterThan(5); // you went a long way east
    // Never left far behind, and they end up behind you, not in front.
    expect(worst).toBeLessThan(SQUAD_ORDERS.catchUp + 3);
    cmd.forward = 0;
    run(4);
    for (const b of mates) {
      const d = flat(b.character.position, you.position);
      expect(d).toBeGreaterThan(1.5);
      expect(d).toBeLessThan(SQUAD_ORDERS.followDistance + SQUAD_ORDERS.followArrive + 1);
      expect(b.character.position.x).toBeLessThan(you.position.x);
      expect(b.mode).toBe('order');
    }
    // Once there, one looks back the way you came (west) and the other to a side: someone covers your back.
    const looks = mates.map((b) => Math.abs(wrapAngle(b.character.yaw - EAST)));
    expect(Math.max(...looks)).toBeGreaterThan(Math.PI * 0.75);
    expect(Math.min(...looks)).toBeGreaterThan(Math.PI * 0.35);
    // They are two, at different spots.
    expect(flat(mates[0]!.character.position, mates[1]!.character.position)).toBeGreaterThan(1);
  });

  it('hold here: teammates go to the spot you look at, side by side, look your way and stay when you leave', () => {
    const { you, bots, mates, cmd, run } = squad();
    cmd.yaw = EAST;
    cmd.pitch = -0.2;
    run(0.3);
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    // The spot is on the line you look along, where it meets the ground.
    const eyeHeight = BODY.standEyeHeight;
    const expected = you.position.x + eyeHeight / Math.tan(0.2);
    run(6);
    cmd.yaw = 0;
    cmd.pitch = 0;
    cmd.forward = 1;
    run(3);
    for (const b of mates) {
      const p = b.character.position;
      expect(p.x).toBeGreaterThan(expected - 2);
      expect(p.x).toBeLessThan(expected + 1.5);
      expect(Math.abs(p.z - 20)).toBeLessThan(SQUAD_ORDERS.holdSpacing + 0.5);
      expect(Math.abs(wrapAngle(b.character.yaw - EAST))).toBeLessThan(0.4);
    }
    expect(flat(mates[0]!.character.position, mates[1]!.character.position)).toBeGreaterThan(SQUAD_ORDERS.holdSpacing - 0.6);
  });

  it('hold here looking at nothing nearby: each holds where it stands', () => {
    const { you, bots, mates, cmd, run } = squad();
    cmd.yaw = EAST;
    cmd.pitch = 0.3; // at the sky
    run(0.3);
    const before = mates.map((b) => ({ ...b.character.position }));
    bots.giveOrder(you, 'hold');
    cmd.forward = 1;
    run(4);
    mates.forEach((b, i) => expect(flat(b.character.position, before[i]!)).toBeLessThan(1));
  });

  it('regroup: teammates sprint back to you, then follow', () => {
    const { you, bots, mates, cmd, run, commands } = squad();
    cmd.yaw = EAST;
    cmd.pitch = -0.2;
    run(0.3);
    bots.giveOrder(you, 'hold');
    run(5);
    // Walk on well past them, then call them back.
    cmd.pitch = 0;
    cmd.forward = 1;
    run(7);
    cmd.forward = 0;
    run(0.5);
    expect(Math.min(...mates.map((b) => flat(b.character.position, you.position)))).toBeGreaterThan(18);
    expect(bots.giveOrder(you, 'regroup')).toBe('regroup');
    let sprinted = false;
    run(10, () => {
      for (const b of mates) sprinted ||= commands.get(b.character.id)!.sprint;
    });
    expect(sprinted).toBe(true);
    for (const b of mates) expect(flat(b.character.position, you.position)).toBeLessThan(SQUAD_ORDERS.followDistance + SQUAD_ORDERS.followRowGap + 2);
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('the same order again cancels it; hold here again moves the hold only when you look somewhere else', () => {
    const { you, bots, cmd, run } = squad();
    cmd.yaw = EAST;
    cmd.pitch = -0.2;
    run(0.3);
    expect(bots.giveOrder(you, 'follow')).toBe('follow');
    expect(bots.giveOrder(you, 'follow')).toBe('none');
    expect(bots.orderOf(you)).toBe('none');
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    // Looking somewhere well away: the hold moves.
    cmd.yaw = 0;
    run(0.3);
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    // The same spot again: cancelled.
    expect(bots.giveOrder(you, 'hold')).toBe('none');
    // Another order replaces the one in force.
    bots.giveOrder(you, 'hold');
    expect(bots.giveOrder(you, 'regroup')).toBe('regroup');
  });

  it('end when you are hit or the round starts again, and bots go back to their team plan', () => {
    const { state, you, bots, mates, run } = squad();
    bots.giveOrder(you, 'follow');
    run(0.5);
    expect(mates.every((b) => b.mode === 'order')).toBe(true);
    you.status = 'out';
    run(0.2);
    expect(bots.orderOf(you)).toBe('none');
    expect(mates.some((b) => b.mode === 'order')).toBe(false);
    expect(bots.giveOrder(you, 'follow')).toBe('none'); // nobody takes orders from someone out
    you.status = 'alive';
    bots.giveOrder(you, 'follow');
    state.events.length = 0;
    state.events.push({ type: 'roundStart', round: 2 });
    bots.observe(state);
    expect(bots.orderOf(you)).toBe('none');
  });
});
