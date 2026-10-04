import type { ContentTag } from '../config/content';
import type { Asset, Pool } from './pool';

/** A copy of `pool` with the named assets (by name) tagged as given, byId rebuilt; every other asset keeps its tag (M35 tests). */
export function withTags(pool: Pool, tags: Record<string, ContentTag>): Pool {
  const assets = pool.assets.map((a) => (a.name in tags ? { ...a, tag: tags[a.name]! } : a));
  return { ...pool, assets, byId: new Map(assets.map((a) => [a.id, a])) };
}

/** A copy of `pool` with `extra` assets added, byId rebuilt (M35 tests: e.g. a dev part whose Fits no replica of the Loadout has). */
export function withAssets(pool: Pool, extra: readonly Asset[]): Pool {
  const assets = [...pool.assets, ...extra];
  return { ...pool, assets, byId: new Map(assets.map((a) => [a.id, a])) };
}

/** A dev optic whose Fits match no replica of the real pool (it needs a tag nothing has). */
export function strayDevPart(pool: Pool): Asset {
  const optic = pool.assets.find((a) => a.category === 'optic')!;
  return { ...optic, id: '999999', name: 'Stray Dev Optic', tags: ['no-such-rail'], starter: false, tag: 'dev' };
}
