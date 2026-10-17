import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { initPhysics } from '../physics/physicsWorld';
import { playMatch } from './depotMatchSupport';
import { anchorHolding, type BotIdentity } from './personality';

/**
 * BN1 acceptance 3: the four personalities play differently, at one difficulty (Normal), with nothing but the
 * personality changed. Each plays a headless 3v3 on Depot against itself, two seeds, and the habits the file gives it
 * show: rushers move and meet the enemy first, anchors hold and rest their replicas on cover, flankers spread over the
 * lanes, careful bots walk and slice their corners.
 */
const SEEDS = [1, 2];
const SECONDS = 40;

interface Play {
  firstShot: number;
  /** Shares of the live ticks of bots in play. */
  holding: number;
  moving: number;
  aiming: number;
  careful: number;
  anchoring: number;
  /** Rounds in which a team's three bots set off on three different lanes, and rounds planned. */
  ownLanes: number;
  plans: number;
}

/** Six bots of personality `key` play `SECONDS` on Depot, over SEEDS; their habits, summed over the seeds. */
function play(key: string): Play {
  const style = BOT_PERSONALITIES.styles.get(key)!;
  const out: Play = { firstShot: 0, holding: 0, moving: 0, aiming: 0, careful: 0, anchoring: 0, ownLanes: 0, plans: 0 };
  let live = 0;
  for (const seed of SEEDS) {
    const identities = new Map<number, BotIdentity>();
    for (let id = 0; id < 6; id++) identities.set(id, { name: `${key} ${id}`, personality: key, style });
    let firstShot = SECONDS;
    let planned = -1;
    playMatch(SECONDS, seed, undefined, BOTS, 'elimination', ROUNDS, undefined, undefined, undefined, (state, bots) => {
      if (firstShot === SECONDS && state.events.some((e) => e.type === 'shot')) firstShot = state.time;
      if (state.round.phase !== 'live') return;
      if (planned !== state.round.number) {
        planned = state.round.number;
        for (const team of [0, 1]) {
          out.plans++;
          if (new Set(bots.bots.filter((b) => b.character.team === team).map((b) => b.lane)).size === 3) out.ownLanes++;
        }
      }
      for (const b of bots.bots) {
        const c = b.character;
        if (c.status !== 'alive') continue;
        live++;
        if (b.holding) out.holding++;
        if (Math.hypot(c.velocity.x, c.velocity.z) > 0.5) out.moving++;
        if (c.aiming) out.aiming++;
        if (b.careful) out.careful++;
        if (anchorHolding(b, bots.worldForTests)) out.anchoring++;
      }
    }, undefined, undefined, identities);
    out.firstShot += firstShot / SEEDS.length;
  }
  for (const k of ['holding', 'moving', 'aiming', 'careful', 'anchoring'] as const) out[k] /= Math.max(1, live);
  return out;
}

describe('the four personalities play differently (BN1, acceptance 3)', () => {
  const plays = new Map<string, Play>();
  beforeAll(async () => {
    await initPhysics();
    for (const key of ['rusher', 'anchor', 'flanker', 'careful']) plays.set(key, play(key));
  }, 60_000);
  const of = (key: string) => plays.get(key)!;

  it('has rushers on the move and the first to meet the enemy, pausing least', () => {
    const r = of('rusher');
    for (const other of ['anchor', 'flanker', 'careful']) {
      expect(r.firstShot, other).toBeLessThan(of(other).firstShot);
      expect(r.holding, other).toBeLessThan(of(other).holding);
      expect(r.moving, other).toBeGreaterThan(of(other).moving);
    }
  });

  it('has anchors hold short of the middle, aiming from cover; nobody else aims', () => {
    const a = of('anchor');
    expect(a.anchoring).toBeGreaterThan(0.7);
    expect(a.holding).toBeGreaterThan(0.4);
    expect(a.aiming).toBeGreaterThan(0.3);
    for (const other of ['rusher', 'flanker', 'careful']) {
      expect(of(other).anchoring, other).toBe(0);
      expect(of(other).aiming, other).toBe(0);
    }
  });

  it('has flankers each take a lane of their own, every round', () => {
    const f = of('flanker');
    expect(f.plans).toBeGreaterThan(0);
    expect(f.ownLanes).toBe(f.plans);
  });

  it('has careful bots walk their corners, a thing no other Normal bot does', () => {
    expect(of('careful').careful).toBeGreaterThan(0.1);
    for (const other of ['rusher', 'anchor', 'flanker']) expect(of(other).careful, other).toBe(0);
  });
});
