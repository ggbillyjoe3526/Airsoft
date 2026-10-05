import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LIGHTING_PRESETS, QUALITY } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { WOODLAND } from '../map/woodland';
import { fitParts, type WorldQuery } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { addLighting } from './lighting';
import { resolveLighting } from './lightingPreset';
import { TorchBeams, torchSpotWanted } from './torchBeams';

const night = resolveLighting(WOODLAND);
const day = LIGHTING_PRESETS.day;
/** Every beam lands 10 m out. */
const ground: WorldQuery = { raycastStatic: (_o, _d, max) => Math.min(10, max) };

function person(id: number, x: number, z: number, yaw: number, torch = true): Character {
  const c = createCharacter(id, vec3(x, 0, z), yaw, LOADOUT, id === 0 ? 0 : 1);
  if (torch) fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  return c;
}

const meshes = (b: TorchBeams): THREE.InstancedMesh[] => b.object.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
const count = (b: TorchBeams, name: string): number => (b.object.getObjectByName(name) as THREE.InstancedMesh).count;
const realLights = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) n++;
  });
  return n;
};
const eyes = (): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 1.6, 0);
  cam.updateMatrixWorld(true);
  return cam;
};

describe('weapon torches drawn (M33h, acceptance 4)', () => {
  it('builds nothing by day, or at night when nobody carries a torch (Dev content off)', () => {
    for (const [preset, torch] of [[day, true], [night, false]] as const) {
      const b = new TorchBeams([person(0, 0, 0, 0, torch)], preset, QUALITY.high, ground, BODY, HITS);
      expect(b.active).toBe(false);
      expect(b.object.children).toHaveLength(0);
      expect(b.reserved).toBe(0);
      b.update(eyes(), null, true, 1);
      b.dispose();
    }
    expect(torchSpotWanted(day, QUALITY.high, true)).toBe(false);
  });

  it('makes your torch one real spot light on Medium and High, taking one of the pools; none on Low', () => {
    for (const [q, spots] of [[QUALITY.low, 0], [QUALITY.medium, 1], [QUALITY.high, 1]] as const) {
      const scene = new THREE.Scene();
      const daylight = addLighting(scene, WOODLAND, q, night);
      const b = new TorchBeams([person(0, 0, 0, 0)], night, q, ground, BODY, HITS);
      scene.add(b.object);
      daylight.reserveLights(b.reserved);
      expect(b.reserved).toBe(spots);
      expect(b.spotLight !== null).toBe(spots === 1);
      // The scene's real lights are the setting's, torch or not.
      expect(realLights(scene)).toBe(q.poolLights);
      expect(meshes(b).length).toBeLessThanOrEqual(3);
      b.dispose();
      daylight.dispose();
    }
  });

  it('switches by intensity only: the same lights and draws with the torch on or off', () => {
    const me = person(0, 0, 0, 0);
    const b = new TorchBeams([me], night, QUALITY.medium, ground, BODY, HITS);
    const lightsBefore = realLights(b.object);
    const childrenBefore = b.object.children.length;
    b.update(eyes(), me, true, 1);
    expect(b.spotLight!.intensity).toBe(0);
    me.torchOn = true;
    b.update(eyes(), me, true, 1);
    expect(b.spotLight!.intensity).toBe(night.torch.spot);
    // Your own in first person: no cone or glare (the camera is inside it), no disc under the real spot.
    expect(count(b, 'torch-cones')).toBe(0);
    expect(count(b, 'torch-glare')).toBe(0);
    expect(count(b, 'torch-spots')).toBe(0);
    me.torchOn = false;
    b.update(eyes(), me, true, 1);
    expect(b.spotLight!.intensity).toBe(0);
    expect(realLights(b.object)).toBe(lightsBefore);
    expect(b.object.children.length).toBe(childrenBefore);
    b.dispose();
  });

  it("draws another's lit torch as a cone, a glare when it faces you and a disc where it lands; yours too on Low", () => {
    const me = person(0, 0, 0, 0);
    const bot = person(1, 0, -20, Math.PI); // faces +Z, at you
    const b = new TorchBeams([me, bot], night, QUALITY.medium, ground, BODY, HITS);
    bot.torchOn = true;
    b.update(eyes(), me, true, 1);
    expect(count(b, 'torch-cones')).toBe(1);
    expect(count(b, 'torch-glare')).toBe(1);
    expect(count(b, 'torch-spots')).toBe(1);
    bot.yaw = bot.prevYaw = 0; // pointing away: no glare
    b.update(eyes(), me, true, 1);
    expect(count(b, 'torch-glare')).toBe(0);
    expect(count(b, 'torch-cones')).toBe(1);

    const low = new TorchBeams([me, bot], night, QUALITY.low, ground, BODY, HITS);
    me.torchOn = true;
    low.update(eyes(), me, true, 1);
    expect(low.spotLight).toBeNull();
    expect(count(low, 'torch-spots')).toBe(2); // your beam's disc and the bot's
    expect(count(low, 'torch-cones')).toBe(1); // the bot's only
    expect(count(low, 'torch-glare')).toBe(1); // your beam's glow ahead (the bot points away)
    low.dispose();
    b.dispose();
  });

  it('holds every torch of the match, lights figures in a beam, and changes quality without leaking the spot', () => {
    const all = [person(0, 0, 0, 0), person(1, 0, -5, 0), person(2, 3, -5, 0), person(3, 0, -15, Math.PI)];
    for (const c of all) c.torchOn = true;
    const b = new TorchBeams(all, night, QUALITY.high, { raycastStatic: () => -1 }, BODY, HITS);
    b.update(eyes(), all[0]!, true, 1);
    expect(count(b, 'torch-cones')).toBe(all.length - 1);
    expect(b.lit[1]).toBeGreaterThan(0); // in bot 3's beam
    expect(b.lit[2]).toBe(0); // off to the side of every beam (and your real spot lights for itself)
    b.setQuality(QUALITY.low);
    expect(b.spotLight).toBeNull();
    expect(realLights(b.object)).toBe(0);
    b.setQuality(QUALITY.medium);
    expect(realLights(b.object)).toBe(1);
    b.dispose();
    expect(b.object.parent).toBeNull();
  });
});
