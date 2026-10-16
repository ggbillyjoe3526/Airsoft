import { describe, expect, it } from 'vitest';
import { lightingChoices } from '../../map/lightingChoice';
import { mapData, MAPS } from '../../map/maps';
import { botTeams, checkSkin, checkSkinList, claimedReplicas, figureColours, gameSkinContext, teamName } from '../skinChecks';
import { gamePlayImports } from './playImports';
import { contentSkins, ENV, nodeReplicaFiles, reportMeta } from './reportSupport';

/**
 * The content report's skin runner (CT4): levels 1 to 3 (all but the maps) for the skin AIRSOFT_CONTENT_ITEM names
 * ("skin:<id>", or "skin:all"), on the built-in models and the model files (what the game draws, BD1), with every skin beside it, the pictures to draw (it on each replica, bold and under Realistic colours)
 * and the maps whose colours the browser measures for skinMaps.report.ts. Everything goes into the test's meta as
 * `content`; `pipeline/content-check.mjs` reads it.
 */

describe('content report: a skin’s rules, fit and spec test', () => {
  it('checks the skin', { timeout: 600_000 }, async (ctx) => {
    const files = await nodeReplicaFiles();
    const skins = gameSkinContext(gamePlayImports(), files);
    const ids = contentSkins(skins.skins.map((s) => ({ id: s.id, name: s.scheme.name })));
    expect(ids.length, `no skin is called "${ENV.AIRSOFT_CONTENT_ITEM}"`).toBeGreaterThan(0);
    const targets = ids.map((id) => skins.skins.find((s) => s.id === id)!);
    const results = [...checkSkinList(skins), ...targets.flatMap((s) => checkSkin(s, skins))];

    // It on each replica, bold and plain; one skin's pictures only (every skin's would be 32).
    const pictures =
      targets.length === 1
        ? claimedReplicas(skins).flatMap((r) =>
            [false, true].map((realistic) => ({
              file: `${targets[0]!.id}-on-${r.id}${realistic ? '-realistic' : ''}.png`,
              title: realistic ? `On the ${r.name}, Realistic colours (${skins.families[targets[0]!.scheme.family]?.name ?? '?'})` : `On the ${r.name}`,
              replica: r.id,
              picture: { fit: {}, scheme: targets[0]!.id, realistic },
            })),
          )
        : [];

    reportMeta(ctx, 'content', {
      items: targets.map((s) => ({ id: `skin-${s.id}`, name: s.scheme.name, category: 'skin', tag: s.scheme.tag ?? '?', key: s.id })),
      results,
      skins: skins.skins.map((s) => ({
        id: s.id,
        name: s.scheme.name,
        tag: s.scheme.tag ?? '?',
        family: skins.families[s.scheme.family]?.name ?? s.scheme.family,
        colours: { body: s.scheme.body, furniture: s.scheme.furniture, detail: s.scheme.detail, accent: s.scheme.accent, steel: s.scheme.steel },
        shows: figureColours(s, skins).filter((c) => c.share >= 0.005),
        bots: botTeams(skins, s.id).map((t) => teamName(skins, t)),
      })),
      readableShare: skins.rules.readableShare,
      pictures,
      maps: MAPS.map((m) => ({ id: m.id, label: m.label, tag: m.tag, light: lightingChoices(mapData(m.id))[0] })),
    });
  });
});
