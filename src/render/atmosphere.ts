import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATMOSPHERE } from '../config/render';
import { createRng, rngNext } from '../sim/rng';

/**
 * The world round the field (M14): a gradient sky dome with a warm glow towards the sun, and a ring of trees beyond the
 * walls. Two draw calls, built once per match; the haze (Renderer's fog) fades both into the horizon.
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

/** A ring of pines and broadleaves round `centre`, merged into one flat-shaded mesh. */
function buildTrees(centre: THREE.Vector3): THREE.Mesh {
  const T = ATMOSPHERE.trees;
  const rng = createRng(T.seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < T.count; i++) {
    // Evenly round the ring with a little jitter, so there are no bare gaps.
    const angle = ((i + rngNext(rng) * 0.8) / T.count) * Math.PI * 2;
    const dist = T.ringMin + rngNext(rng) * (T.ringMax - T.ringMin);
    const x = centre.x + Math.cos(angle) * dist;
    const z = centre.z + Math.sin(angle) * dist;
    const height = T.heightMin + rngNext(rng) * (T.heightMax - T.heightMin);
    const color = T.colors[Math.floor(rngNext(rng) * T.colors.length)]!;
    const trunkHeight = height * 0.25;
    parts.push(painted(new THREE.CylinderGeometry(height * 0.025, height * 0.035, trunkHeight, 5).translate(x, trunkHeight / 2, z), T.trunk));
    if (rngNext(rng) < T.broadShare) {
      const r = height * T.broadWidth;
      const crown = new THREE.IcosahedronGeometry(r, 1).scale(1, 1.15, 1).translate(x, height - r * 1.1, z);
      parts.push(painted(crown, color));
    } else {
      const coneHeight = height - trunkHeight * 0.6;
      parts.push(painted(new THREE.ConeGeometry(height * T.pineWidth, coneHeight, 7).translate(x, height - coneHeight / 2, z), color));
    }
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('no trees');
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = 'trees';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Adds the sky dome and tree ring round the field centred on `centre` (sun along `sunDirection`, a unit vector towards
 * the sun) and returns a disposer that removes them and frees their GPU resources.
 */
export function addAtmosphere(scene: THREE.Scene, centre: THREE.Vector3, sunDirection: THREE.Vector3): () => void {
  const sky = buildSky(sunDirection);
  sky.position.copy(centre);
  const trees = buildTrees(centre);
  scene.add(sky, trees);
  return () => {
    for (const mesh of [sky, trees]) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  };
}
