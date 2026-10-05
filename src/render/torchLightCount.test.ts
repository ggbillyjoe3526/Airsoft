import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { QUALITY, type QualitySettings } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { WOODLAND } from '../map/woodland';
import { fitParts, type WorldQuery } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { addLighting } from './lighting';
import { resolveLighting } from './lightingPreset';
import { TorchBeams } from './torchBeams';

/**
 * M33h QA, acceptance 4, with the session's own order of calls (matchSession.ts: daylight.setQuality, torches.setQuality,
 * daylight.reserveLights): the scene's real light count is the Night lights setting through any run of quality changes
 * and torch switches; a full 5v5 of lit torches fits the instanced draws; Depot by day gets nothing on any preset.
 */

const ground: WorldQuery = { raycastStatic: (_o, _d, max) => Math.min(12, max) };
const QUALITIES: readonly [string, QualitySettings][] = [['low', QUALITY.low], ['medium', QUALITY.medium], ['high', QUALITY.high]];

function torchBearer(id: number, x: number, z: number, yaw: number): Character {
  const c = createCharacter(id, vec3(x, 0, z), yaw, LOADOUT, id < 5 ? 0 : 1);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  return c;
}

/** A 5v5 facing each other across 30 m, every torch fitted. */
const tenTorches = (): Character[] => Array.from({ length: 10 }, (_, i) => torchBearer(i, (i % 5) * 3, i < 5 ? 0 : -30, i < 5 ? 0 : Math.PI));

function census(root: THREE.Object3D): { lights: number; spots: number; meshes: number } {
  let lights = 0;
  let spots = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) lights++;
    if (o instanceof THREE.SpotLight) spots++;
    if (o instanceof THREE.Mesh) meshes++;
  });
  return { lights, spots, meshes };
}

const eyes = (): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 1.6, 0);
  cam.updateMatrixWorld(true);
  return cam;
};

describe('the real light count stays the setting (M33h acceptance 4)', () => {
  it('through every quality change and torch switch, in the order the match session makes them', () => {
    const night = resolveLighting(WOODLAND);
    const scene = new THREE.Scene();
    const all = tenTorches();
    const me = all[0]!;
    const daylight = addLighting(scene, WOODLAND, QUALITY.medium, night);
    const torches = new TorchBeams(all, night, QUALITY.medium, ground, BODY, HITS);
    scene.add(torches.object);
    daylight.reserveLights(torches.reserved);
    const cam = eyes();
    const order = ['medium', 'low', 'high', 'medium', 'high', 'low', 'medium', 'low'] as const;
    for (const [n, name] of order.entries()) {
      const q = QUALITY[name];
      daylight.setQuality(q);
      torches.setQuality(q);
      daylight.reserveLights(torches.reserved);
      for (const lit of [false, true, false, true]) {
        for (const c of all) c.torchOn = lit;
        torches.update(cam, me, true, 1);
        const now = census(scene);
        expect(now.lights, `${name} (step ${n}), torches ${lit ? 'on' : 'off'}`).toBe(q.poolLights);
        expect(now.spots, name).toBe(q.poolLights > 0 ? 1 : 0);
      }
      // Your own torch is real on Medium and High: lit while on, dark at the setting's count while off.
      expect(torches.spotLight?.intensity ?? 0).toBe(q.poolLights > 0 ? night.torch.spot : 0);
    }
    torches.dispose();
    daylight.dispose();
  });

  it("draws a full 5v5's lit torches in three instanced draws on any preset, the same buffers every frame", () => {
    const night = resolveLighting(WOODLAND);
    for (const [name, q] of QUALITIES) {
      const all = tenTorches();
      const b = new TorchBeams(all, night, q, ground, BODY, HITS);
      for (const c of all) c.torchOn = true;
      const instanced = b.object.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
      expect(instanced, name).toHaveLength(3);
      const cones = b.object.getObjectByName('torch-cones') as THREE.InstancedMesh;
      const buffers = instanced.map((m) => [m.instanceMatrix.array, m.instanceColor?.array]);
      const cam = eyes();
      for (let f = 0; f < 30; f++) {
        all[5]!.yaw = Math.PI + f * 0.02;
        b.update(cam, all[0]!, true, f / 30);
        // Everyone's but your own (the camera is inside it).
        expect(cones.count, name).toBe(all.length - 1);
        instanced.forEach((m, i) => {
          expect(m.instanceMatrix.array).toBe(buffers[i]![0]);
          expect(m.instanceColor?.array).toBe(buffers[i]![1]);
        });
      }
      expect(cones.instanceMatrix.count, name).toBeGreaterThanOrEqual(all.length);
      expect(b.object.children.length, name).toBe(3 + (q.poolLights > 0 ? 2 : 0)); // the spot and its target
      b.dispose();
    }
  });
});

describe('Depot by day is unchanged on every preset (M33h acceptance 4)', () => {
  it('adds no light, mesh or reserve to the scene, every torch fitted and lit', () => {
    const day = resolveLighting(DEPOT);
    expect(day.night).toBe(false);
    for (const [name, q] of QUALITIES) {
      const scene = new THREE.Scene();
      const daylight = addLighting(scene, DEPOT, q, day);
      const before = census(scene);
      const all = tenTorches();
      for (const c of all) c.torchOn = true;
      const torches = new TorchBeams(all, day, q, ground, BODY, HITS);
      scene.add(torches.object);
      daylight.reserveLights(torches.reserved);
      torches.update(eyes(), all[0]!, true, 1);
      expect(torches.active, name).toBe(false);
      expect(torches.reserved, name).toBe(0);
      expect(census(scene), name).toEqual(before);
      expect(torches.lit.every((v) => v === 0), name).toBe(true);
      torches.dispose();
      daylight.dispose();
    }
  });
});
