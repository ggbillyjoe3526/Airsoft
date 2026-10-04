import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, botConfig, type BotConfig } from '../config/bots';
import { BODY } from '../config/movement';
import { DEPOT } from '../map/depot';
import type { MapBlock, MapData } from '../map/mapTypes';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { OPEN_FIELD } from '../sim/testSupport';
import { type Vec3, vec3, wrapAngle } from '../sim/vec';
import { lookAngles } from './aim';
import type { Bot } from './bot';
import { pushingLate } from './botBrain';
import { playMatch } from './depotMatchSupport';
import { eyeOf, lineClear } from './perception';
import { depotBots, skirmish } from './testSupport';

// Clearing corners and team play (M38): what Pro bots do that the levels below don't.

const DEG = Math.PI / 180;
const DT = 1 / 60;

const setSkill = (b: Bot, level: 'hard' | 'pro' | BotConfig) => {
  (b as { skill: unknown }).skill = typeof level === 'string' ? botConfig(level) : level;
};

const box = (kind: MapBlock['kind'], x: number, z: number, sx: number, sy: number, sz: number): MapBlock => ({ kind, center: vec3(x, sy / 2, z), size: vec3(sx, sy, sz) });

/** The open field with these blocks and lanes (each lane listed in Orange's walking order: Orange walks lanes last to first). */
const field = (blocks: MapBlock[], lanes: Vec3[][] = []): MapData => ({ ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, ...blocks], lanes: lanes.map((l) => [...l].reverse()) });

// A closed hut (a container) where Blue hides: unseen, and silent while standing still.
const HUT = box('container', 30, 30, 4, 3, 4);

/** Empty magazines all round: these tests are about moving and looking, not shooting. */
function unarmed(chars: readonly { armament: { ammo: { mag: number; pouch: number[] }[] } }[]): void {
  for (const c of chars) {
    c.armament.ammo[0]!.mag = 0;
    c.armament.ammo[0]!.pouch.fill(0);
  }
}

describe('clearing corners near the enemy', () => {
  // Orange walks a lane south past the end of a wall on its left: a corner someone could step round.
  const map = field([HUT, box('wall', -10, -24, 18, 3, 1)], [[vec3(0, 0, -16), vec3(0, 0, -22), vec3(0, 0, -30), vec3(3, 0, -40)]]);

  function walkLane(level: 'hard' | 'pro') {
    const { bots, run, commands, state } = skirmish(map, [
      [30, 30, 0],
      [0, -12, 1],
    ]);
    unarmed(state.characters);
    const b = bots.bots[0]!;
    setSkill(b, level);
    const w = bots.worldForTests;
    // Past the middle of the map, nobody seen or heard.
    (w as { inEnemyHalf: (x: Bot) => boolean }).inEnemyHalf = () => true;
    const cmd = commands.get(b.character.id)!;
    let moving = 0;
    let walked = 0;
    let sprinted = 0;
    let onCorner = 0;
    const eye = vec3();
    const look = { yaw: 0, pitch: 0 };
    run(6, () => {
      if (cmd.forward === 0 && cmd.right === 0) return;
      moving++;
      if (cmd.walk) walked++;
      if (cmd.sprint) sprinted++;
      if (b.heldAngleCount === 0) return;
      eyeOf(b.character, w.body, w.hits, eye);
      const a = b.heldAngles[0]!;
      lookAngles(eye.x, eye.y, eye.z, a.point.x, a.point.y, a.point.z, look);
      if (Math.abs(wrapAngle(b.aim.yaw - look.yaw)) < 5 * DEG) onCorner++;
    });
    return { b, moving, walked, sprinted, onCorner };
  }

  it('walks, never sprints, and aims at the corner ahead instead of where it walks (Pro)', () => {
    const pro = walkLane('pro');
    expect(pro.b.hunting).toBe(false);
    expect(pro.moving).toBeGreaterThan(60);
    expect(pro.walked).toBe(pro.moving);
    expect(pro.sprinted).toBe(0);
    expect(pro.onCorner).toBeGreaterThan(pro.moving / 4);
    // Hard runs its lane looking where it goes.
    const hard = walkLane('hard');
    expect(hard.moving).toBeGreaterThan(60);
    expect(hard.walked).toBeLessThan(hard.moving / 2);
    expect(hard.onCorner).toBe(0);
  });

  it('runs when it is hunting with nothing heard, even in the enemy half', () => {
    const { bots, run, commands, state } = skirmish(field([HUT]), [
      [30, 30, 0],
      [0, -12, 1],
    ]);
    unarmed(state.characters);
    const b = bots.bots[0]!;
    setSkill(b, 'pro');
    (bots.worldForTests as { inEnemyHalf: (x: Bot) => boolean }).inEnemyHalf = () => true;
    const cmd = commands.get(b.character.id)!;
    let moving = 0;
    let walked = 0;
    run(3, () => {
      if (cmd.forward === 0 && cmd.right === 0) return;
      moving++;
      if (cmd.walk) walked++;
    });
    // No lanes on this field: it hunts from the start.
    expect(b.hunting).toBe(true);
    expect(moving).toBeGreaterThan(60);
    expect(walked).toBeLessThan(moving / 2);
  });
});

describe('watching where someone ducked out of sight', () => {
  // Blue's player stands in the open 12 m off, then steps into the hut.
  const map = field([HUT]);

  function lose(level: 'hard' | 'pro', seed: number) {
    const { player, bots, run, state, commands } = skirmish(
      map,
      [
        [0, 0, 0],
        [0, -12, 1],
      ],
      BOTS,
      seed,
    );
    unarmed(state.characters);
    const b = bots.bots[0]!;
    setSkill(b, level);
    run(0.5);
    expect(b.targetVisible).toBe(true);
    player.position.x = 30;
    player.position.z = 30;
    const lostAt = state.time;
    const cmd = commands.get(b.character.id)!;
    // How long until it sets off after them (the first step it takes in search mode).
    let stillFor = Number.NaN;
    run(4, () => {
      if (Number.isNaN(stillFor) && b.mode === 'search' && (cmd.forward !== 0 || cmd.right !== 0)) stillFor = state.time - lostAt;
    });
    return { b, stillFor, lostAt };
  }

  it('stays and watches the spot for a moment before going after them (Pro); Hard goes at once', () => {
    const pro = botConfig('pro');
    for (const seed of [1, 2, 3]) {
      const { b, stillFor, lostAt } = lose('pro', seed);
      // It notices the loss at its next look (thinkInterval).
      expect(b.watchUntil - lostAt).toBeGreaterThanOrEqual(pro.peekWatchTime[0]);
      expect(b.watchUntil - lostAt).toBeLessThanOrEqual(pro.peekWatchTime[1] + BOTS.thinkInterval + DT);
      expect(stillFor).toBeGreaterThanOrEqual(pro.peekWatchTime[0]);
      const hard = lose('hard', seed);
      expect(hard.stillFor).toBeLessThan(0.5);
      expect(hard.b.watchUntil).toBe(Number.NEGATIVE_INFINITY);
    }
  });

  it('watches at head height there, and answers a re-peek from that spot as pre-aimed', () => {
    const { player, bots, run, state } = skirmish(
      map,
      [
        [0, 0, 0],
        [0, -12, 1],
      ],
      BOTS,
      2,
    );
    unarmed(state.characters);
    const b = bots.bots[0]!;
    setSkill(b, 'pro');
    run(0.5);
    const x = player.position.x;
    const z = player.position.z;
    player.position.x = 30;
    player.position.z = 30;
    // Out of sight for longer than contactGrace (a new contact when they come back), still within the watch.
    run(BOTS.contactGrace + 0.2);
    expect(state.time).toBeLessThan(b.watchUntil);
    const eye = vec3();
    eyeOf(b.character, BODY, bots.worldForTests.hits, eye);
    const head = { yaw: 0, pitch: 0 };
    lookAngles(eye.x, eye.y, eye.z, x, BODY.standEyeHeight, z, head);
    expect(Math.abs(wrapAngle(b.aim.yaw - head.yaw))).toBeLessThan(2 * DEG);
    expect(Math.abs(b.aim.pitch - head.pitch)).toBeLessThan(2 * DEG);
    player.position.x = x;
    player.position.z = z;
    let delay = Number.NaN;
    let settled = Number.NaN;
    run(0.3, () => {
      if (Number.isNaN(delay) && b.targetVisible && b.contact) {
        delay = b.contact.reactAt - state.time;
        settled = state.time - b.contact.acquiredAt;
      }
    });
    const pro = botConfig('pro');
    expect(delay).toBeLessThanOrEqual(pro.preAimReactionTime[1]);
    expect(settled).toBeCloseTo(pro.preAimSettled * pro.aimSettleTime, 1);
  });
});

describe('trading a hit teammate', () => {
  // Blue's player shoots from behind a wall; Orange's first bot is hit 15 m off, its teammate 4 m beside it.
  const wall = box('wall', 0, -5, 14, 3, 0.4);

  function trade(level: 'hard' | 'pro', blocks: MapBlock[] = [wall], shooterZ = 0) {
    const { state, player, bots, run, commands } = skirmish(field(blocks), [
      [0, shooterZ, 0],
      [0, -15, 1],
      [4, -16, 1],
    ]);
    // Armed (an empty magazine would end any cover at once), but nobody is in sight to shoot at.
    for (const b of bots.bots) setSkill(b, level);
    const [victim, mate] = bots.bots as [Bot, Bot];
    state.events.length = 0;
    state.events.push({ type: 'characterHit', victimId: victim.character.id, shooterId: player.id, position: vec3(0, 1.2, -15), direction: vec3(0, 0, -1), ricochet: false });
    victim.character.status = 'walkingOff';
    bots.observe(state);
    const cmd = commands.get(mate.character.id)!;
    let walking = 0;
    let moving = 0;
    let peeked = false;
    const start = vec3(mate.character.position.x, 0, mate.character.position.z);
    run(3, () => {
      if (cmd.forward !== 0 || cmd.right !== 0) {
        moving++;
        if (cmd.walk) walking++;
      }
      if (mate.mode === 'cover' && mate.coverPhase === 'peek') peeked = true;
    });
    const p = mate.character.position;
    const closed = Math.hypot(start.x - mate.lastKnown.x, start.z - mate.lastKnown.z) - Math.hypot(p.x - mate.lastKnown.x, p.z - mate.lastKnown.z);
    return { mate, walking, moving, peeked, closed };
  }

  it('goes for where the shot came from at a run (Pro); Hard creeps up on it', () => {
    const pro = trade('pro');
    expect(pro.mate.tradeAt).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    expect(pro.moving).toBeGreaterThan(60);
    expect(pro.walking).toBe(0);
    const hard = trade('hard');
    expect(hard.mate.tradeAt).toBe(Number.NEGATIVE_INFINITY);
    expect(hard.walking).toBeGreaterThan(hard.moving / 2);
    expect(pro.closed).toBeGreaterThan(hard.closed + 1);
  });

  it('peeks from cover near it towards the shot when there is some (Pro)', () => {
    // The shooter out of sight beyond viewDistance (the hit call puts them hearingDistance back along the BB's way), and
    // a crate a couple of metres off, between the teammate and there.
    const crate = box('crate', 3, -13, 2, 1.2, 0.6);
    const pro = trade('pro', [crate], 30);
    expect(pro.peeked).toBe(true);
    // Hard doesn't: it heads straight there.
    expect(trade('hard', [crate], 30).peeked).toBe(false);
  });
});

describe('reloading behind cover', () => {
  // Someone was just heard in the hut 14 m off; a crate stands a couple of metres from the bot.
  const map = field([box('container', 0, 0, 4, 3, 4), box('crate', 1.5, -12, 2, 1.2, 0.6)]);

  function lowMag(level: 'hard' | 'pro', on = map) {
    const { state, bots, run, commands } = skirmish(on, [
      [0, 0, 0],
      [0, -14, 1],
    ]);
    const b = bots.bots[0]!;
    setSkill(b, level);
    b.lastKnown.x = 0;
    b.lastKnown.z = 0;
    b.hasLastKnown = true;
    b.heardAt = state.time;
    b.character.armament.ammo[0]!.mag = 2;
    const cmd = commands.get(b.character.id)!;
    let reloadAt: { x: number; z: number; mode: string } | undefined;
    run(4, () => {
      if (cmd.reload && !reloadAt) reloadAt = { x: b.character.position.x, z: b.character.position.z, mode: b.mode };
    });
    return { b, reloadAt };
  }

  it('tops up from a cover spot with a threat in mind (Pro), where Hard tops up on the spot', () => {
    const pro = lowMag('pro');
    expect(pro.reloadAt).toBeDefined();
    expect(pro.reloadAt!.mode).toBe('cover');
    expect(Math.hypot(pro.reloadAt!.x - pro.b.cover.position.x, pro.reloadAt!.z - pro.b.cover.position.z)).toBeLessThan(BOTS.coverArrive);
    const hard = lowMag('hard');
    expect(hard.reloadAt).toBeDefined();
    expect(Math.hypot(hard.reloadAt!.x, hard.reloadAt!.z + 14)).toBeLessThan(0.3);
  });

  it('tops up where it stands when no cover is near (Pro)', () => {
    const open = lowMag('pro', field([box('container', 0, 0, 4, 3, 4)]));
    expect(open.reloadAt).toBeDefined();
    expect(Math.hypot(open.reloadAt!.x, open.reloadAt!.z + 14)).toBeLessThan(0.3);
  });
});

describe('pushing late when behind', () => {
  // Blue's two hide in the hut; Orange's one walks a long lane.
  const map = field([HUT], [[vec3(0, 0, -16), vec3(0, 0, -30), vec3(0, 0, -45)]]);

  function late(level: 'hard' | 'pro', clock: number, behind: boolean) {
    const { state, bots, run } = skirmish(map, [
      [30, 30, 0],
      [0, -12, 1],
      [30, 30, 0],
    ]);
    unarmed(state.characters);
    for (const x of bots.bots) setSkill(x, level);
    const b = bots.bots.find((x) => x.character.team === 1)!;
    if (!behind) state.characters[2]!.status = 'out';
    state.round.clock = clock;
    run(0.5);
    return { b, pushing: pushingLate(b, bots.worldForTests) };
  }

  it('goes looking for the other side late in the round with fewer in play (Pro only)', () => {
    const pro = late('pro', 20, true);
    expect(pro.pushing).toBe(true);
    expect(pro.b.hunting).toBe(true);
    for (const [level, clock, behind] of [
      ['pro', 60, true],
      ['pro', 20, false],
      ['hard', 20, true],
    ] as const) {
      const r = late(level, clock, behind);
      expect(r.pushing, `${level} ${clock} s ${behind}`).toBe(false);
      expect(r.b.hunting, `${level} ${clock} s ${behind}`).toBe(false);
    }
  });
});

describe('defence and moving in pairs', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('two Pro defenders on one lane both hold its forward point, the second in a crossfire where the yard allows', () => {
    const physics = new PhysicsWorld(DEPOT, BODY, DT);
    const { state, bots } = depotBots('attackDefend', physics, botConfig('pro'));
    for (const b of bots.bots) setSkill(b, 'pro');
    state.round.attackers = 0;
    let pairs = 0;
    let crossfires = 0;
    for (let round = 2; round < 30; round++) {
      state.events.length = 0;
      state.events.push({ type: 'roundStart', round });
      bots.bots.forEach((b, i) => {
        const s = DEPOT.spawns[1]![i]!;
        b.character.position.x = s.position.x;
        b.character.position.z = s.position.z;
      });
      bots.observe(state);
      const lanes = bots.bots.map((b) => b.lane);
      const shared = lanes.find((l, i) => lanes.indexOf(l) !== i);
      if (shared === undefined) continue;
      const pair = bots.bots.filter((b) => b.lane === shared);
      // Planning only, nobody steps: each arrives as soon as its route is planned.
      for (let i = 0; i < 1800; i++) {
        bots.think(state, DT);
        state.time += DT;
        for (const b of pair) {
          const end = b.route[b.route.length - 1];
          if (b.routeState !== 'ok' || !end) continue;
          b.character.position.x = end.x;
          b.character.position.z = end.z;
        }
      }
      pairs++;
      expect(pair[0]!.laneIndex).toBe(pair[1]!.laneIndex);
      const choke = DEPOT.lanes[shared]![pair[0]!.laneIndex + pair[0]!.laneDir]!;
      const [a, c] = pair.map((b) => Math.atan2(b.character.position.x - choke.x, b.character.position.z - choke.z));
      if (Math.abs(wrapAngle(a! - c!)) < BOTS.crossfireMinDeg * DEG - 0.05) continue;
      crossfires++;
      for (const b of pair) {
        const p = b.character.position;
        expect(lineClear(physics, vec3(p.x, p.y + BODY.standEyeHeight, p.z), vec3(choke.x, choke.y + BODY.standEyeHeight, choke.z))).toBe(true);
      }
    }
    physics.dispose();
    expect(pairs).toBeGreaterThan(5);
    // Two of Depot's lanes run along a narrow way where a second angle on the choke doesn't exist; the third has one.
    expect(crossfires).toBeGreaterThan(0);
  });

  it('moves in pairs: a Pro bot sets off from a lane point only while its lane partner holds', { timeout: 60_000 }, () => {
    /** Of the times a bot left a lane point with a lane partner near, the share it left while that partner was moving. */
    const leftWithPartnerMoving = (cfg: BotConfig) => {
      let departures = 0;
      let together = 0;
      const wasHolding = new Map<Bot, boolean>();
      const moving = (o: Bot) => o.mode === 'advance' && !o.hunting && !o.holding && o.routeState === 'ok';
      playMatch(90, 3, undefined, cfg, 'elimination', undefined, undefined, undefined, undefined, (_s, bots) => {
        for (const b of bots.bots) {
          const held = wasHolding.get(b) ?? false;
          wasHolding.set(b, b.holding);
          if (!held || b.holding || b.mode !== 'advance' || b.hunting || b.character.status !== 'alive') continue;
          const p = b.character.position;
          const partner = bots.bots.find(
            (o) =>
              o !== b &&
              o.character.team === b.character.team &&
              o.lane === b.lane &&
              o.character.status === 'alive' &&
              Math.hypot(o.character.position.x - p.x, o.character.position.z - p.z) <= BOTS.boundDistance,
          );
          if (!partner) continue;
          departures++;
          if (moving(partner)) together++;
        }
      });
      return { departures, share: together / Math.max(1, departures) };
    };
    const pro = botConfig('pro');
    const pairs = leftWithPartnerMoving(pro);
    const loose = leftWithPartnerMoving({ ...pro, teamPlay: false });
    expect(pairs.departures).toBeGreaterThan(5);
    expect(loose.share).toBeGreaterThan(0.25);
    // Only a wait that runs out (teamWaitMax) lets both go at once.
    expect(pairs.share).toBeLessThan(loose.share / 2);
  });
});
