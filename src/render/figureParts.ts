import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE } from '../config/characters';
import { FIGURE_SHADOW_PROXY } from '../config/render';
import { CAMO_ATTRIBUTE } from './figureCamo';
import { FINISH_ATTRIBUTE } from './figureFinish';
import { chamferBox, frameBetween, limbGeo, type ProfileStop, V } from './figureShapes';
import { shadowProxy } from './shadowProxy';

/** A figure's detail level (QualitySettings.figureDetail, FA8): segment counts and whether the overhaul's pieces show. */
export type FigureDetail = (typeof FIGURE.detail)[keyof typeof FIGURE.detail];
/** [roughness, metalness] of a vertex on the detailed figure (FIGURE.finish). */
export type Finish = readonly [roughness: number, metalness: number];

/** How a part is coloured on the detailed figure: its finish, a lighter bevel, its camo. Ignored on `low`. */
export interface PartLook {
  finish?: Finish;
  /** Lighten the bevel faces of a chamfered block (FIGURE.edgeLight): the CS edge highlight. */
  edge?: boolean;
  /** The team camo's pattern (its seed, 1 or more; render/figureCamo.ts), printed per pixel from the part's position. */
  camo?: number;
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
const SHADOW = FIGURE_SHADOW_PROXY;

/** A plain box standing in for a block in the shadow map, or null when it is too thin to show there. */
function shadowBox(w: number, h: number, d: number): THREE.BufferGeometry | null {
  return Math.min(w, h, d) < SHADOW.minThickness ? null : new THREE.BoxGeometry(w, h, d);
}

/**
 * A limb's stand-in in the shadow map (limbGeo's frame): a closed tube of FIGURE_SHADOW_PROXY.sides following `prof`
 * over `len`, or null when the limb is thinner than `minRadius` all along.
 */
export function shadowLimb(len: number, prof: readonly ProfileStop[]): THREE.BufferGeometry | null {
  return prof.some(([, rx, rz]) => Math.max(rx, rz) >= SHADOW.minRadius) ? limbGeo(len, prof, SHADOW.sides, SHADOW.limbRings, true) : null;
}

/** A closed rod of FIGURE_SHADOW_PROXY.sides standing in for a cylinder `r` round and `h` long, or null when thinner than a box that casts. */
function shadowCylinder(r: number, h: number): THREE.BufferGeometry | null {
  return r * 2 < SHADOW.minThickness || h < SHADOW.minThickness ? null : new THREE.CylinderGeometry(r, r, h, SHADOW.sides);
}

/**
 * Collects coloured primitives and merges them into one geometry with a `color` attribute (graphics overhaul G7: the
 * builder the human and robot parts share). On the detailed figure every part also carries a per-vertex finish
 * (render/figureFinish.ts) and camo pattern (render/figureCamo.ts), and blocks are chamfered and their bevels lightened.
 */
export class PartBuilder {
  private readonly geos: THREE.BufferGeometry[] = [];
  /** The shadow stand-ins (M75): drawn into the shadow map in the shapes' place (render/shadowProxy.ts). */
  private readonly shadows: THREE.BufferGeometry[] = [];

  constructor(readonly detail: FigureDetail = FIGURE.detail.low) {}

  /** The overhaul's extra pieces and finishes are drawn (figureDetail 'high'). */
  get overhaul(): boolean {
    return this.detail.overhaul;
  }

  /**
   * Adds `geo` (consumed) in `color`; a geometry without normals gets flat ones. `shadow` (consumed), if given, stands
   * in for it in the shadow map, already placed as `geo` is.
   */
  add(geo: THREE.BufferGeometry, color: number, look: PartLook = {}, shadow: THREE.BufferGeometry | null = null): this {
    this.geos.push(this.paint(geo, color, look));
    if (shadow) this.castOnly(shadow, color);
    return this;
  }

  /**
   * A stand-in in the shadow map only (consumed, already placed): what a cluster of thin shapes (the fingers) casts
   * together. Only the detailed figure keeps stand-ins: the Low one is plain already and Low draws no shadows.
   */
  castOnly(geo: THREE.BufferGeometry, color: number): this {
    if (this.overhaul) this.shadows.push(this.paint(geo, color, {}));
    else geo.dispose();
    return this;
  }

  /** `geo` without an index or UVs, with its colour (and on the detailed figure its finish) on every vertex. */
  private paint(geo: THREE.BufferGeometry, color: number, look: PartLook): THREE.BufferGeometry {
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
      const nor = g.getAttribute('normal');
      const finish = new Float32Array(n * 2);
      const [rough, metal] = look.finish ?? FIN.fabric;
      for (let i = 0; i < n; i++) {
        const k = look.edge && onBevel(nor.getX(i), nor.getY(i), nor.getZ(i)) ? FIGURE.edgeLight : 1;
        colors[i * 3] = Math.min(1, c.r * k);
        colors[i * 3 + 1] = Math.min(1, c.g * k);
        colors[i * 3 + 2] = Math.min(1, c.b * k);
        finish[i * 2] = rough;
        finish[i * 2 + 1] = metal;
      }
      g.setAttribute(FINISH_ATTRIBUTE, new THREE.BufferAttribute(finish, 2));
      g.setAttribute(CAMO_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(n).fill(look.camo ?? 0), 1));
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }

  /**
   * `geo` (consumed) placed in `frame` at its local (x, y, z), turned by `turn` and scaled by `scale`; `shadow`
   * (consumed), its stand-in in the shadow map, placed the same way. A sphere as large as a head
   * (FIGURE_SHADOW_PROXY.minBall) brings a coarse one of its own when none is given.
   */
  addIn(frame: THREE.Matrix4, geo: THREE.BufferGeometry, x: number, y: number, z: number, color: number, look?: PartLook, turn?: THREE.Euler, scale?: THREE.Vector3, shadow: THREE.BufferGeometry | null = coarseBall(geo, scale)): this {
    const m = frame.clone().multiply(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(turn ?? new THREE.Euler()), scale ?? V(1, 1, 1)));
    return this.add(geo.applyMatrix4(m), color, look, shadow?.applyMatrix4(m) ?? null);
  }

  /**
   * A block `w` by `h` by `d` centred at (x, y, z) in `frame`, turned by `turn`: a plain box (12 triangles) on Low, a
   * chamfered one whose bevels catch the light on the detailed figure.
   */
  block(color: number, w: number, h: number, d: number, x: number, y: number, z: number, look: PartLook = { edge: true }, frame: THREE.Matrix4 = IDENTITY, turn?: THREE.Euler): this {
    const geo = this.overhaul ? chamferBox(w, h, d, Math.min(MAX_CHAMFER, Math.min(w, h, d) * CHAMFER_SHARE)) : new THREE.BoxGeometry(w, h, d);
    return this.addIn(frame, geo, x, y, z, color, look, turn, undefined, shadowBox(w, h, d));
  }

  /** A box that stays plain at every detail (slivers, straps, small plates). */
  box(color: number, w: number, h: number, d: number, x: number, y: number, z: number, look?: PartLook, frame: THREE.Matrix4 = IDENTITY, turn?: THREE.Euler): this {
    return this.addIn(frame, new THREE.BoxGeometry(w, h, d), x, y, z, color, look, turn, undefined, shadowBox(w, h, d));
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
    this.add(limbGeo(len, prof, sides, rings, caps).applyMatrix4(frame), color, look, shadowLimb(len, prof)?.applyMatrix4(frame) ?? null);
    return frameBetween(a, b, ref);
  }

  /** A thin rod from `a` to `b` (a tube, an antenna, a piston): `sides` round, open-ended. */
  rod(color: number, a: THREE.Vector3, b: THREE.Vector3, r: number, look?: PartLook, sides = 6): this {
    const len = Math.max(1e-3, a.distanceTo(b));
    const frame = frameBetween(a, b);
    const geo = new THREE.CylinderGeometry(r, r, len, sides, 1, true).translate(0, len / 2, 0);
    return this.add(geo.applyMatrix4(frame), color, look, shadowCylinder(r, len)?.translate(0, len / 2, 0).applyMatrix4(frame) ?? null);
  }

  /** A sphere (a joint) of radius `r` at `c`, scaled by `scale`. */
  sphere(color: number, c: THREE.Vector3, r: number, look?: PartLook, scale?: THREE.Vector3): this {
    const [sides, rings] = this.detail.joint;
    return this.addIn(IDENTITY, new THREE.SphereGeometry(r, sides, rings), c.x, c.y, c.z, color, look, undefined, scale);
  }

  /** A short cylinder (a headset cup, a hinge, a ring) of radius `r` and `h` tall, its axis along `frame`'s Y. */
  cylinder(color: number, r: number, h: number, frame: THREE.Matrix4, x: number, y: number, z: number, look?: PartLook, turn?: THREE.Euler, open = false): this {
    return this.addIn(frame, new THREE.CylinderGeometry(r, r, h, this.detail.cylinder, 1, open), x, y, z, color, look, turn, undefined, shadowCylinder(r, h));
  }

  /** Moves another builder's coloured shapes and shadow stand-ins into this one, transformed by `m`. */
  addPart(part: PartBuilder, m: THREE.Matrix4): this {
    for (const g of part.geos) this.geos.push(g.applyMatrix4(m));
    for (const g of part.shadows) this.shadows.push(g.applyMatrix4(m));
    part.geos.length = 0;
    part.shadows.length = 0;
    return this;
  }

  /**
   * The part as one mesh casting shadows: its shapes merged, its shadow stand-ins after them in the same geometry and
   * drawn into the shadow map in the shapes' place (M75, audit REN-03 step 1; render/shadowProxy.ts).
   */
  build(material: THREE.Material): THREE.Mesh {
    let drawn = 0;
    for (const g of this.geos) drawn += g.getAttribute('position').count;
    const all = [...this.geos, ...this.shadows];
    const merged = all.length > 0 ? mergeGeometries(all) : null;
    for (const g of all) g.dispose();
    this.geos.length = 0;
    this.shadows.length = 0;
    if (!merged || drawn === 0) throw new Error('empty figure part');
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    if (merged.getAttribute('position').count > drawn) shadowProxy(mesh, drawn);
    return mesh;
  }
}

/**
 * A coarse ball (FIGURE_SHADOW_PROXY.ball) standing in for `geo` when it is a sphere as large as a head once `scale`d,
 * keeping its cut (a hood's or a dome's angles); null for anything else, which casts nothing of its own.
 */
function coarseBall(geo: THREE.BufferGeometry, scale?: THREE.Vector3): THREE.BufferGeometry | null {
  if (!(geo instanceof THREE.SphereGeometry)) return null;
  const p = geo.parameters;
  if (p.radius * (scale ? Math.max(scale.x, scale.y, scale.z) : 1) < SHADOW.minBall) return null;
  return new THREE.SphereGeometry(p.radius, SHADOW.ball[0], SHADOW.ball[1], p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
}
