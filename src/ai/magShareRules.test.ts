import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_SKILL, type Difficulty } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { MAG_SHARE } from '../config/magShare';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { createRoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { type Bot, type BotWorld, createBot } from './bot';
import { asking, MagShare } from './magShare';

/**
 * MG1 criteria 1 and 4 without a level: who is chosen to give (and who is not), what the giver keeps, a pistol asker's
 * magazine, and that all of it is the same at every difficulty and for both teams. MagShare reads only the characters,
 * the clock, `live` and the round (for the pole), so a stub world is enough.
 */

const LEVELS = Object.keys(BOT_SKILL) as Difficulty[];

/** Bots for characters at the given x (z = 0), team 0 unless `teams` says; ids are indices. */
function squad(xs: readonly number[], level: Difficulty = 'normal', teams: readonly number[] = []) {
  const bots: Bot[] = xs.map((x, id) => createBot(createCharacter(id, vec3(x, 0, 0), 0, LOADOUT, teams[id] ?? 0), id + 1, BOT_BEHAVIOUR, BOT_SKILL[level]));
  const world = { characters: bots.map((b) => b.character), live: true, time: 100, round: createRoundState(ROUNDS) } as unknown as BotWorld;
  return { bots, world, share: new MagShare(bots), chars: world.characters };
}

const emptyPouch = (b: Bot, slot = 0) => b.character.armament.ammo[slot]!.pouch.fill(0);
/** `b` holds `n` full spares for `slot`, nothing else. */
function spares(b: Bot, n: number, slot = 0) {
  const pouch = b.character.armament.ammo[slot]!.pouch;
  const size = slot === 0 ? AEG.magSize : GAS_PISTOL.magSize;
  pouch.fill(0);
  for (let i = 0; i < n; i++) pouch[i] = size;
}

describe('MG1: who is chosen to bring a magazine', () => {
  it('skips a bot that is asking for one itself, and takes the next nearest', () => {
    const s = squad([0, 5, 10]);
    emptyPouch(s.bots[0]!);
    s.bots[1]!.magAskAt = 90;
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
    expect(s.share.bringing(s.chars[0]!)).toBe(s.bots[2]);
  });

  it('skips a bot already bringing a magazine to someone else', () => {
    const s = squad([0, 5, 10]);
    emptyPouch(s.bots[0]!);
    s.bots[1]!.magFor = s.chars[2]!;
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
    expect(s.share.bringing(s.chars[0]!)).toBe(s.bots[2]);
  });

  it('skips a bot that is off to the pole, and says nobody when it was the only one', () => {
    const s = squad([0, 5]);
    emptyPouch(s.bots[0]!);
    s.world.round.mode = 'attackDefend';
    s.world.round.attackers = 0;
    s.bots[1]!.laneDone = true; // an attacker that has swept its lane goes to the pole
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('nobody');
    s.bots[1]!.laneDone = false;
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
  });

  it('skips a bot that is out of play, an enemy, and one past askRange', () => {
    const s = squad([0, 5, 8, MAG_SHARE.askRange + 5], 'normal', [0, 0, 1, 0]);
    emptyPouch(s.bots[0]!);
    s.chars[1]!.status = 'calling';
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('nobody');
  });

  it('refuses an ask out of play, between rounds, when not low, and when one is already coming', () => {
    const s = squad([0, 5]);
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('notLow');
    emptyPouch(s.bots[0]!);
    s.world.live = false;
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('notNow');
    s.world.live = true;
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('already');
    const out = squad([0, 5]);
    emptyPouch(out.bots[0]!);
    out.chars[0]!.status = 'calling';
    expect(out.share.ask(out.chars[0]!, out.world)).toBe('notNow');
  });
});

describe('MG1: what the giver keeps and what the asker gets', () => {
  it('a giver with one full spare of the rifle it fights with keeps it; with two it gives one', () => {
    const s = squad([0, 5]);
    emptyPouch(s.bots[0]!);
    spares(s.bots[1]!, 1);
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('nobody');
    spares(s.bots[1]!, 2);
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
  });

  it('a pistol in hand asks for a pistol magazine, never a rifle one', () => {
    const s = squad([0, 5]);
    s.chars[0]!.armament.active = 1;
    emptyPouch(s.bots[0]!, 1);
    // The giver has plenty of rifle spares but only the pistol's one, which it isn't fighting with: it can give it.
    spares(s.bots[1]!, 3, 0);
    spares(s.bots[1]!, 1, 1);
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
    const free = squad([0, 5]);
    free.chars[0]!.armament.active = 1;
    emptyPouch(free.bots[0]!, 1);
    spares(free.bots[1]!, 3, 0);
    emptyPouch(free.bots[1]!, 1);
    expect(free.share.ask(free.chars[0]!, free.world)).toBe('nobody');
  });

  it('a giver holding its pistol keeps the pistol spare it fights with', () => {
    const s = squad([0, 5]);
    s.chars[0]!.armament.active = 1;
    emptyPouch(s.bots[0]!, 1);
    s.chars[1]!.armament.active = 1;
    spares(s.bots[1]!, 1, 1);
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('nobody');
    spares(s.bots[1]!, 2, 1);
    expect(s.share.ask(s.chars[0]!, s.world)).toBe('asked');
  });
});

describe('MG1: the same at every difficulty, both teams alike', () => {
  for (const level of LEVELS) {
    for (const team of [0, 1]) {
      it(`${level}, team ${team}: a low bot asks the nearest teammate, which takes the job; the ask ends when the magazine lands`, () => {
        const s = squad([0, 6, 12, 80], level, [team, team, team, 1 - team]);
        const [asker, near, far] = s.bots as [Bot, Bot, Bot];
        emptyPouch(asker);
        s.share.update(s.world);
        expect(asking(asker)).toBe(true);
        expect(asker.magFrom).toBe(near.character);
        expect(near.magFor).toBe(asker.character);
        expect(far.magFor).toBeUndefined();
        s.share.observe([{ type: 'magToss', fromId: 1, toId: 0, bbs: AEG.magSize, replicaId: AEG.id }], s.chars, s.world.time);
        expect(near.magFor).toBeUndefined();
        expect(asker.magInAir).toBe(true);
        s.share.observe([{ type: 'magCaught', fromId: 1, toId: 0, bbs: AEG.magSize, replicaId: AEG.id }], s.chars, s.world.time);
        expect(asking(asker)).toBe(false);
        expect(asker.magAskGap).toBe(s.world.time + MAG_SHARE.botAskGap);
      });
    }
  }

  it('a bot with nobody to ask waits botAskGap before it looks again', () => {
    const s = squad([0]);
    emptyPouch(s.bots[0]!);
    s.share.update(s.world);
    expect(asking(s.bots[0]!)).toBe(false);
    expect(s.bots[0]!.magAskGap).toBe(s.world.time + MAG_SHARE.botAskGap);
  });
});
