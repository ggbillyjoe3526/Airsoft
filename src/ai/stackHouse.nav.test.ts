import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { STACK_HOUSE } from '../map/testYard';
import { buildNavGrid, floorAt, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { createRng } from '../sim/rng';
import { vec3 } from '../sim/vec';
import type { Bot, BotWorld } from './bot';
import { jitterPoint, moveBot } from './botMovement';
import { createCoverSpot, findCover, lowCoverBlocks, tallCoverBlocks } from './cover';
import { followSpot, holdPoint, placeHold } from './squadOrders';
import { duel, noWalls } from './testSupport';

// M34b: the bot code that reads the nav grid with a height (cover, squad orders, jitter, strafing), on the Stack House,
// where the upper floor (3 m up) lies over the hall's floor. Planning only, no match: each test is a few milliseconds.

const DT = 1 / 60;
const STOREY = 3;
const nav = buildNavGrid(STACK_HOUSE, NAV);
const lowCover = lowCoverBlocks(STACK_HOUSE.blocks, nav, BODY, BOTS.lowCoverFloorGap);
const tallCover = tallCoverBlocks(STACK_HOUSE.blocks, nav, BODY, BOTS.lowCoverFloorGap);
const rest = PHYSICS.groundRestGap;

let physics: PhysicsWorld;
beforeAll(async () => {
  await initPhysics();
  physics = new PhysicsWorld(STACK_HOUSE, BODY, DT);
});

const has = (list: readonly { x: number; z: number }[], x: number, z: number) => list.some((b) => b.x === x && b.z === z);

describe('cover on stacked floors (M34b)', () => {
  it('counts crates and pillars on either floor of a cell as cover, each against the floor it stands on', () => {
    // The crates upstairs (floor 3), in the hall (floor 0, under the upper floor) and out in the yards.
    for (const [x, z] of [[-3, 4], [3, -4], [0, 0], [-11, -3], [11, 3]] as const) expect(has(lowCover, x, z), `crate ${x},${z}`).toBe(true);
    // The hall's pillars (2.7 m, floor 0) and the splitting wall upstairs (2.7 m over floor 3) are full-height cover.
    for (const [x, z] of [[-3, -4], [3, 4], [0, 0]] as const) expect(has(tallCover, x, z), `tall ${x},${z}`).toBe(true);
    expect(has(lowCover, -3, -4)).toBe(false); // a pillar is not low cover
  });

  it('puts a bot upstairs behind cover on the upper floor, and one in the hall behind cover in the hall', () => {
    const world = { nav, query: physics, cfg: BOTS, body: BODY, hits: HITS, lowCover, tallCover };
    const threatEye = (x: number, y: number, z: number) => vec3(x, y + BODY.standEyeHeight, z);
    let up = 0;
    let down = 0;
    for (let seed = 0; seed < 12; seed++) {
      // The same x and z either way (the hall is under the upper floor), a threat to the east on the same floor.
      const spotUp = createCoverSpot();
      if (findCover(vec3(-2, STOREY + rest, 4), threatEye(4, STOREY, 4), world, createRng(seed), spotUp)) {
        up++;
        expect(spotUp.position.y, `up, seed ${seed}`).toBeGreaterThan(STOREY - 0.1);
        expect(isWalkableAt(nav, spotUp.position.x, spotUp.position.y, spotUp.position.z)).toBe(true);
      }
      const spotDown = createCoverSpot();
      if (findCover(vec3(-2, rest, 4), threatEye(4, 0, 4), world, createRng(seed), spotDown)) {
        down++;
        expect(spotDown.position.y, `down, seed ${seed}`).toBeLessThan(1);
      }
    }
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
  });
});

describe('squad orders on stacked floors (M34b)', () => {
  const w = { nav } as unknown as BotWorld;
  const leader = (x: number, y: number, z: number, yaw: number) => {
    const c = createCharacter(0, vec3(x, y, z), yaw, LOADOUT, 0);
    c.grounded = true;
    return c;
  };

  it('follow me upstairs: every spot is on the upper floor; the same x and z downstairs, every spot is in the hall', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const slot of [0, 1, 2, 3]) {
        const up = followSpot(leader(-2, STOREY, 4, heading), heading, slot, w, vec3());
        expect(floorAt(nav, up.x, up.y, up.z), `up, heading ${heading} slot ${slot}`).toBe(STOREY);
        const down = followSpot(leader(-2, 0, 4, heading), heading, slot, w, vec3());
        expect(floorAt(nav, down.x, down.y, down.z), `down, heading ${heading} slot ${slot}`).toBe(0);
      }
    }
  });

  it('follow me at the balcony’s open edge: spots stay on the upper floor or on you, never in the street below', () => {
    let snapped = 0;
    // The upper floor's west edge is open from z 1 to 4 (the drop to the hall's door); its x is -6.
    for (const heading of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
      for (const x of [-5.6, -5.7, -5.8, -5.9, -5.99]) {
        if (!isWalkableAt(nav, x, STOREY, 2.5)) snapped++;
        for (const slot of [0, 1, 2, 3]) {
          const p = leader(x, STOREY, 2.5, heading);
          const out = followSpot(p, heading, slot, w, vec3());
          const onYou = out.x === p.position.x && out.y === p.position.y && out.z === p.position.z;
          if (!onYou) expect(floorAt(nav, out.x, out.y, out.z), `slot ${slot} at x ${x} heading ${heading}`).toBe(STOREY);
        }
      }
    }
    expect(snapped, 'the edge is inside the margin the nav grid keeps from a drop').toBeGreaterThan(0);
  });

  it('hold here on the upper floor puts every bot’s spot on that floor, and in the hall the point is in the hall', () => {
    const bots = [0, 1, 2].map(() => ({ orderGoal: vec3() }) as unknown as Bot);
    const world = { nav, query: physics, body: BODY, hits: HITS } as unknown as BotWorld;
    const looker = leader(-3, STOREY, -2, -Math.PI / 2); // facing east, at the splitting wall x 0
    const out = vec3();
    expect(holdPoint(looker, world, out)).toBe(true);
    expect(out.y).toBe(STOREY);
    expect(out.x).toBeGreaterThan(-3);
    placeHold(bots, looker, out, world);
    for (const b of bots) expect(floorAt(nav, b.orderGoal.x, b.orderGoal.y, b.orderGoal.z)).toBe(STOREY);
    // Downstairs, the pillar at x -3, z -4 is what a leader at the same x and z sees: the point is in the hall.
    const below = leader(-4.5, 0, -4, -Math.PI / 2);
    expect(holdPoint(below, world, out)).toBe(true);
    expect(out.y).toBe(0);
  });

  it('hold here looking down off the balcony marks the street below, not the balcony', () => {
    const world = { nav, query: physics, body: BODY, hits: HITS } as unknown as BotWorld;
    const looker = leader(-5.4, STOREY, 2.5, Math.PI / 2); // facing west, over the open edge
    looker.pitch = -0.7;
    const out = vec3();
    expect(holdPoint(looker, world, out)).toBe(true);
    expect(out.x).toBeLessThan(-6);
    expect(out.y).toBe(0);
  });
});

describe('bot movement at height on stacked floors (M34b)', () => {
  it('moves a point near the balcony edge only to spots on the upper floor, and one under it only to spots in the hall', () => {
    const { bots } = duel(12, () => {}, noWalls, BOTS, 7, [], [], nav);
    const w = bots.worldForTests;
    const b = bots.bots[0]!;
    const out = vec3();
    for (const [y, expected] of [[STOREY, STOREY], [0, 0]] as const) {
      const point = vec3(-5.2, y, 2.5);
      for (let i = 0; i < 300; i++) {
        jitterPoint(b, w, point, 2, out);
        expect(floorAt(nav, out.x, out.y, out.z), `y ${y}, try ${i}`).toBe(expected);
        expect(out.y).toBe(expected);
      }
    }
  });

  it('never sidesteps off the balcony’s open edge, but strafes freely through the hall door below it', () => {
    const { bots, bot } = duel(12, () => {}, noWalls, { ...BOTS, fireCone: 0 }, 7, [], [], nav);
    const w = bots.worldForTests;
    const b = bots.bots[0]!;
    const strafes = (y: number) => {
      // Facing +z (yaw pi), the bot's right is -x: towards the west edge (x -6) at z 2.5, which is open upstairs and
      // is the hall's west door downstairs.
      bot.position.x = -5.4;
      bot.position.y = y;
      bot.position.z = 2;
      b.aim.yaw = Math.PI;
      b.mode = 'fight';
      b.fromCover = false;
      b.targetVisible = false;
      const seen = { right: 0, left: 0 };
      for (let i = 0; i < 600; i++) {
        const cmd = createCommand();
        moveBot(b, w, cmd, DT, undefined);
        if (cmd.right > 0) seen.right++;
        if (cmd.right < 0) seen.left++;
      }
      return seen;
    };
    const up = strafes(STOREY);
    expect(up.right).toBe(0);
    expect(up.left).toBeGreaterThan(300);
    const down = strafes(0);
    expect(down.right).toBeGreaterThan(0);
  });
});
