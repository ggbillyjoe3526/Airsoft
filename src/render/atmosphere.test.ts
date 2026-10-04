import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, QUALITY, RENDER } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { addAtmosphere, buildClouds, shadedCrown, skyColour, treeRingStart } from './atmosphere';
import { mapBoundingBox } from './lighting';

describe('skyColour', () => {
  const sun = new THREE.Vector3(1, 2, 0).normalize();
  const away = new THREE.Vector3(-1, 0, 0);
  const dist = (a: THREE.Color, hex: number): number => {
    const b = new THREE.Color(hex);
    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  };

  it('is the horizon colour at the horizon (matching the haze) and the zenith colour straight up, away from the sun', () => {
    const c = new THREE.Color();
    expect(dist(skyColour(new THREE.Vector3(0, 0, -1), sun, c), ATMOSPHERE.horizon)).toBeLessThan(1e-6);
    expect(dist(skyColour(new THREE.Vector3(0, 1, 0), away, c), ATMOSPHERE.zenith)).toBeLessThan(1e-6);
  });

  it('glows warm towards the sun', () => {
    const towards = skyColour(sun, sun, new THREE.Color());
    const opposite = skyColour(new THREE.Vector3(-sun.x, sun.y, -sun.z), sun, new THREE.Color());
    expect(towards.r - towards.b).toBeGreaterThan(opposite.r - opposite.b);
  });
});

describe('addAtmosphere', () => {
  it('draws the sky dome after the opaque field and never writes depth (REN-05: no full-screen fill under the field)', () => {
    const scene = new THREE.Scene();
    const atmosphere = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0, 1, 0), QUALITY.low);
    const sky = scene.getObjectByName('sky') as THREE.Mesh;
    const material = sky.material as THREE.MeshBasicMaterial;
    // Three.js sorts opaque objects by renderOrder first: above the field's 0 the depth test culls every covered pixel.
    expect(sky.renderOrder).toBeGreaterThan(0);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(false);
    // Inside the far plane from anywhere on a field (the range's ends are 38 m from its centre), or the dome is clipped.
    const farthestFromCentre = 40;
    expect(ATMOSPHERE.skyRadius + farthestFromCentre).toBeLessThan(RENDER.far);
    atmosphere.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('trees and clouds (rows 20b and 21)', () => {
  const sun = new THREE.Vector3(1, 2, 0.5).normalize();
  const triangles = (scene: THREE.Scene, name: string): number => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh) return 0;
    return (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  };

  it('keeps the simple ring and no clouds on Low, and draws the detailed ring and the clouds on Medium and High', () => {
    const low = new THREE.Scene();
    const a = addAtmosphere(low, new THREE.Vector3(), sun, QUALITY.low);
    const high = new THREE.Scene();
    const b = addAtmosphere(high, new THREE.Vector3(), sun, QUALITY.high, new THREE.Box3(new THREE.Vector3(-25, 0, -16), new THREE.Vector3(25, 3, 16)));
    expect(QUALITY.low.trees).toBe(1);
    expect(QUALITY.medium.trees).toBe(2);
    expect(triangles(low, 'trees')).toBeGreaterThan(0);
    expect(triangles(high, 'trees')).toBeGreaterThan(triangles(low, 'trees'));
    expect(low.getObjectByName('clouds')).toBeUndefined();
    expect(high.getObjectByName('clouds')).toBeDefined();
    a.dispose();
    b.dispose();
    expect(low.children).toHaveLength(0);
    expect(high.children).toHaveLength(0);
  });

  it('rebuilds only what a settings change touches, and leaves no trees at None', () => {
    const scene = new THREE.Scene();
    const atmosphere = addAtmosphere(scene, new THREE.Vector3(), sun, QUALITY.medium);
    const trees = scene.getObjectByName('trees');
    const clouds = scene.getObjectByName('clouds');
    atmosphere.setQuality({ trees: 2, clouds: false });
    expect(scene.getObjectByName('trees')).toBe(trees);
    expect(scene.getObjectByName('clouds')).toBeUndefined();
    atmosphere.setQuality({ trees: 0, clouds: true });
    expect(scene.getObjectByName('trees')).toBeUndefined();
    expect(scene.getObjectByName('clouds')).not.toBe(clouds);
    expect(scene.getObjectByName('clouds')).toBeDefined();
    atmosphere.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('draws the clouds as untextured vertex-alpha cards above the horizon, drawn with the sky', () => {
    const clouds = buildClouds(new THREE.Vector3(), sun);
    const material = clouds.material as THREE.MeshBasicMaterial;
    expect(material.map).toBeNull();
    expect(material.depthWrite).toBe(false);
    expect(clouds.renderOrder).toBe(ATMOSPHERE.skyRenderOrder);
    const col = clouds.geometry.getAttribute('color');
    const pos = clouds.geometry.getAttribute('position');
    expect(col.itemSize).toBe(4);
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeGreaterThan(0);
      expect(col.getW(i)).toBeGreaterThanOrEqual(0);
      expect(col.getW(i)).toBeLessThanOrEqual(1);
      expect(Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))).toBeLessThan(ATMOSPHERE.skyRadius);
    }
    clouds.geometry.dispose();
    material.dispose();
  });

  it('shades a crown darker underneath and warmer towards the sun', () => {
    const geo = shadedCrown(new THREE.IcosahedronGeometry(1, 1), 0x4f7f3a, 0, 1, new THREE.Vector3(0, 0, 1));
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    let top = 0;
    let bottom = 0;
    let sunward = 0;
    let away = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const g = col.getY(i);
      if (y > 0.6) top = Math.max(top, g);
      if (y < -0.6) bottom = Math.max(bottom, g);
      if (Math.abs(y) < 0.3 && z > 0.6) sunward = Math.max(sunward, col.getX(i) - col.getZ(i));
      if (Math.abs(y) < 0.3 && z < -0.6) away = Math.max(away, col.getX(i) - col.getZ(i));
    }
    expect(bottom).toBeLessThan(top);
    expect(sunward).toBeGreaterThan(away);
    geo.dispose();
  });
});

describe('the tree ring round any map (engine-level)', () => {
  it('keeps the configured ring round Depot and the range, and moves it out round a bigger field', () => {
    for (const map of [DEPOT, RANGE_MAP]) {
      const box = mapBoundingBox(map);
      expect(treeRingStart(box.getCenter(new THREE.Vector3()), box)).toBe(ATMOSPHERE.trees.ringMin);
    }
    const big = new THREE.Box3(new THREE.Vector3(-90, 0, -60), new THREE.Vector3(90, 4, 60));
    const start = treeRingStart(new THREE.Vector3(), big);
    expect(start).toBeCloseTo(Math.hypot(90, 60) + ATMOSPHERE.trees.ringClearance);
  });

  it('plants no tree inside a big field, at either tree setting', () => {
    const big = new THREE.Box3(new THREE.Vector3(-90, 0, -60), new THREE.Vector3(90, 4, 60));
    const sun = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    for (const trees of [1, 2] as const) {
      const scene = new THREE.Scene();
      const atmosphere = addAtmosphere(scene, new THREE.Vector3(), sun, { trees, clouds: false }, big);
      const pos = (scene.getObjectByName('trees') as THREE.Mesh).geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) expect(big.containsPoint(new THREE.Vector3(pos.getX(i), 1, pos.getZ(i)))).toBe(false);
      atmosphere.dispose();
    }
  });
});
