import { describe, expect, it } from 'vitest';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { BOTS, botConfig } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { skillAt } from './adaptiveSkill';
import { BotController } from './botController';
import { personalSkill } from './personality';
import { duel, noWalls } from './testSupport';

describe("adaptive difficulty's skill between rounds (AD1, BotController.setTeamSkill)", () => {
  it("changes only that team's bots, keeping the shared behaviour", () => {
    const { state, player, bot } = duel(12, (s) => s.characters.push(createCharacter(2, vec3(5, 0, -10), 0, LOADOUT, 1)));
    const normal = botConfig('normal');
    const bots = new BotController(state, [player, bot, state.characters[2]!], new Map(), {
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
      teamCfg: [normal, normal],
      seed: 3,
    });
    const sharper = skillAt(1.4, 'normal');
    bots.setTeamSkill(1, sharper);
    expect(bots.cfgOf(0)).toBe(normal);
    expect(bots.cfgOf(1)).toEqual({ ...normal, ...sharper });
    expect(bots.cfgOf(1).huntSectorSize).toBe(BOTS.huntSectorSize);
    for (const b of bots.bots) expect(b.skill.turnRate, `bot ${b.character.id}`).toBe(b.character.team === 1 ? sharper.turnRate : normal.turnRate);
    // The options' own list is left as it was.
    expect(normal.turnRate).toBe(botConfig('normal').turnRate);
  });

  it("lays each bot's personality over the new numbers again (BN1)", () => {
    const { state, player, bot } = duel(12, (s) => s.characters.push(createCharacter(2, vec3(5, 0, -10), 0, LOADOUT, 1)));
    const normal = botConfig('normal');
    const style = BOT_PERSONALITIES.styles.get('rusher')!;
    const bots = new BotController(state, [player, bot, state.characters[2]!], new Map(), {
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
      teamCfg: [normal, normal],
      seed: 3,
      identities: new Map([[bot.id, { name: 'Dash', personality: 'rusher', style }]]),
    });
    const sharper = skillAt(1.4, 'normal');
    bots.setTeamSkill(1, sharper);
    const [rusher, plain] = [bots.bots.find((b) => b.character === bot)!, bots.bots.find((b) => b.character.id === 2)!];
    expect(rusher.skill).toEqual(personalSkill({ ...normal, ...sharper }, style));
    expect(rusher.skill.holdCoverChance).not.toBe(sharper.holdCoverChance);
    expect(rusher.skill.turnRate).toBe(sharper.turnRate);
    expect(plain.skill).toEqual({ ...normal, ...sharper });
  });
});
