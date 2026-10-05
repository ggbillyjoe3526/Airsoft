import * as THREE from 'three';
import { DEPOT } from '../../src/map/depot';
import { buildFigure, buildViewmodel } from './characters';
import { addLights, buildWorld, envFromSky, skyDome, SUN_DIR } from './env';
import { Kit, RIM } from './kit';
import { bakeGI, GI } from './gi';
import { dustMotes, kickUp, plume } from './particles';
import { buildDepot } from './map';
import { makeComposer } from './post';
import { PRESETS, type PresetId } from './quality';
import { buildAttachment, buildReplica, SCHEMES, type SchemeId } from './replicas';
import type { ShotCtx } from './shot';
import { woodlandShot } from './woodland';
import { neonShot } from './neon';

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
  if (shot.startsWith('replicas') || shot.startsWith('schemes')) {
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
  const lights = addLights(scene, preset, new THREE.Vector3(0, 0, 0), 36);
  // Smoke from the works chimney, bending east with the wind.
  plume(scene, preset, new THREE.Vector3(70, 46.4, -78), { height: 24, wind: new THREE.Vector3(0.55, 0, 0.12), width: 4.2, count: 40 });
  // Baked bounce light over the yard (the map only; the world round it is too far away to matter).
  giBake(map.group, new THREE.Box3(new THREE.Vector3(-27, -0.6, -18), new THREE.Vector3(27, 9.4, 18)), lights.sun.intensity, lights.hemi.color.clone().multiplyScalar(lights.hemi.intensity));
}

function giBake(root: THREE.Object3D, box: THREE.Box3, sun: number, sky: THREE.Color): void {
  if (!preset.gi) return;
  if (q.get('gi') === 'debug') GI.debug.value = 1;
  const stats = bakeGI(root, box, { ...preset.gi, maxDist: 7, sunDir: SUN_DIR, sun, sky });
  (window as unknown as Record<string, unknown>).__gi = stats;
  console.log('gi', JSON.stringify(stats));
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
  place(buildFigure(kit, { team: 'orange', pose: 'hit', headgear: 'visor', robot: robots }).group, 3.0, 5.3, Math.PI / 2 + 0.45);
  place(buildFigure(kit, { team: 'blue', pose: 'run', headgear: 'bump', face: 'mask', skin: 0x8d5a3b, robot: robots }).group, -6.4, -0.9, -Math.PI / 2 - 0.2);
  kickUp(scene, preset, new THREE.Vector3(-6.75, 0, -0.75), 0.55);
  dustMotes(scene, preset, new THREE.Vector3(-4, 0, 1.2), new THREE.Vector3(16, 4.5, 9));
  const vm = buildViewmodel(kit, 'blue', 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, scheme: 'cobalt' }, { robot: robots, ...HIP });
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
      ? buildViewmodel(kit, 'blue', 'pistol', { scheme: 'ghost' }, { at: new THREE.Vector3(0.1, -0.1, -0.52), turn: new THREE.Euler(0.02, 0.42, -0.06, 'YXZ'), shoulders: [new THREE.Vector3(-0.13, -0.36, -0.03), new THREE.Vector3(0.21, -0.36, 0.03)] })
      : buildViewmodel(kit, 'blue', 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, scheme: 'cobalt' }, { robot: robots, ...(shot === 'arms' ? HIP : INSPECT) });
  camera.add(vm);
  scene.add(camera);
  dustMotes(scene, preset, new THREE.Vector3(-6, 0, 1), new THREE.Vector3(12, 4, 7));
  post = { sky, sunWorld, reflective, bloom: 0.35, godRays: 0.0 };
} else if (shot === 'map') {
  yard();
  camera.near = 0.2;
  camera.fov = 58;
  camera.position.set(22.5, 7.5, 12.8);
  camera.lookAt(-4, 0.6, -2.5);
  post = { sky, sunWorld, reflective, bloom: 0.35, aoRadius: 0.9, godRays: 0.0 };
} else if (shot === 'settings') {
  // The proposed settings screen (a mock-up over the Depot): the new graphics rows and the two new look options.
  yard();
  camera.near = 0.2;
  camera.fov = 58;
  camera.position.set(22.5, 7.5, 12.8);
  camera.lookAt(-4, 0.6, -2.5);
  post = { sky, sunWorld, reflective, bloom: 0.35, aoRadius: 0.9, godRays: 0.0 };
  const rows: [string, string, string, string][] = [
    ['Preset', 'Low', 'Ultra', 'Medium and High sit between'],
    ['Frame rate', '60', 'Unlimited', '30, 60, 120, 144, 240, Unlimited'],
    ['Baked lighting', 'Coarse', 'Fine', 'Almost free while playing'],
    ['Ambient occlusion', 'Off', 'On', 'Medium cost'],
    ['Reflections', 'Off', 'Puddles and glass', 'High cost'],
    ['Bloom', 'Off', 'On', 'Low cost'],
    ['Light shafts', 'Off', 'On', 'Medium cost'],
    ['Particles', 'Fewer', 'Full', 'Low cost'],
    ['Shadows', 'Sharp, 2K', 'Soft, 4K', 'Medium cost'],
    ['Anti-aliasing', 'FXAA', 'TAA', 'Medium cost'],
    ['Model detail', 'Cut-down', 'Full', 'Medium cost'],
    ['Lens finish', 'Off', 'Grain', 'Almost free'],
  ];
  const look: [string, string, string][] = [
    ['Robots', 'On', 'Off makes every figure human'],
    ['Realistic colours', 'Off', 'Replicas in black, grey, green or tan'],
  ];
  const tr = (c: string[], head = false) => `<tr>${c.map((x, i) => (head ? `<th>${x}</th>` : i === 0 ? `<td class="k">${x}</td>` : `<td>${x}</td>`)).join('')}</tr>`;
  ui.insertAdjacentHTML(
    'beforeend',
    `<style>
      .shade { position:absolute; inset:0; backdrop-filter: blur(.5vw) brightness(.72); }
      .panel { position:absolute; right:3vw; top:3vw; width:52vw; background:rgba(16,19,25,.86); border-radius:.8vw; padding:1.6vw 2vw; color:#e9edf2; font-size:.95vw; box-shadow:0 1vw 3vw rgba(0,0,0,.4); }
      .panel h1 { margin:0 0 .3vw; font-size:1.6vw; letter-spacing:.08em; }
      .panel h2 { margin:1.3vw 0 .4vw; font-size:1.05vw; color:#ffcf4a; letter-spacing:.1em; }
      .panel p { margin:0 0 .6vw; color:#9aa4b2; font-size:.85vw; }
      .panel table { width:100%; border-collapse:collapse; }
      .panel th { text-align:left; color:#7f8a99; font-weight:600; font-size:.8vw; padding:.25vw .4vw; border-bottom:1px solid #2c333d; }
      .panel td { padding:.34vw .4vw; border-bottom:1px solid #232932; }
      .panel td.k { font-weight:700; }
      .panel td:last-child { color:#9aa4b2; }
    </style>
    <div class="shade"></div>
    <div class="panel">
      <h1>SETTINGS</h1><p>A mock-up of the proposed rows. Custom lets players set each one.</p>
      <h2>GRAPHICS</h2>
      <table>${tr(['Setting', 'Low', 'Ultra', 'Cost'], true)}${rows.map((r) => tr(r)).join('')}</table>
      <h2>LOOK</h2>
      <table>${tr(['Setting', 'Default', 'What it does'], true)}${look.map((r) => tr(r)).join('')}</table>
    </div>`,
  );
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
        [{ team: 'blue', pose: 'ready', headgear: 'hood', pack: false }, -0.75, 0.35, 'Blue · low ready', 'balaclava, goggles, mesh mask, no pack'],
        [{ team: 'orange', pose: 'pistol', headgear: 'bump', face: 'mask', skin: 0xe2b590, weapon: 'cyber' }, 0.75, -0.2, 'Orange · Cyber Pistol', 'bump helmet, mesh mask'],
        [{ team: 'orange', pose: 'hit', headgear: 'visor' }, 2.25, 0.25, 'Orange · called HIT', 'full-face visor, hand up'],
      ];
  for (const [o, x, yaw] of figs) place(buildFigure(kit, o).group, x, 0, yaw + Math.PI);
  camera.updateMatrixWorld();
  for (const [, x, , t, s] of figs) label(new THREE.Vector3(x, -0.06, 0.4), t, s);
  post = { bloom: 0.5, aoRadius: 0.35, dof: undefined };
} else if (shot === 'heads') {
  // Close-up of the heads: high-cut helmet, balaclava, bump helmet, full-face visor, robot.
  studio(0xc5d0dc, 0xe4e7ea);
  camera.fov = 20;
  camera.position.set(0, 1.62, 3.3);
  camera.lookAt(0, 1.58, 0);
  const figs: [Parameters<typeof buildFigure>[1], number, string, string][] = [
    [{ team: 'blue', pose: 'ready', headgear: 'helmet', face: 'mask' }, -0.76, 'High-cut helmet', 'rails, shroud, headset, mesh mask'],
    [{ team: 'blue', pose: 'ready', headgear: 'hood' }, -0.38, 'Balaclava', 'framed goggles, mesh mask'],
    [{ team: 'orange', pose: 'ready', headgear: 'visor' }, 0, 'Full-face visor', 'tinted shield, chin guard'],
    [{ team: 'orange', pose: 'ready', headgear: 'bump', face: 'mask' }, 0.38, 'Bump helmet', 'vents, mesh mask'],
    [{ team: 'orange', pose: 'ready', robot: true }, 0.76, 'Robot', 'visor, ear modules, antenna'],
  ];
  for (const [o, x] of figs) place(buildFigure(kit, o).group, x, 0, Math.PI + 0.5 * Math.sign(x));
  camera.updateMatrixWorld();
  for (const [, x, t, s] of figs) label(new THREE.Vector3(x, 1.9, 0.2), t, s);
  post = { bloom: 0.4, aoRadius: 0.1, dof: undefined };
} else if (shot.startsWith('woodland') || shot.startsWith('neon')) {
  // The two night maps, each built by its own module (woodland.ts, neon.ts). The view is the part after the dash.
  const ctx: ShotCtx = {
    scene,
    camera,
    renderer,
    preset,
    kit,
    newKit: () => {
      const k = new Kit(preset);
      k.envMap = kit.envMap;
      return k;
    },
    place,
    robots,
    bakeGI: giBake,
  };
  const view = shot.includes('-') ? shot.slice(shot.indexOf('-') + 1) : 'map';
  post = (shot.startsWith('woodland') ? woodlandShot : neonShot)(ctx, view);
} else if (shot === 'thumb') {
  // One item on a dark card, for the menu concept's pictures: thumb&item=aeg|pistol|cyber|<attachment>&scheme=..&real=1
  // &parts=redDot,vertical,torch,silencer,scope2x,angled,laser,hiCap,extended,long
  const item = q.get('item') ?? 'aeg';
  const sch = (q.get('scheme') ?? 'cobalt') as SchemeId;
  const real = q.get('real') === '1';
  const parts = new Set((q.get('parts') ?? '').split(',').filter(Boolean));
  studio(0x34405a, 0x141922, true);
  const k = new Kit(preset);
  k.envMap = kit.envMap;
  let g: THREE.Object3D;
  if (item === 'aeg' || item === 'pistol' || item === 'cyber') {
    g = buildReplica(k, item, {
      scheme: sch,
      realistic: real,
      optic: parts.has('redDot') ? 'redDot' : parts.has('scope2x') ? 'scope2x' : undefined,
      grip: parts.has('vertical') ? 'vertical' : parts.has('angled') ? 'angled' : undefined,
      muzzle: parts.has('silencer') ? 'silencer' : undefined,
      barrel: parts.has('long') ? 'long' : undefined,
      torch: parts.has('torch'),
      laser: parts.has('laser'),
      mag: parts.has('hiCap') ? 'hiCap' : parts.has('extended') ? 'extended' : undefined,
    }).group;
  } else g = buildAttachment(k, item, sch, real);
  // Side on, turned a little towards the camera, framed to fill the card.
  const holder = new THREE.Group();
  g.rotation.set(0, -Math.PI / 2 + 0.38, 0);
  holder.add(g);
  holder.rotation.x = 0.12;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.sub(c);
  place(holder, -c.x, -c.z, 0, -c.y);
  holder.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  const sz = box.getSize(new THREE.Vector3());
  camera.fov = 18;
  const fit = Math.max(sz.x / camera.aspect, sz.y) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0.02 * fit, fit * 1.1 + sz.z / 2);
  camera.lookAt(0, 0, 0);
  post = { bloom: 0.5, aoRadius: 0.05, dof: undefined };
} else if (shot === 'replicas' || shot === 'replicas-real') {
  // The armoury: every replica and attachment. replicas-real is the same set with the Realistic colours setting on.
  const real = shot === 'replicas-real';
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
  const nm = (id: SchemeId) => SCHEMES[real ? SCHEMES[id].realistic : id].name;
  side(buildReplica(rk(), 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, scheme: 'cobalt', realistic: real }).group, -0.62, 0.47, 1);
  side(buildReplica(rk(), 'aeg', { optic: 'scope2x', grip: 'angled', muzzle: 'silencer', mag: 'hiCap', scheme: 'signal', realistic: real }).group, -0.62, -0.02, 1);
  side(buildReplica(rk(), 'pistol', { laser: true, scheme: 'hazard', realistic: real }).group, 0.42, 0.44, 1.25);
  side(buildReplica(rk(), 'pistol', { muzzle: 'silencer', mag: 'extended', scheme: 'onyx', realistic: real }).group, 0.86, 0.44, 1.25);
  side(buildReplica(rk(), 'cyber', { realistic: real }).group, 0.42, 0.04, 1.25);
  side(buildReplica(rk(), 'pistol', { torch: true, scheme: 'ghost', realistic: real }).group, 0.9, 0.04, 1.25);
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
  atts.forEach(([id], i) => side(buildAttachment(rk(), id, i % 2 ? 'teal' : 'onyx', real), ax(i), -0.45, 1.1));
  label(new THREE.Vector3(-0.15, 0.2, 0), `AEG rifle · ${nm('cobalt')}`, 'red dot, vertical grip, torch');
  label(new THREE.Vector3(-0.15, -0.29, 0), `AEG rifle · ${nm('signal')}`, '2× scope, angled grip, silencer, hi-cap');
  label(new THREE.Vector3(0.42, 0.24, 0), `Gas pistol · ${nm('hazard')}`, 'red laser');
  label(new THREE.Vector3(0.9, 0.24, 0), `Gas pistol · ${nm('onyx')}`, 'silencer, extended mag');
  label(new THREE.Vector3(0.42, -0.16, 0), real ? 'Cyber Pistol · Dark grey' : 'Cyber Pistol');
  label(new THREE.Vector3(0.9, -0.16, 0), `Gas pistol · ${nm('ghost')}`, 'torch');
  atts.forEach(([, n], i) => label(new THREE.Vector3(ax(i) + 0.05, -0.645, 0), n));
  lightLabels();
  post = { bloom: 0.3, aoRadius: 0.08 };
} else if (shot === 'schemes' || shot === 'schemes-real') {
  // Eight colour schemes on the same rifle, two columns of four; schemes-real shows what Realistic colours turns each into.
  const real = shot === 'schemes-real';
  studio(0xa7b0bb, 0x7d8692, true);
  camera.fov = 29;
  camera.position.set(0, -0.04, 3.3);
  camera.lookAt(0, -0.04, 0);
  const ids: SchemeId[] = ['cobalt', 'signal', 'acid', 'teal', 'hazard', 'coral', 'onyx', 'ghost'];
  ids.forEach((id, i) => {
    const k = new Kit(preset);
    k.envMap = kit.envMap;
    const x = i < 4 ? -0.68 : 0.62;
    const y = 0.52 - (i % 4) * 0.37;
    const o = buildReplica(k, 'aeg', { optic: i % 2 ? 'scope2x' : 'redDot', grip: i % 3 === 0 ? 'vertical' : 'angled', torch: i % 4 === 1, scheme: id, realistic: real }).group;
    place(o, x, 0, -Math.PI / 2, y);
    o.scale.setScalar(0.92);
    const sc = SCHEMES[real ? SCHEMES[id].realistic : id];
    label(new THREE.Vector3(x + 0.42, y - 0.12, 0), sc.name, real ? `Realistic colours (from ${SCHEMES[id].name})` : '');
  });
  lightLabels();
  post = { bloom: 0.3, aoRadius: 0.08 };
}

/** Labels on a dark backdrop read light. */
function lightLabels(): void {
  for (const el of Array.from(ui.querySelectorAll('.label')) as HTMLElement[]) {
    el.style.color = '#eef1f5';
    const s = el.querySelector('small') as HTMLElement | null;
    if (s) s.style.color = '#a9b1bc';
  }
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
(window as unknown as Record<string, unknown>).__done = { ms: Math.round(ms), meshes, tris: Math.round(tris), passes: (window as unknown as { __passes: string[] }).__passes, gi: (window as unknown as Record<string, unknown>).__gi };
console.log('done', JSON.stringify((window as unknown as Record<string, unknown>).__done));
