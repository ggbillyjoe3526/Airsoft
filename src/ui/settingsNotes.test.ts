import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { DEFAULT_LOOK } from '../config/look';
import { MemoryStorage } from '../pool/testStorage';
import { crosshairSettings } from './crosshairSettings';
import { lookSettings } from './lookSettings';
import { FakeElement, findAll } from './testSupport';

/** The fake DOM with the simple selectors the crosshair's colour picker reads its buttons back with. */
class Node extends FakeElement {
  dataset: Record<string, string> = {};
  value = '';
  private matches(sel: string): boolean {
    return sel.startsWith('.') ? this.classList.contains(sel.slice(1)) : this.tag === sel;
  }
  querySelectorAll(sel: string): Node[] {
    return (this.children as Node[]).flatMap((c) => [...(c.matches(sel) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
  querySelector(sel: string): Node | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

/** Each row's label and its note (empty when it has none). */
function notes(rows: readonly FakeElement[]): { label: string; note: string }[] {
  return rows.map((row) => ({
    label: findAll(row, 'menu-row-label')[0]?.textContent ?? '',
    note: findAll(row, 'menu-row-help').map((h) => h.textContent).join(' '),
  }));
}

describe('a note on every settings row (G3)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives each crosshair row a note in sentence case, Shape, Colour, Opacity, Spread and Outline among them', () => {
    const rows = notes(crosshairSettings({ initial: { ...DEFAULT_CROSSHAIR }, onChange: () => {} }) as unknown as FakeElement[]);
    expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Shape', 'Colour', 'Opacity', 'Spread', 'Outline']));
    for (const { label, note } of rows) {
      expect(note, label).not.toBe('');
      // Sentence case: a capital to start, not all capitals.
      expect(note[0], label).toBe(note[0]!.toUpperCase());
      expect(note, label).not.toBe(note.toUpperCase());
    }
  });

  it('gives each Look row a note too', () => {
    for (const { label, note } of notes(lookSettings({ initial: DEFAULT_LOOK, onChange: () => {} }) as unknown as FakeElement[])) expect(note, label).not.toBe('');
  });
});
