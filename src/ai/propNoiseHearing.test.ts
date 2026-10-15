import { describe, expect, it } from 'vitest';
import { BOTS, botConfig } from '../config/bots';
import { NOISE } from '../config/noise';
import type { FloorSurface } from '../config/sounds';
import type { BlockKind } from '../map/mapTypes';
import type { GameEvent } from '../sim/events';
import { OPEN_FIELD } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import type { Bot } from './bot';
import { duel, skirmish } from './testSupport';

/**
 * Bots hear noisy props and noisy ground (NP1, the owner's Dev 6 item 41) as they hear a step or a vault: someone running
 * into a prop as far as the prop carries, from where they are; a BB ringing off steel only when nothing fresher is on
 * their mind, from where it rang, and kept to themselves; a step on gravel or steel plate further than on anything else.
 */

const knock = (characterId: number, kind: BlockKind, at: Vec3): GameEvent => ({ type: 'propNoise', characterId, prop: 0, kind, position: at, range: NOISE.props[kind]!.bumped, shot: false });
const ring = (characterId: number, kind: BlockKind, at: Vec3): GameEvent => ({ type: 'propNoise', characterId, prop: 0, kind, position: at, range: NOISE.props[kind]!.shot, shot: true });

/** Whether the bot (facing away, so only its ears can tell it) `dist` m off hears `event` of the player's. */
function hears(dist: number, event: (playerId: number) => GameEvent): { heard: boolean; bot: Bot } {
  const { state, player, bots } = duel(dist, (st) => (st.characters[1]!.yaw += Math.PI));
  state.events.length = 0;
  state.events.push(event(player.id));
  bots.observe(state);
  const bot = bots.bots[0]!;
  return { heard: bot.hasLastKnown, bot };
}

describe('bots hear someone run into a noisy prop (NP1)', () => {
  it('as far as that prop carries: a crate 13 m, a skip 20 m, further than the run itself (11 m)', () => {
    const cases: [BlockKind, number, boolean][] = [
      ['crate', 12.5, true],
      ['crate', 13.5, false],
      ['rack', 15.5, true],
      ['skip', 19.5, true],
      ['skip', 20.5, false],
    ];
    for (const [kind, dist, heard] of cases) expect(hears(dist, (id) => knock(id, kind, vec3(0, 0.9, -0.4))).heard, `${kind} at ${dist} m`).toBe(heard);
    // The run that hit it, alone, is not heard at 12.5 m.
    expect(hears(12.5, (id) => ({ type: 'footstep', characterId: id, kind: 'run' })).heard).toBe(false);
  });

  it('places the noise on the one who made it, as for a step (within the usual guess)', () => {
    const { bot } = hears(15, (id) => knock(id, 'skip', vec3(0.5, 0.9, -0.4)));
    expect(Math.hypot(bot.lastKnown.x, bot.lastKnown.z)).toBeLessThanOrEqual(15 * BOTS.hearingError + 1e-9);
  });

  it("is nobody's noise from a player already out, or from a bot's own team", () => {
    const out = duel(8, (st) => {
      st.characters[1]!.yaw += Math.PI;
      st.characters[0]!.status = 'walkingOff';
    });
    out.state.events.length = 0;
    out.state.events.push(knock(out.player.id, 'skip', vec3(0, 0.9, -0.4)));
    out.bots.observe(out.state);
    expect(out.bots.bots[0]!.hasLastKnown).toBe(false);
    // The bot running into a skip itself.
    const own = duel(8, (st) => (st.characters[1]!.yaw += Math.PI));
    own.state.events.length = 0;
    own.state.events.push(knock(own.bot.id, 'skip', own.bot.position));
    own.bots.observe(own.state);
    expect(own.bots.bots[0]!.hasLastKnown).toBe(false);
  });

  it('hears the same at every level: hearing is shared behaviour, not skill', () => {
    for (const level of ['easy', 'normal', 'hard', 'pro'] as const) {
      for (const [dist, heard] of [[12.5, true], [13.5, false]] as const) {
        const { state, player, bots } = duel(dist, (st) => (st.characters[1]!.yaw += Math.PI), undefined, botConfig(level));
        state.events.length = 0;
        state.events.push(knock(player.id, 'crate', vec3(0, 0.9, -0.4)));
        bots.observe(state);
        expect(bots.bots[0]!.hasLastKnown, `${level} at ${dist} m`).toBe(heard);
      }
    }
  });
});

describe('bots hear steps on noisy ground further (NP1)', () => {
  it('a sprint on gravel or steel plate carries NOISE.ground times as far; on grass, earth or concrete as before', () => {
    const sprint = BOTS.footstepHearingSprint;
    const step = (surface: FloorSurface | undefined) => (id: number): GameEvent => ({ type: 'footstep', characterId: id, kind: 'sprint', surface });
    for (const surface of ['gravel', 'metal'] as const) {
      expect(hears(sprint * NOISE.ground[surface] - 0.3, step(surface)).heard, surface).toBe(true);
      expect(hears(sprint * NOISE.ground[surface] + 0.3, step(surface)).heard, surface).toBe(false);
    }
    for (const surface of ['grass', 'earth', 'concrete', 'leaves', 'wood', undefined] as const) {
      expect(hears(sprint - 0.3, step(surface)).heard, `${surface}`).toBe(true);
      expect(hears(sprint + 0.3, step(surface)).heard, `${surface}`).toBe(false);
    }
    // Noisy ground never makes a step louder than a vault.
    for (const s of Object.values(NOISE.ground)) expect(BOTS.footstepHearingSprint * s).toBeLessThan(BOTS.hearingDistance);
  });
});

describe('a BB ringing off steel draws an idle bot, never a busy one (NP1)', () => {
  // Blue's player at the origin; Orange's Pro bots, `near` 14 m off and `far` 45 m off, both facing away from the player.
  function arena() {
    const s = skirmish(OPEN_FIELD, [
      [0, 0, 0],
      [0, -14, 1],
      [0, -45, 1],
    ]);
    for (const b of s.bots.bots) Object.assign(b, { skill: botConfig('pro') });
    const [near, far] = s.bots.bots as [Bot, Bot];
    s.state.events.length = 0;
    return { ...s, near, far };
  }
  const RING_AT = vec3(4, 1, -20);

  it('a bot with nothing on its mind hears it where it rang, and keeps it to itself', () => {
    const { state, player, bots, near, far } = arena();
    expect(near.skill.teamPlay).toBe(true);
    state.events.push(ring(player.id, 'skip', RING_AT));
    bots.observe(state);
    expect(near.hasLastKnown).toBe(true);
    expect(near.heardAt).toBe(state.time);
    // Where it rang (within the usual guess), not where the shooter stands.
    expect(Math.hypot(near.lastKnown.x - RING_AT.x, near.lastKnown.z - RING_AT.z)).toBeLessThanOrEqual(Math.hypot(4, 6) * BOTS.hearingError + 1e-9);
    // Not told to its team, as a step would be.
    expect(far.hasLastKnown).toBe(false);
    // A step it heard is shared, for comparison.
    const b = arena();
    b.state.events.push(knock(b.player.id, 'skip', vec3(0, 0.9, -0.4)));
    b.bots.observe(b.state);
    expect(b.near.hasLastKnown).toBe(true);
    expect(b.far.hasLastKnown).toBe(true);
  });

  it('only as far as the prop rings: a skip 12 m, a generator 10 m', () => {
    for (const [kind, gap, heard] of [['skip', 11.5, true], ['skip', 12.5, false], ['generator', 9.5, true], ['generator', 10.5, false]] as const) {
      const { state, player, bots, near } = arena();
      state.events.push(ring(player.id, kind, vec3(0, 1, -14 - gap)));
      bots.observe(state);
      expect(near.hasLastKnown, `${kind} ${gap} m off`).toBe(heard);
    }
  });

  it('a bot with fresher news keeps it: heard or seen within hearingContactTime, or someone in sight', () => {
    const fresh = arena();
    fresh.state.time = 10;
    fresh.near.hasLastKnown = true;
    fresh.near.lastKnown.x = 30;
    fresh.near.lastKnown.z = 30;
    fresh.near.heardAt = 10 - BOTS.hearingContactTime + 0.1;
    fresh.state.events.push(ring(fresh.player.id, 'skip', RING_AT));
    fresh.bots.observe(fresh.state);
    expect([fresh.near.lastKnown.x, fresh.near.lastKnown.z]).toEqual([30, 30]);
    expect(fresh.near.heardAt).toBe(10 - BOTS.hearingContactTime + 0.1);
    // Stale news gives way to the ring.
    const stale = arena();
    stale.state.time = 10;
    stale.near.hasLastKnown = true;
    stale.near.lastKnown.x = 30;
    stale.near.lastKnown.z = 30;
    stale.near.heardAt = 10 - BOTS.hearingContactTime - 0.1;
    stale.state.events.push(ring(stale.player.id, 'skip', RING_AT));
    stale.bots.observe(stale.state);
    expect(stale.near.heardAt).toBe(10);
    expect(Math.hypot(stale.near.lastKnown.x - RING_AT.x, stale.near.lastKnown.z - RING_AT.z)).toBeLessThan(5);
    // Fighting someone: the ring is nothing to it, not even a flanker to remember.
    const busy = arena();
    busy.near.targetVisible = true;
    busy.near.targetId = 99;
    busy.state.events.push(ring(busy.player.id, 'skip', RING_AT));
    busy.bots.observe(busy.state);
    expect(busy.near.hasLastKnown).toBe(false);
    expect(busy.near.heardOtherAt).toBe(Number.NEGATIVE_INFINITY);
  });
});
