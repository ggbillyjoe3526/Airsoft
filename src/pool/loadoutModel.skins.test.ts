import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offeredSchemes, SCHEME_IDS, SCHEMES } from '../config/schemes';
import { GAME_POOL } from './gamePool';
import { LoadoutModel, type Ownership } from './loadoutModel';
import { MemoryStorage } from './testStorage';

/**
 * CT4 QA: Customise honours a dev skin. A dev scheme is offered, and played, only with Dev content on; a pick of it
 * falls back to the replica's default while it is off and comes back with it.
 */

afterAll(() => vi.unstubAllGlobals());

const rifle = GAME_POOL.assets.find((a) => a.name === 'AEG Rifle')!.id;
const owning = (dev: { on: boolean }): Ownership => ({ owns: () => true, devContent: () => dev.on });

describe('a dev skin in Customise (CT4)', () => {
  const original = SCHEMES.acid.tag;
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    (SCHEMES.acid as { tag?: string | undefined }).tag = 'dev';
  });
  afterEach(() => {
    (SCHEMES.acid as { tag?: string | undefined }).tag = original;
  });

  it('offers a dev scheme only while Dev content is on, keeping the others in order', () => {
    expect(offeredSchemes(false)).toEqual(SCHEME_IDS.filter((s) => s !== 'acid'));
    expect(offeredSchemes(true)).toEqual([...SCHEME_IDS]);
    const dev = { on: false };
    const model = new LoadoutModel(GAME_POOL, owning(dev));
    expect(model.schemes()).not.toContain('acid');
    dev.on = true;
    expect(model.schemes()).toContain('acid');
  });

  it('plays a picked dev scheme with Dev content on, the default with it off, and brings it back when it is on again', () => {
    const dev = { on: true };
    const model = new LoadoutModel(GAME_POOL, owning(dev));
    model.setScheme(rifle, 'acid');
    expect(model.scheme(rifle)).toBe('acid');
    expect(model.kit().schemes[0]).toBe('acid');
    dev.on = false;
    expect(model.scheme(rifle)).toBe('cobalt');
    expect(model.kit().schemes[0]).toBe('cobalt');
    dev.on = true;
    expect(model.scheme(rifle)).toBe('acid');
  });

  it('offers only public schemes when the ownership says nothing about Dev content', () => {
    const model = new LoadoutModel(GAME_POOL, { owns: () => true });
    expect(model.schemes()).not.toContain('acid');
    model.setScheme(rifle, 'acid');
    expect(model.scheme(rifle)).toBe('cobalt');
  });
});
