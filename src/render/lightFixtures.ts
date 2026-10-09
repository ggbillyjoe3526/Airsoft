import * as THREE from 'three';
import { FIXTURES, SURFACES, type SurfaceTextureId } from '../config/render';
import type { MapBlock, MapData } from '../map/mapTypes';
import type { MapLight } from '../map/nightSight';
import { createRng, rngNext } from '../sim/rng';
import { appendCuboid, type Buffers, PLAIN } from './cuboidMesh';
import { appendNatureShape, appendRound, type NaturePaint } from './natureShapes';
import { NO_ENVIRONMENT } from './surfaceMaterials';

/**
 * What gives a map's light (M33i, MapLight.kind), on any map whose lights say: a camp fire (a ring of stones, charred
 * logs, crossed flame cards and rising embers) or a lantern (a housing with glowing panes, on a bracket to the block
 * beside it or on a post). The solid parts go into the map's merged meshes (render/mapMeshes.ts: no draw call of their
 * own, no collider: fixtures stand behind the spawns and by walls); the flames and panes are one additive mesh and the
 * embers one draw of points (render/lightPools.ts adds them with the pools). Fires flicker in the vertex shader: no CPU
 * work on the mesh, ever; `flicker` is the same curve for the real pool light on Medium and High.
 */

/** The ground under a light (the pools' rule, render/lightPools.ts groundUnder): passed in, so this module stands alone. */
export type GroundUnder = (x: number, z: number, below: number) => number;

const F = FIXTURES;
/** How each sine of the flicker is offset by a light's seed (so two fires never flicker together). */
export const PHASE = [1, 1.7, 2.9] as const;

/** The flicker seed of a map's light `index` (its place in MapData.lights): the flames and the real light share it. */
export const flickerSeed = (index: number): number => index * 2.3 + 0.7;

/**
 * A fire's brightness at `t` seconds (seed `seed`): 1 + FIXTURES.flicker.amount × a weighted sum of sines, so within
 * 1 ± amount and about 1 on average. The vertex shader below draws the same curve. Pure, allocation-free.
 */
export function flicker(t: number, seed: number): number {
  const { amount, rates, weights } = F.flicker;
  let s = 0;
  for (let i = 0; i < rates.length; i++) s += weights[i]! * Math.sin(rates[i]! * t + PHASE[i]! * seed);
  return 1 + amount * s;
}

/** The lights that have a fixture. */
const fixtured = (lights: readonly MapLight[]): MapLight[] => lights.filter((l) => l.kind === 'fire' || l.kind === 'lantern');

/** The block a lantern hangs on: one whose side is within `bracketReach` of it and whose height spans it; else null. */
export function lanternMount(light: MapLight, blocks: readonly MapBlock[]): { block: MapBlock; x: number; z: number } | null {
  const p = light.position;
  let best: { block: MapBlock; x: number; z: number; d: number } | null = null;
  for (const b of blocks) {
    if (p.y < b.center.y - b.size.y / 2 || p.y > b.center.y + b.size.y / 2) continue;
    const x = Math.min(b.center.x + b.size.x / 2, Math.max(b.center.x - b.size.x / 2, p.x));
    const z = Math.min(b.center.z + b.size.z / 2, Math.max(b.center.z - b.size.z / 2, p.z));
    const d = Math.hypot(x - p.x, z - p.z);
    if (d <= F.lantern.bracketReach && (!best || d < best.d)) best = { block: b, x, z, d };
  }
  return best && { block: best.block, x: best.x, z: best.z };
}

const colour = new THREE.Color();
const capColour = new THREE.Color();
const from = new THREE.Vector3();
const to = new THREE.Vector3();

/** Buffers to write into, by surface texture (the map's merged meshes'), and that surface's metres per repeat. */
export type FixtureBuffers = (texture: Extract<SurfaceTextureId, 'bark' | 'stone'>) => Buffers;

/**
 * The fixtures' solid parts (fire rings and logs into `stone` and `bark`, lanterns' housings, brackets and posts into
 * `bark`), for every light of `map` with a kind. Nothing for a map without them. Build-time only.
 */
export function appendFixtureSolids(map: MapData, buffers: FixtureBuffers, ground: GroundUnder): void {
  for (const light of fixtured(map.lights ?? [])) {
    const { x, y, z } = light.position;
    const g = ground(x, z, y);
    if (light.kind === 'fire') appendFirePit(light, g, buffers);
    else appendLantern(light, g, map.blocks, buffers('bark'));
  }
}

/** A ring of stones round the fire and its logs leaning in to the middle. */
function appendFirePit(light: MapLight, g: number, buffers: FixtureBuffers): void {
  const { x, z } = light.position;
  const fire = F.fire;
  const rng = createRng(Math.round(x * 100) ^ Math.round(z * 100));
  colour.setHex(fire.stoneTint, THREE.SRGBColorSpace);
  const stone: NaturePaint = { worldSize: SURFACES.worldSize.stone, color: colour, grimeFrom: g };
  for (let i = 0; i < fire.stones; i++) {
    const a = ((i + rngNext(rng) * fire.stoneJitter) / fire.stones) * Math.PI * 2;
    const s = fire.stoneSize[0] + rngNext(rng) * (fire.stoneSize[1] - fire.stoneSize[0]);
    const h = s * fire.stoneHeight;
    const block: MapBlock = { kind: 'boulder', center: { x: x + Math.cos(a) * fire.ringRadius, y: g + h / 2 - fire.stoneSink, z: z + Math.sin(a) * fire.ringRadius }, size: { x: s, y: h, z: s * fire.stoneDepth } };
    appendNatureShape(buffers('stone'), block, stone, null, 1);
  }
  const logColour = new THREE.Color().setHex(fire.logTint, THREE.SRGBColorSpace);
  capColour.copy(logColour).multiplyScalar(fire.logEndShade);
  const bark: NaturePaint = { worldSize: SURFACES.worldSize.bark, color: logColour, grimeFrom: null };
  for (let i = 0; i < fire.logs; i++) {
    const a = ((i + 0.15) / fire.logs) * Math.PI * 2;
    from.set(x + Math.cos(a) * fire.logLength * fire.logOut, g + fire.logRadius, z + Math.sin(a) * fire.logLength * fire.logOut);
    to.set(x - Math.cos(a) * fire.logLength * fire.logIn, g + fire.logRadius * fire.logRise, z - Math.sin(a) * fire.logLength * fire.logIn);
    appendRound(buffers('bark'), from, to, fire.logRadius, fire.logSides, bark, capColour);
  }
}

/** A lantern's housing round its light, and its bracket to the block beside it or its post down to the ground. */
function appendLantern(light: MapLight, g: number, blocks: readonly MapBlock[], buf: Buffers): void {
  const L = F.lantern;
  const { x, y, z } = light.position;
  const [w, h] = L.size;
  const t = L.frame;
  const paint = { uv: 'world' as const, worldSize: SURFACES.worldSize.bark, color: colour.setHex(L.tint, THREE.SRGBColorSpace), grimeFrom: null };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => appendCuboid(buf, { min: [x0, y0, z0], max: [x1, y1, z1] }, paint, PLAIN);
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  // Base plate, cap, and a post at each corner between them.
  box(x - w / 2, y0, z - w / 2, x + w / 2, y0 + t, z + w / 2);
  box(x - w / 2 - t, y1 - 2 * t, z - w / 2 - t, x + w / 2 + t, y1, z + w / 2 + t);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(x + sx * w / 2 - (sx > 0 ? t : 0), y0, z + sz * w / 2 - (sz > 0 ? t : 0), x + sx * w / 2 + (sx < 0 ? t : 0), y1, z + sz * w / 2 + (sz < 0 ? t : 0));
  const mount = lanternMount(light, blocks);
  if (mount) {
    // A bar from the cap's middle to the block's face, just above the cap.
    const by0 = y1;
    const by1 = y1 + t * 1.5;
    box(Math.min(x, mount.x) - t / 2, by0, Math.min(z, mount.z) - t / 2, Math.max(x, mount.x) + t / 2, by1, Math.max(z, mount.z) + t / 2);
    return;
  }
  paint.color = colour.setHex(L.postTint, THREE.SRGBColorSpace);
  box(x - L.post / 2, g - L.postSink, z - L.post / 2, x + L.post / 2, y0, z + L.post / 2);
}

/** The flames, panes and embers of a map's fixtures in the scene: one clock for their shaders. */
export interface LightFixtures {
  readonly group: THREE.Group;
  /** Moves the shaders' clock on by `dt` seconds (one uniform: no work on the meshes). */
  advance(dt: number): void;
  /** The clock (s), for the real pool lights' flicker. */
  readonly time: number;
  /** Embers on (where dust motes are on) or off. */
  setEmbers(on: boolean): void;
  dispose(): void;
}

/** The shaders' clock wraps here (s), long before float precision matters. */
const CLOCK_WRAP = 3600;

/** The flicker curve in GLSL (fxFlicker(seed)), the same as `flicker`. */
function flickerGlsl(): string {
  const { rates, weights } = F.flicker;
  const terms = rates.map((r, i) => `${weights[i]!.toFixed(4)} * sin(${r.toFixed(4)} * fxTime + ${PHASE[i]!.toFixed(4)} * seed)`).join(' + ');
  return `float fxFlicker(float seed) { return ${terms}; }\n`;
}

/**
 * The flame cards of each fire and the panes of each lantern among `lights` (a map's, in order: each one's flicker seed is
 * its place): positions, RGBA colours and (seed, amount, sway).
 */
export function flameGeometry(lights: readonly MapLight[], ground: GroundUnder): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const fx: number[] = [];
  const idx: number[] = [];
  const fl = F.fire.flames;
  lights.forEach((light, li) => {
    const { x, y, z } = light.position;
    const seed = flickerSeed(li);
    if (light.kind === 'fire') {
      const g = ground(x, z, y) + fl.lift;
      for (let card = 0; card < fl.cards; card++) {
        const a = (card / fl.cards) * Math.PI;
        const ux = Math.cos(a) * fl.width * 0.5;
        const uz = Math.sin(a) * fl.width * 0.5;
        const base = pos.length / 3;
        for (const r of fl.rows) {
          colour.setHex(r.colour);
          for (const side of [-1, 1]) {
            pos.push(x + side * ux * r.width, g + r.at * fl.height, z + side * uz * r.width);
            col.push(colour.r, colour.g, colour.b, r.alpha);
            fx.push(seed + card, F.flicker.amount * fl.flicker, fl.sway * r.sway);
          }
        }
        for (let k = 0; k + 1 < fl.rows.length; k++) {
          const p = base + k * 2;
          idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
        }
      }
      return;
    }
    if (light.kind !== 'lantern') return;
    // A lantern's four panes, just inside its corner posts.
    const L = F.lantern;
    const [w, h] = L.size;
    const half = w / 2 - L.frame / 2;
    colour.setHex(L.pane);
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const base = pos.length / 3;
      for (const [s, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        pos.push(x + nx * half + nz * s * half, y + ((v * h) / 2) * L.paneHeight, z + nz * half - nx * s * half);
        col.push(colour.r, colour.g, colour.b, L.paneAlpha);
        fx.push(seed, F.flicker.amount * L.flicker, 0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('flicker', new THREE.Float32BufferAttribute(fx, 3));
  geo.setIndex(idx);
  return geo;
}

/** Every fire's embers: FIXTURES.embers.perFire points at its foot, each with (phase, drift x, drift z, speed). */
function emberGeometry(lights: readonly MapLight[], ground: GroundUnder): THREE.BufferGeometry | null {
  const fires = lights.filter((l) => l.kind === 'fire');
  if (fires.length === 0) return null;
  const E = F.embers;
  const rng = createRng(E.seed);
  const pos: number[] = [];
  const ember: number[] = [];
  for (const f of fires) {
    const g = ground(f.position.x, f.position.z, f.position.y) + F.fire.flames.lift;
    for (let i = 0; i < E.perFire; i++) {
      const a = rngNext(rng) * Math.PI * 2;
      pos.push(f.position.x, g + rngNext(rng) * E.startHeight, f.position.z);
      const r = rngNext(rng);
      ember.push(rngNext(rng), Math.cos(a) * r, Math.sin(a) * r, E.speed[0] + rngNext(rng) * (E.speed[1] - E.speed[0]));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('ember', new THREE.Float32BufferAttribute(ember, 4));
  return geo;
}

/**
 * The flames, panes and embers of `map`'s fixtures, or null when none of its lights has a kind (Depot, Neon Heights).
 * Additive, unlit, unfogged and off the environment map, like the pools' glow (M33f); never culled, so their shaders are
 * built with the match's first frame, not when one comes into view. Embers start `embers` on or off.
 */
export function buildLightFixtures(map: MapData, ground: GroundUnder, embers: boolean): LightFixtures | null {
  const lights = fixtured(map.lights ?? []);
  if (lights.length === 0) return null;
  const clock = { value: 0 };
  const group = new THREE.Group();
  group.name = 'light-fixtures';
  const flames = new THREE.Mesh(flameGeometry(map.lights ?? [], ground), fxMaterial(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), clock, 'flames'));
  flames.name = 'fire-flames';
  flames.frustumCulled = false;
  flames.matrixAutoUpdate = false;
  group.add(flames);
  const emberGeo = emberGeometry(lights, ground);
  let points: THREE.Points | null = null;
  if (emberGeo) {
    const E = F.embers;
    points = new THREE.Points(emberGeo, fxMaterial(new THREE.PointsMaterial({ color: E.colour, size: E.size, sizeAttenuation: true }), clock, 'embers'));
    points.name = 'fire-embers';
    points.frustumCulled = false;
    points.matrixAutoUpdate = false;
    points.visible = embers;
    group.add(points);
  }
  return {
    group,
    advance: (dt) => {
      clock.value = (clock.value + dt) % CLOCK_WRAP;
    },
    get time() {
      return clock.value;
    },
    setEmbers: (on) => {
      if (points) points.visible = on;
    },
    dispose: () => {
      group.removeFromParent();
      for (const o of [flames, points]) {
        if (!o) continue;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
  };
}

/**
 * Makes a flame or ember material: additive, no depth writes, unfogged, off the environment map, with the fixtures'
 * clock and the flicker (flames: brightness and sway by each vertex's `flicker` attribute; embers: rising from their foot
 * over their life, fading out, round).
 */
function fxMaterial<M extends THREE.MeshBasicMaterial | THREE.PointsMaterial>(m: M, clock: { value: number }, kind: 'flames' | 'embers'): M {
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.fog = false;
  // One pass for both faces of a card (three.js otherwise draws a transparent two-sided mesh twice).
  m.forceSinglePass = true;
  const E = F.embers;
  const fl = F.fire.flames;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fxTime = clock;
    const head = `${NO_ENVIRONMENT}uniform float fxTime;\n${flickerGlsl()}`;
    if (kind === 'flames') {
      shader.vertexShader = `${head}attribute vec3 flicker;\n${shader.vertexShader}`
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\ntransformed.x += flicker.z * sin(fxTime * ${fl.swayRates[0].toFixed(3)} + flicker.x * ${PHASE[1].toFixed(3)});\ntransformed.z += flicker.z * cos(fxTime * ${fl.swayRates[1].toFixed(3)} + flicker.x);`,
        )
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= 1.0 + flicker.y * fxFlicker(flicker.x);');
      shader.fragmentShader = NO_ENVIRONMENT + shader.fragmentShader;
      return;
    }
    shader.vertexShader = `${head}attribute vec4 ember;\nvarying float vEmber;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
float emberT = fract(fxTime / ${E.life.toFixed(3)} * ember.w + ember.x);
transformed += vec3(ember.y * emberT * ${E.spread.toFixed(3)} + ${E.wobble.toFixed(3)} * sin(fxTime * ${E.wobbleRate.toFixed(3)} + ember.x * 6.2832), emberT * ${E.rise.toFixed(3)}, ember.z * emberT * ${E.spread.toFixed(3)});
vEmber = (1.0 - emberT) * smoothstep(0.0, 0.08, emberT);`,
    );
    shader.fragmentShader = `${NO_ENVIRONMENT}varying float vEmber;\n${shader.fragmentShader}`.replace(
      '#include <alphatest_fragment>',
      'diffuseColor.a *= vEmber * smoothstep(0.5, 0.15, length(gl_PointCoord - vec2(0.5)));\n#include <alphatest_fragment>',
    );
  };
  m.customProgramCacheKey = () => `light-fixtures-${kind}`;
  return m;
}
