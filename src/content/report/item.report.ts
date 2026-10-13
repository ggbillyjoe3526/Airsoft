import { afterAll, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from '../../config/bots';
import { MATCH_MODES } from '../../config/modes';
import { defaultScheme } from '../../config/schemes';
import { SHOT_PROFILES } from '../../config/sounds';
import { lightingChoices } from '../../map/lightingChoice';
import { mapData, MAPS } from '../../map/maps';
import { playableMode } from '../../map/playableMode';
import { GAME_POOL } from '../../pool/gamePool';
import { type Asset, replicaOf } from '../../pool/pool';
import { MemoryStorage } from '../../pool/testStorage';
import { modelCensus, soundCensus } from '../census';
import { drawTableOf, sceneName } from '../contentInputs';
import { checkAsset, gameInputs } from '../gameContent';
import { asItComesFit, carried, slotOf } from '../kits';
import { replicasFitting } from '../partChecks';
import { siteClassOf } from '../replicaChecks';
import { partSpecChecks, replicaSpecChecks } from '../specChecks';
import { specSheet } from '../specSheet';
import { contentItem, ENV, nodeReplicaFiles, reportMeta } from './reportSupport';

/**
 * The content report's first runner (CT1): levels 1 to 3 for the item AIRSOFT_CONTENT_ITEM names (every asset when it
 * is `all`), with the spec sheets of every replica beside it, and the balance run's plan (the maps, lightings, modes and
 * levels it sweeps). Everything goes into the test's meta as `content`; `pipeline/content-check.mjs` reads it.
 */

afterAll(() => vi.unstubAllGlobals());

describe('content report: rules, compatibility and the spec test', () => {
  it('checks the item', { timeout: 600_000 }, async (ctx) => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const pool = GAME_POOL;
    const inputs = gameInputs(pool);
    const all = ENV.AIRSOFT_CONTENT_ITEM === 'all';
    const target = all ? undefined : contentItem(pool);
    expect(all || target, `no pool item is called "${ENV.AIRSOFT_CONTENT_ITEM}"`).toBeTruthy();
    const items = target ? [target] : pool.assets.filter((a) => a.category !== 'grenade');
    const results = items.flatMap((a) => checkAsset(inputs, a));

    // The spec test: every replica's sheet and model, and every shot sound, so the item is seen beside the rest.
    const files = await nodeReplicaFiles();
    const replicas = pool.assets.filter((a) => a.category === 'replica' && replicaOf(a));
    const sheets = new Map(replicas.map((r) => [r.id, specSheet(carried(pool, r, asItComesFit(pool, r)))]));
    const census = new Map(replicas.map((r) => [r.id, modelCensus(replicaOf(r), files)]));
    const sounds = soundCensus(SHOT_PROFILES);
    const profileOf = (r: Asset): string => replicaOf(r).look.sound ?? replicaOf(r).power;
    const withParts: { part: string; replica: string; without: ReturnType<typeof specSheet>; with: ReturnType<typeof specSheet> }[] = [];
    for (const a of items) {
      if (a.category === 'replica') {
        const siteClass = siteClassOf(inputs, a) ?? '';
        const others = replicas.filter((r) => r.id !== a.id && siteClassOf(inputs, r) === siteClass).map((r) => sheets.get(r.id)!);
        const sound = sounds.find((s) => s.profile === profileOf(a));
        results.push(...replicaSpecChecks(a, siteClass, sheets.get(a.id)!, others, census.get(a.id)!, sound, sounds.filter((s) => replicas.some((r) => profileOf(r) === s.profile))));
      } else {
        const on = replicasFitting(inputs, a);
        results.push(...partSpecChecks(a, sceneName(a), on.map((r) => ({ replica: r.name, census: census.get(r.id)! }))));
        for (const r of on) {
          const base = asItComesFit(pool, r);
          const fit = { ...base, [slotOf(a)!]: { asset: a.id } };
          withParts.push({ part: a.id, replica: r.name, without: specSheet(carried(pool, r, base)), with: specSheet(carried(pool, r, fit)) });
        }
      }
    }

    // The pictures to draw (pipeline/content-pictures.mjs): a replica on its own and in first person; a part on each
    // replica it fits, and in first person on the first of them.
    const pictures: unknown[] = [];
    for (const a of items) {
      const on = a.category === 'replica' ? [a] : replicasFitting(inputs, a);
      for (const [i, r] of on.entries()) {
        const slot = slotOf(a);
        const fit = slot && slot !== 'power' ? { [slot]: a.key } : {};
        const base = `${a.id}${r.id === a.id ? '' : `-on-${r.id}`}`;
        pictures.push({ file: `${base}.png`, title: r.id === a.id ? `The ${a.name}` : `On the ${r.name}`, replica: r.id, picture: { fit, scheme: defaultScheme(replicaOf(r)) } });
        if (i === 0) {
          const held = slot ? { [slot]: a.id } : {};
          pictures.push({ file: `${base}-first-person.jpg`, title: r.id === a.id ? `The ${a.name} in a match` : `On the ${r.name} in a match`, replica: r.id, firstPerson: { fit: held } });
        }
      }
    }

    // The balance run's plan: every map with its lightings and the round modes it can host, and every level.
    const plan = {
      maps: MAPS.map((m) => {
        const data = mapData(m.id);
        return {
          id: m.id,
          label: m.label,
          tag: m.tag,
          lightings: lightingChoices(data),
          modes: MATCH_MODES.filter((mode) => playableMode(data, mode.id) === mode.id).map((mode) => mode.id),
        };
      }),
      modes: MATCH_MODES.map((m) => ({ id: m.id, label: m.label, tag: m.tag })),
      levels: DIFFICULTIES.map((d) => ({ id: d.id, label: d.label, tag: d.tag })),
    };

    reportMeta(ctx, 'content', {
      items: items.map((a) => ({ id: a.id, name: a.name, category: a.category, tag: a.tag, key: a.key })),
      results,
      sheets: replicas.map((r) => ({ id: r.id, name: r.name, tag: r.tag, siteClass: siteClassOf(inputs, r), table: drawTableOf(replicaOf(r)), sheet: sheets.get(r.id)! })),
      census: replicas.map((r) => ({ id: r.id, name: r.name, ...census.get(r.id)! })),
      sounds,
      withParts,
      pictures,
      plan,
    });
  });
});
