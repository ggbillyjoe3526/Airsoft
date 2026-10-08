import * as THREE from 'three';
import { NEON } from '../config/dressing';
import type { NeonSign } from '../map/mapTypes';

/**
 * Neon signs (G9, MapDressing.neon): tube letters or an emblem on a dark plate standing a few centimetres off a wall,
 * built into the junk mesh (render/dressingMeshes.ts; no draw call of its own). The tubes glow through the junk
 * material's `glow` attribute; a flickering sign's tubes carry its channel in a `flick` attribute, and the material
 * multiplies their glow by that channel's level (neonFlicker, set each frame by render/dressingEffects.ts; 1 under
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

/**
 * A flicker channel's level at time `t` (s): 1 most of the time; once every NEON.flicker.every seconds or so (each
 * channel its own period and phase) a short burst of `dips` smooth dips over `burst` seconds, down to `low`. Never more
 * than three dips a second (photosensitivity: render/neonDressing.test.ts samples it).
 */
export function neonFlicker(channel: number, t: number): number {
  const F = NEON.flicker;
  if (channel < 1) return 1;
  // A channel's period, between `every` [0] and [1], and its phase: spread by the golden ratio, so no two line up.
  const share = (channel * 0.6180339887 + F.seed * 1e-4) % 1;
  const period = F.every[0] + share * (F.every[1] - F.every[0]);
  const at = (((t + channel * 2.71) % period) + period) % period;
  if (at >= F.burst) return 1;
  const s = Math.sin((Math.PI * F.dips * at) / F.burst);
  return 1 - (1 - F.low) * s * s;
}
