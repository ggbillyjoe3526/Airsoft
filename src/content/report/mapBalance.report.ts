import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS_BAND, ON_TIME_BAND, PRO_BAND, reportMeasure, share } from '../../ai/balance/balanceSupport';
import { DT, playMatch } from '../../ai/depotMatchSupport';
import { botConfig, DIFFICULTIES } from '../../config/bots';
import { CONTENT_BALANCE_RUN, MAP_BALANCE_BANDS } from '../../config/contentRules';
import { ROUNDS } from '../../config/hits';
import { MATCH_MODES } from '../../config/modes';
import { NAV } from '../../config/nav';
import { LIGHTING_LABELS, lightingChoices, mapUnderLighting } from '../../map/lightingChoice';
import { mapData } from '../../map/maps';
import { playableMode } from '../../map/playableMode';
import { buildNavGrid } from '../../nav/navGrid';
import { initPhysics } from '../../physics/physicsWorld';
import { addTallies, lowestFloor, watchMatch, type WatchTally } from './matchWatch';
import { contentMaps, ENV, envNumber } from './reportSupport';

/**
 * The content report's map balance run (CT2, level 4): headless bot matches (ai/depotMatchSupport.ts playMatch) on the
 * map AIRSOFT_CONTENT_ITEM names ("map:<id>"), both teams as they come, at its standard team size, under each lighting
 * it offers (AIRSOFT_CONTENT_LIGHTING: one only), in each round mode it hosts (AIRSOFT_CONTENT_MODE: one only) and at
 * every level. Per sweep: each end's share of the decided rounds (Attack / Defend: the attackers', who start at end 0),
 * the rounds that run out the clock, bots that never leave spawn, bots stuck with nothing to do, and anyone falling
 * through. On a public map, mode and level the figures hold their bands (the owner's 40 to 60 % at Pro, 35 to 65 % below
 * it, Audit 2 decision 3; under 1 round in 10 on time); on dev ones they are information (decision 5 of the plan).
 * Extraction plays as runs, not rounds: its sweep comes with the mode checks (part 3).
 */

const entry = contentMaps()[0];
const seeds = envNumber('AIRSOFT_CONTENT_SEEDS', CONTENT_BALANCE_RUN.seeds);
const seconds = envNumber('AIRSOFT_CONTENT_SECONDS', CONTENT_BALANCE_RUN.seconds);

describe('content report: the map balance run', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('names a map', () => {
    expect(entry, `no map is called "${ENV.AIRSOFT_CONTENT_ITEM}"`).toBeTruthy();
  });

  if (!entry) return;
  const data = mapData(entry.id);
  for (const lighting of lightingChoices(data).filter((l) => !ENV.AIRSOFT_CONTENT_LIGHTING || l === ENV.AIRSOFT_CONTENT_LIGHTING)) {
    const map = mapUnderLighting(data, lighting);
    const lowest = lowestFloor(buildNavGrid(map, NAV).floorY);
    const where = lightingChoices(data).length > 1 ? `${entry.label} (${LIGHTING_LABELS[lighting]})` : entry.label;
    const modes = MATCH_MODES.filter((m) => m.id !== 'extraction' && playableMode(map, m.id) === m.id && (!ENV.AIRSOFT_CONTENT_MODE || m.id === ENV.AIRSOFT_CONTENT_MODE));
    for (const mode of modes) {
      for (const level of DIFFICULTIES) {
        it(`plays ${where}, ${mode.label}, ${level.label}, both teams as they come`, { timeout: 3_600_000 }, (ctx) => {
          let rounds = 0;
          let decided = 0;
          let end0 = 0;
          let onTime = 0;
          let watched: WatchTally | null = null;
          for (let seed = 1; seed <= seeds; seed++) {
            const watch = watchMatch(map, lowest, DT);
            const stats = playMatch(seconds, seed, undefined, botConfig(level.id), mode.id, ROUNDS, map, entry.teamSize.standard, undefined, watch.onTick);
            watched = watched ? addTallies(watched, watch.tally) : watch.tally;
            for (const r of stats.results) {
              rounds++;
              if (r.reason === 'time') onTime++;
              if (r.winner < 0) continue;
              decided++;
              if (r.winnerEnd === 0) end0++;
            }
          }
          const w = watched!;
          const judged = entry.tag === 'public' && mode.tag === 'public' && level.tag === 'public';
          const band = <T extends object>(b: T): T | Record<string, never> => (judged ? b : {});
          const label = `${where}, ${mode.label}, ${level.label}`;
          const runs = `${seeds} seeds × ${seconds} s, ${entry.teamSize.standard} a side${judged ? '' : '; dev content: shown, not judged'}`;
          const who = mode.id === 'attackDefend' ? 'the attackers (end 0)' : 'end 0';
          reportMeasure(ctx, {
            label: `${label}: rounds ${who} won, of the decided ones`,
            value: share(end0, decided),
            of: decided,
            band: band(level.id === 'pro' ? PRO_BAND : LEVELS_BAND),
            detail: `${end0} of ${decided} decided; ${runs}`,
          });
          reportMeasure(ctx, { label: `${label}: rounds that ran out the clock`, value: share(onTime, rounds), of: rounds, band: band(ON_TIME_BAND), detail: `${onTime} of ${rounds}` });
          reportMeasure(ctx, {
            label: `${label}: bots that never left spawn in a round`,
            value: share(w.stayedAtSpawn, w.botRounds),
            of: w.botRounds,
            band: band({ max: MAP_BALANCE_BANDS.stayedAtSpawn }),
            detail: `${w.stayedAtSpawn} of ${w.botRounds} bot-rounds`,
          });
          reportMeasure(ctx, {
            label: `${label}: bots stuck with nothing to do, per 10 bot-minutes`,
            value: w.botMinutes > 0 ? (10 * w.stuck) / w.botMinutes : Number.NaN,
            unit: 'a 10 bot-minutes',
            band: band({ max: MAP_BALANCE_BANDS.stuckPerTenMinutes }),
            detail: `${w.stuck} in ${w.botMinutes.toFixed(0)} bot-minutes${w.firstStuck ? `; the first at ${w.firstStuck}` : ''}`,
          });
          reportMeasure(ctx, { label: `${label}: anyone falling through the floor`, value: w.fell, unit: '', band: band({ max: 0 }), detail: `${w.fell} fell` });
        });
      }
    }
  }
});
