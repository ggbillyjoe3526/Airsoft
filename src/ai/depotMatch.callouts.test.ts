import { beforeAll, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { CALLOUT_LINES } from '../config/calloutLines';
import { CALLOUT_LINE_MAX, type CalloutEvent } from '../config/calloutsFile';
import { ROUNDS } from '../config/hits';
import type { MatchMode } from '../config/modes';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import type { GameState } from '../sim/state';
import type { BotController } from './botController';
import { CalloutDirector } from './callouts';
import { playMatch } from './depotMatchSupport';

beforeAll(async () => {
  await initPhysics();
});

/**
 * CL1: the bots' callouts over whole headless matches on every map, with the shipped callouts.md. Every call keeps the
 * pace (one a team a tick, the team's and the bot's gaps), comes from a bot in play during a live round, and fits; the
 * calls come at a steady rate; and a match plays the same with the callouts listening as without.
 */

const SLACK = 1e-6;

interface Heard {
  calls: number;
  liveSeconds: number;
  events: Set<CalloutEvent>;
  problems: string[];
}

/** An onTick that runs a director as MatchSession does, and checks every call it says. */
function listener(map: MapData, seed: number) {
  const director = new CalloutDirector(CALLOUT_LINES, seed, map.areas ?? [], true);
  const pace = CALLOUT_LINES.pace;
  const heard: Heard = { calls: 0, liveSeconds: 0, events: new Set(), problems: [] };
  const teamSaid = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const botSaid = new Map<number, number>();
  const onTick = (state: GameState, bots: BotController) => {
    director.observe(state, bots.bots);
    if (state.round.phase === 'live') heard.liveSeconds += 1 / 60;
    const teams = new Set<number>();
    for (let k = 0; k < director.saidCount; k++) {
      const c = director.said[k]!;
      const t = state.time;
      const speaker = state.characters[c.speakerId];
      const fail = (why: string) => heard.problems.push(`${t.toFixed(2)} s, ${c.speakerId} "${c.text}": ${why}`);
      heard.calls++;
      heard.events.add(c.event);
      if (state.round.phase !== 'live') fail('said outside a live round');
      if (!speaker || speaker.team !== c.team || !isInPlay(speaker)) fail('the speaker is not in play on that team');
      if (!bots.bots.some((b) => b.character.id === c.speakerId)) fail('the speaker is not a bot');
      if (teams.has(c.team)) fail('a second call for the team this tick');
      teams.add(c.team);
      if (t - teamSaid[c.team]! < pace.teamGap - SLACK) fail(`the team spoke ${(t - teamSaid[c.team]!).toFixed(2)} s ago`);
      if (t - (botSaid.get(c.speakerId) ?? Number.NEGATIVE_INFINITY) < pace.botGap - SLACK) fail('the bot spoke within its gap');
      if (c.text === '' || c.text.length > CALLOUT_LINE_MAX || /[{}]/.test(c.text)) fail('not a filled line that fits');
      teamSaid[c.team] = t;
      botSaid.set(c.speakerId, t);
    }
    if (state.events.some((e) => e.type === 'roundStart')) teamSaid.fill(Number.NEGATIVE_INFINITY);
  };
  return { heard, onTick };
}

function play(map: MapData, mode: MatchMode, seed: number, seconds: number): Heard {
  const { heard, onTick } = listener(map, seed);
  playMatch(seconds, seed, undefined, BOTS, mode, ROUNDS, map, ROUNDS.teamSize, undefined, onTick);
  return heard;
}

it('keeps the pace on every map, from bots in play, at a steady rate', { timeout: 300_000 }, () => {
  // Measured 2026-10-13 (CL1), seed 1, 180 s: 8.2 / 11.4 / 6.8 / 5.5 calls a team a minute of live play, in the order
  // below; seeds 2-4 on Depot, contact the most said, then hits, then noises and searches.
  const runs: [string, MapData, MatchMode][] = [
    ['Depot, Elimination', DEPOT, 'elimination'],
    ['Depot, Attack/Defend', DEPOT, 'attackDefend'],
    ['Woodland', WOODLAND, 'elimination'],
    ['Neon Heights', NEON_HEIGHTS, 'attackDefend'],
  ];
  const events = new Set<CalloutEvent>();
  for (const [name, map, mode] of runs) {
    const heard = play(map, mode, 1, 180);
    for (const e of heard.events) events.add(e);
    const perTeamMinute = heard.calls / 2 / (heard.liveSeconds / 60);
    expect(heard.problems, name).toEqual([]);
    expect(heard.liveSeconds, name).toBeGreaterThan(60);
    // Enough to hear the team, never a stream: the team's gap alone would allow 40 a minute.
    expect(perTeamMinute, name).toBeGreaterThan(3);
    expect(perTeamMinute, name).toBeLessThan(20);
  }
  // Sightings, hits, noises, searches, holds and the flag are all called somewhere.
  for (const e of ['contact', 'down', 'lastOne', 'heard', 'checking', 'flanking', 'holding', 'raising', 'flag'] as const) expect(events, e).toContain(e);
});

it('never changes how a match plays: the same shots, hits and rounds with the callouts listening as without', { timeout: 120_000 }, () => {
  const quiet = playMatch(120, 2, undefined, BOTS, 'attackDefend', ROUNDS, DEPOT);
  const { heard, onTick } = listener(DEPOT, 2);
  const talking = playMatch(120, 2, undefined, BOTS, 'attackDefend', ROUNDS, DEPOT, ROUNDS.teamSize, undefined, onTick);
  expect(heard.calls).toBeGreaterThan(5);
  expect(talking.results).toEqual(quiet.results);
  expect([talking.shots, talking.hits, talking.maxFlag]).toEqual([quiet.shots, quiet.hits, quiet.maxFlag]);
  expect(talking.farthestFromSpawn).toEqual(quiet.farthestFromSpawn);
});
