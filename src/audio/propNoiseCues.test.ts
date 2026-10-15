import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config/audio';
import { NOISE, PROP_SOUNDS } from '../config/noise';
import { cues, isMapCue, MAP_CUE_SEEDS, type SoundCue, TITLE_CUES } from '../config/sounds';
import { DEPOT } from '../map/depot';
import { MAPS, mapData } from '../map/maps';
import { RANGE_MAP } from '../map/range';
import { renderMapCue } from './soundBank';
import { soundscapeOf, YARD_BY_DAY } from './soundscape';

/**
 * NP1 AC5, the sound cues per map: a map renders exactly the prop sounds of the noisy kinds among its blocks, the title
 * screen renders none, and every prop cue is a map cue within the map-cue size budget.
 */

const RATE = AUDIO.renderRate;
const isProp = (c: SoundCue) => c.startsWith('prop.');
const fields = [...MAPS.map((m) => [m.id, mapData(m.id)] as const), ['range', RANGE_MAP] as const];

describe('prop cues per map (NP1)', () => {
  it('asks for exactly the prop sounds of the noisy kinds among its blocks, by day and by night', () => {
    for (const [name, map] of fields) {
      const want = new Set<SoundCue>();
      for (const b of map.blocks) {
        const noise = NOISE.props[b.kind];
        if (noise) want.add(cues.prop(noise.sound));
      }
      for (const night of [false, true]) {
        const got = soundscapeOf(map, night).cues.filter(isProp);
        expect([...got].sort(), `${name} ${night ? 'night' : 'day'}`).toEqual([...want].sort());
        expect(new Set(got).size, 'no cue twice').toBe(got.length);
      }
    }
  });

  it('is not a table of nothing: Depot, which has skips and crates, asks for steel and wood', () => {
    const got = soundscapeOf(DEPOT, false).cues;
    expect(got).toContain('prop.steel');
    expect(got).toContain('prop.wood');
  });

  it('a map with no noisy block asks for no prop sound, so nothing is rendered for it', () => {
    const bare = { ...DEPOT, blocks: DEPOT.blocks.filter((b) => !NOISE.props[b.kind]) };
    expect(soundscapeOf(bare, false).cues.filter(isProp)).toEqual([]);
    expect(YARD_BY_DAY.cues.filter(isProp)).toEqual([]);
  });

  it('keeps every prop sound off the title screen: a map cue, with its own seed', () => {
    expect(TITLE_CUES.filter(isProp)).toEqual([]);
    for (const sound of PROP_SOUNDS) {
      const cue = cues.prop(sound);
      expect(isMapCue(cue), cue).toBe(true);
      expect(MAP_CUE_SEEDS[cue], cue).toBeGreaterThan(0);
    }
    const seeds = Object.values(MAP_CUE_SEEDS);
    expect(new Set(seeds).size, 'seeds are unique').toBe(seeds.length);
  });

  it('keeps each prop cue under the map-cue size budget (0.35 million samples) and short enough to be a knock', () => {
    for (const sound of PROP_SOUNDS) {
      const cue = cues.prop(sound);
      const variants = renderMapCue(cue, RATE);
      expect(variants.length, cue).toBe(3);
      const n = variants.reduce((sum, v) => sum + v.length, 0);
      expect(n, cue).toBeLessThan(0.35e6);
      for (const v of variants) {
        expect(v.length / RATE, cue).toBeLessThan(0.6);
        expect(v.some((x) => Math.abs(x) > 0.01), `${cue} is not silent`).toBe(true);
      }
    }
  });

  it('every noisy kind in the table names a sound that exists, and a ring only where steel rings', () => {
    for (const [kind, noise] of Object.entries(NOISE.props)) {
      expect(PROP_SOUNDS, kind).toContain(noise!.sound);
      expect(noise!.bumped, kind).toBeGreaterThan(11);
      if (noise!.shot > 0) expect(['steel', 'clank'], kind).toContain(noise!.sound);
    }
  });
});
