import * as THREE from 'three';
import { buildGroundGrid, groundAt } from '../../src/map/groundSurfaces';
import type { Kit } from './kit';
import { groundDetail } from './woodland-tex';
import { fbm2, groundY, HALF_X, HALF_Z, hash2, MAP, noise2, polyDistance, rng } from './woodland-util';

/**
 * The ground: the field's own terrain triangles (what you stand on), subdivided on Ultra to the same planes, painted by
 * a splat shader that height-blends four surfaces from one packed detail texture (grass sward, leaf litter and needles,
 * trodden earth, creek gravel), so grass tufts poke through the earth at a path's edge instead of a soft smear. What each
 * point is comes from the game's ground grid (map/groundSurfaces.ts), so what you see is what you hear underfoot. Contact
 * shade under trunks, rocks, logs and bushes is baked into the vertex colours. Round the field, the world's ground runs
 * on into wooded hills.
 */

/** Albedo of each surface (sRGB), before the detail texture shades it. */
export const SURFACE = {
  grass: 0x4c6c46,
  grassDry: 0x7b7c52,
  leaves: 0x4e3d2b,
  leaves2: 0x644a30,
  earth: 0x6e5a45,
  gravel: 0x807b71,
};
/** One repeat of the detail texture (m). */
const DETAIL_METRES = 2.6;
/** How strongly the detail heights tilt the normal (Ultra). */
const DETAIL_BUMP = 3.2;
/** Contact shade: how dark the ground gets at a block's foot and how far it reaches (m). */
const CONTACT = { dark: 0.42, reach: 0.7, bush: 0.5 };

const GRID = buildGroundGrid(MAP, 1)!;
const SURF_INDEX = { grass: 0, leaves: 1, earth: 2, gravel: 3, wood: 2 } as const;

/** Splat weights (grass, leaves, earth, gravel) at (x, z): the game's grid, sampled round a warped point for soft, ragged edges. */
export function splatAt(x: number, z: number, out: [number, number, number, number]): void {
  out.fill(0);
  const wx = x + (noise2(x * 0.7, z * 0.7, 41) - 0.5) * 1.3;
  const wz = z + (noise2(x * 0.7, z * 0.7, 42) - 0.5) * 1.3;
  const taps = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]] as const;
  for (const [dx, dz] of taps) {
    const s = groundAt(GRID, wx + dx, wz + dz);
    out[SURF_INDEX[s]] += 1 / taps.length;
  }
  if (Math.abs(x) > HALF_X || Math.abs(z) > HALF_Z) {
    // Outside the fence: litter under the forest, a grass verge along the fence.
    const out2 = Math.max(Math.abs(x) - HALF_X, Math.abs(z) - HALF_Z);
    const verge = 1 - THREE.MathUtils.smoothstep(out2, 1.5, 5);
    out.fill(0);
    out[0] = verge * 0.8 + (1 - verge) * 0.15 * noise2(x * 0.2, z * 0.2, 43);
    out[1] = 1 - out[0];
  }
}

/** Ruts along the forest and sunken tracks: their centre lines, and where the puddles lie. */
export const TRACKS = (MAP.ground?.patches ?? []).filter((p) => p.surface === 'earth' && p.path && p.path.length > 1).map((p) => ({ path: p.path!.map((q) => ({ x: q.x, z: q.z })), width: p.width ?? 2 }));
const RUT_OFFSET = 0.42;
const RUT_WIDTH = 0.15;
const CROWN_WIDTH = 0.17;

/** On a track: 0 off it, else how far into a rut (1 in the middle of one), and whether on the grassy crown between them. */
function trackAt(x: number, z: number): { rut: number; crown: number } {
  let rut = 0;
  let crown = 0;
  for (const t of TRACKS) {
    const d = polyDistance(x, z, t.path);
    if (d > t.width / 2 + 0.3) continue;
    rut = Math.max(rut, 1 - THREE.MathUtils.smoothstep(Math.abs(d - RUT_OFFSET), RUT_WIDTH * 0.4, RUT_WIDTH));
    crown = Math.max(crown, 1 - THREE.MathUtils.smoothstep(d, CROWN_WIDTH * 0.5, CROWN_WIDTH));
  }
  return { rut, crown };
}

/** A shade that darkens the ground at the foot of trunks, rocks, logs and walls, and under bushes. */
function contactShade(x: number, z: number): number {
  let k = 1;
  for (const b of MAP.blocks) {
    if (b.kind === 'fence') continue;
    const dx = Math.max(0, Math.abs(x - b.center.x) - b.size.x / 2);
    const dz = Math.max(0, Math.abs(z - b.center.z) - b.size.z / 2);
    if (dx > CONTACT.reach * 2 || dz > CONTACT.reach * 2) continue;
    const d = Math.hypot(dx, dz);
    k = Math.min(k, 1 - CONTACT.dark * Math.exp(-d / (CONTACT.reach * (b.kind === 'tree' ? 0.8 : 0.5))));
  }
  for (const b of MAP.foliage ?? []) {
    const d = Math.hypot(x - b.x, z - b.z) / (b.radius * 1.15);
    if (d < 1.3) k *= 1 - CONTACT.bush * (1 - THREE.MathUtils.smoothstep(d, 0.4, 1.3));
  }
  return k;
}

/** The ground's material: the kit's lighting model with the splat blend patched in. */
function groundMaterial(kit: Kit): THREE.Material {
  const p = kit.p;
  const size = p.surfaceMaps ? 1024 : 512;
  const detail = groundDetail(size);
  const mat = p.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMap: kit.envMap, envMapIntensity: 0.5 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const c = (h: number) => new THREE.Color(h);
  const bump = p.surfaceMaps;
  mat.customProgramCacheKey = () => `wlGround:${bump}`;
  mat.onBeforeCompile = (s) => {
    s.uniforms.gDetail = { value: detail };
    s.uniforms.cGrass = { value: c(SURFACE.grass) };
    s.uniforms.cDry = { value: c(SURFACE.grassDry) };
    s.uniforms.cLeaf = { value: c(SURFACE.leaves) };
    s.uniforms.cLeaf2 = { value: c(SURFACE.leaves2) };
    s.uniforms.cEarth = { value: c(SURFACE.earth) };
    s.uniforms.cGravel = { value: c(SURFACE.gravel) };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vGW; varying vec3 vGN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat; vGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D gDetail; uniform vec3 cGrass; uniform vec3 cDry; uniform vec3 cLeaf; uniform vec3 cLeaf2; uniform vec3 cEarth; uniform vec3 cGravel;
        varying vec4 vSplat; varying vec3 vGW; varying vec3 vGN;
        float gwH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gwN(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gwH(i), gwH(i + vec2(1, 0)), f.x), mix(gwH(i + vec2(0, 1)), gwH(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 guv = vGW.xz / ${DETAIL_METRES.toFixed(2)};
        vec4 gt1 = texture2D(gDetail, guv);
        vec4 gt2 = texture2D(gDetail, guv * 0.31 + vec2(0.37, 0.71));
        vec4 gt = mix(gt1, gt2, 0.3);
        // Height blend: where two surfaces meet, the taller detail (a grass tuft, a pebble) wins.
        vec4 ghb = vSplat * 1.5 + gt * 0.55;
        float gmx = max(max(ghb.x, ghb.y), max(ghb.z, ghb.w));
        vec4 gb = max(ghb - (gmx - 0.3), 0.0);
        gb /= max(dot(gb, vec4(1.0)), 1e-4);
        float gn = gwN(vGW.xz * 0.35) * 0.6 + gwN(vGW.xz * 1.7) * 0.4;
        // Grass: drier patches, and broad swells of lusher, darker sward, so the meadow never reads as one flat green.
        float gSwell = gwN(vGW.xz * 0.07 + 3.0) * 0.65 + gwN(vGW.xz * 0.19) * 0.35;
        vec3 gGrass = mix(cGrass, cDry, smoothstep(0.5, 0.88, gn) * 0.7) * (0.42 + 0.95 * gt.r) * (0.72 + 0.5 * gSwell);
        vec3 gLeaf = mix(cLeaf, cLeaf2, smoothstep(0.35, 0.75, gwN(vGW.xz * 2.1 + 5.0))) * (0.4 + 0.95 * gt.g);
        vec3 gEarth = cEarth * (0.6 + 0.6 * gt.b);
        vec3 gGravel = cGravel * (0.4 + 0.9 * gt.a);
        diffuseColor.rgb *= gGrass * gb.x + gLeaf * gb.y + gEarth * gb.z + gGravel * gb.w;
        float gRough = dot(gb, vec4(0.96, 0.86, 0.93, 0.78));`,
      );
    if (p.pbr) s.fragmentShader = s.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;');
    if (bump) {
      s.fragmentShader = s.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float ge = 1.0 / ${size.toFixed(1)};
          float h0 = dot(gb, gt1);
          float hx = dot(gb, texture2D(gDetail, guv + vec2(ge, 0.0))) - h0;
          float hz = dot(gb, texture2D(gDetail, guv + vec2(0.0, ge))) - h0;
          vec3 nW = normalize(normalize(vGN) + vec3(-hx, 0.0, -hz) * ${DETAIL_BUMP.toFixed(2)});
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      );
    }
  };
  return mat;
}

/** Writes a heightfield mesh over the grid lines `xs` × `zs`, skipping cells `skip` says, into one geometry. */
function heightfield(xs: number[], zs: number[], skip: (x0: number, x1: number, z0: number, z1: number) => boolean, shadeAt: (x: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const colr = new Float32Array(nx * nz * 3);
  const spl = new Float32Array(nx * nz * 4);
  const w: [number, number, number, number] = [0, 0, 0, 0];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i]!;
      const z = zs[j]!;
      const k = j * nx + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundY(x, z);
      pos[k * 3 + 2] = z;
      const c = shadeAt(x, z);
      colr[k * 3] = c.r;
      colr[k * 3 + 1] = c.g;
      colr[k * 3 + 2] = c.b;
      splatAt(x, z, w);
      const tr = Math.abs(x) <= HALF_X && Math.abs(z) <= HALF_Z ? trackAt(x, z) : { rut: 0, crown: 0 };
      if (tr.crown > 0 || tr.rut > 0) {
        // The grassy crown between the ruts, the ruts themselves bare earth.
        const g = tr.crown * 0.9;
        w[0] = w[0] * (1 - g) + g;
        w[2] = w[2] * (1 - g);
        w[1] *= 1 - g;
      }
      spl.set(w, k * 4);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (skip(xs[i]!, xs[i + 1]!, zs[j]!, zs[j + 1]!)) continue;
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // The terrain's split, (x0, z0)–(x1, z1), so subdivided cells stay on the field's own triangles.
      idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Grid lines from -far to far: `fine` apart inside ±`near` (on whole metres, so ±60 and ±40 are lines), growing outside. */
function lines(near: number, fine: number, far: number): number[] {
  const out: number[] = [];
  for (let x = -near; x <= near + 1e-6; x += fine) out.push(Math.round(x * 1000) / 1000);
  let step = fine;
  let x = near;
  while (x < far) {
    step = Math.min(step * 1.18, 40);
    x += step;
    out.push(x);
    out.unshift(-x);
  }
  return out;
}

export function buildGround(kit: Kit, group: THREE.Group): void {
  const p = kit.p;
  const mat = groundMaterial(kit);
  const tmp = new THREE.Color();
  // Macro shade: broad lighter and darker swathes, a cooler blue-green in the hollows, contact shade at every foot.
  const shade = (x: number, z: number) => {
    const n = fbm2(x * 0.045, z * 0.045, 3, 31);
    const f = fbm2(x * 0.3, z * 0.3, 2, 32);
    const inside = Math.abs(x) <= HALF_X + 0.5 && Math.abs(z) <= HALF_Z + 0.5;
    const k = (0.84 + (n - 0.5) * 0.34 + (f - 0.5) * 0.1) * (inside ? contactShade(x, z) : 1);
    const tr = inside ? trackAt(x, z) : { rut: 0 };
    const wet = 1 - tr.rut * 0.38;
    // Far outside the fence the floor sits in the forest's shade: darker and cooler, so from above it reads as woods.
    const outside = Math.max(Math.abs(x) - HALF_X, Math.abs(z) - HALF_Z);
    const deep = THREE.MathUtils.smoothstep(outside, 20, 70);
    const kk = k * wet * (1 - deep * 0.55);
    return tmp.setRGB(kk * (0.97 + (n - 0.5) * 0.1) * (1 - deep * 0.35), kk, kk * (1.0 + (0.5 - n) * 0.12) * (1 + deep * 0.1));
  };
  // The field: the terrain's own grid, every half metre on Ultra (the same planes, finer paint).
  const step = p.surfaceMaps ? 0.5 : 1;
  const fx: number[] = [];
  const fz: number[] = [];
  for (let x = -HALF_X; x <= HALF_X + 1e-6; x += step) fx.push(x);
  for (let z = -HALF_Z; z <= HALF_Z + 1e-6; z += step) fz.push(z);
  const field = new THREE.Mesh(heightfield(fx, fz, () => false, shade), mat);
  field.name = 'ground';
  field.receiveShadow = true;
  group.add(field);
  // The world round it: fine near the fence, coarse towards the hills; nothing under the field.
  const far = p.scenery === 'full' ? 700 : 500;
  const xs = lines(HALF_X + 6, p.scenery === 'full' ? 2 : 3, far);
  const zs = lines(HALF_Z + 6, p.scenery === 'full' ? 2 : 3, far);
  const outer = new THREE.Mesh(heightfield(xs, zs, (x0, x1, z0, z1) => x0 >= -HALF_X - 1e-6 && x1 <= HALF_X + 1e-6 && z0 >= -HALF_Z - 1e-6 && z1 <= HALF_Z + 1e-6, shade), mat);
  outer.name = 'ground';
  outer.receiveShadow = true;
  group.add(outer);
}

/**
 * Puddles in the track ruts and still pools in the creek bed: flat, a few millimetres proud of the ground, mirror-smooth
 * on Ultra so the moon and the lanterns glint in them. Returned for screen-space reflections.
 */
export function buildPuddles(kit: Kit, group: THREE.Group): THREE.Mesh[] {
  const r = rng(77);
  const out: THREE.Mesh[] = [];
  const mat = kit.p.pbr
    ? new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.04, metalness: 0, envMap: kit.envMap, envMapIntensity: 1.6 })
    : new THREE.MeshLambertMaterial({ color: 0x24324a });
  const geos: THREE.BufferGeometry[] = [];
  const spot = (x: number, z: number, len: number, wid: number, yaw: number) => {
    const g = new THREE.CircleGeometry(1, 20);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const a = Math.atan2(py, px);
      const wob = 1 + (noise2(Math.cos(a) * 2 + x, Math.sin(a) * 2 + z, 51) - 0.5) * 0.5;
      pos.setXY(i, px * len * wob, py * wid * wob);
    }
    g.rotateX(-Math.PI / 2);
    g.rotateY(yaw);
    g.translate(x, 0, z);
    // Lay each vertex on the ground under it, a hair above.
    const p2 = g.attributes.position as THREE.BufferAttribute;
    let low = Infinity;
    for (let i = 0; i < p2.count; i++) low = Math.min(low, groundY(p2.getX(i), p2.getZ(i)));
    for (let i = 0; i < p2.count; i++) p2.setY(i, Math.max(low + 0.035, groundY(p2.getX(i), p2.getZ(i)) + 0.012));
    g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  };
  for (const t of TRACKS) {
    let along = 0;
    for (let i = 1; i < t.path.length; i++) {
      const a = t.path[i - 1]!;
      const b = t.path[i]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (let s = 2; s < len - 2; s += 5 + r() * 9) {
        if (r() > 0.55) continue;
        const side = r() > 0.5 ? 1 : -1;
        const x = a.x + ((b.x - a.x) * s) / len + nx * RUT_OFFSET * side;
        const z = a.z + ((b.z - a.z) * s) / len + nz * RUT_OFFSET * side;
        spot(x, z, 0.5 + r() * 1.1, 0.13 + r() * 0.06, yaw);
      }
      along += len;
    }
    void along;
  }
  // Still pools along the creek bed (the gravel patch's line).
  const creek = (MAP.ground?.patches ?? []).find((p) => p.surface === 'gravel');
  if (creek?.path) {
    for (let i = 2; i < creek.path.length - 2; i += 3) {
      if (hash2(i, 3, 52) > 0.6) continue;
      const a = creek.path[i]!;
      const b = creek.path[i + 1]!;
      spot(a.x, a.z, 0.9 + hash2(i, 1, 53) * 1.4, 0.35 + hash2(i, 2, 54) * 0.25, -Math.atan2(b.z - a.z, b.x - a.x));
    }
  }
  if (!geos.length) return out;
  const merged = new THREE.Mesh(mergeAll(geos), mat);
  merged.name = 'puddle';
  merged.receiveShadow = true;
  group.add(merged);
  out.push(merged);
  return out;
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of geos) n += g.attributes.position!.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position!.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal!.array as Float32Array, o * 3);
    o += g.attributes.position!.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}
