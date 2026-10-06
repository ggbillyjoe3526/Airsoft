import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRAPHICS_ROWS, graphicsKey, storedValue } from '../config/graphics';
import { QUALITY, resolveQuality, type QualityChoice } from '../config/render';
import { loadCustomQuality, loadFrameRateCap } from './menus/savedChoices';
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

/** A Custom row's picker group, found by its label inside the block. */
const rowGroup = (g: GraphicsSettings, label: string): QueryElement => {
  const walk = (n: FakeElement): FakeElement | undefined => {
    for (const c of n.children) {
      if (c.getAttribute('aria-label') === label) return c;
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(block(g))! as QueryElement;
};

/** Everything in storage, as key to value. */
const saved = (): Record<string, unknown> => {
  const raw = storage.getItem('airsoft.settings');
  return raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
};

describe('the fold and the Custom pick (M68 QA, audit UI-09)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new QueryElement(tag) });
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens again when Custom is picked again after a preset, though the player folded it under the first Custom', () => {
    const g = build('custom');
    expect(block(g).open).toBe(true);
    block(g).open = false;
    qualityButton(g, 'Low').click();
    expect(block(g).open).toBe(false);
    qualityButton(g, 'Custom').click();
    expect(block(g).open).toBe(true);
  });

  it('opens when the game shows Custom after the player folded it, and keeps a fold the player made under a preset it shows', () => {
    const g = build('custom');
    block(g).open = false;
    g.show('custom', QUALITY.high);
    expect(block(g).open).toBe(true);
    block(g).open = false;
    g.show('low', QUALITY.low);
    expect(block(g).open).toBe(false);
  });

  it('keeps an opened fold open when a row it holds turns the picker to Custom, and saves no fold with it', () => {
    const g = build('high');
    block(g).open = true;
    const off = rowGroup(g, 'Shadows').querySelectorAll('button').find((b) => b.textContent === 'Off')!;
    off.click();
    expect(qualityButton(g, 'Custom').getAttribute('aria-pressed')).toBe('true');
    expect(block(g).open).toBe(true);
    expect(Object.keys(saved()).some((k) => /open|fold|disclos/i.test(k))).toBe(false);
  });

  it('leaves the fold as it is when a row changes it back to a preset', () => {
    const g = build('custom'); // High with Shadows off
    const on = rowGroup(g, 'Shadows').querySelectorAll('button').find((b) => b.textContent === 'On')!;
    on.click();
    expect(qualityButton(g, 'High').getAttribute('aria-pressed')).toBe('true');
    expect(block(g).open).toBe(true);
  });
});

describe('what Custom saves is the same with the fold in the page (M68 QA, audit UI-09)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new QueryElement(tag) });
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes the picker choice and every row of the values in force when Custom is picked, and nothing else', () => {
    const g = build('high');
    qualityButton(g, 'Custom').click();
    const expected: Record<string, string> = { version: '1', quality: 'custom' };
    for (const row of GRAPHICS_ROWS) {
      const v = storedValue(row, QUALITY.high[row.field]);
      if (v !== undefined) expected[graphicsKey(row.field)] = String(v);
    }
    expect(Object.fromEntries(Object.entries(saved()).map(([k, v]) => [k, String(v)]))).toEqual(expected);
  });

  it('reads a saved Custom mix back to what was saved, and the fold opens on it', () => {
    const g = build('high');
    qualityButton(g, 'Custom').click();
    const off = rowGroup(g, 'Shadows').querySelectorAll('button').find((b) => b.textContent === 'Off')!;
    off.click();
    const back = resolveQuality('custom', loadCustomQuality());
    expect(back).toEqual({ ...QUALITY.high, shadows: false });
    expect(block(build('custom')).open).toBe(true);
  });
});

/** A picker built with its changes recorded: what the game is told, in order. */
function buildRecording(initial: QualityChoice, frameRate = 0) {
  const told = { quality: [] as [QualityChoice, unknown][], cap: [] as number[] };
  const g = new GraphicsSettings({
    quality: {
      initial,
      settings: initial === 'custom' ? { ...QUALITY.high, shadows: false } : QUALITY[initial],
      onChange: (c, s) => void told.quality.push([c, s]),
      status: () => ({ antialiased: true, antialiasPending: false, maxAnisotropy: 16 }),
    },
    frameRateCap: { initial: frameRate as 0, onChange: (cap) => void told.cap.push(cap) },
    showFps: { initial: false, onChange: () => {} },
    toneMapping: { initial: 'neutral', onChange: () => {} },
  });
  return { g, told };
}

const pressed = (group: QueryElement): string[] => group.querySelectorAll('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

describe('Ultra and the frame-rate row in the settings (G5 QA)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new QueryElement(tag) });
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers Ultra after High, and picking it applies and saves it and shows every post row at its Ultra value', () => {
    const { g, told } = buildRecording('high');
    expect((g.qualityRow as unknown as QueryElement).querySelectorAll('button').map((b) => b.textContent)).toEqual(['Low', 'Medium', 'High', 'Ultra', 'Custom']);
    qualityButton(g, 'Ultra').click();
    expect(told.quality).toEqual([['ultra', QUALITY.ultra]]);
    expect(saved().quality).toBe('ultra');
    expect(pressed(rowGroup(g, 'Ambient occlusion'))).toEqual(['Full']);
    for (const label of ['Bloom', 'Temporal smoothing', 'Light shafts', 'Reflections', 'Film grain and lens']) expect(pressed(rowGroup(g, label)), label).toEqual(['On']);
    expect(pressed(rowGroup(g, 'Night lights'))).toEqual(['Nearest 8']);
    // High and Low put them back.
    qualityButton(g, 'High').click();
    expect(pressed(rowGroup(g, 'Ambient occlusion'))).toEqual(['Half']);
    expect(pressed(rowGroup(g, 'Reflections'))).toEqual(['Off']);
    qualityButton(g, 'Low').click();
    expect(pressed(rowGroup(g, 'Ambient occlusion'))).toEqual(['Off']);
    expect(pressed(rowGroup(g, 'Bloom'))).toEqual(['Off']);
  });

  it('turns the picker to Custom when one Ultra row changes, and back to Ultra when it is put back', () => {
    const { g, told } = buildRecording('ultra');
    expect(qualityButton(g, 'Ultra').getAttribute('aria-pressed')).toBe('true');
    const click = (row: string, label: string) => rowGroup(g, row).querySelectorAll('button').find((b) => b.textContent === label)!.click();
    click('Reflections', 'Off');
    expect(qualityButton(g, 'Custom').getAttribute('aria-pressed')).toBe('true');
    expect(qualityButton(g, 'Ultra').getAttribute('aria-pressed')).not.toBe('true');
    expect(told.quality.at(-1)![0]).toBe('custom');
    expect(resolveQuality('custom', loadCustomQuality())).toEqual({ ...QUALITY.ultra, reflections: false });
    click('Reflections', 'On');
    expect(qualityButton(g, 'Ultra').getAttribute('aria-pressed')).toBe('true');
    expect(told.quality.at(-1)![0]).toBe('ultra');
    // Half the shade on Ultra is neither Ultra nor High.
    click('Ambient occlusion', 'Half');
    expect(qualityButton(g, 'Custom').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the pre-G5 Custom mix with High’s post rows, and saves a post row by name when it is changed', () => {
    const { g } = buildRecording('custom');
    expect(pressed(rowGroup(g, 'Ambient occlusion'))).toEqual(['Half']);
    expect(pressed(rowGroup(g, 'Temporal smoothing'))).toEqual(['On']);
    rowGroup(g, 'Ambient occlusion').querySelectorAll('button').find((b) => b.textContent === 'Full')!.click();
    expect(saved()['graphics.ambientOcclusion']).toBe('full');
    expect(loadCustomQuality().ambientOcclusion).toBe(1);
  });

  it('offers Unlimited first, then 30, 60, 120, 144 and 240, shows the saved one, and an unknown initial as Unlimited', () => {
    const labels = (g: GraphicsSettings) => (g.frameRateRow as unknown as QueryElement).querySelectorAll('button').map((b) => b.textContent);
    expect(labels(buildRecording('high').g)).toEqual(['Unlimited', '30', '60', '120', '144', '240']);
    expect(pressed(buildRecording('high', 240).g.frameRateRow as unknown as QueryElement)).toEqual(['240']);
    expect(pressed(buildRecording('high', 0).g.frameRateRow as unknown as QueryElement)).toEqual(['Unlimited']);
    expect(pressed(buildRecording('high', 75).g.frameRateRow as unknown as QueryElement)).toEqual(['Unlimited']);
  });

  it('tells the game each choice as its number of frames and saves it under frameRateCap by id, Unlimited as off', () => {
    const { g, told } = buildRecording('high', 60);
    const pick = (label: string) => (g.frameRateRow as unknown as QueryElement).querySelectorAll('button').find((b) => b.textContent === label)!.click();
    for (const [label, cap, id] of [['240', 240, '240'], ['144', 144, '144'], ['Unlimited', 0, 'off'], ['30', 30, '30']] as const) {
      pick(label);
      expect(told.cap.at(-1), label).toBe(cap);
      expect(saved().frameRateCap, label).toBe(id);
      expect(loadFrameRateCap(), label).toBe(cap);
    }
  });
});
