import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_SKILL } from '../config/bots';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { vec3 } from '../sim/vec';
import { type Bot, type BotWorld, createBot } from './bot';
import { holsterBot } from './botHolster';
import { playMatch } from './depotMatchSupport';

/** M92 (acceptance 3): bots holster and draw through the same commands, by BOT_BEHAVIOUR's holster tuning. */

const DT = 1 / 60;
const CFG = BOT_BEHAVIOUR;

function scene() {
  const me = createCharacter(0, vec3(), 0, LOADOUT, 0);
  const bot: Bot = createBot(me, 1, CFG, BOT_SKILL.normal);
  const world = { cfg: CFG, live: true, time: 100, inEnemyHalf: () => false } as unknown as BotWorld & { live: boolean; time: number; inEnemyHalf: () => boolean };
  /** One bot tick as thinkBot leaves the command (switchTo 0, no holster), then holsterBot; applied as the simulation would. */
  const tick = (sprint: boolean, act: (cmd: PlayerCommand) => void = () => {}): PlayerCommand => {
    const cmd = createCommand();
    cmd.sprint = sprint;
    cmd.switchTo = 0;
    act(cmd);
    world.time += DT;
    holsterBot(bot, world, cmd, DT);
    if (cmd.holster) me.armament.holstered = true;
    else if (cmd.switchTo >= 0) me.armament.holstered = false;
    return cmd;
  };
  const sprintFor = (s: number): void => {
    for (let t = 0; t < s; t += DT) tick(true);
  };
  /** Sprints until the bot puts the replica away; its sprint time then. */
  const holster = (): void => {
    sprintFor(CFG.holsterAfter + 0.2);
    expect(me.armament.holstered).toBe(true);
  };
  return { me, bot, world, tick, sprintFor, holster };
}

describe('holsterBot (acceptance 3)', () => {
  it('leaves the replica in hand while it walks, and never writes the state itself', () => {
    const s = scene();
    const before = JSON.stringify(s.me.armament);
    for (let i = 0; i < 300; i++) {
      const cmd = s.tick(false);
      expect(cmd.holster).toBe(false);
      expect(cmd.switchTo).toBe(0);
    }
    s.sprintFor(CFG.holsterAfter + 0.5);
    // holsterBot only wrote a command: the test's own apply step is what set the flag; undo it and compare the rest.
    s.me.armament.holstered = false;
    expect(JSON.stringify(s.me.armament)).toBe(before);
  });

  it('puts the replica away after holsterAfter seconds of calm sprinting, once, then keeps it away', () => {
    const s = scene();
    let at = -1;
    let n = 0;
    for (let t = 0; t < 3; t += DT) {
      const cmd = s.tick(true);
      if (cmd.holster) {
        n++;
        at = t;
        expect(cmd.switchTo).toBe(-1);
      } else if (n > 0) {
        expect(cmd.switchTo).toBe(-1); // away: it does not ask for the primary
      }
    }
    expect(n).toBe(1);
    expect(at).toBeGreaterThanOrEqual(CFG.holsterAfter - 2 * DT);
    expect(at).toBeLessThan(CFG.holsterAfter + 2 * DT);
  });

  it('a break in the sprint restarts the count', () => {
    const s = scene();
    s.sprintFor(CFG.holsterAfter - 0.3);
    s.tick(false);
    s.sprintFor(CFG.holsterAfter - 0.3);
    expect(s.me.armament.holstered).toBe(false);
  });

  it('does not put it away with a target in sight, a threat heard within holsterCalmFor, in the enemy half, off a live round, or firing or reloading', () => {
    const blockers: [string, (s: ReturnType<typeof scene>) => void][] = [
      ['target visible', (s) => (s.bot.targetVisible = true)],
      ['threat just heard', (s) => (s.bot.lastThreatAt = s.world.time)],
      ['enemy half', (s) => (s.world.inEnemyHalf = () => true)],
      ['not live', (s) => (s.world.live = false)],
      ['reloading', (s) => (s.me.armament.reload = 1)],
      ['reload queued', (s) => (s.me.armament.reloadQueued = true)],
    ];
    for (const [name, block] of blockers) {
      const s = scene();
      block(s);
      s.sprintFor(CFG.holsterAfter + 1);
      expect(s.me.armament.holstered, name).toBe(false);
    }
    const s = scene();
    for (let t = 0; t < CFG.holsterAfter + 1; t += DT) s.tick(true, (k) => (k.fire = true));
    expect(s.me.armament.holstered, 'firing').toBe(false);
    const r = scene();
    for (let t = 0; t < CFG.holsterAfter + 1; t += DT) r.tick(true, (k) => (k.reload = true));
    expect(r.me.armament.holstered, 'reload').toBe(false);
  });

  it('does once the threat is older than holsterCalmFor', () => {
    const s = scene();
    s.bot.lastThreatAt = s.world.time - CFG.holsterCalmFor - 0.1;
    s.holster();
  });

  const draws: [string, (s: ReturnType<typeof scene>) => (cmd: PlayerCommand) => void][] = [
    ['a target comes into sight', (s) => (s.bot.targetVisible = true, () => {})],
    ['a threat is heard', (s) => (s.bot.lastThreatAt = s.world.time, () => {})],
    ['it crosses into the enemy half', (s) => (s.world.inEnemyHalf = () => true, () => {})],
    ['it fires', () => (k) => (k.fire = true)],
    ['it reloads', () => (k) => (k.reload = true)],
  ];
  for (const [name, cause] of draws) {
    it(`draws again (switchTo 0) when ${name}`, () => {
      const s = scene();
      s.holster();
      const act = cause(s);
      const cmd = s.tick(true, act);
      expect(cmd.holster).toBe(false);
      expect(cmd.switchTo).toBe(0);
      expect(s.me.armament.holstered).toBe(false);
    });
  }

  it('draws holsterDrawAfter seconds after the sprint ends, not for a short turn on the route', () => {
    const s = scene();
    s.holster();
    for (let t = 0; t < CFG.holsterDrawAfter - 0.1; t += DT) expect(s.tick(false).switchTo).toBe(-1);
    expect(s.me.armament.holstered).toBe(true);
    s.sprintFor(0.5); // sprinting again resets the wait
    for (let t = 0; t < CFG.holsterDrawAfter - 0.1; t += DT) s.tick(false);
    expect(s.me.armament.holstered).toBe(true);
    let drew = -1;
    for (let t = 0; t < 2 && drew < 0; t += DT) if (s.tick(false).switchTo === 0) drew = t;
    expect(drew).toBeGreaterThan(0);
    expect(s.me.armament.holstered).toBe(false);
  });
});

describe('bots holster in a match (acceptance 3)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('some bot puts its replica away on a run in the first half minute of a Depot round and draws it again', { timeout: 30_000 }, () => {
    let away = false;
    let drawn = false;
    const held = new Set<number>();
    playMatch(30, 5, undefined, undefined, 'elimination', undefined, DEPOT, undefined, undefined, (state) => {
      for (const c of state.characters) {
        if (c.armament.holstered) {
          away = true;
          held.add(c.id);
        } else if (held.has(c.id)) {
          drawn = true;
          held.delete(c.id);
        }
      }
    });
    expect(away, 'a bot put its replica away').toBe(true);
    expect(drawn, 'and drew it again').toBe(true);
  });
});
