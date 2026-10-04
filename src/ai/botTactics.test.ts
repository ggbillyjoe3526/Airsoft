import { describe, expect, it } from 'vitest';
import { BOTS, botConfig, DIFFICULTIES, difficultyAtLeast } from '../config/bots';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT, muzzleVelocity } from '../config/replicas';
import { DEPOT } from '../map/depot';
import type { MapBlock } from '../map/mapTypes';
import { TEST_YARD } from '../map/testYard';
import { buildNavGrid, floorAt } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { createRng } from '../sim/rng';
import type { GameState } from '../sim/state';
import { vec3, wrapAngle } from '../sim/vec';
import type { Bot } from './bot';
import type { BotController } from './botController';
import { jitterPoint, keepApart, moveBot, startSearch, teammateSpots } from './botMovement';
import { createCoverSpot, findCover, type TakenSpots } from './cover';
import { boxQuery, depotBots, duel } from './testSupport';

// The final-alpha audit's bot findings (FA4): spacing, cover, behaviour and difficulty. The headless match guards for
// the same work are in depotMatch*.test.ts.

const DT = 1 / 60;
const DEG = Math.PI / 180;
/** Nobody sees anyone (every sight line ends halfway). */
const blind: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 };

const tick = (state: GameState, bots: BotController, seconds: number, each: () => void = () => {}) => {
  for (let i = 0; i < seconds / DT; i++) {
    state.time += DT;
    bots.think(state, DT);
    each();
  }
};

/** A bot's walking direction on the ground from its command, as stepMovement reads it against cmd.yaw. */
function commandDirection(forward: number, right: number, yaw: number): [number, number] {
  return [-Math.sin(yaw) * forward + Math.cos(yaw) * right, -Math.cos(yaw) * forward - Math.sin(yaw) * right];
}

describe('route searches (audit AI-07, AI-10)', () => {
  it('leave the route search to a walk-off search due this tick, and serve the bots the next', () => {
    const { state, bots } = depotBots('elimination', blind);
    const b = bots.bots[0]!;
    b.holdLeft = 100; // holding still: thinking leaves the route alone
    b.routeState = 'wanted';
    b.routeGoal.x = b.character.position.x - 3;
    b.routeGoal.z = b.character.position.z;
    state.characters[0]!.walkOffRoutePending = true; // a Blue player hit last tick
    bots.think(state, DT);
    expect(b.routeState).toBe('wanted');
    state.characters[0]!.walkOffRoutePending = false;
    bots.think(state, DT);
    expect(b.routeState).toBe('ok');
  });

  it('wait routeRetryDelay after a failed route before asking for the next goal', () => {
    const { state, bots } = depotBots('elimination', blind);
    tick(state, bots, 0.1);
    const b = bots.bots[0]!;
    b.holdLeft = 0;
    b.waitForTeam = false;
    b.routeState = 'wanted';
    b.routeGoal.x = 500; // off the map: no route
    b.routeGoal.z = 500;
    let requests = 0;
    tick(state, bots, 0.5, () => {
      if (b.routeState === 'wanted') requests++;
    });
    // One failed search, then it waits instead of asking again every tick.
    expect(b.routeState).toBe('failed');
    expect(requests).toBe(0);
    tick(state, bots, BOTS.routeRetryDelay);
    expect(b.routeState).not.toBe('failed');
  });
});

describe('commands from the view the bot ends the tick with (audit AI-16)', () => {
  it('walk where the bot means to, also on ticks where its view turns', () => {
    // Blinded from the player by a wall; a noise behind it on the way makes it turn while it walks.
    const wall = boxQuery(0, -6, 4, 0.3, 3);
    const { state, bots, run, bot, commands } = duel(12, () => {}, wall);
    const b = bots.bots[0]!;
    const cmd = () => commands.get(bot.id)!;
    let checked = 0;
    let turning = 0;
    let lastYaw = b.aim.yaw;
    run(4, () => {
      const c = cmd();
      if (state.time > 1 && Math.abs(state.time - 1.5) < DT / 2) {
        state.events.push({ type: 'shot', characterId: 0, replicaId: LOADOUT[0]!.id, position: vec3(bot.position.x + 6, 1, bot.position.z - 6) });
        bots.observe(state);
      }
      if ((c.forward !== 0 || c.right !== 0) && b.mode !== 'fight') {
        const [x, z] = commandDirection(c.forward, c.right, c.yaw);
        const len = Math.hypot(x, z);
        const along = (x * b.moveDir.x + z * b.moveDir.z) / (len * Math.hypot(b.moveDir.x, b.moveDir.z));
        expect(along).toBeGreaterThan(1 - 1e-9);
        checked++;
        if (Math.abs(wrapAngle(c.yaw - lastYaw)) > 1 * DEG) turning++;
      }
      lastYaw = c.yaw;
    });
    expect(checked).toBeGreaterThan(30);
    expect(turning).toBeGreaterThan(3);
  });
});

describe('keeping apart (audit AI-01)', () => {
  it('two bots at one spot walk apart; a walking bot bends round a teammate in its way and slows', () => {
    const { state, bots } = depotBots('elimination', blind);
    const w = bots.worldForTests;
    w.time = state.time;
    const [a, b] = bots.bots as [Bot, Bot];
    b.character.position.x = a.character.position.x;
    b.character.position.z = a.character.position.z;
    const cmdA = createCommand();
    const cmdB = createCommand();
    expect(keepApart(a, w, false, cmdA)).toBe(true);
    expect(keepApart(b, w, false, cmdB)).toBe(true);
    expect(a.moveDir.x * b.moveDir.x + a.moveDir.z * b.moveDir.z).toBeLessThan(-0.99); // opposite ways
    expect(cmdA.walk).toBe(true);
    // Walking straight at a teammate 0.4 m ahead: steered off, and slower.
    b.character.position.x = a.character.position.x + 0.4;
    a.moveDir.x = 1;
    a.moveDir.z = 0;
    expect(keepApart(a, w, true, createCommand())).toBe(true);
    expect(Math.hypot(a.moveDir.x, a.moveDir.z)).toBeLessThan(1);
    // Nobody close: untouched.
    b.character.position.x = a.character.position.x + BOTS.separationDistance + 0.1;
    a.moveDir.x = 1;
    a.moveDir.z = 0;
    expect(keepApart(a, w, false, createCommand())).toBe(false);
    expect(a.moveDir.x).toBe(1);
  });

  it("never picks a cover spot where a teammate is or is heading, and lists teammates' spots", () => {
    const { state, bots } = depotBots('elimination', blind);
    const w = bots.worldForTests;
    w.time = state.time;
    const [a, b, c] = bots.bots as [Bot, Bot, Bot];
    b.mode = 'cover';
    b.cover.position.x = 3;
    b.cover.position.z = 4;
    c.mode = 'flag';
    c.flagGoal.x = 7;
    c.flagGoal.z = 8;
    const taken = teammateSpots(a, w);
    const points = taken.points.slice(0, taken.count).map((p) => `${p.x},${p.z}`);
    expect(points).toContain('3,4');
    expect(points).toContain('7,8');
    expect(points).toContain(`${b.character.position.x},${b.character.position.z}`);
    expect(points).not.toContain(`${a.character.position.x},${a.character.position.z}`);
    expect(taken.minGap).toBeCloseTo(2 * BODY.radius + BOTS.coverSpacingMargin);
    // Behind the containers in the middle, from a threat to the west: the first spot found is then taken, and the next
    // search keeps a body's width and a bit from it.
    const from = vec3(6, 0, -4);
    const threat = vec3(-12, BODY.standEyeHeight, -4);
    const first = createCoverSpot();
    const search = { radius: 8, randomCandidates: 24, peekable: false };
    expect(findCover(from, threat, w, createRng(3), first, search)).toBe(true);
    const own: TakenSpots = { points: [first.position], count: 1, minGap: taken.minGap };
    for (let seed = 0; seed < 8; seed++) {
      const next = createCoverSpot();
      if (!findCover(from, threat, w, createRng(seed), next, search, own)) continue;
      expect(Math.hypot(next.position.x - first.position.x, next.position.z - first.position.z)).toBeGreaterThanOrEqual(taken.minGap);
    }
  });

  it('two bots making for one lane point hold side by side', () => {
    // No random jitter, so both would make for the very same spot.
    const { state, bots } = depotBots('elimination', blind, { ...BOTS, laneJitter: 0 });
    tick(state, bots, 0.1);
    const [a, b] = bots.bots as [Bot, Bot];
    for (const x of [a, b]) {
      x.lane = 1;
      x.laneDir = -1; // Orange walks the lanes east to west
      x.laneIndex = 4;
      x.hunting = false;
      x.lanePoints = 10;
      x.holdLeft = 0;
      x.waitForTeam = false;
      x.routeState = 'none';
      x.route.length = 0;
    }
    // a takes the next point first; b, heading the same way, is sent laneHoldOffset to the side of it.
    bots.think(state, DT);
    expect(a.laneIndex).toBe(3);
    expect(b.laneIndex).toBe(3);
    expect(Math.hypot(a.laneGoal.x - b.laneGoal.x, a.laneGoal.z - b.laneGoal.z)).toBeCloseTo(BOTS.laneHoldOffset, 5);
  });
});

describe('points on a raised floor (audit AI-08)', () => {
  it('moves a lane point near the dock’s edge only to spots on the dock', () => {
    const { bots, nav } = depotBots();
    const w = bots.worldForTests;
    const b = bots.bots[0]!;
    const point = DEPOT.lanes[0]![4]!; // on the dock, near its lip
    expect(point.y).toBeGreaterThan(nav.maxStep);
    const out = vec3();
    for (let i = 0; i < 300; i++) {
      jitterPoint(b, w, point, 2, out);
      expect(Math.abs(floorAt(nav, out.x, out.y, out.z) - point.y)).toBeLessThanOrEqual(nav.maxStep);
      expect(out.y).toBeCloseTo(floorAt(nav, out.x, out.y, out.z), 5);
    }
  });
});

describe('cover and holding (audit AI-02, AI-13)', () => {
  it('does not crouch while still waiting for the route to cover, only once there', () => {
    const { bots, player } = duel(12);
    const w = bots.worldForTests;
    const b = bots.bots[0]!;
    b.mode = 'cover';
    b.cover.lean = 0;
    b.coverPhase = 'down';
    b.routeState = 'wanted';
    const cmd = createCommand();
    moveBot(b, w, cmd, DT, player);
    expect(cmd.crouch).toBe(false);
    b.routeState = 'none';
    moveBot(b, w, cmd, DT, player);
    expect(cmd.crouch).toBe(true);
  });

  it('crouches once settled at a lane point it can watch from crouched, and sweeps its view', () => {
    const { state, bots, commands } = depotBots('elimination', blind);
    tick(state, bots, 0.1);
    const b = bots.bots[0]!;
    b.holdLeft = 3;
    b.holdCrouch = true;
    b.teamWait = 0;
    const cmd = () => commands.get(b.character.id)!;
    let crouchedEarly = false;
    let minYaw = Number.POSITIVE_INFINITY;
    let maxYaw = Number.NEGATIVE_INFINITY;
    const start = b.aim.yaw;
    tick(state, bots, 2.5, () => {
      if (b.teamWait < BOTS.holdCrouchDelay - DT && cmd().crouch) crouchedEarly = true;
      const d = wrapAngle(b.aim.yaw - start);
      minYaw = Math.min(minYaw, d);
      maxYaw = Math.max(maxYaw, d);
    });
    expect(crouchedEarly).toBe(false);
    expect(cmd().crouch).toBe(true);
    expect(b.holding).toBe(true);
    expect(maxYaw - minYaw).toBeGreaterThan(BOTS.holdSweepDeg * DEG);
    // Where crouched eyes would see only the crate in front, it holds standing.
    b.holdCrouch = false;
    tick(state, bots, 0.2);
    expect(cmd().crouch).toBe(false);
  });
});

describe('a defender at its post (audit AI-02)', () => {
  it('chooses whether to crouch once, on arrival, keeps that while it stays, and chooses afresh after leaving', () => {
    let open = true; // crouched eyes see the enemy side
    let rays = 0;
    const query: WorldQuery = {
      raycastStatic: (_o, _d, max) => {
        rays++;
        return open ? -1 : max * 0.5;
      },
    };
    const { state, bots } = depotBots('attackDefend', query);
    state.round.attackers = 0; // Blue attacks: the bots (Orange) defend
    const w = bots.worldForTests;
    const b = bots.bots[0]!;
    // Lane walked: nowhere further to go, so it holds where it stands.
    b.mode = 'advance';
    b.lanePoints = 0;
    b.hunting = false;
    b.holdLeft = 0;
    b.waitForTeam = false;
    b.holdCover = false;
    b.routeState = 'none';
    const cmd = createCommand();
    moveBot(b, w, cmd, DT);
    expect(b.holding).toBe(true);
    expect(b.holdCrouch).toBe(true);
    open = false; // the view would now be blocked: but the choice stands for this hold
    rays = 0;
    for (let i = 0; i < 120; i++) moveBot(b, w, cmd, DT);
    expect(rays).toBe(0); // no ray a tick while it stays
    expect(b.holding).toBe(true);
    expect(b.holdCrouch).toBe(true);
    // Off the post for a tick (into cover), then back: a new hold, a new choice.
    b.mode = 'cover';
    moveBot(b, w, cmd, DT);
    b.mode = 'advance';
    moveBot(b, w, cmd, DT);
    expect(rays).toBe(1);
    expect(b.holdCrouch).toBe(false);
  });
});

describe('reacting to fire (audit AI-04, AI-09, AI-15)', () => {
  it('goes after a shooter beyond hearing range whose BB lands close by', () => {
    const wall = boxQuery(0, -20, 4, 0.3, 3);
    const { state, bots, bot, player } = duel(40, () => {}, wall);
    const b = bots.bots[0]!;
    expect(40).toBeGreaterThan(BOTS.hearingDistance);
    state.events.length = 0;
    state.events.push({ type: 'bbImpact', position: vec3(bot.position.x + 0.5, 1.2, bot.position.z), ownerId: player.id });
    bots.observe(state);
    expect(b.hasLastKnown).toBe(true);
    expect(Math.hypot(b.lastKnown.x - player.position.x, b.lastKnown.z - player.position.z)).toBeLessThanOrEqual(BOTS.hearingError * 40 + 1e-6);
  });

  it("takes a teammate's hit call as a bearing, not as the shooter's spot", () => {
    // The teammate is hit by the player 60 m off: the bot's guess lies back along the BB's way from the teammate, no
    // further than gunfire carries, so nowhere near the shooter.
    const { state, player, bots } = duel(60, (s) => s.characters.push(createCharacter(2, vec3(2, 0, -60), 0, LOADOUT, 1)), blind);
    const b = bots.bots[0]!;
    const victim = state.characters[2]!;
    const dir = vec3(victim.position.x - player.position.x, 0, victim.position.z - player.position.z);
    const len = Math.hypot(dir.x, dir.z);
    state.events.length = 0;
    state.events.push({ type: 'characterHit', victimId: 2, shooterId: 0, position: vec3(2, 1.2, -60), direction: vec3(dir.x / len, 0, dir.z / len), ricochet: false });
    bots.observe(state);
    expect(b.hasLastKnown).toBe(true);
    const fromVictim = Math.hypot(b.lastKnown.x - victim.position.x, b.lastKnown.z - victim.position.z);
    expect(fromVictim).toBeLessThanOrEqual(BOTS.hearingDistance * (1 + BOTS.hearingError) + 2);
    expect(b.lastKnown.z).toBeGreaterThan(victim.position.z); // towards the shooter's side
  });

  it('remembers a second enemy heard mid-fight and goes after them once the fight is over', () => {
    const holdFire = { ...BOTS, fireCone: 0 }; // never fires: the player stays in until the test takes them out
    const { state, player, bots, run, bot } = duel(12, (s) => s.characters.push(createCharacter(2, vec3(-12, 0, -24), 0, LOADOUT, 0)), undefined, holdFire);
    const b = bots.bots[0]!;
    run(1);
    expect(b.targetId).toBe(player.id);
    expect(b.targetVisible).toBe(true);
    const other = state.characters[2]!;
    state.events.length = 0;
    state.events.push({ type: 'shot', characterId: 2, replicaId: LOADOUT[0]!.id, position: vec3(other.position.x, 1.4, other.position.z) });
    bots.observe(state);
    expect(b.targetId).toBe(player.id); // still fighting the one in sight
    player.status = 'out';
    run(0.2);
    expect(b.hasLastKnown).toBe(true);
    const d = Math.hypot(other.position.x - bot.position.x, other.position.z - bot.position.z);
    expect(Math.hypot(b.lastKnown.x - other.position.x, b.lastKnown.z - other.position.z)).toBeLessThanOrEqual(BOTS.hearingError * d + 1);
  });
});

describe('search (audit AI-14, AI-17)', () => {
  it('looks round, crouched, at the spot it searched before giving up', () => {
    const wall = boxQuery(0, -6, 4, 0.3, 3);
    const { state, bots, run, bot, commands } = duel(12, () => {}, wall);
    const b = bots.bots[0]!;
    run(0.1);
    b.mode = 'search';
    b.hasLastKnown = true;
    b.heardAt = state.time;
    b.lastKnown.x = bot.position.x + 0.2;
    b.lastKnown.z = bot.position.z;
    b.routeState = 'none';
    b.flanking = false;
    let arrivedAt = -1;
    let gaveUpAt = -1;
    let minYaw = Number.POSITIVE_INFINITY;
    let maxYaw = Number.NEGATIVE_INFINITY;
    run(4, () => {
      if (arrivedAt < 0 && b.searchLookLeft > 0) arrivedAt = state.time;
      if (b.searchLookLeft > 0) {
        expect(commands.get(bot.id)!.crouch).toBe(true);
        const d = wrapAngle(b.aim.yaw - b.searchLookYaw);
        minYaw = Math.min(minYaw, d);
        maxYaw = Math.max(maxYaw, d);
      }
      if (arrivedAt >= 0 && gaveUpAt < 0 && !b.hasLastKnown) gaveUpAt = state.time;
    });
    expect(arrivedAt).toBeGreaterThan(0);
    expect(gaveUpAt - arrivedAt).toBeGreaterThanOrEqual(BOTS.searchLook[0] - DT);
    expect(gaveUpAt - arrivedAt).toBeLessThanOrEqual(BOTS.searchLook[1] + 2 * DT);
    expect(maxYaw - minYaw).toBeGreaterThan(90 * DEG);
  });

  it('flanks far searches on Hard (round a point off the straight way), never on Easy', () => {
    const { bots, nav } = depotBots('elimination', blind);
    const w = bots.worldForTests;
    const b = bots.bots[0]!;
    b.character.position.x = 15;
    b.character.position.z = 0;
    b.lastKnown.x = 0;
    b.lastKnown.y = 0;
    b.lastKnown.z = 0;
    const flanks = (level: 'easy' | 'hard') => {
      (b as { skill: unknown }).skill = botConfig(level);
      let n = 0;
      for (let i = 0; i < 100; i++) {
        startSearch(b, w);
        if (!b.flanking) continue;
        n++;
        // Off the straight way by flankOffset, flankBack short of the spot, on the spot's floor.
        expect(Math.abs(b.flankGoal.z)).toBeCloseTo(BOTS.flankOffset);
        expect(b.flankGoal.x).toBeCloseTo(BOTS.flankBack);
        expect(b.flankGoal.y).toBe(floorAt(nav, b.flankGoal.x, b.flankGoal.y, b.flankGoal.z));
      }
      return n;
    };
    expect(flanks('easy')).toBe(0);
    expect(flanks('hard')).toBeGreaterThan(50);
    // Too close to bother.
    b.lastKnown.x = 15 - BOTS.flankMinDistance + 1;
    (b as { skill: unknown }).skill = botConfig('hard');
    for (let i = 0; i < 20; i++) {
      startSearch(b, w);
      expect(b.flanking).toBe(false);
    }
  });

  it('play the tactics by level: Hard takes cover sooner, holds less and flanks more than Easy', () => {
    const [easy, normal, hard, pro] = (['easy', 'normal', 'hard', 'pro'] as const).map((l) => botConfig(l));
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['easy', 'normal', 'hard', 'pro']);
    for (const [lo, hi] of [
      [easy!, normal!],
      [normal!, hard!],
    ] as const) {
      expect(hi.holdCoverChance).toBeGreaterThan(lo.holdCoverChance);
      expect(hi.flankChance).toBeGreaterThan(lo.flankChance);
      expect(hi.searchWalkDistance).toBeGreaterThan(lo.searchWalkDistance);
      expect(hi.contactCoverMinDistance).toBeLessThan(lo.contactCoverMinDistance);
      expect(hi.holdTime[1]).toBeLessThanOrEqual(lo.holdTime[1]);
    }
    // Pro (M36) is Hard played patiently: more cover, a longer silent walk-in and no less flanking, but longer holds.
    expect(pro!.holdCoverChance).toBeGreaterThan(hard!.holdCoverChance);
    expect(pro!.searchWalkDistance).toBeGreaterThan(hard!.searchWalkDistance);
    expect(pro!.contactCoverMinDistance).toBeLessThan(hard!.contactCoverMinDistance);
    expect(pro!.flankChance).toBeGreaterThanOrEqual(hard!.flankChance);
    expect(pro!.holdTime[1]).toBeGreaterThan(hard!.holdTime[1]);
  });

  it('ranks Pro above Hard: sharper aim, but never dead on and no faster to react to a surprise (M36)', () => {
    const [hard, pro] = (['hard', 'pro'] as const).map((l) => botConfig(l));
    expect(pro!.aimErrorSettledDeg).toBeLessThan(hard!.aimErrorSettledDeg);
    expect(pro!.aimSettleTime).toBeLessThan(hard!.aimSettleTime);
    expect(pro!.leadFactor).toBeGreaterThan(hard!.leadFactor);
    expect(pro!.aimErrorStartMetres).toBeGreaterThan(0);
    expect(pro!.reactionTime[0]).toBeGreaterThanOrEqual(hard!.reactionTime[0]);
    expect(difficultyAtLeast('pro', 'hard')).toBe(true);
    expect(difficultyAtLeast('hard', 'hard')).toBe(true);
    expect(difficultyAtLeast('normal', 'hard')).toBe(false);
  });
});

describe('fighting in tight spots (audit AI-05, KNOWN_ISSUES row 90)', () => {
  /** A duel at 12 m on the test yard with walls beside the bot (it faces +z: its right is -x). */
  function walledDuel(blocks: MapBlock[]) {
    const map = { ...TEST_YARD, blocks: [...TEST_YARD.blocks, ...blocks] };
    const nav = buildNavGrid(map, NAV);
    const queries = blocks.map((k) => boxQuery(k.center.x, k.center.z, k.size.x / 2, k.size.z / 2, k.size.y));
    const query: WorldQuery = {
      raycastStatic(o, d, max) {
        let best = -1;
        for (const q of queries) {
          const t = q.raycastStatic(o, d, max);
          if (t >= 0 && (best < 0 || t < best)) best = t;
        }
        return best;
      },
    };
    const holdFire = { ...BOTS, fireCone: 0 };
    return duel(12, () => {}, query, holdFire, 7, [], [], nav);
  }
  const wallAt = (x: number): MapBlock => ({ kind: 'wall', center: vec3(x, 1.5, -12), size: vec3(0.4, 3, 3) });

  function strafes(d: ReturnType<typeof walledDuel>) {
    const w = d.bots.worldForTests;
    const b = d.bots.bots[0]!;
    d.run(0.05);
    b.mode = 'fight';
    b.fromCover = false;
    b.targetVisible = true;
    b.targetId = d.player.id;
    const seen = { right: 0, left: 0, forward: 0 };
    for (let i = 0; i < 600; i++) {
      const cmd = createCommand();
      moveBot(b, w, cmd, DT, d.player);
      if (cmd.right > 0) seen.right++;
      if (cmd.right < 0) seen.left++;
      if (cmd.forward !== 0) seen.forward++;
    }
    return seen;
  }

  it('never sidesteps into a wall beside it, but still steps the other way', () => {
    const d = walledDuel([wallAt(-0.9)]);
    expect(Math.abs(wrapAngle(d.bot.yaw - Math.PI))).toBeLessThan(1e-6); // facing +z: its right is -x, where the wall is
    const seen = strafes(d);
    expect(seen.right).toBe(0);
    expect(seen.left).toBeGreaterThan(300);
  });

  it('on a walkway with walls both sides, steps forward and back instead of standing still', () => {
    const seen = strafes(walledDuel([wallAt(-0.9), wallAt(0.9)]));
    expect(seen.right + seen.left).toBe(0);
    expect(seen.forward).toBeGreaterThan(500);
  });
});

describe('friendly fire with a teammate running across the line', () => {
  it('holds fire for a teammate about to cross the line close in front, judged at the moment the BBs pass them', () => {
    // The target 12 m ahead; a teammate 3 m out, just beside the line, running across it. The BBs reach them in
    // 3 m / muzzle velocity, by when they are in the line; judged at the end of the BBs' reach they'd be long past it.
    const speed = muzzleVelocity(LOADOUT[0]!);
    const across = 6;
    const SIDE = 0.65;
    const run1 = (moving: boolean) => {
      const { state, run, bot, commands } = duel(12, (s) => s.characters.push(createCharacter(2, vec3(-SIDE, 0, -9), 0, LOADOUT, 1)));
      const mate = state.characters[2]!;
      let fired = 0;
      run(2.5, () => {
        mate.position.x = -SIDE;
        mate.position.z = -9;
        mate.velocity.x = moving ? across : 0;
        mate.velocity.z = 0;
        bot.position.x = 0; // the shooter stays put (no sidestep), so the line stays where it is
        bot.position.z = -12;
        if (commands.get(bot.id)!.fire) fired++;
      });
      return fired;
    };
    // In the line (within body radius + friendlyMargin) as the BBs pass; well past it on the far side by the reach's end.
    const reachOfLine = HITS.bodyRadius + BOTS.friendlyMargin;
    expect(SIDE).toBeGreaterThan(reachOfLine);
    expect(Math.abs(-SIDE + across * (3 / speed))).toBeLessThan(reachOfLine - 0.05);
    expect(-SIDE + across * ((12 + BOTS.friendlyBeyondTarget - 3) / speed)).toBeGreaterThan(reachOfLine);
    expect(run1(false)).toBeGreaterThan(0); // standing beside the line: clear to fire
    expect(run1(true)).toBe(0);
  });

  it('leaves more room round a teammate far down the line than one close by: BBs stray further the further they fly', () => {
    // No aim error, so the aim line runs exactly at the target; a teammate stands 0.65 m beside it, close in front or
    // 20 m down the line (8 m past the target).
    const steady = { ...BOTS, aimErrorStartDeg: 0, aimErrorSettledDeg: 0, aimErrorStartMetres: 0, aimErrorMovingDeg: 0, aimErrorTracking: 0 };
    const fires = (z: number) => {
      const { run, bot, commands, state } = duel(12, (s) => s.characters.push(createCharacter(2, vec3(0.65, 0, z), 0, LOADOUT, 1)), undefined, steady);
      let fired = 0;
      run(2, () => {
        bot.position.x = 0;
        bot.position.z = -12;
        state.characters[0]!.status = 'alive'; // the target stays in play
        if (commands.get(bot.id)!.fire) fired++;
      });
      return fired;
    };
    expect(fires(-9)).toBeGreaterThan(0);
    expect(fires(8)).toBe(0);
  });
});

describe('Attack / Defend: one raiser (audit AI-06)', () => {
  it('sends one attacker to raise the flag and the others to guard the pole from round it, handing the rope on', () => {
    const { state, bots } = depotBots('attackDefend', blind);
    state.round.attackers = 1; // Orange attacks
    state.events.length = 0;
    state.events.push({ type: 'roundStart', round: 5 });
    bots.observe(state);
    for (const b of bots.bots) b.laneDone = true;
    tick(state, bots, 0.2);
    const pole = state.round.flag.position;
    const raisers = bots.bots.filter((b) => b.raiser);
    expect(raisers).toHaveLength(1);
    expect(Math.hypot(raisers[0]!.flagGoal.x - pole.x, raisers[0]!.flagGoal.z - pole.z)).toBeLessThanOrEqual(BOTS.flagStand + 1e-9);
    for (const b of bots.bots.filter((x) => !x.raiser)) {
      expect(b.mode).toBe('flag');
      expect(b.flagGuard).toBe(true);
      const d = Math.hypot(b.flagGoal.x - pole.x, b.flagGoal.z - pole.z);
      expect(d).toBeGreaterThan(FLAG.radius);
      expect(d).toBeLessThanOrEqual(BOTS.flagGuardRadius + 1e-9);
    }
    // A raiser in a fight at the rope stays on it: no sidestep out of the pole's reach.
    const raiser = raisers[0]!;
    raiser.character.position.x = pole.x + 0.5;
    raiser.character.position.z = pole.z;
    raiser.mode = 'fight';
    raiser.fromCover = false;
    const cmd = createCommand();
    for (let i = 0; i < 120; i++) moveBot(raiser, bots.worldForTests, cmd, DT);
    expect(cmd.right).toBe(0);
    expect(cmd.forward).toBe(0);
    raiser.mode = 'flag';
    // A guard right by the pole takes the rope from a raiser still well on its way (more than raiserSwitchMargin
    // further), and keeps it.
    const guard = bots.bots.find((b) => !b.raiser)!;
    raiser.character.position.x = pole.x + 10;
    guard.character.position.x = pole.x + 1;
    guard.character.position.z = pole.z;
    tick(state, bots, 0.1);
    expect(guard.raiser).toBe(true);
    expect(raiser.raiser).toBe(false);
    // The raiser is hit: a guard takes over.
    guard.character.status = 'out';
    tick(state, bots, 0.2);
    const next = bots.bots.filter((b) => b.raiser);
    expect(next).toHaveLength(1);
    expect(next[0]!.flagGuard).toBe(false);
    // The player (an attacker, not a bot) at the rope: no bot raises.
    const me = createCharacter(9, vec3(pole.x, 0, pole.z), 0, LOADOUT, 1);
    state.characters.push(me);
    tick(state, bots, 0.2);
    expect(bots.bots.filter((b) => b.raiser)).toHaveLength(0);
  });
});

describe('KNOWN_ISSUES rows (49, 93, 94)', () => {
  it('row 49: switching back to a recent contact rolls that contact a new aim error', () => {
    let hideB = true;
    const blinds: WorldQuery = { raycastStatic: (o, d, max) => (hideB && o.x + d.x * max > 1.5 ? max * 0.5 : -1) };
    const holdFire = { ...BOTS, fireCone: 0 };
    const { bots, run } = duel(14, (s) => s.characters.push(createCharacter(2, vec3(3, 0, -9), 0, LOADOUT, 0)), blinds, holdFire);
    const b = bots.bots[0]!;
    run(1);
    hideB = false;
    run(0.25);
    expect(b.targetId).toBe(2);
    // An aim error no fresh one could be: switching back to A must replace it.
    b.aim.errYaw = b.aim.goalErrYaw = 5;
    b.aim.wanderLeft = 100;
    hideB = true;
    for (let i = 0; i < 30 && b.targetId !== 0; i++) run(DT);
    expect(b.targetId).toBe(0);
    expect(Math.abs(b.aim.errYaw)).toBeLessThanOrEqual(1);
  });

  it('row 93: a heard guess on the dock lies at the dock’s height', () => {
    const { state, bots, nav } = depotBots('elimination', blind);
    tick(state, bots, 0.1);
    const b = bots.bots[0]!;
    const shooter = state.characters[0]!;
    const dock = DEPOT.lanes[0]![4]!;
    shooter.position.x = dock.x;
    shooter.position.y = dock.y;
    shooter.position.z = dock.z;
    b.character.position.x = dock.x + 6;
    b.character.position.z = dock.z + 4;
    state.events.length = 0;
    state.events.push({ type: 'shot', characterId: shooter.id, replicaId: LOADOUT[0]!.id, position: vec3(dock.x, dock.y + 1.4, dock.z) });
    bots.observe(state);
    expect(b.hasLastKnown).toBe(true);
    expect(b.lastKnown.y).toBeGreaterThan(nav.maxStep);
    expect(b.lastKnown.y).toBe(floorAt(bots.worldForTests.nav, b.lastKnown.x, b.lastKnown.y, b.lastKnown.z));
  });

  it('row 94: a raiser with no way to the pole tries again later instead of standing for good', () => {
    const { state, bots } = depotBots('attackDefend', blind);
    state.round.attackers = 1;
    state.events.length = 0;
    state.events.push({ type: 'roundStart', round: 5 });
    bots.observe(state);
    const b = bots.bots[0]!;
    b.laneDone = true;
    tick(state, bots, 0.2);
    expect(b.mode).toBe('flag');
    b.flagGoal.x = state.round.flag.position.x;
    b.flagGoal.z = state.round.flag.position.z;
    b.routeState = 'failed';
    b.routeRetryAt = state.time + BOTS.routeRetryDelay;
    tick(state, bots, BOTS.routeRetryDelay / 2);
    expect(b.routeState).toBe('failed');
    tick(state, bots, BOTS.routeRetryDelay);
    expect(b.routeState).not.toBe('failed');
  });
});
