import * as THREE from 'three';
import { type LightingPreset, NIGHT_SKY } from '../config/render';
import { createRng, rngNext } from '../sim/rng';
import { NO_ENVIRONMENT } from './surfaceMaterials';

/**
 * The night sky (M33i): stars and the moon, on any preset whose `nightSky` asks for them (the night preset; the day's
 * asks for nothing, so nothing is built by day), on every quality: Low has its moon too. Two draws: the stars as one
 * draw of points, the moon as a crisp disc inside a soft halo where the key light comes from. Unfogged (they are the sky)
 * and writing no depth, drawn after the field; each follows the camera as it is drawn, so neither shifts as you move.
 */

/** The stars and moon in the scene. */
export interface NightSky {
  readonly group: THREE.Group;
  dispose(): void;
}

/** Puts a sky object on the camera before it is drawn (no allocation: copies the camera's world position). */
function followCamera(object: THREE.Object3D): void {
  object.onBeforeRender = (_renderer, _scene, camera) => {
    object.position.setFromMatrixPosition(camera.matrixWorld);
    object.updateMatrix();
    object.updateMatrixWorld();
  };
}

/**
 * The stars: `count` points on a sphere of NIGHT_SKY.radius, from a fixed seed, above NIGHT_SKY.minElevation and
 * fading towards the horizon until NIGHT_SKY.fadeTo; each a size in NIGHT_SKY.starSize (pixels, a `size` attribute) and
 * one of the tints. Exported for the tests.
 */
export function starGeometry(count: number): THREE.BufferGeometry {
  const S = NIGHT_SKY;
  const rng = createRng(S.seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 4);
  const size = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Uniform over the band of the sphere above minElevation (uniform in sin(elevation)).
    const lo = Math.sin(S.minElevation);
    const e = Math.asin(lo + rngNext(rng) * (1 - lo));
    const a = rngNext(rng) * Math.PI * 2;
    pos.set([Math.cos(a) * Math.cos(e) * S.radius, Math.sin(e) * S.radius, Math.sin(a) * Math.cos(e) * S.radius], i * 3);
    c.setHex(S.starTints[Math.floor(rngNext(rng) * S.starTints.length)]!);
    const brightness = 0.35 + 0.65 * rngNext(rng) ** 2;
    const fade = Math.min(1, Math.max(0, (e - S.minElevation) / (S.fadeTo - S.minElevation)));
    col.set([c.r, c.g, c.b, brightness * fade], i * 4);
    size[i] = S.starSize[0] + rngNext(rng) * (S.starSize[1] - S.starSize[0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('starSize', new THREE.BufferAttribute(size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), S.radius);
  return geo;
}

/** A disc of `segments` round `centre` facing the origin, radius `r`, RGBA at the middle and the rim. */
function disc(pos: number[], col: number[], idx: number[], centre: THREE.Vector3, r: number, segments: number, colour: THREE.Color, mid: number, rim: number): void {
  const n = centre.clone().normalize();
  const right = new THREE.Vector3(-n.z, 0, n.x).normalize();
  const up = new THREE.Vector3().crossVectors(right, n).normalize().negate();
  const base = pos.length / 3;
  pos.push(centre.x, centre.y, centre.z);
  col.push(colour.r, colour.g, colour.b, mid);
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    pos.push(centre.x + (right.x * Math.cos(a) + up.x * Math.sin(a)) * r, centre.y + (right.y * Math.cos(a) + up.y * Math.sin(a)) * r, centre.z + (right.z * Math.cos(a) + up.z * Math.sin(a)) * r);
    col.push(colour.r, colour.g, colour.b, rim);
  }
  for (let s = 0; s < segments; s++) idx.push(base, base + 1 + s, base + 1 + ((s + 1) % segments));
}

/**
 * The moon (exported for the tests): a soft halo (`halo` times the disc, `haloAlpha` at its middle, clear at its rim)
 * and in it the crisp disc, `moonSize` radians across, along the unit `towards` (the key light's direction).
 */
export function moonGeometry(look: LightingPreset['nightSky'], towards: THREE.Vector3): THREE.BufferGeometry {
  const S = NIGHT_SKY;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const centre = towards.clone().normalize().multiplyScalar(S.radius);
  const r = S.radius * Math.tan(look.moonSize / 2);
  const c = new THREE.Color(look.moonColour);
  disc(pos, col, idx, centre, r * look.halo, S.haloSegments, c, look.haloAlpha, 0);
  // The disc a hair nearer, so it draws over its halo.
  disc(pos, col, idx, centre.multiplyScalar(0.999), r, S.moonSegments, c, 1, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), S.radius);
  return geo;
}

/** A sky material: vertex colours with alpha, unfogged, no depth writes, off the environment map. */
function skyMaterial<M extends THREE.MeshBasicMaterial | THREE.PointsMaterial>(m: M, key: string, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): M {
  m.vertexColors = true;
  m.transparent = true;
  m.depthWrite = false;
  m.fog = false;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = NO_ENVIRONMENT + shader.vertexShader;
    shader.fragmentShader = NO_ENVIRONMENT + shader.fragmentShader;
    extra?.(shader);
  };
  m.customProgramCacheKey = () => `night-sky-${key}`;
  return m;
}

/**
 * The stars and moon of `preset` along the unit `towards` (the key light's direction), or null when it asks for
 * neither (the day). Never culled: they are built into the first frame's shaders.
 */
export function buildNightSky(preset: Pick<LightingPreset, 'nightSky'>, towards: THREE.Vector3): NightSky | null {
  const look = preset.nightSky;
  if (look.stars <= 0 && look.moonSize <= 0) return null;
  const group = new THREE.Group();
  group.name = 'night-sky';
  const parts: (THREE.Mesh | THREE.Points)[] = [];
  if (look.stars > 0) {
    // Each star its own size in pixels (`starSize`), round and soft-edged.
    const stars = new THREE.Points(
      starGeometry(look.stars),
      skyMaterial(new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, blending: THREE.AdditiveBlending }), 'stars', (shader) => {
        shader.vertexShader = `attribute float starSize;\n${shader.vertexShader}`.replace('gl_PointSize = size;', 'gl_PointSize = size * starSize;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(0.5, 0.2, length(gl_PointCoord - vec2(0.5)));\n#include <alphatest_fragment>');
      }),
    );
    stars.name = 'night-stars';
    parts.push(stars);
  }
  if (look.moonSize > 0) {
    const moon = new THREE.Mesh(moonGeometry(look, towards), skyMaterial(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, forceSinglePass: true }), 'moon'));
    moon.name = 'night-moon';
    parts.push(moon);
  }
  for (const p of parts) {
    p.frustumCulled = false;
    p.matrixAutoUpdate = false;
    followCamera(p);
    group.add(p);
  }
  return {
    group,
    dispose: () => {
      group.removeFromParent();
      for (const p of parts) {
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
      }
    },
  };
}
