import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POOL_LIGHTS, type QualitySettings } from '../config/render';
import type { MapData } from '../map/mapTypes';
import type { MapLight } from '../map/nightSight';
import { surfaceHeightAt } from '../map/surfaces';
import { terrainHeightAt, terrainMaxX, terrainMaxZ } from '../map/terrain';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * The light pools of a night field drawn (M33f): the camp fires and lanterns of MapData.lights (M33g), on any map that
 * has them. Every pool glows on every preset (one unlit mesh for all). The ground under each is lit by one additive
 * mesh for all pools, shaped to the ground; on Medium and High a fixed number of real point lights
 * (QualitySettings.poolLights) take the pools nearest the eye, and the ground mesh fades out under a pool while a real
 * light shines on it. A map without light pools gets nothing.
 */

type PoolConfig = typeof POOL_LIGHTS;

/** Which pool each real light shines on (M33f): plain data, stepped each frame by stepPoolLights. */
export interface PoolLightState {
  /** The pool each light should move to (-1: none). */
  readonly want: Int32Array;
  /** The pool each light shines on now (-1: none). */
  readonly current: Int32Array;
  /** Each light's brightness, 0..1: it fades out before it moves and fades in after. */
  readonly level: Float32Array;
  /** Scratch: each pool's distance from the eye to its edge (m). */
  readonly distance: Float32Array;
}

export function createPoolLightState(lights: number, pools: number): PoolLightState {
  return { want: new Int32Array(lights).fill(-1), current: new Int32Array(lights).fill(-1), level: new Float32Array(lights), distance: new Float32Array(pools) };
}

/** Whether pool `p` is wanted by, or still lit by, any light. */
function taken(s: PoolLightState, p: number): boolean {
  for (let k = 0; k < s.want.length; k++) if (s.want[k] === p || s.current[k] === p) return true;
  return false;
}

/** The nearest pool that no light wants or holds (-1: none). */
function nearestFree(s: PoolLightState): number {
  let best = -1;
  for (let p = 0; p < s.distance.length; p++) if (!taken(s, p) && (best < 0 || s.distance[p]! < s.distance[best]!)) best = p;
  return best;
}

/**
 * One frame of the real lights following the eye at (x, z): each wants one of the pools nearest to it (by distance to
 * the pool's edge), and gives a pool up for a free one only when that is `hysteresis` metres nearer, so standing between
 * two never makes a light flicker between them. A light that must move fades out over `fadeSeconds`, moves, and fades
 * in. Allocation-free.
 */
export function stepPoolLights(s: PoolLightState, pools: readonly MapLight[], x: number, z: number, dt: number, cfg: Pick<PoolConfig, 'hysteresis' | 'fadeSeconds'> = POOL_LIGHTS): void {
  const lights = s.want.length;
  for (let p = 0; p < pools.length; p++) {
    const l = pools[p]!;
    s.distance[p] = Math.max(0, Math.hypot(l.position.x - x, l.position.z - z) - l.radius);
  }
  for (let k = 0; k < lights; k++) {
    if (s.want[k]! >= 0) continue;
    const free = nearestFree(s);
    if (free < 0) break;
    s.want[k] = free;
  }
  for (let n = 0; n < lights; n++) {
    const free = nearestFree(s);
    if (free < 0) break;
    let worst = -1;
    for (let k = 0; k < lights; k++) if (s.want[k]! >= 0 && (worst < 0 || s.distance[s.want[k]!]! > s.distance[s.want[worst]!]!)) worst = k;
    if (worst < 0 || s.distance[free]! + cfg.hysteresis >= s.distance[s.want[worst]!]!) break;
    s.want[worst] = free;
  }
  const step = cfg.fadeSeconds > 0 ? dt / cfg.fadeSeconds : 1;
  for (let k = 0; k < lights; k++) {
    if (s.current[k] !== s.want[k]) {
      // Out (to within float error of nothing), then over to the pool it wants.
      const level = s.level[k]! - step;
      s.level[k] = level > 1e-6 ? level : 0;
      if (s.level[k] === 0) s.current[k] = s.want[k]!;
    } else if (s.current[k]! >= 0) s.level[k] = Math.min(1, s.level[k]! + step);
  }
}

/** A real light's intensity on a pool at full brightness (candela): it grows with the pool's area. */
export function poolLightIntensity(pool: MapLight, cfg: Pick<PoolConfig, 'intensityPerArea'> = POOL_LIGHTS): number {
  return cfg.intensityPerArea * pool.radius * pool.radius;
}

/** How far a real light on a pool reaches (m): past the pool's edge, so the edge is still lit. */
export function poolLightReach(pool: MapLight, cfg: Pick<PoolConfig, 'reach'> = POOL_LIGHTS): number {
  return cfg.reach * pool.radius;
}

/** How bright the ground mesh is at `t` of a pool's radius out (1 in the middle, 0 at the edge and beyond). */
export function poolFalloff(t: number): number {
  const u = Math.max(0, 1 - t * t);
  return u * u;
}

/**
 * The walkable ground's height at (x, z) for a pool whose light hangs at `below` (m): the terrain's (past its edge, the
 * edge's, so a pool by the fence stays flat behind it), or the highest floor or ramp top under the light; undefined where
 * there is none.
 */
export function groundUnder(map: MapData, x: number, z: number, below: number): number | undefined {
  const t = map.terrain;
  if (t) return terrainHeightAt(t, Math.min(terrainMaxX(t), Math.max(t.minX, x)), Math.min(terrainMaxZ(t), Math.max(t.minZ, z)));
  let best: number | undefined;
  for (const b of map.blocks) {
    const h = surfaceHeightAt(b, x, z);
    if (h !== undefined && h <= below && (best === undefined || h > best)) best = h;
  }
  return best;
}

const glowColour = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/** Every pool's glow (M33f): a bright core at the light inside faint halos, additive and unlit, one mesh for all. */
export function buildPoolGlow(pools: readonly MapLight[], cfg: PoolConfig = POOL_LIGHTS): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (const l of pools) {
    const core = cfg.core * l.radius;
    const shells = [{ size: 1, alpha: 1, white: cfg.coreWhite }, ...cfg.halos.map((h) => ({ ...h, white: 0 }))];
    for (const { size, alpha, white } of shells) {
      const radius = core * size;
      const g = new THREE.IcosahedronGeometry(radius, cfg.glowDetail).translate(l.position.x, l.position.y, l.position.z);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      glowColour.setHex(l.colour).lerp(WHITE, white);
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) col.set([glowColour.r, glowColour.g, glowColour.b, alpha], i * 4);
      g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('no pool glow');
  const mesh = new THREE.Mesh(merged, additive(new THREE.MeshBasicMaterial({ vertexColors: true })));
  mesh.name = 'pool-glow';
  return mesh;
}

/** An additive, unlit, unfogged material that writes no depth (a light, not a surface), off the environment map. */
function additive(m: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.fog = false;
  return withoutEnvironment(m);
}

/** The ground light of every pool as one mesh, and where each pool's vertices are in it (to dim one under a real light). */
export interface PoolDecal {
  mesh: THREE.Mesh;
  /** Each vertex's full colour (linear RGB): the colour attribute is this times its pool's scale. */
  base: Float32Array;
  /** The first vertex and the vertex count of each pool. */
  start: Uint32Array;
  count: Uint32Array;
}

/**
 * The ground under every pool (M33f): a disc of `rings` × `segments` round the light, each vertex on the ground under
 * it (`lift` above), coloured by the pool's colour × `strength` × poolFalloff; additive, one mesh for all pools.
 */
export function buildPoolDecal(map: MapData, pools: readonly MapLight[], cfg: PoolConfig = POOL_LIGHTS): PoolDecal {
  const perPool = 1 + cfg.rings * cfg.segments;
  const pos = new Float32Array(pools.length * perPool * 3);
  const base = new Float32Array(pools.length * perPool * 3);
  const index: number[] = [];
  const start = new Uint32Array(pools.length);
  const count = new Uint32Array(pools.length).fill(perPool);
  const c = new THREE.Color();
  pools.forEach((l, p) => {
    const first = p * perPool;
    start[p] = first;
    const { x, y, z } = l.position;
    const middle = groundUnder(map, x, z, y) ?? 0;
    c.setHex(l.colour).multiplyScalar(cfg.strength);
    const put = (v: number, px: number, pz: number, t: number): void => {
      pos.set([px, (groundUnder(map, px, pz, y) ?? middle) + cfg.lift, pz], v * 3);
      const f = poolFalloff(t);
      base.set([c.r * f, c.g * f, c.b * f], v * 3);
    };
    put(first, x, z, 0);
    for (let r = 1; r <= cfg.rings; r++) {
      const t = r / cfg.rings;
      for (let s = 0; s < cfg.segments; s++) {
        const a = (s / cfg.segments) * Math.PI * 2;
        put(first + 1 + (r - 1) * cfg.segments + s, x + Math.cos(a) * t * l.radius, z + Math.sin(a) * t * l.radius, t);
      }
    }
    // Wound counter-clockwise seen from above: the faces point up.
    for (let s = 0; s < cfg.segments; s++) {
      const n = (s + 1) % cfg.segments;
      index.push(first, first + 1 + n, first + 1 + s);
      for (let r = 1; r < cfg.rings; r++) {
        const [a0, a1] = [first + 1 + (r - 1) * cfg.segments + s, first + 1 + (r - 1) * cfg.segments + n];
        const [b0, b1] = [a0 + cfg.segments, a1 + cfg.segments];
        index.push(a0, a1, b1, a0, b1, b0);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(base.slice(), 3));
  geo.setIndex(index);
  const material = additive(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'pool-ground';
  mesh.matrixAutoUpdate = false;
  return { mesh, base, start, count };
}

/** Sets pool `p`'s ground light to `scale` of its full colour. */
function scaleDecal(d: PoolDecal, p: number, scale: number): void {
  const col = d.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const arr = col.array as Float32Array;
  const from = d.start[p]! * 3;
  const to = from + d.count[p]! * 3;
  for (let i = from; i < to; i++) arr[i] = d.base[i]! * scale;
  col.needsUpdate = true;
}

/** A map's light pools in the scene: follow the eye each frame, change with the quality, dispose with the match. */
export interface LightPools {
  setQuality(quality: Pick<QualitySettings, 'poolLights'>): void;
  /** Moves the real lights to the pools nearest `eye` (fading over `dt` seconds of this frame). Allocation-free. */
  follow(eye: THREE.Vector3, dt: number): void;
  dispose(): void;
}

const NONE: LightPools = { setQuality: () => undefined, follow: () => undefined, dispose: () => undefined };

/** Adds `map`'s light pools to `scene` at `quality`'s Night lights; a map without pools gets nothing. */
export function addLightPools(scene: THREE.Scene, map: MapData, quality: Pick<QualitySettings, 'poolLights'>): LightPools {
  const pools = map.lights ?? [];
  if (pools.length === 0) return NONE;
  const glow = buildPoolGlow(pools);
  const decal = buildPoolDecal(map, pools);
  scene.add(glow, decal.mesh);
  const decalScale = new Float32Array(pools.length).fill(1);
  let lights: THREE.PointLight[] = [];
  let state = createPoolLightState(0, pools.length);
  const dropLights = (): void => {
    for (const l of lights) {
      scene.remove(l);
      l.dispose();
    }
    lights = [];
  };
  const setQuality = (q: Pick<QualitySettings, 'poolLights'>): void => {
    if (q.poolLights === lights.length) return;
    dropLights();
    // A fixed number for as long as the setting holds: Three.js rebuilds every lit shader when the count changes.
    for (let k = 0; k < q.poolLights; k++) {
      const l = new THREE.PointLight(0xffffff, 0, 0, POOL_LIGHTS.decay);
      l.castShadow = false;
      l.name = 'pool-light';
      lights.push(l);
      scene.add(l);
    }
    state = createPoolLightState(q.poolLights, pools.length);
    for (let p = 0; p < pools.length; p++) setScale(p, 1);
  };
  const setScale = (p: number, scale: number): void => {
    if (Math.abs(decalScale[p]! - scale) < 1e-4) return;
    decalScale[p] = scale;
    scaleDecal(decal, p, scale);
  };
  setQuality(quality);
  return {
    setQuality,
    follow: (eye, dt) => {
      if (lights.length === 0) return;
      stepPoolLights(state, pools, eye.x, eye.z, dt);
      for (let p = 0; p < pools.length; p++) {
        let lit = 0;
        for (let k = 0; k < lights.length; k++) if (state.current[k] === p) lit = Math.max(lit, state.level[k]!);
        setScale(p, 1 - lit);
      }
      for (let k = 0; k < lights.length; k++) {
        const light = lights[k]!;
        const p = state.current[k]!;
        if (p < 0) {
          light.intensity = 0;
          continue;
        }
        const pool = pools[p]!;
        light.position.set(pool.position.x, pool.position.y, pool.position.z);
        light.color.setHex(pool.colour);
        light.distance = poolLightReach(pool);
        light.intensity = poolLightIntensity(pool) * state.level[k]!;
      }
    },
    dispose: () => {
      dropLights();
      scene.remove(glow, decal.mesh);
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
      decal.mesh.geometry.dispose();
      (decal.mesh.material as THREE.Material).dispose();
    },
  };
}
