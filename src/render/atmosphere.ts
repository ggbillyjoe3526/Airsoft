import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATMOSPHERE, type QualitySettings, type TreeDetail } from '../config/render';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * The world round the field (M14; the visual overhaul, audit section 5 "Sky and trees"): a gradient sky dome with a
 * warm glow towards the sun, a ring of trees beyond the walls (simple, or layered crowns and a hedge of shrubs round
 * the field), and on Medium and High clouds and the sun's disc. One draw call each, built once per match and again
 * when the Trees or Clouds setting changes; the haze (Renderer's fog) fades the trees into the horizon.
 */

const tmp = new THREE.Color();
const glow = new THREE.Color();

/** The sky's colour (linear RGB, into `out`) looking along the unit direction `dir`, with the sun along `sun`. */
export function skyColour(dir: THREE.Vector3, sun: THREE.Vector3, out: THREE.Color): THREE.Color {
  const A = ATMOSPHERE;
  const h = dir.y;
  if (h >= 0) {
    out.setHex(A.horizon).lerp(tmp.setHex(A.zenith), 1 - Math.pow(1 - h, A.horizonFalloff));
  } else {
    out.setHex(A.horizon).lerp(tmp.setHex(A.below), Math.min(1, -h * 4));
  }
  const g = Math.pow(Math.max(0, dir.dot(sun)), A.sunGlowPower);
  return out.lerp(glow.setHex(A.sunGlow), g * 0.7);
}

function buildSky(sunDirection: THREE.Vector3): THREE.Mesh {
  const A = ATMOSPHERE;
  const geo = new THREE.SphereGeometry(A.skyRadius, A.skyWidthSegments, A.skyHeightSegments);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    skyColour(dir, sunDirection, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Depth-tested, never depth-writing: the dome is behind everything inside the far plane, so it shades only the
  // pixels nothing else covered (config ATMOSPHERE.skyRenderOrder).
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.name = 'sky';
  mesh.renderOrder = A.skyRenderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

/** Paints every vertex of `geo` one colour (merged meshes keep their colours as a vertex attribute). */
function painted(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  tmp.setHex(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const faceA = new THREE.Vector3();
const faceB = new THREE.Vector3();
const faceC = new THREE.Vector3();
const faceN = new THREE.Vector3();
const faceE = new THREE.Vector3();
const warm = new THREE.Color();

/**
 * Paints a crown or shrub (centred at height `centreY`, `radius` round) face by face in `color`: darker on its lower
 * half (by its face's height, down to ATMOSPHERE.detailedTrees.underShade at the bottom) and warmer on the side facing
 * the sun (by its face's normal): self-shading baked once, free to draw, crisp on the flat-shaded facets.
 */
export function shadedCrown(geo: THREE.BufferGeometry, color: number, centreY: number, radius: number, sun: THREE.Vector3): THREE.BufferGeometry {
  const T = ATMOSPHERE.detailedTrees;
  const g = painted(geo, color);
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  warm.setHex(T.warmColour);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    faceA.fromBufferAttribute(pos, i);
    faceB.fromBufferAttribute(pos, i + 1);
    faceC.fromBufferAttribute(pos, i + 2);
    faceN.subVectors(faceB, faceA).cross(faceE.subVectors(faceC, faceA)).normalize();
    const height = (faceA.y + faceB.y + faceC.y) / 3 - centreY;
    const under = Math.min(1, Math.max(0, -height / radius));
    const k = 1 - (1 - T.underShade) * under;
    const sunward = Math.max(0, faceN.dot(sun)) * T.sunWarm;
    tmp.setHex(color).multiplyScalar(k).lerp(warm, sunward);
    for (let v = 0; v < 3; v++) col.setXYZ(i + v, tmp.r, tmp.g, tmp.b);
  }
  return g;
}

/** Where a tree of the ring stands and how it looks, drawn from `rng` (the same for both ring styles). */
function placeTree(rng: RngState, i: number, count: number, centre: THREE.Vector3): { x: number; z: number; height: number; color: number; broad: boolean } {
  const T = ATMOSPHERE.trees;
  // Evenly round the ring with a little jitter, so there are no bare gaps.
  const angle = ((i + rngNext(rng) * 0.8) / count) * Math.PI * 2;
  const dist = T.ringMin + rngNext(rng) * (T.ringMax - T.ringMin);
  const height = T.heightMin + rngNext(rng) * (T.heightMax - T.heightMin);
  const color = T.colors[Math.floor(rngNext(rng) * T.colors.length)]!;
  return { x: centre.x + Math.cos(angle) * dist, z: centre.z + Math.sin(angle) * dist, height, color, broad: rngNext(rng) < T.broadShare };
}

/** The simple ring (Trees: Simple, the look before the overhaul): pines and broadleaves, one flat-shaded mesh. */
function simpleTrees(centre: THREE.Vector3): THREE.BufferGeometry[] {
  const T = ATMOSPHERE.trees;
  const rng = createRng(T.seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < T.count; i++) {
    const { x, z, height, color, broad } = placeTree(rng, i, T.count, centre);
    const trunkHeight = height * 0.25;
    parts.push(painted(new THREE.CylinderGeometry(height * 0.025, height * 0.035, trunkHeight, 5).translate(x, trunkHeight / 2, z), T.trunk));
    if (broad) {
      const r = height * T.broadWidth;
      const crown = new THREE.IcosahedronGeometry(r, 1).scale(1, 1.15, 1).translate(x, height - r * 1.1, z);
      parts.push(painted(crown, color));
    } else {
      const coneHeight = height - trunkHeight * 0.6;
      parts.push(painted(new THREE.ConeGeometry(height * T.pineWidth, coneHeight, 7).translate(x, height - coneHeight / 2, z), color));
    }
  }
  return parts;
}

/**
 * The detailed ring (Trees: Detailed): more trees, broadleaves of two or three stacked crowns, pines of two cone tiers,
 * seven-sided trunks, every crown self-shaded; and a hedge of shrubs round `field` (the map's bounds), just outside it.
 */
function detailedTrees(centre: THREE.Vector3, sun: THREE.Vector3, field: THREE.Box3 | null): THREE.BufferGeometry[] {
  const T = ATMOSPHERE.trees;
  const D = ATMOSPHERE.detailedTrees;
  const rng = createRng(T.seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < D.count; i++) {
    const { x, z, height, color, broad } = placeTree(rng, i, D.count, centre);
    const trunkHeight = height * 0.25;
    parts.push(painted(new THREE.CylinderGeometry(height * 0.025, height * 0.035, trunkHeight, D.trunkSides).translate(x, trunkHeight / 2, z), T.trunk));
    if (broad) {
      const r = height * T.broadWidth;
      const crowns = rngNext(rng) < 0.5 ? 2 : 3;
      for (let k = 0; k < crowns; k++) {
        const rk = r * D.crowns[k]!;
        const ox = (rngNext(rng) - 0.5) * 2 * D.crownJitter * rk;
        const oz = (rngNext(rng) - 0.5) * 2 * D.crownJitter * rk;
        const cy = height - r * 1.1 + D.crownLift[k]! * r;
        const crown = new THREE.IcosahedronGeometry(rk, k === 0 ? 1 : 0).scale(1, 1.15, 1).translate(x + ox, cy, z + oz);
        parts.push(shadedCrown(crown, color, cy, rk, sun));
      }
    } else {
      const coneHeight = height - trunkHeight * 0.6;
      for (let k = 0; k < D.pineTiers; k++) {
        // Tiers overlap: each higher one narrower and shorter, its foot inside the one below.
        const share = 1 - k * 0.32;
        const h = coneHeight * (k === 0 ? 0.62 : 0.55);
        const foot = height - coneHeight + k * coneHeight * 0.42;
        const cone = new THREE.ConeGeometry(height * T.pineWidth * share, h, 7).translate(x, foot + h / 2, z);
        parts.push(shadedCrown(cone, color, foot + h / 2, h / 2, sun));
      }
    }
  }
  if (field) parts.push(...shrubs(field, sun));
  return parts;
}

/** A hedge of shrubs round the field's bounds, a little outside them, so the yard sits in greenery, not on a lawn. */
function shrubs(field: THREE.Box3, sun: THREE.Vector3): THREE.BufferGeometry[] {
  const S = ATMOSPHERE.detailedTrees.shrubs;
  const rng = createRng(ATMOSPHERE.trees.seed + 1);
  const parts: THREE.BufferGeometry[] = [];
  const corners: [number, number][] = [
    [field.min.x, field.min.z],
    [field.max.x, field.min.z],
    [field.max.x, field.max.z],
    [field.min.x, field.max.z],
  ];
  const cx = (field.min.x + field.max.x) / 2;
  const cz = (field.min.z + field.max.z) / 2;
  for (let side = 0; side < 4; side++) {
    const [ax, az] = corners[side]!;
    const [bx, bz] = corners[(side + 1) % 4]!;
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.round(length / S.spacing));
    for (let k = 0; k < count; k++) {
      const t = (k + rngNext(rng)) / count;
      let x = ax + (bx - ax) * t;
      let z = az + (bz - az) * t;
      // Out from the field's middle, by `gapFrom`..`gapTo` metres.
      const out = S.gapFrom + rngNext(rng) * (S.gapTo - S.gapFrom);
      if (side % 2 === 0) z += Math.sign(z - cz) * out;
      else x += Math.sign(x - cx) * out;
      const r = S.radiusMin + rngNext(rng) * (S.radiusMax - S.radiusMin);
      const y = r * S.squash * 0.7;
      const color = S.colors[Math.floor(rngNext(rng) * S.colors.length)]!;
      parts.push(shadedCrown(new THREE.IcosahedronGeometry(r, 0).scale(1, S.squash, 1).translate(x, y, z), color, y, r * S.squash, sun));
    }
  }
  return parts;
}

/** The tree ring for a Trees setting, as one mesh (null for none). */
function buildTrees(level: TreeDetail, centre: THREE.Vector3, sun: THREE.Vector3, field: THREE.Box3 | null): THREE.Mesh | null {
  if (level === 0) return null;
  const parts = level === 1 ? simpleTrees(centre) : detailedTrees(centre, sun, field);
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('no trees');
  // Flat-shaded Lambert, off the environment map (render/surfaceMaterials.ts): leaves are matte and far away.
  const mesh = new THREE.Mesh(merged, withoutEnvironment(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  mesh.name = 'trees';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * A soft disc as a fan of two rings (no texture): solid in the middle, `middleAlpha` at `middle` of the radius out,
 * clear at the edge. Its vertices go into `pos` / `col` (RGBA) / `idx` round a centre, in the plane of `right` and
 * `up` (unit vectors, scaled by the radii), each vertex coloured by `colourAt(height in −1..1 of the disc)`.
 */
function softDisc(
  pos: number[],
  col: number[],
  idx: number[],
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  segments: number,
  middle: number,
  middleAlpha: number,
  alpha: number,
  colourAt: (v: number) => THREE.Color,
  floor = Number.NEGATIVE_INFINITY,
): void {
  const base = pos.length / 3;
  const push = (u: number, v: number, a: number): void => {
    const vv = Math.max(floor, v);
    pos.push(centre.x + right.x * u + up.x * vv, centre.y + right.y * u + up.y * vv, centre.z + right.z * u + up.z * vv);
    const c = colourAt(vv);
    col.push(c.r, c.g, c.b, a * alpha);
  };
  push(0, 0, 1);
  for (const [ring, a] of [
    [middle, middleAlpha],
    [1, 0],
  ] as const) {
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      push(Math.cos(t) * ring, Math.sin(t) * ring, a);
    }
  }
  for (let s = 0; s < segments; s++) {
    const n = (s + 1) % segments;
    const [m0, m1, o0, o1] = [base + 1 + s, base + 1 + n, base + 1 + segments + s, base + 1 + segments + n];
    idx.push(base, m0, m1, m0, o0, o1, m0, o1, m1);
  }
}

const cloudColour = new THREE.Color();
const cloudShade = new THREE.Color();
const cloudTop = new THREE.Color();

/**
 * Clouds and the sun's disc (Clouds, row 21): flat-bottomed cumulus cards of overlapping soft discs round the sky,
 * lit from above (white tops, a cool grey underside), and the sun as a soft white disc; one mesh with vertex colours
 * and alpha (no texture). Unfogged (they are the sky), no depth writes, drawn after the field.
 */
export function buildClouds(centre: THREE.Vector3, sun: THREE.Vector3): THREE.Mesh {
  const K = ATMOSPHERE.clouds;
  const rng = createRng(K.seed);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const at = new THREE.Vector3();
  cloudShade.setHex(K.shade);
  cloudTop.setHex(0xffffff);
  for (let i = 0; i < K.count; i++) {
    const heading = ((i + rngNext(rng) * 0.6) / K.count) * Math.PI * 2;
    const elevation = K.elevationMin + rngNext(rng) * (K.elevationMax - K.elevationMin);
    const width = K.widthMin + rngNext(rng) * (K.widthMax - K.widthMin);
    const dir = new THREE.Vector3(Math.cos(heading) * Math.cos(elevation), Math.sin(elevation), Math.sin(heading) * Math.cos(elevation));
    const middle = at.copy(dir).multiplyScalar(K.radius).add(centre);
    // The card faces the field's middle, upright.
    right.set(-dir.z, 0, dir.x).normalize();
    const puffs = 3 + Math.floor(rngNext(rng) * 3);
    const baseY = -width * 0.12;
    for (let p = 0; p < puffs; p++) {
      const across = ((p + 0.5) / puffs - 0.5) * width * 0.75;
      const rx = width * (0.2 + rngNext(rng) * 0.12);
      const ry = rx * (0.6 + rngNext(rng) * 0.25);
      const cy = baseY + ry * (0.55 + rngNext(rng) * 0.3) * (1 - Math.abs(across) / width);
      const c = new THREE.Vector3().copy(middle).addScaledVector(right, across).add(new THREE.Vector3(0, cy, 0));
      const r = right.clone().multiplyScalar(rx);
      up.set(0, ry, 0);
      // Every puff's underside stops at the cloud's base: flat-bottomed.
      const floor = (baseY - cy) / ry;
      softDisc(pos, col, idx, c, r, up, 14, 0.6, 0.85, K.opacity, (v) => cloudColour.copy(cloudShade).lerp(cloudTop, Math.min(1, Math.max(0, (v * ry + cy - baseY) / (ry * 1.4)))), floor);
    }
  }
  // The sun: a soft white disc where the sunlight comes from, a little inside the dome.
  const sunAt = at.copy(sun).multiplyScalar(ATMOSPHERE.skyRadius * 0.95).add(centre);
  const sunRight = new THREE.Vector3(-sun.z, 0, sun.x).normalize();
  const sunUp = new THREE.Vector3().crossVectors(sunRight, sun).normalize().negate();
  const radius = ATMOSPHERE.skyRadius * 0.95 * Math.tan(K.sunSize / 2);
  const sunColour = new THREE.Color(K.sunColour);
  softDisc(pos, col, idx, sunAt, sunRight.multiplyScalar(radius), sunUp.multiplyScalar(radius), 20, 0.55, 0.95, 1, () => sunColour);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  mesh.name = 'clouds';
  mesh.renderOrder = ATMOSPHERE.skyRenderOrder;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** The world round the field: change its trees and clouds with the quality settings, dispose it with the match. */
export interface Atmosphere {
  setQuality(quality: Pick<QualitySettings, 'trees' | 'clouds'>): void;
  dispose(): void;
}

/**
 * Adds the sky dome, the tree ring and the clouds round the field centred on `centre` (sun along `sunDirection`, a unit
 * vector towards the sun; `field` the map's bounds, for the hedge) at `quality`'s Trees and Clouds, and returns its
 * handle. Changing either setting rebuilds that mesh only.
 */
export function addAtmosphere(
  scene: THREE.Scene,
  centre: THREE.Vector3,
  sunDirection: THREE.Vector3,
  quality: Pick<QualitySettings, 'trees' | 'clouds'>,
  field: THREE.Box3 | null = null,
): Atmosphere {
  const sky = buildSky(sunDirection);
  sky.position.copy(centre);
  scene.add(sky);
  let trees: THREE.Mesh | null = null;
  let clouds: THREE.Mesh | null = null;
  let treeLevel: TreeDetail | null = null;
  const drop = (mesh: THREE.Mesh | null): null => {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    return null;
  };
  const setQuality = (q: Pick<QualitySettings, 'trees' | 'clouds'>): void => {
    if (q.trees !== treeLevel) {
      trees = drop(trees);
      treeLevel = q.trees;
      trees = buildTrees(q.trees, centre, sunDirection, field);
      if (trees) scene.add(trees);
    }
    if (q.clouds !== (clouds !== null)) {
      clouds = drop(clouds);
      if (q.clouds) scene.add((clouds = buildClouds(centre, sunDirection)));
    }
  };
  setQuality(quality);
  return {
    setQuality,
    dispose: () => {
      trees = drop(trees);
      clouds = drop(clouds);
      drop(sky);
    },
  };
}
