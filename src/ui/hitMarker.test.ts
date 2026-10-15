import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HIT_MARKER, DEFAULT_HIT_MARKER_SETTINGS, HIT_MARKER_COLORS, HIT_MARKER_SHAPE, type HitMarkerSettings } from '../config/hits';
import { DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { crosshairSettings } from './crosshairSettings';
import { HitFeedback } from './hitFeedback';
import { hitMarkerCss, hitMarkerSize, loadHitMarker, styleHitMarker } from './hitMarkerLook';
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
    expect(loadHitMarker(new MemoryStorage()).on).toBe(false);
    expect(loadHitMarker(null).on).toBe(false);
    expect(loadHitMarker(saved({ quality: 'high', 'crosshair.shape': 'dot' })).on).toBe(false);
    expect(loadHitMarker(saved({ hitMarker: 'on' })).on).toBe(true);
    expect(loadHitMarker(saved({ hitMarker: 'off' })).on).toBe(false);
    expect(loadHitMarker(saved({ hitMarker: true })).on).toBe(false);
  });

  describe('its row', () => {
    beforeEach(() => {
      vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
      vi.stubGlobal('localStorage', new MemoryStorage());
    });
    afterEach(() => vi.unstubAllGlobals());

    const rowsFor = (seen: HitMarkerSettings[]): FakeElement[] =>
      crosshairSettings({ initial: { ...DEFAULT_CROSSHAIR }, onChange: () => {}, hitMarker: { initial: { ...DEFAULT_HIT_MARKER_SETTINGS }, onChange: (m) => seen.push(m) } }) as unknown as FakeElement[];

    it('follow the crosshair\'s rows (the group that holds the crosshair): on or off, a preview, scale, thickness, outline, colour', () => {
      const rows = rowsFor([]);
      expect(rows.slice(-6).map(label)).toEqual(['Hit marker', 'Marker preview', 'Marker scale', 'Marker thickness', 'Marker outline', 'Marker colour']);
      expect(rows.slice(0, -6).map(label)).not.toContain('Hit marker');
    });

    it('Off by default, saved as hitMarker', () => {
      const seen: HitMarkerSettings[] = [];
      const row = rowsFor(seen).find((r) => label(r) === 'Hit marker')!;
      expect(pressed(row)).toEqual(['Off']);
      all(row, 'button').find((b) => b.textContent === 'On')!.click();
      expect(seen.map((m) => m.on)).toEqual([true]);
      expect((JSON.parse(localStorage.getItem(SETTINGS_KEY)!) as Record<string, unknown>).hitMarker).toBe('on');
      expect(loadHitMarker(localStorage).on).toBe(true);
    });

    it('a bold red X with an outline unless changed; the outline and colour picks are saved and passed on whole', () => {
      const seen: HitMarkerSettings[] = [];
      const rows = rowsFor(seen);
      const outline = rows.find((r) => label(r) === 'Marker outline')!;
      const colour = rows.find((r) => label(r) === 'Marker colour')!;
      expect(pressed(outline)).toEqual(['On']);
      expect(pressed(colour)).toEqual(['Red']);
      all(outline, 'button').find((b) => b.textContent === 'Off')!.click();
      all(colour, 'button').find((b) => b.textContent === 'Yellow')!.click();
      expect(seen.at(-1)).toMatchObject({ on: false, outline: 'off', color: 'yellow', scale: 1, thickness: 3 });
      const back = loadHitMarker(localStorage);
      expect(back.outline).toBe('off');
      expect(back.color).toBe('yellow');
    });
  });
});

describe('the hit marker\'s look (the owner\'s 0.1 Dev 5 playtest, note 4)', () => {
  it('starts red, outlined, 3 px thick and at 100%; much bigger and bolder than the old 9 by 2 px white X', () => {
    expect(DEFAULT_HIT_MARKER_SETTINGS).toMatchObject({ scale: 1, thickness: 3, outline: 'on', color: 'red' });
    expect(hitMarkerCss(DEFAULT_HIT_MARKER_SETTINGS)).toBe('#ff3b30');
    expect(HIT_MARKER_SHAPE.arm).toBeGreaterThan(9);
  });

  it('loads each saved part on its own, and falls back part by part on anything out of range', () => {
    const m = loadHitMarker(saved({ hitMarker: 'on', 'hitMarker.scale': 2, 'hitMarker.thickness': 5, 'hitMarker.color': 'custom', 'hitMarker.customColor': '#00FF80' }));
    expect(m).toEqual({ on: true, scale: 2, thickness: 5, outline: 'on', color: 'custom', customColor: '#00ff80' });
    expect(hitMarkerCss(m)).toBe('#00ff80');
    const bad = loadHitMarker(saved({ 'hitMarker.scale': 9, 'hitMarker.thickness': 0, 'hitMarker.color': 'blue', 'hitMarker.customColor': 'red; x' }));
    expect(bad).toEqual(DEFAULT_HIT_MARKER_SETTINGS);
  });

  it('scales the arms and the gap round the crosshair in whole pixels', () => {
    expect(hitMarkerSize(1)).toEqual({ arm: HIT_MARKER_SHAPE.arm, gap: HIT_MARKER_SHAPE.gap });
    expect(hitMarkerSize(2)).toEqual({ arm: HIT_MARKER_SHAPE.arm * 2, gap: HIT_MARKER_SHAPE.gap * 2 });
    expect(hitMarkerSize(0.5)).toEqual({ arm: Math.round(HIT_MARKER_SHAPE.arm / 2), gap: Math.round(HIT_MARKER_SHAPE.gap / 2) });
  });

  it('puts the chosen size, thickness, colour and outline on the marker element (what the stylesheet draws from)', () => {
    const vars = new Map<string, string>();
    const classes = new Set<string>();
    const root = {
      style: { setProperty: (k: string, v: string) => void vars.set(k, v) },
      classList: { toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)) },
    } as unknown as HTMLElement;
    styleHitMarker(root, { ...DEFAULT_HIT_MARKER_SETTINGS, scale: 2, thickness: 5, outline: 'off', color: 'yellow' });
    const yellow = HIT_MARKER_COLORS.find((c) => c.id === 'yellow')!.css;
    expect(Object.fromEntries(vars)).toMatchObject({ '--hm-arm': `${HIT_MARKER_SHAPE.arm * 2}px`, '--hm-gap': `${HIT_MARKER_SHAPE.gap * 2}px`, '--hm-thick': '5px', '--hm-colour': yellow });
    expect(classes.has('no-outline')).toBe(true);
    styleHitMarker(root, DEFAULT_HIT_MARKER_SETTINGS);
    expect(vars.get('--hm-colour')).toBe('#ff3b30');
    expect(vars.get('--hm-thick')).toBe('3px');
    expect(classes.has('no-outline')).toBe(false);
  });

  it('leaves out the teams\' blue and orange, and cyan (a teammate hit shows it light blue)', () => {
    const ids = HIT_MARKER_COLORS.map((c) => c.id);
    expect(ids[0]).toBe('red');
    for (const id of ['blue', 'orange', 'cyan']) expect(ids).not.toContain(id);
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
    feedback.setHitMarker({ ...DEFAULT_HIT_MARKER_SETTINGS, on: true });
    feedback.showHitMarker(true);
    expect(marker.classes.has('show')).toBe(true);
    expect(marker.classes.has('friendly')).toBe(true);
    feedback.setHitMarker({ ...DEFAULT_HIT_MARKER_SETTINGS, on: false });
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
