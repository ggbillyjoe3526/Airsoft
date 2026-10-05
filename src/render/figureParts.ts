import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE } from '../config/characters';
import { FINISH_ATTRIBUTE } from './figureFinish';
import { chamferBox, frameBetween, limbGeo, type ProfileStop, V } from './figureShapes';

/** A figure's detail level (QualitySettings.figureDetail, FA8): segment counts and whether the overhaul's pieces show. */
export type FigureDetail = (typeof FIGURE.detail)[keyof typeof FIGURE.detail];
/** [roughness, metalness] of a vertex on the detailed figure (FIGURE.finish). */
export type Finish = readonly [roughness: number, metalness: number];

/** How a part is coloured on the detailed figure: its finish, a lighter bevel, a shade by position. Ignored on `low`. */
export interface PartLook {
  finish?: Finish;
  /** Lighten the bevel faces of a chamfered block (FIGURE.edgeLight): the CS edge highlight. */
  edge?: boolean;
  /** A colour multiplier by vertex position, in the figure part's space (camo blotches, a baked shade). */
  shade?: (x: number, y: number, z: number) => number;
}

/** True for a vertex normal between two faces of a block (a bevel), not on a flat face. */
function onBevel(nx: number, ny: number, nz: number): boolean {
  let axes = 0;
  if (Math.abs(nx) > 0.2) axes++;
  if (Math.abs(ny) > 0.2) axes++;
  if (Math.abs(nz) > 0.2) axes++;
  return axes >= 2;
}

const FIN = FIGURE.finish;
/** A block's chamfer on the detailed figure, at most this share of its smallest side, and never more than `MAX_CHAMFER`. */
const CHAMFER_SHARE = 0.3;
const MAX_CHAMFER = 0.012;
const IDENTITY = new THREE.Matrix4();

/**
 * Camo blotches (the detailed figure, FIGURE.palette): a darker and a lighter tone where three crossed waves of the
 * part's position peak, so neighbouring limbs and the torso print one pattern. `seed` shifts it per part.
 */
export function camoShade(seed = 0): (x: number, y: number, z: number) => number {
  const P = FIGURE.palette;
  const k = 1 / P.camoScale;
  return (x, y, z) => {
    const n = Math.sin(x * k * 1.3 + y * k * 0.7 + seed) + Math.sin(y * k * 1.1 - z * k * 0.9 + seed * 1.7) + Math.sin(z * k * 1.2 + x * k * 0.8 - seed);
    return n > 1.1 ? P.camoDark : n < -1.3 ? P.camoLight : 1;
  };
}

/**
 * Collects coloured primitives and merges them into one geometry with a `color` attribute (graphics overhaul G7: the
 * builder the human and robot parts share). On the detailed figure every part also carries a per-vertex finish
 * (render/figureFinish.ts), blocks are chamfered and their bevels lightened, and a look's shade is baked in.
 */
export class PartBuilder {
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(readonly detail: FigureDetail = FIGURE.detail.low) {}

  /** The overhaul's extra pieces and finishes are drawn (figureDetail 'high'). */
  get overhaul(): boolean {
    return this.detail.overhaul;
  }

  /** Adds `geo` (consumed) in `color`; a geometry without normals gets flat ones. */
  add(geo: THREE.BufferGeometry, color: number, look: PartLook = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    if (!this.overhaul) {
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    } else {
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const finish = new Float32Array(n * 2);
      const [rough, metal] = look.finish ?? FIN.fabric;
      for (let i = 0; i < n; i++) {
        let k = 1;
        if (look.edge && onBevel(nor.getX(i), nor.getY(i), nor.getZ(i))) k *= FIGURE.edgeLight;
        if (look.shade) k *= look.shade(pos.getX(i), pos.getY(i), pos.getZ(i));
        colors[i * 3] = Math.min(1, c.r * k);
        colors[i * 3 + 1] = Math.min(1, c.g * k);
        colors[i * 3 + 2] = Math.min(1, c.b * k);
        finish[i * 2] = rough;
        finish[i * 2 + 1] = metal;
      }
      g.setAttribute(FINISH_ATTRIBUTE, new THREE.BufferAttribute(finish, 2));
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geos.push(g);
    return this;
  }

  /** `geo` (consumed) placed in `frame` at its local (x, y, z), turned by `turn` and scaled by `scale`. */
  addIn(frame: THREE.Matrix4, geo: THREE.BufferGeometry, x: number, y: number, z: number, color: number, look?: PartLook, turn?: THREE.Euler, scale?: THREE.Vector3): this {
    const local = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(turn ?? new THREE.Euler()), scale ?? V(1, 1, 1));
    geo.applyMatrix4(frame.clone().multiply(local));
    return this.add(geo, color, look);
  }

  /**
   * A block `w` by `h` by `d` centred at (x, y, z) in `frame`, turned by `turn`: a plain box (12 triangles) on Low, a
   * chamfered one whose bevels catch the light on the detailed figure.
   */
  block(color: number, w: number, h: number, d: number, x: number, y: number, z: number, look: PartLook = { edge: true }, frame: THREE.Matrix4 = IDENTITY, turn?: THREE.Euler): this {
    const geo = this.overhaul ? chamferBox(w, h, d, Math.min(MAX_CHAMFER, Math.min(w, h, d) * CHAMFER_SHARE)) : new THREE.BoxGeometry(w, h, d);
    return this.addIn(frame, geo, x, y, z, color, look, turn);
  }

  /** A box that stays plain at every detail (slivers, straps, small plates). */
  box(color: number, w: number, h: number, d: number, x: number, y: number, z: number, look?: PartLook, frame: THREE.Matrix4 = IDENTITY, turn?: THREE.Euler): this {
    return this.addIn(frame, new THREE.BoxGeometry(w, h, d), x, y, z, color, look, turn);
  }

  /**
   * A limb (or a body part built like one) from `a` to `b`, `over` metres past both ends, its radii following `prof`,
   * its front towards `ref`; open-ended unless `caps`. Returns its frame (Y along it, from `a`).
   */
  limb(color: number, a: THREE.Vector3, b: THREE.Vector3, prof: readonly ProfileStop[], look?: PartLook, ref: THREE.Vector3 = V(0, 0, -1), over = 0.02, caps = false): THREE.Matrix4 {
    const dir = b.clone().sub(a).normalize();
    const from = a.clone().addScaledVector(dir, -over);
    const len = a.distanceTo(b) + over * 2;
    const [sides, rings] = this.detail.limb;
    const frame = frameBetween(from, b.clone().addScaledVector(dir, over), ref);
    this.add(limbGeo(len, prof, sides, rings, caps).applyMatrix4(frame), color, look);
    return frameBetween(a, b, ref);
  }

  /** A thin rod from `a` to `b` (a tube, an antenna, a piston): `sides` round, open-ended. */
  rod(color: number, a: THREE.Vector3, b: THREE.Vector3, r: number, look?: PartLook, sides = 6): this {
    const len = Math.max(1e-3, a.distanceTo(b));
    const geo = new THREE.CylinderGeometry(r, r, len, sides, 1, true).translate(0, len / 2, 0);
    return this.add(geo.applyMatrix4(frameBetween(a, b)), color, look);
  }

  /** A sphere (a joint) of radius `r` at `c`, scaled by `scale`. */
  sphere(color: number, c: THREE.Vector3, r: number, look?: PartLook, scale?: THREE.Vector3): this {
    const [sides, rings] = this.detail.joint;
    return this.addIn(IDENTITY, new THREE.SphereGeometry(r, sides, rings), c.x, c.y, c.z, color, look, undefined, scale);
  }

  /** A short cylinder (a headset cup, a hinge, a ring) of radius `r` and `h` tall, its axis along `frame`'s Y. */
  cylinder(color: number, r: number, h: number, frame: THREE.Matrix4, x: number, y: number, z: number, look?: PartLook, turn?: THREE.Euler, open = false): this {
    return this.addIn(frame, new THREE.CylinderGeometry(r, r, h, this.detail.cylinder, 1, open), x, y, z, color, look, turn);
  }

  /** Adds another builder's merged, already coloured parts transformed by `m`. */
  addPart(part: PartBuilder, m: THREE.Matrix4): this {
    this.geos.push(part.geometry().applyMatrix4(m));
    return this;
  }

  geometry(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (!merged) throw new Error('empty figure part');
    return merged;
  }

  build(material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = true;
    return mesh;
  }
}
