import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_SKILL, BOT_TORCH, DIFFICULTIES as LEVELS, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { TORCHES } from '../config/torches';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { buildNightField } from '../map/nightSight';
import { createTorchLight } from '../map/torchLight';
import { fitParts } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { createRng } from '../sim/rng';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { createAim, stepAim } from './aim';
import { type Bot, type BotMode, type BotWorld, createBot } from './bot';
import { keepApart } from './botMovement';
import { stepBotTorch, wantsTorch } from './botTorch';

// M71 QA: gaps in the fast guards of the changes of "every level hunts the middle and keeps out of the light, and bots
// light their torch only up close" (the shipped M71 tests are in botTorch.test.ts, ai.test.ts and the slow match files).

const DT = 1 / 60;
const DIFFICULTIES = LEVELS.map((o) => o.id);
const REACH = TORCHES.weaponTorch.reach;
const NIGHT = buildNightField({ ...OPEN_FIELD, night: true }, NIGHT_SIGHT)!;

describe('aimWanderSettle scales how fast the aim error chases its wander goal (audit AI-08)', () => {
  /** The first step draws a goal (same seed, so the same goal whatever the settle); returns error and goal after `steps`. */
  function errAfter(settle: number, steps: number) {
    const a = createAim(0);
    const cfg = { ...BOT_BEHAVIOUR, aimWanderSettle: settle };
    const rng = createRng(5);
    for (let i = 0; i < steps; i++) stepAim(a, 0, 0, 0, cfg, BOT_SKILL.normal, rng, DT);
    return a;
  }

  it('moves the error the fraction 1 - exp(-rate × settle × dt) of the way to the goal in one step', () => {
    for (const settle of [1, 3, 6]) {
      const a = errAfter(settle, 1);
      const k = 1 - Math.exp(-BOT_BEHAVIOUR.aimWanderRate * settle * DT);
      expect(Math.hypot(a.goalErrYaw, a.goalErrPitch)).toBeGreaterThan(0);
      expect(a.errYaw, `settle ${settle}`).toBeCloseTo(a.goalErrYaw * k, 12);
      expect(a.errPitch, `settle ${settle}`).toBeCloseTo(a.goalErrPitch * k, 12);
    }
  });

  it('a higher settle gets nearer the goal in the same time, and a zero settle never leaves the start', () => {
    const slow = errAfter(1, 30);
    const fast = errAfter(6, 30);
    expect(Math.hypot(fast.errYaw, fast.errPitch)).toBeGreaterThan(Math.hypot(slow.errYaw, slow.errPitch) * 2.5);
    const frozen = errAfter(0, 30);
    expect(frozen.errYaw).toBeCloseTo(0, 15);
    expect(frozen.errPitch).toBeCloseTo(0, 15);
  });

  it('the shipped 3 settles about 95 % of the way before the next goal is drawn', () => {
    expect(BOT_BEHAVIOUR.aimWanderSettle).toBe(3);
    const steps = Math.floor((1 / BOT_BEHAVIOUR.aimWanderRate) / DT) - 1; // just before the goal is redrawn
    const a = errAfter(BOT_BEHAVIOUR.aimWanderSettle, steps);
    const reached = Math.hypot(a.errYaw, a.errPitch) / Math.hypot(a.goalErrYaw, a.goalErrPitch);
    expect(reached).toBeGreaterThan(0.94);
    expect(reached).toBeLessThan(0.96);
  });
});

describe('the M71 skill flags and torch numbers as shipped', () => {
  it('every level hunts the middle; Normal and up keep out of the light, Easy does not; Pro too', () => {
    for (const d of DIFFICULTIES) expect(BOT_SKILL[d].huntsMiddle, d).toBe(true);
    expect(BOT_SKILL.easy.keepsDark).toBe(false);
    for (const d of ['normal', 'hard', 'pro'] as const) expect(BOT_SKILL[d].keepsDark, d).toBe(true);
  });

  it("the fight reach is a positive distance shorter than the beam's", () => {
    expect(BOT_TORCH.fightReach).toBeGreaterThan(0);
    expect(BOT_TORCH.fightReach).toBeLessThan(REACH);
  });
});

function armed(id: number, z: number, team: number): Character {
  const c = createCharacter(id, vec3(0, 0, z), 0, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  return c;
}

function scene(distance: number, skill = BOT_SKILL.normal) {
  const me = armed(0, 0, 0);
  const enemy = armed(1, -distance, 1);
  const bot = createBot(me, 1, BOT_BEHAVIOUR, skill);
  const world = {
    characters: [me, enemy],
    query: { raycastStatic: () => -1 },
    sight: { foliage: [], night: NIGHT, torches: createTorchLight() },
    body: BODY,
    hits: HITS,
    cfg: BOT_BEHAVIOUR,
    time: 1,
    live: true,
  } as unknown as BotWorld;
  return { me, enemy, bot, world };
}

const set = (b: Bot, mode: BotMode, targetId = -1): Bot => Object.assign(b, { mode, targetId });

describe('a search lights the torch only for its last stretch (M71)', () => {
  it('lights exactly at searchWalkDistance and not a hair beyond, at every level', () => {
    for (const d of DIFFICULTIES) {
      const skill = { ...BOT_SKILL[d], torchOnTheMove: false };
      const { bot, world } = scene(20, skill);
      set(bot, 'search');
      bot.lastKnown = vec3(0, 0, -skill.searchWalkDistance);
      expect(wantsTorch(bot, world, REACH), `${d} at the distance`).toBe(true);
      bot.lastKnown = vec3(0, 0, -(skill.searchWalkDistance + 0.01));
      expect(wantsTorch(bot, world, REACH), `${d} beyond`).toBe(false);
    }
  });

  it('measures along the ground: height does not count, and any bearing does', () => {
    const { bot, world } = scene(20);
    const walk = BOT_SKILL.normal.searchWalkDistance;
    set(bot, 'search');
    bot.lastKnown = vec3(0, 50, -(walk - 1)); // far above, near on the ground
    expect(wantsTorch(bot, world, REACH)).toBe(true);
    const diag = (walk + 1) / Math.SQRT2;
    bot.lastKnown = vec3(diag, 0, diag); // sideways and behind, 1 m out
    expect(wantsTorch(bot, world, REACH)).toBe(false);
    bot.lastKnown = vec3(-(walk - 1) / Math.SQRT2, 0, (walk - 1) / Math.SQRT2);
    expect(wantsTorch(bot, world, REACH)).toBe(true);
  });

  it('a skill that keeps it on the move lights it whatever the distance, at every level', () => {
    for (const d of DIFFICULTIES) {
      const skill = { ...BOT_SKILL[d], torchOnTheMove: true };
      const { bot, world } = scene(20, skill);
      set(bot, 'search');
      bot.lastKnown = vec3(0, 0, -500);
      expect(wantsTorch(bot, world, REACH), d).toBe(true);
    }
  });

  it('is lit and put out by stepBotTorch as the bot closes on the spot (after the hold time)', () => {
    const { bot, me, world } = scene(20);
    set(bot, 'search');
    me.torchTime = BOT_TORCH.minHold;
    bot.lastKnown = vec3(0, 0, -(BOT_SKILL.normal.searchWalkDistance + 10));
    const far = createCommand();
    stepBotTorch(bot, world, far);
    expect(far.toggleTorch).toBe(false); // off and wanting off
    bot.lastKnown = vec3(0, 0, -2);
    const near = createCommand();
    stepBotTorch(bot, world, near);
    expect(near.toggleTorch).toBe(true);
    me.torchOn = true;
    me.torchTime = BOT_TORCH.minHold - 0.1;
    bot.lastKnown = vec3(0, 0, -(BOT_SKILL.normal.searchWalkDistance + 10));
    const held = createCommand();
    stepBotTorch(bot, world, held);
    expect(held.toggleTorch).toBe(false); // wants off, but holds the state
    me.torchTime = BOT_TORCH.minHold;
    const off = createCommand();
    stepBotTorch(bot, world, off);
    expect(off.toggleTorch).toBe(true);
  });
});

describe('a fight lights the torch within BOT_TORCH.fightReach (M71)', () => {
  const toggles = (distance: number, setup: (s: ReturnType<typeof scene>) => void = () => {}) => {
    const s = scene(distance);
    s.me.torchTime = BOT_TORCH.minHold;
    setup(s);
    const cmd = createCommand();
    stepBotTorch(set(s.bot, 'fight', s.enemy.id), s.world, cmd);
    return cmd.toggleTorch;
  };

  it('lights at exactly fightReach and not a hair beyond', () => {
    expect(toggles(BOT_TORCH.fightReach)).toBe(true);
    expect(toggles(BOT_TORCH.fightReach + 0.01)).toBe(false);
  });

  it('puts a lit torch out when the fight is further than fightReach, but within the beam', () => {
    const lit = ({ me }: ReturnType<typeof scene>) => {
      me.torchOn = true;
    };
    expect(toggles(30, lit)).toBe(true);
    expect(toggles(BOT_TORCH.fightReach - 1, lit)).toBe(false);
  });

  it('a light with a shorter reach than fightReach still wins (the smaller of the two)', () => {
    const light = TORCHES.weaponTorch as { reach: number };
    const was = light.reach;
    light.reach = 10;
    try {
      expect(toggles(9)).toBe(true);
      expect(toggles(15)).toBe(false); // inside fightReach, outside this beam
    } finally {
      light.reach = was;
    }
  });

  it('nothing to light when the target is out of play, not in the match, or the bot has none', () => {
    expect(toggles(10, ({ enemy }) => (enemy.status = 'calling'))).toBe(false);
    expect(toggles(10, ({ enemy }) => (enemy.status = 'out'))).toBe(false);
    const s = scene(10);
    s.me.torchTime = BOT_TORCH.minHold;
    const cmd = createCommand();
    stepBotTorch(set(s.bot, 'fight', 99), s.world, cmd); // a target id nobody has
    expect(cmd.toggleTorch).toBe(false);
    stepBotTorch(set(s.bot, 'fight', -1), s.world, cmd);
    expect(cmd.toggleTorch).toBe(false);
  });

  it('measures along the ground, so a target on another floor counts by its position over the ground', () => {
    expect(toggles(BOT_TORCH.fightReach - 1, ({ enemy }) => (enemy.position.y = 40))).toBe(true);
  });
});

describe('keepApart: a bot sidestepping in a fight steps to the side the push points, unless that side is blocked (M71)', () => {
  // The ground ends at x = 1, and the nav keeps 0.5 m in from it: a bot at x = 0.1 stepping edgeLookahead to the view's
  // right (+X at yaw 0) is off the ground; to the left it is open.
  const EDGE = buildNavGrid(
    { ...OPEN_FIELD, blocks: [{ kind: 'floor', center: vec3(-24, -0.25, 0), size: vec3(50, 0.5, 100) }] },
    NAV,
  );

  function world(nav = OPEN_NAV, others: readonly Character[] = []): { w: BotWorld; bot: Bot; me: Character } {
    const me = createCharacter(0, vec3(AT, 0, 0), 0, LOADOUT, 0);
    const bot = createBot(me, 1, BOT_BEHAVIOUR, BOT_SKILL.normal);
    bot.aim.yaw = 0;
    const w = { characters: [me, ...others], nav, cfg: BOT_BEHAVIOUR, body: BODY } as unknown as BotWorld;
    return { w, bot, me };
  }
  const AT = 0.1;
  /** A teammate `dx`, `dz` from the bot. */
  const mate = (id: number, dx: number, dz: number) => createCharacter(id, vec3(AT + dx, 0, dz), 0, LOADOUT, 0);
  const strafe = (right: number, forward = 0) => Object.assign(createCommand(), { right, forward });

  it('the test ground really ends on the right', () => {
    expect(isWalkableAt(EDGE, AT, 0, 0)).toBe(true);
    expect(isWalkableAt(EDGE, AT + BOT_BEHAVIOUR.edgeLookahead, 0, 0)).toBe(false);
    expect(isWalkableAt(EDGE, AT - BOT_BEHAVIOUR.edgeLookahead, 0, 0)).toBe(true);
  });

  it('turns a strafe round to the side the teammate pushes it, both ways, and never walks it (returns false)', () => {
    const { w, bot } = world(OPEN_NAV, [mate(1, -0.3, 0)]); // teammate on the left pushes right
    const cmd = strafe(-1, 1);
    expect(keepApart(bot, w, false, cmd)).toBe(false);
    expect(cmd.right).toBe(1);
    expect(cmd.forward).toBe(1);
    const other = world(OPEN_NAV, [mate(1, 0.3, 0)]); // on the right pushes left
    const cmd2 = strafe(1);
    expect(keepApart(other.bot, other.w, false, cmd2)).toBe(false);
    expect(cmd2.right).toBe(-1);
  });

  it('also starts a side step for a bot that only moves forward or back (right 0)', () => {
    const { w, bot } = world(OPEN_NAV, [mate(1, -0.3, 0)]);
    const cmd = strafe(0, -1);
    keepApart(bot, w, false, cmd);
    expect(cmd.right).toBe(1);
    expect(cmd.forward).toBe(-1);
  });

  it('reads the push against the bot\'s view, not the map axes', () => {
    // Facing -X (yaw 90 degrees) the view's right is -Z: a teammate at +Z pushes the bot towards -Z, to its right.
    const { w, bot } = world(OPEN_NAV, [mate(1, 0, 0.3)]);
    bot.aim.yaw = Math.PI / 2;
    const cmd = strafe(-1);
    keepApart(bot, w, false, cmd);
    expect(cmd.right).toBe(1);
    const back = world(OPEN_NAV, [mate(1, 0, -0.3)]);
    back.bot.aim.yaw = Math.PI / 2;
    const cmd2 = strafe(1);
    keepApart(back.bot, back.w, false, cmd2);
    expect(cmd2.right).toBe(-1);
  });

  it('keeps the strafe it has when the pushed side is off the ground', () => {
    const { w, bot } = world(EDGE, [mate(1, -0.3, 0)]); // pushed right, but the right is the edge
    const cmd = strafe(-1);
    expect(keepApart(bot, w, false, cmd)).toBe(false);
    expect(cmd.right).toBe(-1);
    const open = world(EDGE, [mate(1, 0.3, 0)]); // pushed left, which is open
    const cmd2 = strafe(1);
    keepApart(open.bot, open.w, false, cmd2);
    expect(cmd2.right).toBe(-1);
  });

  it('a bot that does not strafe (right 0) is left alone when the pushed side is blocked', () => {
    const { w, bot } = world(EDGE, [mate(1, -0.3, 0)]);
    const cmd = strafe(0, 1);
    keepApart(bot, w, false, cmd);
    expect(cmd.right).toBe(0);
  });

  it('leaves the strafe alone with a push straight along the view (no side), already on the pushed side, or nobody near', () => {
    const ahead = world(OPEN_NAV, [mate(1, 0, -0.3)]); // dead ahead: pushes straight back
    const c1 = strafe(-1);
    keepApart(ahead.bot, ahead.w, false, c1);
    expect(c1.right).toBe(-1);
    const same = world(OPEN_NAV, [mate(1, -0.3, 0)]);
    const c2 = strafe(1, 1);
    keepApart(same.bot, same.w, false, c2);
    expect([c2.right, c2.forward]).toEqual([1, 1]);
    const alone = world(OPEN_NAV, [mate(1, BOT_BEHAVIOUR.separationDistance + 0.1, 0)]);
    const c3 = strafe(-1);
    expect(keepApart(alone.bot, alone.w, false, c3)).toBe(false);
    expect(c3.right).toBe(-1);
  });

  it('ignores teammates who are out of play, and a walking bot is bent round them as before, its command untouched', () => {
    const down = mate(1, -0.3, 0);
    down.status = 'calling';
    const a = world(OPEN_NAV, [down]);
    const c1 = strafe(-1);
    keepApart(a.bot, a.w, false, c1);
    expect(c1.right).toBe(-1);
    const b = world(OPEN_NAV, [mate(1, -0.3, 0)]);
    b.bot.moveDir.x = 0;
    b.bot.moveDir.z = -1;
    const c2 = strafe(-1);
    expect(keepApart(b.bot, b.w, true, c2)).toBe(true);
    expect(c2.right).toBe(-1);
    expect(b.bot.moveDir.x).toBeGreaterThan(0);
  });
});
