import * as THREE from 'three';
import { DEPOT } from '../../src/map/depot';
import { buildFigure, buildViewmodel } from './characters';
import { addLights, buildWorld, envFromSky, skyDome, SUN_DIR } from './env';
import { Kit, RIM } from './kit';
import { buildDepot } from './map';
import { makeComposer } from './post';
import { PRESETS, type PresetId } from './quality';
import { buildAttachment, buildReplica } from './replicas';

const q = new URLSearchParams(location.search);
const preset = PRESETS[(q.get('preset') as PresetId) ?? 'ultra'];
const shot = q.get('shot') ?? 'ingame';
const W = Number(q.get('w') ?? innerWidth);
const H = Number(q.get('h') ?? innerHeight);
const hud = q.get('hud') !== '0';
const robots = q.get('robots') === '1' || shot === 'robots' || shot === 'arms-robot';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = preset.pbr ? 1.0 : 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = preset.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, W / H, 0.03, 2000);
camera.aspect = W / H;
const kit = new Kit(preset);
if (preset.pbr) kit.envMap = envFromSky(renderer);
const ui = document.getElementById('ui')!;

function tag(): void {
  const el = document.createElement('div');
  el.className = 'tag';
  if (shot === 'replicas') {
    el.style.bottom = 'auto';
    el.style.top = '1.2vw';
  }
  el.innerHTML = `<b>${preset.id.toUpperCase()}</b> &nbsp;GRAPHICS OVERHAUL CONCEPT`;
  ui.appendChild(el);
}

function label(pos: THREE.Vector3, title: string, sub = ''): void {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const p = pos.clone().project(camera);
  const el = document.createElement('div');
  el.className = 'label';
  el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
  el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
  el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
  ui.appendChild(el);
}

function updateRimDir(): void {
  camera.updateMatrixWorld();
  RIM.dir.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
}

let sky: THREE.Mesh | undefined;
let reflective: THREE.Mesh[] = [];
const sunWorld = SUN_DIR.clone().multiplyScalar(800);

function yard(): void {
  sky = skyDome();
  sky.layers.set(0);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xcfe0ec, 60, 760);
  const map = buildDepot(kit);
  scene.add(map.group);
  reflective = map.reflective;
  const wk = new Kit(preset);
  wk.envMap = kit.envMap;
  const world = new THREE.Group();
  buildWorld(wk, world);
  world.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      if (m.name === 'foliage') m.castShadow = true;
    }
  });
  scene.add(world);
  addLights(scene, preset, new THREE.Vector3(0, 0, 0), 36);
}

function place(o: THREE.Object3D, x: number, z: number, yaw: number, y = 0): THREE.Object3D {
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(o);
  return o;
}

let post: Parameters<typeof makeComposer>[6] = {};
/** The hip-fire hold the in-game shots use, and the inspect hold (the replica turned to show its right side). */
const HIP = { at: new THREE.Vector3(0.19, -0.235, -0.44), turn: new THREE.Euler(0.02, 0.09, -0.03, 'YXZ'), shoulders: [new THREE.Vector3(-0.16, -0.33, -0.03), new THREE.Vector3(0.25, -0.31, 0.1)] as [THREE.Vector3, THREE.Vector3] };
const INSPECT = { at: new THREE.Vector3(0.03, -0.2, -0.5), turn: new THREE.Euler(0.08, -0.7, 0.1, 'YXZ'), shoulders: [new THREE.Vector3(-0.15, -0.3, -0.12), new THREE.Vector3(0.22, -0.31, 0.02)] as [THREE.Vector3, THREE.Vector3] };

if (shot === 'ingame') {
  yard();
  camera.fov = 72;
  camera.position.set(-10.6, 1.62, 1.1);
  camera.lookAt(4, 1.3, 1.6);
  // Enemies: one stepping out past the centre container, one who called HIT by the Bay, a team-mate ahead on the right.
  place(buildFigure(kit, { team: 'orange', pose: 'aim', headgear: 'helmet', face: 'mask', robot: robots }).group, -1.7, 3.1, Math.PI / 2 - 0.25);
  place(buildFigure(kit, { team: 'orange', pose: 'hit', headgear: 'cap', face: 'bare', skin: 0xb7835a, robot: robots }).group, 3.0, 5.3, Math.PI / 2 + 0.45);
  place(buildFigure(kit, { team: 'blue', pose: 'run', headgear: 'bump', face: 'mask', skin: 0x8d5a3b, robot: robots }).group, -6.4, -0.9, -Math.PI / 2 - 0.2);
  const vm = buildViewmodel(kit, 'blue', 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, accent: 0x3a7fe6 }, { robot: robots, ...HIP });
  camera.add(vm);
  scene.add(camera);
  post = { sky, sunWorld, reflective, bloom: 0.4, godRays: 0.0 };
} else if (shot === 'arms' || shot === 'arms-inspect' || shot === 'arms-robot' || shot === 'pistol') {
  // First-person close-ups: what the player sees most of the time.
  yard();
  camera.fov = shot === 'arms' ? 72 : 62;
  camera.position.set(-10.6, 1.62, 1.1);
  camera.lookAt(4, 1.2, 0.6);
  const vm =
    shot === 'pistol'
      ? buildViewmodel(kit, 'blue', 'pistol', { accent: 0x3a7fe6 }, { at: new THREE.Vector3(0.1, -0.1, -0.52), turn: new THREE.Euler(0.02, 0.42, -0.06, 'YXZ'), shoulders: [new THREE.Vector3(-0.13, -0.36, -0.03), new THREE.Vector3(0.21, -0.36, 0.03)] })
      : buildViewmodel(kit, 'blue', 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, accent: 0x3a7fe6 }, { robot: robots, ...(shot === 'arms' ? HIP : INSPECT) });
  camera.add(vm);
  scene.add(camera);
  post = { sky, sunWorld, reflective, bloom: 0.35, godRays: 0.0 };
} else if (shot === 'map') {
  yard();
  camera.near = 0.2;
  camera.fov = 58;
  camera.position.set(22.5, 7.5, 12.8);
  camera.lookAt(-4, 0.6, -2.5);
  post = { sky, sunWorld, reflective, bloom: 0.35, aoRadius: 0.9, godRays: 0.0 };
} else if (shot === 'overview') {
  yard();
  camera.near = 0.5;
  camera.fov = 50;
  camera.position.set(36, 27, 34);
  camera.lookAt(-1.5, -2, -1.5);
  post = { sky, sunWorld, reflective, bloom: 0.35, aoRadius: 1.2, godRays: 0.0 };
} else if (shot === 'top') {
  yard();
  camera.fov = 40;
  camera.position.set(0, 75, 0.01);
  camera.lookAt(0, 0, 0);
  for (let x = -24; x <= 24; x += 4) for (let z = -16; z <= 16; z += 4) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: x === 0 || z === 0 ? 0xff00ff : 0x000000 }));
    m.position.set(x, 3, z);
    scene.add(m);
  }
} else if (shot === 'characters' || shot === 'robots') {
  studio(0xc5d0dc, 0xe4e7ea);
  camera.fov = 30;
  camera.position.set(0, 1.45, 7.6);
  camera.lookAt(0, 1.02, 0);
  const r = shot === 'robots';
  const figs: [Parameters<typeof buildFigure>[1], number, number, string, string][] = r
    ? [
        [{ team: 'blue', pose: 'aim', robot: true }, -2.25, -0.55, 'Blue · rifle', 'light shell, team panels, chest rig'],
        [{ team: 'blue', pose: 'ready', robot: true, pack: false }, -0.75, 0.35, 'Blue · low ready', 'no pack'],
        [{ team: 'orange', pose: 'pistol', robot: true, weapon: 'cyber' }, 0.75, -0.2, 'Orange · Cyber Pistol', 'dark shell, team panels'],
        [{ team: 'orange', pose: 'hit', robot: true }, 2.25, 0.25, 'Orange · called HIT', 'visor turns red'],
      ]
    : [
        [{ team: 'blue', pose: 'aim', headgear: 'helmet', face: 'mask' }, -2.25, -0.55, 'Blue · rifle', 'high-cut helmet, mesh mask, plate carrier'],
        [{ team: 'blue', pose: 'ready', headgear: 'cap', face: 'bare', skin: 0x8d5a3b, pack: false }, -0.75, 0.35, 'Blue · low ready', 'cap, goggles, no pack'],
        [{ team: 'orange', pose: 'pistol', headgear: 'bump', face: 'mask', skin: 0xe2b590, weapon: 'cyber' }, 0.75, -0.2, 'Orange · Cyber Pistol', 'bump helmet, mesh mask'],
        [{ team: 'orange', pose: 'hit', headgear: 'helmet', face: 'bare', skin: 0xb7835a }, 2.25, 0.25, 'Orange · called HIT', 'hand up, replica down'],
      ];
  for (const [o, x, yaw] of figs) place(buildFigure(kit, o).group, x, 0, yaw + Math.PI);
  camera.updateMatrixWorld();
  for (const [, x, , t, s] of figs) label(new THREE.Vector3(x, -0.06, 0.4), t, s);
  post = { bloom: 0.5, aoRadius: 0.35, dof: undefined };
} else if (shot === 'heads') {
  // Close-up of the heads: helmet, cap, bump helmet, robot.
  studio(0xc5d0dc, 0xe4e7ea);
  camera.fov = 17;
  camera.position.set(0, 1.62, 3.1);
  camera.lookAt(0, 1.58, 0);
  const figs: [Parameters<typeof buildFigure>[1], number, string, string][] = [
    [{ team: 'blue', pose: 'ready', headgear: 'helmet', face: 'mask' }, -0.63, 'High-cut helmet', 'rails, shroud, headset, mesh mask'],
    [{ team: 'blue', pose: 'ready', headgear: 'cap', face: 'bare', skin: 0x8d5a3b }, -0.21, 'Cap', 'framed goggles, mirrored lens'],
    [{ team: 'orange', pose: 'ready', headgear: 'bump', face: 'mask', skin: 0xe2b590 }, 0.21, 'Bump helmet', 'vents, mesh mask'],
    [{ team: 'orange', pose: 'ready', robot: true }, 0.63, 'Robot', 'visor, ear modules, antenna'],
  ];
  for (const [o, x] of figs) place(buildFigure(kit, o).group, x, 0, Math.PI + 0.5 * Math.sign(x));
  camera.updateMatrixWorld();
  for (const [, x, t, s] of figs) label(new THREE.Vector3(x, 1.9, 0.2), t, s);
  post = { bloom: 0.4, aoRadius: 0.1, dof: undefined };
} else if (shot === 'replicas') {
  studio(0xa7b0bb, 0x7d8692, true);
  camera.fov = 24;
  camera.position.set(0, 0.0, 3.3);
  camera.lookAt(0, 0.0, 0);
  const side = (o: THREE.Object3D, x: number, y: number, s = 1) => {
    o.rotation.y = -Math.PI / 2;
    o.position.set(x, y, 0);
    o.scale.setScalar(s);
    place(o, x, 0, -Math.PI / 2, y);
    return o;
  };
  const rk = () => {
    const k = new Kit(preset);
    k.envMap = kit.envMap;
    return k;
  };
  side(buildReplica(rk(), 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, accent: 0x3a7fe6 }).group, -0.62, 0.47, 1);
  side(buildReplica(rk(), 'aeg', { optic: 'scope2x', grip: 'angled', muzzle: 'silencer', mag: 'hiCap', furniture: 0x5a6b4a, accent: 0xf07a26 }).group, -0.62, -0.02, 1);
  side(buildReplica(rk(), 'pistol', { laser: true, furniture: 0xc7a46e }).group, 0.42, 0.44, 1.25);
  side(buildReplica(rk(), 'pistol', { muzzle: 'silencer', mag: 'extended' }).group, 0.86, 0.44, 1.25);
  side(buildReplica(rk(), 'cyber', {}).group, 0.42, 0.04, 1.25);
  side(buildReplica(rk(), 'pistol', { torch: true, furniture: 0x3a7fe6, accent: 0xf2f0ea }).group, 0.9, 0.04, 1.25);
  const atts: [string, string][] = [
    ['redDot', 'Red dot'],
    ['scope2x', '2× scope'],
    ['silencer', 'Silencer'],
    ['torch', 'Weapon torch'],
    ['vertical', 'Vertical grip'],
    ['angled', 'Angled grip'],
    ['laser', 'Red laser'],
    ['hiCap', 'Hi-cap mag'],
    ['longBarrel', 'Long barrel'],
  ];
  const ax = (i: number) => -1.02 + i * 0.245;
  atts.forEach(([id], i) => side(buildAttachment(rk(), id), ax(i), -0.45, 1.1));
  label(new THREE.Vector3(-0.15, 0.2, 0), 'AEG rifle', 'red dot, vertical grip, torch');
  label(new THREE.Vector3(-0.15, -0.29, 0), 'AEG rifle', '2× scope, angled grip, silencer, hi-cap');
  label(new THREE.Vector3(0.42, 0.24, 0), 'Gas pistol', 'red laser, tan frame');
  label(new THREE.Vector3(0.9, 0.24, 0), 'Gas pistol', 'silencer, extended mag');
  label(new THREE.Vector3(0.42, -0.16, 0), 'Cyber Pistol');
  label(new THREE.Vector3(0.9, -0.16, 0), 'Gas pistol', 'torch, team frame');
  atts.forEach(([, n], i) => label(new THREE.Vector3(ax(i) + 0.05, -0.645, 0), n));
  for (const el of Array.from(ui.querySelectorAll('.label')) as HTMLElement[]) {
    el.style.color = '#eef1f5';
    const s = el.querySelector('small') as HTMLElement | null;
    if (s) s.style.color = '#a9b1bc';
  }
  post = { bloom: 0.3, aoRadius: 0.08 };
}

/** A photo-studio set: a curved backdrop, a key, a fill and two rim lights. */
function studio(top: number, bottom: number, wall = false): void {
  const g = new THREE.PlaneGeometry(40, 20, 1, 1);
  const tex = document.createElement('canvas');
  tex.width = 4;
  tex.height = 256;
  const c = tex.getContext('2d')!;
  const grad = c.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${new THREE.Color(top).getHexString()}`);
  grad.addColorStop(1, `#${new THREE.Color(bottom).getHexString()}`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(tex);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = preset.pbr ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }) : new THREE.MeshLambertMaterial({ map: t });
  const back = new THREE.Mesh(g, mat);
  back.position.set(0, wall ? 0 : 9, wall ? -0.6 : -4);
  back.receiveShadow = true;
  scene.add(back);
  if (!wall) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), preset.pbr ? new THREE.MeshStandardMaterial({ color: bottom, roughness: 0.9 }) : new THREE.MeshLambertMaterial({ color: bottom }));
    fl.rotation.x = -Math.PI / 2;
    fl.receiveShadow = true;
    scene.add(fl);
  }
  scene.background = new THREE.Color(bottom);
  const key = new THREE.DirectionalLight(0xfff0dc, preset.pbr ? 3.0 : 2.6);
  key.position.set(wall ? 1.5 : 4, wall ? 3 : 7, wall ? 4 : 6);
  key.castShadow = true;
  key.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
  const sc = key.shadow.camera;
  sc.left = -4;
  sc.right = 4;
  sc.top = 4;
  sc.bottom = -4;
  sc.near = 0.5;
  sc.far = 30;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = preset.softShadows ? 4 : 1;
  scene.add(key);
  const fill = new THREE.HemisphereLight(0xc9dcff, 0xb8a58a, preset.pbr ? 1.2 : 1.8);
  scene.add(fill);
  for (const s of [-1, 1]) {
    const rim = new THREE.DirectionalLight(s < 0 ? 0x9cc4ff : 0xffc49a, preset.pbr ? 2.2 : 1.6);
    rim.position.set(s * 5, 3, -5);
    scene.add(rim);
  }
  SUN_DIR.copy(key.position).normalize();
}

camera.aspect = W / H;
camera.updateProjectionMatrix();
updateRimDir();

if (shot === 'ingame' && hud) {
  // A HUD in the game's layout (this concept is about the 3D look; the HUD is unchanged apart from styling).
  ui.innerHTML += `
    <div class="hud-top"><span class="b">BLUE</span><div class="pips"><i class="pip" style="background:#6aa8ff"></i><i class="pip" style="background:#6aa8ff"></i><i class="pip" style="background:#6aa8ff"></i></div><span class="n b">1</span><span class="t">2:26</span><span class="n o">0</span><div class="pips"><i class="pip" style="background:#ff9a3c;opacity:.35"></i><i class="pip" style="background:#ff9a3c"></i><i class="pip" style="background:#ff9a3c"></i></div><span class="o">ORANGE</span></div>
    <div class="feed"><span style="color:#ff9a3c">Orange 2</span> called HIT · <span style="color:#6aa8ff">You</span></div>
    <div class="ammo"><div class="w">AEG RIFLE<span>AUTO</span></div><div class="c">53 <small>/ 300</small></div></div>
    <div class="cross"><i style="left:-.9vw;top:-1px;width:.6vw;height:2px"></i><i style="left:.3vw;top:-1px;width:.6vw;height:2px"></i><i style="top:-.9vw;left:-1px;height:.6vw;width:2px"></i><i style="top:.3vw;left:-1px;height:.6vw;width:2px"></i></div>
    <canvas class="mini" id="mini" width="300" height="300"></canvas>`;
  const mc = (document.getElementById('mini') as HTMLCanvasElement).getContext('2d')!;
  mc.translate(150, 150);
  mc.rotate(-Math.PI / 2 + 0.15);
  mc.scale(4.2, 4.2);
  mc.translate(10.6, -1.1);
  for (const b of DEPOT.blocks) {
    if (b.kind === 'floor') continue;
    mc.fillStyle = b.size.y > 1.5 ? 'rgba(235,238,242,.85)' : 'rgba(235,238,242,.45)';
    mc.fillRect(b.center.x - b.size.x / 2, b.center.z - b.size.z / 2, b.size.x, b.size.z);
  }
  mc.fillStyle = '#6aa8ff';
  mc.beginPath();
  mc.arc(-10.6, 1.1, 1.0, 0, Math.PI * 2);
  mc.arc(-6.4, -0.9, 0.8, 0, Math.PI * 2);
  mc.fill();
  // The HIT bubble over the bot who called it.
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(3.0, 2.38, 5.3).project(camera);
  ui.insertAdjacentHTML('beforeend', `<div class="hitbubble" style="left:${(p.x * 0.5 + 0.5) * 100}%;top:${(-p.y * 0.5 + 0.5) * 100}%">HIT!</div>`);
}
if (q.get('tag') !== '0') tag();

const composer = makeComposer(renderer, scene, camera, preset, W, H, post);
const t0 = performance.now();
// A few frames so temporal parts (SMAA's edges, the AO denoise) settle; a still needs only one.
composer.render();
composer.render();
const ms = performance.now() - t0;
const info = renderer.info.render;
let meshes = 0;
let tris = 0;
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.isMesh && m.visible) {
    meshes++;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  }
});
(window as unknown as Record<string, unknown>).__done = { ms: Math.round(ms), meshes, tris: Math.round(tris), passes: (window as unknown as { __passes: string[] }).__passes };
console.log('done', JSON.stringify((window as unknown as Record<string, unknown>).__done));
