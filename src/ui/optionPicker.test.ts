import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../pool/testStorage';
import { OptionPicker, type PickerOption } from './optionPicker';
import { fakeDocument, type FakeElement } from './testSupport';

const OPTIONS: readonly PickerOption<'a' | 'b' | 'c'>[] = [
  { id: 'a', label: 'Alpha', blurb: 'The first.' },
  { id: 'b', label: 'Beta', blurb: 'The second.', tag: 'public' },
  { id: 'c', label: 'Gamma', blurb: 'Still being built.', tag: 'dev' },
];

/** The picker's option buttons, in order. */
const buttons = (p: OptionPicker<'a' | 'b' | 'c'>): FakeElement[] => (p.root as unknown as FakeElement).children[0]!.children.filter((c) => c.tag === 'button');
const blurb = (p: OptionPicker<'a' | 'b' | 'c'>): string => (p.root as unknown as FakeElement).children[1]!.textContent;

describe('OptionPicker and dev options (M35)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('hides a dev option while Dev content is off, and shows the public and untagged ones', () => {
    const p = new OptionPicker('Pick', OPTIONS, 'a', 'matchMode' as never, () => {});
    expect(buttons(p).map((b) => b.hidden)).toEqual([false, false, true]);
  });

  it('shows the dev option, looking like the rest, once Dev content is on, and hides it again when off', () => {
    const p = new OptionPicker('Pick', OPTIONS, 'a', 'matchMode' as never, () => {});
    p.setDevContent(true, 'a');
    expect(buttons(p).map((b) => b.hidden)).toEqual([false, false, false]);
    expect(buttons(p)[2]!.className).toBe(buttons(p)[0]!.className);
    p.setDevContent(false, 'a');
    expect(buttons(p).map((b) => b.hidden)).toEqual([false, false, true]);
  });

  it('shows the value it is given as picked, and its blurb, without reporting a change', () => {
    const changes: string[] = [];
    const p = new OptionPicker('Pick', OPTIONS, 'c', 'matchMode' as never, (v) => changes.push(v));
    p.setDevContent(false, 'a'); // a saved dev pick plays as the default while off
    expect(buttons(p).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(blurb(p)).toBe('The first.');
    p.setDevContent(true, 'c');
    expect(buttons(p).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(blurb(p)).toBe('Still being built.');
    expect(changes).toEqual([]);
  });

  it('picks the stand-in for real when it is clicked while a dev pick is hidden', () => {
    const changes: string[] = [];
    const p = new OptionPicker('Pick', OPTIONS, 'c', 'matchMode' as never, (v) => changes.push(v));
    p.setDevContent(false, 'a');
    buttons(p)[0]!.click();
    expect(changes).toEqual(['a']);
    // The dev pick is gone: turning Dev content back on shows the stand-in, now picked.
    p.setDevContent(true, 'a');
    expect(buttons(p).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    buttons(p)[0]!.click();
    expect(changes).toEqual(['a']);
  });
});
