import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { BOT_BEHAVIOUR, BOT_SKILL, BOTS } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { PINGS } from '../config/pings';
import { LOADOUT } from '../config/replicas';
import type { Bush } from '../map/foliage';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { type Character, createCharacter, respawnCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { type BotWorld, createBot, pingInMind } from './bot';
import { BotController } from './botController';
import { bodyPoint, eyeOf } from './perception';
import type { BotIdentity } from './personality';
import { createPing, takePing } from './pings';

const DT = 1 / 60;
/** Yaw that looks along +x. */
const EAST = -Math.PI / 2;

beforeAll(async () => {
  await initPhysics();
});

interface PingSetup {
  /** Where the one Orange player stands (far off and unseen unless a test says), and whether it is a bot too. */
  enemy?: Vec3;
  enemyBot?: boolean;
  /** More of the map: walls, and bushes that hide people from the bots' sight rules. */
  blocks?: MapBlock[];
  foliage?: Bush[];
  /** Personalities of your two teammates (ids 1 and 2), by bots.md key. */
  personalities?: readonly [string, string];
}

/**
 * Pings on the open field with real physics, as squadOrders.test.ts plays orders: you (Blue, not a bot) at (-30, 0, 20)
 * with two Blue bots beside you, and one Orange player standing still (at `enemy`; far off by default).
 */
function field(s: PingSetup = {}) {
  const map: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, ...(s.blocks ?? [])], ...(s.foliage ? { foliage: s.foliage } : {}) };
  const nav = s.blocks ? buildNavGrid(map, NAV) : OPEN_NAV;
  const physics = new PhysicsWorld(map, BODY, DT);
  const state = createGameState(5, BALLISTICS.maxBBs, ROUNDS);
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    killY: map.killY,
    hits: HITS,
    deadZones: [[{ position: vec3(-45, 0, 45), yaw: 0 }], [{ position: vec3(45, 0, -45), yaw: 0 }]],
    nav,
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
  const enemy = s.enemy ?? vec3(40, 0, -40);
  [vec3(-30, 0, 20), vec3(-32, 0, 23), vec3(-28, 0, 23), enemy].forEach((p, id) => {
    const c = createCharacter(id, vec3(p.x, PHYSICS.groundRestGap, p.z), 0, LOADOUT, id < 3 ? 0 : 1);
    respawnCharacter(c);
    c.position = vec3(p.x, PHYSICS.groundRestGap, p.z);
    state.characters.push(c);
    physics.addCharacter(c);
  });
  const [you, , , orange] = state.characters as [Character, Character, Character, Character];
  const commands = new Map<number, PlayerCommand>([[you.id, createCommand()]]);
  const bots = new BotController(state, state.characters.filter((c) => c !== you && (s.enemyBot || c.team === 0)), commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
    lowCover: [],
    tallCover: [],
    sight: { foliage: map.foliage ?? [], night: null },
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: { ...BOTS, viewDistance: 20 },
    seed: 5,
    ...(s.personalities ? { identities: new Map<number, BotIdentity>(s.personalities.map((key, i) => [i + 1, { name: key, personality: key, style: BOT_PERSONALITIES.styles.get(key)! }])) } : {}),
  });
  const mates = bots.bots.filter((b) => b.character.team === 0);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
    }
  };
  run(0.5);
  const ping = createPing();
  /** You ping looking `yaw`, `pitch` (turned that way, as your view turns you). */
  const pingAt = (yaw: number, pitch: number) => {
    you.yaw = yaw;
    return bots.ping(you, yaw, pitch, state.time, ping);
  };
  /** You ping looking straight at `point`. */
  const pingToward = (point: Vec3) => {
    const eye = eyeOf(you, BODY, HITS, vec3());
    const dx = point.x - eye.x;
    const dy = point.y - eye.y;
    const dz = point.z - eye.z;
    return pingAt(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  };
  return { state, you, orange, bots, mates, commands, run, ping, pingAt, pingToward, nav, physics };
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('PG1: what a ping marks', () => {
  it('marks the floor where you look, a walkable spot under it, and both teammates take it', () => {
    const f = field();
    const pitch = -Math.atan2(1.6, 6);
    expect(f.pingAt(EAST, pitch)).toBe(true);
    expect(f.ping.kind).toBe('spot');
    expect(f.ping.enemyId).toBe(-1);
    expect(f.ping.point.y).toBeCloseTo(0, 1);
    expect(f.ping.point.x).toBeGreaterThan(f.you.position.x + 4);
    expect(flat(f.ping.spot, f.ping.point)).toBeLessThan(PINGS.spotSnap);
    expect(isWalkableAt(f.nav, f.ping.spot.x, f.ping.spot.y, f.ping.spot.z)).toBe(true);
    for (const b of f.mates) {
      expect(b.pingAt).toBe(f.state.time);
      expect(b.lastKnown).toEqual(f.ping.spot);
      expect(b.hasLastKnown).toBe(true);
    }
    f.physics.dispose();
  });

  it('pings nothing at the sky, or beyond PINGS.range, and the bots keep what they had', () => {
    const f = field();
    expect(f.pingAt(EAST, 0.4)).toBe(false);
    // Level over the open field: the floor is never met, and the field's edge is past the reach.
    expect(f.pingAt(EAST, 0)).toBe(false);
    for (const b of f.mates) expect(b.pingAt).toBe(Number.NEGATIVE_INFINITY);
    f.physics.dispose();
  });

  it('off a wall, marks the floor on your side of it', () => {
    const wall: MapBlock = { kind: 'wall', center: vec3(-20, 1.5, 20), size: vec3(0.4, 3, 8) };
    const f = field({ blocks: [wall] });
    expect(f.pingAt(EAST, 0)).toBe(true);
    expect(f.ping.kind).toBe('spot');
    expect(f.ping.point.x).toBeCloseTo(-20.2, 1);
    expect(f.ping.spot.x).toBeLessThan(-20.2);
    expect(f.ping.spot.y).toBeCloseTo(0, 1);
    f.physics.dispose();
  });

  it('makes an enemy under the crosshair you can see a contact at their feet; not one behind a wall or in a bush', () => {
    const enemy = vec3(-10, 0, 20);
    const chest = (c: Character) => bodyPoint(c, HITS, BOT_BEHAVIOUR.aimHeightFraction, vec3());
    // A wall 10 m behind them, so the view always meets something.
    const backstop: MapBlock = { kind: 'wall', center: vec3(0, 2, 20), size: vec3(0.4, 4, 20) };
    const open = field({ enemy, blocks: [backstop] });
    expect(open.pingToward(chest(open.orange))).toBe(true);
    expect(open.ping.kind).toBe('enemy');
    expect(open.ping.enemyId).toBe(open.orange.id);
    expect(flat(open.ping.spot, open.orange.position)).toBeLessThan(1e-6);
    expect(open.ping.point.y).toBeCloseTo(chest(open.orange).y, 3);
    // Off to the side by a little more than the cone: the wall behind, not them.
    const aside = chest(open.orange);
    aside.z += 20 * Math.tan((PINGS.enemyConeDeg * Math.PI) / 180) + 0.6;
    expect(open.pingToward(aside)).toBe(true);
    expect(open.ping.kind).toBe('spot');
    expect(open.ping.point.x).toBeCloseTo(-0.2, 1);
    open.physics.dispose();

    const wall: MapBlock = { kind: 'wall', center: vec3(-20, 1.5, 20), size: vec3(0.4, 3, 8) };
    const walled = field({ enemy, blocks: [wall, backstop] });
    expect(walled.pingToward(chest(walled.orange))).toBe(true);
    expect(walled.ping.kind).toBe('spot');
    expect(walled.ping.point.x).toBeCloseTo(-20.2, 1);
    walled.physics.dispose();

    const bushed = field({ enemy, blocks: [backstop], foliage: [{ x: enemy.x, y: 0, z: enemy.z, radius: 1.5, height: 2.2 }] });
    expect(bushed.pingToward(chest(bushed.orange))).toBe(true);
    expect(bushed.ping.kind).toBe('spot');
    expect(bushed.ping.enemyId).toBe(-1);
    bushed.physics.dispose();

    // KI1: nor one behind the body of someone already hit (the bots' sight stops on it, perception.ts bodyInSight).
    const behindBody = field({ enemy, blocks: [backstop] });
    const body = behindBody.state.characters[1]!;
    body.status = 'out';
    body.position = vec3(-20, PHYSICS.groundRestGap, 20);
    expect(behindBody.pingToward(chest(behindBody.orange))).toBe(true);
    expect(behindBody.ping.enemyId).toBe(-1);
    behindBody.physics.dispose();
  });

  it("is your team's: the other team's bots never take it, and nobody's while you are out", () => {
    const f = field({ enemyBot: true });
    const orangeBot = f.bots.bots.find((b) => b.character.team === 1)!;
    expect(f.pingAt(EAST, -Math.atan2(1.6, 6))).toBe(true);
    expect(orangeBot.pingAt).toBe(Number.NEGATIVE_INFINITY);
    f.you.status = 'calling';
    const before = f.mates.map((b) => b.pingAt);
    f.run(0.1);
    expect(f.pingAt(EAST, -Math.atan2(1.6, 8))).toBe(false);
    expect(f.mates.map((b) => b.pingAt)).toEqual(before);
    f.physics.dispose();
  });
});

describe('PG1: what your bot teammates do with it', () => {
  it('goes to look: a teammate sets off for the spot and gets nearer', () => {
    const f = field();
    expect(f.pingAt(EAST, -Math.atan2(1.6, 25))).toBe(true);
    const spot = { ...f.ping.spot };
    const start = Math.min(...f.mates.map((b) => flat(b.character.position, spot)));
    f.run(3);
    expect(f.mates.some((b) => b.mode === 'search')).toBe(true);
    expect(Math.min(...f.mates.map((b) => flat(b.character.position, spot)))).toBeLessThan(start - 4);
    f.physics.dispose();
  });

  it('under your order keeps the order and only watches it', () => {
    const f = field();
    expect(f.bots.giveOrder(f.you, 'follow')).toBe('follow');
    f.run(0.5);
    expect(f.pingAt(EAST, -Math.atan2(1.6, 25))).toBe(true);
    f.run(2);
    for (const b of f.mates) {
      expect(b.mode).toBe('order');
      expect(flat(b.character.position, f.you.position)).toBeLessThan(8);
    }
    f.physics.dispose();
  });
});

describe('PG1: takePing and pingInMind', () => {
  const bot = () => createBot(createCharacter(1, vec3(0, 0, 0), 0, LOADOUT, 0), 3, BOT_BEHAVIOUR, BOT_SKILL.normal);
  const world = (time: number) => ({ time, cfg: BOT_BEHAVIOUR }) as unknown as BotWorld;
  const spot = createPing();
  spot.spot = vec3(12, 0, -4);

  it('is ignored in a fight, in cover, with a target in view, or out of play', () => {
    for (const set of [(b: ReturnType<typeof bot>) => (b.mode = 'fight'), (b: ReturnType<typeof bot>) => (b.mode = 'cover'), (b: ReturnType<typeof bot>) => (b.targetVisible = true), (b: ReturnType<typeof bot>) => (b.character.status = 'calling')]) {
      const b = bot();
      set(b);
      expect(takePing(b, spot, world(3))).toBe(false);
      expect(b.pingAt).toBe(Number.NEGATIVE_INFINITY);
      expect(b.hasLastKnown).toBe(false);
    }
  });

  it('a spot is somewhere to look, a contact a threat too', () => {
    const b = bot();
    expect(takePing(b, spot, world(3))).toBe(true);
    expect(b.lastKnown).toEqual(spot.spot);
    expect(b.heardAt).toBe(3);
    expect(b.lastThreatAt).toBe(Number.NEGATIVE_INFINITY);
    const contact = { ...createPing(), kind: 'enemy' as const, spot: vec3(2, 0, 2), enemyId: 4 };
    expect(takePing(b, contact, world(4))).toBe(true);
    expect(b.lastThreatAt).toBe(4);
  });

  it('stays in mind for pingMemory, until real news writes another spot', () => {
    const b = bot();
    takePing(b, spot, world(3));
    expect(BOT_BEHAVIOUR.pingMemory).toBeGreaterThan(BOT_BEHAVIOUR.memoryTime);
    expect(pingInMind(b, world(3 + BOT_BEHAVIOUR.pingMemory - 0.01))).toBe(true);
    expect(pingInMind(b, world(3 + BOT_BEHAVIOUR.pingMemory))).toBe(false);
    b.lastKnown.x += 1; // a noise heard elsewhere
    expect(pingInMind(b, world(4))).toBe(false);
  });
});

describe('PG1: a ping is acted on as the bot\'s personality plays a noise (acceptance 3, QA)', () => {
  /** Seconds each of the two teammates sprinted in the first `seconds` after a ping 28 m off. */
  function sprinted(personalities: readonly [string, string], seconds: number): [number, number] {
    const f = field({ personalities });
    expect(f.pingAt(EAST, -Math.atan2(1.6, 28))).toBe(true);
    const out: [number, number] = [0, 0];
    for (let i = 0; i < seconds / DT; i++) {
      f.run(DT);
      f.mates.forEach((b, k) => {
        if (f.commands.get(b.character.id)!.sprint) out[k]! += DT;
      });
    }
    f.physics.dispose();
    return out;
  }

  it('has a rusher run to the ping while a careful bot does not run it down', () => {
    const [rusher, careful] = sprinted(['rusher', 'careful'], 4);
    expect(careful).toBeLessThan(rusher / 2);
    expect(rusher).toBeGreaterThan(0.5);
  });

  it('is the same for the same seed and ping: the bots\' commands repeat', () => {
    const a = sprinted(['rusher', 'careful'], 2);
    const b = sprinted(['rusher', 'careful'], 2);
    expect(b).toEqual(a);
  });
});
