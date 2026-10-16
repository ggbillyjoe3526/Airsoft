import { describe, expect, it } from 'vitest';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { botConfig, type BotSkill, type Difficulty } from '../config/bots';
import { NEUTRAL_STYLE, type PersonalityStyle } from '../config/botsFile';
import { anchorHolding, type BotIdentity, personalSkill, pushesIn } from './personality';
import { endOrder } from './squadOrders';
import { depotBots, duel } from './testSupport';

/**
 * BN1: a personality is how a bot plays on top of its difficulty, never how well it sees, reacts or aims (the owner's
 * rule that difficulty is skill plus tactics, never different senses, DECISIONS 2026-10-04).
 */
const LEVELS: Difficulty[] = ['easy', 'normal', 'hard', 'pro'];
/** The BotSkill fields a personality may change; every other is the level's. */
const STYLED = new Set<keyof BotSkill>(['holdCoverChance', 'contactCoverMinDistance', 'searchWalkDistance', 'flankChance', 'burst', 'burstPause', 'peekWatchTime', 'holdsAngles', 'slicesCorners']);
const styleOf = (key: string): PersonalityStyle => BOT_PERSONALITIES.styles.get(key)!;
const identity = (key: string, name = key): BotIdentity => ({ name, personality: key, style: styleOf(key) });

describe('personalSkill (BN1)', () => {
  it('keeps every level’s senses, reaction, turning, aim and team habits, whatever the personality', () => {
    for (const level of LEVELS) {
      const skill = botConfig(level);
      for (const key of BOT_PERSONALITIES.styles.keys()) {
        const mine = personalSkill(skill, styleOf(key));
        for (const field of Object.keys(skill) as (keyof BotSkill)[]) if (!STYLED.has(field)) expect(mine[field], `${level} ${key}: ${field}`).toEqual(skill[field]);
      }
    }
  });

  it('is the level itself with no personality', () => {
    const skill = botConfig('hard');
    expect(personalSkill(skill, NEUTRAL_STYLE)).toBe(skill);
  });

  it('scales the habits and keeps chances within 0 to 1', () => {
    const skill = { ...botConfig('normal'), holdCoverChance: 0.8, flankChance: 0.9, burst: [3, 5] as const, burstPause: [0.2, 0.4] as const };
    const style: PersonalityStyle = { ...NEUTRAL_STYLE, holdCoverChance: 2, flankChance: 0.5, burst: 2, burstPause: 0.5, contactCoverMinDistance: 0.5, searchWalkDistance: 3 };
    const mine = personalSkill(skill, style);
    expect(mine.holdCoverChance).toBe(1);
    expect(mine.flankChance).toBe(1);
    expect(mine.burst).toEqual([6, 10]);
    expect(mine.burstPause).toEqual([0.1, 0.2]);
    expect(mine.contactCoverMinDistance).toBe(skill.contactCoverMinDistance * 0.5);
    expect(mine.searchWalkDistance).toBe(skill.searchWalkDistance * 3);
    expect(personalSkill(skill, { ...NEUTRAL_STYLE, flankChance: -2 }).flankChance).toBe(0);
  });

  it('puts the personality’s angle, corner and watch habits in place of the level’s, or keeps the level’s for –', () => {
    const normal = botConfig('normal');
    const pro = botConfig('pro');
    const style: PersonalityStyle = { ...NEUTRAL_STYLE, holdsAngles: true, slicesCorners: false, peekWatchTime: [4, 5] };
    expect(personalSkill(normal, style)).toMatchObject({ holdsAngles: true, slicesCorners: false, peekWatchTime: [4, 5] });
    const keeps = personalSkill(pro, { ...NEUTRAL_STYLE, burst: 1.1 });
    expect(keeps.holdsAngles).toBe(pro.holdsAngles);
    expect(keeps.slicesCorners).toBe(pro.slicesCorners);
    expect(keeps.peekWatchTime).toEqual(pro.peekWatchTime);
  });
});

describe('pushesIn and anchorHolding (BN1)', () => {
  /** Orange's three bots on Depot (ids 3 to 5) as `keys`, in Elimination. */
  const team = (...keys: string[]) => depotBots('elimination', undefined, undefined, new Map(keys.map((k, i) => [3 + i, identity(k)])));

  it('has a rusher push in with no run job and no order, and every hunter, but no guard, patrol or bot under your order', () => {
    const { bots } = team('rusher', 'careful', 'anchor');
    const [rusher, careful] = bots.bots;
    expect(pushesIn(rusher!)).toBe(true);
    expect(pushesIn(careful!)).toBe(false);
    rusher!.order = 'follow';
    expect(pushesIn(rusher!)).toBe(false);
    rusher!.order = 'none';
    for (const role of ['guard', 'patrol'] as const) {
      rusher!.role = role;
      expect(pushesIn(rusher!), role).toBe(false);
    }
    careful!.role = 'hunter';
    expect(pushesIn(careful!)).toBe(true);
  });

  it('has an anchor hold in Elimination while the clock is above its mark and a teammate is in play', () => {
    const { bots, state } = team('anchor', 'rusher', 'careful');
    const w = bots.worldForTests;
    const [anchor, rusher] = bots.bots;
    const until = anchor!.style.holdUntil!;
    expect(until).toBeGreaterThan(0);
    state.round.clock = until + 1;
    expect(anchorHolding(anchor!, w)).toBe(true);
    expect(anchorHolding(rusher!, w), 'a rusher never holds').toBe(false);
    // Down to its mark, it goes.
    state.round.clock = until;
    expect(anchorHolding(anchor!, w)).toBe(false);
    state.round.clock = until + 1;
    // The last of its team in play goes too.
    for (const c of state.characters) if (c.team === anchor!.character.team && c !== anchor!.character) c.status = 'out';
    expect(anchorHolding(anchor!, w)).toBe(false);
  });

  it('has an anchor play on as usual on a run’s job, under your order and outside Elimination', () => {
    const { bots, state } = team('anchor', 'rusher', 'careful');
    const w = bots.worldForTests;
    const anchor = bots.bots[0]!;
    state.round.clock = anchor.style.holdUntil! + 30;
    anchor.order = 'follow';
    expect(anchorHolding(anchor, w)).toBe(false);
    anchor.order = 'none';
    anchor.role = 'guard';
    expect(anchorHolding(anchor, w)).toBe(false);
    anchor.role = 'none';
    state.round.mode = 'attackDefend';
    expect(anchorHolding(anchor, w)).toBe(false);
  });

  it('has an anchor sent hunting (an order ended mid-round, or the late push) hunt, not freeze where it was (BP5)', () => {
    const { bots, state } = team('anchor', 'rusher', 'careful');
    const w = bots.worldForTests;
    const anchor = bots.bots[0]!;
    state.round.clock = anchor.style.holdUntil! + 30;
    anchor.order = 'follow';
    endOrder(anchor, w);
    expect(anchor.hunting).toBe(true);
    expect(anchorHolding(anchor, w)).toBe(false);
  });

  it('stops an anchor’s lane one point short of the middle in Elimination; the others walk theirs to the end', () => {
    const { bots } = team('anchor', 'rusher', 'careful');
    const [anchor, rusher, careful] = bots.bots;
    expect(Number.isFinite(anchor!.lanePoints)).toBe(true);
    expect(anchor!.lanePoints).toBeGreaterThanOrEqual(1);
    expect(rusher!.lanePoints).toBe(Number.POSITIVE_INFINITY);
    expect(careful!.lanePoints).toBe(Number.POSITIVE_INFINITY);
  });

  it('starts a bot with no personality as its level plays', () => {
    const { bots } = depotBots('elimination');
    for (const b of bots.bots) {
      expect(b.personality).toBe('');
      expect(b.style).toBe(NEUTRAL_STYLE);
      expect(b.skill).toBe(bots.bots[0]!.skill);
    }
  });
});

describe('an anchor fighting in the open (BN1, BP5)', () => {
  /** A 12 m duel: the fight ticks the bot sidesteps on, and how many of those it aimed on, and its mean pace then. */
  function strafe(key: string | null) {
    const ids = new Map<number, BotIdentity>(key ? [[1, identity(key)]] : []);
    const { state, bot, bots, run, commands } = duel(12, undefined, undefined, undefined, undefined, undefined, undefined, undefined, ids);
    const b = bots.bots[0]!;
    let strafing = 0;
    let aiming = 0;
    let pace = 0;
    run(6, () => {
      if (bot.status !== 'alive' || state.characters[0]!.status !== 'alive' || b.mode !== 'fight' || commands.get(1)!.right === 0) return;
      strafing++;
      pace += Math.hypot(bot.velocity.x, bot.velocity.z);
      if (bot.aiming) aiming++;
    });
    return { strafing, aiming, pace: pace / Math.max(1, strafing) };
  }

  it('aims from cover only standing still: never while it sidesteps, which it does at the pace any bot does', () => {
    const neutral = strafe(null);
    const anchor = strafe('anchor');
    expect(anchor.strafing).toBeGreaterThan(30);
    expect(anchor.aiming).toBe(0);
    expect(anchor.pace).toBeCloseTo(neutral.pace, 1);
  });
});
