import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUALITY, type QualityChoice } from '../config/render';
import { MemoryStorage } from '../pool/testStorage';
import { GraphicsSettings } from './graphicsSettings';
import { FakeElement } from './testSupport';

/** The fake element with the two lookups the Custom rows use: tag names only, depth first. */
class QueryElement extends FakeElement {
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const tags = selector.split(',').map((t) => t.trim());
    const found: FakeElement[] = [];
    const walk = (node: FakeElement): void => {
      for (const child of node.children) {
        if (tags.includes(child.tag)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

let storage: MemoryStorage;

function build(initial: QualityChoice): GraphicsSettings {
  return new GraphicsSettings({
    quality: {
      initial,
      settings: initial === 'custom' ? { ...QUALITY.high, shadows: false } : QUALITY[initial],
      onChange: () => {},
      status: () => ({ antialiased: true, antialiasPending: false, maxAnisotropy: 16 }),
    },
    frameRateCap: { initial: 0, onChange: () => {} },
    showFps: { initial: false, onChange: () => {} },
    toneMapping: { initial: 'neutral', onChange: () => {} },
  });
}

/** The Quality picker's button for `label`. */
const qualityButton = (g: GraphicsSettings, label: string): FakeElement =>
  (g.qualityRow as unknown as QueryElement).querySelectorAll('button').find((b) => b.textContent === label)!;

const block = (g: GraphicsSettings): FakeElement => g.customBlock as unknown as FakeElement;

describe('the Custom graphics rows fold away under a preset (M68, audit UI-09)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new QueryElement(tag) });
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  // Test files share a worker's modules (isolate: false), so the fake DOM goes when each test ends.
  afterEach(() => vi.unstubAllGlobals());

  it('is a disclosure with the heading as its summary, folded under Low, Medium and High and open under Custom', () => {
    for (const choice of ['low', 'medium', 'high'] as const) {
      const g = build(choice);
      expect(block(g).tag, choice).toBe('details');
      expect(block(g).children[0]!.tag).toBe('summary');
      expect(block(g).open, choice).toBe(false);
    }
    expect(block(build('custom')).open).toBe(true);
  });

  it('still builds every Custom row, folded or not, so picking Custom has the rows to show', () => {
    const rows = block(build('high')).children.filter((c) => c.className.includes('menu-row'));
    expect(rows.length).toBeGreaterThan(10);
  });

  it('opens when Custom is picked, and stays as the player leaves it when a preset is picked after', () => {
    const g = build('high');
    qualityButton(g, 'Custom').click();
    expect(block(g).open).toBe(true);
    qualityButton(g, 'Low').click();
    expect(block(g).open).toBe(true);
    block(g).open = false; // the player folds it
    qualityButton(g, 'Medium').click();
    expect(block(g).open).toBe(false);
  });

  it("opens when the game shows Custom itself, and a preset it shows doesn't fold a block the player opened", () => {
    const g = build('low');
    g.show('custom', QUALITY.high);
    expect(block(g).open).toBe(true);
    g.show('medium', QUALITY.medium);
    expect(block(g).open).toBe(true);
  });

  it('saves nothing for folding or opening, and the Custom pick writes what it did before', () => {
    const g = build('high');
    block(g).open = true;
    block(g).open = false;
    expect(storage.length).toBe(0);
    qualityButton(g, 'Custom').click();
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => !/open|fold|disclos/i.test(k))).toBe(true);
  });
});
