import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../../config/characters';
import { createRng, rngNext } from '../../sim/rng';
import { CAMO_ATTRIBUTE, camoTone, SLEEVE_CAMO_SEED, useSleeveCamo } from '../figureCamo';
import { useVertexFinish } from '../figureFinish';
import { figureTwin } from './figureNodes';

/**
 * G11 QA, acceptance 3 ("every WebGL change has its WebGPU node twin"): the camo's two implementations, the GLSL the
 * patched materials hand Three and the node graph the twin builds, give the same colour for the same inputs. No GPU is
 * needed: the GLSL the material ships is read by a small interpreter, the node graph is walked on the CPU, and both are
 * handed the same part position, pattern seed and screen-space change (fwidth). The pictures themselves are
 * pipeline/webgpu-compare.mjs's.
 */

beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

type V = number | number[];

// ---- A small interpreter for the GLSL subset the camo uses: float / vec3 / vec4 values, + - * /, calls, swizzles. ----

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([A-Za-z_]\w*)|(\+=|[-+*/(),.;=]))/y;
function tokenize(src: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) {
      if (src.slice(at).trim() === '') break;
      throw new Error(`GLSL token at: ${src.slice(at, at + 20)}`);
    }
    out.push((m[1] ?? m[2] ?? m[3])!);
  }
  return out;
}

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

type Fn = (env: Map<string, V>) => V;
interface Glsl {
  fwidth: (n: number) => number;
  functions: Map<string, { params: string[]; run: (args: V[]) => V }>;
}

class Parser {
  private readonly t: string[];
  private i = 0;
  constructor(
    src: string,
    private readonly g: Glsl,
  ) {
    this.t = tokenize(src);
  }
  done(): boolean {
    return this.i >= this.t.length;
  }
  peek(): string | undefined {
    return this.t[this.i];
  }
  next(): string {
    return this.t[this.i++]!;
  }
  eat(s: string): void {
    if (this.next() !== s) throw new Error(`GLSL: expected ${s} before ${this.t.slice(this.i - 1, this.i + 5).join(' ')}`);
  }
  expr(): Fn {
    let l = this.mul();
    while (this.peek() === '+' || this.peek() === '-') {
      const add = this.next() === '+';
      const r = this.mul();
      const L = l;
      l = (env) => lift2(add ? (a, b) => a + b : (a, b) => a - b)(L(env), r(env));
    }
    return l;
  }
  private mul(): Fn {
    let l = this.unary();
    while (this.peek() === '*' || this.peek() === '/') {
      const times = this.next() === '*';
      const r = this.unary();
      const L = l;
      l = (env) => lift2(times ? (a, b) => a * b : (a, b) => a / b)(L(env), r(env));
    }
    return l;
  }
  private unary(): Fn {
    if (this.peek() === '-') {
      this.next();
      const e = this.unary();
      return (env) => map1((a) => -a)(e(env));
    }
    return this.postfix();
  }
  private postfix(): Fn {
    let e = this.primary();
    while (this.peek() === '.' && /^[xyzw]+$/.test(this.t[this.i + 1] ?? '')) {
      this.next();
      const comps = [...this.next()].map((c) => 'xyzw'.indexOf(c));
      const E = e;
      e = (env) => {
        const v = E(env) as number[];
        return comps.length === 1 ? v[comps[0]!]! : comps.map((c) => v[c]!);
      };
    }
    return e;
  }
  private primary(): Fn {
    const tok = this.next();
    if (/^[\d.]/.test(tok)) return () => Number(tok);
    if (tok === '(') {
      const e = this.expr();
      this.eat(')');
      return e;
    }
    if (this.peek() !== '(') return (env) => env.get(tok) ?? (() => { throw new Error(`GLSL: ${tok} is not set`); })();
    this.next();
    const args: Fn[] = [];
    while (this.peek() !== ')') {
      args.push(this.expr());
      if (this.peek() === ',') this.next();
    }
    this.eat(')');
    return (env) => this.call(tok, args.map((a) => a(env)));
  }
  private call(name: string, a: V[]): V {
    switch (name) {
      case 'sin':
        return map1(Math.sin)(a[0]!);
      case 'dot':
        return (a[0] as number[]).reduce((s, x, i) => s + x * (a[1] as number[])[i]!, 0);
      case 'vec3':
        return a.length === 1 ? [scalar(a[0]!), scalar(a[0]!), scalar(a[0]!)] : a.flat();
      case 'mix':
        return mixNum(scalar(a[0]!), scalar(a[1]!), scalar(a[2]!));
      case 'smoothstep':
        return smooth(scalar(a[0]!), scalar(a[1]!), scalar(a[2]!));
      case 'step':
        return scalar(a[1]!) < scalar(a[0]!) ? 0 : 1;
      case 'max':
        return Math.max(scalar(a[0]!), scalar(a[1]!));
      case 'fwidth':
        return this.g.fwidth(scalar(a[0]!));
      default: {
        const f = this.g.functions.get(name);
        if (!f) throw new Error(`GLSL: unknown function ${name}`);
        return f.run(a);
      }
    }
  }
  /** One function body's statements (declarations, `+=` and `return`), run in order. */
  body(): (env: Map<string, V>) => V {
    const steps: ((env: Map<string, V>) => V | undefined)[] = [];
    while (!this.done()) {
      const first = this.next();
      if (first === 'return') {
        const e = this.expr();
        this.eat(';');
        steps.push((env) => e(env));
      } else if (first === 'float' || first === 'vec3' || first === 'vec4') {
        do {
          if (this.peek() === ',') this.next();
          const name = this.next();
          this.eat('=');
          const e = this.expr();
          steps.push((env) => void env.set(name, e(env)));
        } while (this.peek() === ',');
        this.eat(';');
      } else {
        const op = this.next();
        const e = this.expr();
        this.eat(';');
        steps.push((env) => void env.set(first, op === '+=' ? lift2((x, y) => x + y)(env.get(first)!, e(env)) : e(env)));
      }
    }
    return (env) => {
      for (const s of steps) {
        const r = s(env);
        if (r !== undefined) return r;
      }
      throw new Error('GLSL: no return');
    };
  }
}

/** A shader's `float camoTone(vec3 p,float s){...}` made callable, and an interpreter for one expression of its main. */
function glslOf(fragmentShader: string, fwidth: (n: number) => number): { expression: (src: string, vars: Record<string, V>) => V } {
  const m = /float camoTone\(vec3 p,float s\)\{([^}]*)\}/.exec(fragmentShader);
  if (!m) throw new Error('the patched fragment shader has no camoTone');
  const g: Glsl = { fwidth, functions: new Map() };
  const run = new Parser(m[1]!, g).body();
  g.functions.set('camoTone', { params: ['p', 's'], run: ([p, s]) => run(new Map<string, V>([['p', p!], ['s', s!]])) });
  return { expression: (src, vars) => new Parser(src, g).expr()(new Map(Object.entries(vars))) };
}

// ---- The node graph on the CPU. ----

interface Inputs {
  position: number[];
  camo: number;
  color: number[];
  fwidth: (n: number) => number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node classes are untyped here. */
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
/** How much a pixel's pattern changes over the screen: nothing (a crisp edge), a little, a lot (far away). */
const FWIDTHS = [0, 0.02, 0.35];
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

function fragmentOf(material: THREE.Material): string {
  const shader = { uniforms: {}, defines: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader.fragmentShader;
}

/** The colour multiplier line the patch adds after the colour, as GLSL text: what is right of `diffuseColor.rgb*=`. */
function multiplierOf(fragment: string): string {
  const m = /diffuseColor\.rgb\*=([^;]*);/.exec(fragment);
  if (!m) throw new Error('the patch multiplies no colour');
  return m[1]!;
}

/** Colours the GLSL gives (its multiplier on COLOR) and the node twin gives, for the same inputs. */
function bothColours(material: THREE.MeshStandardMaterial, twinOf: THREE.MeshStandardMaterial, vars: (p: number[], seed: number) => Record<string, V>, fw: number, p: number[], seed: number): { glsl: number[]; node: number[] } {
  const fwidth = () => fw;
  const gl = glslOf(fragmentOf(material), fwidth).expression(multiplierOf(fragmentOf(material)), vars(p, seed));
  const twin = figureTwin(twinOf)!;
  const node = evalNode(twin.colorNode, { position: p, camo: seed, color: COLOR, fwidth }) as number[];
  return { glsl: COLOR.map((c) => c * scalar(gl)), node };
}

describe('the camo in GLSL and in its node twin gives one colour for one input (G11 acceptance 3)', { timeout: 60_000 }, () => {
  it('the detailed figure: same colour at 400 part positions, 9 patterns, crisp and blended edges; no pattern leaves the colour alone', () => {
    const material = figureMaterial();
    const twinOf = figureMaterial();
    const seen = new Set<number>();
    for (const fw of FWIDTHS) {
      for (const { p, seed } of points(400)) {
        const { glsl, node } = bothColours(material, twinOf, (pp, s) => ({ vCamo: [...pp, s] }), fw, p, seed);
        for (let k = 0; k < 3; k++) expect(node[k], `fwidth ${fw} seed ${seed} at ${p}`).toBeCloseTo(glsl[k]!, 9);
        if (seed === 0) for (let k = 0; k < 3; k++) expect(node[k]).toBe(COLOR[k]);
        else if (fw === 0) seen.add(Math.round((glsl[0]! / COLOR[0]!) * 1000));
      }
    }
    // Not a vacuous pass: the pattern prints its three tones (dark, plain and light) and the blends between.
    expect(seen.has(Math.round(FIGURE.camo.dark * 1000))).toBe(true);
    expect(seen.has(Math.round(FIGURE.camo.light * 1000))).toBe(true);
    expect(seen.has(1000)).toBe(true);
  });

  it('the sleeves: same colour at 300 positions on the sleeve’s smaller scale, with the one sleeve pattern', () => {
    const material = sleeveMaterial();
    const twinOf = sleeveMaterial();
    const tones = new Set<number>();
    for (const fw of FWIDTHS) {
      for (const { p } of points(300, 0.25)) {
        const { glsl, node } = bothColours(material, twinOf, (pp) => ({ vCamoPos: pp }), fw, p, SLEEVE_CAMO_SEED);
        for (let k = 0; k < 3; k++) expect(node[k], `fwidth ${fw} at ${p}`).toBeCloseTo(glsl[k]!, 9);
        if (fw === 0) tones.add(Math.round((node[0]! / COLOR[0]!) * 1000));
      }
    }
    expect(tones.size).toBeGreaterThan(2);
  });

  it('both agree with the plain-TypeScript tones (camoTone, hard edges) wherever a point is not on an edge', () => {
    const material = figureMaterial();
    let agree = 0;
    const all = points(2000);
    const gl = glslOf(fragmentOf(material), () => 0);
    for (const { p, seed } of all) {
      if (seed === 0) continue;
      const ts = camoTone(p[0]!, p[1]!, p[2]!, seed);
      const shader = scalar(gl.expression(multiplierOf(fragmentOf(material)), { vCamo: [...p, seed] }));
      if (Math.abs(ts - shader) < 1e-6) agree++;
    }
    const counted = all.filter((x) => x.seed !== 0).length;
    // Only the 2e-4-wide blend at each edge (e = 1e-4 with no screen change) can differ.
    expect(agree / counted).toBeGreaterThan(0.995);
  });

  it('read FIGURE.camo as data: change it and the GLSL and the twin still agree, on a different pattern', () => {
    const camo = FIGURE.camo as unknown as Record<string, number>;
    const before = { ...camo };
    const probe = (): { colour: number; agree: boolean } => {
      const material = figureMaterial();
      const sleeve = sleeveMaterial();
      let agree = true;
      let sum = 0;
      for (const { p, seed } of points(120)) {
        const a = bothColours(material, figureMaterial(), (pp, s) => ({ vCamo: [...pp, s] }), 0.02, p, seed + 1);
        const b = bothColours(sleeve, sleeveMaterial(), (pp) => ({ vCamoPos: pp }), 0.02, p, SLEEVE_CAMO_SEED);
        for (let k = 0; k < 3; k++) agree &&= Math.abs(a.node[k]! - a.glsl[k]!) < 1e-9 && Math.abs(b.node[k]! - b.glsl[k]!) < 1e-9;
        sum += a.node[0]! + b.node[0]!;
      }
      return { colour: sum, agree };
    };
    try {
      const was = probe();
      expect(was.agree).toBe(true);
      Object.assign(camo, { dark: 0.5, light: 2.2, darkAt: 0.3, lightAt: -0.4, scale: 0.1, warp: 0.3, sleeve: 0.5 });
      const now = probe();
      expect(now.agree).toBe(true);
      expect(Math.abs(now.colour - was.colour)).toBeGreaterThan(1);
    } finally {
      Object.assign(camo, before);
    }
  });
});
