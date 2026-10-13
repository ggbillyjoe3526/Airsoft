import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS_BAND, ON_TIME_BAND, PRO_BAND, reportMeasure, share, shareError } from '../../ai/balance/balanceSupport';
import { EXTRACTION_BALANCE } from '../../ai/balance/extractionBands';
import { DT, playMatch } from '../../ai/depotMatchSupport';
import { measureRuns } from '../../ai/extractionRunSupport';
import { botConfig, DIFFICULTIES } from '../../config/bots';
import { CONTENT_BALANCE_RUN, MAP_BALANCE_BANDS, MODE_BALANCE_BANDS } from '../../config/contentRules';
import { ROUNDS } from '../../config/hits';
import { MATCH_MODES, unknownMode } from '../../config/modes';
import { NAV } from '../../config/nav';
import { LIGHTING_LABELS, lightingChoices, mapUnderLighting } from '../../map/lightingChoice';
import { mapData, MAPS } from '../../map/maps';
import { playableMode } from '../../map/playableMode';
import { buildNavGrid } from '../../nav/navGrid';
import { initPhysics } from '../../physics/physicsWorld';
import { GAME_LEVELS } from '../../progress/gameLevels';
import { roundsPayNoise, roundsPayPerMinute } from '../modePay';
import { addTallies, lowestFloor, watchMatch, type WatchTally } from './matchWatch';
import { contentMaps, ENV, envNumber, namesMode, reportMeta } from './reportSupport';

/**
 * The content report's balance run on one map (CT2, level 4; modes since CT3): headless bot matches on the map
 * AIRSOFT_CONTENT_ITEM names ("map:<id>"), or for a mode's check ("mode:<id>") on the map AIRSOFT_CONTENT_MAP names, both
 * teams as they come, at its standard team size, under each lighting it offers (AIRSOFT_CONTENT_LIGHTING: one only), in
 * each mode it hosts (AIRSOFT_CONTENT_MODE: one only) and at every level.
 *
 * A mode played in rounds (ai/depotMatchSupport.ts playMatch): each end's share of the decided rounds (Attack / Defend:
 * the attackers', who start at end 0), the rounds that run out the clock, bots that never leave spawn, bots stuck with
 * nothing to do, anyone falling through, and (a mode with an objective) the decided rounds the objective decided; and
 * what it pays a minute (modePay.ts), which pipeline/content-check.mjs sets beside Elimination's on the same map. A mode
 * played as a run (Extraction, ai/extractionRunSupport.ts measureRuns): the runs the squad gets out of and what it gets
 * out with against each map's bands (ai/balance/extractionBands.ts), the runs that run out the clock, and each harder
 * home team harder to get out from. On a public map, mode and level the figures hold their bands (the owner's 40 to 60 %
 * at Pro, 35 to 65 % below it, Audit 2 decision 3; under 1 round in 10 on time); on dev ones they are information
 * (decision 5 of the plan).
 */

const entry = namesMode() ? MAPS.find((m) => m.id === ENV.AIRSOFT_CONTENT_MAP) : contentMaps()[0];
const seeds = envNumber('AIRSOFT_CONTENT_SEEDS', CONTENT_BALANCE_RUN.seeds);
const seconds = envNumber('AIRSOFT_CONTENT_SECONDS', CONTENT_BALANCE_RUN.seconds);

describe('content report: the balance run on a map', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('names a map', () => {
    expect(entry, `no map is called "${namesMode() ? ENV.AIRSOFT_CONTENT_MAP : ENV.AIRSOFT_CONTENT_ITEM}"`).toBeTruthy();
  });

  if (!entry) return;
  const data = mapData(entry.id);
  for (const lighting of lightingChoices(data).filter((l) => !ENV.AIRSOFT_CONTENT_LIGHTING || l === ENV.AIRSOFT_CONTENT_LIGHTING)) {
    const map = mapUnderLighting(data, lighting);
    const lowest = lowestFloor(buildNavGrid(map, NAV).floorY);
    const where = lightingChoices(data).length > 1 ? `${entry.label} (${LIGHTING_LABELS[lighting]})` : entry.label;
    const modes = MATCH_MODES.filter((m) => playableMode(map, m.id) === m.id && (!ENV.AIRSOFT_CONTENT_MODE || m.id === ENV.AIRSOFT_CONTENT_MODE));
    for (const mode of modes) {
      for (const level of DIFFICULTIES) {
        const judged = entry.tag === 'public' && mode.tag === 'public' && level.tag === 'public';
        const band = <T extends object>(b: T): T | Record<string, never> => (judged ? b : {});
        const label = `${where}, ${mode.label}, ${level.label}`;
        const devNote = judged ? '' : '; dev content: shown, not judged';
        switch (mode.id) {
          case 'elimination':
          case 'attackDefend':
            it(`plays ${label}, both teams as they come`, { timeout: 3_600_000 }, (ctx) => {
              let rounds = 0;
              let decided = 0;
              let end0 = 0;
              let onTime = 0;
              let byObjective = 0;
              let hits = 0;
              const played: { seconds: number; winner: number }[] = [];
              let watched: WatchTally | null = null;
              for (let seed = 1; seed <= seeds; seed++) {
                const watch = watchMatch(map, lowest, DT);
                const stats = playMatch(seconds, seed, undefined, botConfig(level.id), mode.id, ROUNDS, map, entry.teamSize.standard, undefined, watch.onTick);
                watched = watched ? addTallies(watched, watch.tally) : watch.tally;
                hits += stats.hits - stats.friendlyHits - stats.selfHits;
                for (const r of stats.results) {
                  rounds++;
                  played.push({ seconds: r.length, winner: r.winner });
                  if (r.reason === 'time') onTime++;
                  if (r.winner < 0) continue;
                  decided++;
                  if (r.reason !== 'eliminated') byObjective++;
                  if (r.winnerEnd === 0) end0++;
                }
              }
              const w = watched!;
              const runs = `${seeds} seeds × ${seconds} s, ${entry.teamSize.standard} a side${devNote}`;
              const who = mode.id === 'attackDefend' ? 'the attackers (end 0)' : 'end 0';
              reportMeasure(ctx, { label: `${label}: rounds ${who} won, of the decided ones`, value: share(end0, decided), of: decided, band: band(level.id === 'pro' ? PRO_BAND : LEVELS_BAND), detail: `${end0} of ${decided} decided; ${runs}` });
              reportMeasure(ctx, { label: `${label}: rounds that ran out the clock`, value: share(onTime, rounds), of: rounds, band: band(ON_TIME_BAND), detail: `${onTime} of ${rounds}` });
              // Elimination's objective is the knock-out; any other round mode's must decide some rounds itself.
              if (mode.id !== 'elimination') reportMeasure(ctx, { label: `${label}: decided rounds the objective decided`, value: share(byObjective, decided), of: decided, band: band({ min: MODE_BALANCE_BANDS.objectiveDecides }), detail: `${byObjective} of ${decided} decided by the flag, not a knock-out` });
              reportMeasure(ctx, { label: `${label}: bots that never left spawn in a round`, value: share(w.stayedAtSpawn, w.botRounds), of: w.botRounds, band: band({ max: MAP_BALANCE_BANDS.stayedAtSpawn }), detail: `${w.stayedAtSpawn} of ${w.botRounds} bot-rounds` });
              reportMeasure(ctx, {
                label: `${label}: bots stuck with nothing to do, per 10 bot-minutes`,
                value: w.botMinutes > 0 ? (10 * w.stuck) / w.botMinutes : Number.NaN,
                unit: 'a 10 bot-minutes',
                band: band({ max: MAP_BALANCE_BANDS.stuckPerTenMinutes }),
                detail: `${w.stuck} in ${w.botMinutes.toFixed(0)} bot-minutes${w.firstStuck ? `; the first at ${w.firstStuck}` : ''}`,
              });
              reportMeasure(ctx, { label: `${label}: anyone falling through the floor`, value: w.fell, unit: '', band: band({ max: 0 }), detail: `${w.fell} fell` });
              // Pay a minute: shown here, set beside Elimination's by content-check (pay in line, MODE_BALANCE_BANDS.pay).
              const sweep = { rounds: played, hits, players: 2 * entry.teamSize.standard, seconds: seeds * seconds };
              const xpPerMinute = roundsPayPerMinute(GAME_LEVELS.xp, level.id, sweep, ROUNDS);
              reportMeasure(ctx, { label: `${label}: XP a minute in the standard match`, value: xpPerMinute, unit: 'XP a minute', band: {}, detail: `from ${rounds} rounds and ${hits} hits` });
              reportMeta(ctx, 'pay', { map: entry.id, lighting, mode: mode.id, level: level.id, judged, label, xpPerMinute, noise: roundsPayNoise(sweep, ROUNDS), band: MODE_BALANCE_BANDS.pay });
            });
            break;
          case 'extraction':
            it(`plays ${label}: whole runs`, { timeout: 3_600_000 }, (ctx) => {
              const m = measureRuns(map, level.id, seeds);
              const target = EXTRACTION_BALANCE[entry.id]?.bands[level.id];
              const out = m.runs.filter((r) => r.reason === 'extracted').length;
              const onTime = m.runs.filter((r) => r.reason === 'time').length;
              const runs = `${seeds} runs, a bot runner with two Normal teammates${devNote}${target ? '' : `; ${entry.label} has no Extraction bands yet (ai/balance/extractionBands.ts)`}`;
              reportMeasure(ctx, { label: `${label}: runs the squad got out of`, value: m.extract, of: m.runs.length, band: band(target ? { min: target.extract[0], max: target.extract[1] } : {}), detail: `${out} of ${m.runs.length}; ${runs}` });
              reportMeasure(ctx, { label: `${label}: runs that ran out the clock`, value: share(onTime, m.runs.length), of: m.runs.length, band: band(ON_TIME_BAND), detail: `${onTime} of ${m.runs.length}` });
              reportMeasure(ctx, { label: `${label}: XP a minute the squad got out with`, value: m.xpPerMinute, unit: 'XP a minute', band: band(target ? { min: target.xpPerMinute[0], max: target.xpPerMinute[1] } : {}), detail: "a bot runner's haul: comparable between levels and builds, not with Elimination's pay" });
              // Each harder home team harder to get out from: content-check sets the levels side by side (the map's own
              // pairs, ai/balance/extractionBands.ts, or each level against the next).
              const harder = EXTRACTION_BALANCE[entry.id]?.harder ?? DIFFICULTIES.slice(1).map((d, i) => [DIFFICULTIES[i]!.id, d.id] as const);
              reportMeta(ctx, 'runs', { map: entry.id, lighting, mode: mode.id, level: level.id, judged, where, extract: m.extract, runs: m.runs.length, se: shareError(m.extract, m.runs.length), harder });
            });
            break;
          default:
            unknownMode(mode.id);
        }
      }
    }
  }
});
