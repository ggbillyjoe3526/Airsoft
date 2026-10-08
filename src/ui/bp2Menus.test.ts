import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY } from '../settings/storage';
import type { PickerOption } from './optionPicker';
import { ChoiceCards } from './menus/choiceCards';
import { PictureSlot } from './menus/menuPictures';
import { REPLICA_KEYS } from '../pool/pool';
import { accessibilitySettings } from './accessibilitySettings';
import { FakeElement, findAll } from './testSupport';

// BP2 (bug pass 2): the menu fixes.

/** The fake element with replaceChildren, which the swatches row uses. */
class Node extends FakeElement {
  replaceChildren(...n: Node[]): void {
    this.children.length = 0;
    this.append(...n);
  }
}
const nodeDocument = () => ({ createElement: (tag: string) => new Node(tag) });

describe('the Reduced motion picker follows a system change while no choice is saved (BP2, audit UI-07)', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    vi.stubGlobal('document', nodeDocument());
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  function build(initial: boolean) {
    const changes: boolean[] = [];
    let show: ((on: boolean) => void) | undefined;
    const rows = accessibilitySettings({
      reducedMotion: { initial, onChange: (on) => changes.push(on), follow: (s) => (show = s) },
      teamColours: { initial: 'standard', onChange: () => {} },
      soundCues: { initial: false, onChange: () => {} },
      soundCueSize: { initial: 1, onChange: () => {} },
      soundCueColour: { initial: 'white', onChange: () => {} },
    });
    const row = rows[0] as unknown as FakeElement;
    const pressed = (): string[] =>
      findAll(row, 'picker-button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
    return { show: () => show!, pressed, changes };
  }

  it('hands the page a way to show a value, and showing it moves the pressed button (BP2)', () => {
    const { show, pressed } = build(false);
    expect(pressed()).toEqual(['Off']);
    show()(true);
    expect(pressed()).toEqual(['On']);
    show()(false);
    expect(pressed()).toEqual(['Off']);
  });

  it('shows without saving a choice or reporting a change (BP2)', () => {
    const { show, changes } = build(false);
    show()(true);
    expect(changes).toEqual([]);
    expect(storage.getItem(SETTINGS_KEY) ?? '').not.toContain('reducedMotion');
  });
});

describe('a card\'s side tag is worked out on refresh (BP2, M50)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', nodeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  type Id = 'yard' | 'wood';
  const OPTIONS: readonly PickerOption<Id>[] = [
    { id: 'yard', label: 'Yard', blurb: 'Flat.' },
    { id: 'wood', label: 'Wood', blurb: 'Trees.' },
  ];

  it('shows a tag that was empty at build once it is set, and hides it again when it goes back to empty (BP2)', () => {
    let tag = '';
    const c = new ChoiceCards<Id>('Map', OPTIONS, 'yard', 'map' as never, () => {}, { sideTag: (id) => (id === 'wood' ? tag : '') });
    const wood = (c.root as unknown as FakeElement).children[1]!.children[0]!;
    const pill = () => findAll(wood, 'tag-blue')[0]!;
    expect(pill().hidden, 'empty at build: hidden').toBe(true);
    tag = 'Night only';
    c.refresh();
    expect(pill().textContent).toBe('Night only');
    expect(pill().hidden).toBe(false);
    tag = '';
    c.refresh();
    expect(pill().hidden).toBe(true);
    expect(pill().textContent).toBe('');
  });

  it('never shows one on a card whose tag stays empty (BP2)', () => {
    const c = new ChoiceCards<Id>('Map', OPTIONS, 'yard', 'map' as never, () => {}, { sideTag: () => '' });
    c.refresh();
    const yard = (c.root as unknown as FakeElement).children[0]!.children[0]!;
    expect(findAll(yard, 'tag-blue').every((p) => p.hidden)).toBe(true);
  });
});

describe('a picture that could not be made is asked for again on the next show of it (BP2)', () => {
  beforeEach(() => vi.stubGlobal('document', nodeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('asks again for the same subject after the promise rejected, and shows the second answer (BP2)', async () => {
    const subject = { replica: REPLICA_KEYS.aeg!, scheme: 'cobalt', realistic: false } as const;
    let asked = 0;
    const source = { picture: () => (++asked === 1 ? Promise.reject(new Error('context lost')) : Promise.resolve('blob:again')) };
    const slot = new PictureSlot();
    slot.show(source, subject, '');
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
    slot.show(source, subject, '');
    expect(asked).toBe(2);
    await Promise.resolve();
    await Promise.resolve();
    expect((slot.root.children[1] as HTMLImageElement).src).toBe('blob:again');
  });
});
