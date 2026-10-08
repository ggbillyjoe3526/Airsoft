import * as THREE from 'three';
import { NEON } from '../config/dressing';
import type { MapBlock, NeonSign } from '../map/mapTypes';

/**
 * Neon signs (G9, MapDressing.neon): tube letters or an emblem on a dark plate mounted flush on a wall (mountNeon),
 * built into the junk mesh (render/dressingMeshes.ts; no draw call of its own). The tubes glow through the junk
 * material's `glow` attribute; a flickering sign's tubes carry its channel in a `flick` attribute, and the material
 * multiplies their glow by that channel's level (neonFlickerLevels, set each frame by render/dressingEffects.ts; 1 under
 * Reduced motion). Look only: a sign is a few centimetres deep, flat on its wall.
 */

/** A stroke: points in the letter's box (x across, 0..1 of its width; y up, 0..1 of its height). */
type Stroke = readonly (readonly [number, number])[];

/** The tube alphabet: block capitals and digits, bent from straight tubes as a sign maker would (no brands). */
const LETTERS: Readonly<Record<string, readonly Stroke[]>> = {
  C: [[[1, 0.85], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0], [0.75, 0], [1, 0.15]]],
  F: [[[1, 1], [0, 1], [0, 0]], [[0, 0.52], [0.72, 0.52]]],
  G: [[[1, 0.85], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0], [0.75, 0], [1, 0.2], [1, 0.45], [0.55, 0.45]]],
  J: [[[1, 1], [1, 0.22], [0.78, 0], [0.22, 0], [0, 0.22]]],
  M: [[[0, 0], [0, 1], [0.5, 0.45], [1, 1], [1, 0]]],
  Q: [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]], [[0.65, 0.3], [1.05, -0.08]]],
  V: [[[0, 1], [0.5, 0], [1, 1]]],
  W: [[[0, 1], [0.22, 0], [0.5, 0.6], [0.78, 0], [1, 1]]],
  X: [[[0, 1], [1, 0]], [[0, 0], [1, 1]]],
  Z: [[[0, 1], [1, 1], [0, 0], [1, 0]]],
  '0': [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]]],
  '1': [[[0.2, 0.8], [0.55, 1], [0.55, 0]], [[0.2, 0], [0.9, 0]]],
  '3': [[[0, 0.9], [0.2, 1], [0.8, 1], [1, 0.82], [0.75, 0.52], [1, 0.22], [0.8, 0], [0.2, 0], [0, 0.1]], [[0.4, 0.52], [0.75, 0.52]]],
  '5': [[[1, 1], [0, 1], [0, 0.55], [0.75, 0.55], [1, 0.38], [1, 0.18], [0.75, 0], [0.2, 0], [0, 0.12]]],
  '6': [[[1, 0.85], [0.75, 1], [0.25, 1], [0, 0.72], [0, 0.22], [0.25, 0], [0.75, 0], [1, 0.22], [1, 0.38], [0.75, 0.56], [0.1, 0.56]]],
  '7': [[[0, 1], [1, 1], [0.35, 0]]],
  '8': [[[0.25, 0.52], [0.75, 0.52], [1, 0.72], [1, 0.84], [0.75, 1], [0.25, 1], [0, 0.84], [0, 0.72], [0.25, 0.52], [0, 0.26], [0, 0.16], [0.25, 0], [0.75, 0], [1, 0.16], [1, 0.26], [0.75, 0.52]]],
  '9': [[[0, 0.15], [0.25, 0], [0.75, 0], [1, 0.28], [1, 0.78], [0.75, 1], [0.25, 1], [0, 0.78], [0, 0.62], [0.25, 0.44], [0.9, 0.44]]],
  A: [[[0, 0], [0, 0.7], [0.3, 1], [0.7, 1], [1, 0.7], [1, 0]], [[0, 0.45], [1, 0.45]]],
  B: [[[0, 0], [0, 1], [0.75, 1], [0.95, 0.85], [0.95, 0.66], [0.75, 0.52], [0, 0.52]], [[0.75, 0.52], [1, 0.36], [1, 0.16], [0.8, 0], [0, 0]]],
  D: [[[0, 0], [0, 1], [0.65, 1], [1, 0.7], [1, 0.3], [0.65, 0], [0, 0]]],
  E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.5], [0.72, 0.5]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  I: [[[0.5, 0], [0.5, 1]]],
  K: [[[0, 0], [0, 1]], [[1, 1], [0, 0.45], [1, 0]]],
  L: [[[0, 1], [0, 0], [1, 0]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  O: [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]]],
  P: [[[0, 0], [0, 1], [0.8, 1], [1, 0.82], [1, 0.62], [0.8, 0.45], [0, 0.45]]],
  R: [[[0, 0], [0, 1], [0.8, 1], [1, 0.82], [1, 0.64], [0.8, 0.48], [0, 0.48]], [[0.45, 0.48], [1, 0]]],
  S: [[[1, 0.85], [0.8, 1], [0.2, 1], [0, 0.8], [0, 0.62], [0.2, 0.5], [0.8, 0.5], [1, 0.38], [1, 0.2], [0.8, 0], [0.2, 0], [0, 0.15]]],
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  U: [[[0, 1], [0, 0.22], [0.22, 0], [0.78, 0], [1, 0.22], [1, 1]]],
  Y: [[[0, 1], [0.5, 0.5], [1, 1]], [[0.5, 0.5], [0.5, 0]]],
  '2': [[[0, 0.8], [0.2, 1], [0.8, 1], [1, 0.8], [1, 0.62], [0, 0], [1, 0]]],
  '4': [[[0.75, 0], [0.75, 1], [0, 0.32], [1, 0.32]]],
};

/** The emblems: a noodle bowl with chopsticks, an arrow, a cocktail glass; their width in units of their height. */
const EMBLEMS: Readonly<Record<NonNullable<NeonSign['emblem']>, { width: number; strokes: readonly Stroke[] }>> = {
  bowl: {
    width: 1.3,
    strokes: [
      [[0, 0.5], [1, 0.5]],
      [[0, 0.5], [0.08, 0.28], [0.25, 0.1], [0.75, 0.1], [0.92, 0.28], [1, 0.5]],
      [[0.36, 0], [0.64, 0]],
      [[0.5, 0.62], [0.95, 1]],
      [[0.6, 0.58], [1, 0.9]],
    ],
  },
  arrow: { width: 1.6, strokes: [[[0, 0.5], [1, 0.5]], [[0.72, 0.85], [1, 0.5], [0.72, 0.15]]] },
  cup: { width: 0.9, strokes: [[[0, 1], [1, 1], [0.5, 0.42], [0, 1]], [[0.5, 0.42], [0.5, 0.06]], [[0.2, 0], [0.8, 0]]] },
};

/** Whether every letter of `text` is in the tube alphabet (spaces allowed). */
export const neonSpellable = (text: string): boolean => [...text].every((c) => c === ' ' || c in LETTERS);

/** A sign's strokes laid out in its own plane (x right, y up, metres, centred on its middle) and its size. */
export function neonLayout(s: Pick<NeonSign, 'text' | 'emblem' | 'size'>): { strokes: [number, number][][]; width: number; height: number } {
  const h = s.size;
  const strokes: [number, number][][] = [];
  if (s.emblem) {
    const e = EMBLEMS[s.emblem];
    const w = e.width * h;
    for (const st of e.strokes) strokes.push(st.map(([x, y]) => [(x - 0.5) * w, (y - 0.5) * h]));
    return { strokes, width: w, height: h };
  }
  const text = s.text ?? '';
  const cell = NEON.cell * h;
  const gap = NEON.gap * h;
  const width = text.length * cell + Math.max(0, text.length - 1) * gap;
  [...text].forEach((c, i) => {
    const x0 = -width / 2 + i * (cell + gap);
    for (const st of LETTERS[c] ?? []) strokes.push(st.map(([x, y]) => [x0 + x * cell, (y - 0.5) * h]));
  });
  return { strokes, width, height: h };
}

/** The sign's plate: the strokes' extent with a margin, in its plane (width, height). */
export function neonPlate(s: Pick<NeonSign, 'text' | 'emblem' | 'size'>): [number, number] {
  const { width, height } = neonLayout(s);
  return [width + 0.5 * s.size, height + 0.45 * s.size];
}

const NORMALS: Record<NeonSign['facing'], [number, number, number]> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
/** The wall's "right" seen from in front, per facing. */
const RIGHTS: Record<NeonSign['facing'], [number, number, number]> = { '+x': [0, 0, -1], '-x': [0, 0, 1], '+z': [1, 0, 0], '-z': [-1, 0, 0] };

const basis = new THREE.Matrix4();
const right = new THREE.Vector3();
const normal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A sign's parts in the world: the plate (painted NEON.plate) and each tube segment (its colour, glowing). `paint` makes
 * a part as the junk's are (render/dressingMeshes.ts part); the tubes' `glow` is set to NEON.glow and their `flick` to
 * the sign's channel by the caller (`tube` marks them).
 */
export function neonParts(s: NeonSign): { geo: THREE.BufferGeometry; colour: number | string; tube: boolean }[] {
  const out: { geo: THREE.BufferGeometry; colour: number | string; tube: boolean }[] = [];
  const n = NORMALS[s.facing];
  const r = RIGHTS[s.facing];
  right.set(r[0], r[1], r[2]);
  normal.set(n[0], n[1], n[2]);
  // Own frame: x right, y up, z out of the wall; its origin on the wall at the sign's middle.
  basis.makeBasis(right, UP, normal).setPosition(s.centre.x, s.centre.y, s.centre.z);
  const [pw, ph] = neonPlate(s);
  const plateZ = NEON.standoff + NEON.plateDepth / 2;
  out.push({ geo: new THREE.BoxGeometry(pw, ph, NEON.plateDepth).translate(0, 0, plateZ).applyMatrix4(basis), colour: NEON.plate, tube: false });
  const tubeZ = NEON.standoff + NEON.plateDepth + NEON.tube / 2;
  const t = NEON.tube;
  for (const stroke of neonLayout(s).strokes) {
    for (let i = 0; i + 1 < stroke.length; i++) {
      const [ax, ay] = stroke[i]!;
      const [bx, by] = stroke[i + 1]!;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      // A square tube along the segment, a tube's width longer so neighbouring segments meet at the corners.
      const g = new THREE.BoxGeometry(len + t, t, t)
        .rotateZ(Math.atan2(by - ay, bx - ax))
        .translate((ax + bx) / 2, (ay + by) / 2, tubeZ)
        .applyMatrix4(basis);
      out.push({ geo: g, colour: s.colour, tube: true });
    }
  }
  return out;
}

const AXIS: Record<NeonSign['facing'], { axis: 'x' | 'z'; along: 'x' | 'z'; sign: 1 | -1 }> = {
  '+x': { axis: 'x', along: 'z', sign: 1 },
  '-x': { axis: 'x', along: 'z', sign: -1 },
  '+z': { axis: 'z', along: 'x', sign: 1 },
  '-z': { axis: 'z', along: 'x', sign: -1 },
};
const lo = (b: MapBlock, k: 'x' | 'y' | 'z'): number => b.center[k] - b.size[k] / 2;
const hi = (b: MapBlock, k: 'x' | 'y' | 'z'): number => b.center[k] + b.size[k] / 2;
/** Points across a plate (a 5 × 5 grid, its edges a millimetre in) that a wall face must back. */
const PLATE_GRID = [-0.5, -0.25, 0, 0.25, 0.5].map((u) => u * 0.998);

/**
 * The signs mounted on their walls (G9): each sign's middle is moved onto the face of the wall behind it, the nearest
 * face plane within NEON.mount m (or a few centimetres in front of the middle given) whose blocks back every point of
 * the plate and none of whose blocks stand in front of the plate. A sign no face backs whole (over an opening, off a
 * wall's end, across a coping) is left out, so nothing ever hangs in the air; map/neonHeightsDressing.test.ts checks
 * every sign a map gives is mounted.
 */
export function mountNeon(blocks: readonly MapBlock[], signs: readonly NeonSign[]): NeonSign[] {
  const solid = blocks.filter((b) => b.kind !== 'floor' && b.kind !== 'ramp');
  const out: NeonSign[] = [];
  for (const s of signs) {
    const { axis, along, sign } = AXIS[s.facing];
    const [w, h] = neonPlate(s);
    const c = s.centre;
    const depth = NEON.standoff + NEON.plateDepth + NEON.tube;
    // Every face plane on the facing side, behind the sign (or just in front of it), nearest first.
    const planes = [...new Set(solid.map((b) => (sign > 0 ? hi(b, axis) : lo(b, axis))))]
      .filter((f) => {
        const d = sign * (c[axis] - f);
        return d >= -0.05 && d <= NEON.mount;
      })
      .sort((a, b) => Math.abs(a - c[axis]) - Math.abs(b - c[axis]));
    const backed = (f: number): boolean =>
      PLATE_GRID.every((du) =>
        PLATE_GRID.every((dv) => {
          const u = c[along] + du * w;
          const v = c.y + dv * h;
          return solid.some((b) => Math.abs((sign > 0 ? hi(b, axis) : lo(b, axis)) - f) < 1e-3 && u >= lo(b, along) && u <= hi(b, along) && v >= lo(b, 'y') && v <= hi(b, 'y'));
        }),
      );
    // Nothing may stand in the plate's own few centimetres in front of the face.
    const clear = (f: number): boolean =>
      !solid.some((b) => {
        const near = sign > 0 ? f : f - depth;
        const far = sign > 0 ? f + depth : f;
        return lo(b, axis) < far - 1e-4 && hi(b, axis) > near + 1e-4 && lo(b, along) < c[along] + w / 2 && hi(b, along) > c[along] - w / 2 && lo(b, 'y') < c.y + h / 2 && hi(b, 'y') > c.y - h / 2;
      });
    const face = planes.find((f) => backed(f) && clear(f));
    if (face === undefined) continue;
    out.push({ ...s, centre: axis === 'x' ? { x: face, y: c.y, z: c.z } : { x: c.x, y: c.y, z: face } });
  }
  return out;
}

/**
 * Every flicker channel's level at time `t` (s), written to `out` (out[c - 1] is channel c): 1 most of the time; in a
 * channel's own slot of each NEON.flicker.cycle, now and then (seeded per cycle and channel), a burst of `dips` smooth
 * dips over `burst` s down to `low`. The slots never overlap and each burst ends `rest` s before the next slot, so the
 * channels never dip in the same second: at most two dips a second over all the signs (photosensitivity: the limit is
 * three; render/g9EffectsQA.test.ts samples it). One function body writing a typed array, so the frame's call
 * (render/dressingEffects.ts) allocates nothing.
 */
export function neonFlickerLevels(t: number, out: Float64Array): void {
  const F = NEON.flicker;
  const slot = F.cycle / F.channels;
  const n = Math.floor(t / F.cycle);
  const inCycle = t - n * F.cycle;
  for (let k = 0; k < F.channels; k++) {
    // A hash of (cycle, channel): whether this slot bursts, and where in the slot.
    let h = Math.imul((n | 0) ^ Math.imul(F.seed + k + 1, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    const pick = (h >>> 0) / 4294967296;
    let g = Math.imul(h ^ 0x27d4eb2f, 0x165667b1);
    g ^= g >>> 15;
    const place = (g >>> 0) / 4294967296;
    const start = k * slot + place * (slot - F.burst - F.rest);
    const at = inCycle - start;
    if (pick < F.skip || at < 0 || at >= F.burst) {
      out[k] = 1;
      continue;
    }
    const s = Math.sin((Math.PI * F.dips * at) / F.burst);
    out[k] = 1 - (1 - F.low) * s * s;
  }
}

const levels = new Float64Array(NEON.flicker.channels);

/** One flicker channel's level at time `t` (s): `channel` 1 to 3, as neonFlickerLevels gives it; 1 for no channel. */
export function neonFlicker(channel: number, t: number): number {
  if (channel < 1 || channel > NEON.flicker.channels) return 1;
  neonFlickerLevels(t, levels);
  return levels[channel - 1]!;
}
