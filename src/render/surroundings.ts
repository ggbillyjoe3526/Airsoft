import * as THREE from 'three';
import { DRESSING } from '../config/dressing';
import type { Surroundings } from '../map/mapTypes';

/**
 * The ground beyond the field (MS1, MapDressing.surroundings.ground): a flat apron from just outside the field's bounds
 * out into the haze, `near` by the field fading to `far`, and flat patches on it (roads, yards, kerbs), so the field no
 * longer floats on the sky. Flat-shaded and vertex-coloured like the tree ring, whose mesh it joins (no draw call of its
 * own). Pure geometry: the ring's mesh owns and frees it.
 */

const S = DRESSING.surroundings;
const near = new THREE.Color();
const far = new THREE.Color();
const c = new THREE.Color();

/** Non-indexed, no uv, with a normal straight up and a colour per vertex: what the ring's parts carry to merge. */
function flat(positions: number[], colours: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return g;
}

/**
 * The apron round `field` (the map's bounds; its middle is the apron's) as rings of quads from the field's edge out to
 * DRESSING.surroundings.radius, each ring's colour from `near` to `far` by its distance; the field's own floor covers the
 * middle, so the apron leaves a hole the size of the field (less `overlap`, tucked under its walls).
 */
export function apronGeometry(ground: NonNullable<Surroundings['ground']>, field: THREE.Box3): THREE.BufferGeometry[] {
  near.setHex(ground.near, THREE.SRGBColorSpace);
  far.setHex(ground.far, THREE.SRGBColorSpace);
  const cx = (field.min.x + field.max.x) / 2;
  const cz = (field.min.z + field.max.z) / 2;
  const hx = (field.max.x - field.min.x) / 2 - S.overlap;
  const hz = (field.max.z - field.min.z) / 2 - S.overlap;
  const y = ground.y;
  const pos: number[] = [];
  const col: number[] = [];
  // Each ring is the outline of a rounded rectangle: the field's box at ring 0, a circle by the last. `around` points.
  const ring = (k: number): [number, number][] => {
    const t = k / S.rings;
    const reach = t * t * (S.radius - Math.max(hx, hz));
    const round = Math.min(1, t * 2);
    const out: [number, number][] = [];
    for (let i = 0; i < S.around; i++) {
      const a = (i / S.around) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      // The box's edge along this direction, and the circle of the same reach: blended by `round`.
      const toBox = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hz / Math.max(1e-6, Math.abs(dz)));
      const toCircle = Math.max(hx, hz);
      const r = toBox * (1 - round) + toCircle * round + reach;
      out.push([cx + dx * r, cz + dz * r]);
    }
    return out;
  };
  const colourAt = (k: number): THREE.Color => c.copy(near).lerp(far, Math.min(1, (k / S.rings) * S.fadeShare));
  let inner = ring(0);
  for (let k = 1; k <= S.rings; k++) {
    const outer = ring(k);
    const a = colourAt(k - 1).clone();
    const b = colourAt(k).clone();
    for (let i = 0; i < S.around; i++) {
      const j = (i + 1) % S.around;
      const [ix, iz] = inner[i]!;
      const [jx, jz] = inner[j]!;
      const [ox, oz] = outer[i]!;
      const [px, pz] = outer[j]!;
      // Counter-clockwise from above (+y): inner i, outer i, outer j; inner i, outer j, inner j (angles run x → z).
      pos.push(ix, y, iz, px, y, pz, ox, y, oz, ix, y, iz, jx, y, jz, px, y, pz);
      col.push(a.r, a.g, a.b, b.r, b.g, b.b, b.r, b.g, b.b, a.r, a.g, a.b, a.r, a.g, a.b, b.r, b.g, b.b);
    }
    inner = outer;
  }
  const parts = [flat(pos, col)];
  for (const p of ground.patches ?? []) {
    c.setHex(p.colour, THREE.SRGBColorSpace);
    const x0 = p.x - p.width / 2;
    const x1 = p.x + p.width / 2;
    const z0 = p.z - p.depth / 2;
    const z1 = p.z + p.depth / 2;
    const py = y + S.patchLift;
    const q = [x0, py, z0, x0, py, z1, x1, py, z1, x0, py, z0, x1, py, z1, x1, py, z0];
    parts.push(flat(q, Array.from({ length: 6 }, () => [c.r, c.g, c.b]).flat()));
  }
  return parts;
}
