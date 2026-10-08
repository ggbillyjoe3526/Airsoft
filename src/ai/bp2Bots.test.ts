import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { DEPOT } from '../map/depot';
import { createCommand } from '../sim/commands';
import { vec3 } from '../sim/vec';
import { resetBot } from './bot';
import { thinkBot } from './botBrain';
import type { BotController } from './botController';
import { followRoute, moveBot } from './botMovement';
import { duel, skirmish } from './testSupport';

// BP2 (bug pass 2): the bot fixes. Unit level; no match is played.

const DT = 1 / 60;

/** A duel run until the bot has seen the player, the bot made a hunter in a fight with a long sidestep left. */
function huntingDuel() {
  const { state, bots, player } = duel(12);
  for (let i = 0; i < 30; i++) {
    state.time += DT;
    bots.think(state, DT);
  }
  const b = bots.bots[0]!;
  expect(b.targetVisible, 'the bot sees the player').toBe(true);
  b.role = 'hunter';
  b.mode = 'fight';
  b.fromCover = false;
  b.raiser = false;
  b.strafeLeft = 10; // no new sidestep for a while: only a new fight or target may look
  return { bots, b, player, w: bots.worldForTests };
}

describe('a hunter looks whether its push keeps the target in sight at once in a new fight or on a new target (BP2)', () => {
  it('looks in the first tick of a fight, not only when a sidestep is drawn (BP2)', () => {
    const { b, player, w } = huntingDuel();
    b.pushInSight = false;
    b.pushLookFor = -1;
    moveBot(b, w, createCommand(), DT, player);
    expect(b.pushInSight).toBe(true); // nothing in the way on an open floor
    expect(b.pushLookFor).toBe(player.id);
  });

  it('does not look again every tick of the same fight on the same target (BP2)', () => {
    const { b, player, w } = huntingDuel();
    b.pushLookFor = player.id;
    b.pushInSight = false;
    moveBot(b, w, createCommand(), DT, player);
    expect(b.pushInSight).toBe(false);
  });

  it('looks again on a new target (BP2)', () => {
    const { b, player, w } = huntingDuel();
    b.pushLookFor = player.id + 100;
    b.pushInSight = false;
    moveBot(b, w, createCommand(), DT, player);
    expect(b.pushInSight).toBe(true);
    expect(b.pushLookFor).toBe(player.id);
  });

  it('still looks when a new sidestep is drawn on the same target (BP2)', () => {
    const { b, player, w } = huntingDuel();
    b.pushLookFor = player.id;
    b.pushInSight = false;
    b.strafeLeft = 0;
    moveBot(b, w, createCommand(), DT, player);
    expect(b.pushInSight).toBe(true);
  });

  it('forgets the last fight\'s look when it enters fight from another mode (BP2)', () => {
    const { b, player, w } = huntingDuel();
    b.mode = 'advance';
    b.pushLookFor = player.id; // the last fight's look, same target
    b.pushInSight = false; // and what it saw then
    thinkBot(b, w, createCommand(), DT);
    expect(b.mode).toBe('fight');
    // chooseMode set it to -1, so this tick's fight step looked afresh.
    expect(b.pushInSight).toBe(true);
  });

  it('is cleared by resetBot (BP2)', () => {
    const { b, w } = huntingDuel();
    b.pushInSight = true;
    b.pushLookFor = 5;
    resetBot(b, 0, 0, w.cfg);
    expect(b.pushInSight).toBe(false);
    expect(b.pushLookFor).toBe(-1);
  });
});

describe('arriving at the end of a route clears the stuck time (BP2)', () => {
  const arrive = (planningFlag: boolean, state: 'ok' | 'wanted') => {
    const { bots } = duel(12);
    const b = bots.bots[0]!;
    b.route.length = 0;
    b.route.push(vec3(b.character.position.x, 0, b.character.position.z));
    b.routeLeg = 0;
    b.routeState = state;
    b.stuckFor = 3;
    const walking = followRoute(b, bots.worldForTests, DT, planningFlag);
    return { b, walking };
  };

  it('ends the route (none) and starts the next step with stuckFor 0 (BP2)', () => {
    const { b, walking } = arrive(false, 'ok');
    expect(walking).toBe(false);
    expect(b.routeState).toBe('none');
    expect(b.stuckFor).toBe(0);
  });

  it('leaves the stuck time and the wanted route alone while a new route is planned (BP2)', () => {
    const { b, walking } = arrive(true, 'wanted');
    expect(walking).toBe(false);
    expect(b.routeState).toBe('wanted');
    expect(b.stuckFor).toBe(3);
  });
});

describe('a carried route search (BP2)', () => {
  /** Two bots on Depot's middle lane, far apart, and the controller's private search state. */
  function setup() {
    const w = skirmish(DEPOT, [
      [-20, 0, 0],
      [4, 1, 1],
      [-6, -9, 1],
    ]);
    const c = w.bots as BotController;
    const priv = c as unknown as { openSearch(): unknown; planRoutes(): void; searching: unknown; searchGoal: { x: number; y: number; z: number } };
    const [a, other] = c.bots;
    const want = (goal: { x: number; z: number }) => {
      a!.routeState = 'wanted';
      a!.routeGoal.x = goal.x;
      a!.routeGoal.y = 0;
      a!.routeGoal.z = goal.z;
    };
    return { w, c, priv, a: a!, other: other!, want, replan: c.worldForTests.cfg.replanDistance };
  }
  const GOAL = { x: -6, z: -9 };

  it('is kept while the bot is in play and its goal moved less than replanDistance on the same y (BP2)', () => {
    const { priv, a, want, replan } = setup();
    want(GOAL);
    expect(priv.openSearch()).toBe(a);
    a.routeGoal.x += replan * 0.5;
    expect(priv.openSearch()).toBe(a);
    expect(priv.searchGoal.x, 'carried: the search is still the one begun for the first goal').toBe(GOAL.x);
  });

  it('is dropped and begun again when the goal moved replanDistance or further (BP2)', () => {
    const { priv, a, want, replan } = setup();
    want(GOAL);
    priv.openSearch();
    a.routeGoal.x += replan * 1.5;
    expect(priv.openSearch()).toBe(a);
    expect(priv.searchGoal.x, 'begun anew for the new goal').toBe(GOAL.x + replan * 1.5);
  });

  it('is dropped when the goal is on another y (BP2)', () => {
    const { priv, a, want } = setup();
    want(GOAL);
    priv.openSearch();
    a.routeGoal.y = 1;
    priv.openSearch();
    expect(priv.searchGoal.y).toBe(1);
  });

  it('is dropped when the bot is no longer in play, and nobody is searched for (BP2)', () => {
    const { priv, a, want } = setup();
    want(GOAL);
    expect(priv.openSearch()).toBe(a);
    a.character.status = 'calling';
    expect(priv.openSearch()).toBeUndefined();
    expect(priv.searching).toBeUndefined();
  });

  it('begins no search for a bot hit while it waited for a route (BP2)', () => {
    const { priv, a, other, want } = setup();
    want(GOAL);
    a.character.status = 'calling';
    expect(priv.openSearch()).toBeUndefined();
    expect(priv.searching).toBeUndefined();
    expect(a.routeState).toBe('wanted');
    // The next bot in play that waits is served instead.
    other.routeState = 'wanted';
    other.routeGoal.x = 4;
    other.routeGoal.z = 1;
    other.routeGoal.y = 0;
    other.character.position.x = -6;
    other.character.position.z = -9;
    expect(priv.openSearch()).toBe(other);
  });

  it('ends a found route on the goal it was searched for, though the goal moved a little since (BP2)', () => {
    const { priv, a, want, replan } = setup();
    want(GOAL);
    priv.openSearch();
    a.routeGoal.x += replan * 0.5;
    for (let i = 0; i < 200 && a.routeState === 'wanted'; i++) priv.planRoutes();
    expect(a.routeState).toBe('ok');
    expect(a.routeGoal.x).toBe(GOAL.x);
    const last = a.route[a.route.length - 1]!;
    expect(Math.hypot(last.x - GOAL.x, last.z - GOAL.z)).toBeLessThan(NAV.cell);
  });
});
