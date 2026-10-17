import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS, botConfig, type Difficulty } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { MAG_SHARE, MAG_WHEEL_LABELS } from '../config/magShare';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { AEG, LOADOUT } from '../config/replicas';
import { MagHandoff, putOnLastMag } from '../magHandoff';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { spareBBs } from '../sim/armament';
import { type Character, createCharacter, respawnCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import type { GameEvent } from '../sim/events';
import { lowOnMags } from '../sim/magShare';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { magLine } from '../ui/magPrompt';
import { BotController } from './botController';
import { asking, hasMagFor } from './magShare';

/**
 * MG1: asking a teammate for a magazine on the open field, with real physics, as the pings and the squad orders are
 * played: you (Blue, not a bot) at (-30, 0, 20), two Blue bots (ids 1 and 2) and one Orange bot far off. Who asks whom,
 * who comes, the toss and the catch, and your side of it (src/magHandoff.ts): the key, the HUD's line, the notices.
 */

// Passes magLine through, counting its calls: the HUD line must be made only when it changes, not each frame.
vi.mock('../ui/magPrompt', async (orig) => {
  const m = await orig<typeof import('../ui/magPrompt')>();
  return { ...m, magLine: vi.fn(m.magLine) };
});

const DT = 1 / 60;

beforeAll(async () => {
  await initPhysics();
});

/** Where everyone stands (you first); Orange (id 3) far off unless a test moves it. */
function field(at: readonly Vec3[] = [vec3(-30, 0, 20), vec3(-18, 0, 20), vec3(-30, 0, 45), vec3(40, 0, -40)], level?: Difficulty) {
  const physics = new PhysicsWorld(OPEN_FIELD, BODY, DT);
  const state = createGameState(5, BALLISTICS.maxBBs, ROUNDS);
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    killY: OPEN_FIELD.killY,
    hits: HITS,
    deadZones: [[{ position: vec3(-45, 0, 45), yaw: 0 }], [{ position: vec3(45, 0, -45), yaw: 0 }]],
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
  at.forEach((p, id) => {
    const c = createCharacter(id, vec3(p.x, PHYSICS.groundRestGap, p.z), 0, LOADOUT, id < 3 ? 0 : 1);
    respawnCharacter(c);
    c.position = vec3(p.x, PHYSICS.groundRestGap, p.z);
    state.characters.push(c);
    physics.addCharacter(c);
  });
  const you = state.characters[0]!;
  const commands = new Map<number, PlayerCommand>([[you.id, createCommand()]]);
  const bots = new BotController(state, state.characters.filter((c) => c !== you), commands, {
    query: physics,
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    lanes: OPEN_FIELD.lanes,
    lowCover: [],
    tallCover: [],
    sight: { foliage: [], night: null },
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    // Nobody fights: the hand-off alone (Orange is far off and out of sight anyway).
    cfg: { ...(level ? botConfig(level) : BOTS), viewDistance: 20 },
    seed: 5,
  });
  const names = new Map([...state.characters].map((c) => [c.id, c === you ? 'You' : `Bot ${c.id}`]));
  const mags = new MagHandoff(you, bots, ctx, (id) => names.get(id) ?? '', () => 'H');
  const events: GameEvent[] = [];
  const live = () => state.round.phase === 'live';
  /** Ticks as MatchSession does: your command (standing still), the toss a press named, the bots, the step, the after. */
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) {
      const cmd = commands.get(you.id)!;
      Object.assign(cmd, createCommand(), { yaw: you.yaw });
      mags.fill(cmd);
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      mags.observe(state.events, state.time, live());
      events.push(...state.events);
    }
  };
  const bot = (id: number) => bots.bots.find((b) => b.character.id === id)!;
  const total = (slot = 0) => state.characters.filter((c) => c.team === 0).reduce((n, c) => n + c.armament.ammo[slot]!.mag + spareBBs(c.armament.ammo[slot]!), 0);
  run(0.5);
  return { state, you, bots, bot, mags, run, events, total, physics, live };
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const empty = (c: Character, slot = 0) => c.armament.ammo[slot]!.pouch.fill(0);
const kinds = (events: readonly GameEvent[]) => events.filter((e) => e.type.startsWith('mag')).map((e) => e.type);

describe('MG1: you ask a teammate for a magazine', () => {
  it('the nearest bot with one to spare comes over and tosses it; no BB is made', () => {
    const f = field();
    empty(f.you);
    const before = f.total();
    f.mags.press(f.state.time, f.live());
    expect(f.bots.mags.bringing(f.you)?.character.id).toBe(1); // 12 m off; Bot 2 is 25 m off
    expect(f.mags.frame(f.state.time, true).line).toBe('Bot 1 is bringing you a mag');
    expect(f.mags.frame(f.state.time, true).mates).toEqual([1]);
    for (let i = 0; i < 6 / DT && !f.events.some((e) => e.type === 'magCaught'); i++) f.run(DT);
    expect(kinds(f.events)).toEqual(['magToss', 'magCaught']);
    expect(f.mags.frame(f.state.time, true).line).toBe('+1 mag from Bot 1 · 60 BBs');
    f.run(MAG_SHARE.noticeTime + 0.1);
    // Not low any more: no hint to ask once the notice has gone.
    expect(f.mags.frame(f.state.time, true).line).toBe('');
    const toss = f.events.find((e) => e.type === 'magToss')!;
    expect(toss).toMatchObject({ fromId: 1, toId: 0, bbs: AEG.magSize });
    expect(lowOnMags(f.you.armament)).toBe(false);
    expect(f.total()).toBe(before);
    expect(f.bots.mags.bringing(f.you)).toBeUndefined();
    f.physics.dispose();
  });

  it('says why when nothing comes: not low, nobody with one to spare, one already coming, between rounds', () => {
    const f = field();
    f.mags.press(f.state.time, true);
    expect(f.mags.frame(f.state.time, true).line).toBe(MAG_SHARE.words.notLow);
    empty(f.you);
    // Each bot keeps a full spare of its rifle: one that has only that left can't give.
    for (const id of [1, 2]) {
      const pouch = f.bot(id).character.armament.ammo[0]!.pouch;
      pouch.fill(0);
      pouch[0] = AEG.magSize;
    }
    f.mags.press(f.state.time, true);
    expect(f.mags.frame(f.state.time, true).line).toBe(MAG_SHARE.words.nobody);
    f.bot(2).character.armament.ammo[0]!.pouch.fill(AEG.magSize);
    f.mags.press(f.state.time + 10, true);
    expect(f.bots.mags.bringing(f.you)?.character.id).toBe(2);
    f.mags.press(f.state.time + 10, true);
    expect(f.mags.frame(f.state.time + 10, true).line).toBe('Bot 2 is already bringing you one');
    f.mags.press(f.state.time + 10, false);
    expect(f.mags.frame(f.state.time + 10, true).line).toBe(MAG_SHARE.words.notNow);
    f.physics.dispose();
  });

  it('counts one in the air as one coming: a press during the flight asks nobody, and the line names the thrower', () => {
    const f = field();
    empty(f.you);
    const before = f.total();
    f.mags.press(f.state.time, f.live());
    for (let i = 0; i < 6 / DT && !f.events.some((e) => e.type === 'magToss'); i++) f.run(DT);
    expect(kinds(f.events)).toEqual(['magToss']);
    // In the air: still low, nobody bringing one, but the thrower keeps the line and the tag.
    expect(lowOnMags(f.you.armament)).toBe(true);
    expect(f.bots.mags.bringing(f.you)).toBeUndefined();
    expect(f.mags.frame(f.state.time, true).line).toBe('Bot 1 is bringing you a mag');
    expect(f.mags.frame(f.state.time, true).mates).toEqual([1]);
    f.mags.press(f.state.time, f.live());
    expect(f.bots.mags.bringing(f.you)).toBeUndefined();
    expect(f.mags.frame(f.state.time, true).line).toBe('Bot 1 is already bringing you one');
    f.run(2);
    expect(kinds(f.events)).toEqual(['magToss', 'magCaught']);
    expect(f.total()).toBe(before);
    f.physics.dispose();
  });

  it('hints once, when you run low with a teammate near who has one to spare', () => {
    const f = field();
    expect(f.mags.frame(f.state.time, true).line).toBe('');
    empty(f.you);
    f.run(0.1);
    expect(f.mags.frame(f.state.time, true).line).toBe('Low on BBs · H to ask for a mag');
    f.run(MAG_SHARE.askHintTime + 0.1);
    expect(f.mags.frame(f.state.time, true).line).toBe('');
    f.physics.dispose();
  });
});

describe('MG1: a bot teammate asks', () => {
  it('asks you when you are the nearest with one to spare, walks up to you and waits; your key tosses it', () => {
    const f = field([vec3(-30, 0, 20), vec3(-18, 0, 20), vec3(10, 0, 45), vec3(40, 0, -40)]);
    const asker = f.bot(1);
    empty(asker.character);
    const before = f.total();
    f.run(0.1);
    expect(asking(asker)).toBe(true);
    expect(asker.magFrom).toBe(f.you);
    expect(asker.mode).toBe('mag');
    expect(f.mags.frame(f.state.time, true).line).toMatch(/^Bot 1 needs a mag · \d+ m$/);
    f.run(6);
    expect(flat(asker.character.position, f.you.position)).toBeLessThan(MAG_SHARE.walkUpTo + 0.5);
    const view = f.mags.frame(f.state.time, true);
    expect([view.line, view.toss, view.wheel]).toEqual(['H · Toss Bot 1 a mag', true, MAG_WHEEL_LABELS.toss]);
    f.mags.press(f.state.time, true);
    f.run(1);
    expect(kinds(f.events)).toEqual(['magToss', 'magCaught']);
    expect(f.events.find((e) => e.type === 'magToss')).toMatchObject({ fromId: 0, toId: 1 });
    expect(asking(asker)).toBe(false);
    expect(lowOnMags(asker.character.armament)).toBe(false);
    expect(f.total()).toBe(before);
    expect(f.mags.frame(f.state.time, true).line).toBe('Mag to Bot 1');
    f.physics.dispose();
  });

  it('asks a bot teammate, which comes over and tosses it while the asker waits where it is', () => {
    const f = field([vec3(-30, 0, 20), vec3(0, 0, 20), vec3(0, 0, 35), vec3(40, 0, -40)]);
    const asker = f.bot(1);
    const giver = f.bot(2);
    empty(asker.character);
    const at = { ...asker.character.position };
    f.run(0.1);
    expect(asker.magFrom).toBe(giver.character);
    expect(giver.magFor).toBe(asker.character);
    expect(giver.mode).toBe('mag');
    // Until the magazine leaves the giver's hand the asker stays put.
    for (let i = 0; i < 8 / DT && !f.events.some((e) => e.type === 'magToss'); i++) f.run(DT);
    expect(flat(asker.character.position, at)).toBeLessThan(1);
    f.run(1);
    expect(kinds(f.events)).toEqual(['magToss', 'magCaught']);
    expect(giver.magFor).toBeUndefined();
    expect(hasMagFor(giver.character, asker.character)).toBe(true); // the giver kept a full spare
    f.physics.dispose();
  });

  it('lets an ask you never answer lapse after askTime, and asks again no sooner than botAskGap', () => {
    const f = field([vec3(-30, 0, 20), vec3(-27, 0, 20), vec3(10, 0, 45), vec3(40, 0, -40)]);
    const asker = f.bot(1);
    // Orange is held at its corner throughout: left to advance, it meets Blue 2 and a hit ends the round (and so the ask)
    // before the ask can lapse, on some seeds' timing.
    const orange = f.state.characters[3]!;
    const hold = (seconds: number) => {
      for (let t = 0; t < seconds - 1e-9; t += 0.5) {
        f.run(Math.min(0.5, seconds - t));
        Object.assign(orange.position, { x: 40, z: -40 });
        orange.velocity.x = orange.velocity.z = 0;
      }
    };
    empty(asker.character);
    hold(0.1);
    const first = asker.magAskAt;
    expect(first).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    hold(MAG_SHARE.askTime + 0.2);
    expect(asking(asker)).toBe(false);
    expect(kinds(f.events)).toEqual([]);
    // Lapsed at first + askTime: no new ask for botAskGap, wherever it goes meanwhile.
    expect(asker.magAskGap).toBeCloseTo(first + MAG_SHARE.askTime + MAG_SHARE.botAskGap, 1);
    for (let t = 0; t < MAG_SHARE.botAskGap - 1; t += 0.5) {
      hold(0.5);
      expect(asking(asker)).toBe(false);
    }
    f.physics.dispose();
  });
});

describe('MG1: Dev settings › Bots run low on BBs', () => {
  it('puts one bot of each team in turn on its last magazine', () => {
    const f = field();
    putOnLastMag(f.bots.bots, 1);
    const low = f.bots.bots.filter((b) => lowOnMags(b.character.armament)).map((b) => b.character.id);
    expect(low).toEqual([2, 3]);
    f.physics.dispose();
  });
});

describe('MG1: the same hand-off at every difficulty', () => {
  for (const level of ['easy', 'hard', 'pro'] as const) {
    it(`${level}: a bot teammate comes over for your ask and tosses it, and one that asks you is answered`, () => {
      const f = field(undefined, level);
      empty(f.you);
      const before = f.total();
      f.mags.press(f.state.time, f.live());
      expect(f.bots.mags.bringing(f.you)?.character.id).toBe(1);
      for (let i = 0; i < 8 / DT && !f.events.some((e) => e.type === 'magCaught'); i++) f.run(DT);
      expect(kinds(f.events)).toEqual(['magToss', 'magCaught']);
      expect(f.total()).toBe(before);
      expect(lowOnMags(f.you.armament)).toBe(false);
      f.physics.dispose();
    });
  }
});

describe('MG1: what comes first in a bot, and what after', () => {
  it('bringing a magazine comes before a squad order; asking for one waits behind it', () => {
    const f = field([vec3(-30, 0, 20), vec3(-18, 0, 20), vec3(10, 0, 45), vec3(40, 0, -40)]);
    const giver = f.bot(1);
    giver.order = 'hold';
    empty(f.you);
    f.mags.press(f.state.time, f.live());
    f.run(0.1);
    expect(giver.mode).toBe('mag');
    expect(giver.order).toBe('hold'); // the order stands; it is back to it afterwards
    f.physics.dispose();
  });

  it('a bot that asks while under a squad order carries on with the order, and goes on asking', () => {
    const f = field([vec3(-30, 0, 20), vec3(-18, 0, 20), vec3(-8, 0, 20), vec3(40, 0, -40)]);
    const asker = f.bot(2);
    asker.order = 'hold';
    empty(asker.character);
    f.run(0.2);
    expect(asking(asker)).toBe(true);
    expect(asker.magFrom).toBe(f.bot(1).character);
    expect(asker.mode).toBe('order');
    f.physics.dispose();
  });

  it('a fight comes first: a bot in sight of an enemy fights while the job waits', () => {
    const f = field([vec3(-30, 0, 20), vec3(-18, 0, 20), vec3(-30, 0, 45), vec3(-18, 0, 10)]);
    const giver = f.bot(1);
    empty(f.you);
    f.mags.press(f.state.time, f.live());
    expect(f.bots.mags.bringing(f.you)).toBe(giver);
    f.run(0.4);
    expect(giver.mode).toBe('fight');
    f.physics.dispose();
  });
});

describe('MG1: the HUD line allocates nothing while it stands', () => {
  it('makes a line once for a stretch of frames, and the same view object each time', () => {
    const f = field([vec3(-30, 0, 20), vec3(-18, 0, 20), vec3(10, 0, 45), vec3(40, 0, -40)]);
    empty(f.bot(1).character);
    f.run(0.1); // Bot 1 asks you
    const view = f.mags.frame(f.state.time, true);
    expect(view.line).toMatch(/needs a mag/);
    const made = vi.mocked(magLine).mock.calls.length;
    for (let i = 0; i < 120; i++) {
      const v = f.mags.frame(f.state.time, true);
      expect(v).toBe(view);
      expect(v.mates).toBe(view.mates);
    }
    expect(vi.mocked(magLine).mock.calls.length).toBe(made);
    f.physics.dispose();
  });
});
