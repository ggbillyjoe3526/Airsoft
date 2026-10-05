import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY } from '../../settings/storage';
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
  // Test files share a worker's modules (isolate: false), so the fake DOM goes when each test ends.
  afterEach(() => vi.unstubAllGlobals());

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

  it('hides the options a context does not offer, playing a saved one as the fallback, and keeps it saved (M43)', () => {
    const d = make('easy', 'normal');
    d.setDevContent(true);
    d.limit((id) => id !== 'easy');
    expect(shown(d)).toEqual(['Normal', 'Hard', 'Woodland', 'Quarry']);
    expect(entries(d).find((e) => e.name === 'Easy')!.button.disabled).toBe(true);
    expect(d.value).toBe('normal');
    d.limit(() => true);
    expect(shown(d)).toEqual(['Easy', 'Normal', 'Hard', 'Woodland', 'Quarry']);
    expect(d.value).toBe('easy');
  });
});

describe('ChoiceDialog switches on an option (M34d: Day | Night)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  /** A dialog where Hard offers Day and Night (as a map may) and the rest offer one side or none. */
  const make = () => {
    const sides: Partial<Record<Id, string>> = {};
    const picks: [Id, string][] = [];
    const changes: Id[] = [];
    const d = new ChoiceDialog<Id>('Map', OPTIONS, 'easy', 'difficulty' as never, (id) => changes.push(id), {
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
    const list = (d.root as unknown as FakeElement).children[1]!;
    const group = list.children.find((c) => c.className.includes('choice-variants'))!;
    return { d, list, group, picks, changes };
  };
  const pressed = (group: FakeElement): string[] => group.children.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

  it('shows a switch only under an option with two sides or more, right under it', () => {
    const { list, group } = make();
    expect(list.children.filter((c) => c.className.includes('choice-variants'))).toHaveLength(1);
    const at = list.children.indexOf(group);
    expect(list.children[at - 1]!.children[1]!.children[0]!.textContent).toBe('Hard');
    expect(group.children.map((b) => b.textContent)).toEqual(['Day', 'Night']);
    expect(group.getAttribute('aria-label')).toBe('Hard: Light');
    expect(pressed(group)).toEqual(['Night']);
  });

  it('picks the side and its option together, and shows the side picked', () => {
    const { d, group, picks, changes } = make();
    d.setDevContent(true);
    group.children[0]!.click();
    expect(picks).toEqual([['hard', 'day']]);
    expect(changes).toEqual(['hard']);
    expect(d.value).toBe('hard');
    expect(pressed(group)).toEqual(['Day']);
    // The other side, with the option already picked: the side changes, the option stays.
    group.children[1]!.click();
    expect(picks).toEqual([['hard', 'day'], ['hard', 'night']]);
    expect(changes).toEqual(['hard']);
    expect(pressed(group)).toEqual(['Night']);
  });

  it('hides the switch with its option (a dev option while Dev content is off)', () => {
    const { d, group } = make();
    expect(group.hidden).toBe(true);
    d.setDevContent(true);
    expect(group.hidden).toBe(false);
  });

  it('picks a side of an option that is not the picked one: the option is picked and saved once, the dialog closes', () => {
    const { d, list, group, picks, changes } = make();
    d.setDevContent(true);
    expect(d.value).toBe('easy');
    (d.root as unknown as FakeElement).open = true;
    group.children[0]!.click();
    expect(d.value).toBe('hard');
    expect(changes).toEqual(['hard']);
    expect(picks).toEqual([['hard', 'day']]);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)['difficulty']).toBe('hard');
    expect((d.root as unknown as FakeElement).open).toBe(false);
    // The option's own button now shows as the picked one, and the other options do not.
    const buttons = list.children.filter((c) => c.tag === 'button' && c.className.includes('choice-option'));
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.children[1]!.children[0]!.textContent)).toEqual(['Hard']);
  });

  it('puts the switch\'s sides right after their option, as buttons that take no form submit, for Tab to reach in order', () => {
    const { list, group } = make();
    const at = list.children.indexOf(group);
    expect(list.children[at - 1]!.tag).toBe('button');
    expect(list.children[at - 1]!.classList.contains('has-variants')).toBe(true);
    expect(group.getAttribute('role')).toBe('group');
    for (const side of group.children) {
      expect([side.tag, side.type]).toEqual(['button', 'button']);
      expect(side.className).toContain('choice-variant');
    }
  });

  it('shows a side picked elsewhere the next time the dialog is refreshed by any pick', () => {
    const { d, group } = make();
    d.setDevContent(true);
    expect(pressed(group)).toEqual(['Night']);
    group.children[0]!.click();
    d.setDevContent(false);
    d.setDevContent(true);
    expect(pressed(group)).toEqual(['Day']);
  });

  it('hides a switch with its option when the options are limited, and gives the other options none', () => {
    const { d, list } = make();
    d.limit((id) => id !== 'hard');
    expect(list.children.filter((c) => c.className.includes('choice-variants'))[0]!.hidden).toBe(true);
    expect(list.children.filter((c) => c.className.includes('choice-variants'))).toHaveLength(1);
  });
});

describe('ChoiceDialog notes (M49)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Each option's note line (its text's third part) and whether it shows. */
  const notes = (d: ChoiceDialog<Id>): [string, string, boolean][] =>
    entries(d)
      .filter((e) => e.button.className === 'choice-option' || e.button.className.includes('selected'))
      .map((e) => {
        const note = e.button.children[1]!.children[2]!;
        return [e.name, note.textContent, !note.hidden];
      });

  it('shows a line under one option’s description when set, and takes it away with null', () => {
    const d = new ChoiceDialog<Id>('Difficulty', OPTIONS, 'normal', 'difficulty' as never, () => {});
    expect(notes(d).every(([, , showing]) => !showing)).toBe(true);
    d.setNote('hard', 'Supply weekend, until Sunday: cases hold +25 % Field Credits.');
    expect(notes(d)).toEqual([
      ['Easy', '', false],
      ['Normal', '', false],
      ['Hard', 'Supply weekend, until Sunday: cases hold +25 % Field Credits.', true],
    ]);
    d.setNote('hard', null);
    expect(notes(d).find(([name]) => name === 'Hard')).toEqual(['Hard', '', false]);
  });

  it('hides the note with its option while dev content is off, and brings it back with the option', () => {
    const d = new ChoiceDialog<Id>('Difficulty', OPTIONS, 'normal', 'difficulty' as never, () => {});
    d.setNote('hard', 'Supply weekend, until Sunday: cases hold +25 % Field Credits.');
    const hard = entries(d).find((e) => e.name === 'Hard')!;
    // The note sits inside the option's button, so the button's own hidden flag is what keeps it off screen.
    expect(hard.button.hidden).toBe(true);
    expect(hard.button.disabled).toBe(true);
    d.setDevContent(true);
    expect(hard.button.hidden).toBe(false);
    expect(notes(d).find(([name]) => name === 'Hard')).toEqual(['Hard', 'Supply weekend, until Sunday: cases hold +25 % Field Credits.', true]);
    d.setDevContent(false);
    expect(hard.button.hidden).toBe(true);
  });

  it('keeps a note through a limit and a dev-content change, replaces it on the next setNote, and ignores an id it does not have', () => {
    const d = new ChoiceDialog<Id>('Difficulty', OPTIONS, 'normal', 'difficulty' as never, () => {});
    d.setDevContent(true);
    d.setNote('hard', 'first');
    d.limit((id) => id !== 'easy');
    d.setDevContent(false);
    d.setDevContent(true);
    expect(notes(d).find(([name]) => name === 'Hard')).toEqual(['Hard', 'first', true]);
    d.setNote('hard', 'second');
    expect(notes(d).find(([name]) => name === 'Hard')).toEqual(['Hard', 'second', true]);
    expect(() => d.setNote('nope' as Id, 'x')).not.toThrow();
    // A note on one option leaves the others' notes alone.
    expect(notes(d).filter(([, , showing]) => showing).map(([name]) => name)).toEqual(['Hard']);
  });

  it('does not change what is picked or what the dialog plays', () => {
    const picked: Id[] = [];
    const d = new ChoiceDialog<Id>('Difficulty', OPTIONS, 'normal', 'difficulty' as never, (id) => picked.push(id));
    d.setNote('normal', 'a line');
    d.setNote('normal', null);
    expect(d.value).toBe('normal');
    expect(picked).toEqual([]);
  });
});
