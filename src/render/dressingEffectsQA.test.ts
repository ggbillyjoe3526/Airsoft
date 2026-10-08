import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DRESSING, KICKED_DUST } from '../config/dressing';
import { QUALITY } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { DressingEffects } from './dressingEffects';
import { smokingChimneys } from './skyline';
import { SmokePlumes } from './smokePlumes';

/** QA for G8's moving dressing: quality changes, no dressing, pools, Reduced motion mid-match, disposal. */

const footstep = (kind: 'sprint' | 'land' | 'run', id = 0): GameEvent => ({ type: 'footstep', characterId: id, kind }) as GameEvent;
const walker = (x = 1, z = 1) => [createCharacter(0, vec3(x, 0, z), 0, LOADOUT, 0)];
const camera = (): THREE.PerspectiveCamera => new THREE.PerspectiveCamera();
const meshes = (scene: THREE.Scene): THREE.InstancedMesh[] => scene.children as THREE.InstancedMesh[];
const DT = 1 / 60;

/** Counts dispose events on an instanced effect's geometry, material and map. */
function watch(o: THREE.InstancedMesh, tally: { n: number }): void {
  o.geometry.addEventListener('dispose', () => tally.n++);
  (o.material as THREE.Material).addEventListener('dispose', () => tally.n++);
  ((o.material as THREE.MeshBasicMaterial).map as THREE.Texture).addEventListener('dispose', () => tally.n++);
}

describe('G8 QA: dressing effects', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('a map with no dressing adds nothing at any quality, even when feet sprint', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, undefined);
    for (const q of [QUALITY.low, QUALITY.medium, QUALITY.high]) {
      fx.setQuality(q);
      fx.afterTick([footstep('sprint'), footstep('land')], walker(), vec3());
      fx.update(DT, camera(), vec3());
    }
    expect(scene.children).toHaveLength(0);
    fx.dispose();
  });

  it('a dressing without a skyline or kicked dust adds nothing', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, { seed: 1 });
    fx.setQuality(QUALITY.high);
    fx.afterTick([footstep('sprint')], walker(), vec3());
    fx.update(DT, camera(), vec3());
    expect(scene.children).toHaveLength(0);
  });

  it('a skyline with no smoking chimney makes no smoke', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, { seed: 1, skyline: [{ kind: 'chimney', x: 0, z: 0, width: 3, depth: 3, height: 30 }] });
    fx.setQuality(QUALITY.high);
    expect(scene.children).toHaveLength(0);
  });

  it('Low makes nothing; High -> Low hides it, and Low -> High again makes no second copy', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.low);
    expect(scene.children).toHaveLength(0);
    fx.setQuality(QUALITY.high);
    expect(scene.children).toHaveLength(2);
    const [smoke, dust] = meshes(scene);
    fx.afterTick([footstep('sprint')], walker(), vec3());
    fx.update(DT, camera(), vec3());
    expect(dust!.visible).toBe(true);
    fx.setQuality(QUALITY.low);
    fx.afterTick([footstep('sprint')], walker(), vec3());
    fx.update(DT, camera(), vec3());
    expect(scene.children.filter((o) => o.visible)).toHaveLength(0);
    fx.setQuality(QUALITY.medium);
    fx.setQuality(QUALITY.high);
    expect(scene.children).toHaveLength(2);
    expect(scene.children).toEqual([smoke, dust]);
    fx.dispose();
  });

  it('Custom: Trees detailed with Impact grit off shows smoke only, and grit alone shows dust only', () => {
    const a = new THREE.Scene();
    const fa = new DressingEffects(a, DEPOT.dressing);
    fa.setQuality({ trees: 2, impactGrit: false, mapDetail: false });
    fa.afterTick([footstep('sprint')], walker(), vec3());
    fa.update(DT, camera(), vec3());
    expect(a.children.map((o) => o.name)).toEqual(['smokePlumes']);
    const b = new THREE.Scene();
    const fb = new DressingEffects(b, DEPOT.dressing);
    fb.setQuality({ trees: 1, impactGrit: true, mapDetail: false });
    expect(b.children).toHaveLength(1);
    expect(b.children[0]!.name).not.toBe('smokePlumes');
    fa.dispose();
    fb.dispose();
  });

  it('dust only from sprinting and landing feet within range; walking, other kinds and far feet kick none', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    const dust = meshes(scene)[1]!;
    fx.afterTick([footstep('run')], walker(), vec3());
    fx.afterTick([footstep('sprint', 99)], walker(), vec3());
    fx.afterTick([footstep('sprint')], walker(KICKED_DUST.range + 5, 0), vec3());
    fx.update(DT, camera(), vec3());
    expect(dust.count).toBe(0);
    expect(dust.visible).toBe(false);
    fx.afterTick([footstep('land')], walker(), vec3());
    fx.update(DT, camera(), vec3());
    expect(dust.count).toBe(1);
    fx.dispose();
  });

  it('the pools never grow: a thousand footfalls and frames keep the same buffers and at most max puffs', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    const [smoke, dust] = meshes(scene) as [THREE.InstancedMesh, THREE.InstancedMesh];
    const buffers = [smoke.instanceMatrix.array, dust.instanceMatrix.array];
    const sizes = buffers.map((b) => b.length);
    const cam = camera();
    for (let i = 0; i < 1000; i++) {
      fx.afterTick([footstep('sprint'), footstep('land')], walker(), vec3());
      fx.update(DT, cam, vec3(1, 0, 0));
      expect(dust.count).toBeLessThanOrEqual(KICKED_DUST.max);
    }
    expect(dust.instanceMatrix.array).toBe(buffers[1]);
    expect(smoke.instanceMatrix.array).toBe(buffers[0]);
    expect([smoke.instanceMatrix.array.length, dust.instanceMatrix.array.length]).toEqual(sizes);
    expect(smoke.count).toBe(smokingChimneys(DEPOT.dressing!.skyline!).length * DRESSING.smoke.puffs);
    expect(scene.children).toHaveLength(2);
    fx.dispose();
  });

  it('dust dies away: with no more footfalls the pool empties and its mesh hides', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    const dust = meshes(scene)[1]!;
    fx.afterTick([footstep('land')], walker(), vec3());
    for (let i = 0; i < 60; i++) fx.update(DT, camera(), vec3());
    expect(dust.count).toBe(0);
    expect(dust.visible).toBe(false);
    fx.dispose();
  });

  it('Reduced motion turned on mid-match: no new dust, the smoke freezes where it is, and it resumes after', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    const [smoke, dust] = meshes(scene) as [THREE.InstancedMesh, THREE.InstancedMesh];
    const cam = camera();
    for (let i = 0; i < 30; i++) fx.update(0.1, cam, vec3(2, 0, 0));
    fx.afterTick([footstep('sprint')], walker(), vec3());
    fx.update(DT, cam, vec3());
    const before = dust.count;
    expect(before).toBeGreaterThan(0);
    fx.setMotion(false);
    const still = Array.from(smoke.instanceMatrix.array);
    fx.afterTick([footstep('sprint'), footstep('land')], walker(), vec3());
    for (let i = 0; i < 5; i++) fx.update(0.1, cam, vec3(-3, 0, 2));
    expect(Array.from(smoke.instanceMatrix.array)).toEqual(still);
    expect(dust.count).toBeLessThanOrEqual(before);
    fx.setMotion(true);
    fx.update(0.5, cam, vec3(-3, 0, 2));
    expect(Array.from(smoke.instanceMatrix.array)).not.toEqual(still);
    fx.afterTick([footstep('land')], walker(), vec3());
    fx.update(DT, cam, vec3());
    expect(dust.count).toBeGreaterThan(0);
    fx.dispose();
  });

  it('Reduced motion set before the smoke exists still holds it still when High turns it on', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setMotion(false);
    fx.setQuality(QUALITY.high);
    const smoke = meshes(scene)[0]!;
    fx.update(0.3, camera(), vec3());
    const a = Array.from(smoke.instanceMatrix.array);
    fx.update(0.3, camera(), vec3(3, 0, 0));
    expect(Array.from(smoke.instanceMatrix.array)).toEqual(a);
    fx.dispose();
  });

  it('a night preset set before the smoke exists darkens it when it is made', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setNight(true);
    fx.setQuality(QUALITY.high);
    const m = meshes(scene)[0]!.material as THREE.MeshBasicMaterial;
    const day = new THREE.Color(DRESSING.smoke.colour);
    expect(m.color.r).toBeLessThan(day.r * 0.5);
    fx.setNight(false);
    expect(m.color.r).toBeCloseTo(day.r, 5);
    fx.dispose();
  });

  it('frees everything with the match, also after a quality change, and a second effects object frees its own', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    fx.setQuality(QUALITY.low);
    fx.setQuality(QUALITY.high);
    const first = { n: 0 };
    for (const o of meshes(scene)) watch(o, first);
    const fy = new DressingEffects(scene, DEPOT.dressing);
    fy.setQuality(QUALITY.high);
    const second = { n: 0 };
    for (const o of meshes(scene).slice(2)) watch(o, second);
    fx.dispose();
    expect(first.n).toBe(6);
    expect(second.n).toBe(0);
    expect(scene.children).toHaveLength(2);
    fy.dispose();
    expect(second.n).toBe(6);
    expect(scene.children).toHaveLength(0);
    // Disposing again, or updating a freed set, is harmless.
    fx.dispose();
    fx.update(DT, camera(), vec3());
    fx.afterTick([footstep('sprint')], walker(), vec3());
  });
});

describe('G8 QA: smoke plumes', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('is the same every time for the same chimneys (seeded)', () => {
    const src = smokingChimneys(DEPOT.dressing!.skyline!);
    const a = new SmokePlumes(src);
    const b = new SmokePlumes(src);
    a.update(1.7, camera(), vec3(1, 0, 1));
    b.update(1.7, camera(), vec3(1, 0, 1));
    expect(Array.from(a.object.instanceMatrix.array)).toEqual(Array.from(b.object.instanceMatrix.array));
    a.dispose();
    b.dispose();
  });

  it('stays inside its culling sphere through a full loop at the strongest wind, either way', () => {
    const src = smokingChimneys(DEPOT.dressing!.skyline!);
    for (const wind of [vec3(4, 0, 0), vec3(-4, 0, 0), vec3(0, 0, 4), vec3(0, 0, -4)]) {
      const s = new SmokePlumes(src);
      const sphere = s.object.boundingSphere!;
      const p = new THREE.Vector3();
      const m = new THREE.Matrix4();
      for (let t = 0; t < 40; t++) {
        s.update(1, camera(), wind);
        for (let i = 0; i < s.object.count; i++) {
          s.object.getMatrixAt(i, m);
          p.setFromMatrixPosition(m);
          const size = new THREE.Vector3().setFromMatrixScale(m).x;
          expect(p.distanceTo(sphere.center) + size / 2, `wind ${wind.x},${wind.z} t=${t} puff ${i}`).toBeLessThanOrEqual(sphere.radius);
        }
      }
      s.dispose();
    }
  });

  it('is not drawn or moved while hidden, and a long frame gap leaves finite matrices', () => {
    const s = new SmokePlumes(smokingChimneys(DEPOT.dressing!.skyline!));
    s.update(0.1, camera(), vec3());
    s.object.visible = false;
    const a = Array.from(s.object.instanceMatrix.array);
    s.update(5, camera(), vec3(3, 0, 0));
    expect(Array.from(s.object.instanceMatrix.array)).toEqual(a);
    s.object.visible = true;
    s.update(3600, camera(), vec3(3, 0, 0));
    expect(Array.from(s.object.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    s.dispose();
  });
});
