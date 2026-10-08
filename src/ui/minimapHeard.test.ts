import { afterEach, describe, expect, it } from 'vitest';
import { Minimap, type MinimapFrame } from './minimap';
import type { HeardPlayer } from './minimapView';

/**
 * M39 QA: Minimap.setHeardShown(false) (Tournament and Pro CQB: teammates only) hides the other team's heard patches
 * and nothing else; true brings them back.
 */
const THEIRS = '#f80';
const MINE = '#00f';

/** The minimap's frame and caption round its canvas (G4): plain elements. */
const plain = () => ({ className: '', hidden: false, textContent: '', setAttribute: () => undefined, append: () => undefined, remove: () => undefined });

/** A fake DOM whose minimap canvas records the colour of every fill and stroke it is drawn with. */
function recordingDom() {
  const painted = { fills: [] as string[], strokes: [] as string[] };
  let fillStyle = '';
  let strokeStyle = '';
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => {
      if (key === 'fillStyle') return fillStyle;
      if (key === 'strokeStyle') return strokeStyle;
      if (key === 'fill') return () => painted.fills.push(fillStyle);
      if (key === 'stroke') return () => painted.strokes.push(strokeStyle);
      return () => undefined;
    },
    set: (_t, key, value) => {
      if (key === 'fillStyle') fillStyle = String(value);
      if (key === 'strokeStyle') strokeStyle = String(value);
      return true;
    },
  });
  const canvas = { width: 0, height: 0, hidden: false, className: '', setAttribute: () => undefined, getContext: () => ctx, remove: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const parent = {
    style: { setProperty: () => undefined, getPropertyValue: () => '' },
    classList: { toggle: () => undefined, remove: () => undefined },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  (globalThis as { document?: unknown }).document = { createElement: (tag: string) => (tag === 'canvas' ? canvas : plain()) };
  return { painted, parent: parent as unknown as HTMLElement };
}

const realDocument = globalThis.document;
afterEach(() => void ((globalThis as { document?: unknown }).document = realDocument));

const frame: MinimapFrame = { x: 0, y: 0, z: 0, yaw: 0, mates: [{ x: 3, y: 0, z: 3, hit: false }], count: 1, hold: null, flag: null, exits: [], exitCount: 0, time: 1 };
/** Two players heard a moment ago, close by. */
const heard: HeardPlayer[] = [
  { sourceId: 4, kind: 'shot', x: 5, z: -5, radius: 3, at: 0.9 },
  { sourceId: 5, kind: 'step', x: -6, z: 4, radius: 3, at: 0.8 },
];

function draw(shown: boolean | null) {
  const dom = recordingDom();
  const minimap = new Minimap(dom.parent, [], MINE, THEIRS);
  minimap.setVisible(true);
  if (shown !== null) minimap.setHeardShown(shown);
  dom.painted.fills.length = 0;
  dom.painted.strokes.length = 0;
  minimap.update(frame, heard);
  return { ...dom.painted, minimap };
}
const theirs = (xs: string[]): number => xs.filter((s) => s === THEIRS).length;

describe('the minimap under Tournament and Pro CQB (M39 criterion 2)', () => {
  it('shows where the other team was heard by default, a patch for each', () => {
    const { fills, strokes } = draw(null);
    expect(theirs(strokes)).toBe(heard.length);
    expect(theirs(fills)).toBeGreaterThanOrEqual(heard.length);
  });

  it('draws no heard patch once setHeardShown(false), but still draws you and your teammate', () => {
    const shown = draw(true);
    const hidden = draw(false);
    expect(theirs(hidden.strokes)).toBe(0);
    expect(theirs(hidden.fills)).toBe(0);
    expect(hidden.fills.filter((s) => s !== THEIRS).length).toBeGreaterThan(0);
    // Everything that isn't the other team's patch is drawn just the same.
    expect(hidden.fills.filter((s) => s !== THEIRS)).toEqual(shown.fills.filter((s) => s !== THEIRS));
    expect(hidden.strokes.filter((s) => s !== THEIRS)).toEqual(shown.strokes.filter((s) => s !== THEIRS));
  });

  it('brings the patches back with setHeardShown(true)', () => {
    const dom = recordingDom();
    const minimap = new Minimap(dom.parent, [], MINE, THEIRS);
    minimap.setVisible(true);
    minimap.setHeardShown(false);
    minimap.update(frame, heard);
    expect(theirs(dom.painted.strokes)).toBe(0);
    minimap.setHeardShown(true);
    minimap.update(frame, heard);
    expect(theirs(dom.painted.strokes)).toBe(heard.length);
  });
});
