import * as THREE from 'three';
import { buildFigure, buildViewmodel } from './characters';
import { SUN_DIR } from './env';
import { RIM } from './kit';
import { haloTex, screenAtlas, streakTex } from './neon-assets';
import { buildCity, V, type City, type Spot } from './neon-city';
import { dressCity } from './neon-dress';
import { MOON_DIR, nightEnv, nightSky, plane, skyline } from './neon-sky';
import type { PostOpts } from './post';
import type { ShotCtx } from './shot';

/**
 * Neon Heights at night in the overhaul's look: the game's city map (src/map/neonHeights.ts) re-dressed by neon-city.ts
 * and neon-dress.ts, under a night sky with the far city round it (neon-sky.ts), lit by a weak moon, the city's glow and
 * the neon itself. Views: 'map' (down Neon Avenue, low), 'overview' (high over the site), 'ingame' (first person on the
 * avenue) and 'detail' (a corner of Noodle Alley).
 */

/** The city's night (the map's CITY_NIGHT override): violet haze, a violet sky fill over a dark ground. */
const NIGHT = {
  fog: 0x2a2250,
  fogNear: 45,
  fogFar: 620,
  hemiSky: 0x6a62a8,
  hemiGround: 0x2c2638,
  moon: 0xa8b4ff,
};

/** From high up the roofs are most of the frame and only the moon and the sky light them: both lifted this much. */
const HIGH_LIFT = 2;

/** Per view: the camera, where its lights gather, the shadow's reach, how many point lights, and a plane in its sky. */
interface View {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  near: number;
  focus: THREE.Vector3;
  span: number;
  plane: { dir: THREE.Vector3; heading: THREE.Vector3; dist: number };
  bloom: number;
  ao: number;
  /** Seen from high up: the ring of buildings on the camera's corner is kept low, and the moon and sky fill are raised. */
  high?: boolean;
}

const VIEWS: Record<string, View> = {
  map: {
    pos: V(1.0, 2.25, -14.3),
    look: V(0.0, 3.2, 8),
    fov: 64,
    near: 0.1,
    focus: V(0.3, 2, 0),
    span: 24,
    plane: { dir: V(-0.1, 0.36, 1), heading: V(-1, 0.03, 0.25), dist: 900 },
    bloom: 0.3,
    ao: 0.45,
  },
  overview: {
    pos: V(-31, 29, 29),
    look: V(5, 10.5, -6),
    fov: 52,
    near: 0.5,
    focus: V(0, 2, 0),
    span: 36,
    plane: { dir: V(0.6, 0.24, -0.76), heading: V(-1, 0.03, -0.35), dist: 1100 },
    bloom: 0.3,
    ao: 0.9,
    high: true,
  },
  ingame: {
    pos: V(1.25, 1.62, 9.6),
    look: V(-0.8, 1.9, -4),
    fov: 72,
    near: 0.03,
    focus: V(0.3, 2, 2),
    span: 18,
    plane: { dir: V(0.05, 0.36, -1), heading: V(-1, 0.02, 0.2), dist: 900 },
    bloom: 0.28,
    ao: 0.45,
  },
  detail: {
    pos: V(-8.05, 0.85, -11.15),
    look: V(-5.4, 1.3, -14.4),
    fov: 62,
    near: 0.05,
    focus: V(-6, 1.5, -13),
    span: 9,
    plane: { dir: V(-0.5, 0.5, -1), heading: V(1, 0, 0.2), dist: 900 },
    bloom: 0.3,
    ao: 0.35,
  },
};

/** Swaps the batched stand-in materials for their real ones: the unlit atlas and the additive glows. */
function finishMaterials(group: THREE.Group): THREE.Mesh[] {
  const reflective: THREE.Mesh[] = [];
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh) continue;
    if (m.name === 'nhScreen') {
      m.material = new THREE.MeshBasicMaterial({ map: screenAtlas(), vertexColors: true, fog: true });
      m.castShadow = false;
    } else if (m.name === 'nhHalo') {
      m.material = new THREE.MeshBasicMaterial({ map: haloTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 4;
      // Named so the AO pass leaves it out (post.ts hides the sky and sprites from its depth).
      m.name = 'sky';
    } else if (m.name === 'nhWater') {
      m.castShadow = false;
      reflective.push(m);
    } else if (m.name === 'nhDecal' || m.name === 'glow') m.castShadow = false;
  }
  return reflective;
}

/**
 * Keeps glows that write no depth (halos, wet-road streaks, steam, sprites) out of the screen-space reflection's mask.
 * SSRPass marks its reflective meshes by drawing every visible object once more in a flat material; an additive halo
 * lying over a puddle would then mask the puddle out. While that pass has swapped an object's material, this one
 * answers with an invisible material instead, and gives its own back as soon as the pass restores it.
 */
const SSR_HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
function keepOutOfSsrMask(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const mat = m.material as THREE.Material | undefined;
    if (!mat || Array.isArray(mat) || mat.depthWrite) return;
    let own: THREE.Material = mat;
    let current: THREE.Material = mat;
    Object.defineProperty(m, 'material', {
      configurable: true,
      get: () => current,
      set: (v: THREE.Material) => {
        current = v === own ? own : v instanceof THREE.MeshBasicMaterial && !v.transparent && v.depthWrite ? SSR_HIDDEN : (own = v);
      },
    });
  });
}

/**
 * Reflections of the bright things in the wet street, drawn as soft streaks running from under each light towards the
 * camera (a still's stand-in for an anisotropic wet-road shader; puddles get true screen-space reflections on Ultra).
 */
function streaks(scene: THREE.Scene, glows: City['glows'], cam: THREE.Vector3, strength: number): void {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const e = cam.y;
  for (const g of glows) {
    const B = V(g.pos.x, 0, g.pos.z);
    const C = V(cam.x, 0, cam.z);
    const D = B.distanceTo(C);
    if (D < 1.5 || D > 34 || g.pos.y > 9) continue;
    const u = C.clone().sub(B).normalize();
    const side = V(-u.z, 0, u.x);
    const h = Math.max(0.3, g.pos.y);
    const mirror = (D * h) / (e + h);
    const len = Math.min(D - 0.8, mirror * 1.6 + 0.6);
    const w = 0.06 + g.size * 0.1;
    const s = B.clone().addScaledVector(u, Math.max(0.1, mirror * 0.25));
    const t = B.clone().addScaledVector(u, len);
    const y = 0.016;
    const c = new THREE.Color(g.colour).multiplyScalar(strength * (g.size > 1 ? 1 : 0.7));
    const quad = [
      [s.clone().addScaledVector(side, -w), 0, 0],
      [s.clone().addScaledVector(side, w), 1, 0],
      [t.clone().addScaledVector(side, w * 1.8), 1, 1],
      [t.clone().addScaledVector(side, -w * 1.8), 0, 1],
    ] as const;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [p, a, b] = quad[i]!;
      pos.push(p.x, y, p.z);
      uv.push(a, b);
      col.push(c.r, c.g, c.b);
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: streakTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.name = 'sky';
  m.renderOrder = 4;
  scene.add(m);
}

/** The nearest lights to the view become real point lights (Low gets four, Ultra a dozen and a half). */
function pointLights(scene: THREE.Scene, spots: Spot[], focus: THREE.Vector3, cam: THREE.Vector3, n: number, pbr: boolean): void {
  const score = (s: Spot) => Math.min(s.pos.distanceTo(focus), s.pos.distanceTo(cam) * 1.3) / Math.sqrt(Math.max(0.5, s.power));
  const picked = [...spots].sort((a, b) => score(a) - score(b)).slice(0, n);
  for (const s of picked) {
    const l = new THREE.PointLight(s.colour, s.power * (pbr ? 1 : 1.25), s.range, 2);
    l.position.copy(s.pos);
    scene.add(l);
  }
}

export function neonShot(ctx: ShotCtx, view: string): PostOpts {
  const { scene, camera, renderer, preset: p, kit } = ctx;
  const v = VIEWS[view] ?? VIEWS.map!;
  // A night environment for reflections, set before any material is made (the shared one is the daytime sky).
  if (p.pbr) kit.envMap = nightEnv(renderer);
  renderer.toneMappingExposure = p.pbr ? 1.0 : 1.2;
  const sky = nightSky();
  scene.add(sky);
  scene.background = new THREE.Color(NIGHT.fog);
  scene.fog = new THREE.Fog(NIGHT.fog, NIGHT.fogNear, NIGHT.fogFar);

  camera.fov = v.fov;
  camera.near = v.near;
  camera.far = 3000;
  camera.position.copy(v.pos);
  camera.lookAt(v.look);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // The map and its dressing, merged per material.
  const city = buildCity(kit);
  const fx = new THREE.Group();
  dressCity(kit, fx, city.lights, v.high ? v.pos : undefined);
  const map = kit.build();
  const reflective = finishMaterials(map);
  scene.add(map, fx);
  const far = new THREE.Group();
  skyline(p, far);
  // The airliner goes where the frame shows open sky (a screen position per view), crossing left to right.
  const PLANE_AT: Record<string, [number, number]> = { map: [0.12, 0.87], ingame: [0.02, 0.93], overview: [-0.55, 0.93] };
  const at = PLANE_AT[view];
  if (at) {
    const ray = new THREE.Vector3(at[0], at[1], 0.5).unproject(camera).sub(camera.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).transformDirection(camera.matrixWorld).setY(0.04).normalize();
    plane(far, camera, camera.position.clone().addScaledVector(ray, 650), right, 1.5);
  } else plane(far, camera, v.pos.clone().addScaledVector(v.plane.dir.clone().normalize(), v.plane.dist), v.plane.heading, 1);
  scene.add(far);
  streaks(scene, city.glows, v.pos, p.bloom ? 0.2 : 0.26);

  // Light: a weak moon with shadows fitted to the view, the city's violet sky fill, and the neon's own spill.
  const moon = new THREE.DirectionalLight(NIGHT.moon, (p.pbr ? 0.55 : 0.5) * (v.high ? HIGH_LIFT : 1));
  moon.position.copy(v.focus).addScaledVector(MOON_DIR, 80);
  moon.target.position.copy(v.focus);
  moon.castShadow = true;
  moon.shadow.mapSize.set(p.shadowMap, p.shadowMap);
  const sc = moon.shadow.camera;
  sc.left = -v.span;
  sc.right = v.span;
  sc.top = v.span;
  sc.bottom = -v.span;
  sc.near = 20;
  sc.far = 200;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.radius = p.softShadows ? 3 : 1;
  scene.add(moon, moon.target);
  scene.add(new THREE.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, (p.pbr ? 0.5 : 0.8) * (v.high ? HIGH_LIFT : 1)));
  pointLights(scene, city.lights, v.focus, v.pos, p.pbr ? 18 : 4, p.pbr);
  // Figures take their rim from the moon's side, a cool violet.
  SUN_DIR.copy(MOON_DIR);
  RIM.color.value.set(0xc4b8ff);
  RIM.strength.value = 0.5;

  if (p.ssr) keepOutOfSsrMask(scene);

  if (view === 'ingame') {
    // First person on the avenue: an orange player at the van's nose, another breaking from the kiosk, a team-mate ahead.
    const fig = (o: Parameters<typeof buildFigure>[1]) => buildFigure(ctx.newKit(), { ...o, robot: ctx.robots || o.robot === true }).group;
    ctx.place(fig({ team: 'orange', pose: 'aim', headgear: 'helmet', face: 'mask' }), -0.9, -8.4, Math.PI - 0.15);
    ctx.place(fig({ team: 'orange', pose: 'run', headgear: 'bump', face: 'mask', skin: 0xb7835a }), 3.2, -2.6, Math.PI + 0.9);
    ctx.place(fig({ team: 'blue', pose: 'ready', headgear: 'bump', face: 'mask', skin: 0x8d5a3b }), -1.35, 4.2, -0.2);
    const vm = buildViewmodel(ctx.newKit(), 'blue', 'aeg', { optic: 'redDot', grip: 'vertical', torch: true, accent: 0x3a7fe6 }, {
      robot: ctx.robots,
      at: new THREE.Vector3(0.19, -0.235, -0.44),
      turn: new THREE.Euler(0.02, 0.09, -0.03, 'YXZ'),
      shoulders: [new THREE.Vector3(-0.16, -0.33, -0.03), new THREE.Vector3(0.25, -0.31, 0.1)],
    });
    camera.add(vm);
    scene.add(camera);
  }
  return { reflective, bloom: v.bloom, aoRadius: v.ao };
}
