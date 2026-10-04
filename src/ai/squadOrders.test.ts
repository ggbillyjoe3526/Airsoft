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
import { DEPOT } from '../map/depot';
import { RAMP_YARD } from '../map/testYard';
import type { MapData } from '../map/mapTypes';
import { buildNavGrid, clearLine, dropOnLine, floorAt, isWalkableAt, type NavGrid } from '../nav/navGrid';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { vec3, wrapAngle } from '../sim/vec';
import { BotController } from './botController';
import type { Bot, BotWorld } from './bot';
import { createBot } from './bot';
import { followSpot, heldCentre, moveOrder, placeHold, startOrder } from './squadOrders';

const DT = 1 / 60;

beforeAll(async () => {
  await initPhysics();
});

/**
 * Squad orders on the open field (or `map`, with its nav grid `nav`) with real physics: you (Blue, not a bot) at
 * (-30, 0, 20) with two Blue bots beside you, and one Orange player standing still far off that nobody sees (bots look
 * 20 m here).
 */
function squad(map: MapData = OPEN_FIELD, nav: NavGrid = OPEN_NAV) {
  const physics = new PhysicsWorld(map, BODY, DT);
  const state = createGameState(5, BALLISTICS.maxBBs, ROUNDS);
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: map.killY,
    hits: HITS,
    deadZones: [[{ position: vec3(-45, 0, 45), yaw: 0 }], [{ position: vec3(45, 0, -45), yaw: 0 }]],
    nav,
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
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
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
  it('the order wheel (M23) picking the order in force keeps it; its key again cancels it; cancelOrder ends it', () => {
    const { you, bots, run } = squad();
    run(0.1);
    expect(bots.giveOrder(you, 'follow')).toBe('follow');
    expect(bots.giveOrder(you, 'follow', false)).toBe('follow');
    expect(bots.orderOf(you)).toBe('follow');
    expect(bots.giveOrder(you, 'follow')).toBe('none');
    expect(bots.giveOrder(you, 'regroup')).toBe('regroup');
    bots.cancelOrder(you);
    expect(bots.orderOf(you)).toBe('none');
  });

  it('follow me: teammates keep up behind you as you move, then stop and cover your back', () => {
    const { you, bots, mates, cmd, run } = squad();
    cmd.yaw = EAST;
    run(0.1);
    expect(bots.giveOrder(you, 'follow')).toBe('follow');
    expect(bots.orderOf(you)).toBe('follow');
    cmd.forward = 1;
    let worst = 0;
    let ticks = 0;
    let watched = 0;
    run(10, () => {
      for (const b of mates) worst = Math.max(worst, flat(b.character.position, you.position));
      // Someone keeps looking back the way you came on the move too (once settled in behind you).
      if (++ticks > 2 / DT) watched += mates.some((b) => Math.abs(wrapAngle(b.character.yaw - EAST - Math.PI)) < Math.PI / 3) ? 1 : 0;
    });
    expect(watched / (ticks - 2 / DT)).toBeGreaterThan(0.6);
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

  /**
   * You go east at `pace` for `seconds` with Follow me given (zigzagging 0.8 rad either way every 1.5 s if `turn`).
   * Returns, per teammate, the longest run of ticks it stood still and how far behind you it was on average once
   * settled in behind you (after 3 s: one starting ahead of its spot waits for it), and how often its sprint turned on
   * or off.
   */
  function followAlong(pace: 'walk' | 'run' | 'sprint', seconds: number, turn = false) {
    const { bots, mates, you, cmd, run, commands } = squad();
    cmd.yaw = EAST;
    run(0.1);
    bots.giveOrder(you, 'follow');
    cmd.forward = 1;
    cmd.walk = pace === 'walk';
    cmd.sprint = pace === 'sprint';
    const stood = mates.map(() => 0);
    const longestStand = mates.map(() => 0);
    const behind = mates.map(() => 0);
    const flips = mates.map(() => 0);
    const sprinted = mates.map(() => false);
    let t = 0;
    let settled = 0;
    run(seconds, () => {
      t += DT;
      if (turn) cmd.yaw = EAST + (Math.floor(t / 1.5) % 2 === 0 ? 0.4 : -0.4);
      mates.forEach((b, i) => {
        const moving = Math.hypot(b.character.velocity.x, b.character.velocity.z) > 0.5;
        stood[i] = moving ? 0 : stood[i]! + 1;
        if (t > 3) longestStand[i] = Math.max(longestStand[i]!, stood[i]!);
        if (t > 3) behind[i]! += flat(b.character.position, you.position);
        const s = commands.get(b.character.id)!.sprint;
        if (s !== sprinted[i]) flips[i]!++;
        sprinted[i] = s;
      });
      if (t > 3) settled++;
    });
    return { longestStand, meanBehind: behind.map((d) => d / settled), flips };
  }

  it('follow me: teammates keep moving with you at your pace, walking, running or sprinting, a few metres back', () => {
    for (const pace of ['walk', 'run', 'sprint'] as const) {
      const r = followAlong(pace, pace === 'sprint' ? 7 : 9);
      for (const n of r.longestStand) expect(n, pace).toBeLessThanOrEqual(6); // never a stop-and-go
      for (const d of r.meanBehind) {
        expect(d, pace).toBeGreaterThan(SQUAD_ORDERS.followDistance - 1);
        expect(d, pace).toBeLessThan(SQUAD_ORDERS.followDistance + SQUAD_ORDERS.catchUpGap + 1);
      }
      // Sprinting along with you: on once, and off no more than once or twice, even as you weave.
      if (pace === 'sprint') for (const f of [...r.flips, ...followAlong('sprint', 7, true).flips]) expect(f).toBeLessThanOrEqual(3);
      else for (const f of r.flips) expect(f, pace).toBeLessThanOrEqual(2);
    }
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
    // Each where it stands: no one spot to mark.
    expect(bots.holdSpot(you, vec3())).toBe(false);
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
    // The HUD's order (orderOf) reads Regroup until every teammate is back, never flipping between the two.
    let flips = 0;
    let last = bots.orderOf(you);
    run(10, () => {
      for (const b of mates) sprinted ||= commands.get(b.character.id)!.sprint;
      if (bots.orderOf(you) !== last) flips++;
      last = bots.orderOf(you);
    });
    expect(flips).toBe(1);
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
    const spot = vec3(0, 9, 0);
    expect(bots.holdSpot(you, spot)).toBe(true);
    expect(spot.y).toBeCloseTo(0, 1); // on the floor, not left at whatever it was
    expect(flat(spot, you.position)).toBeGreaterThan(3);
    // The same spot again: cancelled.
    expect(bots.giveOrder(you, 'hold')).toBe('none');
    expect(bots.holdSpot(you, vec3())).toBe(false);
    // Holding a spot you looked at, Hold here at the sky holds where they stand; at the sky again, cancelled.
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    cmd.pitch = 0.3;
    run(0.3);
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    expect(bots.giveOrder(you, 'hold')).toBe('none');
    cmd.pitch = -0.2;
    run(0.3);
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

  it('marks a hold on a raised floor at that floor, not the ground (the middle of the held spots)', () => {
    const leader = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const holder = (x: number, y: number) => ({ order: 'hold', orderLeader: leader, orderGoal: vec3(x, y, 4) }) as unknown as Bot;
    const out = vec3(0, -5, 0);
    expect(heldCentre([holder(1, 1.2), holder(3, 1.2)], leader, out)).toBe(true);
    expect(out).toEqual({ x: 2, y: 1.2, z: 4 });
    expect(heldCentre([], leader, out)).toBe(false);
  });

  it('follow me in a corridor too narrow for the side spots: straight behind you, never inside you', () => {
    // A 3 m wide corridor along x: walls at z = -1.5 and z = 1.5.
    const corridor = buildNavGrid(
      {
        ...OPEN_FIELD,
        blocks: [
          ...OPEN_FIELD.blocks,
          { kind: 'wall', center: vec3(0, 1.5, -2), size: vec3(100, 3, 1) },
          { kind: 'wall', center: vec3(0, 1.5, 2), size: vec3(100, 3, 1) },
        ],
      },
      NAV,
    );
    const w = { nav: corridor } as unknown as BotWorld;
    const leader = createCharacter(0, vec3(0, PHYSICS.groundRestGap, 0), 0, LOADOUT, 0);
    leader.position = vec3(0, 0, 0);
    const out = vec3();
    for (const slot of [0, 1]) {
      followSpot(leader, EAST, slot, w, out);
      // Walking east, the spot is behind (west of) you at the follow distance, in the middle of the corridor.
      expect(out.x).toBeCloseTo(-SQUAD_ORDERS.followDistance, 1);
      expect(Math.abs(out.z)).toBeLessThan(0.01);
    }
    // In the open the side spots stand.
    followSpot(leader, EAST, 0, { nav: OPEN_NAV } as unknown as BotWorld, out);
    expect(Math.abs(out.z)).toBeGreaterThan(1.5);
  });

  /** The open field with a thin (0.4 m) wall along x at z 18.6-19.0, from x -40 to 40: walkable floor either side. */
  const THIN_WALL: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, { kind: 'wall', center: vec3(0, 1.5, 18.8), size: vec3(80, 3, 0.4) }] };
  const THIN_WALL_NAV = buildNavGrid(THIN_WALL, NAV);

  it('follow me beside a thin wall: no spot on its far side, so nobody detours round it (M-05)', () => {
    // A side spot 3.2 m back at 40° would be 2.1 m to the side: through the wall, on walkable floor.
    const w = { nav: THIN_WALL_NAV } as unknown as BotWorld;
    const leader = createCharacter(0, vec3(), 0, LOADOUT, 0);
    for (const z of [20, 19.3]) {
      // 19.3: you touching the wall, inside the margin the nav grid keeps from it.
      leader.position = vec3(0, 0, z);
      expect(isWalkableAt(THIN_WALL_NAV, 0, 17.9), 'floor beyond the wall').toBe(true);
      for (const slot of [0, 1]) {
        const out = followSpot(leader, EAST, slot, w, vec3());
        expect(out.z, `slot ${slot} at z ${z}`).toBeGreaterThan(19);
        expect(out.x, `slot ${slot} at z ${z}`).toBeLessThan(-1); // still behind you, not at you
        expect(clearLine(THIN_WALL_NAV, 0, 20, out.x, out.z)).toBe(true);
      }
    }
    // Walking east along the wall: both followers stay on your side of it and never take a long way round.
    const { you, bots, mates, cmd, run } = squad(THIN_WALL, THIN_WALL_NAV);
    cmd.yaw = EAST;
    run(0.1);
    bots.giveOrder(you, 'follow');
    cmd.forward = 1;
    let worstDetour = 0;
    run(10, () => {
      expect(you.position.z).toBeGreaterThan(19);
      for (const b of mates) {
        const p = b.character.position;
        expect(p.z).toBeGreaterThan(19);
        if (b.routeState !== 'ok' || b.routeLeg >= b.route.length) continue;
        let length = 0;
        let from: { x: number; z: number } = p;
        for (let i = b.routeLeg; i < b.route.length; i++) {
          length += flat(from, b.route[i]!);
          from = b.route[i]!;
        }
        worstDetour = Math.max(worstDetour, length / Math.max(1, flat(p, from)));
      }
    });
    expect(you.position.x).toBeGreaterThan(5);
    expect(worstDetour).toBeLessThan(1.5);
    for (const b of mates) expect(flat(b.character.position, you.position)).toBeLessThan(SQUAD_ORDERS.catchUp);
  });

  it('hold here beside a thin wall: a side spot beyond it falls back to the point (M-05)', () => {
    // You look east at a point at z 18 just short of the wall; three hold spots across your view, 1.4 m apart in z.
    const w = { nav: THIN_WALL_NAV } as unknown as BotWorld;
    const leader = createCharacter(0, vec3(), EAST, LOADOUT, 0);
    leader.yaw = EAST;
    const point = vec3(0, 0, 18.1);
    expect(isWalkableAt(THIN_WALL_NAV, point.x, point.z)).toBe(true);
    expect(isWalkableAt(THIN_WALL_NAV, point.x, point.z + SQUAD_ORDERS.holdSpacing)).toBe(true); // beyond the wall
    const holders = [0, 1, 2].map(() => ({ orderGoal: vec3(), character: leader }) as unknown as Bot);
    placeHold(holders, leader, point, w);
    for (const b of holders) {
      expect(b.orderGoal.z).toBeLessThan(18.6);
      expect(clearLine(THIN_WALL_NAV, point.x, point.z, b.orderGoal.x, b.orderGoal.z)).toBe(true);
    }
    // In the open the same spots spread out on both sides.
    placeHold(holders, leader, point, { nav: OPEN_NAV } as unknown as BotWorld);
    expect(Math.max(...holders.map((b) => b.orderGoal.z))).toBeCloseTo(point.z + SQUAD_ORDERS.holdSpacing, 5);
  });

  it('follow me and hold here on a ramp, and while you jump: spots along the slope, never at you (bug pass)', () => {
    // Depot's west dock ramp runs up east from x -4.4 to -2 at z about -14 (a 1:2 slope).
    const nav = buildNavGrid(DEPOT, NAV);
    const w = { nav } as unknown as BotWorld;
    const leader = createCharacter(0, vec3(), EAST, LOADOUT, 0);
    for (const x of [-3.6, -3.2, -2.6]) {
      leader.position = vec3(x, floorAt(nav, x, -14), -14);
      expect(leader.position.y, 'on the slope').toBeGreaterThan(0.1);
      for (const slot of [0, 1]) {
        const out = followSpot(leader, EAST, slot, w, vec3());
        expect(flat(out, leader.position), `slot ${slot} at x ${x}`).toBeGreaterThan(2);
        expect(out.y).toBeCloseTo(floorAt(nav, out.x, out.z), 5); // on the floor there, not at your height
      }
    }
    // In the air over open ground: the same spots as standing there.
    leader.position = vec3(10, 0, 0);
    const standing = followSpot(leader, EAST, 0, w, vec3());
    leader.position.y = 0.4;
    const jumping = followSpot(leader, EAST, 0, w, vec3());
    expect(flat(standing, leader.position)).toBeGreaterThan(2);
    expect(jumping).toEqual(standing);
    // Hold here at a point on the ramp, looking north across the slope: two spots apart, each on the floor there.
    leader.yaw = 0;
    const point = vec3(-3.2, floorAt(nav, -3.2, -14.4), -14.4);
    const holders = [0, 1].map(() => ({ orderGoal: vec3(), character: leader }) as unknown as Bot);
    placeHold(holders, leader, point, w);
    expect(flat(holders[0]!.orderGoal, holders[1]!.orderGoal)).toBeCloseTo(SQUAD_ORDERS.holdSpacing, 5);
    for (const b of holders) expect(b.orderGoal.y).toBeCloseTo(floorAt(nav, b.orderGoal.x, b.orderGoal.z), 5);
  });

  it('follow me at a platform lip: spots stay up on your level or on you, never on the ground below (bug pass)', () => {
    // Ramp Yard's platform is 1 m up and ends at x 6 away from the ramps (|z| > 1.5): an open drop to the ground.
    const nav = buildNavGrid(RAMP_YARD, NAV);
    const w = { nav } as unknown as BotWorld;
    const leader = createCharacter(0, vec3(), EAST, LOADOUT, 0);
    leader.grounded = true;
    let snapped = 0;
    // Looking back west across the platform, the spots behind you are past the drop: measured from the nearest walkable
    // cell, which at the lip can be on the ground, they were down there.
    for (const heading of [EAST, -EAST, 0, Math.PI]) for (const x of [5.7, 5.8, 5.9, 6.0, 6.1, 6.2, 6.3]) {
      leader.position = vec3(x, 1, 5);
      if (!isWalkableAt(nav, x, 5)) snapped++;
      for (const slot of [0, 1, 2, 3]) {
        const out = followSpot(leader, heading, slot, w, vec3());
        const onYou = out.x === leader.position.x && out.y === leader.position.y && out.z === leader.position.z;
        if (!onYou) expect(floorAt(nav, out.x, out.z), `slot ${slot} at x ${x} heading ${heading}`).toBeGreaterThan(0.9);
      }
    }
    expect(snapped, 'the lip is inside the margin the nav grid keeps from the drop').toBeGreaterThan(0);
  });

  it('follow me steers by the line it checked when the blended direction runs off a drop (M-08)', () => {
    // You run east at 5 m/s; the follower stands 1 m to the side of its spot (away from you), with a pit just east of
    // it. Pursuit (your velocity plus a pull to the spot) points mostly east, over the edge; the line to the spot is clear.
    const leader = createCharacter(0, vec3(), EAST, LOADOUT, 0);
    leader.position = vec3(0, 0, 0);
    leader.yaw = EAST;
    leader.velocity = vec3(5, 0, 0);
    const g = followSpot(leader, EAST, 0, { nav: OPEN_NAV } as unknown as BotWorld, vec3());
    const s = Math.sign(g.z - leader.position.z);
    const start = vec3(g.x, 0, g.z + s);
    // The open field's floor round a pit 1.5 m wide (x) starting 0.5 m east of the follower, beside it and beyond it.
    const [x0, x1] = [start.x + 0.5, start.x + 2];
    const [z0, z1] = [Math.min(start.z - 0.3 * s, start.z + 2 * s), Math.max(start.z - 0.3 * s, start.z + 2 * s)];
    const floor = (ax: number, bx: number, az: number, bz: number) => ({ kind: 'floor' as const, center: vec3((ax + bx) / 2, -0.25, (az + bz) / 2), size: vec3(bx - ax, 0.5, bz - az) });
    const pitNav = buildNavGrid({ ...OPEN_FIELD, blocks: [floor(-50, x0, -50, 50), floor(x1, 50, -50, 50), floor(x0, x1, -50, z0), floor(x0, x1, z1, 50)] }, NAV);
    // A wall there instead: walls only stop you (you slide along them), so they don't change the way.
    const wallNav = buildNavGrid({ ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, { kind: 'wall', center: vec3((x0 + x1) / 2, 1.5, (z0 + z1) / 2), size: vec3(x1 - x0, 3, z1 - z0) }] }, NAV);
    const steer = (nav: NavGrid) => {
      const b = createBot(createCharacter(1, vec3(start.x, 0, start.z), EAST, LOADOUT, 0), 1, BOTS, BOTS);
      b.character.position = vec3(start.x, 0, start.z);
      startOrder(b, leader, 'follow', 0);
      expect(moveOrder(b, { nav, cfg: BOTS } as unknown as BotWorld, createCommand(), DT)).toBe(true);
      expect(b.orderGoal.x).toBeCloseTo(g.x, 5); // the same spot with the pit there
      expect(b.orderGoal.z).toBeCloseTo(g.z, 5);
      return { ...b.moveDir };
    };
    const drops = (d: { x: number; z: number }) => dropOnLine(pitNav, start.x, start.z, start.x + d.x * BOTS.edgeLookahead, start.z + d.z * BOTS.edgeLookahead);
    // In the open: mostly your way, which here runs into the pit.
    const open = steer(OPEN_NAV);
    expect(open.x).toBeGreaterThan(0.8);
    expect(drops(open)).toBe(true);
    expect(steer(wallNav)).toEqual(open);
    // By the pit: straight at the spot, along the line that was checked.
    const byPit = steer(pitNav);
    expect(byPit.x).toBeCloseTo(0, 5);
    expect(byPit.z).toBeCloseTo(-s, 5);
    expect(drops(byPit)).toBe(false);
  });
});
