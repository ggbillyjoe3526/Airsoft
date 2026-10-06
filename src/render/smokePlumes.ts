import * as THREE from 'three';
import { DRESSING } from '../config/dressing';
import { createRng, rngNext } from '../sim/rng';
import { softDotTexture } from './softDot';

/**
 * Chimney smoke (G8, DRESSING.smoke): soft puffs rising from each smoking chimney of the skyline on a loop, bent by
 * the wind, growing and fading out. One instanced draw for every chimney (culled when out of view), fixed buffers made
 * once: update allocates nothing. Under Reduced motion the smoke stands still (its clock stops). Unlit and fogged; a
 * night preset darkens it.
 */

const M = DRESSING.smoke;
/** The strongest wind the culling sphere allows for (m/s; the match's wind stays well under it, M30). */
const WIND_MAX = 4;

export interface SmokeSource {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export class SmokePlumes {
  readonly object: THREE.InstancedMesh;
  private readonly alpha: Float32Array;
  private readonly alphaAttribute: THREE.InstancedBufferAttribute;
  /** Each puff's seeded spread (x, z, in −1..1) and phase offset. */
  private readonly jitter: Float32Array;
  private readonly sprite = softDotTexture(0.35);
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly wind = { x: M.breeze, z: 0 };
  private time = 0;
  private motion = true;

  constructor(private readonly sources: readonly SmokeSource[]) {
    const count = sources.length * M.puffs;
    const rng = createRng(M.seed);
    this.jitter = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.jitter[i * 3] = rngNext(rng) * 2 - 1;
      this.jitter[i * 3 + 1] = rngNext(rng) * 2 - 1;
      this.jitter[i * 3 + 2] = rngNext(rng) * 0.5;
    }
    this.alpha = new Float32Array(count);
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alphaAttribute = new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('puffAlpha', this.alphaAttribute);
    const material = new THREE.MeshBasicMaterial({ color: M.colour, map: this.sprite, transparent: true, opacity: M.opacity, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', 'attribute float puffAlpha;\nvarying float vPuffAlpha;\n#include <common>')
        .replace('#include <begin_vertex>', 'vPuffAlpha = puffAlpha;\n#include <begin_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying float vPuffAlpha;\n#include <common>')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vPuffAlpha;');
    };
    material.customProgramCacheKey = () => 'smoke-plumes';
    this.object = new THREE.InstancedMesh(geo, material, count);
    this.object.name = 'smokePlumes';
    // Culled as a whole: a sphere round every plume, as far as a wind of up to WIND_MAX m/s bends it.
    const box = new THREE.Box3();
    for (const s of sources) box.expandByPoint(this.pos.set(s.x, s.y, s.z)).expandByPoint(this.pos.set(s.x, s.y + M.rise, s.z));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.radius += M.size[1] + M.period * (M.breeze + WIND_MAX * M.windShare);
    this.object.boundingSphere = sphere;
    this.object.matrixAutoUpdate = false;
  }

  /** A night preset darkens the smoke (it is lit by nothing). */
  setNight(night: boolean): void {
    (this.object.material as THREE.MeshBasicMaterial).color.set(M.colour).multiplyScalar(night ? M.night : 1);
  }

  /** Reduced motion on (false): the smoke stands still. */
  setMotion(on: boolean): void {
    this.motion = on;
  }

  /** Moves the plumes on by `dt`, bent by the match's `wind` (m/s), facing `camera`. */
  update(dt: number, camera: THREE.Camera, wind: { x: number; z: number }): void {
    if (!this.object.visible) return;
    if (this.motion) {
      this.time += dt;
      const ease = Math.min(1, dt / M.windEase);
      this.wind.x += (wind.x * M.windShare + M.breeze - this.wind.x) * ease;
      this.wind.z += (wind.z * M.windShare - this.wind.z) * ease;
    }
    const q = camera.quaternion;
    let n = 0;
    for (const s of this.sources) {
      for (let i = 0; i < M.puffs; i++, n++) {
        const j = n * 3;
        const phase = (((this.time / M.period + i / M.puffs + this.jitter[j + 2]!) % 1) + 1) % 1;
        const age = phase * M.period;
        const spread = s.radius + M.spread * phase;
        this.pos.set(s.x + this.jitter[j]! * spread + this.wind.x * age, s.y + phase * M.rise, s.z + this.jitter[j + 1]! * spread + this.wind.z * age);
        this.scale.setScalar(M.size[0] + (M.size[1] - M.size[0]) * phase);
        this.matrix.compose(this.pos, q, this.scale);
        this.object.setMatrixAt(n, this.matrix);
        this.alpha[n] = Math.min(1, phase / M.fadeIn) * (1 - phase) * (1 - phase);
      }
    }
    this.object.instanceMatrix.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.sprite.dispose();
    this.object.dispose();
    this.object.removeFromParent();
  }
}
