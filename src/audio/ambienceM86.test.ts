import { describe, expect, it } from 'vitest';
import { AMBIENCES, type AmbienceId, AUDIO, VOLUME, VOLUME_CHANNELS } from '../config/audio';
import { isMapCue, type SoundCue } from '../config/sounds';
import { MemoryStorage } from '../pool/testStorage';
import { saveSetting } from '../settings/storage';
import { loadVolumes, volumeField } from './audioMix';
import { renderMapCue, renderSounds } from './soundBank';

/** M86 (the owner's playtest note 14): more varied ambience, kept quiet, and an Ambience volume of its own. */
const RATE = AUDIO.renderRate;
const M86_CUES: readonly SoundCue[] = ['ambience.crow', 'ambience.dog', 'ambience.creak', 'ambience.pigeon', 'ambience.horn'];
const ALL = (Object.keys(AMBIENCES) as AmbienceId[]).flatMap((id) => (['day', 'night'] as const).map((when) => ({ at: `${id} by ${when}`, a: AMBIENCES[id][when] })));

describe('M86: more varied ambience', () => {
  it('gives every field, by day and by night, at least two kinds of call, each timed from a seed of its own', () => {
    for (const { at, a } of ALL) {
      expect(a.calls.length, at).toBeGreaterThanOrEqual(1);
      expect(new Set(a.calls.map((c) => c.cue)).size, at).toBe(a.calls.length);
    }
    // Every field played today has more than one (the woods by day is no map's yet, but has its birds and the creak).
    for (const { at, a } of ALL) if (at !== 'yard by night') expect(a.calls.length, at).toBeGreaterThanOrEqual(2);
    const seeds = new Set(ALL.flatMap(({ a }) => a.calls.map((c) => `${c.cue}:${c.seed}`)));
    const perCue = new Map<SoundCue, Set<number>>();
    for (const key of seeds) {
      const [cue, seed] = key.split(':') as [SoundCue, string];
      perCue.set(cue, (perCue.get(cue) ?? new Set()).add(Number(seed)));
    }
    // One seed per kind of call (a kind shared by two fields keeps its timing), and no two kinds share one.
    for (const [cue, s] of perCue) expect(s.size, cue).toBe(1);
    const all = [...perCue.values()].map((s) => [...s][0]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps every call no louder than a bird, far off, and the field calm: under nine calls a minute on average', () => {
    for (const { at, a } of ALL) {
      let perMinute = 0;
      for (const c of a.calls) {
        expect(c.level.gain, `${at} ${c.cue}`).toBeLessThanOrEqual(AUDIO.levels.bird.gain);
        expect(c.distance[0], `${at} ${c.cue}`).toBeGreaterThanOrEqual(10);
        expect(c.distance[1], `${at} ${c.cue}`).toBeLessThanOrEqual(AUDIO.spatial.maxDistance);
        expect(c.every[0], `${at} ${c.cue}`).toBeGreaterThan(5);
        perMinute += 60 / ((c.every[0] + c.every[1]) / 2);
      }
      expect(perMinute, at).toBeLessThan(9);
    }
  });

  it('keeps each new call short (under 0.6 s), so a call is a moment and the sounds stay in budget', () => {
    const title = renderSounds(RATE);
    for (const cue of M86_CUES) {
      const variants = isMapCue(cue) ? renderMapCue(cue, RATE) : title.get(cue)!;
      expect(variants.length, cue).toBeGreaterThan(0);
      for (const v of variants) expect(v.length / RATE, cue).toBeLessThan(0.6);
    }
  });

  it("plays the yard's new calls from the title screen's bank, so Depot and the range render nothing more as they load", () => {
    for (const c of [...AMBIENCES.yard.day.calls, ...AMBIENCES.yard.night.calls]) expect(isMapCue(c.cue), c.cue).toBe(false);
  });
});

describe('M86: an Ambience volume', () => {
  it('is a slider of its own, between Effects (and Power source, the 0.1 Dev 5 playtest) and Interface, at 60% by default (Dev 6 playtest)', () => {
    expect(VOLUME_CHANNELS).toEqual(['master', 'effects', 'power', 'ambience', 'interface']);
    expect(VOLUME.defaults.ambience).toBe(0.6);
    expect(volumeField('ambience')).toBe('volume.ambience');
  });

  it('loads an old save (no ambience slider saved) at its default, and a saved one as saved', () => {
    const old = new MemoryStorage();
    saveSetting('volume.effects', 0.5, old);
    expect(loadVolumes(old)).toEqual({ master: 1, effects: 0.5, power: 1, ambience: 0.6, interface: 0.5 });
    const saved = new MemoryStorage();
    saveSetting('volume.ambience', 0.3, saved);
    expect(loadVolumes(saved).ambience).toBe(0.3);
  });
});
