import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXIT_VISUALS as V } from '../config/render';
import { cssColor, TEAM_COLOUR_SETS } from '../config/teams';
import { Minimap, type MinimapFrame } from '../ui/minimap';
import { createRunState, type RunExit } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { ExitRenderer } from './exitRenderer';

/** QA for AX1: the colour set's exit colours reach the ring, the late repaint, the cones, the sign board and the minimap. */
const HC = TEAM_COLOUR_SETS.highContrast.exit;
const STD = TEAM_COLOUR_SETS.standard.exit;

const exit = (x: number, late = false): RunExit => ({ name: 'Gate', position: vec3(x, 0, 0), radius: 3, late, closed: false, open: !late }) as RunExit;
const key = (c: THREE.Color): string => [c.r, c.g, c.b].map((v) => v.toFixed(4)).join();

describe('ExitRenderer with the High Contrast exit colours (AX1)', () => {
  const fills: string[] = [];
  const strokes: string[] = [];
  beforeAll(() => {
    const g = new Proxy({} as Record<string, unknown>, {
      get: (t, p) => (p in t ? t[p as string] : () => undefined),
      set: (t, p, v) => {
        if (p === 'fillStyle') fills.push(String(v));
        if (p === 'strokeStyle') strokes.push(String(v));
        t[p as string] = v;
        return true;
      },
    });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('paints the floor, repaints a late exit in the set colour when it opens and back to grey when shut, and colours the cones', () => {
    fills.length = 0;
    strokes.length = 0;
    const run = createRunState();
    run.exits = [exit(-4), exit(4, true)];
    const r = new ExitRenderer(run, null, HC);
    const floor = r.object.getObjectByName('exit-floor') as THREE.Mesh;
    const colour = floor.geometry.getAttribute('color');
    const pos = floor.geometry.getAttribute('position');
    const shown = (x: number): Set<string> => {
      const s = new Set<string>();
      for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getX(v) - x) < 3.01) s.add([colour.getX(v), colour.getY(v), colour.getZ(v)].map((c) => c.toFixed(4)).join());
      return s;
    };
    r.update(run);
    const yellow = key(new THREE.Color(HC.open));
    const grey = key(new THREE.Color(V.shutColor));
    expect([...shown(-4)]).toEqual([yellow]);
    expect([...shown(4)]).toEqual([grey]);
    run.exits[1]!.open = true;
    r.update(run);
    expect([...shown(4)]).toEqual([yellow]);
    run.exits[1]!.open = false;
    r.update(run);
    expect([...shown(4)]).toEqual([grey]);
    // Cones: the set's cone colour, not the old orange.
    const cones = r.object.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh).map((m) => m.material as THREE.MeshStandardMaterial);
    expect(cones.some((m) => m.color?.getHex() === new THREE.Color(HC.cone).getHex())).toBe(true);
    expect(cones.some((m) => m.color?.getHex() === new THREE.Color(0xf08a24).getHex())).toBe(false);
    // The open board is drawn in the set's colour and ink; the shut board keeps white on grey.
    expect(fills).toContain(cssColor(HC.open));
    expect(strokes).toContain(cssColor(HC.ink));
    expect(fills).toContain(cssColor(HC.ink));
    expect(fills).toContain(cssColor(V.shutColor));
    expect(fills).toContain('#ffffff');
    r.dispose();
  });

  it('defaults to the Standard green and white', () => {
    fills.length = 0;
    const run = createRunState();
    run.exits = [exit(0)];
    const r = new ExitRenderer(run, null);
    expect(fills).toContain(cssColor(STD.open));
    expect(STD.open).toBe(0x3fcf6a);
    r.dispose();
  });
});

describe('the minimap draws open exits in the set colour (AX1)', () => {
  const real = globalThis.document;
  afterEach(() => void ((globalThis as { document?: unknown }).document = real));

  function run(colour?: number): string[] {
    const strokes: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, p) => (p in t ? t[p as string] : () => undefined),
      set: (t, p, v) => {
        if (p === 'strokeStyle') strokes.push(String(v));
        t[p as string] = v;
        return true;
      },
    });
    const el = (): Record<string, unknown> => ({ width: 0, height: 0, className: '', textContent: '', setAttribute() {}, append() {}, remove() {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 160 }) });
    (globalThis as { document?: unknown }).document = { createElement: el };
    const parent = { style: { setProperty() {}, getPropertyValue: () => '' }, classList: { toggle() {}, remove() {} }, appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } as unknown as HTMLElement;
    const m = colour === undefined ? new Minimap(parent, [], '#00f', '#f80') : new Minimap(parent, [], '#00f', '#f80', null, [], [], colour);
    m.setVisible(true);
    const f: MinimapFrame = { x: 0, y: 0, z: 0, yaw: 0, mates: [], count: 0, hold: null, flag: null, exits: [{ x: 5, z: 5, open: true }, { x: -5, z: 5, open: false }], exitCount: 2, time: 1 };
    m.update(f, []);
    return strokes;
  }

  it('uses the High Contrast yellow for an open door, grey for a shut one', () => {
    const s = run(HC.open);
    expect(s).toContain(cssColor(HC.open));
    expect(s).toContain(cssColor(V.shutColor));
    expect(s).not.toContain(cssColor(STD.open));
  });
  it('keeps the green by default', () => {
    expect(run()).toContain(cssColor(STD.open));
  });
});
