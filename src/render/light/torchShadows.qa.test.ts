import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HITS } from '../../config/hits';
import { BODY } from '../../config/movement';
import { QUALITY, TORCH_BEAMS } from '../../config/render';
import { LOADOUT } from '../../config/replicas';
import { WOODLAND } from '../../map/woodland';
import { fitParts, type WorldQuery } from '../../sim/armament';
import { type Character, createCharacter } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { resolveLighting } from './lightingPreset';
import { nodePatchOf } from '../nodePatch';
import { beamMaterial, spotProfile, TorchBeams, torchShadowsWanted } from './torchBeams';
import { worldTwin } from '../webgpu/worldTwins';
import { LIGHTING_PRESETS } from '../../config/render';

// M91: torch shadows on the higher presets only, the soft beam's twin and the spot's profile.
const night = resolveLighting(WOODLAND);
const ground: WorldQuery = { raycastStatic: (_o, _d, max) => Math.min(10, max) };

function me(): Character {
  const c = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  return c;
}
const eyes = (): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 1.6, 0);
  cam.updateMatrixWorld(true);
  return cam;
};

describe('M91 acceptance 2: torch shadows on High and Ultra only, and only with Shadows on', () => {
  it('the presets: High and Ultra on, Low and Medium off', () => {
    expect([QUALITY.low, QUALITY.medium, QUALITY.high, QUALITY.ultra].map((q) => q.torchShadows)).toEqual([false, false, true, true]);
  });

  it('torchShadowsWanted needs a spot (night lights), Torch shadows and Shadows, and a night', () => {
    const q = { poolLights: 4, shadows: true, torchShadows: true } as const;
    expect(torchShadowsWanted(night, q, true)).toBe(true);
    expect(torchShadowsWanted(night, { ...q, shadows: false }, true)).toBe(false);
    expect(torchShadowsWanted(night, { ...q, torchShadows: false }, true)).toBe(false);
    expect(torchShadowsWanted(night, { ...q, poolLights: 0 }, true)).toBe(false);
    expect(torchShadowsWanted(night, q, false)).toBe(false);
    expect(torchShadowsWanted(LIGHTING_PRESETS.day, q, true)).toBe(false);
  });

  it('the spot casts shadows on High and Ultra; Low has no spot, Medium a spot without shadows', () => {
    const result = ([['low', QUALITY.low], ['medium', QUALITY.medium], ['high', QUALITY.high], ['ultra', QUALITY.ultra]] as const).map(([, q]) => {
      const b = new TorchBeams([me()], night, q, ground, BODY, HITS);
      const out = b.spotLight === null ? 'none' : b.spotLight.castShadow ? 'shadow' : 'plain';
      b.dispose();
      return out;
    });
    expect(result).toEqual(['none', 'plain', 'shadow', 'shadow']);
  });

  it('High with Shadows turned off (Custom) keeps a spot without a shadow', () => {
    const b = new TorchBeams([me()], night, { ...QUALITY.high, shadows: false }, ground, BODY, HITS);
    expect(b.spotLight).not.toBeNull();
    expect(b.spotLight!.castShadow).toBe(false);
    b.dispose();
  });

  it('the shadow follows TORCH_BEAMS.shadow and a soft penumbra', () => {
    const b = new TorchBeams([me()], night, QUALITY.high, ground, BODY, HITS);
    const s = b.spotLight!;
    expect(s.penumbra).toBe(TORCH_BEAMS.spotPenumbra);
    expect(s.shadow.mapSize.x).toBe(TORCH_BEAMS.shadow.mapSize);
    expect(s.shadow.bias).toBe(TORCH_BEAMS.shadow.bias);
    expect(s.shadow.normalBias).toBe(TORCH_BEAMS.shadow.normalBias);
    expect(s.shadow.camera.near).toBe(TORCH_BEAMS.shadow.near);
    b.dispose();
  });

  it('switching the torch never rebuilds the spot, and the shadow map is drawn only while it is on', () => {
    const c = me();
    const b = new TorchBeams([c], night, QUALITY.high, ground, BODY, HITS);
    const spot = b.spotLight!;
    const seen: boolean[] = [];
    for (const on of [false, true, true, false, true]) {
      c.torchOn = on;
      b.update(eyes(), c, true, 1);
      expect(b.spotLight).toBe(spot);
      expect(spot.castShadow).toBe(true);
      seen.push(spot.shadow.autoUpdate);
      expect(spot.intensity > 0).toBe(on);
    }
    expect(seen).toEqual([false, true, true, false, true]);
    b.dispose();
  });

  it('setQuality rebuilds the spot only when the shadow wish changes; same wish keeps the same light', () => {
    const b = new TorchBeams([me()], night, QUALITY.high, ground, BODY, HITS);
    const first = b.spotLight!;
    b.setQuality(QUALITY.ultra);
    expect(b.spotLight).toBe(first);
    b.setQuality(QUALITY.medium);
    expect(b.spotLight).not.toBe(first);
    expect(b.spotLight!.castShadow).toBe(false);
    const plain = b.spotLight!;
    b.setQuality(QUALITY.medium);
    expect(b.spotLight).toBe(plain);
    b.setQuality(QUALITY.high);
    expect(b.spotLight!.castShadow).toBe(true);
    b.setQuality(QUALITY.low);
    expect(b.spotLight).toBeNull();
    expect(b.reserved).toBe(0);
    b.dispose();
  });

  it('your real spot sits on the replica, ownRight m right of and ownDown m under the lens, in first person', () => {
    const c = me();
    c.torchOn = true;
    const b = new TorchBeams([c], night, QUALITY.high, ground, BODY, HITS);
    b.update(eyes(), c, true, 1);
    const withEyes = b.spotLight!.position.clone();
    b.update(eyes(), c, false, 1);
    const without = b.spotLight!.position.clone();
    expect(withEyes.x - without.x).toBeCloseTo(TORCH_BEAMS.ownRight, 3);
    expect(withEyes.y).toBeLessThanOrEqual(1.6 - TORCH_BEAMS.ownDown + 1e-6);
    b.dispose();
  });
});

describe('M91 acceptance 1: the soft beam', () => {
  it('the cone has normals, and its material is the plain additive beam carrying the torch-beam patch', () => {
    const b = new TorchBeams([me()], night, QUALITY.low, ground, BODY, HITS);
    const cones = b.object.getObjectByName('torch-cones') as THREE.InstancedMesh;
    const n = cones.geometry.getAttribute('normal');
    expect(n).toBeDefined();
    expect(n.count).toBe(cones.geometry.getAttribute('position').count);
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    const m = cones.material as THREE.MeshBasicMaterial;
    expect(nodePatchOf(m)?.patch).toEqual({ kind: 'torch-beam' });
    expect(m.customProgramCacheKey()).toBe('torch-beam');
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    b.dispose();
  });

  it('the node path draws the beam with its twin, whose opacity is a node (edge fade x near fade)', () => {
    const twin = worldTwin(beamMaterial(), { dispose() {} } as never);
    expect(twin).not.toBeNull();
    expect(twin!.opacityNode).toBeTruthy();
    expect(twin!.transparent).toBe(true);
    expect(twin!.blending).toBe(THREE.AdditiveBlending);
    expect(twin!.depthWrite).toBe(false);
  });

  it('the lit spot is 1 in the middle, brighter in its core than in its spill, and 0 at the rim', () => {
    const core = 0.4;
    expect(spotProfile(0, core)).toBeCloseTo(1, 6);
    expect(spotProfile(1, core)).toBeCloseTo(0, 6);
    const spill = spotProfile(0.8, core);
    expect(spotProfile(0.2, core)).toBeGreaterThan(spill);
    expect(spill).toBeGreaterThan(0);
    expect(spill).toBeLessThan(TORCH_BEAMS.spotSpill);
    let last = 2;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = spotProfile(Math.min(1, t), core);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
  });
});

describe('M91b: the torch shadow map is drawn once on its first frame, torch on or off', () => {
  it('a High spot asks for its first draw while autoUpdate stays false with the torch off', () => {
    const c = me();
    c.torchOn = false;
    const b = new TorchBeams([c], night, QUALITY.high, ground, BODY, HITS);
    const s = b.spotLight!;
    expect(s.shadow.needsUpdate).toBe(true);
    expect(s.shadow.autoUpdate).toBe(false);
    b.update(eyes(), c, true, 1);
    expect(s.shadow.autoUpdate).toBe(false);
    b.dispose();
  });

  it('a spot made anew by setQuality (Medium to High) asks again; a radius-only change does not remake it', () => {
    const b = new TorchBeams([me()], night, QUALITY.medium, ground, BODY, HITS);
    b.setQuality(QUALITY.high);
    const made = b.spotLight!;
    expect(made.shadow.needsUpdate).toBe(true);
    expect(made.shadow.autoUpdate).toBe(false);
    made.shadow.needsUpdate = false; // the renderer clears it after the draw
    b.setQuality({ ...QUALITY.high, shadowRadius: 7 });
    expect(b.spotLight).toBe(made);
    expect(made.shadow.radius).toBe(7);
    expect(made.shadow.needsUpdate).toBe(false);
    b.dispose();
  });

  it('a new renderer after a lost device draws the spot’s shadow on its first frame again; a spot with none is left (BP3)', () => {
    const b = new TorchBeams([me()], night, QUALITY.high, ground, BODY, HITS);
    const spot = b.spotLight!;
    spot.shadow.needsUpdate = false; // the first renderer drew it
    b.contextRestored();
    expect(spot.shadow.needsUpdate).toBe(true);
    b.dispose();
    const plain = new TorchBeams([me()], night, QUALITY.medium, ground, BODY, HITS);
    plain.contextRestored();
    expect(plain.spotLight!.shadow.needsUpdate).toBe(false);
    plain.dispose();
    const low = new TorchBeams([me()], night, QUALITY.low, ground, BODY, HITS);
    expect(() => low.contextRestored()).not.toThrow();
    low.dispose();
  });

  it('a Medium spot has no shadow to draw, and autoUpdate follows the torch once it is on', () => {
    const plain = new TorchBeams([me()], night, QUALITY.medium, ground, BODY, HITS);
    expect(plain.spotLight!.castShadow).toBe(false);
    expect(plain.spotLight!.shadow.needsUpdate).toBe(false);
    plain.dispose();

    const c = me();
    const b = new TorchBeams([c], night, QUALITY.high, ground, BODY, HITS);
    c.torchOn = true;
    b.update(eyes(), c, true, 1);
    expect(b.spotLight!.shadow.autoUpdate).toBe(true);
    c.torchOn = false;
    b.update(eyes(), c, true, 1);
    expect(b.spotLight!.shadow.autoUpdate).toBe(false);
    b.dispose();
  });
});
