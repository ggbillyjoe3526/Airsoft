import { describe, expect, it, vi } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import type { GameEvent } from '../sim/events';
import { createGameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { BotController } from './botController';
import { SquadFollow } from './squadFollow';
import { noWalls } from './testSupport';

/** You (id 0) and two Blue bot teammates, and one Orange bot, as an Extraction run has them (M43 acceptance 4). */
function squad() {
  const state = createGameState(5, 16, ROUNDS, 'extraction');
  const you = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const mates = [1, 2].map((id) => createCharacter(id, vec3(id * 2, 0, 2), 0, LOADOUT, 0));
  const foe = createCharacter(3, vec3(30, 0, 30), 0, LOADOUT, 1);
  const characters = [you, ...mates, foe];
  state.characters.push(...characters);
  const bots = new BotController(state, [...mates, foe], new Map<number, PlayerCommand>(), {
    query: noWalls,
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    lanes: OPEN_FIELD.lanes,
    lowCover: [],
    tallCover: [],
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: BOTS,
    seed: 5,
  });
  const follow = new SquadFollow();
  /** One tick's update, with that tick's events. */
  const tick = (events: GameEvent[] = [], live = true) => follow.update(bots, you, characters, events, live);
  return { state, you, mates, foe, bots, tick };
}

const respawned = (characterId: number): GameEvent => ({ type: 'respawned', characterId, respawnsLeft: 0 });

describe('the squad follows you in Extraction (M43 acceptance 4)', () => {
  it('gives Follow me at the start, quietly, and keeps it on later ticks', () => {
    const { you, bots, mates, tick } = squad();
    expect(bots.orderOf(you)).toBe('none');
    tick();
    expect(bots.orderOf(you)).toBe('follow');
    for (const m of bots.bots.filter((b) => mates.includes(b.character))) expect(m.orderLeader).toBe(you);
    // Every tick calls it: the order in force is not toggled off.
    tick();
    tick();
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('leaves an order the player gave alone: Hold here stays held, Team plan stays Team plan', () => {
    const { you, bots, tick } = squad();
    tick();
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    tick();
    expect(bots.orderOf(you)).toBe('hold');
    bots.cancelOrder(you);
    tick();
    tick();
    expect(bots.orderOf(you)).toBe('none');
  });

  it('keeps a Hold given before the first tick (the player spoke first)', () => {
    const { you, bots, tick } = squad();
    bots.giveOrder(you, 'hold');
    tick();
    expect(bots.orderOf(you)).toBe('hold');
  });

  it('puts the squad under Follow me again when a teammate is back from a hit, even from Hold here or Team plan', () => {
    const { you, bots, mates, tick } = squad();
    bots.giveOrder(you, 'hold');
    tick();
    tick([respawned(mates[0]!.id)]);
    expect(bots.orderOf(you)).toBe('follow');
    for (const m of bots.bots.filter((x) => mates.includes(x.character))) expect(m.orderLeader).toBe(you);
    bots.cancelOrder(you);
    tick();
    expect(bots.orderOf(you)).toBe('none');
    tick([respawned(mates[1]!.id)]);
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('gives Follow me again once you are back from a hit, which dropped your order', () => {
    const { state, you, bots, tick } = squad();
    tick();
    bots.giveOrder(you, 'hold');
    expect(bots.orderOf(you)).toBe('hold');
    // Hit: the bots see you out of play and drop your order.
    you.status = 'calling';
    bots.think(state, 1 / 60);
    tick();
    expect(bots.orderOf(you)).toBe('none');
    // Back at the insertion (the run respawns you): Follow me, not the team plan.
    you.status = 'alive';
    tick([respawned(you.id)]);
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('waits while the run is not live or you are out of play, then gives Follow me', () => {
    const { you, bots, tick } = squad();
    tick([], false);
    expect(bots.orderOf(you)).toBe('none');
    you.status = 'calling';
    tick();
    expect(bots.orderOf(you)).toBe('none');
    you.status = 'alive';
    tick();
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('gives no order and calls nothing that allocates while no teammate is in play (a solo runner)', () => {
    const { you, bots, mates, tick } = squad();
    for (const m of mates) m.status = 'out';
    const give = vi.spyOn(bots, 'giveOrder');
    try {
      for (let i = 0; i < 60; i++) tick();
      expect(give).not.toHaveBeenCalled();
      expect(bots.orderOf(you)).toBe('none');
      // A teammate back in play takes Follow me.
      mates[0]!.status = 'alive';
      tick([respawned(mates[0]!.id)]);
      expect(give).toHaveBeenCalledTimes(1);
      expect(bots.orderOf(you)).toBe('follow');
    } finally {
      give.mockRestore();
    }
  });
});
