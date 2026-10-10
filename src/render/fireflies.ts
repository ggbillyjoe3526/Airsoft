import * as THREE from 'three';
import { FIREFLIES } from '../config/dressing';
import type { Bush } from '../map/foliage';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import { createRng, rngNext } from '../sim/rng';
import { softDotTexture } from './softDot';

/**
 * Fireflies over a wooded field at night (G9, MapDressing.fireflies): soft points hanging low round the bushes and over
 * the open ground, each drifting a little and pulsing slowly. One draw call (a THREE.Points with fixed buffers, made
 * once: update allocates nothing), unlit and fogged, over the ground and never high enough to read as a figure. Under
 * Reduced motion they stand still at full glow (no pulse, no drift). Only made for a map whose dressing asks for them,
 * and only by night.
 */

const F = FIREFLIES;

export class Fireflies {
  readonly object: THREE.Points;
  /** On the node renderer (W5) a compute pass moves the flies (render/webgpu/compute/), reading the seeded arrays and `time`. */
  declare gpu?: { update(): void } | undefined;
  readonly base: Float32Array;
  readonly phase: Float32Array;
  readonly rate: Float32Array;
  readonly drift: Float32Array;
  private readonly position: THREE.BufferAttribute;
  private readonly alphaAttribute: THREE.BufferAttribute;
  private readonly alpha: Float32Array;
  private readonly sprite = softDotTexture(0.5);
  time = 0;
  motion = true;

  /** `count` flies over the ground (`terrain`), gathering round `bushes`; seeded, so a map's flies are the same every time. */
  constructor(count: number, terrain: Terrain, bushes: readonly Bush[], bounds: THREE.Box3) {
    const rng = createRng(F.seed);
    this.base = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.rate = new Float32Array(count);
    this.drift = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    const colour = new THREE.Color(F.colour);
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      // Two in three hang round a bush, where the air is still; the rest anywhere over the field.
      const bush = bushes.length > 0 && rngNext(rng) < 0.66 ? bushes[Math.floor(rngNext(rng) * bushes.length)]! : null;
      if (bush) {
        const a = rngNext(rng) * Math.PI * 2;
        const d = bush.radius + rngNext(rng) * F.reach;
        x = bush.x + Math.cos(a) * d;
        z = bush.z + Math.sin(a) * d;
      } else {
        x = bounds.min.x + rngNext(rng) * (bounds.max.x - bounds.min.x);
        z = bounds.min.z + rngNext(rng) * (bounds.max.z - bounds.min.z);
      }
      const ground = terrainHeightAt(terrain, x, z) ?? bounds.min.y;
      this.base[i * 3] = x;
      this.base[i * 3 + 1] = ground + F.height[0] + Math.pow(rngNext(rng), 1.6) * (F.height[1] - F.height[0]);
      this.base[i * 3 + 2] = z;
      this.phase[i] = rngNext(rng);
      this.rate[i] = 1 / (F.period[0] + rngNext(rng) * (F.period[1] - F.period[0]));
      for (let k = 0; k < 3; k++) this.drift[i * 3 + k] = (rngNext(rng) * 2 - 1) * F.drift * (k === 1 ? 0.4 : 1);
      colours.set([colour.r, colour.g, colour.b], i * 3);
      this.alpha[i] = 1;
    }
    const geo = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(Float32Array.from(this.base), 3).setUsage(THREE.DynamicDrawUsage) as THREE.BufferAttribute;
    this.alphaAttribute = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage) as THREE.BufferAttribute;
    geo.setAttribute('position', this.position);
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.setAttribute('flyAlpha', this.alphaAttribute);
    geo.computeBoundingSphere();
    // The sphere covers every fly's drift, so the whole swarm is culled as one.
    if (geo.boundingSphere) geo.boundingSphere.radius += F.drift + F.size;
    const material = new THREE.PointsMaterial({ size: F.size, map: this.sprite, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', 'attribute float flyAlpha;\nvarying float vFlyAlpha;\n#include <common>')
        .replace('#include <begin_vertex>', 'vFlyAlpha = flyAlpha;\n#include <begin_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying float vFlyAlpha;\n#include <common>')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFlyAlpha;');
    };
    material.customProgramCacheKey = () => 'fireflies';
    this.object = new THREE.Points(geo, material);
    this.object.name = 'fireflies';
    this.object.userData.gpuFireflies = this;
    this.object.matrixAutoUpdate = false;
  }

  /** Reduced motion on (false): the flies stand still and stop pulsing. */
  setMotion(on: boolean): void {
    this.motion = on;
    if (!on) {
      this.position.array.set(this.base);
      this.alpha.fill(1);
      this.position.needsUpdate = true;
      this.alphaAttribute.needsUpdate = true;
    }
  }

  /** Moves them on by `dt`: a slow drift round where each hangs, and a pulse from FIREFLIES.low to full. */
  update(dt: number): void {
    if (!this.motion || !this.object.visible) return;
    this.time += dt;
    if (this.gpu) return this.gpu.update();
    const pos = this.position.array as Float32Array;
    for (let i = 0; i < this.alpha.length; i++) {
      const t = this.time * this.rate[i]! + this.phase[i]!;
      const wave = Math.sin(t * Math.PI * 2);
      // Along its own drift direction, there and back; the pulse rides the same wave, squared so it is mostly dim.
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = this.base[i * 3 + k]! + this.drift[i * 3 + k]! * wave;
      const s = (wave + 1) / 2;
      this.alpha[i] = F.low + (1 - F.low) * s * s;
    }
    this.position.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.sprite.dispose();
    this.object.removeFromParent();
  }
}
