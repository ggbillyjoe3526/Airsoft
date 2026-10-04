import { describe, expect, it } from 'vitest';
import { contentPool, isDevItem, itemsUseDev } from './contentPool';
import { GAME_POOL } from './gamePool';
import { withTags } from './testSupport';

const pool = GAME_POOL;
const asset = (name: string) => pool.assets.find((a) => a.name === name)!;
const ref = (name: string, tier = 'common') => ({ asset: asset(name).id, tier });

describe('the pool as the player and bots see it (M35)', () => {
  const mixed = withTags(pool, { 'Red Dot': 'dev', 'Red Laser': 'dev' });

  it('hides dev assets while Dev content is off, from assets and from byId', () => {
    const shown = contentPool(mixed, false);
    expect(shown.assets.map((a) => a.name)).not.toContain('Red Dot');
    expect(shown.assets.map((a) => a.name)).not.toContain('Red Laser');
    expect(shown.assets).toHaveLength(mixed.assets.length - 2);
    expect(shown.byId.has(asset('Red Dot').id)).toBe(false);
    expect(shown.byId.has(asset('AEG Rifle').id)).toBe(true);
    expect(shown.byId.size).toBe(shown.assets.length);
    expect(shown.tiers).toBe(mixed.tiers);
    expect(shown.economy).toBe(mixed.economy);
  });

  it('is the same pool while Dev content is on, and when nothing in it is dev', () => {
    expect(contentPool(mixed, true)).toBe(mixed);
    expect(contentPool(pool, false)).toBe(pool);
    expect(contentPool(pool, true)).toBe(pool);
  });

  it('knows an item of a dev asset, and not one of a public or unlisted asset', () => {
    expect(isDevItem(mixed, ref('Red Dot'))).toBe(true);
    expect(isDevItem(mixed, ref('Red Dot', 'epic'))).toBe(true);
    expect(isDevItem(mixed, ref('AEG Rifle'))).toBe(false);
    expect(isDevItem(mixed, { asset: '999999', tier: 'common' })).toBe(false);
  });

  it('says whether any item of a list is dev gear, ignoring empty slots', () => {
    expect(itemsUseDev(mixed, [ref('AEG Rifle'), null, ref('Red Dot')])).toBe(true);
    expect(itemsUseDev(mixed, [ref('AEG Rifle'), null, ref('Standard Battery')])).toBe(false);
    expect(itemsUseDev(mixed, [])).toBe(false);
    expect(itemsUseDev(mixed, [null])).toBe(false);
  });
});
