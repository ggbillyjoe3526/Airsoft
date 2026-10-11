import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HIT_MARKER } from '../config/hits';
import { DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { crosshairSettings, loadHitMarker } from './crosshairSettings';
import { HitFeedback } from './hitFeedback';
import { FakeElement } from './testSupport';

/** Every element under `node` with the tag, depth first. */
function all(node: FakeElement, tag: string): FakeElement[] {
  return node.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...all(c, tag)]);
}
const label = (row: FakeElement): string => all(row, 'span').find((s) => s.classList.contains('menu-row-label'))?.textContent ?? '';
const pressed = (row: FakeElement): string[] => all(row, 'button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const saved = (fields: Record<string, unknown>): MemoryStorage => {
  const s = new MemoryStorage();
  s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields }));
  return s;
};

/** The fake element with the simple lookups the crosshair rows make (a tag or a class), as settingsRows.test.ts's. */
class Node extends FakeElement {
  dataset: Record<string, string> = {};
  private is(sel: string): boolean {
    return sel.startsWith('.') ? this.classList.contains(sel.slice(1)) : this.tag === sel;
  }
  querySelectorAll(sel: string): Node[] {
    return (this.children as Node[]).flatMap((c) => [...(c.is(sel) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
  querySelector(sel: string): Node | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

describe('the Hit marker setting (M97)', () => {
  it('is off on a clean save and on any save from before it; on or off as saved after', () => {
    expect(DEFAULT_HIT_MARKER).toBe(false);
    expect(loadHitMarker(new MemoryStorage())).toBe(false);
    expect(loadHitMarker(null)).toBe(false);
    expect(loadHitMarker(saved({ quality: 'high', 'crosshair.shape': 'dot' }))).toBe(false);
    expect(loadHitMarker(saved({ hitMarker: 'on' }))).toBe(true);
    expect(loadHitMarker(saved({ hitMarker: 'off' }))).toBe(false);
    expect(loadHitMarker(saved({ hitMarker: true }))).toBe(false);
  });

  describe('its row', () => {
    beforeEach(() => {
      vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
      vi.stubGlobal('localStorage', new MemoryStorage());
    });
    afterEach(() => vi.unstubAllGlobals());

    it('is the last of the crosshair rows (the group that holds the crosshair), Off by default, saved as hitMarker', () => {
      const seen: boolean[] = [];
      const rows = crosshairSettings({ initial: { ...DEFAULT_CROSSHAIR }, onChange: () => {}, hitMarker: { initial: false, onChange: (on) => seen.push(on) } }) as unknown as FakeElement[];
      const row = rows.at(-1)!;
      expect(label(row)).toBe('Hit marker');
      expect(pressed(row)).toEqual(['Off']);
      all(row, 'button').find((b) => b.textContent === 'On')!.click();
      expect(seen).toEqual([true]);
      expect((JSON.parse(localStorage.getItem(SETTINGS_KEY)!) as Record<string, unknown>).hitMarker).toBe('on');
      expect(loadHitMarker(localStorage)).toBe(true);
    });
  });
});

/** Just enough of an element for HitFeedback: a class list, a style and the lookups it makes once. */
class Part {
  readonly classes = new Set<string>();
  readonly classList = {
    contains: (c: string) => this.classes.has(c),
    add: (c: string) => void this.classes.add(c),
    remove: (c: string) => void this.classes.delete(c),
    toggle: (c: string, on?: boolean) => void ((on ?? !this.classes.has(c)) ? this.classes.add(c) : this.classes.delete(c)),
  };
  readonly style = { setProperty: () => {}, transform: '' };
  textContent = '';
  hidden = false;
  className = '';
  innerHTML = '';
  private readonly parts = new Map<string, Part>();
  querySelector(sel: string): Part {
    let p = this.parts.get(sel);
    if (!p) this.parts.set(sel, (p = new Part()));
    return p;
  }
  querySelectorAll(): Part[] {
    return [new Part(), new Part()];
  }
  appendChild(): void {}
  remove(): void {}
}

describe('HitFeedback and the Hit marker (M97)', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: () => new Part() }));
  afterEach(() => vi.unstubAllGlobals());

  const make = (): { feedback: HitFeedback; marker: Part } => {
    const feedback = new HitFeedback(new Part() as unknown as HTMLElement, () => 'Left click');
    const root = (feedback as unknown as { root: Part }).root;
    return { feedback, marker: root.querySelector('.hitfx-marker') };
  };

  it('shows no red X when your BB lands while it is off, as it is by default', () => {
    const { feedback, marker } = make();
    feedback.showHitMarker(false);
    expect(marker.classes.has('show')).toBe(false);
  });

  it('shows it as before when on, and turning it off takes one showing away', () => {
    const { feedback, marker } = make();
    feedback.setHitMarker(true);
    feedback.showHitMarker(true);
    expect(marker.classes.has('show')).toBe(true);
    expect(marker.classes.has('friendly')).toBe(true);
    feedback.setHitMarker(false);
    expect(marker.classes.has('show')).toBe(false);
    feedback.showHitMarker(false);
    expect(marker.classes.has('show')).toBe(false);
  });
});

describe('Settings › Gameplay › Replay tutorial (M97)', () => {
  it('starts at once from the title or the top bar, and asks first only from the pause menu (it leaves what is under way)', async () => {
    const { replayTutorialAsks } = await import('./menus/settingsScreen');
    expect(replayTutorialAsks('title')).toBe(false);
    expect(replayTutorialAsks('setup')).toBe(false);
    expect(replayTutorialAsks('pause')).toBe(true);
  });

  it('has its words: a Tutorial heading, the button and its note, and the question asked from the pause menu', async () => {
    const { SETTINGS_TEXT } = await import('../config/menus');
    expect(SETTINGS_TEXT.tutorialHeading).toBe('Tutorial');
    expect(SETTINGS_TEXT.replayTutorial).toBe('Replay tutorial');
    expect(SETTINGS_TEXT.replayTutorialHelp).toMatch(/first step/);
    expect(SETTINGS_TEXT.replayTutorialLeave).toMatch(/leaves/);
  });
});
