import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../pool/testStorage';
import type { PickerOption } from '../optionPicker';
import { fakeDocument, type FakeElement } from '../testSupport';
import { ChoiceDialog } from './choiceDialog';

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

/** The option and Coming soon buttons, in order, with their names. */
function entries(d: ChoiceDialog<Id>): { name: string; button: FakeElement }[] {
  const list = (d.root as unknown as FakeElement).children[1]!;
  return list.children.map((button) => ({ name: button.children[1]!.children[0]!.textContent, button }));
}
const shown = (d: ChoiceDialog<Id>): string[] => entries(d).filter((e) => !e.button.hidden).map((e) => e.name);

describe('ChoiceDialog and dev content (M35)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  const make = (initial: Id = 'normal', fallback?: Id) =>
    new ChoiceDialog<Id>('Difficulty', OPTIONS, initial, 'difficulty' as never, () => {}, { soon: SOON, soonTag: 'Coming soon', ...(fallback ? { fallback } : {}) });

  it('lists a dev option and a dev Coming soon entry only once Dev content is on', () => {
    const d = make();
    expect(shown(d)).toEqual(['Easy', 'Normal', 'Quarry']);
    d.setDevContent(true);
    expect(shown(d)).toEqual(['Easy', 'Normal', 'Hard', 'Woodland', 'Quarry']);
    d.setDevContent(false);
    expect(shown(d)).toEqual(['Easy', 'Normal', 'Quarry']);
  });

  it('leaves a hidden dev option disabled, and the Coming soon entries disabled always', () => {
    const d = make();
    expect(entries(d).find((e) => e.name === 'Hard')!.button.disabled).toBe(true);
    d.setDevContent(true);
    expect(entries(d).find((e) => e.name === 'Hard')!.button.disabled).toBe(false);
    expect(entries(d).filter((e) => e.button.className.includes('soon')).every((e) => e.button.disabled)).toBe(true);
  });

  it('plays a saved dev pick as the fallback while off (the default, else the first option), and as picked while on', () => {
    const d = make('hard', 'normal');
    expect(d.value).toBe('normal');
    expect(d.label).toBe('Normal');
    expect(d.blurb).toBe('Fair.');
    expect(entries(d).find((e) => e.name === 'Normal')!.button.getAttribute('aria-pressed')).toBe('true');
    d.setDevContent(true);
    expect(d.value).toBe('hard');
    expect(d.label).toBe('Hard');
    expect(entries(d).find((e) => e.name === 'Hard')!.button.getAttribute('aria-pressed')).toBe('true');
    d.setDevContent(false);
    expect(d.value).toBe('normal'); // the same pick comes back and goes
    expect(make('hard').value).toBe('easy'); // no fallback given: the first option
  });

  it('keeps a public pick as it is whatever the switch says', () => {
    const d = make('easy');
    expect(d.value).toBe('easy');
    d.setDevContent(true);
    expect(d.value).toBe('easy');
  });
});
