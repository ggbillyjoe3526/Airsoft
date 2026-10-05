import { describe, expect, it } from 'vitest';
import { botConfig, type Difficulty } from '../config/bots';
import { WHAT_GOT_YOU } from '../config/matchInfo';
import { createCharacter } from '../sim/character';
import { createHitFacts, recordHitFacts } from '../sim/hitFacts';
import { LOADOUT } from '../config/replicas';
import { vec3 } from '../sim/vec';
import { OPEN_FIELD } from '../sim/testSupport';
import { facing, duel, noWalls, skirmish } from './testSupport';
import { BOTS } from '../config/bots';

// What the "what got you" card is told (M41): recorded at hit time from the shooting bot's own state.

const DT = 1 / 60;

interface Setup {
  level?: Difficulty;
  /** The bot is standing still at a post (Bot.holding) as it first sees the player. */
  holding?: boolean;
  /** Degrees its view is off the player when it first sees them (0: already aimed there). */
  off?: number;
  /** The player walks forward (towards the bot) instead of standing. */
  walk?: boolean;
  /** Where the bot stands (default: 12 m ahead of the player). */
  at?: { x: number; z: number };
  seed?: number;
}

/** A duel played until the bot hits the player; returns what was recorded, and when the bot first saw them. */
function hitOnPlayer(o: Setup = {}) {
  const at = o.at ?? { x: 0, z: -12 };
  const d = duel(
    Math.hypot(at.x, at.z),
    (state) => {
      const bot = state.characters[1]!;
      bot.position.x = at.x;
      bot.position.z = at.z;
      bot.yaw = facing(bot.position, state.characters[0]!.position);
    },
    noWalls,
    BOTS,
    o.seed ?? 3,
  );
  const b = d.bots.bots[0]!;
  (b as { skill: unknown }).skill = botConfig(o.level ?? 'pro');
  b.aim.yaw = d.bot.yaw + (o.off ?? 0) * (Math.PI / 180);
  b.aim.pitch = 0;
  b.holding = o.holding ?? true;
  b.thinkLeft = 0;
  // Well into the round, so a first sight stamped as time zero would show.
  d.state.time = 5;
  if (o.walk) d.commands.get(0)!.forward = 1;
  let firstSeen = Number.NaN;
  for (let i = 0; i < 12 / DT && d.bots.lastHit.time === Number.NEGATIVE_INFINITY; i++) {
    d.run(DT);
    // The tick the bot first has a contact (it was stamped as that tick began).
    if (Number.isNaN(firstSeen) && b.contact) firstSeen = d.state.time - DT;
    // Holding as it looks: the first perception is the one that counts.
    b.holding = o.holding ?? true;
  }
  expect(d.bots.lastHit.time, 'the bot hit the player').toBeGreaterThan(0);
  // Where the two stood on the tick of the hit (the loop stops on it).
  const shooterAt = { x: d.bot.position.x, z: d.bot.position.z };
  const victimAt = { x: d.player.position.x, z: d.player.position.z };
  return { facts: d.bots.lastHit, b, firstSeen, shooterAt, victimAt, ...d };
}

describe('whether the shooter was holding the angle', () => {
  it('a Pro bot standing at a post with its view already on the player was holding it', () => {
    const r = hitOnPlayer({ level: 'pro', holding: true, off: 0 });
    expect(r.facts.held).toBe(true);
  });

  it('not when it was moving, when the player stepped out well away from where it aimed, or on a level that holds no angles', () => {
    expect(hitOnPlayer({ level: 'pro', holding: false, off: 0 }).facts.held).toBe(false);
    expect(hitOnPlayer({ level: 'pro', holding: true, off: 30 }).facts.held).toBe(false);
    for (const level of ['easy', 'normal', 'hard'] as const) expect(hitOnPlayer({ level, holding: true, off: 0 }).facts.held, level).toBe(false);
  });
});

describe('how long the player had been in view', () => {
  it('counts from the bot\'s first sight to the hit, which is at least its reaction time', () => {
    const r = hitOnPlayer({ level: 'hard', holding: false, off: 0 });
    expect(Number.isFinite(r.firstSeen)).toBe(true);
    expect(r.facts.inView).not.toBeNull();
    // Within a tick or two of the span from first sight (watched from outside) to the hit.
    expect(r.facts.inView!).toBeGreaterThan(0.1);
    expect(Math.abs(r.facts.inView! - (r.facts.time - r.firstSeen))).toBeLessThan(2 * DT);
    expect(r.facts.inView!).toBeGreaterThanOrEqual(botConfig('hard').reactionTime[0] - DT);
  });

  it('is longer when the bot saw them earlier (the first sight moved back three seconds)', () => {
    const r = hitOnPlayer({ level: 'hard', holding: false, off: 0 });
    const contact = r.b.contacts.get(0)!;
    const before = r.facts.inView!;
    contact.firstSeenAt -= 3;
    // Another hit on the same contact, recorded again from the same state.
    r.state.events.push({ type: 'characterHit', victimId: 0, shooterId: 1, position: vec3(), direction: vec3(0, 0, 1), ricochet: false });
    r.bots.observe(r.state);
    expect(r.bots.lastHit.inView! - before).toBeGreaterThan(2.9);
  });
});

describe('whether the player was moving', () => {
  it('moving when walking at the hit, still when standing', () => {
    expect(hitOnPlayer({ level: 'hard', holding: false, walk: true }).facts.moving).toBe(true);
    expect(hitOnPlayer({ level: 'hard', holding: false, walk: false }).facts.moving).toBe(false);
  });
});

describe('where the shot came from', () => {
  it('records the direction and the distance from shooter to player', () => {
    // The bot stands 8 m to the player\'s right (+x) and 6 m ahead (-z): 10 m away.
    const r = hitOnPlayer({ level: 'hard', holding: false, at: { x: 8, z: -6 } });
    expect(r.facts.shooterId).toBe(1);
    expect(r.facts.victimId).toBe(0);
    // The bot sidesteps while it fights, so it is measured from where each stood on the hit's tick.
    expect(r.facts.distance).toBeCloseTo(Math.hypot(r.victimAt.x - r.shooterAt.x, r.victimAt.z - r.shooterAt.z), 6);
    expect(r.facts.distance).toBeGreaterThan(7);
    expect(r.facts.distance).toBeLessThan(13);
    // The BB flew from the bot towards the player, from the bot's side: -x, +z.
    expect(r.facts.yaw).toBeCloseTo(Math.atan2(r.victimAt.x - r.shooterAt.x, r.victimAt.z - r.shooterAt.z), 6);
    expect(Math.sin(r.facts.yaw)).toBeLessThan(0);
    expect(Math.cos(r.facts.yaw)).toBeGreaterThan(0);
    expect(r.facts.ricochet).toBe(false);
    expect(r.facts.friendly).toBe(false);
  });
});

describe('what it leaves unknown', () => {
  it('says nothing of held or time in view for a ricochet, a teammate\'s shot or a shooter no bot drives', () => {
    const r = hitOnPlayer({ level: 'pro', holding: true, off: 0 });
    const hit = (shooterId: number, ricochet: boolean) => {
      r.state.events.push({ type: 'characterHit', victimId: 0, shooterId, position: vec3(), direction: vec3(0, 0, 1), ricochet });
      r.bots.observe(r.state);
      return r.bots.lastHit;
    };
    const bounced = hit(1, true);
    expect(bounced.ricochet).toBe(true);
    expect(bounced.held).toBeNull();
    expect(bounced.inView).toBeNull();
    // A teammate of the player's (id 2, not driven by a bot): friendly fire.
    const mate = createCharacter(2, vec3(3, 0, 3), 0, LOADOUT, 0);
    r.state.characters.push(mate);
    const friendly = hit(2, false);
    expect(friendly.friendly).toBe(true);
    expect(friendly.held).toBeNull();
    expect(friendly.inView).toBeNull();
  });

  it('does not record a hit on a bot', () => {
    const r = hitOnPlayer({ level: 'hard', holding: false });
    const before = r.bots.lastHit.time;
    r.state.events.push({ type: 'characterHit', victimId: 1, shooterId: 0, position: vec3(), direction: vec3(0, 0, -1), ricochet: false });
    r.bots.observe(r.state);
    expect(r.bots.lastHit.time).toBe(before);
    expect(r.bots.lastHit.victimId).toBe(0);
  });
});

describe('recordHitFacts', () => {
  it('measures the direction, the distance and the speed from the two characters, reusing one record', () => {
    const victim = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    const shooter = createCharacter(1, vec3(3, 0, 4), 0, LOADOUT, 1);
    const out = createHitFacts();
    victim.velocity.x = WHAT_GOT_YOU.movingSpeed * 0.5;
    recordHitFacts(out, 2, victim, shooter, false, true, 0.5, WHAT_GOT_YOU.movingSpeed);
    expect(out).toMatchObject({ time: 2, victimId: 0, shooterId: 1, distance: 5, moving: false, held: true, inView: 0.5, friendly: false });
    expect(out.yaw).toBeCloseTo(Math.atan2(-3, -4));
    victim.velocity.z = -WHAT_GOT_YOU.movingSpeed;
    const same = out;
    recordHitFacts(out, 3, victim, shooter, false, null, null, WHAT_GOT_YOU.movingSpeed);
    expect(out).toBe(same);
    expect(out.moving).toBe(true);
  });
});

describe('whose hits are recorded', () => {
  it('leaves held and time in view unknown when a bot teammate hits the player (friendly fire)', () => {
    const { state, bots } = skirmish(OPEN_FIELD, [
      [0, 0, 0],
      [0, -12, 1],
      [4, 0, 0],
    ]);
    state.time = 5;
    state.events.push({ type: 'characterHit', victimId: 0, shooterId: 2, position: vec3(), direction: vec3(-1, 0, 0), ricochet: false });
    bots.observe(state);
    expect(bots.lastHit).toMatchObject({ victimId: 0, shooterId: 2, friendly: true, held: null, inView: null });
    // The same bot's shot at the same player, as an enemy's, would have said something (here: not held, no contact).
    state.events.length = 0;
    state.events.push({ type: 'characterHit', victimId: 0, shooterId: 1, position: vec3(), direction: vec3(0, 0, 1), ricochet: false });
    bots.observe(state);
    expect(bots.lastHit).toMatchObject({ friendly: false, held: false });
  });

  it('only the local player\'s own: a hit on a bot teammate (or an enemy) leaves the record as it was', () => {
    // The player (id 0, Blue), an Orange bot (1) and a Blue bot teammate (2).
    const { state, bots } = skirmish(OPEN_FIELD, [
      [0, 0, 0],
      [0, -12, 1],
      [4, 0, 0],
    ]);
    const hit = (victimId: number, shooterId: number) => {
      state.time += 1;
      state.events.push({ type: 'characterHit', victimId, shooterId, position: vec3(), direction: vec3(0, 0, 1), ricochet: false });
      bots.observe(state);
      state.events.length = 0;
    };
    hit(2, 1);
    expect(bots.lastHit.time, 'a teammate bot hit by the enemy').toBe(Number.NEGATIVE_INFINITY);
    hit(1, 2);
    expect(bots.lastHit.time, 'an enemy bot hit by the teammate').toBe(Number.NEGATIVE_INFINITY);
    hit(0, 1);
    expect(bots.lastHit).toMatchObject({ time: state.time, victimId: 0, shooterId: 1 });
    const mine = bots.lastHit.time;
    hit(2, 1);
    expect(bots.lastHit.time, 'the teammate hit again').toBe(mine);
    expect(bots.lastHit.victimId).toBe(0);
  });
});
