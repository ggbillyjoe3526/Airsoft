import { afterEach, describe, expect, it } from 'vitest';
import { MINIMAP } from '../config/minimap';
import { Minimap, type MinimapFrame } from './minimap';
import type { HeardPlayer } from './minimapView';

/**
 * G4 criterion 2: the minimap's canvas is drawn again only when something on it changed (where you stand or look, a
 * teammate, the hold spot, the flag, an exit, a heard patch still fading, its size), and its caption is written once.
 */
function fakeDom() {
  const ctx = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true });
  const made: { tag: string; el: Record<string, unknown> }[] = [];
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      let text = '';
      const el: Record<string, unknown> = {
        width: 0,
        height: 0,
        hidden: false,
        className: '',
        writes: 0,
        get textContent() {
          return text;
        },
        set textContent(v: string) {
          text = v;
          el.writes = (el.writes as number) + 1;
        },
        setAttribute: () => undefined,
        append: () => undefined,
        remove: () => undefined,
        getContext: () => ctx,
        getBoundingClientRect: () => ({ left: 16, top: 16, width: MINIMAP.size, height: MINIMAP.size }),
      };
      made.push({ tag, el });
      return el;
    },
  };
  const vars = new Map<string, string>();
  const parent = {
    style: { setProperty: (k: string, v: string) => void vars.set(k, v), getPropertyValue: (k: string) => vars.get(k) ?? '' },
    classList: { toggle: () => undefined, remove: () => undefined },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  return { made, vars, parent: parent as unknown as HTMLElement };
}

const realDocument = globalThis.document;
afterEach(() => void ((globalThis as { document?: unknown }).document = realDocument));

const frame = (): MinimapFrame => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  mates: [{ x: 3, y: 0, z: 3, hit: false }],
  count: 1,
  hold: null,
  flag: null,
  exits: [{ x: 9, z: 9, open: false }],
  exitCount: 1,
  time: 1,
});

function shown() {
  const dom = fakeDom();
  const minimap = new Minimap(dom.parent, [], '#00f', '#f80');
  minimap.setVisible(true);
  return { dom, minimap };
}

describe('the minimap draws only on a change (G4)', () => {
  it('draws the first frame, then nothing more while nothing on it moves', () => {
    const { minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    expect(minimap.draws).toBe(1);
    for (let i = 0; i < 30; i++) minimap.update(f, []);
    expect(minimap.draws).toBe(1);
    // The clock alone moving changes nothing drawn.
    f.time = 2;
    minimap.update(f, []);
    expect(minimap.draws).toBe(1);
  });

  it('draws again for each thing it shows that changed', () => {
    const { minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    const changes: [string, () => void][] = [
      ['you moved', () => (f.x = 1)],
      ['you turned', () => (f.yaw = 0.5)],
      ['a teammate moved', () => (f.mates[0]!.z = 4)],
      ['a teammate was hit', () => (f.mates[0]!.hit = true)],
      ['a teammate walked off the list', () => (f.count = 0)],
      ['a hold spot was set', () => (f.hold = { x: 2, z: 2 })],
      ['the flag shows', () => (f.flag = { x: -2, z: 5 })],
      ['an exit opened', () => (f.exits[0]!.open = true)],
    ];
    let draws = minimap.draws;
    for (const [what, change] of changes) {
      change();
      minimap.update(f, []);
      expect(minimap.draws, what).toBe(++draws);
      minimap.update(f, []);
      expect(minimap.draws, `${what}, then still`).toBe(draws);
    }
  });

  it('redraws a heard patch while it fades, and stops once it has gone', () => {
    const { minimap } = shown();
    const f = frame();
    const heard: HeardPlayer[] = [{ sourceId: 4, kind: 'shot', x: 5, z: -5, radius: 3, at: 1 }];
    minimap.update(f, heard);
    expect(minimap.draws).toBe(1);
    // Fresh: steady until it starts to fade.
    f.time = 1 + (MINIMAP.noiseLife - MINIMAP.noiseFade) / 2;
    minimap.update(f, heard);
    expect(minimap.draws).toBe(1);
    // Fading: each step of it is drawn.
    f.time = 1 + MINIMAP.noiseLife - MINIMAP.noiseFade / 2;
    minimap.update(f, heard);
    expect(minimap.draws).toBe(2);
    f.time += 0.1;
    minimap.update(f, heard);
    expect(minimap.draws).toBe(3);
    // Gone: one last draw without it, then quiet.
    f.time = 1 + MINIMAP.noiseLife + 1;
    minimap.update(f, heard);
    minimap.update(f, heard);
    f.time += 1;
    minimap.update(f, heard);
    expect(minimap.draws).toBe(4);
  });

  it('draws afresh once shown again, or with the heard patches turned off, and never while hidden', () => {
    const { minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    minimap.setVisible(false);
    f.x = 5;
    minimap.update(f, []);
    expect(minimap.draws).toBe(1);
    minimap.setVisible(true);
    minimap.update(f, []);
    expect(minimap.draws).toBe(2);
    minimap.setHeardShown(false);
    minimap.update(f, []);
    expect(minimap.draws).toBe(3);
  });

  it('writes its caption only when it changes', () => {
    const { dom, minimap } = shown();
    const caption = dom.made.find((m) => m.tag === 'p')!.el;
    minimap.setCaption('Depot · Round 1');
    minimap.setCaption('Depot · Round 1');
    expect(caption.textContent).toBe('Depot · Round 1');
    expect(caption.writes).toBe(1);
    minimap.setCaption('Depot · Round 2');
    expect(caption.writes).toBe(2);
  });
});
