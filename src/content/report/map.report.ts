import { describe, expect, it } from 'vitest';
import budget from '../../../pipeline/perf-budget.json';
import { DIFFICULTIES } from '../../config/bots';
import { MATCH_MODES } from '../../config/modes';
import { LIGHTING_LABELS, lightingChoices } from '../../map/lightingChoice';
import { mapData, MAPS } from '../../map/maps';
import { modeOffered, playableMode } from '../../map/playableMode';
import { checkMap, gameMapContext, mapFigures, perfMapName, runSeconds } from '../mapChecks';
import { contentMaps, ENV, reportMeta } from './reportSupport';

/**
 * The content report's first runner for a map (CT2): levels 1 and 2 and the fast part of level 3 for the map
 * AIRSOFT_CONTENT_ITEM names ("map:<id>", every map for "map:all"), every map's layout figures so it is seen beside the
 * rest (Depot's are the standard), the pictures to draw, the perf runs to make and the balance run's plan (the lightings,
 * modes and levels it sweeps). Everything goes into the test's meta as `content`; `pipeline/content-check.mjs` reads it.
 */

describe('content report: a map’s rules, layout and spec test', () => {
  it('checks the map', { timeout: 600_000 }, (ctx) => {
    const targets = contentMaps();
    expect(targets.length, `no map is called "${ENV.AIRSOFT_CONTENT_ITEM}" (maps: ${MAPS.map((m) => m.id).join(', ')})`).toBeGreaterThan(0);
    const checks = gameMapContext(MAPS.map((m) => m.id));
    const results = targets.flatMap((m) => checkMap(m, mapData(m.id), budget, checks));

    // Every map's layout, side by side: the report's table.
    const layouts = MAPS.map((m) => {
      const data = mapData(m.id);
      const f = mapFigures(data);
      return {
        id: m.id,
        label: m.label,
        tag: m.tag,
        teamSize: m.teamSize,
        size: f.size,
        lanes: f.lanes,
        sightline: f.sightline?.metres ?? null,
        middleWalk: f.middleWalk,
        middleSeconds: f.middleWalk.map(runSeconds),
        flagWalk: f.flagWalk,
        flagSeconds: f.flagWalk?.map(runSeconds) ?? null,
        modes: MATCH_MODES.filter((mode) => modeOffered(data, mode.id) && playableMode(data, mode.id) === mode.id).map((mode) => mode.label),
        lightings: lightingChoices(data).map((l) => LIGHTING_LABELS[l]),
      };
    });

    // The pictures (pipeline/content-pictures.mjs mapPictures): per lighting, the field from above, the minimap and the
    // view from each end's spawns across the field. The field's walkable ground frames the overhead view.
    const pictures = targets.length === 1 ? targets.flatMap((m) => {
      const data = mapData(m.id);
      const f = mapFigures(data);
      return lightingChoices(data).map((light) => ({ file: `${m.id}-${light}`, title: `${m.label} by ${LIGHTING_LABELS[light]}`, map: m.id, light, field: { x: f.size.x, z: f.size.z, middle: f.middle } }));
    }) : [];

    // The spec test's perf runs (pipeline/perf-run.mjs): Elimination on Low, Medium and High, judged by perf-budget.json.
    const perf = targets.length === 1 ? { map: perfMapName(budget, targets[0]!.id), mode: 'elimination', presets: ['low', 'medium', 'high'] } : null;

    // The balance run's plan: the lightings and modes it hosts (Extraction as runs, CT3), every level.
    const plan = targets.map((m) => {
      const data = mapData(m.id);
      return {
        id: m.id,
        label: m.label,
        tag: m.tag,
        lightings: lightingChoices(data),
        modes: MATCH_MODES.filter((mode) => playableMode(data, mode.id) === mode.id).map((mode) => mode.id),
        levels: DIFFICULTIES.map((d) => d.id),
      };
    });

    reportMeta(ctx, 'content', {
      kind: 'map',
      items: targets.map((m) => ({ id: `map-${m.id}`, name: m.label, category: 'map', tag: m.tag, key: m.id })),
      results,
      layouts,
      pictures,
      perf,
      plan,
    });
  });
});
