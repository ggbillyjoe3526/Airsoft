import { describe, expect, it } from 'vitest';
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
import { keepSquadFollowing } from './squadFollow';
import { noWalls } from './testSupport';

/** You (id 0) and two Blue bot teammates, and one Orange bot, as an Extraction run has them (M43 acceptance 4). */
function squad() {
  const state = createGameState(5, 16, ROUNDS, 'extraction');
  const you = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const mates = [1, 2].map((id) => createCharacter(id, vec3(id * 2, 0, 2), 0, LOADOUT, 0));
  const foe = createCharacter(3, vec3(30, 0, 30), 0, LOADOUT, 1);
  state.characters.push(you, ...mates, foe);
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
  return { you, mates, foe, bots };
}

const respawned = (characterId: number): GameEvent => ({ type: 'respawned', characterId, respawnsLeft: 0 });

describe('the squad follows you in Extraction (M43 acceptance 4)', () => {
  it('gives Follow me when no order is in force, quietly, and keeps it on later ticks', () => {
    const { you, bots, mates } = squad();
    expect(bots.orderOf(you)).toBe('none');
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('follow');
    for (const m of bots.bots.filter((b) => mates.includes(b.character))) expect(m.orderLeader).toBe(you);
    // Every tick calls it: the order in force is not toggled off.
    keepSquadFollowing(bots, you, [], true);
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('leaves another order the player gave alone (Hold here stays held)', () => {
    const { you, bots } = squad();
    expect(bots.giveOrder(you, 'hold')).toBe('hold');
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('hold');
  });

  it('takes Follow me back after Team plan (the order cancelled)', () => {
    const { you, bots } = squad();
    keepSquadFollowing(bots, you, [], true);
    bots.cancelOrder(you);
    expect(bots.orderOf(you)).toBe('none');
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('follow');
  });

  it('puts the squad under Follow me again when a teammate is back from a hit, even from Hold here', () => {
    const { you, bots, mates } = squad();
    bots.giveOrder(you, 'hold');
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('hold');
    keepSquadFollowing(bots, you, [respawned(mates[0]!.id)], true);
    expect(bots.orderOf(you)).toBe('follow');
    for (const m of bots.bots.filter((x) => mates.includes(x.character))) expect(m.orderLeader).toBe(you);
  });

  it("does not reset the order for the runner's own respawn event or the home team's", () => {
    const { you, bots } = squad();
    bots.giveOrder(you, 'hold');
    keepSquadFollowing(bots, you, [respawned(you.id)], true);
    expect(bots.orderOf(you)).toBe('hold');
  });

  it('does nothing when the run is not live or you are out of play', () => {
    const { you, bots } = squad();
    keepSquadFollowing(bots, you, [], false);
    expect(bots.orderOf(you)).toBe('none');
    you.status = 'calling';
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('none');
    you.status = 'out';
    keepSquadFollowing(bots, you, [respawned(1)], true);
    expect(bots.orderOf(you)).toBe('none');
  });

  it('stays none with no teammate in play to follow (a solo runner)', () => {
    const { you, bots, mates } = squad();
    for (const m of mates) m.status = 'out';
    keepSquadFollowing(bots, you, [], true);
    expect(bots.orderOf(you)).toBe('none');
  });
});
