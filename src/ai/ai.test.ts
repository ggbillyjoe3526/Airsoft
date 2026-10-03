import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS, type BotConfig, botConfig, DIFFICULTIES, type Difficulty } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { FLAG, type MatchMode } from '../config/modes';
import { FOOTSTEPS } from '../config/footsteps';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import type { MapData } from '../map/mapTypes';
import { TEST_YARD } from '../map/testYard';
import { buildNavGrid, isWalkableAt, type NavGrid } from '../nav/navGrid';
import { DEPOT, DEPOT_LAYOUT } from '../map/depot';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import { aimDirection, fitParts, type WorldQuery } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import type { CharacterMover } from '../sim/movement';
import { createRng } from '../sim/rng';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState, type GameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { aimErrorSize, createAim, freshAimError, stepAim } from './aim';
import type { Bot, BotWorld } from './bot';
import { reloadBot, shootBot } from './botCombat';
import { BotController } from './botController';
import { type CoverBlock, type CoverWorld, createCoverSpot, findCover, hidesFrom, lowCoverBlocks, tallCoverBlocks } from './cover';
import { bodyPoint, canSee, eyeOf, lineClear, visiblePart } from './perception';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const noWalls: WorldQuery = { raycastStatic: () => -1 };

/** An infinite wall across x at `x = wallX` from the floor up to `height`. */
function wallAcrossX(wallX: number, height = 3): WorldQuery {
  return {
    raycastStatic(o, d, max) {
      if (Math.abs(d.x) < 1e-9) return -1;
      const t = (wallX - o.x) / d.x;
      if (t < 0 || t > max) return -1;
      return o.y + d.y * t <= height ? t : -1;
    },
  };
}

/** A solid box from the floor up to `height`, centred at (cx, cz) with half extents (hx, hz). */
function boxQuery(cx: number, cz: number, hx: number, hz: number, height: number): WorldQuery {
  return {
    raycastStatic(o, d, max) {
      let t0 = 0;
      let t1 = max;
      for (const [p, v, lo, hi] of [
        [o.x, d.x, cx - hx, cx + hx],
        [o.y, d.y, 0, height],
        [o.z, d.z, cz - hz, cz + hz],
      ] as const) {
        if (Math.abs(v) < 1e-9) {
          if (p < lo || p > hi) return -1;
          continue;
        }
        let a = (lo - p) / v;
        let b = (hi - p) / v;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) return -1;
      }
      return t0;
    },
  };
}

const flatFloor: CharacterMover = {
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

/** Yaw that faces from a to b. */
const facing = (a: Vec3, b: Vec3): number => Math.atan2(-(b.x - a.x), -(b.z - a.z));

describe('perception', () => {
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0); // faces -Z
  it('sees someone ahead in the open', () => {
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, -15), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(true);
  });
  it('does not see behind itself or beyond view distance, but notices someone very close', () => {
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, 10), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(false);
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, -(BOTS.viewDistance + 1)), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(false);
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, BOTS.closeAwareness - 0.5), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(true);
  });
  it('sees a player who leans out from behind cover, but only on the side they lean to', () => {
    const v = createCharacter(0, vec3(0, 0, 0), -Math.PI / 2, LOADOUT, 0); // faces +X
    // Facing the bot (yaw 90°: its left is +Z), tucked behind a tall box whose edge is at z = -0.6.
    const peeker = createCharacter(1, vec3(10, 0, -1.0), Math.PI / 2, LOADOUT, 1);
    const box = boxQuery(8, -1.8, 1, 1.2, 3);
    expect(canSee(v, peeker, box, BOTS, BODY, HITS)).toBe(false);
    peeker.lean = -1; // leans left, out past the edge
    expect(canSee(v, peeker, box, BOTS, BODY, HITS)).toBe(true);
    const part = visiblePart(v, peeker, box, BOTS, BODY, HITS);
    expect(part).toBe(BOTS.headHeightFraction); // just the head is out
    peeker.lean = 1; // leaning the other way stays behind the box
    expect(canSee(v, peeker, box, BOTS, BODY, HITS)).toBe(false);
  });

  it('does not see through a wall, and sees a head over crouch-high cover', () => {
    const v = createCharacter(0, vec3(0, 0, 0), -Math.PI / 2, LOADOUT, 0); // faces +X
    const behind = createCharacter(1, vec3(10, 0, 0), 0, LOADOUT, 1);
    expect(canSee(v, behind, wallAcrossX(5), BOTS, BODY, HITS)).toBe(false);
    expect(canSee(v, behind, wallAcrossX(5, 1.2), BOTS, BODY, HITS)).toBe(true);
    behind.crouchAmount = 1;
    v.crouchAmount = 1;
    expect(canSee(v, behind, wallAcrossX(5, 1.2), BOTS, BODY, HITS)).toBe(false);
  });
});

describe('aim', () => {
  it('turns no faster than the turn rate and then settles on the target', () => {
    const a = createAim(0);
    const rng = createRng(1);
    stepAim(a, Math.PI / 2, 0, 0, BOTS, rng, DT);
    expect(a.yaw).toBeCloseTo(BOTS.turnRate * DT, 6);
    for (let i = 0; i < 60; i++) stepAim(a, Math.PI / 2, 0, 0, BOTS, rng, DT);
    expect(a.yaw).toBeCloseTo(Math.PI / 2, 6);
  });
  it('starts with a large error that settles, and is worse on the move', () => {
    expect(aimErrorSize(0, false, 50, 0, BOTS)).toBeCloseTo(BOTS.aimErrorStartDeg * DEG, 9);
    expect(aimErrorSize(10, false, 50, 0, BOTS)).toBeCloseTo(BOTS.aimErrorSettledDeg * DEG, 9);
    expect(aimErrorSize(10, true, 50, 0, BOTS)).toBeGreaterThan(aimErrorSize(10, false, 50, 0, BOTS));
  });
  it('starts at least aimErrorStartMetres off up close, and is worse against a target moving across the view', () => {
    // Up close the floor in metres wins over the angle; far away the angle does.
    expect(Math.tan(aimErrorSize(0, false, 3, 0, BOTS)) * 3).toBeCloseTo(BOTS.aimErrorStartMetres, 6);
    expect(aimErrorSize(0, false, 40, 0, BOTS)).toBeCloseTo(BOTS.aimErrorStartDeg * DEG, 9);
    // Settled, the floor no longer applies.
    expect(aimErrorSize(10, false, 3, 0, BOTS)).toBeCloseTo(BOTS.aimErrorSettledDeg * DEG, 9);
    // A target running sideways at 4 m/s adds speed × aimErrorTracking metres, whichever way it runs.
    const extra = aimErrorSize(10, false, 10, 4, BOTS) - aimErrorSize(10, false, 10, 0, BOTS);
    expect(Math.tan(extra) * 10).toBeCloseTo(4 * BOTS.aimErrorTracking, 6);
    expect(aimErrorSize(10, false, 10, -4, BOTS)).toBeCloseTo(aimErrorSize(10, false, 10, 4, BOTS), 9);
  });

  it('opens a new contact with a hasty aim: never dead on, at most the full error', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const a = createAim(0);
      freshAimError(a, BOTS, rng);
      const r = Math.hypot(a.errYaw, a.errPitch);
      expect(r).toBeGreaterThanOrEqual(BOTS.aimFirstErrorMin - 1e-9);
      expect(r).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('keeps the view within the error size of the target', () => {
    const a = createAim(0);
    const rng = createRng(3);
    const size = 2 * DEG;
    for (let i = 0; i < 600; i++) {
      stepAim(a, 0.3, -0.1, size, BOTS, rng, DT);
      if (i > 60) expect(Math.hypot(a.yaw - 0.3, a.pitch + 0.1)).toBeLessThanOrEqual(size + 1e-6);
    }
  });
});

/** What findCover needs: the given walls, walkability and tuning, and the map's low and tall blocks. */
function coverWorld(query: WorldQuery, nav: NavGrid, cfg: BotConfig, lowCover: readonly CoverBlock[] = [], tallCover: readonly CoverBlock[] = []): CoverWorld {
  return { query, nav, cfg, body: BODY, hits: HITS, lowCover, tallCover };
}

describe('cover', () => {
  it('finds a spot behind the crate, hidden from the threat', () => {
    const nav = buildNavGrid(TEST_YARD, NAV);
    // The yard's crate spans x -0.6..0.6, z -6.6..-5.4 and is 1.2 m tall; threat north at z = 2.
    const crate: WorldQuery = {
      raycastStatic(o, d, max) {
        // Slab test against the crate box.
        let t0 = 0;
        let t1 = max;
        for (const [p, v, lo, hi] of [
          [o.x, d.x, -0.6, 0.6],
          [o.y, d.y, 0, 1.2],
          [o.z, d.z, -6.6, -5.4],
        ] as const) {
          if (Math.abs(v) < 1e-9) {
            if (p < lo || p > hi) return -1;
            continue;
          }
          let a = (lo - p) / v;
          let b = (hi - p) / v;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          if (t0 > t1) return -1;
        }
        return t0;
      },
    };
    const threatEye = vec3(0, BODY.standEyeHeight, 2);
    const out = createCoverSpot();
    const found = findCover(vec3(0.5, 0, -4), threatEye, coverWorld(crate, nav, { ...BOTS, coverCandidates: 200 }), createRng(5), out);
    expect(found).toBe(true);
    expect(out.position.z).toBeLessThan(-6.6); // on the far side of the crate
    expect(out.crouchOnly).toBe(true); // 1.2 m crate: hides a crouched player only

    // With no random candidates at all, the spot right behind the crate (from the threat) is still tried.
    const lowOnly = createCoverSpot();
    const crateBlock = { x: 0, z: -6, halfX: 0.6, halfZ: 0.6 };
    expect(findCover(vec3(0.5, 0, -4), threatEye, coverWorld(crate, nav, { ...BOTS, coverCandidates: 0 }, [crateBlock]), createRng(5), lowOnly)).toBe(true);
    expect(lowOnly.position.z).toBeCloseTo(-6.6 - BOTS.lowCoverGap, 6);
    expect(lowOnly.crouchOnly).toBe(true);
  });

  it('tries the spot right behind a crate as seen from the threat: hidden crouched, able to shoot over standing', () => {
    // A lone 1.2 m crate at (3, -5) on the open field; no random candidates, so only the crate is tried.
    const crate = boxQuery(3, -5, 0.6, 0.6, 1.2);
    const block: CoverBlock = { x: 3, z: -5, halfX: 0.6, halfZ: 0.6 };
    const cfg = { ...BOTS, coverCandidates: 0 };
    for (const threat of [vec3(3, 0, 6), vec3(12, 0, 4), vec3(-6, 0, 3)]) {
      const threatEye = vec3(threat.x, BODY.standEyeHeight, threat.z);
      const out = createCoverSpot();
      expect(findCover(vec3(3, 0, -2.5), threatEye, coverWorld(crate, OPEN_NAV, cfg, [block]), createRng(1), out), `threat ${threat.x},${threat.z}`).toBe(true);
      const p = out.position;
      // On the far side of the crate from the threat...
      const toBlock = Math.hypot(block.x - threat.x, block.z - threat.z);
      expect(Math.hypot(p.x - threat.x, p.z - threat.z)).toBeGreaterThan(toBlock);
      // ...on walkable ground, hidden when crouched, and able to see (shoot) over it standing.
      expect(isWalkableAt(OPEN_NAV, p.x, p.z)).toBe(true);
      expect(lineClear(crate, threatEye, vec3(p.x, BODY.crouchEyeHeight, p.z))).toBe(false);
      expect(lineClear(crate, threatEye, vec3(p.x, BODY.standEyeHeight, p.z))).toBe(true);
      expect(out.crouchOnly).toBe(true);
    }
    // Asking for crouch cover only within a short radius: the crate is 2.5 m away, so 2 m finds nothing.
    const out = createCoverSpot();
    const near = { radius: 2, randomCandidates: 0, peekable: true };
    expect(findCover(vec3(3, 0, -2.5), vec3(3, BODY.standEyeHeight, 6), coverWorld(crate, OPEN_NAV, BOTS, [block]), createRng(1), out, near)).toBe(false);
  });

  it('finds a spot just round the corner of a tall wall, hidden upright, that a lean sees out of', () => {
    // A 2.5 m wall 3 m long whose near end is 0.3 m off the line between the bot and the threat.
    const wall = boxQuery(1.8, -11, 1.5, 0.3, 2.5);
    const tall: CoverBlock = { x: 1.8, z: -11, halfX: 1.5, halfZ: 0.3 };
    const threatEye = vec3(0, BODY.standEyeHeight, 0);
    const out = createCoverSpot();
    const search = { radius: 3.5, randomCandidates: 0, peekable: true };
    expect(findCover(vec3(0, 0, -14), threatEye, coverWorld(wall, OPEN_NAV, BOTS, [], [tall]), createRng(1), out, search)).toBe(true);
    const p = out.position;
    expect(out.crouchOnly).toBe(false);
    // Facing the threat (+Z), the open side (-X) is to the bot's right.
    expect(out.lean).toBe(1);
    expect(p.z).toBeLessThan(-11.3); // behind the wall
    // Hidden upright, eyes and the near edge of the body alike...
    expect(lineClear(wall, threatEye, vec3(p.x, BODY.standEyeHeight, p.z))).toBe(false);
    expect(lineClear(wall, threatEye, vec3(p.x - HITS.bodyRadius, 1.2, p.z))).toBe(false);
    // ...but a full lean puts the eyes out past the corner.
    expect(lineClear(wall, threatEye, vec3(p.x - 0.39, BODY.standEyeHeight - 0.1, p.z))).toBe(true);
    // Only full cover you can't lean out of: no peekable spot.
    const blind = boxQuery(0, -11, 3, 0.3, 2.5);
    const wide: CoverBlock = { x: 0, z: -11, halfX: 3, halfZ: 0.3 };
    expect(findCover(vec3(0, 0, -14), threatEye, coverWorld(blind, OPEN_NAV, BOTS, [], [wide]), createRng(1), createCoverSpot(), search)).toBe(false);
  });

  it("treats the map's walls and other blocks at least a player's height as full cover", () => {
    const tall = tallCoverBlocks(DEPOT.blocks, buildNavGrid(DEPOT, NAV), BODY, BOTS.lowCoverFloorGap);
    expect(tall.length).toBeGreaterThan(10);
    for (const t of tall) {
      const block = DEPOT.blocks.find((b) => b.center.x === t.x && b.center.z === t.z && b.kind !== 'floor')!;
      expect(block.center.y + block.size.y / 2).toBeGreaterThanOrEqual(BODY.height - 1e-6);
    }
  });

  it("treats the map's crate-high blocks standing on a floor (the ground or the dock) as low cover", () => {
    const low = lowCoverBlocks(DEPOT.blocks, buildNavGrid(DEPOT, NAV), BODY, BOTS.lowCoverFloorGap);
    expect(low.length).toBeGreaterThan(20);
    for (const l of low) {
      const block = DEPOT.blocks.find((b) => b.center.x === l.x && b.center.z === l.z && b.kind !== 'floor')!;
      expect(block.size.y).toBeGreaterThan(BODY.crouchEyeHeight);
      expect(block.size.y).toBeLessThan(BODY.standEyeHeight);
    }
    // Crates on the dock count too.
    expect(low.some((l) => l.z < DEPOT_LAYOUT.dock.edgeZ)).toBe(true);
  });
});

describe('cover on a raised floor', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('counts a crate standing on a platform as low cover, and hides behind it at the platform’s height', () => {
    // A 1 m platform (12 × 12 m) with a crate on it; the threat stands on the yard floor to the north.
    const map: MapData = {
      name: 'platform',
      blocks: [
        { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) },
        { kind: 'floor', center: vec3(0, 0.5, 0), size: vec3(12, 1, 12) },
        { kind: 'crate', center: vec3(0, 1.6, -2), size: vec3(1.2, 1.2, 1.2) },
      ],
      killY: -10,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
    const nav = buildNavGrid(map, NAV);
    const physics = new PhysicsWorld(map, BODY, DT);
    const low = lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap);
    expect(low).toEqual([{ x: 0, z: -2, halfX: 0.6, halfZ: 0.6 }]);
    expect(tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap)).toEqual([]);
    const rest = 1 + PHYSICS.groundRestGap;
    const threatEye = vec3(0, PHYSICS.groundRestGap + BODY.standEyeHeight, -12);
    const spot = createCoverSpot();
    expect(findCover(vec3(0, rest, 1.5), threatEye, coverWorld(physics, nav, BOTS, low), createRng(3), spot)).toBe(true);
    expect(spot.position.y).toBeCloseTo(rest, 9);
    expect(spot.crouchOnly).toBe(true);
    // In the crate's shadow, on the platform.
    expect(Math.abs(spot.position.x)).toBeLessThan(0.6);
    expect(spot.position.z).toBeGreaterThan(-1.4);
    expect(spot.position.z).toBeLessThan(6);
    expect(hidesFrom(spot.position, threatEye, physics, BODY)).toBe(true);
    physics.dispose();
  });

  it('finds the floor a block stands on from its whole footprint: at a platform edge and past the grid', () => {
    // Floor 40 × 40 m; a 1 m platform from x = -6 to 6. A crate on the platform overhangs its east edge
    // (centre over the yard floor), a wall stands on the yard floor straddling that edge (centre over the
    // platform), and a perimeter wall stands just past the floor (centre off the grid).
    const map: MapData = {
      name: 'edges',
      blocks: [
        { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) },
        { kind: 'floor', center: vec3(0, 0.5, 0), size: vec3(12, 1, 12) },
        { kind: 'crate', center: vec3(6.1, 1.6, 3), size: vec3(1.2, 1.2, 1.2) },
        { kind: 'wall', center: vec3(5.95, 1.5, -3), size: vec3(0.4, 3, 2) },
        { kind: 'wall', center: vec3(20.2, 1.5, 0), size: vec3(0.4, 3, 40) },
      ],
      killY: -10,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
    const nav = buildNavGrid(map, NAV);
    expect(lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap)).toEqual([{ x: 6.1, z: 3, halfX: 0.6, halfZ: 0.6 }]);
    expect(tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap)).toEqual([
      { x: 5.95, z: -3, halfX: 0.2, halfZ: 1 },
      { x: 20.2, z: 0, halfX: 0.2, halfZ: 20 },
    ]);
  });
});

/** A duel on an open floor: one Orange bot facing a Blue character `dist` metres away. */
function duel(
  dist: number,
  extra: (state: GameState) => void = () => {},
  query: WorldQuery = noWalls,
  cfg: BotConfig = BOTS,
  seed = 7,
  lowCover: readonly CoverBlock[] = [],
  tallCover: readonly CoverBlock[] = [],
) {
  const state = createGameState(seed, 64, ROUNDS);
  const player = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const bot = createCharacter(1, vec3(0, 0, -dist), 0, LOADOUT, 1);
  bot.yaw = facing(bot.position, player.position);
  state.characters.push(player, bot);
  extra(state);
  const ctx = createSimContext({
    mover: flatFloor,
    query,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: -10,
    hits: HITS,
    deadZones: [[{ position: vec3(-40, 0, 0), yaw: 0 }], [{ position: vec3(40, 0, 0), yaw: 0 }]],
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
  const commands = new Map<number, PlayerCommand>([[0, createCommand()]]);
  const bots = new BotController(state, [bot], commands, {
    query,
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    lanes: OPEN_FIELD.lanes,
    lowCover,
    tallCover,
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg,
    seed,
  });
  // The player stands still facing the bot.
  commands.get(0)!.yaw = facing(player.position, bot.position);
  const run = (seconds: number, onTick: () => void = () => {}) => {
    for (let i = 0; i < seconds / DT; i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      onTick();
    }
  };
  return { state, player, bot, run, commands, bots };
}

describe('bots in a duel', () => {
  it('wait out their reaction time before firing, then hit a standing target at 12 m within a few seconds', () => {
    const { state, run } = duel(12);
    let firstShot = -1;
    let hitAt = -1;
    run(6, () => {
      for (const e of state.events) {
        if (e.type === 'shot' && e.characterId === 1 && firstShot < 0) firstShot = state.time;
        if (e.type === 'characterHit' && e.victimId === 0 && hitAt < 0) hitAt = state.time;
      }
    });
    expect(firstShot).toBeGreaterThanOrEqual(BOTS.reactionTime[0]);
    expect(hitAt).toBeGreaterThan(0);
    expect(hitAt).toBeLessThan(4);
  });

  it('do not fire while a teammate is in the line of fire, and never hit them', () => {
    const { state, bot, player, run } = duel(12, (s) => {
      // An Orange teammate (not a bot: it stays put) half-way, right in the line.
      s.characters.push(createCharacter(2, vec3(0, 0, -6), 0, LOADOUT, 1));
    });
    const mate = state.characters[2]!;
    let blockedShots = 0;
    let friendlyHits = 0;
    run(4, () => {
      for (const e of state.events) {
        if (e.type === 'characterHit' && e.victimId === 2) friendlyHits++;
        if (e.type !== 'shot' || e.characterId !== 1) continue;
        // Distance from the teammate to the bot→player line (top view).
        const ax = bot.position.x;
        const az = bot.position.z;
        const dx = player.position.x - ax;
        const dz = player.position.z - az;
        const t = ((mate.position.x - ax) * dx + (mate.position.z - az) * dz) / (dx * dx + dz * dz);
        const off = Math.hypot(ax + dx * t - mate.position.x, az + dz * t - mate.position.z);
        if (t > 0 && t < 1 && off < HITS.bodyRadius) blockedShots++;
      }
    });
    expect(blockedShots).toBe(0);
    expect(friendlyHits).toBe(0);
  });

  it('hold fire for a teammate just past the target, but not for one behind a wall there', () => {
    // An Orange teammate 2.5 m behind the player, in the line of fire; optionally a wall in between. The
    // bot doesn't sidestep, so the line stays on the teammate.
    const shotsWith = (query: WorldQuery) => {
      const mate = (s: GameState) => s.characters.push(createCharacter(2, vec3(0, 0, 2.5), 0, LOADOUT, 1));
      const { state, run } = duel(12, mate, query, { ...BOTS, strafeInput: 0 });
      let shots = 0;
      run(3, () => {
        for (const e of state.events) if (e.type === 'shot' && e.characterId === 1) shots++;
      });
      return shots;
    };
    expect(shotsWith(noWalls)).toBe(0);
    expect(shotsWith(boxQuery(0, 1.2, 5, 0.2, 3))).toBeGreaterThan(0);
    // A low crate there is no wall: BBs can clear its top, so the teammate still counts.
    expect(shotsWith(boxQuery(0, 1.2, 5, 0.2, 1.2))).toBe(0);
  });

  it('play out identically from the same seed', () => {
    const trace = () => {
      const { state, bot, run } = duel(15);
      const shots: string[] = [];
      run(3, () => {
        for (const e of state.events) if (e.type === 'shot') shots.push(`${state.tick}:${bot.yaw.toFixed(6)}`);
      });
      return shots.join(',');
    };
    const a = trace();
    expect(a.length).toBeGreaterThan(0);
    expect(trace()).toBe(a);
  });

  it('go after someone they only heard shooting', () => {
    // The bot faces away; the player fires from behind it, 15 m away.
    const { state, bot, player, run, commands } = duel(15, (st) => (st.characters[1]!.yaw += Math.PI));
    const playerCmd = commands.get(0)!;
    const fire = createCommand();
    fire.fire = true;
    fire.pitch = 0.6; // firing into the air, not at the bot
    fire.yaw = facing(player.position, bot.position) + Math.PI;
    let turned = false;
    run(2, () => {
      // Player shoots for the first half second.
      Object.assign(playerCmd, state.time < 0.5 ? fire : createCommand());
      const toPlayer = facing(bot.position, player.position);
      if (Math.abs(Math.atan2(Math.sin(bot.yaw - toPlayer), Math.cos(bot.yaw - toPlayer))) < 0.35) turned = true;
    });
    expect(turned).toBe(true);
  });

  it('hear enemy footsteps behind them only when running or sprinting, and only within range', () => {
    const cases = [
      ['run', 8, true],
      ['sprint', 8, true],
      ['walk', 8, false],
      ['crouch', 8, false],
      // Between the running (11 m) and sprinting (16 m) hearing ranges, and beyond both.
      ['run', 13, false],
      ['sprint', 12, true],
      ['sprint', 20, false],
      ['walk', 4, false],
    ] as const;
    expect(BOTS.footstepHearingRun).toBeLessThan(13);
    expect(BOTS.footstepHearingSprint).toBeGreaterThan(15);
    for (const [pace, dist, heard] of cases) {
      // The bot faces away (turned before its brain starts); the player crosses behind it along +X,
      // staying at about `dist` metres.
      const { run, commands, bots } = duel(dist, (st) => (st.characters[1]!.yaw += Math.PI));
      const cmd = commands.get(0)!;
      cmd.yaw = -Math.PI / 2; // faces +X
      cmd.forward = 1;
      cmd.walk = pace === 'walk';
      cmd.crouch = pace === 'crouch';
      cmd.sprint = pace === 'sprint';
      let heardIt = false;
      run(1, () => {
        const b = bots.bots[0]!;
        if (b.hasLastKnown && !b.targetVisible) heardIt = true;
      });
      expect(heardIt, `${pace} at ${dist} m`).toBe(heard);
    }
  });

  it('hear a hi-cap rattle on a walk behind them, but only close by (M17b)', () => {
    expect(BOTS.footstepHearingRattle).toBeLessThan(BOTS.footstepHearingRun);
    for (const [dist, heard] of [
      [5, true],
      [9, false],
    ] as const) {
      const { run, commands, bots, player } = duel(dist, (st) => (st.characters[1]!.yaw += Math.PI));
      fitParts(player.armament, LOADOUT, [{ grip: 'none', magazine: 'hiCap' }]);
      player.stepDistance = FOOTSTEPS.strideRun - 0.05; // the first rattle comes at once, before the bot wanders off
      const cmd = commands.get(0)!;
      cmd.yaw = -Math.PI / 2;
      cmd.forward = 1;
      cmd.walk = true;
      let heardIt = false;
      run(0.3, () => {
        const b = bots.bots[0]!;
        if (b.hasLastKnown && !b.targetVisible) heardIt = true;
      });
      expect(heardIt, `hi-cap walk at ${dist} m`).toBe(heard);
    }
  });

  it('still need their full reaction time on re-sighting someone after only hearing them', () => {
    // Line of sight can be switched off, like the target stepping behind a wall.
    let blocked = false;
    const blinds: WorldQuery = { raycastStatic: (_o, _d, max) => (blocked ? max * 0.5 : -1) };
    const { state, player, run, commands } = duel(12, () => {}, blinds);
    const playerCmd = commands.get(0)!;
    run(0.2); // sees the player (reaction under way)
    blocked = true;
    run(BOTS.contactGrace + 1); // loses them for longer than the grace period
    // The player fires into the air: the bot hears it.
    Object.assign(playerCmd, { fire: true, pitch: 1.2 });
    run(0.3);
    Object.assign(playerCmd, { fire: false, pitch: 0 });
    player.armament.recoil = 0;
    blocked = false;
    const unblockedAt = state.time;
    let firstShot = -1;
    run(3, () => {
      for (const e of state.events) if (e.type === 'shot' && e.characterId === 1 && firstShot < 0) firstShot = state.time;
    });
    expect(firstShot).toBeGreaterThan(0);
    expect(firstShot - unblockedAt).toBeGreaterThanOrEqual(BOTS.reactionTime[0]);
  });
});

describe('bot modes', () => {
  it('leave cover when the route there fails or takes too long, and give up searching unreachable spots', () => {
    // Nobody can see anyone (as if a wall stood between them): this is about cover and search timing.
    const blind: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 };
    const { bots, run } = duel(30, () => {}, blind);
    const b = bots.bots[0]!;
    run(0.1);
    b.mode = 'cover';
    b.coverLeft = 2;
    b.coverGiveUp = BOTS.coverMaxTime;
    b.routeState = 'failed';
    run(DT);
    expect(b.mode).not.toBe('cover');

    b.mode = 'cover';
    b.coverLeft = 99;
    b.coverGiveUp = BOTS.coverMaxTime;
    b.cover.position.x = 1000; // never reachable
    b.routeState = 'none';
    run(BOTS.coverMaxTime + 0.2);
    expect(b.mode).not.toBe('cover');

    b.mode = 'search';
    b.hasLastKnown = true;
    b.heardAt = 0;
    b.lastKnown.x = 1000; // off the map: no route
    run(0.5);
    expect(b.hasLastKnown).toBe(false);
    expect(b.mode).toBe('advance');
  });

  it('fight back from cover that turns out not to hide them', () => {
    const { state, bot, bots, run } = duel(12);
    const b = bots.bots[0]!;
    run(0.3); // in contact (not yet firing)
    expect(b.targetVisible).toBe(true);
    // Pretend it just settled into "cover" right where it stands, in the open.
    b.mode = 'cover';
    b.cover.position.x = bot.position.x;
    b.cover.position.z = bot.position.z;
    b.coverLeft = 10;
    b.coverGiveUp = 10;
    b.coverHeld = 0;
    b.routeState = 'none';
    let shots = 0;
    let fought = false;
    run(BOTS.coverSettle + 0.5, () => {
      fought ||= b.mode === 'fight';
      for (const e of state.events) if (e.type === 'shot' && e.characterId === 1) shots++;
    });
    expect(fought).toBe(true);
    expect(shots).toBeGreaterThan(0);
  });
});

describe('bot hearing and targets', () => {
  it('keep one steady guess of an unseen shooter during a long burst', () => {
    const walls: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 }; // can't see anyone
    const { state, bots, run, commands } = duel(18, () => {}, walls);
    const b = bots.bots[0]!;
    Object.assign(commands.get(0)!, { fire: true, pitch: 1.2 }); // a long burst into the air
    let jumps = 0;
    let last: { x: number; z: number } | undefined;
    let turned = 0;
    let prevYaw = b.aim.yaw;
    run(3, () => {
      if (b.hasLastKnown) {
        if (last && Math.hypot(b.lastKnown.x - last.x, b.lastKnown.z - last.z) > 0.5) jumps++;
        last = { x: b.lastKnown.x, z: b.lastKnown.z };
      }
      turned += Math.abs(Math.atan2(Math.sin(b.aim.yaw - prevYaw), Math.cos(b.aim.yaw - prevYaw)));
      prevYaw = b.aim.yaw;
    });
    expect(state.events).toBeDefined();
    expect(last).toBeDefined();
    // At most one re-guess: when the bot gets to its guess and the noise is clearly elsewhere.
    expect(jumps).toBeLessThanOrEqual(1);
    expect(turned).toBeLessThan(Math.PI); // turns towards the noise; no swinging back and forth
  });

  it('keep one steady guess when two unseen enemies near each other take turns firing', () => {
    const walls: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 };
    const { state, bots, run, commands } = duel(18, (s) => s.characters.push(createCharacter(2, vec3(4, 0, 0), 0, LOADOUT, 0)), walls);
    const b = bots.bots[0]!;
    const second = createCommand();
    commands.set(2, second);
    let jumps = 0;
    let last: { x: number; z: number } | undefined;
    run(3, () => {
      // Alternate bursts between the two shooters every few ticks.
      const turn = Math.floor(state.tick / 5) % 2 === 0;
      Object.assign(commands.get(0)!, { fire: turn, pitch: 1.2 });
      Object.assign(second, { fire: !turn, pitch: 1.2 });
      if (b.hasLastKnown) {
        if (last && Math.hypot(b.lastKnown.x - last.x, b.lastKnown.z - last.z) > 0.5) jumps++;
        last = { x: b.lastKnown.x, z: b.lastKnown.z };
      }
    });
    expect(last).toBeDefined();
    expect(jumps).toBeLessThanOrEqual(1); // (was dozens when each shooter reset the guess)
  });

  it('stay on one target rather than flip between two enemies side by side', () => {
    const { bots, run } = duel(14, (s) => {
      s.characters.push(createCharacter(2, vec3(1.2, 0, 0), 0, LOADOUT, 0));
    });
    const b = bots.bots[0]!;
    let switches = 0;
    let prev = -1;
    run(3, () => {
      if (b.targetId >= 0 && prev >= 0 && b.targetId !== prev) switches++;
      if (b.targetId >= 0) prev = b.targetId;
    });
    // A switch is fine once someone is hit (they're out); flip-flopping isn't.
    expect(switches).toBeLessThanOrEqual(1);
  });
});


describe('bot suppression', () => {
  it('ducks from enemy BBs landing close, not from its own or a teammate\'s', () => {
    const { state, bot, bots } = duel(18, (s) => s.characters.push(createCharacter(2, vec3(30, 0, 0), 0, LOADOUT, 1)));
    const b = bots.bots[0]!;
    const near = vec3(bot.position.x + 0.5, bot.position.y + 1.2, bot.position.z);
    const before = b.suppressedAt;
    for (const ownerId of [bot.id, 2]) {
      state.events.length = 0;
      state.events.push({ type: 'bbImpact', position: near, ownerId });
      bots.observe(state);
      expect(b.suppressedAt, `owner ${ownerId}`).toBe(before);
    }
    state.events.length = 0;
    state.events.push({ type: 'bbImpact', position: near, ownerId: 0 }); // the enemy player
    bots.observe(state);
    expect(b.suppressedAt).toBe(state.time);
  });
});

describe('bot line of fire', () => {
  it('holds fire when its actual aim (aim error included) would put the BB into a wall right beside it', () => {
    // A thin door-frame post 4 m long just beside the straight line from the bot (z = -14) to the player (the
    // origin): sight to the player is clear, but an aim drifting that way runs into it.
    const { state, bot, player, bots } = duel(14, () => {}, boxQuery(0.12, -12, 0.05, 2, 3));
    const b = bots.bots[0]!;
    const w = (bots as unknown as { world: BotWorld }).world;
    b.targetVisible = true;
    b.contact = { seenAt: state.time, acquiredAt: 0, reactAt: 0 };
    w.live = true;
    w.time = state.time;
    const eye = eyeOf(bot, BODY, HITS, vec3());
    const aimPoint = bodyPoint(player, HITS, BOTS.aimHeightFraction, vec3());
    const straightYaw = Math.atan2(-(aimPoint.x - eye.x), -(aimPoint.z - eye.z));
    const pitch = Math.atan2(aimPoint.y - eye.y, Math.hypot(aimPoint.x - eye.x, aimPoint.z - eye.z));
    const fires = (yaw: number): boolean => {
      const cmd = createCommand();
      b.aim.yaw = yaw;
      b.aim.pitch = pitch;
      b.burstLeft = 0;
      b.pauseLeft = 0;
      shootBot(b, w, player, eye, aimPoint, 0, cmd, DT);
      return cmd.fire;
    };
    expect(fires(straightYaw)).toBe(true);
    // 1.5° off is well inside the fire cone; one way it runs into the post 2-4 m out, the other way it's clear.
    const towardsPost = aimDirection(vec3(), straightYaw + 1.5 * DEG, pitch).x > 0 ? 1.5 * DEG : -1.5 * DEG;
    expect(fires(straightYaw - towardsPost)).toBe(true);
    expect(fires(straightYaw + towardsPost)).toBe(false);
  });
});

describe('bot contacts', () => {
  it('switch back to someone seen moments ago without a fresh reaction delay', () => {
    // A (the player, id 0) straight ahead at 14 m; B (id 2) closer, off to the side, hidden at first.
    let hideB = true;
    // Sight lines ending at B (x = 3) are blocked while it hides; A (x = 0) is always in view.
    const blinds: WorldQuery = { raycastStatic: (o, d, max) => (hideB && o.x + d.x * max > 1.5 ? max * 0.5 : -1) };
    const holdFire = { ...BOTS, fireCone: 0 }; // never fires: nobody gets hit, only the contacts are tested
    const { state, bots, run } = duel(14, (s) => s.characters.push(createCharacter(2, vec3(3, 0, -9), 0, LOADOUT, 0)), blinds, holdFire);
    const b = bots.bots[0]!;
    run(1); // has seen A and reacted
    expect(b.targetId).toBe(0);
    expect(b.contact!.reactAt).toBeLessThanOrEqual(state.time);
    hideB = false;
    run(0.25); // B steps out, clearly closer: a new contact with its own reaction delay
    expect(b.targetId).toBe(2);
    expect(b.contact!.reactAt).toBeGreaterThan(state.time);
    hideB = true;
    run(0.25); // B ducks back; A, seen half a second ago, is still the same contact
    expect(b.targetId).toBe(0);
    expect(b.contact!.reactAt).toBeLessThanOrEqual(state.time);
  });

  it('do need a fresh reaction for someone last seen longer ago than contactGrace', () => {
    let hideA = false;
    const blinds: WorldQuery = { raycastStatic: (_o, _d, max) => (hideA ? max * 0.5 : -1) };
    const { state, bots, run } = duel(14, () => {}, blinds, { ...BOTS, fireCone: 0 });
    const b = bots.bots[0]!;
    run(1);
    hideA = true;
    run(BOTS.contactGrace + 0.3);
    hideA = false;
    run(0.15);
    expect(b.targetId).toBe(0);
    expect(b.contact!.reactAt).toBeGreaterThan(state.time);
  });
});

describe('difficulty levels', () => {
  /** Seconds from first sight until a bot at `level` hits a player `dist` metres away (standing or strafing), over several seeds. */
  function medianTimeToHit(level: Difficulty, dist: number, strafe: boolean): number {
    const times: number[] = [];
    for (let seed = 1; seed <= 15; seed++) {
      const { state, run, commands } = duel(dist, () => {}, noWalls, botConfig(level), seed);
      const cmd = commands.get(0)!;
      let hitAt = 8;
      run(8, () => {
        if (strafe) cmd.right = Math.floor(state.time / 0.7) % 2 === 0 ? 1 : -1;
        for (const e of state.events) if (e.type === 'characterHit' && e.victimId === 0 && hitAt === 8) hitAt = state.time;
      });
      times.push(hitAt);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)]!;
  }

  it('get deadlier from easy to hard', { timeout: 30_000 }, () => {
    for (const dist of [4, 12]) {
      const [easy, normal, hard] = DIFFICULTIES.map((d) => medianTimeToHit(d.id, dist, false));
      expect(easy, `${dist} m`).toBeGreaterThan(normal!);
      expect(normal, `${dist} m`).toBeGreaterThan(hard!);
    }
  });

  it('give you a moment up close on normal, and reward moving', { timeout: 30_000 }, () => {
    // The old bots hit a standing player 3-5 m away ~0.5 s after seeing them (about their reaction
    // time); Normal now takes ~0.75-0.9 s. The floor sits between the two, clear of seed noise.
    for (const dist of [3, 4, 5]) expect(medianTimeToHit('normal', dist, false), `${dist} m`).toBeGreaterThan(0.65);
    // Strafing up close buys clearly more time (~0.5 s at 4 m).
    expect(medianTimeToHit('normal', 4, true)).toBeGreaterThan(medianTimeToHit('normal', 4, false) + 0.2);
  });

  it('switch from the next round when asked to, so a fight in progress is not changed', () => {
    const { state, bots } = duel(14);
    const easy = botConfig('easy');
    bots.setConfig(easy, 'nextRound');
    expect(bots.cfg).toBe(BOTS);
    state.events.push({ type: 'roundStart', round: 2 });
    bots.observe(state);
    expect(bots.cfg).toBe(easy);
    bots.setConfig(BOTS, 'now');
    expect(bots.cfg).toBe(BOTS);
  });
});

describe('bot team play and routes', () => {
  /** Orange bots on Depot (no physics needed: planning only). */
  function depotBots(mode: MatchMode = 'elimination', query: WorldQuery = noWalls, cfg: BotConfig = BOTS) {
    const state = createGameState(4, 64, ROUNDS, mode, DEPOT.flag);
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < ROUNDS.teamSize; i++) {
        const s = DEPOT.spawns[team]![i]!;
        state.characters.push(createCharacter(state.characters.length, vec3(s.position.x, 0, s.position.z), s.yaw, LOADOUT, team));
      }
    }
    const nav = buildNavGrid(DEPOT, NAV);
    const commands = new Map<number, PlayerCommand>();
    const bots = new BotController(state, state.characters.filter((c) => c.team === 1), commands, {
      query,
      nav,
      navSnap: NAV.snap,
      lanes: DEPOT.lanes,
      lowCover: lowCoverBlocks(DEPOT.blocks, nav, BODY, BOTS.lowCoverFloorGap),
      tallCover: tallCoverBlocks(DEPOT.blocks, nav, BODY, BOTS.lowCoverFloorGap),
      body: BODY,
      hits: HITS,
      loadout: LOADOUT,
      cfg,
      seed: 4,
    });
    return { state, bots, nav, commands };
  }

  it('vary the plan and the lanes from round to round, and split means one bot per lane', () => {
    const { state, bots } = depotBots();
    const plans = new Set<string>();
    const assignments = new Set<string>();
    for (let round = 2; round < 40; round++) {
      state.events.length = 0;
      state.events.push({ type: 'roundStart', round });
      bots.observe(state);
      const lanes = bots.bots.map((b) => b.lane);
      plans.add(bots.plans[1]!);
      assignments.add(lanes.join());
      if (bots.plans[1] === 'split') expect(new Set(lanes).size).toBe(3);
      if (bots.plans[1] === 'stack') expect(new Set(lanes).size).toBe(1);
      // Bots sharing a lane set off one after another.
      const holds = bots.bots.filter((b) => b.lane === lanes[0]).map((b) => b.holdLeft);
      expect(new Set(holds).size).toBe(holds.length);
    }
    expect(plans).toEqual(new Set(['split', 'pair', 'stack']));
    expect(assignments.size).toBeGreaterThan(6);
  });

  it('serve route requests round-robin, without skipping anyone', () => {
    // Two searches per tick for three bots that all want one: 0 and 1, then 2 and 0, then 1 and 2.
    const blind: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 }; // nobody sees anyone
    const { state, bots } = depotBots('elimination', blind, { ...BOTS, pathsPerTick: 2 });
    const served: number[][] = [];
    for (let tick = 0; tick < 3; tick++) {
      for (const b of bots.bots) {
        b.routeState = 'wanted';
        b.routeGoal.x = b.character.position.x;
        b.routeGoal.z = b.character.position.z;
        b.holdLeft = 100; // holding still: thinking leaves the route alone
      }
      bots.think(state, DT);
      served.push(bots.bots.flatMap((b, i) => (b.routeState === 'wanted' ? [] : [i])));
    }
    expect(served).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  describe('managing magazines', () => {
    function oneBot() {
      const { bots } = depotBots();
      const world = (bots as unknown as { world: BotWorld }).world;
      const b = bots.bots[0]!;
      const ammo = b.character.armament.ammo[0]!;
      const wantsReload = () => {
        const cmd = createCommand();
        reloadBot(b, world, cmd);
        return cmd.reload;
      };
      return { b, ammo, wantsReload };
    }
    const low = Math.floor(LOADOUT[0]!.magSize * BOTS.tacticalReloadFraction) - 1;

    it('swap a low magazine for a fuller spare when nobody is in sight, but not mid-fight', () => {
      const { b, ammo, wantsReload } = oneBot();
      ammo.mag = low;
      ammo.pouch = [60, 60, 60];
      b.targetVisible = false;
      expect(wantsReload()).toBe(true);
      b.targetVisible = true;
      expect(wantsReload()).toBe(false); // keep shooting what's left
      ammo.mag = 0;
      expect(wantsReload()).toBe(true); // empty: reload whatever
    });

    it('never reload into a magazine that has no more in it (no reload loops)', () => {
      const { b, ammo, wantsReload } = oneBot();
      b.targetVisible = false;
      ammo.mag = low;
      ammo.pouch = [low, 3, 0];
      expect(wantsReload()).toBe(false);
    });

    it('use a nearly empty last spare, then are out for good and stop asking to reload', () => {
      const { ammo, wantsReload } = oneBot();
      ammo.mag = 0;
      ammo.pouch = [3, 0, 0];
      expect(wantsReload()).toBe(true);
      ammo.mag = 3; // after the swap
      ammo.pouch = [0, 0, 0];
      expect(wantsReload()).toBe(false);
      ammo.mag = 0;
      expect(wantsReload()).toBe(false);
    });
  });

  describe('in Attack / Defend', () => {
    /** Orange defends (Blue attacks first). Blind bots: nobody is ever seen, only heard. */
    const blind: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 };
    const pole = DEPOT.flag!;
    const tick = (state: GameState, bots: BotController, seconds: number) => {
      for (let i = 0; i < seconds / DT; i++) {
        state.time += DT;
        bots.think(state, DT);
      }
    };

    it('defenders hold the first or second point of a lane near home, and never all on one lane', () => {
      const { state, bots } = depotBots('attackDefend');
      expect(state.round.attackers).toBe(0);
      const holds = new Set<number>();
      for (let round = 2; round < 40; round++) {
        state.events.length = 0;
        state.events.push({ type: 'roundStart', round });
        bots.observe(state);
        expect(bots.plans[1]).not.toBe('stack');
        for (const b of bots.bots) {
          expect([1, 2]).toContain(b.lanePoints);
          holds.add(b.lanePoints);
        }
        expect(new Set(bots.bots.map((b) => b.lane)).size).toBeGreaterThan(1);
      }
      expect(holds).toEqual(new Set([1, 2]));
    });

    it('defenders stop at their hold point instead of sweeping the lane, and never hunt', () => {
      const { state, bots } = depotBots('attackDefend', blind);
      const nav = buildNavGrid(DEPOT, NAV);
      // Walk them along: put each bot on its goal whenever it has one (no physics here).
      for (let i = 0; i < 60 * 30; i++) {
        state.time += DT;
        bots.think(state, DT);
        for (const b of bots.bots) {
          if (b.routeState === 'ok') {
            const last = b.route[b.route.length - 1]!;
            b.character.position.x = last.x;
            b.character.position.z = last.z;
          }
        }
      }
      for (const b of bots.bots) {
        const lane = DEPOT.lanes[b.lane]!;
        const walked = lane.length - 1 - b.laneIndex; // Orange walks the lanes east to west
        expect(walked + 1).toBe(b.lanePoints);
        expect(b.hunting).toBe(false);
        expect(b.mode).toBe('advance');
        expect(isWalkableAt(nav, b.character.position.x, b.character.position.z)).toBe(true);
        // Holding on its own side of the map, within reach of the pole.
        expect(b.character.position.x).toBeGreaterThan(0);
        expect(Math.hypot(b.character.position.x - pole.x, b.character.position.z - pole.z)).toBeLessThan(16);
      }
    });

    it('the two defenders nearest the pole run to pull the flag down once it is off the bottom; the third holds its post', () => {
      const { state, bots } = depotBots('attackDefend', blind);
      tick(state, bots, 1);
      expect(bots.bots.every((b) => b.mode === 'advance')).toBe(true);
      // Put the three at clearly different distances from the pole.
      const [near, mid, far] = bots.bots as [Bot, Bot, Bot];
      for (const [b, x] of [[near, 12], [mid, 14], [far, 20]] as const) {
        b.character.position.x = x;
        b.character.position.z = 0;
      }
      state.round.flag.progress = 0.3;
      tick(state, bots, 0.2);
      expect(BOTS.retakers).toBe(2);
      for (const b of [near, mid]) {
        expect(b.mode).toBe('flag');
        expect(Math.hypot(b.flagGoal.x - pole.x, b.flagGoal.z - pole.z)).toBeLessThanOrEqual(BOTS.flagStand + 1e-9);
      }
      expect(far.mode).toBe('advance');
      // A spot by the pole is within reach of the rope once a bot has arrived there.
      expect(BOTS.flagStand + BOTS.flagArrive).toBeLessThan(FLAG.radius);
      // One retaker is hit: the one who held its post takes over.
      near.character.status = 'out';
      tick(state, bots, 0.2);
      expect(far.mode).toBe('flag');
      state.round.flag.progress = 0;
      tick(state, bots, 0.2);
      expect([mid, far].every((b) => b.mode === 'advance')).toBe(true);
    });

    it('attackers walk their lane only to the first point past the middle of the map, then go for the pole', () => {
      const { state, bots } = depotBots('attackDefend', blind);
      // Second half: Orange attacks from the west end, Blue defends the east end (as startRound places them).
      state.round.attackers = 1;
      for (const c of state.characters) {
        const s = DEPOT.spawns[1 - c.team]![c.id % ROUNDS.teamSize]!;
        c.end = 1 - c.team;
        c.spawnPosition.x = s.position.x;
        c.spawnPosition.z = s.position.z;
      }
      for (let round = 5; round < 15; round++) {
        state.events.length = 0;
        state.events.push({ type: 'roundStart', round });
        bots.observe(state);
        for (const b of bots.bots) {
          expect(b.laneDir).toBe(1); // west to east
          // Past halfway from the west spawns to the east ones: the dock's middle (4th point), just short of the
          // Main Gate (4th), the hall (5th).
          expect(b.lanePoints).toBe([4, 4, 5][b.lane]);
        }
      }
      // And once those points are walked, the lane is done and the bot heads for the pole.
      const b = bots.bots[0]!;
      b.laneIndex = b.lanePoints - 1;
      b.holdLeft = 0;
      b.routeState = 'none';
      tick(state, bots, 0.2);
      expect(b.laneDone).toBe(true);
      expect(b.mode).toBe('flag');
    });

    it('attackers who have swept their lane head for the pole, crouch there and stay', () => {
      const { state, bots, commands } = depotBots('attackDefend', blind);
      state.round.attackers = 1; // Orange attacks for this test
      state.events.length = 0;
      state.events.push({ type: 'roundStart', round: 5 });
      bots.observe(state);
      const b = bots.bots[0]!;
      b.laneDone = true;
      tick(state, bots, 0.2);
      expect(b.mode).toBe('flag');
      b.character.position.x = b.flagGoal.x;
      b.character.position.z = b.flagGoal.z;
      tick(state, bots, 1);
      expect(b.mode).toBe('flag');
      expect(bots.bots[0]!.routeState).toBe('none'); // no route searches while it stands there
      expect(commands.get(b.character.id)!.crouch).toBe(true);
    });

    it('defenders go after noise near the pole, but hold their post and watch when it comes from far off', () => {
      const { state, bots } = depotBots('attackDefend', blind);
      const shooter = state.characters.find((c) => c.team === 0)!;
      const b = bots.bots[0]!;
      b.character.position.x = 11.9;
      b.character.position.z = 2.9;
      const shoot = (x: number, z: number) => {
        shooter.position.x = x;
        shooter.position.z = z;
        state.events.length = 0;
        state.events.push({ type: 'shot', characterId: shooter.id, replicaId: LOADOUT[0]!.id, position: shooter.position });
        bots.observe(state);
        tick(state, bots, 0.2);
      };
      tick(state, bots, 0.5);
      shoot(-6, 10); // ~19 m from the bot, ~19 m from the pole
      expect(b.hasLastKnown).toBe(true);
      expect(Math.hypot(b.lastKnown.x - pole.x, b.lastKnown.z - pole.z)).toBeGreaterThan(BOTS.defendSearchRadius);
      expect(b.mode).toBe('advance');
      tick(state, bots, BOTS.memoryTime + 0.5);
      expect(b.hasLastKnown).toBe(false); // old news: back to watching the enemy side
      shoot(6, -3); // close to the pole
      expect(b.mode).toBe('search');
    });
  });

  it('move lane points a little at random, always onto walkable ground', () => {
    const { state, bots, nav } = depotBots();
    const offsets: number[] = [];
    for (let tick = 0; tick < 60 * 20; tick++) {
      state.time += DT;
      bots.think(state, DT);
      for (const b of bots.bots) {
        if (b.mode !== 'advance' || b.hunting || b.laneIndex < 0) continue;
        const p = DEPOT.lanes[b.lane]![b.laneIndex]!;
        const off = Math.hypot(b.laneGoal.x - p.x, b.laneGoal.z - p.z);
        expect(off).toBeLessThanOrEqual(BOTS.laneJitter + 1e-9);
        expect(isWalkableAt(nav, b.laneGoal.x, b.laneGoal.z)).toBe(true);
        offsets.push(off);
      }
    }
    expect(Math.max(...offsets)).toBeGreaterThan(0.3);
  });

  /**
   * Two Orange bots on an open field with a lane along x; the second is held at its start. Returns how
   * far (towards the enemy) the first gets in `seconds`.
   */
  function leaderProgress(cfg: BotConfig, seconds: number): number {
    const blind: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 };
    const lane = [-20, -15, -10, -5, 0, 5, 10, 15, 20].map((x) => vec3(x, 0, 0));
    const state = createGameState(2, 64, ROUNDS);
    state.characters.push(createCharacter(0, vec3(-30, 0, 0), 0, LOADOUT, 0));
    state.characters.push(createCharacter(1, vec3(24, 0, 0), 0, LOADOUT, 1), createCharacter(2, vec3(24, 0, 2), 0, LOADOUT, 1));
    const ctx = createSimContext({
      mover: flatFloor,
      query: blind,
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      loadout: LOADOUT,
      killY: -10,
      hits: HITS,
      deadZones: [[{ position: vec3(-40, 0, 0), yaw: 0 }], [{ position: vec3(40, 0, 0), yaw: 0 }]],
      nav: OPEN_NAV,
      navSnap: NAV.snap,
      rounds: ROUNDS,
    });
    const commands = new Map<number, PlayerCommand>([[0, createCommand()]]);
    const bots = new BotController(state, state.characters.slice(1), commands, {
      query: blind,
      nav: OPEN_NAV,
      navSnap: NAV.snap,
      lanes: [lane],
      lowCover: [],
      tallCover: [],
      body: BODY,
      hits: HITS,
      loadout: LOADOUT,
      cfg: { ...cfg, holdTime: [0.1, 0.1], laneJitter: 0 },
      seed: 5,
    });
    const leader = state.characters[1]!;
    for (let i = 0; i < seconds / DT; i++) {
      bots.bots[1]!.holdLeft = 1; // the teammate stays put
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
    }
    return 24 - leader.position.x;
  }

  it('wait for teammates at lane points instead of running far ahead, but not for ever', { timeout: 20_000 }, () => {
    const alone = leaderProgress({ ...BOTS, teamWaitMax: 0 }, 6);
    const paced = leaderProgress(BOTS, 6);
    expect(alone).toBeGreaterThan(BOTS.teamSpread + 10);
    expect(paced).toBeLessThan(BOTS.teamSpread + 6); // stops at the first lane point past teamSpread
    // Each wait is capped, so a stuck teammate never stalls the round.
    expect(leaderProgress(BOTS, 30)).toBeGreaterThan(paced + 10);
  });

  it('walk the last stretch to where they heard someone, so their own steps are silent', () => {
    const walls: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 }; // heard, never seen
    const { state, bots, run, commands } = duel(22, () => {}, walls);
    const b = bots.bots[0]!;
    const botCmd = commands.get(1)!;
    Object.assign(commands.get(0)!, { fire: true, pitch: 1.2 });
    run(0.3);
    Object.assign(commands.get(0)!, { fire: false, pitch: 0 });
    let walkedNear = 0;
    let ranFar = 0;
    let botSteps = 0;
    run(8, () => {
      if (b.mode !== 'search') return;
      const d = Math.hypot(b.lastKnown.x - b.character.position.x, b.lastKnown.z - b.character.position.z);
      const moving = botCmd.forward !== 0 || botCmd.right !== 0;
      if (moving && d < BOTS.searchWalkDistance - 0.5) {
        expect(botCmd.walk).toBe(true);
        walkedNear++;
        for (const e of state.events) if (e.type === 'footstep' && e.characterId === 1) botSteps++;
      }
      if (moving && d > BOTS.searchWalkDistance + 0.5) {
        expect(botCmd.walk).toBe(false);
        ranFar++;
      }
    });
    expect(ranFar).toBeGreaterThan(0);
    expect(walkedNear).toBeGreaterThan(0);
    expect(botSteps).toBe(0);
  });

  /**
   * A bot settled at crouch cover: a 1.2 m wall at x = 5 between it (just behind, at x = 4.2) and a
   * standing player at x = 15. Plays `seconds` (or until the player is hit, unless `onTick` is given)
   * and reports what it did. `setup` can change the bot before it starts; `onTick` runs after each tick.
   */
  function peekScenario(
    cfg: BotConfig,
    seconds: number,
    setup: (b: Bot) => void = () => {},
    onTick?: (b: Bot, player: Character, time: number) => void,
  ) {
    const wall = wallAcrossX(5, 1.2);
    const state = createGameState(3, 64, ROUNDS);
    const player = createCharacter(0, vec3(15, 0, 0), Math.PI / 2, LOADOUT, 0);
    const bot = createCharacter(1, vec3(4.2, 0, 0), -Math.PI / 2, LOADOUT, 1);
    state.characters.push(player, bot);
    const ctx = createSimContext({
      mover: flatFloor,
      query: wall,
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      loadout: LOADOUT,
      killY: -10,
      hits: HITS,
      deadZones: [[{ position: vec3(-40, 0, 20), yaw: 0 }], [{ position: vec3(40, 0, 20), yaw: 0 }]],
      nav: OPEN_NAV,
      navSnap: NAV.snap,
      rounds: ROUNDS,
    });
    const commands = new Map<number, PlayerCommand>([[0, createCommand()]]);
    const bots = new BotController(state, [bot], commands, {
      query: wall,
      nav: OPEN_NAV,
      navSnap: NAV.snap,
      lanes: [],
      lowCover: [],
      tallCover: [],
      body: BODY,
      hits: HITS,
      loadout: LOADOUT,
      cfg,
      seed: 3,
    });
    const b = bots.bots[0]!;
    // Just settled (crouched) at crouch cover right where it stands, knowing roughly where the player is.
    Object.assign(b, { mode: 'cover', coverPhase: 'down', coverLeft: 0.6, coverGiveUp: 5, coverHeld: 0, peeksLeft: 3, routeState: 'none' });
    bot.crouchAmount = bot.prevCrouchAmount = 1;
    b.cover.position.x = bot.position.x;
    b.cover.position.z = bot.position.z;
    b.cover.crouchOnly = true;
    b.hasLastKnown = true;
    b.heardAt = 0;
    b.lastKnown.x = player.position.x;
    b.lastKnown.z = player.position.z;
    setup(b);
    const botCmd = commands.get(1)!;
    const out = { shots: 0, shotsCrouched: 0, downs: 0, ups: 0, foughtFromCover: false, drift: 0, playerHit: false };
    let wasDown = true;
    for (let i = 0; i < seconds / DT && (onTick || isInPlay(player)); i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      onTick?.(b, player, state.time);
      if (botCmd.crouch && !wasDown) out.downs++;
      if (!botCmd.crouch && wasDown) out.ups++;
      wasDown = botCmd.crouch;
      out.foughtFromCover ||= b.mode === 'fight' && b.fromCover;
      out.drift = Math.max(out.drift, Math.hypot(bot.position.x - 4.2, bot.position.z));
      for (const e of state.events) {
        if (e.type !== 'shot' || e.characterId !== 1) continue;
        out.shots++;
        if (bot.crouchAmount > 0.5) out.shotsCrouched++;
      }
    }
    out.playerHit = !isInPlay(player);
    return out;
  }

  it('crouch-peek over low cover: stand up to look, shoot over it from the spot, never into it', () => {
    const r = peekScenario(BOTS, 6);
    expect(r.foughtFromCover).toBe(true);
    expect(r.shots).toBeGreaterThan(0); // stood up, saw the player and fired over the wall
    expect(r.shotsCrouched).toBe(0); // never fires into its own cover
    expect(r.drift).toBeLessThan(0.5); // no sidestepping out from behind it
  });

  it('crouch-peek again and again: duck after a short look or fight, then stand up once more', () => {
    // Holding fire, so the player stays in: the bot keeps cycling between ducking and peeking.
    const r = peekScenario({ ...BOTS, fireCone: 0 }, 8);
    expect(r.playerHit).toBe(false);
    expect(r.ups).toBeGreaterThanOrEqual(2);
    expect(r.downs).toBeGreaterThanOrEqual(2);
    expect(r.drift).toBeLessThan(0.5);
  });

  it('on spotting someone at range, get behind close crouch cover first, then fight from it', () => {
    // A 1.2 m crate 2 m in front of the bot, between it and the player 14 m away.
    const crate = boxQuery(0, -12, 0.6, 0.6, 1.2);
    const block: CoverBlock = { x: 0, z: -12, halfX: 0.6, halfZ: 0.6 };
    // A bot that fires normally: any shot before it reaches the spot would show up here.
    const { state, bot, bots, run } = duel(14, () => {}, crate, BOTS, 7, [block]);
    const b = bots.bots[0]!;
    let tookCover = false;
    let foughtFromCover = false;
    let shotsBeforeArriving = 0;
    let arrivedAt = -1;
    run(4, () => {
      tookCover ||= b.mode === 'cover';
      foughtFromCover ||= b.mode === 'fight' && b.fromCover;
      const there = tookCover && Math.hypot(bot.position.x - b.cover.position.x, bot.position.z - b.cover.position.z) < BOTS.coverArrive;
      if (there && arrivedAt < 0) arrivedAt = state.time;
      for (const e of state.events) if (e.type === 'shot' && e.characterId === 1 && arrivedAt < 0) shotsBeforeArriving++;
    });
    expect(tookCover).toBe(true);
    expect(foughtFromCover).toBe(true);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(shotsBeforeArriving).toBe(0); // holds fire while getting behind the crate
    expect(b.cover.position.z).toBeLessThan(-12.6); // behind the crate, not in front of it
  });

  it('on spotting someone at range, get round the corner of a wall, then lean out to fight from it', () => {
    // A 2.5 m wall whose near end is just off the line to the player 14 m away (as in the cover test).
    const wall = boxQuery(1.8, -11, 1.5, 0.3, 2.5);
    const tall: CoverBlock = { x: 1.8, z: -11, halfX: 1.5, halfZ: 0.3 };
    const { state, bot, bots, run } = duel(14, () => {}, wall, BOTS, 7, [], [tall]);
    const b = bots.bots[0]!;
    let tookCover = false;
    let foughtLeaning = false;
    let shotsFromCover = 0;
    let shotsUpright = 0;
    run(6, () => {
      tookCover ||= b.mode === 'cover';
      foughtLeaning ||= b.mode === 'fight' && b.fromCover && bot.lean > 0.9;
      const atSpot = tookCover && Math.hypot(bot.position.x - b.cover.position.x, bot.position.z - b.cover.position.z) < BOTS.coverArrive;
      for (const e of state.events) {
        if (e.type !== 'shot' || e.characterId !== 1 || !atSpot) continue;
        shotsFromCover++;
        if (Math.abs(bot.lean) < 0.5) shotsUpright++;
      }
    });
    expect(tookCover).toBe(true);
    expect(b.cover.lean).toBe(1);
    expect(foughtLeaning).toBe(true);
    expect(shotsFromCover).toBeGreaterThan(0);
    expect(shotsUpright).toBe(0); // from the spot it only ever shoots leaning out, never into the wall
  });

  it('at a corner where a lean no longer sees out, end the cover episode instead of crouching there', () => {
    // As above, holding fire; once the bot is down on its lean spot, the wall grows past the corner.
    const wall = boxQuery(1.8, -11, 1.5, 0.3, 2.5);
    const wide = boxQuery(0, -11, 3, 0.3, 2.5);
    let grown = false;
    const query: WorldQuery = { raycastStatic: (o, d, max) => (grown ? wide : wall).raycastStatic(o, d, max) };
    const tall: CoverBlock = { x: 1.8, z: -11, halfX: 1.5, halfZ: 0.3 };
    const { state, bot, bots, run } = duel(14, () => {}, query, { ...BOTS, fireCone: 0 }, 7, [], [tall]);
    const b = bots.bots[0]!;
    let grownAt = -1;
    let leftAt = -1;
    let leanWhenLeft = 0;
    let peeked = false;
    let crouched = false;
    run(6, () => {
      const onSpot = Math.hypot(bot.position.x - b.cover.position.x, bot.position.z - b.cover.position.z) < BOTS.leanSpotArrive;
      if (!grown && b.mode === 'cover' && b.coverPhase === 'down' && onSpot) {
        grown = true;
        grownAt = state.time;
      } else if (grown && leftAt < 0) {
        if (b.mode === 'cover') {
          peeked ||= b.coverPhase === 'peek';
          crouched ||= bot.crouchAmount > 0.5;
        } else {
          leftAt = state.time;
          leanWhenLeft = b.cover.lean;
        }
      }
    });
    expect(grownAt).toBeGreaterThan(0);
    expect(leftAt).toBeGreaterThan(0);
    expect(leftAt - grownAt).toBeLessThanOrEqual(BOTS.peekDown[1] + 0.1); // no later than the next look
    expect(peeked).toBe(false);
    expect(crouched).toBe(false);
    expect(leanWhenLeft).toBe(1); // still a lean spot: it ended, it didn't turn into crouch cover
  });

  it('fight on the spot when someone appears close by, without running for cover', () => {
    const crate = boxQuery(0, -4, 0.6, 0.6, 1.2);
    const block: CoverBlock = { x: 0, z: -4, halfX: 0.6, halfZ: 0.6 };
    const { bots, run } = duel(6, () => {}, crate, { ...BOTS, fireCone: 0 }, 7, [block]);
    const b = bots.bots[0]!;
    let tookCover = false;
    run(1.5, () => (tookCover ||= b.mode === 'cover'));
    expect(tookCover).toBe(false);
  });

  it('move on from crouch cover once their target is out, instead of peeking at nothing', () => {
    let outAt = -1;
    let leftAt = -1;
    peekScenario({ ...BOTS, fireCone: 0 }, 6, undefined, (b, player, time) => {
      // The moment it fights from cover, the player is hit (by someone else).
      if (outAt < 0 && b.mode === 'fight' && b.fromCover) {
        player.status = 'calling';
        outAt = time;
      }
      if (outAt >= 0 && leftAt < 0 && b.mode !== 'cover' && !b.fromCover) leftAt = time;
    });
    expect(outAt).toBeGreaterThan(0);
    expect(leftAt - outAt).toBeLessThan(0.2);
  });

  it('leave cover with no ammo left at all, and never hold a cover episode past coverEpisodeMax', () => {
    let inCover = 0;
    peekScenario(BOTS, 1, (b) => {
      b.character.armament.ammo[0]!.mag = 0;
      b.character.armament.ammo[0]!.pouch.fill(0);
    }, (b) => {
      if (b.mode === 'cover' || b.fromCover) inCover++;
    });
    expect(inCover).toBeLessThanOrEqual(1);

    // Holding fire, the player never goes down; the bot cycles duck/peek/fight until the cap.
    let lastCoverAt = 0;
    peekScenario({ ...BOTS, fireCone: 0 }, BOTS.coverEpisodeMax + 4, undefined, (b, _p, time) => {
      if (b.mode === 'cover' || b.fromCover) lastCoverAt = time;
    });
    expect(lastCoverAt).toBeGreaterThan(4);
    expect(lastCoverAt).toBeLessThanOrEqual(BOTS.coverEpisodeMax + DT);
  });
});
