import { BALLISTICS } from '../config/ballistics';
import { BOTS, type BotConfig } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import type { MatchMode } from '../config/modes';
import type { MapData } from '../map/mapTypes';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { buildNavGrid, type NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import type { CharacterMover } from '../sim/movement';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState, type GameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { BotController } from './botController';
import { type CoverBlock, lowCoverBlocks, tallCoverBlocks } from './cover';

/**
 * Test-only (like sim/testSupport.ts): the small worlds and the one-bot duel shared by the bot unit tests (ai.test.ts,
 * botTactics.test.ts).
 */

const DT = 1 / 60;

export const noWalls: WorldQuery = { raycastStatic: () => -1 };

/** An infinite wall across x at `x = wallX` from the floor up to `height`. */
export function wallAcrossX(wallX: number, height = 3): WorldQuery {
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
export function boxQuery(cx: number, cz: number, hx: number, hz: number, height: number): WorldQuery {
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

export const flatFloor: CharacterMover = {
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
export const facing = (a: Vec3, b: Vec3): number => Math.atan2(-(b.x - a.x), -(b.z - a.z));

/** Bots that hear through walls as if they weren't there (before M22): for tests that use walls only to blind them. */
export const HEAR_THROUGH_WALLS: BotConfig = { ...BOTS, wallHearing: 1 };

/** A duel on an open floor: one Orange bot facing a Blue character `dist` metres away. */
export function duel(
  dist: number,
  extra: (state: GameState) => void = () => {},
  query: WorldQuery = noWalls,
  cfg: BotConfig = BOTS,
  seed = 7,
  lowCover: readonly CoverBlock[] = [],
  tallCover: readonly CoverBlock[] = [],
  nav: NavGrid = OPEN_NAV,
) {
  const state = createGameState(seed, 64, ROUNDS);
  const player = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const bot = createCharacter(1, vec3(0, 0, -dist), 0, LOADOUT, 1);
  bot.yaw = facing(bot.position, player.position);
  state.characters.push(player, bot);
  extra(state);
  const world = playOnFloor(state, [bot], { query, cfg, seed, lowCover, tallCover, nav, lanes: OPEN_FIELD.lanes });
  // The player stands still facing the bot.
  world.commands.get(0)!.yaw = facing(player.position, bot.position);
  return { state, player, bot, ...world };
}

/**
 * A skirmish on `map` (a flat floor with boxes; no ramps), played without physics on a flat floor: Blue's character 0
 * stands still where `chars` puts it, and every other character (`[x, z, team]` each) is a bot. The map's blocks are the
 * walls, its lanes the bots' lanes, its low and tall blocks their cover.
 */
export function skirmish(map: MapData, chars: readonly (readonly [number, number, number])[], cfg: BotConfig = BOTS, seed = 7) {
  const state = createGameState(seed, 64, ROUNDS);
  chars.forEach(([x, z, team], id) => state.characters.push(createCharacter(id, vec3(x, 0, z), 0, LOADOUT, team)));
  const nav = buildNavGrid(map, NAV);
  const walls = map.blocks.filter((k) => k.kind !== 'floor').map((k) => boxQuery(k.center.x, k.center.z, k.size.x / 2, k.size.z / 2, k.center.y + k.size.y / 2));
  const query: WorldQuery = {
    raycastStatic(o, d, max) {
      let best = -1;
      for (const q of walls) {
        const t = q.raycastStatic(o, d, max);
        if (t >= 0 && (best < 0 || t < best)) best = t;
      }
      return best;
    },
  };
  const world = playOnFloor(state, state.characters.slice(1), {
    query,
    cfg,
    seed,
    lowCover: lowCoverBlocks(map.blocks, nav, BODY, cfg.lowCoverFloorGap),
    tallCover: tallCoverBlocks(map.blocks, nav, BODY, cfg.lowCoverFloorGap),
    nav,
    lanes: map.lanes,
  });
  return { state, player: state.characters[0]!, query, nav, ...world };
}

/** Bots for `botChars` in `state` on a flat floor, and a run loop stepping bots and simulation together. */
function playOnFloor(
  state: GameState,
  botChars: Character[],
  o: { query: WorldQuery; cfg: BotConfig; seed: number; lowCover: readonly CoverBlock[]; tallCover: readonly CoverBlock[]; nav: NavGrid; lanes: MapData['lanes'] },
) {
  const ctx = createSimContext({
    mover: flatFloor,
    query: o.query,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    killY: -10,
    hits: HITS,
    deadZones: [[{ position: vec3(-40, 0, 0), yaw: 0 }], [{ position: vec3(40, 0, 0), yaw: 0 }]],
    nav: o.nav,
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
  const commands = new Map<number, PlayerCommand>([[0, createCommand()]]);
  const bots = new BotController(state, botChars, commands, {
    query: o.query,
    nav: o.nav,
    navSnap: NAV.snap,
    lanes: o.lanes,
    lowCover: o.lowCover,
    tallCover: o.tallCover,
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: o.cfg,
    seed: o.seed,
  });
  const run = (seconds: number, onTick: () => void = () => {}) => {
    for (let i = 0; i < seconds / DT; i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      onTick();
    }
  };
  return { run, commands, bots };
}


/** Orange bots on Depot against a Blue team (no physics needed: planning only). */
export function depotBots(mode: MatchMode = 'elimination', query: WorldQuery = noWalls, cfg: BotConfig = BOTS) {
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
