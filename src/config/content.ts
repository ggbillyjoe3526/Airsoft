/**
 * Public and dev content (M35; owner, 2026-10-04): every map, mode, difficulty and pooled asset (replicas, parts,
 * power sources, items) carries one tag. Public content is there for everyone, the Armory's Shots included. Dev
 * content is still being built: it isn't shown anywhere unless the Dev tab's Dev content switch is on (config/dev.ts),
 * and then it looks like the rest. A match that uses any of it stays out of the records and pays no Field Credits.
 * Making something public is changing its tag: pool.md's Access column for gear, the `tag` beside it in its config for
 * the rest.
 */
export type ContentTag = 'public' | 'dev';

export const CONTENT_TAGS: readonly ContentTag[] = ['public', 'dev'];

/** Anything that can be tagged; untagged reads as public (the Match pop-up's plain choices). */
export interface Tagged {
  readonly tag?: ContentTag;
}

/** The one availability check: public content always, dev content only while `devContent` (the switch) is on. */
export function isAvailable(tag: ContentTag | undefined, devContent: boolean): boolean {
  return tag !== 'dev' || devContent;
}

/**
 * What a saved pick plays as: `picked` while it is offered, else `fallback` (the list's default). The pick itself
 * stays saved, so it comes back when the Dev content switch is turned on again.
 */
export function availableChoice<T extends string>(options: readonly (Tagged & { id: T })[], picked: T, devContent: boolean, fallback: T): T {
  const option = options.find((o) => o.id === picked);
  return option && isAvailable(option.tag, devContent) ? picked : fallback;
}

/** The tag of option `id` in `options` (public when it isn't listed). */
export function tagOf<T extends string>(options: readonly (Tagged & { id: T })[], id: T): ContentTag {
  return options.find((o) => o.id === id)?.tag ?? 'public';
}
