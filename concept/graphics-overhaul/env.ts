import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from './kit';
import type { Preset } from './quality';
import { canvasTex, fbm, tnoise } from './textures';

/**
 * Sky, sun, clouds and the world round the yard: Breath of the Wild's colour and light (saturated greens, a deep blue
 * zenith fading to a warm haze, soft blue shadows) behind Valorant-clean props.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const SUN_DIR = new THREE.Vector3(-0.6, 0.5, 0.64).normalize();

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunOnly;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.75, h), 0.7));
  col = mix(col, ground, smoothstep(0.0, -0.12, h));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 6.0) * 0.18 + pow(s, 64.0) * 0.6);
  float disc = smoothstep(0.9993, 0.9997, s);
  col = mix(col, sunColor * 18.0, disc);
  if (sunOnly > 0.5) col = sunColor * (disc * 18.0 + pow(s, 400.0) * 4.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function skyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      zenith: { value: new THREE.Color(0x2f72d6) },
      horizon: { value: new THREE.Color(0xd6ecf6) },
      ground: { value: new THREE.Color(0x9fb48a) },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color(0xfff2d6) },
      sunOnly: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.name = 'sky';
  return m;
}

/** Painterly cumulus: soft sprites with a lit top and a flat, cooler underside. */
function clouds(group: THREE.Group): void {
  const tex = canvasTex(512, 256, (g) => {
    const img = g.createImageData(512, 256);
    for (let j = 0; j < 256; j++) {
      for (let i = 0; i < 512; i++) {
        const u = i / 512;
        const v = j / 256;
        const blob = Math.max(0, 1 - Math.hypot((u - 0.5) * 2.1, (v - 0.62) * 3.2));
        const n = fbm(u * 1.0, v * 0.5, 6, 5, 70);
        let a = Math.max(0, Math.min(1, (blob * 1.25 + (n - 0.5) * 0.9 - 0.25) * 3));
        if (v > 0.74) a *= Math.max(0, 1 - (v - 0.74) * 12); // a flat base
        const shade = 1 - Math.max(0, v - 0.45) * 0.55;
        const k = (j * 512 + i) * 4;
        img.data[k] = 255 * (0.9 + 0.1 * shade);
        img.data[k + 1] = 255 * (0.92 + 0.08 * shade);
        img.data[k + 2] = 255;
        img.data[k + 3] = a * 255;
        // Cool, slightly darker underside.
        img.data[k] *= shade;
        img.data[k + 1] *= 0.96 + 0.04 * shade;
      }
    }
    g.putImageData(img, 0, 0);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: 0xffffff });
  const spots: [number, number, number][] = [
    [-300, 150, -500],
    [120, 190, -560],
    [480, 130, -320],
    [-520, 110, 120],
    [260, 160, 420],
    [-180, 210, 520],
    [600, 120, 150],
    [-60, 120, -620],
    [-640, 170, -260],
    [380, 220, -120],
  ];
  for (const [x, y, z] of spots) {
    const s = new THREE.Sprite(mat);
    const sc = 160 + tnoise(x * 0.01, z * 0.01, 4, 71) * 180;
    s.scale.set(sc * 2, sc, 1);
    s.position.set(x, y, z);
    s.renderOrder = -5;
    group.add(s);
  }
}

/** A broadleaf tree: a forked trunk and a crown of many noisy lobes, darker inside, lit at the top. */
function tree(k: Kit, x: number, z: number, s: number, seed: number): void {
  const p = k.p;
  const full = p.scenery === 'full';
  const bark = 0x5a4836;
  const trunk = new THREE.CylinderGeometry(0.16 * s, 0.3 * s, 2.8 * s, full ? 10 : 6);
  k.add('foliage', trunk, new THREE.Matrix4().makeTranslation(x, 1.4 * s, z), bark, {});
  if (full) {
    // Two limbs forking into the crown.
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.07 * s, 0.13 * s, 1.8 * s, 6);
      const m = new THREE.Matrix4().compose(V(x + side * 0.35 * s, 3.3 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, seed, side * 0.45)), V(1, 1, 1));
      k.add('foliage', g, m, bark, {});
    }
  }
  const lobes = full ? 11 : 3;
  const detail = full ? 3 : 1;
  const greens = [0x4d7f36, 0x5b8c3c, 0x436f31, 0x679a45];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 * 2.618 + seed;
    const r = i === 0 ? 0 : (0.7 + ((i * 0.37) % 0.6)) * 1.3 * s;
    const y = (i === 0 ? 4.6 : 3.4 + ((i * 0.53) % 1) * 1.8) * s;
    const rad = (i === 0 ? 2.0 : full ? 1.15 + ((i * 0.29) % 0.5) : 1.6) * s;
    const g = new THREE.IcosahedronGeometry(rad, detail);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Normals point out from the lobe's centre, so the crown shades softly instead of as flat facets.
    const nrm = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v);
      const vy = pos.getY(v);
      const vz = pos.getZ(v);
      const l = Math.hypot(vx, vy, vz) || 1;
      nrm.set([vx / l, vy / l, vz / l], v * 3);
      const n = 1 + (tnoise(vx * 0.6 + seed + i, vz * 0.6 + vy * 0.4, 8, 80) - 0.5) * (full ? 0.55 : 0.25);
      pos.setXYZ(v, vx * n, vy * n * 0.85, vz * n);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    // Lower and inner lobes darker: the crown reads as a mass with depth, not a cluster of balls.
    const shade = 0.78 + Math.min(1, (y / s - 3.2) / 2.4) * 0.3;
    const c = new THREE.Color(greens[(i + Math.floor(seed * 7)) % greens.length]!).multiplyScalar(shade);
    k.add('foliage', g, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * r, y, z + Math.sin(a) * r), c, { ground: y - rad, groundRange: rad * 1.6 });
  }
}

/** A conifer: tiers of ragged cones, each edge broken by noise. */
function pine(k: Kit, x: number, z: number, s: number, seed: number): void {
  const full = k.p.scenery === 'full';
  const segs = full ? 14 : 6;
  k.add('foliage', new THREE.CylinderGeometry(0.1 * s, 0.22 * s, 2.2 * s, 6), new THREE.Matrix4().makeTranslation(x, 1.1 * s, z), 0x584232, {});
  const tiers = full ? 5 : 3;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const g = new THREE.ConeGeometry((1.9 - f * 1.3) * s, (2.4 - f * 0.6) * s, segs, full ? 3 : 1, true);
    if (full) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v);
        const vy = pos.getY(v);
        const vz = pos.getZ(v);
        const ang = Math.atan2(vz, vx);
        const n = 1 + (tnoise(ang * 1.3 + seed * 5 + i, vy * 0.8, 8, 81) - 0.5) * 0.5;
        const droop = vy < 0 ? -Math.abs(Math.sin(ang * 4 + seed)) * 0.25 * s : 0;
        pos.setXYZ(v, vx * n, vy + droop, vz * n);
      }
      g.computeVertexNormals();
    }
    const c = new THREE.Color(i % 2 ? 0x34613d : 0x2d5636).multiplyScalar(0.85 + f * 0.25);
    k.add('foliage', g, new THREE.Matrix4().makeTranslation(x, (2.4 + i * (full ? 1.05 : 1.4)) * s, z), c, { ground: (1.2 + i * 1.05) * s, groundRange: 2.2 * s });
  }
}

/** Hills and mountains far out: big soft shapes the haze turns blue. */
function hills(k: Kit): void {
  const ring = k.p.scenery === 'full' ? 28 : 14;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const r = 480 + tnoise(i * 0.37, 0.5, 8, 90) * 180;
    const hgt = 18 + tnoise(i * 0.53, 0.2, 8, 91) * 40;
    const g = new THREE.SphereGeometry(1, k.p.scenery === 'full' ? 40 : 10, k.p.scenery === 'full' ? 14 : 8, 0, Math.PI * 2, 0, Math.PI / 2);
    if (k.p.scenery === 'full') {
      // Ridges and gullies instead of a smooth dome.
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v);
        const vy = pos.getY(v);
        const vz = pos.getZ(v);
        const n = 1 + (tnoise(vx * 2 + i, vz * 2 + vy, 8, 92) - 0.5) * 0.35 * vy;
        pos.setXYZ(v, vx * (1 + (n - 1) * 0.3), vy * n, vz * (1 + (n - 1) * 0.3));
      }
      g.computeVertexNormals();
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, -4, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(110 + hgt * 2, hgt, 80 + hgt));
    k.add('foliage', g, m, i % 3 === 0 ? 0x5f8a50 : 0x557f4a, {});
  }
  // Snow-capped peaks in the far north (Breath of the Wild's Hebra).
  for (let i = 0; i < 5; i++) {
    const x = -420 + i * 210;
    const g = new THREE.ConeGeometry(130, 190 + (i % 2) * 60, k.p.scenery === 'full' ? 7 : 5);
    k.add('foliage', g, new THREE.Matrix4().makeTranslation(x, 80, -720), 0x8fa3b8, {});
    const cap = new THREE.ConeGeometry(48, 70 + (i % 2) * 22, k.p.scenery === 'full' ? 7 : 5);
    k.add('foliage', cap, new THREE.Matrix4().makeTranslation(x, 170 + (i % 2) * 30 + 10, -720), 0xf2f6fa, {});
  }
}

/** Industrial neighbours outside the north and east walls: a big shed, a water tower, a gantry crane. */
function neighbours(k: Kit): void {
  // North shed (world -z) with standing-seam cladding, a roof and roller doors.
  k.box('cladding', -6, 6, -32, 40, 12, 14, 0xb9c6cf, { radius: 0.05 });
  k.box('steel', -6, 12.4, -32, 41, 0.8, 15, 0x5b6773, { radius: 0.05 });
  for (let i = 0; i < 4; i++) k.box('corrugated', -20 + i * 9, 3, -24.9, 5, 6, 0.2, 0xe6782f, { radius: 0.02 });
  k.box('paint', -6, 9.5, -24.9, 18, 2.2, 0.15, 0x2f64b4, { radius: 0.02 });
  // Parapet, a strip of clerestory windows, downpipes and roof vents.
  k.box('steel', -6, 12.95, -25.05, 41, 0.35, 0.25, 0x48525c, { radius: 0.02 });
  k.box('lens', -6, 11.2, -24.92, 38, 0.9, 0.06, 0x8fb4c8, { radius: 0 });
  for (let i = 0; i < 6; i++) {
    const x = -25 + i * 7.6;
    k.add('steel', new THREE.CylinderGeometry(0.08, 0.08, 12.6, 8), new THREE.Matrix4().makeTranslation(x, 6.3, -24.8), 0x5b6773, {});
    k.add('steel', new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12), new THREE.Matrix4().makeTranslation(x + 3, 13.2, -32), 0x9aa3ab, {});
  }
  k.box('paint', 15.5, 1.1, -24.9, 1, 2.2, 0.12, 0x3a3f45, { radius: 0.02 });
  // Water tower to the east.
  const segs = k.p.curveSegments;
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) k.add('steel', new THREE.CylinderGeometry(0.15, 0.15, 14, 8), new THREE.Matrix4().makeTranslation(44 + dx, 7, -14 + dz), 0x8a949e, {});
  k.add('paint', new THREE.CylinderGeometry(4, 4, 5, segs), new THREE.Matrix4().makeTranslation(44, 16, -14), 0xdfe7ec, {});
  k.add('steel', new THREE.ConeGeometry(4.2, 1.6, segs), new THREE.Matrix4().makeTranslation(44, 19.3, -14), 0xc94a3d, {});
  // Gantry crane over the yard's south-east.
  for (const x of [32, 48]) for (const z of [22, 34]) k.box('steel', x, 8, z, 0.8, 16, 0.8, 0xf2b52c, { radius: 0.05 });
  for (const z of [22, 34]) k.box('steel', 40, 16.4, z, 17, 1.2, 1, 0xf2b52c, { radius: 0.05 });
  k.box('steel', 40, 17.4, 28, 2.5, 1.2, 13, 0x2a2e35, { radius: 0.05 });
  // Stacked containers beyond the east wall.
  const cols = [0x2f9a90, 0xe0652c, 0xc2413d, 0x2f64b4, 0xe8b53a];
  for (let i = 0; i < 8; i++) for (let s = 0; s < 1 + (i % 3); s++) k.box('corrugated', 33 + (i % 2) * 6.5, 1.3 + s * 2.6, -10 + Math.floor(i / 2) * 2.6, 6, 2.55, 2.45, cols[(i + s * 2) % cols.length]!, { radius: 0.03, ground: 0 });
}

/** A thin straight member from a to b (lattice steel, ladders, braces). */
function member(k: Kit, key: string, a: THREE.Vector3, b: THREE.Vector3, t: number, tint: number): void {
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  k.add(key, new THREE.BoxGeometry(t, len, t), new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, V(1, 1, 1)), tint, {});
}

/** A lattice power pylon: four tapering legs, cross-bracing, two cross-arms with insulators. Returns the arm tips. */
function pylon(k: Kit, x: number, z: number, ry: number): THREE.Vector3[] {
  const tint = 0x9aa1a8;
  const H = 30;
  const base = 3.2;
  const top = 0.8;
  const levels = 7;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const at = (lx: number, y: number, lz: number) => V(x + lx * c + lz * sn, y, z - lx * sn + lz * c);
  const half = (y: number) => base + (top - base) * Math.min(1, y / (H * 0.8));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  for (let l = 0; l < levels; l++) {
    const y0 = (l / levels) * H;
    const y1 = ((l + 1) / levels) * H;
    const h0 = half(y0);
    const h1 = half(y1);
    for (let ci = 0; ci < 4; ci++) {
      const [ax, az] = corners[ci]!;
      const [bx, bz] = corners[(ci + 1) % 4]!;
      member(k, 'galv', at(ax * h0, y0, az * h0), at(ax * h1, y1, az * h1), 0.16, tint);
      member(k, 'galv', at(ax * h1, y1, az * h1), at(bx * h1, y1, bz * h1), 0.08, tint);
      member(k, 'galv', at(ax * h0, y0, az * h0), at(bx * h1, y1, bz * h1), 0.06, tint);
      member(k, 'galv', at(bx * h0, y0, bz * h0), at(ax * h1, y1, az * h1), 0.06, tint);
    }
  }
  const tips: THREE.Vector3[] = [];
  for (const [y, w] of [[H * 0.72, 7], [H * 0.9, 5]] as const) {
    const hw = half(y);
    for (const sx of [-1, 1]) {
      member(k, 'galv', at(sx * hw, y, -hw), at(sx * w, y, 0), 0.1, tint);
      member(k, 'galv', at(sx * hw, y, hw), at(sx * w, y, 0), 0.1, tint);
      member(k, 'galv', at(sx * hw, y + 1.2, 0), at(sx * w, y, 0), 0.07, tint);
      // A string of glass insulators hanging from the arm tip.
      const tip = at(sx * w, y, 0);
      for (let d = 0; d < 4; d++) k.add('chrome', new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), new THREE.Matrix4().makeTranslation(tip.x, y - 0.25 - d * 0.22, tip.z), 0x6f8f86, {});
      tips.push(V(tip.x, y - 1.1, tip.z));
    }
  }
  return tips;
}

/** A sagging cable between two points. */
function cable(k: Kit, a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t), 0)));
  }
  k.add('dark', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 4, false), new THREE.Matrix4(), 0x2b2d30, {});
}

/** Further neighbours for the Ultra skyline: a power line, a second shed with a sawtooth roof, a works chimney. */
function skyline(k: Kit): void {
  // A power line marching north-south beyond the east stacks.
  const line = [-110, -55, 0, 55, 110].map((z, i) => pylon(k, 92 + i * 3, z, 0.03));
  for (let i = 0; i < line.length - 1; i++) for (let j = 0; j < line[i]!.length; j++) cable(k, line[i]![j]!, line[i + 1]![j]!, 3.2);
  // A second shed to the south-east: blue-grey cladding, a sawtooth north-light roof, a loading canopy.
  const sx = 76;
  const sz = 46;
  k.box('cladding', sx, 5, sz, 28, 10, 20, 0x8fa0ad, { radius: 0.05 });
  for (let i = 0; i < 4; i++) {
    // One tooth: a right-angled prism, glazed on its steep face.
    const tooth = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(7, 0), new THREE.Vector2(0, 2.8)]);
    const g = new THREE.ExtrudeGeometry(tooth, { depth: 19.6, bevelEnabled: false }).translate(0, 0, -9.8);
    k.add('steel', g, new THREE.Matrix4().makeTranslation(sx - 14 + i * 7, 10, sz), 0x59636d, {});
    k.box('lens', sx - 14 + i * 7 + 0.06, 11.35, sz, 0.08, 2.3, 19.2, 0x9cc4d8, { radius: 0 });
  }
  k.box('steel', sx, 4.4, sz - 11.2, 14, 0.3, 2.6, 0x3d434a, { radius: 0.03 });
  for (let i = 0; i < 3; i++) k.box('corrugated', sx - 8 + i * 8, 2, sz - 10.05, 5, 4, 0.12, 0xd8d2c4, { radius: 0.02 });
  // A works chimney to the north-east with red and white bands and a ladder cage.
  const cx = 70;
  const cz = -78;
  const segs = k.p.curveSegments;
  k.add('precast', new THREE.CylinderGeometry(1.5, 2.6, 46, segs), new THREE.Matrix4().makeTranslation(cx, 23, cz), 0xb8b2a8, {});
  for (let i = 0; i < 4; i++) k.add('paint', new THREE.CylinderGeometry(1.53 + i * 0.02 + 0.02, 1.58 + i * 0.02 + 0.03, 1.6, segs), new THREE.Matrix4().makeTranslation(cx, 44.6 - i * 3.2, cz), i % 2 ? 0xf0ede6 : 0xc63a2e, {});
  k.add('steel', new THREE.CylinderGeometry(1.65, 1.65, 0.3, segs), new THREE.Matrix4().makeTranslation(cx, 40, cz), 0x4a4f55, {});
  member(k, 'steel', V(cx + 2.7, 0, cz), V(cx + 1.65, 46, cz), 0.1, 0x4a4f55);
  // Street lights along the road.
  for (let x = -60; x <= 60; x += 15) {
    member(k, 'galv', V(x, 0, -17.2), V(x, 7, -17.2), 0.14, 0x8c939a);
    member(k, 'galv', V(x, 7, -17.2), V(x, 7.3, -18.6), 0.08, 0x8c939a);
    k.box('steel', x, 7.25, -18.9, 0.3, 0.12, 0.7, 0x3a3f45, { radius: 0.03 });
  }
}

/** Water tower and crane details for Ultra: braces, a walkway with a rail, a ladder, the crane's cab and cables. */
function neighbourDetail(k: Kit): void {
  const segs = k.p.curveSegments;
  const tx = 44;
  const tz = -14;
  const legs = [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]] as const;
  for (const y0 of [1, 5.5, 10]) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i]!;
      const [bx, bz] = legs[(i + 1) % 4]!;
      member(k, 'steel', V(tx + ax, y0, tz + az), V(tx + bx, y0 + 4.5, tz + bz), 0.07, 0x7d8790);
      member(k, 'steel', V(tx + bx, y0, tz + bz), V(tx + ax, y0 + 4.5, tz + az), 0.07, 0x7d8790);
    }
  }
  k.add('steel', new THREE.CylinderGeometry(4.6, 4.6, 0.12, segs), new THREE.Matrix4().makeTranslation(tx, 13.5, tz), 0x5b6570, {});
  k.add('steel', new THREE.CylinderGeometry(4.6, 4.6, 0.9, segs, 1, true), new THREE.Matrix4().makeTranslation(tx, 14, tz), 0x8a949e, {});
  for (let y = 0.5; y < 13.5; y += 0.4) k.box('steel', tx - 2.2, y, tz + 0.4, 0.04, 0.04, 0.5, 0x7d8790, { radius: 0 });
  member(k, 'steel', V(tx - 2.2, 0, tz + 0.15), V(tx - 2.2, 13.5, tz + 0.15), 0.06, 0x7d8790);
  member(k, 'steel', V(tx - 2.2, 0, tz + 0.65), V(tx - 2.2, 13.5, tz + 0.65), 0.06, 0x7d8790);
  // Crane: a cab under one end beam, a ladder, hoist cables and a hook.
  k.box('paint', 47.4, 14.6, 22, 1.8, 1.8, 1.6, 0xf2b52c, { radius: 0.05 });
  k.box('lens', 47.4, 14.7, 21.18, 1.5, 1, 0.05, 0x9cc4d8, { radius: 0 });
  for (const dx of [-0.25, 0.25]) member(k, 'dark', V(40 + dx, 16.8, 28), V(40 + dx, 9.5, 28), 0.04, 0x2a2e35);
  k.box('steel', 40, 9.3, 28, 0.9, 0.4, 0.5, 0xf2b52c, { radius: 0.03 });
  for (let y = 0.5; y < 15.5; y += 0.4) k.box('steel', 48.55, y, 34, 0.04, 0.04, 0.5, 0xd9a32a, { radius: 0 });
}

export function buildWorld(kit: Kit, group: THREE.Group): void {
  const p = kit.p;
  // Grass round the yard, a road along the north.
  // Grass: one big plane with broad patches of lighter and darker green baked into its vertices.
  const n = p.scenery === 'full' ? 240 : 90;
  const gg = new THREE.PlaneGeometry(900, 900, n, n).rotateX(-Math.PI / 2);
  kit.add('grass', gg, new THREE.Matrix4().makeTranslation(0, -0.2, 0), p.scenery === 'full' ? 0x6f8c48 : 0x7c9f4f, {
    colorFn: (x, _y, z) => (p.scenery === 'full' ? 0.66 + fbm(x / 900 + 0.5, z / 900 + 0.5, 12, 4, 60) * 0.5 + (fbm(x / 900 + 0.5, z / 900 + 0.5, 40, 3, 64) - 0.5) * 0.2 : 0.82 + fbm(x / 900 + 0.5, z / 900 + 0.5, 12, 4, 60) * 0.36),
  });
  kit.box('concrete', 0, -0.17, -21.5, 140, 0.1, 9, 0x8f9298, { radius: 0 });
  // Trees all round, thicker to the south and west.
  let seed = 1;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = p.scenery === 'full' ? 140 : 50;
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 34 + rnd() * (p.scenery === 'full' ? 120 : 80);
    const x = Math.cos(a) * r * 1.2;
    const z = Math.sin(a) * r;
    if (z < -20 && z > -42 && Math.abs(x) < 70) continue; // the road and the shed
    if (x > 26 && x < 52 && z > -14 && z < 38) continue; // the container stacks and crane
    const s = 0.9 + rnd() * 0.7;
    if (rnd() > 0.55) pine(kit, x, z, s * 1.2, rnd());
    else tree(kit, x, z, s, rnd() * 6);
  }
  hills(kit);
  if (p.scenery === 'full') {
    neighbours(kit);
    neighbourDetail(kit);
    skyline(kit);
  }
  else {
    // Low keeps the skyline as cheap silhouettes: the shed, the water tower, the crane, a chimney.
    kit.box('cladding', -6, 6, -32, 40, 12, 14, 0xb9c6cf, { radius: 0 });
    kit.box('steel', -6, 12.4, -32, 41, 0.8, 15, 0x5b6773, { radius: 0 });
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) kit.box('steel', 44 + dx, 7, -14 + dz, 0.3, 14, 0.3, 0x8a949e, { radius: 0 });
    kit.add('paint', new THREE.CylinderGeometry(4, 4, 5, 10), new THREE.Matrix4().makeTranslation(44, 16, -14), 0xdfe7ec, {});
    kit.add('steel', new THREE.ConeGeometry(4.2, 1.6, 10), new THREE.Matrix4().makeTranslation(44, 19.3, -14), 0xc94a3d, {});
    for (const x of [32, 48]) for (const z of [22, 34]) kit.box('steel', x, 8, z, 0.8, 16, 0.8, 0xf2b52c, { radius: 0 });
    for (const z of [22, 34]) kit.box('steel', 40, 16.4, z, 17, 1.2, 1, 0xf2b52c, { radius: 0 });
    kit.add('precast', new THREE.CylinderGeometry(1.5, 2.6, 46, 8), new THREE.Matrix4().makeTranslation(70, 23, -78), 0xb8b2a8, {});
  }
  group.add(kit.build());
  if (p.clouds) clouds(group);
}

export interface Lights {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

export function addLights(scene: THREE.Scene, p: Preset, target = new THREE.Vector3(0, 0, 0), span = 34): Lights {
  const sun = new THREE.DirectionalLight(0xffe4c0, p.pbr ? 3.5 : 2.9);
  sun.position.copy(target).addScaledVector(SUN_DIR, 80);
  sun.target.position.copy(target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(p.shadowMap, p.shadowMap);
  const c = sun.shadow.camera;
  c.left = -span;
  c.right = span;
  c.top = span;
  c.bottom = -span;
  c.near = 10;
  c.far = 200;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = p.softShadows ? 3 : 1;
  sun.shadow.blurSamples = 16;
  scene.add(sun, sun.target);
  // Sky fill: blue from above, warm bounce from the yard (shadows read cool, as in Breath of the Wild).
  const hemi = new THREE.HemisphereLight(0xb9d3f2, 0xd8c6a2, p.pbr ? 1.0 : 1.6);
  scene.add(hemi);
  return { sun, hemi };
}

/** An environment map from the sky and the ground colours, for reflections on PBR materials. */
export function envFromSky(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  const dome = skyDome();
  // A softer sun in reflections: the full disc makes hot sparkles on glossy parts.
  (dome.material as THREE.ShaderMaterial).uniforms.sunColor!.value.multiplyScalar(0.12);
  s.add(dome);
  const g = new THREE.Mesh(new THREE.CircleGeometry(800, 32), new THREE.MeshBasicMaterial({ color: 0xb9ad92 }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -2;
  s.add(g);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02, 1, 1000);
  pm.dispose();
  return rt.texture;
}

export { mergeGeometries };
