import { describe, expect, it } from 'vitest';
import { contentSkins, ENV, readJson, reportMeta } from './reportSupport';
import { gameSkinContext, type MapColours, mapPalette, skinOnMap } from '../skinChecks';

/**
 * The content report's skin-on-map runner (CT4, level 3): the skin AIRSOFT_CONTENT_ITEM names against each map's
 * colours, which `pipeline/content-pictures.mjs` measureMapPalettes measured in the browser and the content check wrote
 * to the file AIRSOFT_CONTENT_PALETTES names. Its results, and each map's palette as judged, go into the test's meta as `content`.
 */

describe('content report: a skin against each map’s colours', () => {
  it('judges the skin on each map', (ctx) => {
    const skins = gameSkinContext([]);
    const ids = contentSkins(skins.skins.map((s) => ({ id: s.id, name: s.scheme.name })));
    expect(ids.length, `no skin is called "${ENV.AIRSOFT_CONTENT_ITEM}"`).toBeGreaterThan(0);
    expect(ENV.AIRSOFT_CONTENT_PALETTES, 'no measured map colours (AIRSOFT_CONTENT_PALETTES)').toBeTruthy();
    const maps = readJson(ENV.AIRSOFT_CONTENT_PALETTES!) as MapColours[];
    const results = ids.flatMap((id) => maps.map((m) => skinOnMap(skins.skins.find((s) => s.id === id)!, skins, m)));
    reportMeta(ctx, 'content', { results, palettes: maps.map((m) => ({ map: m.map, label: m.label, buckets: mapPalette(m.buckets, skins.rules.mapShare) })) });
  });
});
