import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY } from '../../settings/storage';
import type { PickerOption } from '../optionPicker';
import { fakeDocument, type FakeElement, findAll } from '../testSupport';
import { ChoiceCards, type ChoiceCardsExtras } from './choiceCards';

type Id = 'easy' | 'normal' | 'hard';
const OPTIONS: readonly PickerOption<Id>[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow.' },
  { id: 'normal', label: 'Normal', blurb: 'Fair.' },
  { id: 'hard', label: 'Hard', blurb: 'Quick.', tag: 'dev' },
];
const SOON = [
  { label: 'Woodland', blurb: 'A wood.', tag: 'dev' as const },
  { label: 'Quarry', blurb: 'A pit.' },
];

const root = (c: ChoiceCards<Id>): FakeElement => c.root as unknown as FakeElement;
/** Each card (option or Coming soon) with its name, its wrap and its button. */
function cards(c: ChoiceCards<Id>): { name: string; wrap: FakeElement; button: FakeElement }[] {
  return root(c).children.map((wrap) => {
    const button = wrap.children[0]!;
    return { name: findAll(button, 'choice-name')[0]!.textContent, wrap, button };
  });
}
const shown = (c: ChoiceCards<Id>): string[] => cards(c).filter((e) => !e.wrap.hidden).map((e) => e.name);
const card = (c: ChoiceCards<Id>, name: string) => cards(c).find((e) => e.name === name)!;

describe('ChoiceCards (G3: the Play screen\'s Map and Mode) and dev content (M35)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  // Test files share a worker's modules (isolate: false), so the fake DOM goes when each test ends.
  afterEach(() => vi.unstubAllGlobals());

  const make = (initial: Id = 'normal', extras: ChoiceCardsExtras<Id> = {}) =>
    new ChoiceCards<Id>('Difficulty', OPTIONS, initial, 'difficulty' as never, () => {}, { soon: SOON, soonTag: 'Coming soon', devTag: 'Dev', ...extras });

  it('is a named group of pressed-or-not buttons, the pick pressed', () => {
    const c = make();
    expect(root(c).getAttribute('role')).toBe('group');
    expect(root(c).getAttribute('aria-label')).toBe('Difficulty');
    expect(cards(c).slice(0, 3).map((e) => [e.button.type, e.button.getAttribute('aria-pressed')])).toEqual([
      ['button', 'false'],
      ['button', 'true'],
      ['button', 'false'],
    ]);
  });

  it('lists a dev option and a dev Coming soon entry only once Dev content is on, the dev option tagged', () => {
    const c = make();
    expect(shown(c)).toEqual(['Easy', 'Normal', 'Quarry']);
    c.setDevContent(true);
    expect(shown(c)).toEqual(['Easy', 'Normal', 'Hard', 'Woodland', 'Quarry']);
    expect(findAll(card(c, 'Hard').button, 'tag-dev').map((t) => t.textContent)).toEqual(['Dev']);
    expect(findAll(card(c, 'Easy').button, 'tag-dev')).toEqual([]);
    c.setDevContent(false);
    expect(shown(c)).toEqual(['Easy', 'Normal', 'Quarry']);
  });

  it('leaves a hidden dev option disabled, and the Coming soon entries disabled always', () => {
    const c = make();
    expect(card(c, 'Hard').button.disabled).toBe(true);
    c.setDevContent(true);
    expect(card(c, 'Hard').button.disabled).toBe(false);
    expect(cards(c).filter((e) => e.button.className.includes('soon')).every((e) => e.button.disabled)).toBe(true);
  });

  it('plays a saved dev pick as the fallback while off, and as picked while on', () => {
    const c = make('hard', { fallback: 'normal' });
    expect(c.value).toBe('normal');
    expect(card(c, 'Normal').button.getAttribute('aria-pressed')).toBe('true');
    c.setDevContent(true);
    expect(c.value).toBe('hard');
    expect(card(c, 'Hard').button.getAttribute('aria-pressed')).toBe('true');
    c.setDevContent(false);
    expect(c.value).toBe('normal');
    expect(make('hard').value).toBe('easy'); // no fallback given: the first option
  });

  it('picks and saves a card on a click, and reports it once', () => {
    const picked: Id[] = [];
    const c = new ChoiceCards<Id>('Difficulty', OPTIONS, 'normal', 'difficulty' as never, (id) => picked.push(id));
    card(c, 'Easy').button.click();
    card(c, 'Easy').button.click();
    expect(picked).toEqual(['easy']);
    expect(c.value).toBe('easy');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)['difficulty']).toBe('easy');
    expect(cards(c).filter((e) => e.button.getAttribute('aria-pressed') === 'true').map((e) => e.name)).toEqual(['Easy']);
  });

  it('hides the options a context does not offer, playing a saved one as the fallback, and keeps it saved (M43)', () => {
    const c = make('easy', { fallback: 'normal' });
    c.setDevContent(true);
    c.limit((id) => id !== 'easy');
    expect(shown(c)).toEqual(['Normal', 'Hard', 'Woodland', 'Quarry']);
    expect(card(c, 'Easy').button.disabled).toBe(true);
    expect(c.value).toBe('normal');
    c.limit(() => true);
    expect(c.value).toBe('easy');
  });

  it('shows each card\'s picture, changing it only when its address changes', () => {
    let light = 'day';
    const c = make('normal', { picture: (id) => (id === 'easy' ? null : `menu/${id}-${light}.jpg`) });
    const img = (name: string) => findAll(card(c, name).button, 'choice-card-pic')[0]!.children[0]!;
    expect(img('Easy').src).toBe('');
    expect(img('Normal').src).toBe('menu/normal-day.jpg');
    light = 'night';
    c.refresh();
    expect(img('Normal').src).toBe('menu/normal-night.jpg');
  });
});

describe('ChoiceCards switches on a card (M34d: Day | Night)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Cards where Hard offers Day and Night (as a map may) and the rest offer one side or none. */
  const make = () => {
    const sides: Partial<Record<Id, string>> = {};
    const picks: [Id, string][] = [];
    const changes: Id[] = [];
    const c = new ChoiceCards<Id>('Map', OPTIONS, 'easy', 'difficulty' as never, (id) => changes.push(id), {
      variants: {
        label: 'Light',
        of: (id) => (id === 'hard' ? [{ id: 'day', label: 'Day' }, { id: 'night', label: 'Night' }] : id === 'normal' ? [{ id: 'day', label: 'Day' }] : []),
        picked: (id) => sides[id] ?? 'night',
        onPick: (id, side) => {
          sides[id] = side;
          picks.push([id, side]);
        },
      },
    });
    c.setDevContent(true);
    const group = () => findAll(root(c), 'choice-variants')[0]!;
    return { c, group, picks, changes };
  };
  const pressed = (group: FakeElement): string[] => group.children.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.text);

  it('puts a switch only on a card with two sides or more, after its button in the same card, as a named group', () => {
    const { c, group } = make();
    expect(findAll(root(c), 'choice-variants')).toHaveLength(1);
    expect(group().parent).toBe(card(c, 'Hard').wrap);
    expect(card(c, 'Hard').wrap.children.indexOf(group())).toBe(1);
    expect(group().getAttribute('role')).toBe('group');
    expect(group().getAttribute('aria-label')).toBe('Hard: Light');
    expect(group().children.map((b) => [b.tag, b.type, b.text])).toEqual([
      ['button', 'button', 'Day'],
      ['button', 'button', 'Night'],
    ]);
    expect(pressed(group())).toEqual(['Night']);
  });

  it('picks the side and its card together, and shows the side picked', () => {
    const { c, group, picks, changes } = make();
    group().children[0]!.click();
    expect(picks).toEqual([['hard', 'day']]);
    expect(changes).toEqual(['hard']);
    expect(c.value).toBe('hard');
    expect(pressed(group())).toEqual(['Day']);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)['difficulty']).toBe('hard');
    // The other side, with the card already picked: the side changes, the pick stays.
    group().children[1]!.click();
    expect(picks).toEqual([['hard', 'day'], ['hard', 'night']]);
    expect(changes).toEqual(['hard']);
    expect(pressed(group())).toEqual(['Night']);
  });

  it('hides the switch with its card (a dev option while Dev content is off, or one not offered)', () => {
    const { c } = make();
    c.setDevContent(false);
    expect(card(c, 'Hard').wrap.hidden).toBe(true);
    c.setDevContent(true);
    c.limit((id) => id !== 'hard');
    expect(card(c, 'Hard').wrap.hidden).toBe(true);
  });
});

describe('ChoiceCards notes (M49)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  const note = (c: ChoiceCards<Id>, name: string) => findAll(card(c, name).button, 'choice-note')[0]!;

  it('shows a line on one card when set, takes it away with null, and ignores an id it does not have', () => {
    const c = new ChoiceCards<Id>('Mode', OPTIONS, 'normal', 'difficulty' as never, () => {});
    c.setNote('normal', 'Supply weekend, until Sunday: cases hold +25 % Field Credits.');
    expect([note(c, 'Normal').textContent, note(c, 'Normal').hidden]).toEqual(['Supply weekend, until Sunday: cases hold +25 % Field Credits.', false]);
    expect(note(c, 'Easy').hidden).toBe(true);
    c.setNote('normal', null);
    expect(note(c, 'Normal').hidden).toBe(true);
    expect(() => c.setNote('nope' as Id, 'x')).not.toThrow();
    expect(c.value).toBe('normal');
  });
});
