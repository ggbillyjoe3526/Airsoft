import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_SKILL, BOT_TORCH, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { TORCHES } from '../config/torches';
import { buildNightField } from '../map/nightSight';
import { createTorchLight } from '../map/torchLight';
import { fitParts } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { type Bot, type BotMode, type BotWorld, createBot } from './bot';
import { stepBotTorch, wantsTorch } from './botTorch';

const REACH = TORCHES.weaponTorch.reach;
const NIGHT = buildNightField({ ...OPEN_FIELD, night: true }, NIGHT_SIGHT)!;

function armed(id: number, z: number, team: number): Character {
  const c = createCharacter(id, vec3(0, 0, z), 0, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  return c;
}

/** A bot and an enemy `distance` metres in front of it, on a night field (or by day), with what botTorch reads. */
function scene(night: boolean, distance = 20, skill = BOT_SKILL.normal) {
  const me = armed(0, 0, 0);
  const enemy = armed(1, -distance, 1);
  const bot = createBot(me, 1, BOT_BEHAVIOUR, skill);
  // Only what botTorch reads of the bots' world.
  const world = {
    characters: [me, enemy],
    query: { raycastStatic: () => -1 },
    sight: night ? { foliage: [], night: NIGHT, torches: createTorchLight() } : { foliage: [], night: null, torches: null },
    body: BODY,
    hits: HITS,
    cfg: BOT_BEHAVIOUR,
    time: 1,
    live: true,
  } as unknown as BotWorld;
  return { me, enemy, bot, world };
}

const set = (b: Bot, mode: BotMode, targetId = -1): Bot => Object.assign(b, { mode, targetId });

describe('bots work their weapon torch at night (M33h)', () => {
  it('wants it on searching and fighting someone within reach; off advancing, in cover, at the pole and on orders', () => {
    const { bot, world, enemy } = scene(true);
    expect(wantsTorch(set(bot, 'search'), world, REACH)).toBe(true);
    expect(wantsTorch(set(bot, 'fight', enemy.id), world, REACH)).toBe(true);
    expect(wantsTorch(set(bot, 'advance'), world, REACH)).toBe(false);
    for (const mode of ['cover', 'flag', 'order'] as const) expect(wantsTorch(set(bot, mode), world, REACH)).toBe(false);
    expect(wantsTorch(set(bot, 'fight', enemy.id), world, 10)).toBe(false); // out of reach
    enemy.status = 'calling';
    expect(wantsTorch(set(bot, 'fight', enemy.id), world, REACH)).toBe(false); // hit: nothing to light
    world.live = false;
    expect(wantsTorch(set(bot, 'search'), world, REACH)).toBe(false); // between rounds
  });

  it('keeps it off on the way to a search, and on for its last stretch (M71)', () => {
    const { bot, world } = scene(true);
    set(bot, 'search');
    bot.lastKnown = vec3(0, 0, -(BOT_SKILL.normal.searchWalkDistance + 5));
    expect(wantsTorch(bot, world, REACH)).toBe(false);
    bot.lastKnown = vec3(0, 0, -(BOT_SKILL.normal.searchWalkDistance - 1));
    expect(wantsTorch(bot, world, REACH)).toBe(true);
    const easy = scene(true, 20, BOT_SKILL.easy);
    set(easy.bot, 'search');
    easy.bot.lastKnown = vec3(0, 0, -30);
    expect(wantsTorch(easy.bot, easy.world, REACH)).toBe(true); // Easy keeps it on on the move
  });

  it("switches it on for a fight within BOT_TORCH.fightReach, not across the beam's whole reach (M71)", () => {
    expect(BOT_TORCH.fightReach).toBeLessThan(REACH);
    for (const [distance, on] of [
      [BOT_TORCH.fightReach - 2, true],
      [BOT_TORCH.fightReach + 5, false],
    ] as const) {
      const { bot, me, world, enemy } = scene(true, distance);
      me.torchTime = BOT_TORCH.minHold;
      const cmd = createCommand();
      stepBotTorch(set(bot, 'fight', enemy.id), world, cmd);
      expect(cmd.toggleTorch, `${distance} m`).toBe(on);
    }
  });

  it("keeps an Easy bot's on the move", () => {
    const { bot, world } = scene(true, 20, BOT_SKILL.easy);
    expect(wantsTorch(set(bot, 'advance'), world, REACH)).toBe(true);
  });

  it('switches by state, holding each at least BOT_TORCH.minHold so it never strobes', () => {
    const { bot, me, world } = scene(true);
    const cmd = createCommand();
    set(bot, 'search');
    stepBotTorch(bot, world, cmd);
    expect(cmd.toggleTorch).toBe(false); // switched off at spawn just now: held
    me.torchTime = BOT_TORCH.minHold;
    stepBotTorch(bot, world, cmd);
    expect(cmd.toggleTorch).toBe(true);
    me.torchOn = true;
    me.torchTime = 0;
    set(bot, 'cover');
    stepBotTorch(bot, world, cmd);
    expect(cmd.toggleTorch).toBe(false); // wants it off, but only just switched on
    me.torchTime = BOT_TORCH.minHold - 0.01;
    stepBotTorch(bot, world, cmd);
    expect(cmd.toggleTorch).toBe(false);
    me.torchTime = BOT_TORCH.minHold;
    stepBotTorch(bot, world, cmd);
    expect(cmd.toggleTorch).toBe(true);
  });

  it('refreshes the torch light the bots see by once per perception interval, not every tick (audit AI-07)', () => {
    const { bot, me, enemy, world } = scene(true);
    me.torchOn = true;
    const field = world.sight!.torches!;
    stepBotTorch(set(bot, 'search'), world, createCommand());
    expect(field.time).toBe(Math.floor(world.time / world.cfg.thinkInterval));
    expect(field.lit[enemy.id]).toBe(1);
    // The torch goes off: within the same interval the field keeps what it worked out; in the next one it is redone.
    me.torchOn = false;
    (world as { time: number }).time += world.cfg.thinkInterval / 4;
    stepBotTorch(bot, world, createCommand());
    expect(field.lit[enemy.id]).toBe(1);
    (world as { time: number }).time += world.cfg.thinkInterval;
    stepBotTorch(bot, world, createCommand());
    expect(field.lit[enemy.id]).toBe(0);
  });

  it('touches nothing by day, or without a light', () => {
    const day = scene(false);
    const cmd = createCommand();
    cmd.toggleTorch = true;
    day.me.torchTime = 99;
    stepBotTorch(set(day.bot, 'search'), day.world, cmd);
    expect(cmd.toggleTorch).toBe(false);

    const night = scene(true);
    fitParts(night.me.armament, night.me.armament.parts.map((p) => ({ ...p, light: null })));
    night.me.torchTime = 99;
    stepBotTorch(set(night.bot, 'search'), night.world, cmd);
    expect(cmd.toggleTorch).toBe(false);
  });
});
