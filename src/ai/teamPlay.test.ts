import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_SKILL, BOTS, botConfig, type BotConfig, type Difficulty } from '../config/bots';
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

const setSkill = (b: Bot, level: Difficulty | BotConfig) => {
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

describe('no pooled hearing: a bot reacts only to what it heard itself', () => {
  // Blue's player at the origin, behind a wall; Orange's bots: one 15 m off, one beside it, one 42 m off (beyond hearingDistance).
  const chars = [
    [0, 0, 0],
    [0, -15, 1],
    [4, -16, 1],
    [0, -42, 1],
  ] as const;

  function arena(map: MapData) {
    const s = skirmish(map, chars);
    for (const b of s.bots.bots) setSkill(b, 'pro');
    const [victim, near, far] = s.bots.bots as [Bot, Bot, Bot];
    s.state.events.length = 0;
    return { ...s, victim, near, far };
  }

  it("a hit call is heard (and traded) only by teammates within earshot; a far Pro bot gets no tradeAt or lastKnown", () => {
    const { state, player, bots, run, victim, near, far } = arena(field([box('wall', 0, -5, 14, 3, 0.4)]));
    state.events.push({ type: 'characterHit', victimId: victim.character.id, shooterId: player.id, position: vec3(0, 1.2, -15), direction: vec3(0, 0, -1), ricochet: false });
    victim.character.status = 'walkingOff';
    bots.observe(state);
    expect(near.heardAt).toBe(state.time);
    expect(near.hasLastKnown).toBe(true);
    expect(near.tradeAt).toBe(state.time);
    expect(far.heardAt).toBe(Number.NEGATIVE_INFINITY);
    expect(far.hasLastKnown).toBe(false);
    expect(far.tradeAt).toBe(Number.NEGATIVE_INFINITY);
    expect(far.heardOtherAt).toBe(Number.NEGATIVE_INFINITY);
    // Nor does the near bot's reaction reach it later.
    run(1);
    expect(far.hasLastKnown).toBe(false);
    expect(far.tradeAt).toBe(Number.NEGATIVE_INFINITY);
  });

  it('a bot does not learn of a shooter that another bot heard (and a shot is no hit call: nobody trades)', () => {
    const { state, player, bots, run, near, far } = arena(field([]));
    state.events.push({ type: 'shot', characterId: player.id, replicaId: 'aeg', position: vec3(player.position.x, 1.4, player.position.z) });
    bots.observe(state);
    expect(near.heardAt).toBe(state.time);
    expect(near.hasLastKnown).toBe(true);
    expect(near.tradeAt).toBe(Number.NEGATIVE_INFINITY);
    expect(far.heardAt).toBe(Number.NEGATIVE_INFINITY);
    expect(far.hasLastKnown).toBe(false);
    expect(far.heardOtherAt).toBe(Number.NEGATIVE_INFINITY);
    run(1);
    expect(far.hasLastKnown).toBe(false);
  });
});

describe('crossfire where the map allows it, the stagger hold where it does not', () => {
  // In Orange's walking order: its spawn end first, the choke towards Blue last (the defenders hold the second point).
  const LANE = [vec3(0, 0, -30), vec3(0, 0, -18), vec3(0, 0, -6)];
  const walls = [box('wall', -2, -24, 1, 3, 40), box('wall', 2, -24, 1, 3, 40)];
  // No lane jitter: the first defender's point is the lane's, so the second's offset is the stagger's or the crossfire's alone.
  const cfgFor = (level: Difficulty): BotConfig => ({ ...botConfig(level), laneJitter: 0 });

  /** Two Orange defenders on the one lane of an Attack / Defend round; played until they hold. */
  function defend(level: Difficulty, blocks: MapBlock[], seed = 5) {
    const { state, bots, run } = skirmish(
      field([HUT, ...blocks], [LANE]),
      [
        [30, 30, 0],
        [0, -40, 1],
        [2, -40, 1],
      ],
      cfgFor(level),
      seed,
    );
    unarmed(state.characters);
    for (const b of bots.bots) setSkill(b, cfgFor(level));
    state.round.mode = 'attackDefend';
    state.round.attackers = 0;
    state.events.length = 0;
    state.events.push({ type: 'roundStart', round: 1 });
    bots.observe(state);
    let careful = 0;
    run(30, () => {
      for (const b of bots.bots) if (b.careful) careful++;
    });
    const [first, second] = bots.bots as [Bot, Bot];
    const choke = LANE[2]!;
    const yawOf = (b: Bot) => Math.atan2(b.laneGoal.x - choke.x, b.laneGoal.z - choke.z);
    return { first, second, careful, apart: Math.abs(wrapAngle(yawOf(first) - yawOf(second))) / DEG, between: Math.hypot(first.laneGoal.x - second.laneGoal.x, first.laneGoal.z - second.laneGoal.z) };
  }

  it('in a corridor too narrow for a crossfire post the second Pro defender holds the stagger spot beside the first', () => {
    const pro = botConfig('pro');
    for (const seed of [1, 5, 9]) {
      const { first, second, apart, between } = defend('pro', walls, seed);
      // Both hold the lane's forward point, their goals exactly the stagger's laneHoldOffset apart (not on one spot), about
      // the same angle on the choke.
      expect(second.laneIndex, `seed ${seed}`).toBe(first.laneIndex);
      expect(first.holding && second.holding, `seed ${seed}`).toBe(true);
      expect(between, `seed ${seed}`).toBeCloseTo(pro.laneHoldOffset, 2);
      expect(apart, `seed ${seed}`).toBeLessThan(pro.crossfireMinDeg);
    }
  });

  it('the same lane in the open gets a real crossfire for Pro: a post well round the choke', () => {
    const pro = botConfig('pro');
    const { first, second, apart } = defend('pro', []);
    expect(second.laneIndex).toBe(first.laneIndex);
    expect(first.holding && second.holding).toBe(true);
    expect(apart).toBeGreaterThanOrEqual(pro.crossfireMinDeg);
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s defenders set no crossfire and never slice', (level) => {
    const { first, second, apart, careful } = defend(level, []);
    expect(careful).toBe(0);
    // Not holding one forward point together, in a crossfire.
    expect(second.laneIndex !== first.laneIndex || apart < botConfig('pro').crossfireMinDeg).toBe(true);
  });
});

describe('moving in pairs: who counts as a partner that moves', () => {
  const LANE = [vec3(0, 0, -6), vec3(0, 0, -18), vec3(0, 0, -30), vec3(0, 0, -42)];
  const map = field([HUT], [LANE]);

  /** One tick of Orange's first bot, waiting at a lane point with its team, after `setup` shaped its lane partner. */
  function tick(level: Difficulty, setup: (partner: Bot) => void = () => {}) {
    const { state, bots } = skirmish(map, [
      [30, 30, 0],
      [0, -20, 1],
      [2, -20, 1],
    ]);
    unarmed(state.characters);
    const [b, partner] = bots.bots as [Bot, Bot];
    setSkill(b, level);
    setSkill(partner, level);
    // b has just paused at a lane point (its hold over), level with its partner (so not "ahead of the team"), who is on the way.
    b.mode = 'advance';
    b.hunting = false;
    b.waitForTeam = true;
    b.teamWait = 0;
    b.holdLeft = 0;
    b.routeState = 'none';
    b.route.length = 0;
    partner.lane = b.lane;
    partner.mode = 'advance';
    partner.hunting = false;
    partner.holding = false;
    partner.order = 'none';
    partner.routeState = 'ok';
    setup(partner);
    bots.think(state, DT);
    return { b, partner, waited: b.teamWait > 0 && b.holding };
  }

  it('a lane partner on the move within boundDistance makes a Pro bot wait (control), but not a Hard one', () => {
    const wait = tick('pro');
    expect(wait.waited).toBe(true);
    expect(wait.b.teamWait).toBeCloseTo(DT, 5);
    expect(tick('hard').waited).toBe(false);
  });

  // Ways a lane partner can fail to be "on the move"; the last is ahead of b, so b is not "ahead of the team" either.
  const excluded: [string, (p: Bot) => void][] = [
    ['hunting', (p) => void (p.hunting = true)],
    ['holding a point', (p) => void (p.holding = true)],
    ['under a squad order', (p) => void (p.order = 'follow')],
    ['out of play', (p) => void (p.character.status = 'out')],
    ['with no route yet', (p) => void (p.routeState = 'none')],
    ['in another mode', (p) => void (p.mode = 'search')],
    ['on another lane', (p) => void (p.lane += 1)],
    ['beyond boundDistance', (p) => void (p.character.position.z = -20 + BOTS.boundDistance + 1)],
  ];

  it.each(excluded)('a partner %s does not make it wait', (_name, shape) => {
    const r = tick('pro', shape);
    expect(r.waited).toBe(false);
    expect(r.b.waitForTeam).toBe(false);
  });

  it('a partner just inside boundDistance still does', () => {
    const r = tick('pro', (p) => (p.character.position.z = -20 + BOTS.boundDistance - 1));
    expect(r.waited).toBe(true);
  });
});

describe('pushing late: only in Elimination, only when behind, only in the last latePushTime', () => {
  // Orange's bot (index 0 of the bots) against `blue` Blue characters in play and `orange` Orange ones.
  function pushing(o: { mode?: 'attackDefend'; clock: number; blue: number; orange: number; level?: Difficulty }) {
    const chars: [number, number, number][] = [[30, 30, 0]];
    for (let i = 1; i < o.blue; i++) chars.push([30, 30, 0]);
    for (let i = 0; i < o.orange; i++) chars.push([0, -12, 1]);
    const { state, bots, run } = skirmish(field([HUT], [[vec3(0, 0, -16), vec3(0, 0, -30), vec3(0, 0, -45)]]), chars);
    unarmed(state.characters);
    for (const x of bots.bots) setSkill(x, o.level ?? 'pro');
    if (o.mode) {
      state.round.mode = o.mode;
      state.round.attackers = 0;
    }
    state.round.clock = o.clock;
    run(0.5);
    const b = bots.bots.find((x) => x.character.team === 1)!;
    return { pushing: pushingLate(b, bots.worldForTests), hunting: b.hunting };
  }
  const late = BOTS.latePushTime;

  it('pushes at the last moment of latePushTime when behind (control), and not a moment before', () => {
    expect(pushing({ clock: late, blue: 2, orange: 1 })).toEqual({ pushing: true, hunting: true });
    expect(pushing({ clock: late + 0.5, blue: 2, orange: 1 })).toEqual({ pushing: false, hunting: false });
  });

  it('does not push in Attack / Defend, however late and behind', () => {
    expect(pushing({ mode: 'attackDefend', clock: 10, blue: 2, orange: 1 })).toEqual({ pushing: false, hunting: false });
  });

  it('does not push when level on players or ahead', () => {
    expect(pushing({ clock: 10, blue: 2, orange: 2 })).toEqual({ pushing: false, hunting: false });
    expect(pushing({ clock: 10, blue: 1, orange: 2 })).toEqual({ pushing: false, hunting: false });
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s never pushes late', (level) => {
    expect(pushing({ clock: 10, blue: 2, orange: 1, level })).toEqual({ pushing: false, hunting: false });
  });
});

describe('trading a hit teammate: once per call, and only soon enough', () => {
  // As the peeking trade test: a crate near the teammate towards where the shot came from, the shooter out of sight.
  const crate = box('crate', 3, -13, 2, 1.2, 0.6);

  function hitCall(level: Difficulty = 'pro') {
    const { state, player, bots, commands } = skirmish(field([crate]), [
      [0, 30, 0],
      [0, -15, 1],
      [4, -16, 1],
    ]);
    for (const b of bots.bots) setSkill(b, level);
    const [victim, mate] = bots.bots as [Bot, Bot];
    const call = () => {
      state.events.length = 0;
      state.events.push({ type: 'characterHit', victimId: victim.character.id, shooterId: player.id, position: vec3(0, 1.2, -15), direction: vec3(0, 0, -1), ricochet: false });
      victim.character.status = 'walkingOff';
      bots.observe(state);
      state.events.length = 0;
    };
    const tickOnce = () => {
      bots.think(state, DT);
      state.time += DT;
    };
    return { state, bots, mate, call, tickOnce, commands };
  }

  it('tries once per hit call: a second go needs a new call', () => {
    const { state, mate, call, tickOnce } = hitCall();
    call();
    expect(mate.tradeTried).toBe(false);
    for (let i = 0; i < 30; i++) tickOnce();
    expect(mate.tradeTried).toBe(true);
    expect(mate.mode).toBe('cover');
    // Back in the open with its cooldown over and the call still fresh: no second try.
    mate.mode = 'advance';
    mate.coverCooldown = 0;
    tickOnce();
    expect(state.time - mate.tradeAt).toBeLessThan(BOTS.tradeTime);
    expect(mate.mode).not.toBe('cover');
    // A new call re-arms it (control: the guard is the only thing in the way).
    call();
    expect(mate.tradeTried).toBe(false);
    expect(mate.tradeAt).toBe(state.time);
    mate.mode = 'advance';
    mate.coverCooldown = 0;
    tickOnce();
    expect(mate.tradeTried).toBe(true);
    expect(mate.mode).toBe('cover');
  });

  it('does not go after tradeTime has passed, though it still remembers the shot', () => {
    const { state, mate, call, tickOnce } = hitCall();
    call();
    state.time += BOTS.tradeTime - 0.5;
    tickOnce();
    expect(mate.tradeTried).toBe(true);
    const late = hitCall();
    late.call();
    late.state.time += BOTS.tradeTime + 0.5;
    late.tickOnce();
    expect(late.mate.hasLastKnown).toBe(true);
    expect(late.state.time - late.mate.heardAt).toBeLessThan(BOTS.memoryTime);
    expect(late.mate.tradeTried).toBe(false);
    expect(late.mate.mode).not.toBe('cover');
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s bots never trade: no tradeAt, no try', (level) => {
    const { state, mate, call, tickOnce } = hitCall(level);
    call();
    for (let i = 0; i < 30; i++) tickOnce();
    expect(mate.tradeAt).toBe(Number.NEGATIVE_INFINITY);
    expect(mate.tradeTried).toBe(false);
    expect(state.time).toBeGreaterThan(0);
  });
});

describe('Easy, Normal and Hard keep their guards', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s has every M38 behaviour off', (level) => {
    expect(BOT_SKILL[level].slicesCorners).toBe(false);
    expect(BOT_SKILL[level].teamPlay).toBe(false);
    expect(BOT_SKILL[level].peekWatchTime).toEqual([0, 0]);
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s never sets careful walking a lane in the enemy half or with a threat in mind', (level) => {
    const map = field([HUT], [[vec3(0, 0, -16), vec3(0, 0, -30), vec3(3, 0, -40)]]);
    const { bots, run, state } = skirmish(map, [
      [30, 30, 0],
      [0, -12, 1],
    ]);
    unarmed(state.characters);
    const b = bots.bots[0]!;
    setSkill(b, level);
    (bots.worldForTests as { inEnemyHalf: (x: Bot) => boolean }).inEnemyHalf = () => true;
    let carefulTicks = 0;
    let thought = 0;
    run(3, () => {
      if (b.careful) carefulTicks++;
    });
    // Then with someone just heard.
    b.lastKnown.x = 0;
    b.lastKnown.z = 0;
    b.hasLastKnown = true;
    b.heardAt = state.time;
    run(3, () => {
      thought++;
      if (b.careful) carefulTicks++;
    });
    expect(thought).toBeGreaterThan(100);
    expect(carefulTicks).toBe(0);
  });
});
