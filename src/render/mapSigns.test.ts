import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, QUALITY, SIGNS } from '../config/render';
import type { MapData, MapSign } from '../map/mapTypes';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { addLighting } from './lighting';
import { addMapSigns, buildSignGeometry, signColour } from './mapSigns';

const NEON: MapSign = { centre: vec3(0, 3, -5), width: 2, height: 1, facing: '+z', colour: 0xff2bd6, kind: 'neon' };
const WINDOW: MapSign = { centre: vec3(4, 1.75, 0), width: 1.6, height: 1.1, facing: '-x', colour: 0xffc890, kind: 'window' };
const STREET: MapData = { ...OPEN_FIELD, signs: [NEON, WINDOW] };

const brightness = (c: THREE.Color): number => c.r + c.g + c.b;

describe('signs and lit windows (M34e)', () => {
  it('puts each sign upright on its wall, a hair out from it, facing the way it says, as one quad', () => {
    const geo = buildSignGeometry([NEON, WINDOW], true);
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    expect(pos.count).toBe(8);
    expect(geo.index!.count).toBe(12);
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    // The neon sign: 2 × 1 m across x and y, SIGNS.offset in front of its wall (z = -5, facing +z).
    for (let v = 0; v < 4; v++) {
      expect(pos.getZ(v)).toBeCloseTo(-5 + SIGNS.offset, 6);
      expect(nor.getZ(v)).toBe(1);
    }
    // The window: across z and y, in front of its wall (x = 4, facing -x).
    for (let v = 4; v < 8; v++) {
      expect(pos.getX(v)).toBeCloseTo(4 - SIGNS.offset, 6);
      expect(nor.getX(v)).toBe(-1);
    }
    expect(box.min.y).toBeCloseTo(1.75 - 0.55, 6);
    expect(box.max.y).toBeCloseTo(3.5, 6);
    expect(box.min.x).toBeCloseTo(-1, 6);
    expect(box.max.z).toBeCloseTo(0.8, 6);
    // Each face's winding points the way it faces: seen from the front, not from the wall.
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < 4; t++) {
      const [i, j, k] = [geo.index!.getX(t * 3), geo.index!.getX(t * 3 + 1), geo.index!.getX(t * 3 + 2)];
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, j).sub(a);
      c.fromBufferAttribute(pos, k).sub(a);
      const face = b.cross(c).normalize();
      expect(face.dot(new THREE.Vector3().fromBufferAttribute(nor, i))).toBeCloseTo(1, 6);
    }
  });

  it('glows by Night (neon brighter than its colour, windows a warm glow) and is paint and dark glass by Day', () => {
    const neonNight = signColour(NEON, true);
    const neonDay = signColour(NEON, false);
    const windowNight = signColour(WINDOW, true);
    const windowDay = signColour(WINDOW, false);
    expect(brightness(neonNight)).toBeGreaterThan(brightness(new THREE.Color(NEON.colour)));
    expect(brightness(neonDay)).toBeLessThan(brightness(neonNight));
    expect(brightness(windowDay)).toBeLessThan(brightness(windowNight));
    expect(windowDay.getHex()).toBe(SIGNS.glass);
    // By Day the sign still reads as its colour: its hue's channel is still the strongest.
    expect(neonDay.r).toBeGreaterThan(neonDay.g);
  });

  it('draws them as one unlit mesh by Night and one Lambert mesh by Day, removed and freed on dispose', () => {
    for (const night of [true, false]) {
      const scene = new THREE.Scene();
      const signs = addMapSigns(scene, STREET, night);
      const meshes = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.name === 'map-signs');
      expect(meshes).toHaveLength(1);
      const material = meshes[0]!.material as THREE.Material;
      expect(material instanceof (night ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)).toBe(true);
      let freed = 0;
      meshes[0]!.geometry.addEventListener('dispose', () => freed++);
      material.addEventListener('dispose', () => freed++);
      signs.dispose();
      expect(scene.children).toHaveLength(0);
      expect(freed).toBe(2);
    }
  });

  it('adds nothing on a map without signs', () => {
    const scene = new THREE.Scene();
    addMapSigns(scene, OPEN_FIELD, true).dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('come with the match lighting: lit by the preset it plays under, gone with it', () => {
    for (const preset of [LIGHTING_PRESETS.night, LIGHTING_PRESETS.day]) {
      const scene = new THREE.Scene();
      const lighting = addLighting(scene, STREET, QUALITY.low, preset);
      const mesh = scene.getObjectByName('map-signs') as THREE.Mesh;
      expect((mesh.material as THREE.Material) instanceof THREE.MeshBasicMaterial).toBe(preset.night);
      lighting.dispose();
      expect(scene.getObjectByName('map-signs')).toBeUndefined();
    }
  });
});
