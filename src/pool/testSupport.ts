import type { ContentTag } from '../config/content';
import type { Pool } from './pool';

/** A copy of `pool` with the named assets (by name) tagged as given, byId rebuilt; every other asset keeps its tag (M35 tests). */
export function withTags(pool: Pool, tags: Record<string, ContentTag>): Pool {
  const assets = pool.assets.map((a) => (a.name in tags ? { ...a, tag: tags[a.name]! } : a));
  return { ...pool, assets, byId: new Map(assets.map((a) => [a.id, a])) };
}
