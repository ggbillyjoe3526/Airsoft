import * as THREE from 'three';
import { ENVIRONMENT, LIGHTING, REPLICA_SHEEN } from '../config/render';
import { DEFAULT_SKY, type SkyPalette, skyColour } from './atmosphere';

/** What the sheen keeps on the GPU: a prefiltered render target (PMREMGenerator's output). */
export interface SheenTarget {
  readonly texture: THREE.Texture;
  dispose(): void;
}

/** The unit direction towards the sun (render/lighting.ts places the sun at LIGHTING.sunOffset above the field's centre). */
export function sunDirection(out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(LIGHTING.sunOffset.x, LIGHTING.sunOffset.y, LIGHTING.sunOffset.z).normalize();
}

/**
 * What the environment map is made from: the sky's palette, the unit direction towards the sun and the ground's
 * colour (sRGB). The engine's daytime values unless a map brings another sky (a night map): every value is passed in,
 * and the prefiltered target is kept per look (ReplicaSheen), so a different sky gets its own.
 */
export interface EnvironmentLook {
  readonly sky: SkyPalette;
  readonly sun: { readonly x: number; readonly y: number; readonly z: number };
  readonly ground: number;
}

export function defaultEnvironmentLook(): EnvironmentLook {
  const sun = sunDirection();
  return { sky: DEFAULT_SKY, sun: { x: sun.x, y: sun.y, z: sun.z }, ground: ENVIRONMENT.ground };
}

/** A key that differs whenever the look does (the cache key of the prefiltered target). */
export function environmentKey(look: EnvironmentLook): string {
  const s = look.sky;
  return [s.zenith, s.horizon, s.below, s.sunGlow, s.sunGlowPower, s.horizonFalloff, look.sun.x.toFixed(4), look.sun.y.toFixed(4), look.sun.z.toFixed(4), look.ground].join('|');
}

/**
 * The scene the environment map is made from (audit section 5, F1): the sky (skyColour with the look's palette and
 * sun) on a sphere seen from inside, over a disc of the look's ground colour, so whatever reflects it sees the sky the
 * player sees. The caller disposes it (disposeEnvironmentScene).
 */
export function skyEnvironmentScene(look: EnvironmentLook = defaultEnvironmentLook()): THREE.Scene {
  const E = ENVIRONMENT;
  const sun = new THREE.Vector3(look.sun.x, look.sun.y, look.sun.z);
  const sphere = new THREE.SphereGeometry(E.skyRadius, E.skyWidthSegments, E.skyHeightSegments);
  const pos = sphere.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    skyColour(dir.fromBufferAttribute(pos, i).normalize(), sun, c, look.sky);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  sphere.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(E.groundRadius, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: look.ground }));
  ground.position.y = -E.groundDrop;
  ground.name = 'ground';
  scene.add(ground);
  return scene;
}

/** Frees an environment scene's geometry and materials. */
export function disposeEnvironmentScene(scene: THREE.Scene): void {
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

/** Prefilters a sky; the scene and the generator's own buffers are freed at once (audit L-02). */
export function prefilterSky(gl: THREE.WebGLRenderer, look: EnvironmentLook): SheenTarget {
  const pmrem = new THREE.PMREMGenerator(gl);
  const scene = skyEnvironmentScene(look);
  const target = pmrem.fromScene(scene, REPLICA_SHEEN.blur);
  disposeEnvironmentScene(scene);
  pmrem.dispose();
  return target;
}

/** The engine's daytime look, made once (ReplicaSheen's default). */
const DEFAULT_LOOK = defaultEnvironmentLook();

/**
 * The prefiltered sky (owned by the Renderer, audit REN-06): the held replica's sheen (Replica sheen) and the scene's
 * environment lighting (Environment lighting, F1) share it. It is prefiltered once per graphics context and look
 * (EnvironmentLook) and shared by every match and range on that sky, not rebuilt on each Play (380–520 ms in software);
 * asking with another look (a map with another sky) frees the old target and makes the new one. With both settings
 * off its 6.3 MB is freed at once (`trim`), as Low frees its shadow map.
 */
export class ReplicaSheen {
  private target: SheenTarget | null = null;
  private key = '';

  constructor(private readonly make: (gl: THREE.WebGLRenderer, look: EnvironmentLook) => SheenTarget = prefilterSky) {}

  /** The prefiltered sky for `look`, made on first want or when the look changes; null while `on` is false. */
  texture(gl: THREE.WebGLRenderer, on: boolean, look: EnvironmentLook = DEFAULT_LOOK): THREE.Texture | null {
    if (!on) return null;
    const key = environmentKey(look);
    if (this.target && key !== this.key) this.dispose();
    this.key = key;
    return (this.target ??= this.make(gl, look)).texture;
  }

  /** The settings changed: off (neither wants it) frees the target (the next `texture(…, true)` makes it again). */
  trim(on: boolean): void {
    if (!on) this.dispose();
  }

  /**
   * The context was lost and given back: the target's GL objects went with it, so it is dropped, not disposed (freeing
   * them on the new context only logs WebGL warnings), and made again on the next want.
   */
  forget(): void {
    this.target = null;
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
  }
}
