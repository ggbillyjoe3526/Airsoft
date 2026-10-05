import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../config/bots';
import { DEFAULT_WHAT_GOT_YOU_MODE, WHAT_GOT_YOU_MODES, type WhatGotYouMode, whatGotYouShown } from '../config/matchInfo';
import { PRO_TIPS, proTip } from '../config/tutorial';
import { flushSettings, loadSetting, oneOf, saveSetting } from '../settings/storage';
import { createHitFacts, type HitFacts } from '../sim/hitFacts';
import { loadWhatGotYouMode } from './menus/savedChoices';
import { describeBearing, whatGotYouText } from './whatGotYou';

const DEG = Math.PI / 180;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const facts = (over: Partial<HitFacts>): HitFacts => ({ ...createHitFacts(), time: 5, victimId: 0, shooterId: 3, yaw: 0, distance: 14.2, moving: false, held: true, inView: 0.42, ...over });

describe('the What got you setting (M41)', () => {
  it('is Auto by default, with Auto, On and Off to pick', () => {
    expect(DEFAULT_WHAT_GOT_YOU_MODE).toBe('auto');
    expect(WHAT_GOT_YOU_MODES.map((m) => m.id)).toEqual(['auto', 'on', 'off']);
    // Nothing saved in the tests: the default.
    expect(loadWhatGotYouMode()).toBe('auto');
  });

  it('Auto is on against Pro opponents only; On is on at every difficulty; Off at none', () => {
    for (const d of DIFFICULTIES) {
      expect(whatGotYouShown('auto', d.id), `auto ${d.id}`).toBe(d.id === 'pro');
      expect(whatGotYouShown('on', d.id), `on ${d.id}`).toBe(true);
      expect(whatGotYouShown('off', d.id), `off ${d.id}`).toBe(false);
    }
  });

  it('is saved with the other settings and read back', () => {
    const s = memoryStorage();
    const read = () => loadSetting<WhatGotYouMode>('whatGotYou', oneOf(WHAT_GOT_YOU_MODES.map((m) => m.id)), DEFAULT_WHAT_GOT_YOU_MODE, s);
    expect(read()).toBe('auto');
    saveSetting('whatGotYou', 'on', s);
    flushSettings(s);
    expect(read()).toBe('on');
    saveSetting('whatGotYou', 'sideways', s);
    expect(read()).toBe('auto');
  });
});

describe('the card\'s words (M41)', () => {
  it('names the way the shot came from, as your view saw it', () => {
    expect(describeBearing(0)).toBe('ahead');
    expect(describeBearing(90 * DEG)).toBe('your right');
    expect(describeBearing(-90 * DEG)).toBe('your left');
    expect(describeBearing(Math.PI)).toBe('behind');
    expect(describeBearing(-Math.PI)).toBe('behind');
    expect(describeBearing(-45 * DEG)).toBe('ahead left');
    expect(describeBearing(135 * DEG)).toBe('behind right');
  });

  it('says where, whether the angle was held, how long you were in view and whether you were moving', () => {
    // The BB flew along yaw 0 and you looked along yaw 0: it came from straight ahead.
    const held = whatGotYouText(facts({ yaw: 0, held: true, inView: 0.42, moving: true }), 'Orange 2', 0);
    expect(held.where).toBe('Orange 2 · from ahead · 14 m');
    expect(held.notes).toEqual(['Orange 2 was holding that angle.', 'You were in view 0.4 s, on the move.']);
    const loose = whatGotYouText(facts({ held: false, inView: 2.26, moving: false }), 'Orange 1', 0);
    expect(loose.notes).toEqual(['Orange 1 was not holding an angle.', 'You were in view 2.3 s, standing still.']);
  });

  it('turns the direction with your view: the same shot comes from the other side once you have turned the other way', () => {
    // Looking along yaw 90 (towards -x), a BB flying along +z came from the shooter on your right (at -z); the mirror view, your left.
    const shotYaw = 0;
    expect(whatGotYouText(facts({ yaw: shotYaw }), 'Orange 2', 90 * DEG).where).toContain('from your right');
    expect(whatGotYouText(facts({ yaw: shotYaw }), 'Orange 2', -90 * DEG).where).toContain('from your left');
  });

  it('says only where it came from for friendly fire, and that a ricochet bounced', () => {
    const friendly = whatGotYouText(facts({ friendly: true, held: null, inView: null }), 'Blue 2', 0);
    expect(friendly.where).toBe('Blue 2 · from ahead · 14 m · friendly fire');
    expect(friendly.notes).toEqual([]);
    expect(whatGotYouText(facts({ ricochet: true, held: null, inView: null }), 'Orange 2', 0).notes).toEqual(['It bounced off something first.']);
  });

  it('leaves out what it does not know', () => {
    expect(whatGotYouText(facts({ held: null, inView: null }), 'Orange 2', 0).notes).toEqual([]);
    expect(whatGotYouText(facts({ held: false, inView: null, moving: true }), 'Orange 2', 0).notes).toEqual(['Orange 2 was not holding an angle.', 'You were on the move.']);
  });
});

describe('Pro briefing tips (M41)', () => {
  it('has short tips for slicing corners, short peeks and listening, one a round, cycling', () => {
    const text = PRO_TIPS.join(' ').toLowerCase();
    for (const word of ['slice', 'peek', 'listen']) expect(text, word).toContain(word);
    for (const tip of PRO_TIPS) expect(tip.length, tip).toBeLessThanOrEqual(140);
    expect(proTip(1)).toBe(PRO_TIPS[0]);
    expect(proTip(PRO_TIPS.length + 1)).toBe(PRO_TIPS[0]);
    expect(proTip(2)).toBe(PRO_TIPS[1]);
  });
});
