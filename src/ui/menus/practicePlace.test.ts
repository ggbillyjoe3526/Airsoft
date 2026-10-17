import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { PLAY_TEXT } from '../../config/menus';
import { MAPS } from '../../map/maps';
import { DEFAULT_PRACTICE_PLACE, PRACTICE_PLACES, practiceMapId } from '../../map/practicePlaces';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY } from '../../settings/storage';
import { FakeElement, findAll } from '../testSupport';
import { practiceView } from './playView';
import { loadPracticePlace } from '../../settings/savedChoices';
import { type PlayModel, SetupScreen } from './setupScreen';

/** Practice on any map (M94): where Practice plays, as the Match screen offers it and the game reads it. */

class Node extends FakeElement {
  dataset: Record<string, string> = {};
  tabIndex = 0;
  title = '';
  replaceChildren(...n: Node[]): void {
    this.children.length = 0;
    this.append(...n);
  }
}

beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }));
afterEach(() => vi.unstubAllGlobals());

describe("Practice's places (M94)", () => {
  it('offers the range first, then every map in the Map cards\' order, each with its own tag', () => {
    expect(PRACTICE_PLACES.map((p) => p.id)).toEqual(['range', ...MAPS.map((m) => m.id)]);
    expect(PRACTICE_PLACES[0]).toMatchObject({ label: 'Range', tag: 'public' });
    for (const m of MAPS) expect(PRACTICE_PLACES.find((p) => p.id === m.id)).toMatchObject({ label: m.label, tag: m.tag });
    expect(DEFAULT_PRACTICE_PLACE).toBe('range');
  });

  it('plays the range for the range, a public map always, and a dev map only with Dev content on', () => {
    expect(practiceMapId('range', true)).toBeNull();
    expect(practiceMapId('depot', false)).toBe('depot');
    for (const m of MAPS.filter((e) => e.tag === 'dev')) {
      expect(practiceMapId(m.id, false), m.id).toBeNull();
      expect(practiceMapId(m.id, true), m.id).toBe(m.id);
    }
  });

  it('says where Practice plays: the range, a map with its light where it offers two', () => {
    const night = () => 'night' as const;
    const range = practiceView('range', true, night);
    expect(range.mapLine).toBe(PLAY_TEXT.practice.mapLine);
    expect(practiceView('depot', false, night).mapLine).toBe('Depot');
    expect(practiceView('neonHeights', true, night)).toEqual({ mapLine: 'Neon Heights · Night' });
    expect(practiceView('neonHeights', true, () => 'day').mapLine).toBe('Neon Heights · Day');
    expect(practiceView('woodland', true, night).mapLine).toBe('Woodland'); // one light: no light named
    // Dev content off: a dev map's pick plays (and reads) as the range.
    expect(practiceView('woodland', false, night)).toEqual(range);
  });

  it('reads the saved place, and the range for nothing saved or a place no longer offered', () => {
    const saved = (place: unknown): void => {
      const s = new MemoryStorage();
      s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, practicePlace: place }));
      vi.stubGlobal('localStorage', s);
    };
    saved('neonHeights');
    expect(loadPracticePlace()).toBe('neonHeights');
    saved('moonBase');
    expect(loadPracticePlace()).toBe('range');
    vi.stubGlobal('localStorage', new MemoryStorage());
    expect(loadPracticePlace()).toBe('range');
  });
});

describe("the Match screen's Map cards while Practice is picked (M94)", () => {
  const setup = () => {
    const calls: string[] = [];
    let place = 'range';
    const model = {
      picks: () => ({ map: 'depot', mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } }),
      lightingOf: () => 'day',
      supply: () => null,
      setMode: () => {},
      setMap: (m: string) => calls.push(`map ${m}`),
      setLight: (m: string, l: string) => calls.push(`light ${m} ${l}`),
      practicePlace: () => place,
      setPracticePlace: (p: string) => {
        place = p;
        calls.push(`place ${p}`);
      },
    } as unknown as PlayModel;
    const screen = new SetupScreen(model, { equipped: () => [] } as never, { pictures: null, realistic: () => false }, { onLoadout: () => {}, onBack: () => {}, onPlay: () => {}, onPractice: () => {} });
    const root = screen.root as unknown as FakeElement;
    const group = (cls: string) => findAll(root, cls)[0]!;
    const cards = (cls: string) => group(cls).children.filter((w) => findAll(w, 'choice-name').length > 0);
    const card = (cls: string, name: string) => cards(cls).find((w) => findAll(w, 'choice-name')[0]!.text === name)!.children[0]!;
    const practice = findAll(root, 'mode-cards')[0]!.children.find((w) => findAll(w, 'choice-name')[0]?.text === 'Practice')!.children[0]!;
    return { calls, root, group, cards, card, practice };
  };

  it('swaps the maps for the places, and back when Practice is left', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const { group, practice, card } = setup();
    expect(group('map-cards').hidden).toBe(false);
    expect(group('practice-places').hidden).toBe(true);
    practice.click();
    expect(group('map-cards').hidden).toBe(true);
    expect(group('practice-places').hidden).toBe(false);
    expect(card('practice-places', 'Range').getAttribute('aria-pressed')).toBe('true');
    card('mode-cards', 'Elimination').click();
    expect(group('map-cards').hidden).toBe(false);
    expect(group('practice-places').hidden).toBe(true);
  });

  it('saves a picked place as the practice place, leaving the match\'s map as it was', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const { calls, practice, card } = setup();
    practice.click();
    card('practice-places', 'Depot').click();
    expect(calls).toEqual(['place depot']);
    expect(card('practice-places', 'Depot').getAttribute('aria-pressed')).toBe('true');
    expect(card('practice-places', 'Range').getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toMatchObject({ practicePlace: 'depot' });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).map).toBeUndefined();
  });
});
