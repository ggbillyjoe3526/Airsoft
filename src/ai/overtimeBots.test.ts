import { describe, expect, it } from 'vitest';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { BOT_SKILL, BOTS } from '../config/bots';
import { DEPOT } from '../map/depot';
import { raiseOvertimeFlag } from '../sim/overtimeFlag';
import { type Bot, flagSpot, holdYaw, wantsFlag } from './bot';
import { enterFlagMode } from './botMovement';
import { type BotIdentity, overtimeWatching } from './personality';
import { depotBots } from './testSupport';

/**
 * OT1 (Dev 6 item 45): the bots and Elimination's overtime flag. Each goes for it once its level's reaction is over;
 * an anchor or a careful bot first watches it from cover by it (bots.md › Habits), a flanker may go round the side.
 */

const SPOT = DEPOT.overtimeFlag!;
const identity = (key: string): BotIdentity => ({ name: key, personality: key, style: BOT_PERSONALITIES.styles.get(key)! });

/** Orange's three bots on Depot as `keys`, the overtime flag up at `time` and the controller told so (bots read `w.time`). */
function overtime(keys: string[], time = 100) {
  const setup = depotBots('elimination', undefined, BOTS, new Map(keys.map((k, i) => [3 + i, identity(k)])));
  const { state, bots } = setup;
  state.time = time;
  state.round.clock = 0;
  raiseOvertimeFlag(state.round.overtimeFlag, SPOT);
  state.events.length = 0;
  state.events.push({ type: 'overtime', position: { ...SPOT } });
  bots.observe(state);
  const w = bots.worldForTests;
  w.time = time; // the controller's clock, as its update sets it
  return { ...setup, w, list: bots.bots as Bot[] };
}

describe('going for the overtime flag', () => {
  it('each bot goes once its level\'s reaction is over, and never before the flag is up or once the round is decided', () => {
    const { state, w, list } = overtime(['rusher', 'flanker', 'rusher']);
    for (const b of list) {
      const [lo, hi] = b.skill.overtimeReaction;
      expect(b.overtimeAt - 100).toBeGreaterThanOrEqual(lo);
      expect(b.overtimeAt - 100).toBeLessThanOrEqual(hi);
      w.time = b.overtimeAt - 0.01;
      expect(wantsFlag(b, w)).toBe(false);
      w.time = b.overtimeAt;
      expect(wantsFlag(b, w)).toBe(true);
    }
    expect(flagSpot(w)).toBe(state.round.overtimeFlag.position);
    state.round.phase = 'over';
    expect(wantsFlag(list[0]!, w)).toBe(false);
    state.round.phase = 'live';
    state.round.overtimeFlag.up = false;
    expect(wantsFlag(list[0]!, w)).toBe(false);
  });

  it('reacts slowest on Easy and quickest on Pro, Normal between', () => {
    const mid = (l: keyof typeof BOT_SKILL) => (BOT_SKILL[l].overtimeReaction[0] + BOT_SKILL[l].overtimeReaction[1]) / 2;
    expect(mid('easy')).toBeGreaterThan(mid('normal'));
    expect(mid('normal')).toBeGreaterThan(mid('hard'));
    expect(mid('hard')).toBeGreaterThan(mid('pro'));
  });

  it('heads for the very foot of the flag (a touch wins), not a spot beside it', () => {
    const { w, list } = overtime(['rusher', 'rusher', 'rusher']);
    const b = list[0]!;
    b.overtimeFlank = false;
    w.time = b.overtimeAt;
    enterFlagMode(b, w);
    expect(b.mode).toBe('flag');
    expect(b.flagGuard).toBe(false);
    expect(b.flanking).toBe(false);
    expect(b.flagGoal).toEqual(SPOT);
  });

  it('a flanker whose roll came up goes round by a point to one side first, once; not from close by', () => {
    const { w, list } = overtime(['flanker', 'rusher', 'rusher']);
    const b = list[0]!;
    w.time = b.overtimeAt;
    b.overtimeFlank = true;
    enterFlagMode(b, w);
    expect(b.flanking).toBe(true);
    const p = b.character.position;
    const off = Math.hypot(b.flankGoal.x - SPOT.x, b.flankGoal.z - SPOT.z);
    expect(off).toBeCloseTo(Math.hypot(BOTS.overtimeFlankOffset, BOTS.overtimeFlankBack), 1);
    // Off the straight way to the flag: to one side of it.
    const ux = (SPOT.x - p.x) / Math.hypot(SPOT.x - p.x, SPOT.z - p.z);
    const uz = (SPOT.z - p.z) / Math.hypot(SPOT.x - p.x, SPOT.z - p.z);
    expect(Math.abs((b.flankGoal.x - SPOT.x) * -uz + (b.flankGoal.z - SPOT.z) * ux)).toBeCloseTo(BOTS.overtimeFlankOffset, 1);
    expect(b.overtimeFlank).toBe(false); // used up
    // From close by it goes straight.
    const near = list[1]!;
    near.overtimeFlank = true;
    near.character.position.x = SPOT.x + BOTS.overtimeFlankMinDistance - 1;
    near.character.position.z = SPOT.z;
    w.time = near.overtimeAt;
    enterFlagMode(near, w);
    expect(near.flanking).toBe(false);
  });
});

describe('watching the flag first (bots.md › Habits)', () => {
  it('an anchor and a careful bot watch it from cover by it for their seconds; a rusher and a flanker go straight', () => {
    const { w, list } = overtime(['anchor', 'careful', 'rusher']);
    const [anchor, careful, rusher] = list as [Bot, Bot, Bot];
    expect(anchor.style.overtimeWatch).toBe(12);
    expect(careful.style.overtimeWatch).toBe(5);
    expect(BOT_PERSONALITIES.styles.get('flanker')!.overtimeWatch).toBeNull();
    w.time = anchor.overtimeAt + 1;
    expect(overtimeWatching(anchor, w)).toBe(true);
    expect(overtimeWatching(rusher, w)).toBe(false);
    w.time = careful.overtimeAt + 5;
    expect(overtimeWatching(careful, w)).toBe(false);
    w.time = anchor.overtimeAt + 1;
    enterFlagMode(anchor, w);
    expect(anchor.flagGuard).toBe(true);
    expect(Math.hypot(anchor.flagGoal.x - SPOT.x, anchor.flagGoal.z - SPOT.z)).toBeLessThanOrEqual(BOTS.flagGuardRadius + 1e-6);
    // Holding there, it aims at the flag.
    const yaw = holdYaw(anchor, w);
    expect(Math.atan2(-(SPOT.x - anchor.flagGoal.x), -(SPOT.z - anchor.flagGoal.z))).toBeCloseTo(yaw, 6);
  });

  it('goes in once its watch is over, with the overtime\'s last seconds, under your order, or as the last of its team', () => {
    const { state, w, list } = overtime(['anchor', 'rusher', 'rusher']);
    const anchor = list[0]!;
    w.time = anchor.overtimeAt + 1;
    expect(overtimeWatching(anchor, w)).toBe(true);
    w.time = anchor.overtimeAt + anchor.style.overtimeWatch!;
    expect(overtimeWatching(anchor, w)).toBe(false);
    w.time = anchor.overtimeAt + 1;
    state.round.overtimeFlag.left = BOTS.overtimeGoBy;
    expect(overtimeWatching(anchor, w)).toBe(false);
    state.round.overtimeFlag.left = BOTS.overtimeGoBy + 5;
    anchor.order = 'follow';
    expect(overtimeWatching(anchor, w)).toBe(false);
    anchor.order = 'none';
    for (const c of state.characters) if (c.team === anchor.character.team && c !== anchor.character) c.status = 'out';
    expect(overtimeWatching(anchor, w)).toBe(false);
  });
});
