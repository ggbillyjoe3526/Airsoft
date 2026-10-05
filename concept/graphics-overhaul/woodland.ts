import * as THREE from 'three';
import { buildFigure, buildViewmodel, type FigureOpts } from './characters';
import { SUN_DIR } from './env';
import { RIM } from './kit';
import type { PostOpts } from './post';
import type { ShotCtx } from './shot';
import './woodland-tex';
import { bats, deer, fireflies, fox, moths, owl, rabbit } from './woodland-fauna';
import { buildAxe, buildBushes, buildGrassBlades, buildGroundCover, buildStumps, fern, mushrooms, tuft } from './woodland-flora';
import { buildGround, buildPuddles } from './woodland-ground';
import { buildBlocks, buildCabin, buildLightFixtures, glowTexture } from './woodland-props';
import { fitSkyToCamera, MOON_DIR, NIGHT, nightEnv, nightSky } from './woodland-sky';
import { buildFieldTrees, buildOuterForest, lump, tube } from './woodland-trees';
import { Bulks, groundY, MAP, rng, V } from './woodland-util';

/**
 * Woodland at night, re-dressed (the game's map data, src/map/woodland.ts, every block in its exact bounds): the camera,
 * sky, fog and lights for one view, then the map, its trees, undergrowth and wildlife. Views: `map` (low and wide across
 * the meadow to the Knoll), `overview` (high over the whole field), `ingame` (first person on the Meadow lane, three
 * players) and `detail` (ground level at the east camp's fire). A debug `top` view looks straight down.
 */

interface View {
  /** Eye (x, z) and its height over the ground, or an absolute y. */
  eye: [number, number, number, boolean?];
  look: [number, number, number];
  fov: number;
  fog: [number, number];
  /** How far the moon's shadow map reaches from the eye (m). */
  shadow: number;
  /** Ultra's grass blades: per m² by the eye, and their reach (m). Zero: none. */
  grass: [number, number];
  /** Small ground cover near the eye: reach (m) and an overall amount. */
  near: number;
  amount: number;
  bloom: number;
  ao: number;
  exposure: number;
}

const VIEWS: Record<string, View> = {
  map: { eye: [-10, 8, 3], look: [49.7, 7.4, 14.3], fov: 52, fog: [30, 230], shadow: 110, grass: [1500, 46], near: 26, amount: 1, bloom: 0.75, ao: 0.7, exposure: 1.35 },
  overview: { eye: [-72, 108, 58, true], look: [4, -2, -4], fov: 44, fog: [140, 620], shadow: 190, grass: [0, 0], near: 0, amount: 0.8, bloom: 0.8, ao: 1.4, exposure: 1.45 },
  ingame: { eye: [2, -6.5, 1.62], look: [30, 4.2, -6.2], fov: 72, fog: [26, 210], shadow: 80, grass: [1300, 40], near: 22, amount: 1, bloom: 0.7, ao: 0.6, exposure: 1.4 },
  detail: { eye: [58.4, -10.2, 0.55], look: [52, 4.9, -12.9], fov: 50, fog: [16, 150], shadow: 30, grass: [2600, 13], near: 9, amount: 1, bloom: 0.5, ao: 0.35, exposure: 1.3 },
  top: { eye: [0, 0.01, 140, true], look: [0, 0, 0], fov: 50, fog: [400, 900], shadow: 150, grass: [0, 0], near: 0, amount: 0.5, bloom: 0.5, ao: 1, exposure: 1.4 },
};

/** Moonlight: cool blue, low over the Knoll. Fill: the night sky's blue from above, a dark warm ground. */
const LIGHT = {
  moon: 0xb8c8f0,
  moonPbr: 3.0,
  moonLambert: 2.8,
  skyFill: 0x6474a0,
  groundFill: 0x3a3830,
  fillPbr: 1.7,
  fillLambert: 2.8,
  fire: 0xffa060,
  lantern: 0xffc070,
  fireCd: 26,
  lanternCd: 9,
  rim: 0xa8c4ff,
  rimStrength: 0.6,
};
/**
 * The deer graze just outside the north fence, in a glade at the forest's edge (decoration taller than 0.3 m stays
 * outside the field, so it never looks like cover): a stag and a hind, heads up.
 */
const DEER = [
  { x: -6.5, z: -45.2, yaw: 2.6, stag: true, turn: -0.6 },
  { x: -3.6, z: -46.6, yaw: 1.9, stag: false, turn: 0.5 },
];
const DEER_GLADE = { x: -5, z: -46, r: 6 };

/** Low draws at most this many point lights (the nearest to the view). */
const LOW_POINT_LIGHTS = 4;

/** Fits the moon's shadow camera to what the view sees within `reach` m, plus room for tall casters towards the moon. */
function fitShadow(light: THREE.DirectionalLight, camera: THREE.PerspectiveCamera, reach: number): void {
  camera.updateMatrixWorld();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  const pts: THREE.Vector3[] = [];
  for (const d of [Math.max(camera.near, 0.5), reach * 0.35, reach]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(V(sx * tanX * d, sy * tanY * d, -d).applyMatrix4(camera.matrixWorld));
  for (const p of pts) p.y = Math.max(Math.min(p.y, 30), groundY(p.x, p.z) - 2);
  const centre = pts.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / pts.length);
  light.position.copy(centre).addScaledVector(MOON_DIR, 260);
  light.target.position.copy(centre);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const view = new THREE.Matrix4().lookAt(light.position, centre, V(0, 1, 0));
  view.setPosition(light.position);
  const inv = view.clone().invert();
  const box = new THREE.Box3();
  for (const p of pts) box.expandByPoint(p.clone().applyMatrix4(inv));
  const sc = light.shadow.camera;
  const pad = 4;
  sc.left = box.min.x - pad;
  sc.right = box.max.x + pad;
  sc.bottom = box.min.y - pad;
  sc.top = box.max.y + pad;
  sc.near = Math.max(1, -box.max.z - 80);
  sc.far = -box.min.z + 40;
  sc.updateProjectionMatrix();
}

/** A small camp kit by each fire, inside its light pool: seating logs, a stump with a lantern on it, a bundle of kindling. */
function campKit(bk: Bulks, full: boolean): THREE.Vector3[] {
  const lamps: THREE.Vector3[] = [];
  for (const l of MAP.lights ?? []) {
    if (l.kind !== 'fire') continue;
    const { x, z } = l.position;
    // Towards the middle of the field from the fire (the side away from the fence).
    const s = -Math.sign(x);
    const r = rng(Math.floor(Math.abs(x) * 10));
    // Two seating logs lying low (0.28 m), one each side.
    for (const [dx, dz, yaw] of [[s * 1.55, 1.1, 0.5], [s * 0.2, -1.75, -0.2]] as const) {
      const cx = x + dx;
      const cz = z + dz;
      const g = groundY(cx, cz);
      // Each end rests on the ground (the camps sit on slopes).
      const end = (k: number) => {
        const px = cx + Math.cos(yaw) * 0.75 * k;
        const pz = cz + Math.sin(yaw) * 0.75 * k;
        return V(px, groundY(px, pz) + 0.12, pz);
      };
      const a = end(-1);
      const e = end(1);
      tube(bk.get('wlBark'), a, e, 0.15, 0.14, full ? 12 : 7, 2, (t, ang, out) => out.set(0x5e4a3a).multiplyScalar(0.85 + Math.sin(ang) * 0.1).lerp(new THREE.Color(0x5d7c2e), Math.max(0, Math.sin(ang)) * 0.35 * (0.5 + t * 0.5)));
      for (const p of [a, e]) {
        const n = e.clone().sub(a).normalize().multiplyScalar(p === a ? -1 : 1);
        const disc = new THREE.CircleGeometry(0.14, full ? 12 : 7);
        disc.lookAt(n);
        disc.translate(p.x + n.x * 0.003, p.y, p.z + n.z * 0.003);
        bk.get('wlLogEnd').geo(disc, null, (out) => out.set(0xd8bd92), { ownUv: true });
      }
      if (full) {
        // A few pale caps on top of the log, near one end.
        const on = a.clone().lerp(e, 0.72);
        mushrooms(bk, on.x, on.z, 'pale', r, full, on.y + 0.135);
      }
    }
    // A stump with a lantern on it, and a bundle of kindling.
    const sx = x + s * 1.1;
    const sz = z + 1.4;
    const g = groundY(sx, sz);
    tube(bk.get('wlBark'), V(sx, g - 0.05, sz), V(sx, g + 0.3, sz), 0.2, 0.19, full ? 12 : 7, 1, () => new THREE.Color(0x5e4a3a));
    const top = new THREE.CircleGeometry(0.19, full ? 12 : 7);
    top.rotateX(-Math.PI / 2);
    top.translate(sx, g + 0.302, sz);
    bk.get('wlLogEnd').geo(top, null, (out) => out.set(0xd2b48a), { ownUv: true });
    lamps.push(V(sx, g + 0.3, sz));
    // The camp's edge towards the fence: a few low ferns (soft, under 0.45 m), toadstools and grass by the stump.
    for (const [dx, dz, size] of [[-s * 0.7, 1.9, 0.42], [-s * 1.3, 2.4, 0.34], [-s * 0.15, 2.6, 0.3]] as const) fern(bk.get('wlPlant'), x + dx, z + dz, size, r, full);
    mushrooms(bk, x - s * 1.1, z + 1.1, 'agaric', r, full);
    mushrooms(bk, sx + s * 0.32, sz + 0.3, 'brown', r, full);
    for (let i = 0; i < (full ? 6 : 3); i++) tuft(bk.get('wlBlade'), x - s * (0.9 + r() * 1.2), z + 1.4 + r() * 1.4, 0.26 + r() * 0.1, full ? 9 : 5, r, new THREE.Color(0x6a8a40));
    for (let i = 0; i < (full ? 7 : 3); i++) {
      const a = V(x - s * 0.9 + (r() - 0.5) * 0.1, groundY(x - s * 0.9, z + 1.3) + 0.05 + (i % 3) * 0.06, z + 1.0 + (i % 3) * 0.05);
      tube(bk.get('wlBark'), a, a.clone().add(V(0.05 * s, 0.01, 0.65)), 0.035, 0.03, 5, 1, () => new THREE.Color(0x6a5644));
    }
  }
  return lamps;
}

/** A small storm lantern standing on a stump (decoration inside a fire's pool: it lights nothing the pool doesn't). */
function standingLantern(bk: Bulks, fx: THREE.Group, at: THREE.Vector3): void {
  const iron = new THREE.Color(0x2e2c2a);
  const glass = new THREE.Color(4.0, 2.4, 1.0);
  tube(bk.get('wlIron'), at, at.clone().add(V(0, 0.03, 0)), 0.07, 0.07, 10, 1, () => iron);
  lump(bk.get('wlGlow'), at.clone().add(V(0, 0.12, 0)), 0.06, 1, 1, (_p, o, out) => out.copy(glass).multiplyScalar(0.7 + o.y * 0.3), V(1, 1.35, 1), 0.02);
  for (const a of [0, 1, 2, 3]) {
    const ang = (a / 4) * Math.PI * 2 + 0.4;
    tube(bk.get('wlIron'), at.clone().add(V(Math.cos(ang) * 0.065, 0.02, Math.sin(ang) * 0.065)), at.clone().add(V(Math.cos(ang) * 0.06, 0.22, Math.sin(ang) * 0.06)), 0.006, 0.006, 4, 1, () => iron);
  }
  tube(bk.get('wlIron'), at.clone().add(V(0, 0.21, 0)), at.clone().add(V(0, 0.26, 0)), 0.07, 0.03, 10, 1, () => iron, { cap: true });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1, 0.62, 0.28), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, fog: false }));
  halo.scale.set(0.7, 0.7, 1);
  halo.position.copy(at).add(V(0, 0.12, 0));
  fx.add(halo);
}

/** The in-game HUD, as the Depot shot draws it (this concept is about the 3D look; the HUD keeps the game's layout). */
function hud(): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  ui.insertAdjacentHTML(
    'beforeend',
    `<div class="hud-top"><span class="b">BLUE</span><div class="pips"><i class="pip" style="background:#6aa8ff"></i><i class="pip" style="background:#6aa8ff"></i><i class="pip" style="background:#6aa8ff"></i><i class="pip" style="background:#6aa8ff"></i></div><span class="n b">2</span><span class="t">1:48</span><span class="n o">1</span><div class="pips"><i class="pip" style="background:#ff9a3c;opacity:.35"></i><i class="pip" style="background:#ff9a3c"></i><i class="pip" style="background:#ff9a3c"></i><i class="pip" style="background:#ff9a3c"></i></div><span class="o">ORANGE</span></div>
    <div class="feed"><span style="color:#ff9a3c">Orange 3</span> called HIT · <span style="color:#6aa8ff">Blue 2</span></div>
    <div class="ammo"><div class="w">AEG RIFLE<span>AUTO</span></div><div class="c">41 <small>/ 300</small></div></div>
    <div class="cross"><i style="left:-.9vw;top:-1px;width:.6vw;height:2px"></i><i style="left:.3vw;top:-1px;width:.6vw;height:2px"></i><i style="top:-.9vw;left:-1px;height:.6vw;width:2px"></i><i style="top:.3vw;left:-1px;height:.6vw;width:2px"></i></div>`,
  );
}

export function woodlandShot(ctx: ShotCtx, view: string): PostOpts {
  const { scene, camera, preset: p, kit } = ctx;
  const v = VIEWS[view] ?? VIEWS.map!;
  // The night's reflections, before any material is made (the shared kit was given a daylight sky).
  if (p.pbr) kit.envMap = nightEnv(ctx.renderer);
  const W = ctx.renderer.domElement.width;
  const H = ctx.renderer.domElement.height;
  const full = p.smallParts;

  // Camera first: grass and the near scatter are laid out round what it sees.
  const [ex, ez, eh, abs] = v.eye;
  camera.fov = v.fov;
  camera.aspect = W / H;
  camera.near = view === 'ingame' ? 0.03 : view === 'detail' ? 0.05 : 0.3;
  camera.far = 2000;
  camera.position.set(ex, abs ? eh : groundY(ex, ez) + eh, ez);
  const [lx, ly, lz] = v.look;
  camera.lookAt(lx, ly, lz);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const eyeG = V(ex, groundY(ex, ez), ez);

  // Sky, haze, background.
  const sky = nightSky({ stars: 1, clouds: p.clouds ? 1 : 0.35 });
  fitSkyToCamera(sky, camera, H);
  scene.add(sky);
  scene.background = new THREE.Color(NIGHT.fog);
  scene.fog = new THREE.Fog(NIGHT.fog, v.fog[0], v.fog[1]);

  // The map.
  const group = new THREE.Group();
  buildGround(kit, group);
  const reflective = buildPuddles(kit, group);
  const bk = new Bulks();
  buildBlocks(bk, full);
  const cabin = buildCabin(bk, full);
  const fx = buildLightFixtures(bk, full, cabin.hook);
  const trees = buildFieldTrees({ bulks: bk, full, kit });
  buildOuterForest({ bulks: bk, full, kit }, eyeG, [DEER_GLADE]);
  buildBushes(bk, full);
  if (view !== 'top') {
    buildGroundCover(bk, { full, eye: eyeG, nearReach: v.near, amount: v.amount });
    const stumps = buildStumps(bk, full);
    buildAxe(bk, stumps.axe);
  }
  const lamps = campKit(bk, full);
  for (const at of lamps) standingLantern(bk, fx.group, at);
  // Wildlife (still poses; animated in the game).
  for (const d of DEER) deer(bk, V(d.x, groundY(d.x, d.z), d.z), d.yaw, d.stag, d.turn);
  if (trees.perches[0]) owl(bk, trees.perches[0].clone().add(V(0, 0.05, 0)), -2.2);
  fox(bk, V(55.4, groundY(55.4, -14.9), -14.9), 0.2, 0.6);
  fox(bk, V(-12, groundY(-12, 25.5), 25.5), 2.4, 0.5);
  rabbit(bk, V(-18, groundY(-18, 12), 12), -1.2);
  rabbit(bk, V(49.6, groundY(49.6, -9.6), -9.6), 2.2);
  for (const l of fx.lights) if (l.kind === 'lantern') moths(bk, l.pos, Math.floor(l.pos.x * 10));
  bats(bk, camera.position, MOON_DIR.clone().setY(MOON_DIR.y * 1.1).normalize());
  bk.build(kit, group, ['wlGlow', 'wlPlant', 'wlBlade']);
  if (p.surfaceMaps && v.grass[0] > 0) {
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(v.fov / 2)) * camera.aspect);
    buildGrassBlades(kit, group, { eye: eyeG, look: V(lx, ly, lz), halfFov, density: v.grass[0], reach: v.grass[1] });
  }
  fireflies(fx.group, eyeG, full ? 340 : 160, 0.3, Math.max(8, v.near));
  group.add(fx.group);
  scene.add(group);

  // Moonlight with its shadow fitted to the view, the sky's fill.
  const moon = new THREE.DirectionalLight(LIGHT.moon, p.pbr ? LIGHT.moonPbr : LIGHT.moonLambert);
  moon.castShadow = true;
  moon.shadow.mapSize.set(p.shadowMap, p.shadowMap);
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.04;
  moon.shadow.radius = p.softShadows ? 3 : 1;
  moon.shadow.blurSamples = 12;
  fitShadow(moon, camera, v.shadow);
  scene.add(moon, moon.target);
  scene.add(new THREE.HemisphereLight(LIGHT.skyFill, LIGHT.groundFill, p.pbr ? LIGHT.fillPbr : LIGHT.fillLambert));
  // Fires and lanterns: real point lights (on Low only the nearest few, no shadows).
  const pts = [...fx.lights].sort((a, b) => a.pos.distanceTo(camera.position) - b.pos.distanceTo(camera.position));
  const used = p.id === 'low' ? pts.slice(0, LOW_POINT_LIGHTS) : pts;
  for (const [i, l] of used.entries()) {
    const fire = l.kind === 'fire';
    const pl = new THREE.PointLight(fire ? LIGHT.fire : LIGHT.lantern, fire ? LIGHT.fireCd : LIGHT.lanternCd, fire ? 22 : 13, 2);
    pl.position.copy(l.pos).add(V(0, fire ? 0.25 : 0, 0));
    // Ultra: the nearest fire throws soft shadows when the view is close to it.
    if (p.id !== 'low' && fire && i === 0 && l.pos.distanceTo(camera.position) < 25) {
      pl.castShadow = true;
      pl.shadow.mapSize.set(1024, 1024);
      pl.shadow.bias = -0.002;
      pl.shadow.radius = 4;
      pl.shadow.camera.near = 0.2;
      pl.shadow.camera.far = 22;
    }
    scene.add(pl);
  }
  // The viewmodel's own soft fill (reaches only a metre or so), as games light the held replica.
  if (view === 'ingame') {
    const vmFill = new THREE.PointLight(0x9fb6ff, 0.9, 1.6, 2);
    vmFill.position.set(-0.35, 0.35, 0.15);
    camera.add(vmFill);
    const vm = buildViewmodel(ctx.newKit(), 'blue', 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, accent: 0x3a7fe6 }, { robot: ctx.robots, at: new THREE.Vector3(0.19, -0.235, -0.44), turn: new THREE.Euler(0.02, 0.09, -0.03, 'YXZ'), shoulders: [new THREE.Vector3(-0.16, -0.33, -0.03), new THREE.Vector3(0.25, -0.31, 0.1)] });
    camera.add(vm);
    scene.add(camera);
    const figs: [FigureOpts, number, number, number][] = [
      // An orange player aiming round the boulder off the lane's south side, another who just called HIT up the lane, a blue team-mate ahead.
      [{ team: 'orange', pose: 'aim', headgear: 'helmet', face: 'mask', robot: ctx.robots }, 9.4, -2.0, 0],
      [{ team: 'orange', pose: 'hit', headgear: 'bump', face: 'mask', skin: 0xb7835a, robot: ctx.robots }, 20.5, -7.5, 0],
      [{ team: 'blue', pose: 'run', headgear: 'bump', face: 'mask', skin: 0x8d5a3b, robot: ctx.robots }, 9, -8.8, 0],
    ];
    for (const [o, x, z] of figs) {
      // Face the eye (the orange) or along the lane (the blue).
      const tx = o.team === 'blue' ? 20 : ex;
      const tz = o.team === 'blue' ? -6 : ez;
      const yaw = Math.atan2(-(tx - x), -(tz - z));
      ctx.place(buildFigure(ctx.newKit(), o).group, x, z, yaw, groundY(x, z));
    }
    hud();
  }
  // Rim light on figures from the moon's side, cool blue; the key direction for the rim shader.
  SUN_DIR.copy(MOON_DIR);
  RIM.color.value.set(LIGHT.rim);
  RIM.strength.value = LIGHT.rimStrength;
  ctx.renderer.toneMappingExposure = v.exposure;
  // Screen-space reflections stay off: the puddles reflect the night env map (the SSR pass renders this scene black).
  void reflective;
  return { bloom: v.bloom, aoRadius: v.ao };
}
