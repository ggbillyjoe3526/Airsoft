import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../../config/characters';
import { createRng, rngNext } from '../../sim/rng';
import { CAMO_ATTRIBUTE, camoTone, SLEEVE_CAMO_SEED, useSleeveCamo } from '../figures/figureCamo';
import { useVertexFinish } from '../figures/figureFinish';
import { figureTwin } from './figureNodes';

/**
 * G11 QA, acceptance 3, kept through W6b (the camo GLSL is gone): the node graph the twin builds gives the colour of the
 * plain-TypeScript camoTone. No GPU is needed: the node graph is walked on the CPU, handed a part position, a pattern
 * seed and a screen-space change (fwidth). The pictures themselves are pipeline/webgpu-compare.mjs's.
 */

beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

type V = number | number[];

const lift2 = (f: (a: number, b: number) => number) => (a: V, b: V): V =>
  Array.isArray(a) ? (Array.isArray(b) ? a.map((x, i) => f(x, b[i]!)) : a.map((x) => f(x, b))) : Array.isArray(b) ? b.map((y) => f(a, y)) : f(a, b);
const map1 = (f: (a: number) => number) => (a: V): V => (Array.isArray(a) ? a.map(f) : f(a));
const scalar = (v: V): number => {
  if (Array.isArray(v)) throw new Error('scalar expected');
  return v;
};
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mixNum = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

// ---- The node graph on the CPU. ----

interface Inputs {
  position: number[];
  camo: number;
  color: number[];
  fwidth: (n: number) => number;
}

/* `any` in this file: TSL's node classes are untyped here. */
function evalNode(n: any, inp: Inputs, memo = new Map<any, V>()): V {
  const known = memo.get(n);
  if (known !== undefined) return known;
  const ev = (x: any): V => evalNode(x, inp, memo);
  let v: V;
  if (n.isVarNode) v = ev(n.node);
  else if (n.isConstNode) v = n.value as number;
  else if (n.constructor.name === 'MaterialNode') {
    if (n.scope !== 'color') throw new Error(`material ${n.scope}`);
    v = inp.color;
  } else if (n.constructor.name === 'AttributeNode') {
    if (n._attributeName === 'position') v = inp.position;
    else if (n._attributeName === CAMO_ATTRIBUTE) v = inp.camo;
    else throw new Error(`attribute ${n._attributeName}`);
  } else if (n.isSplitNode) {
    const src = ev(n.node) as number[];
    const comps = [...(n.components as string)].map((c) => 'xyzw'.indexOf(c));
    v = comps.length === 1 ? src[comps[0]!]! : comps.map((c) => src[c]!);
  } else if (n.isOperatorNode) {
    const f = { '+': (a: number, b: number) => a + b, '-': (a: number, b: number) => a - b, '*': (a: number, b: number) => a * b, '/': (a: number, b: number) => a / b }[n.op as '+'];
    if (!f) throw new Error(`operator ${n.op}`);
    v = lift2(f)(ev(n.aNode), ev(n.bNode));
  } else if (n.isMathNode) {
    switch (n.method) {
      case 'sin':
        v = map1(Math.sin)(ev(n.aNode));
        break;
      case 'negate':
        v = map1((a) => -a)(ev(n.aNode));
        break;
      case 'max':
        v = lift2(Math.max)(ev(n.aNode), ev(n.bNode));
        break;
      case 'fwidth':
        v = inp.fwidth(scalar(ev(n.aNode)));
        break;
      case 'step':
        v = scalar(ev(n.bNode)) < scalar(ev(n.aNode)) ? 0 : 1;
        break;
      case 'smoothstep':
        v = smooth(scalar(ev(n.aNode)), scalar(ev(n.bNode)), scalar(ev(n.cNode)));
        break;
      case 'mix':
        v = mixNum(scalar(ev(n.aNode)), scalar(ev(n.bNode)), scalar(ev(n.cNode)));
        break;
      default:
        throw new Error(`math ${n.method}`);
    }
  } else throw new Error(`node ${n.constructor.name}`);
  memo.set(n, v);
  return v;
}

// ---- The comparison. ----

const COLOR = [0.31, 0.38, 0.27];
const SEEDS = [0, 1, 2, 5, 8, 14, 22, 30, 42];

function points(n: number, scale = 1): { p: number[]; seed: number }[] {
  const rng = createRng(1109);
  return Array.from({ length: n }, (_, i) => ({
    p: [(rngNext(rng) - 0.5) * 0.8 * scale, rngNext(rng) * 1.8 * scale, (rngNext(rng) - 0.5) * 0.4 * scale],
    seed: SEEDS[i % SEEDS.length]!,
  }));
}

const figureMaterial = (): THREE.MeshStandardMaterial => useVertexFinish(new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 1, 1) }));
const sleeveMaterial = (): THREE.MeshStandardMaterial => useSleeveCamo(new THREE.MeshStandardMaterial());

/** The node twin's colour for one input. */
function nodeColour(twinOf: THREE.MeshStandardMaterial, p: number[], seed: number, fw: number): number[] {
  const twin = figureTwin(twinOf)!;
  return evalNode(twin.colorNode, { position: p, camo: seed, color: COLOR, fwidth: () => fw }) as number[];
}

describe('the camo node twin gives the plain-TypeScript tones (G11 acceptance 3; the GLSL is gone since W6b)', { timeout: 60_000 }, () => {
  it('the detailed figure: at hard edges the twin is camoTone times the colour, away from edges; no pattern leaves the colour alone', () => {
    const twinOf = figureMaterial();
    const all = points(2000);
    let agree = 0;
    let counted = 0;
    const seen = new Set<number>();
    for (const { p, seed } of all) {
      const node = nodeColour(twinOf, p, seed, 0);
      if (seed === 0) {
        for (let k = 0; k < 3; k++) expect(node[k]).toBe(COLOR[k]);
        continue;
      }
      counted++;
      const ts = camoTone(p[0]!, p[1]!, p[2]!, seed);
      if (Math.abs(node[0]! / COLOR[0]! - ts) < 1e-6 && Math.abs(node[2]! / COLOR[2]! - ts) < 1e-6) agree++;
      seen.add(Math.round((node[0]! / COLOR[0]!) * 1000));
    }
    // Only the 2e-4-wide blend at each edge (e = 1e-4 with no screen change) can differ.
    expect(agree / counted).toBeGreaterThan(0.995);
    // Not a vacuous pass: the pattern prints its three tones (dark, plain and light).
    expect(seen.has(Math.round(FIGURE.camo.dark * 1000))).toBe(true);
    expect(seen.has(Math.round(FIGURE.camo.light * 1000))).toBe(true);
    expect(seen.has(1000)).toBe(true);
  });

  it('a pixel whose pattern changes fast over the screen blends toward plain, and stays between the tones', () => {
    const twinOf = figureMaterial();
    let blended = 0;
    for (const { p, seed } of points(300)) {
      if (seed === 0) continue;
      const crisp = nodeColour(twinOf, p, seed, 0)[0]! / COLOR[0]!;
      const far = nodeColour(twinOf, p, seed, 0.35)[0]! / COLOR[0]!;
      expect(far).toBeGreaterThanOrEqual(Math.min(FIGURE.camo.dark, 1) - 1e-9);
      expect(far).toBeLessThanOrEqual(Math.max(FIGURE.camo.light, 1) + 1e-9);
      if (Math.abs(far - crisp) > 1e-6) blended++;
    }
    expect(blended).toBeGreaterThan(0);
  });

  it('the sleeves: the twin gives camoTone of the sleeve position (at FIGURE.camo.sleeve of the figures size) at the one sleeve pattern, away from edges', () => {
    const twinOf = sleeveMaterial();
    const tones = new Set<number>();
    let agree = 0;
    const all = points(600, 0.25);
    for (const { p } of all) {
      const node = nodeColour(twinOf, p, SLEEVE_CAMO_SEED, 0);
      tones.add(Math.round((node[0]! / COLOR[0]!) * 1000));
      if (Math.abs(node[0]! / COLOR[0]! - camoTone(p[0]! / FIGURE.camo.sleeve, p[1]! / FIGURE.camo.sleeve, p[2]! / FIGURE.camo.sleeve, SLEEVE_CAMO_SEED)) < 1e-6) agree++;
    }
    expect(tones.size).toBeGreaterThan(2);
    expect(agree / all.length).toBeGreaterThan(0.995);
  });

  it('read FIGURE.camo as data: change it and the twin follows camoTone, on a different pattern', () => {
    const camo = FIGURE.camo as unknown as Record<string, number>;
    const before = { ...camo };
    const probe = (): number => {
      const fig = figureMaterial();
      const sleeve = sleeveMaterial();
      let sum = 0;
      for (const { p, seed } of points(400)) sum += nodeColour(fig, p, seed + 1, 0)[0]! + nodeColour(sleeve, p, SLEEVE_CAMO_SEED, 0)[0]!;
      return sum;
    };
    const matches = (): number => {
      const fig = figureMaterial();
      let n = 0;
      const all = points(400);
      for (const { p, seed } of all) if (Math.abs(nodeColour(fig, p, seed + 1, 0)[0]! / COLOR[0]! - camoTone(p[0]!, p[1]!, p[2]!, seed + 1)) < 1e-6) n++;
      return n / all.length;
    };
    try {
      const was = probe();
      expect(matches()).toBeGreaterThan(0.99);
      Object.assign(camo, { dark: 0.5, light: 2.2, darkAt: 0.3, lightAt: -0.4, scale: 0.1, warp: 0.3, sleeve: 0.5 });
      const now = probe();
      expect(matches()).toBeGreaterThan(0.99);
      expect(Math.abs(now - was)).toBeGreaterThan(1);
    } finally {
      Object.assign(camo, before);
    }
  });
});
