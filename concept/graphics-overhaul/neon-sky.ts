import * as THREE from 'three';
import type { Preset } from './quality';
import { haloTex, rng, screenAtlas, screenCell, towerTex } from './neon-assets';

/**
 * Neon Heights' night: a sky dome of deep navy over a violet city glow on the horizon (the map's CITY_NIGHT colours),
 * thin clouds lit pink from below, a few stars and a moon; the environment map reflections use (the same sky with
 * bright neon panels round the horizon); and the far city: low-rise blocks and towers with lit windows, warning lights
 * on the tall ones, a TV mast, an airliner with its navigation lights and contrail.
 */

/** Where the moon is (and the weak moonlight comes from): north-east, low. */
export const MOON_DIR = new THREE.Vector3(0.1, 0.44, 0.9).normalize();

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 glow; uniform vec3 ground; uniform vec3 cloud; uniform vec3 moonDir;
uniform float stars; uniform float moon; uniform float sunOnly;
varying vec3 vDir;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h3(vec3(i, 1.0)); float b = h3(vec3(i + vec2(1.0, 0.0), 1.0)); float c = h3(vec3(i + vec2(0.0, 1.0), 1.0)); float d = h3(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ s += n2(p) * a; p *= 2.07; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.7, h), 0.55));
  // The city's glow: strongest just over the rooftops, warmer low down.
  col += glow * exp(-max(h, 0.0) * 7.0) * 0.85;
  // Thin cloud lit from below by the city.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6;
    float c = smoothstep(0.5, 0.85, fbm(uv + vec2(3.1, 7.7)));
    float lit = exp(-h * 3.0);
    col = mix(col, cloud * (0.45 + lit * 0.9), c * smoothstep(0.02, 0.25, h) * 0.55);
  }
  // Stars: sparse points, dimmed by the glow towards the horizon.
  vec3 sd = d * 260.0;
  vec3 cell = floor(sd);
  float r = h3(cell);
  if (stars > 0.0 && r > 0.9965) {
    float s = smoothstep(0.42, 0.0, length(fract(sd) - 0.5));
    col += vec3(0.8, 0.85, 1.0) * s * (0.4 + h3(cell + 3.0) * 1.2) * smoothstep(0.12, 0.5, h) * stars;
  }
  // The moon and its halo.
  float m = max(dot(d, moonDir), 0.0);
  col += vec3(0.55, 0.6, 0.85) * (pow(m, 90.0) * 0.18 + pow(m, 12.0) * 0.05) * moon;
  // The disc by the sine of the angle off the moon (a cosine this close to 1 is lost at medium precision).
  float off = length(cross(d, moonDir));
  float disc = smoothstep(0.031, 0.027, off) * step(0.0, dot(d, moonDir));
  float mare = 0.82 + 0.18 * n2(cross(d, moonDir).xy * 160.0);
  col = mix(col, vec3(1.6, 1.62, 1.7) * mare, disc * moon);
  col = mix(col, ground, smoothstep(0.0, -0.08, h));
  if (sunOnly > 0.5) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function nightSky(opts: { stars?: number; moon?: number; scale?: number } = {}): THREE.Mesh {
  const k = opts.scale ?? 1;
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      zenith: { value: new THREE.Color(0x060a1e).multiplyScalar(k) },
      horizon: { value: new THREE.Color(0x33295a).multiplyScalar(k) },
      glow: { value: new THREE.Color(0x8a3a7a).multiplyScalar(k) },
      ground: { value: new THREE.Color(0x120f1c).multiplyScalar(k) },
      cloud: { value: new THREE.Color(0x5a3a6a).multiplyScalar(k) },
      moonDir: { value: MOON_DIR.clone() },
      stars: { value: opts.stars ?? 1 },
      moon: { value: opts.moon ?? 1 },
      sunOnly: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.name = 'sky';
  return m;
}

/**
 * The night environment map: the sky (no stars), a dark wet ground, and bright panels of neon and lit windows round the
 * horizon, so glossy and wet surfaces pick up magenta, cyan and amber, never the daytime blue-white.
 */
/** How bright the reflected night is: the sky dimmed (it lights rough walls at grazing angles), the neon panels less so. */
const ENV_SKY = 0.25;
const ENV_PANELS = 0.55;

export function nightEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  s.add(nightSky({ stars: 0, moon: 0.4, scale: ENV_SKY }));
  const g = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: 0x0b0a12 }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -2;
  s.add(g);
  const panel = (az: number, el: number, w: number, h: number, hex: number, k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k * ENV_PANELS), side: THREE.DoubleSide }));
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    m.position.set(Math.sin(a) * Math.cos(e) * 40, Math.sin(e) * 40, -Math.cos(a) * Math.cos(e) * 40);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // The avenue's two sides: magenta and violet to the west, cyan to the east, amber and red here and there.
  panel(-95, 8, 14, 4, 0xff2bd6, 3.2);
  panel(-60, 16, 5, 9, 0x9a6bff, 2.8);
  panel(-135, 6, 8, 3, 0xffa531, 3);
  panel(85, 9, 16, 3, 0x22e6ff, 2.6);
  panel(120, 15, 4, 8, 0xff2bd6, 3);
  panel(60, 5, 7, 3, 0xff3b4a, 3);
  panel(175, 10, 9, 3, 0x8dff3a, 1.6);
  panel(10, 7, 10, 3, 0xffa531, 2);
  // Rows of lit windows all round, and a soft cool street lamp overhead.
  for (let i = 0; i < 28; i++) {
    const az = i * 13 + (i % 3) * 4;
    panel(az, 22 + (i % 4) * 7, 1.4, 1.2, i % 3 ? 0xffc890 : 0x9fd8ff, 1.4);
  }
  panel(0, 82, 6, 6, 0xbfeeff, 1.2);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035, 0.1, 1000);
  pm.dispose();
  return rt.texture;
}

/** A soft glowing point that always faces the camera and pierces the haze (warning lights, plane lights). */
function glowPoint(group: THREE.Group, pos: THREE.Vector3, hex: number, size: number, k: number): void {
  const mat = new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  s.scale.setScalar(size);
  s.renderOrder = 5;
  group.add(s);
}

/**
 * The far city: low-rise blocks just past the ring of buildings round the site, then towers out to the horizon, all with
 * lit and dark windows (one unlit mesh per facade kind: they are far and dark, so their light is their windows), warning
 * lights on the tallest, crowns of neon on a few, two rooftop billboards, a TV mast. `keepOut` is the site's half size
 * plus the near ring, kept clear.
 */
export function skyline(p: Preset, group: THREE.Group): void {
  const full = p.scenery === 'full';
  const r = rng(91);
  const kinds = [0, 1, 2, 3].map((i) => ({ pos: [] as number[], uv: [] as number[], col: [] as number[], tex: towerTex(i) }));
  const glowPos: number[] = [];
  const glowCol: number[] = [];
  const quad = (arr: (typeof kinds)[number], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: number[], tint: THREE.Color) => {
    for (const v of [a, b, c, a, c, d]) arr.pos.push(v.x, v.y, v.z);
    arr.uv.push(uv[0]!, uv[1]!, uv[2]!, uv[1]!, uv[2]!, uv[3]!, uv[0]!, uv[1]!, uv[2]!, uv[3]!, uv[0]!, uv[3]!);
    for (let i = 0; i < 6; i++) arr.col.push(tint.r, tint.g, tint.b);
  };
  const tower = (x: number, z: number, w: number, d: number, h: number, kind: number, base = 0) => {
    const arr = kinds[kind]!;
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.75 + r() * 0.6);
    if (r() > 0.6) tint.multiply(new THREE.Color(1, 0.92, 1.08));
    const tileW = 20;
    const tileH = 26;
    const u0 = r();
    const v0 = r();
    const corners = [V(x - w / 2, 0, z - d / 2), V(x + w / 2, 0, z - d / 2), V(x + w / 2, 0, z + d / 2), V(x - w / 2, 0, z + d / 2)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      const len = a.distanceTo(b);
      // Faces wound to look outward.
      quad(arr, V(b.x, base, b.z), V(a.x, base, a.z), V(a.x, h, a.z), V(b.x, h, b.z), [u0, v0, u0 + len / tileW, v0 + (h - base) / tileH], tint);
    }
    // The roof: the dark of the facade.
    const roof = tint.clone().multiplyScalar(0.5);
    quad(arr, V(x - w / 2, h, z + d / 2), V(x + w / 2, h, z + d / 2), V(x + w / 2, h, z - d / 2), V(x - w / 2, h, z - d / 2), [0.01, 0.01, 0.02, 0.02], roof);
    if (h > 70 || (h > 40 && r() > 0.6)) {
      // Red aircraft warning lights on the corners of the roof.
      for (const [cx, cz] of [[x - w / 2, z - d / 2], [x + w / 2, z + d / 2]] as const) {
        glowPos.push(cx, h + 0.8, cz);
        glowCol.push(r() > 0.35 ? 1 : 0.35);
      }
    }
  };
  // Low-rise round the near ring (40–140 m), then towers (140–700 m).
  const low = full ? 140 : 60;
  for (let i = 0; i < low; i++) {
    const a = r() * Math.PI * 2;
    const rad = 48 + r() * 100;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad * 0.85;
    if (Math.abs(x) < 46 && Math.abs(z) < 38) continue;
    tower(x, z, 10 + r() * 14, 10 + r() * 14, 12 + r() * 24, r() > 0.5 ? 0 : 3);
  }
  const towers = full ? 150 : 55;
  for (let i = 0; i < towers; i++) {
    const a = r() * Math.PI * 2;
    const rad = 150 + Math.pow(r(), 0.8) * 560;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const h = 40 + Math.pow(r(), 1.6) * 190;
    const w = 18 + r() * 22;
    tower(x, z, w, w * (0.7 + r() * 0.6), h, Math.floor(r() * 4));
    if (full && h > 110 && r() > 0.4) {
      // A setback crown on the tallest.
      tower(x, z, w * 0.62, w * 0.55, h + 18 + r() * 20, 1, h);
    }
  }
  for (const [i, arr] of kinds.entries()) {
    if (!arr.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: arr.tex, vertexColors: true, fog: true }));
    m.name = `nhSkyline${i}`;
    m.frustumCulled = false;
    group.add(m);
  }
  // The warning lights: sprites through the haze.
  for (let i = 0; i < glowPos.length / 3; i++) {
    if (!full && i % 2) continue;
    glowPoint(group, V(glowPos[i * 3]!, glowPos[i * 3 + 1]!, glowPos[i * 3 + 2]!), 0xff2a1a, 7, glowCol[i]! * 0.9);
  }
  // A TV mast to the north-west, its pod lit, lights up its antenna.
  const mast = V(-310, 0, -420);
  const mm = new THREE.MeshBasicMaterial({ color: 0x0c0d16, fog: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 230, 12), mm);
  shaft.position.copy(mast).setY(115);
  group.add(shaft);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 12).scale(1, 0.55, 1), mm);
  pod.position.copy(mast).setY(205);
  group.add(pod);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(16.3, 1.2, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x22e6ff).multiplyScalar(2.2), fog: false }));
  ring.position.copy(mast).setY(205);
  group.add(ring);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 70, 6), mm);
  ant.position.copy(mast).setY(250);
  group.add(ant);
  for (const y of [222, 250, 284]) glowPoint(group, mast.clone().setY(y), 0xff2a1a, y > 280 ? 14 : 9, 1);
  // Two billboards on the low-rise, facing the site.
  screenAtlas();
  for (const [x, y, z, ry, cell] of [[-60, 30, -70, 0.7, 'billboard'], [72, 26, 58, -2.3, 'billboard2']] as const) {
    const g = new THREE.PlaneGeometry(26, 9.75);
    const c = screenCell(cell);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, c[0] + uv.getX(i) * c[2], c[1] + uv.getY(i) * c[3]);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: screenAtlas(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.3), fog: true }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(27, 10.5, 0.6), mm);
    back.position.set(x, y, z);
    back.rotation.y = ry;
    back.translateZ(-0.4);
    group.add(back);
  }
  // The ground of the city between the blocks: dark, streets lit in a grid of sodium and white lamps.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0d0c14, fog: true }));
  ground.position.y = -0.6;
  ground.name = 'nhCityGround';
  group.add(ground);
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/**
 * An airliner crossing the sky at `pos` heading `dir`: a dark silhouette, red and green wingtip lights, a white strobe
 * on the tail and a red beacon (a still of their blink), and a faint contrail behind it lit by the city.
 */
export function plane(group: THREE.Group, camera: THREE.Camera, pos: THREE.Vector3, dir: THREE.Vector3, scale = 1): void {
  const f = dir.clone().normalize();
  const side = new THREE.Vector3().crossVectors(f, V(0, 1, 0)).normalize();
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x14141e, fog: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 38, 10).rotateZ(Math.PI / 2), mat);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5, 10).rotateZ(-Math.PI / 2), mat);
  nose.position.x = 21.5;
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 36), mat);
  wing.position.x = 2;
  wing.rotation.y = 0.35;
  g.add(wing);
  const wing2 = wing.clone();
  wing2.rotation.y = -0.35;
  wing2.position.z = 0;
  g.add(wing2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 0.4), mat);
  tail.position.set(-17, 4, 0);
  g.add(tail);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 13), mat);
  stab.position.set(-17, 1, 0);
  g.add(stab);
  g.scale.setScalar(scale);
  g.position.copy(pos);
  g.lookAt(pos.clone().add(side));
  group.add(g);
  const at = (x: number, y: number, z: number) => pos.clone().addScaledVector(f, x * scale).addScaledVector(V(0, 1, 0), y * scale).addScaledVector(side, z * scale);
  const dist = pos.distanceTo(camera.position);
  const px = dist * 0.006;
  glowPoint(group, at(2, 0, -18.5), 0xff2a2a, px * 1.4, 1.4);
  glowPoint(group, at(2, 0, 18.5), 0x2aff6a, px * 1.4, 1.3);
  glowPoint(group, at(-19, 7.5, 0), 0xffffff, px * 2.2, 1.6);
  glowPoint(group, at(0, -2.2, 0), 0xff3a2a, px * 1.2, 1.2);
  // The contrail: two soft ribbons from the engines, widening and fading behind.
  const trail = (o: number) => {
    const len = 900;
    const n = 40;
    const pos3: number[] = [];
    const a: number[] = [];
    const sides: number[] = [];
    const camF = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = at(-24 - t * len, -0.5, o);
      camF.copy(c).sub(camera.position).normalize();
      const across = new THREE.Vector3().crossVectors(f, camF).normalize().multiplyScalar((0.7 + t * 9) * scale);
      pos3.push(c.x - across.x, c.y - across.y, c.z - across.z, c.x + across.x, c.y + across.y, c.z + across.z);
      const fade = Math.min(1, t * 25) * Math.pow(1 - t, 1.4);
      a.push(fade, fade);
      sides.push(0, 1);
    }
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos3, 3));
    geo.setAttribute('fade', new THREE.Float32BufferAttribute(a, 1));
    geo.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
    geo.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute float fade; attribute float side; varying float vF; varying vec2 vS; void main(){ vF = fade; vS = vec2(side, 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vF; varying vec2 vS; void main(){ float e = 1.0 - abs(vS.x * 2.0 - 1.0); gl_FragColor = vec4(vec3(0.62, 0.58, 0.78) * 0.22 * vF * (0.4 + e), 1.0); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'sky';
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  trail(-9);
  trail(9);
}
