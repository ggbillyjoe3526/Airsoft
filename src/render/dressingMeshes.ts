import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRESSING } from '../config/dressing';
import type { GlowStrip } from '../map/mapTypes';
import { createRng, rngNext } from '../sim/rng';
import { DECAL_RENDER_ORDER } from './mapDecals';
import type { DressingLayout, JunkPiece } from './mapDressing';
import { applySurfacePatch, type ProbeUniforms, type SurfacePatch, surfacePatchKey } from './surfaceShader';

/**
 * The set dressing's own meshes (G8; render/mapDressing.ts places it): the junk and the glow strips as one mesh (one
 * draw call: flat-shaded, vertex-coloured Lambert, the strips self-lit through a `glow` attribute), the puddles as one
 * more (one draw call: glossy, physically based, flagged `userData.reflective` for the Ultra reflections). Both join
 * the map's group, so disposeMapMeshes frees their geometry and material; neither has a texture. Neither casts a
 * shadow (a shadow pass would be another draw call; the decals' contact shadows ground the junk instead).
 */

const J = DRESSING.junk;
const P = DRESSING.puddles;

const colour = new THREE.Color();
const turn = new THREE.Matrix4();
const place = new THREE.Matrix4();

/** One flat-shaded part: non-indexed, no uv, painted `hex` (sRGB), moved by `m`, not glowing. */
function part(geo: THREE.BufferGeometry, hex: string | number, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.applyMatrix4(m);
  g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  if (typeof hex === 'string') colour.setStyle(hex);
  else colour.setHex(hex);
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

const pick = <T>(list: readonly T[], u: number): T => list[Math.floor(u * list.length) % list.length]!;

/**
 * A piece of junk's parts in its own frame: x along the face, z out from it, y up from the floor, its footprint
 * centred on the origin; each part inside `along` × `out` × `height` (mapDressing.test.ts checks the bounds).
 */
function junkParts(p: JunkPiece): { geo: THREE.BufferGeometry; hex: string }[] {
  const v = p.variant;
  const S = J.segments;
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => g.translate(x, y, z);
  switch (p.kind) {
    case 'cans':
      return [
        { geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.12, S), -0.14, 0.06, -0.03), hex: pick(J.cans, v) },
        { geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.12, S), -0.02, 0.06, 0.04), hex: pick(J.cans, v + 0.37) },
        { geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.12, S).rotateZ(Math.PI / 2).rotateY(0.4), 0.13, 0.035, -0.01), hex: pick(J.cans, v + 0.71) },
      ];
    case 'bottle':
      return [
        { geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.2, S).rotateZ(Math.PI / 2), -0.03, 0.035, 0), hex: J.bottle },
        { geo: at(new THREE.CylinderGeometry(0.014, 0.03, 0.06, S).rotateZ(-Math.PI / 2), 0.1, 0.035, 0), hex: J.bottle },
        { geo: at(new THREE.CylinderGeometry(0.016, 0.016, 0.02, S).rotateZ(-Math.PI / 2), 0.14, 0.035, 0), hex: J.bottleCap },
      ];
    case 'rubble': {
      const chunks: [number, number, number, number][] = [
        [-0.2, -0.04, 0.13, 0.85],
        [0.04, 0.05, 0.12, 0.8],
        [0.22, -0.06, 0.09, 0.9],
        [-0.04, -0.1, 0.08, 0.7],
      ];
      return chunks.map(([x, z, r, sy], i) => ({ geo: at(new THREE.DodecahedronGeometry(r, 0).rotateY(v * 6 + i).scale(1, sy, 1), x, r * sy, z), hex: pick(J.rubble, v + i * 0.23) }));
    }
    case 'boards':
      return [0, 1, 2].map((i) => ({ geo: at(new THREE.BoxGeometry(1.0, 0.024, 0.1).rotateY((i - 1) * 0.06), (i - 1) * 0.03, 0.012 + i * 0.024, (i - 1) * 0.08), hex: pick(J.boards, v + i * 0.34) }));
    case 'bags':
      return [-0.18, 0.18].map((x, i) => ({ geo: at(new THREE.IcosahedronGeometry(0.2, 1).scale(1, 0.72, 0.85).rotateY(v * 3 + i), x, 0.144, 0), hex: pick(J.bags, v + i * 0.5) }));
    case 'tyre':
      return [{ geo: at(new THREE.TorusGeometry(0.16, 0.055, 6, 12).rotateX(Math.PI / 2), 0, 0.055, 0), hex: J.tyre }];
    case 'coil':
      return [{ geo: at(new THREE.TorusGeometry(0.15, 0.03, 4, 12).rotateX(Math.PI / 2), 0, 0.03, 0), hex: J.coil }];
    case 'cone':
      return [
        { geo: at(new THREE.BoxGeometry(0.28, 0.02, 0.28), 0, 0.01, 0), hex: J.cone },
        { geo: at(new THREE.ConeGeometry(0.11, 0.28, S), 0, 0.16, 0), hex: J.cone },
        { geo: at(new THREE.CylinderGeometry(0.066, 0.082, 0.05, S, 1, true), 0, 0.14, 0), hex: J.coneBand },
      ];
  }
}

/** The yaw that turns a piece's own +z (out from the face) to its face's outward normal. */
const yawOf = (p: Pick<JunkPiece, 'axis' | 'sign'>): number => (p.axis === 2 ? (p.sign > 0 ? 0 : Math.PI) : p.sign > 0 ? Math.PI / 2 : -Math.PI / 2);

/** Every part of every piece, in the world. */
export function junkGeometries(junk: readonly JunkPiece[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const p of junk) {
    place.makeRotationY(yawOf(p)).setPosition(p.x, p.y, p.z);
    for (const { geo, hex } of junkParts(p)) out.push(part(geo, hex, place));
  }
  return out;
}

/** A glow strip as a lit quad on its face (two triangles), its `glow` attribute DRESSING.strips.glow. */
function stripGeometry(s: GlowStrip): THREE.BufferGeometry {
  const n = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1], '+y': [0, 1, 0] }[s.facing];
  const r = { '+x': [0, 0, -1], '-x': [0, 0, 1], '+z': [1, 0, 0], '-z': [-1, 0, 0], '+y': [1, 0, 0] }[s.facing];
  const u = s.facing === '+y' ? [0, 0, -1] : [0, 1, 0];
  const c = [s.centre.x, s.centre.y, s.centre.z];
  const corner = (a: number, b: number): number[] => [0, 1, 2].map((k) => c[k]! + n[k]! * DRESSING.strips.offset + r[k]! * a * (s.width / 2) + u[k]! * b * (s.height / 2));
  const pos = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, -1), corner(1, 1), corner(-1, 1)].flat();
  turn.identity();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const geo = part(g, s.colour, turn);
  (geo.getAttribute('glow') as THREE.BufferAttribute).array.fill(DRESSING.strips.glow);
  return geo;
}

/**
 * Lambert off the environment, with the strips' glow added as light of their own colour, and the map's baked light per
 * pixel when the map's surfaces have it (`probes`: render/surfaceShader.ts's patch, so the junk sits in the same light).
 */
function junkMaterial(probes: ProbeUniforms | null): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const patch: SurfacePatch = { environment: false, wear: null, probes };
  material.onBeforeCompile = (shader) => {
    applySurfacePatch(shader, patch);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute float glow;\nvarying float vGlow;\n#include <common>')
      .replace('#include <begin_vertex>', 'vGlow = glow;\n#include <begin_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'varying float vGlow;\n#include <common>')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow;');
  };
  material.customProgramCacheKey = () => `${surfacePatchKey(patch)}:dressing-junk`;
  return material;
}

/** The junk and glow strips as one mesh (null when there are none), in the map's baked light (`probes`) if it has one. */
export function buildJunkMesh(layout: DressingLayout, probes: ProbeUniforms | null = null): THREE.Mesh | null {
  const parts = [...junkGeometries(layout.junk), ...layout.strips.map(stripGeometry)];
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('dressing parts do not merge');
  // Indexed like the map's other meshes (each triangle its own three vertices: flat-shaded).
  merged.setIndex(Array.from({ length: merged.getAttribute('position').count }, (_, i) => i));
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, junkMaterial(probes));
  mesh.name = 'map-junk';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/**
 * The puddles as one mesh (null for none): a seeded outline, a water middle, a wet margin fading out; in the map's
 * baked light (`probes`) if it has one.
 */
export function buildPuddleMesh(layout: DressingLayout, probes: ProbeUniforms | null = null): THREE.Mesh | null {
  if (layout.puddles.length === 0) return null;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const water = new THREE.Color(P.water);
  const wet = new THREE.Color(P.wet);
  const n = P.points;
  const wobble = new Float32Array(n);
  // Ring k's share of the outline, colour and alpha: the core's edge, the wet margin's start, the outline.
  const rings: [number, THREE.Color, number][] = [
    [P.core, water, P.alpha],
    [Math.min(1, P.core + 0.12), wet, P.wetAlpha],
    [1, wet, 0],
  ];
  for (const p of layout.puddles) {
    const rng = createRng(p.seed);
    for (let i = 0; i < n; i++) wobble[i] = 1 + (rngNext(rng) - 0.5) * 2 * P.wobble;
    const base = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    col.push(water.r, water.g, water.b, P.alpha);
    for (const [share, c, alpha] of rings) {
      for (let i = 0; i < n; i++) {
        // Each point's wobble eased with its neighbours', so the outline is lumpy, not spiky.
        const w = (wobble[(i + n - 1) % n]! + 2 * wobble[i]! + wobble[(i + 1) % n]!) / 4;
        const a = (i / n) * Math.PI * 2;
        pos.push(p.x + Math.cos(a) * (p.width / 2) * share * w, p.y, p.z + Math.sin(a) * (p.depth / 2) * share * w);
        col.push(c.r, c.g, c.b, alpha);
      }
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(base, base + 1 + j, base + 1 + i);
      for (let k = 0; k < 2; k++) {
        const a0 = base + 1 + k * n;
        const b0 = a0 + n;
        idx.push(a0 + i, a0 + j, b0 + j, a0 + i, b0 + j, b0 + i);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: P.roughness,
    metalness: 0,
    envMapIntensity: P.envIntensity,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  if (probes) {
    const patch: SurfacePatch = { environment: true, wear: null, probes };
    material.onBeforeCompile = (shader) => applySurfacePatch(shader, patch);
    material.customProgramCacheKey = () => `${surfacePatchKey(patch)}:puddles`;
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'map-puddles';
  mesh.userData.reflective = P.reflective;
  mesh.receiveShadow = true;
  // Over the decals (stains, dirt) and under everything else blended.
  mesh.renderOrder = DECAL_RENDER_ORDER + 1;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
