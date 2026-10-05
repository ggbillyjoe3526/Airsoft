import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from './kit';
import type { Preset } from './quality';
import { canvasTex, fbm, tnoise } from './textures';

/**
 * Sky, sun, clouds and the world round the yard: Breath of the Wild's colour and light (saturated greens, a deep blue
 * zenith fading to a warm haze, soft blue shadows) behind Valorant-clean props.
 */

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

/** A Breath-of-the-Wild tree: a short trunk, a crown of soft lobes in two greens. */
function tree(k: Kit, x: number, z: number, s: number, seed: number): void {
  const p = k.p;
  const trunk = new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 2.6 * s, p.scenery === 'full' ? 10 : 6);
  k.add('foliage', trunk, new THREE.Matrix4().makeTranslation(x, 1.3 * s, z), 0x7a5a3c, {});
  const lobes = p.scenery === 'full' ? 6 : 3;
  const detail = p.scenery === 'full' ? 3 : 1;
  const greens = [0x5aa33e, 0x6fb444, 0x4f9637, 0x82c04e];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + seed;
    const r = i === 0 ? 0 : 1.1 * s;
    const y = (i === 0 ? 4.4 : 3.5 + Math.sin(a * 3) * 0.5) * s;
    const rad = (i === 0 ? 2.1 : 1.6) * s;
    const g = new THREE.IcosahedronGeometry(rad, detail);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v);
      const vy = pos.getY(v);
      const vz = pos.getZ(v);
      const n = 1 + (tnoise(vx * 0.3 + seed, vz * 0.3 + vy * 0.2, 8, 80) - 0.5) * 0.25;
      pos.setXYZ(v, vx * n, vy * n * 0.85, vz * n);
    }
    g.computeVertexNormals();
    k.add('foliage', g, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * r, y, z + Math.sin(a) * r), greens[(i + Math.floor(seed * 7)) % greens.length]!, { ground: y - rad, groundRange: rad * 1.6 });
  }
}

function pine(k: Kit, x: number, z: number, s: number, seed: number): void {
  const segs = k.p.scenery === 'full' ? 10 : 6;
  k.add('foliage', new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.6 * s, 6), new THREE.Matrix4().makeTranslation(x, 0.8 * s, z), 0x6d5038, {});
  for (let i = 0; i < 3; i++) {
    const g = new THREE.ConeGeometry((1.7 - i * 0.4) * s, (2.6 - i * 0.3) * s, segs);
    k.add('foliage', g, new THREE.Matrix4().makeTranslation(x, (2.2 + i * 1.4) * s, z), i % 2 ? 0x3f8a4a : 0x357f44, { ground: (0.9 + i * 1.4) * s, groundRange: 2.2 * s });
  }
  void seed;
}

/** Hills and mountains far out: big soft shapes the haze turns blue. */
function hills(k: Kit): void {
  const ring = k.p.scenery === 'full' ? 28 : 14;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const r = 480 + tnoise(i * 0.37, 0.5, 8, 90) * 180;
    const hgt = 18 + tnoise(i * 0.53, 0.2, 8, 91) * 40;
    const g = new THREE.SphereGeometry(1, k.p.scenery === 'full' ? 24 : 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, -4, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(110 + hgt * 2, hgt, 80 + hgt));
    k.add('foliage', g, m, i % 3 === 0 ? 0x6a9c58 : 0x5d9150, {});
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

export function buildWorld(kit: Kit, group: THREE.Group): void {
  const p = kit.p;
  // Grass round the yard, a road along the north.
  // Grass: one big plane with broad patches of lighter and darker green baked into its vertices.
  const n = p.scenery === 'full' ? 240 : 90;
  const gg = new THREE.PlaneGeometry(900, 900, n, n).rotateX(-Math.PI / 2);
  kit.add('grass', gg, new THREE.Matrix4().makeTranslation(0, -0.2, 0), 0x7c9f4f, { colorFn: (x, _y, z) => 0.82 + fbm(x / 900 + 0.5, z / 900 + 0.5, 12, 4, 60) * 0.36 });
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
  if (p.scenery === 'full') neighbours(kit);
  else {
    kit.box('cladding', -6, 6, -32, 40, 12, 14, 0xb9c6cf, { radius: 0 });
    kit.box('steel', -6, 12.4, -32, 41, 0.8, 15, 0x5b6773, { radius: 0 });
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
