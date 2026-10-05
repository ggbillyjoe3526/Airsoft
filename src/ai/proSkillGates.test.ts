import { describe, expect, it } from 'vitest';
import { BOTS, type BotConfig, botConfig, type Difficulty } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { inLight } from '../map/nightSight';
import { buildNavGrid } from '../nav/navGrid';
import { createCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { createGameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { sightConditionsOf } from './perception';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';
import { noWalls } from './testSupport';

const DT = 1 / 60;

/** `map`, night or day, with a lantern of this radius at `at`. */
function lit(map: MapData, night: boolean, at: Vec3, radius: number): MapData {
  return { ...map, night, lights: [{ position: at, radius, colour: 0xffaa55 }] };
}

function botsOn(map: MapData, cfg: BotConfig) {
  const state = createGameState(4, 64, ROUNDS, 'elimination', map.flag);
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < ROUNDS.teamSize; i++) {
      const s = map.spawns[team]![i]!;
      state.characters.push(createCharacter(state.characters.length, vec3(s.position.x, 0, s.position.z), s.yaw, LOADOUT, team));
    }
  }
  const nav = buildNavGrid(map, NAV);
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, state.characters.filter((c) => c.team === 1), commands, {
    query: noWalls,
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
    lowCover: lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    sight: sightConditionsOf(map),
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg,
    seed: 4,
  });
  return { state, bots };
}

/** The first lane point bot 0 of end 1 walks to on `map` (no jitter), and where its lane goal ends up on `map` at `cfg`. */
function firstGoal(map: MapData, cfg: BotConfig): Vec3 {
  const { state, bots } = botsOn(map, { ...cfg, laneJitter: 0 });
  const b = bots.bots[0]!;
  bots.think(state, DT);
  expect(b.laneIndex).toBeGreaterThanOrEqual(0);
  return vec3(b.laneGoal.x, b.laneGoal.y, b.laneGoal.z);
}

describe('keepsDark: lane points out of the light (M40)', () => {
  const POOL = 3;
  const lanePoint = firstGoal(DEPOT, botConfig('hard'));
  const at = (cfg: BotConfig, map: MapData) => firstGoal(map, cfg);
  const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

  it('a Pro lane point in a lantern\'s pool at night moves to the nearest dark spot, at the pool\'s edge on its floor', () => {
    const map = lit(DEPOT, true, lanePoint, POOL);
    const night = sightConditionsOf(map).night!;
    expect(inLight(night, lanePoint)).toBe(true);
    const goal = at(botConfig('pro'), map);
    expect(inLight(night, goal)).toBe(false);
    // The nearest dark ring: the first one past the pool's edge, no further than a ring's step beyond it.
    expect(dist(goal, lanePoint)).toBeGreaterThan(POOL);
    expect(dist(goal, lanePoint)).toBeLessThanOrEqual(POOL + BOTS.darkSpotStep + 1e-6);
    expect(goal.y).toBeCloseTo(lanePoint.y, 1);
  });

  it('Easy, Normal and Hard keep the lane point in the pool', () => {
    const map = lit(DEPOT, true, lanePoint, POOL);
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const goal = at(botConfig(d), map);
      expect(dist(goal, lanePoint), d).toBeLessThan(1e-6);
    }
  });

  it('by day the same lantern changes nothing, even for Pro', () => {
    const goal = at(botConfig('pro'), lit(DEPOT, false, lanePoint, POOL));
    expect(dist(goal, lanePoint)).toBeLessThan(1e-6);
  });

  it('a pool with no dark spot within darkSpotRadius leaves the point where it is', () => {
    const goal = at(botConfig('pro'), lit(DEPOT, true, lanePoint, BOTS.darkSpotRadius + 5));
    expect(dist(goal, lanePoint)).toBeLessThan(1e-6);
  });

  it('a Pro lane point outside every pool is not touched at night', () => {
    const far = vec3(lanePoint.x + 20, 0, lanePoint.z + 20);
    const goal = at(botConfig('pro'), lit(DEPOT, true, far, POOL));
    expect(dist(goal, lanePoint)).toBeLessThan(1e-6);
  });
});

describe('the map\'s angle features are worked out once per match, and only for a team that uses them (M40)', () => {
  const featuresOf = (bots: BotController) => (bots as unknown as { features?: unknown }).features;
  const skillOnly = (d: Difficulty, over: Partial<BotConfig>): BotConfig => ({ ...botConfig(d), ...over });

  it('Easy, Normal and Hard matches never work them out, however long they run', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const { state, bots } = botsOn(DEPOT, botConfig(d));
      for (let i = 0; i < 600; i++) bots.think(state, DT);
      expect(featuresOf(bots), d).toBeUndefined();
    }
  });

  it('a Pro match has them from the start and keeps the one object through the round', () => {
    const { state, bots } = botsOn(DEPOT, botConfig('pro'));
    const first = featuresOf(bots);
    expect(first).toBeDefined();
    expect(bots.worldForTests.angleFeatures()).toBe(first);
    for (let i = 0; i < 600; i++) bots.think(state, DT);
    expect(bots.worldForTests.angleFeatures()).toBe(first);
    expect(featuresOf(bots)).toBe(first);
  });

  it('a team that only holds angles (or only slices corners) is enough; one that does neither is not', () => {
    for (const flag of ['holdsAngles', 'slicesCorners'] as const) {
      const { bots } = botsOn(DEPOT, skillOnly('hard', { [flag]: true }));
      expect(featuresOf(bots), flag).toBeDefined();
    }
    expect(featuresOf(botsOn(DEPOT, botConfig('hard')).bots)).toBeUndefined();
  });

  it('with one team on Pro and one on Hard, the features exist but only Pro\'s bots use the new skills', () => {
    const state = createGameState(4, 64, ROUNDS, 'elimination', DEPOT.flag);
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < ROUNDS.teamSize; i++) {
        const s = DEPOT.spawns[team]![i]!;
        state.characters.push(createCharacter(state.characters.length, vec3(s.position.x, 0, s.position.z), s.yaw, LOADOUT, team));
      }
    }
    const nav = buildNavGrid(DEPOT, NAV);
    const bots = new BotController(state, state.characters, new Map(), {
      query: noWalls,
      nav,
      navSnap: NAV.snap,
      lanes: DEPOT.lanes,
      lowCover: lowCoverBlocks(DEPOT.blocks, nav, BODY, BOTS.lowCoverFloorGap),
      tallCover: tallCoverBlocks(DEPOT.blocks, nav, BODY, BOTS.lowCoverFloorGap),
      body: BODY,
      hits: HITS,
      loadout: LOADOUT,
      cfg: botConfig('hard'),
      teamCfg: [botConfig('hard'), botConfig('pro')],
      seed: 4,
    });
    expect(featuresOf(bots)).toBeDefined();
    for (const b of bots.bots) {
      expect(b.skill.huntsMiddle, `team ${b.character.team}`).toBe(b.character.team === 1);
      expect(b.skill.keepsDark, `team ${b.character.team}`).toBe(b.character.team === 1);
    }
  });
});

describe('huntsMiddle is the skill\'s flag, not the difficulty\'s name (M40)', () => {
  const mid = (() => {
    const centre = (team: number) => {
      const s = DEPOT.spawns[team]!;
      return { x: s.reduce((a, p) => a + p.position.x, 0) / s.length, z: s.reduce((a, p) => a + p.position.z, 0) / s.length };
    };
    return { x: (centre(0).x + centre(1).x) / 2, z: (centre(0).z + centre(1).z) / 2 };
  })();
  const meanFromMiddle = (cfg: BotConfig) => {
    const { bots } = botsOn(DEPOT, cfg);
    const b = bots.bots[0]!;
    const out = vec3();
    let sum = 0;
    for (let i = 0; i < 100; i++) {
      expect(bots.worldForTests.huntPoint(b, out)).toBe(true);
      sum += Math.hypot(out.x - mid.x, out.z - mid.z);
    }
    return sum / 100;
  };

  it('Pro with the flag off hunts like Hard; Hard with it on hunts like Pro', () => {
    const hard = meanFromMiddle(botConfig('hard'));
    const proOff = meanFromMiddle({ ...botConfig('pro'), huntsMiddle: false });
    const hardOn = meanFromMiddle({ ...botConfig('hard'), huntsMiddle: true });
    const pro = meanFromMiddle(botConfig('pro'));
    expect(proOff).toBeGreaterThan(pro * 2);
    expect(hardOn).toBeLessThan(hard / 2);
  });
});
