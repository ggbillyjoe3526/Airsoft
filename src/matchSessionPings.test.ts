import { describe, expect, it, vi } from 'vitest';
import { PINGS } from './config/pings';
import { HITS } from './config/hits';
import { LOADOUT } from './config/replicas';
import { MatchSession } from './matchSession';
import { createCharacter } from './sim/character';
import { vec3 } from './sim/vec';
import { createPing } from './ai/pings';

/**
 * PG1 QA: the session's side of a ping. The real session needs a GPU and physics, so the real methods run on a bare
 * object holding what they touch (as matchSessionDevAssist.test.ts does).
 */
function bare(over: { status?: 'alive' | 'out'; phase?: string; watchingBots?: boolean; time?: number; accepts?: boolean } = {}) {
  const s = Object.create(MatchSession.prototype) as MatchSession;
  const player = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  player.status = over.status ?? 'alive';
  const botsPing = vi.fn((_l: unknown, _y: number, _p: number, _t: number, out: ReturnType<typeof createPing>) => {
    out.kind = 'spot';
    out.point.x = 4;
    return over.accepts ?? true;
  });
  const matchPing = vi.fn();
  const pingPlaced = vi.fn();
  const state = { time: over.time ?? 10, round: { phase: over.phase ?? 'live' }, characters: [player] as ReturnType<typeof createCharacter>[] };
  Object.assign(s, {
    player,
    state,
    input: { yaw: 1, pitch: 0.1 },
    bots: { ping: botsPing },
    match: { watchingBots: over.watchingBots ?? false, ping: matchPing, callout: vi.fn() },
    combat: { pingPlaced, radioCall: vi.fn() },
    playerPing: createPing(),
    pingedAt: Number.NEGATIVE_INFINITY,
    markPoint: vec3(),
    hits: HITS,
  });
  const place = () => (s as unknown as { placePing(): void }).placePing();
  return { s, state, player, botsPing, matchPing, pingPlaced, place };
}

describe('PG1: placing a ping (acceptance 1)', () => {
  it('pings for the team, shows it and plays the pip when the view finds something', () => {
    const f = bare();
    f.place();
    expect(f.botsPing).toHaveBeenCalledTimes(1);
    expect(f.matchPing).toHaveBeenCalledWith(0, 'spot', expect.objectContaining({ x: 4 }));
    expect(f.pingPlaced).toHaveBeenCalledTimes(1);
  });

  it('adds the weapon recoil to the pitch it aims by', () => {
    const f = bare();
    f.player.armament.recoil = 0.05;
    f.place();
    expect(f.botsPing.mock.calls[0]![2]).toBeCloseTo(0.15, 6);
  });

  it('shows and sounds nothing when nothing is in range', () => {
    const f = bare({ accepts: false });
    f.place();
    expect(f.matchPing).not.toHaveBeenCalled();
    expect(f.pingPlaced).not.toHaveBeenCalled();
  });

  it.each([
    ['out of play', { status: 'out' as const }],
    ['between rounds', { phase: 'reset' }],
    ['before the round is live', { phase: 'freeze' }],
    ['watching bots (Dev)', { watchingBots: true }],
  ])('pings nothing %s', (_name, over) => {
    const f = bare(over);
    f.place();
    expect(f.botsPing).not.toHaveBeenCalled();
    expect(f.matchPing).not.toHaveBeenCalled();
    expect(f.pingPlaced).not.toHaveBeenCalled();
  });

  it('takes a second press inside PINGS.minGap for one ping, and the next one after it', () => {
    const f = bare({ time: 10 });
    f.place();
    f.state.time = 10 + PINGS.minGap / 2;
    f.place();
    expect(f.botsPing).toHaveBeenCalledTimes(1);
    f.state.time = 10 + PINGS.minGap + 0.01;
    f.place();
    expect(f.botsPing).toHaveBeenCalledTimes(2);
  });

  it('does not start the gap when the press found nothing', () => {
    const f = bare({ accepts: false });
    f.place();
    f.botsPing.mockImplementation(() => true);
    f.place();
    expect(f.botsPing).toHaveBeenCalledTimes(2);
  });
});

describe('PG1: a sighting call marks its enemy (acceptance 5)', () => {
  function said(f: ReturnType<typeof bare>, calls: object[]) {
    Object.assign(f.s, { callouts: { saidCount: calls.length, said: calls } });
    (f.s as unknown as { sayCallouts(): void }).sayCallouts();
  }
  function withTeam() {
    const f = bare();
    const mate = createCharacter(1, vec3(2, 0, 0), 0, LOADOUT, 0);
    const foe = createCharacter(2, vec3(10, 0, 5), 0, LOADOUT, 1);
    f.state.characters.push(mate, foe);
    return { f, mate, foe };
  }

  it('pings the enemy named by a teammate\'s call, at their body, owned by the caller', () => {
    const { f, foe } = withTeam();
    said(f, [{ speakerId: 1, team: 0, text: 'Contact!', markId: 2 }]);
    expect(f.matchPing).toHaveBeenCalledTimes(1);
    const [owner, kind, point] = f.matchPing.mock.calls[0]!;
    expect([owner, kind]).toEqual([1, 'enemy']);
    expect(point.x).toBeCloseTo(foe.position.x, 6);
    expect(point.z).toBeCloseTo(foe.position.z, 6);
    expect(point.y).toBeGreaterThan(foe.position.y);
  });

  it('marks nothing for a call without a mark, or one of the other team', () => {
    const { f } = withTeam();
    said(f, [
      { speakerId: 1, team: 0, text: 'Clear', markId: -1 },
      { speakerId: 2, team: 1, text: 'Contact!', markId: 0 },
    ]);
    expect(f.matchPing).not.toHaveBeenCalled();
  });

  it('shows a teammate\'s line in the feed whether or not it marks', () => {
    const { f } = withTeam();
    said(f, [{ speakerId: 1, team: 0, text: 'Contact!', markId: 2 }]);
    expect(f.s.match.callout).toHaveBeenCalledWith(1, 0, 'Contact!');
  });
});
