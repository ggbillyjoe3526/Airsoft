import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, LIGHTING_PRESETS, QUALITY, RENDER } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { addAtmosphere, buildClouds, horizonTreeLevel, shadedCrown, skyColour, treeRingStart } from './atmosphere';
import { addLighting, mapBoundingBox } from './lighting';
import { resolveLighting } from './lightingPreset';

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

describe('the sky under a lighting preset (M33f)', () => {
  const moon = new THREE.Vector3(1, 0.3, 0).normalize();
  const domeColours = (scene: THREE.Scene): THREE.BufferAttribute => (scene.getObjectByName('sky') as THREE.Mesh).geometry.getAttribute('color') as THREE.BufferAttribute;
  const mean = (col: THREE.BufferAttribute): number => {
    let m = 0;
    for (let i = 0; i < col.count; i++) m += col.getX(i) + col.getY(i) + col.getZ(i);
    return m / col.count / 3;
  };

  it('paints the dome from the night palette, and from the day’s by default, as before', () => {
    const night = LIGHTING_PRESETS.night;
    const a = new THREE.Scene();
    const day = addAtmosphere(a, new THREE.Vector3(), moon, QUALITY.low);
    const b = new THREE.Scene();
    const dark = addAtmosphere(b, new THREE.Vector3(), moon, QUALITY.low, null, night);
    const dayCol = domeColours(a);
    const nightCol = domeColours(b);
    const pos = (a.getObjectByName('sky') as THREE.Mesh).geometry.getAttribute('position');
    const dir = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 37) {
      dir.fromBufferAttribute(pos, i).normalize();
      expect(dayCol.getZ(i)).toBeCloseTo(skyColour(dir, moon, new THREE.Color()).b, 6);
      expect(nightCol.getZ(i)).toBeCloseTo(skyColour(dir, moon, new THREE.Color(), night.sky).b, 6);
    }
    expect(mean(nightCol)).toBeLessThan(mean(dayCol) / 4);
    day.dispose();
    dark.dispose();
  });

  it('colours the clouds from the preset: dim clouds at night, and no disc in them (the moon is the night sky’s, M33i)', () => {
    const day = buildClouds(new THREE.Vector3(), moon);
    const night = buildClouds(new THREE.Vector3(), moon, LIGHTING_PRESETS.night);
    const dayCol = day.geometry.getAttribute('color') as THREE.BufferAttribute;
    const nightCol = night.geometry.getAttribute('color') as THREE.BufferAttribute;
    // By day the last vertex is the sun disc's rim (a middle and two rings of 20); at night the disc's size is 0 and the
    // clouds hold no disc, so Medium and High never draw two moons (render/nightSky.ts draws it on every quality).
    const sun = new THREE.Color(LIGHTING_PRESETS.day.key.disc.colour);
    expect(dayCol.getX(dayCol.count - 1)).toBeCloseTo(sun.r, 6);
    expect(LIGHTING_PRESETS.night.key.disc.size).toBe(0);
    expect(nightCol.count).toBe(dayCol.count - (1 + 2 * 20));
    // The first vertex is a cloud's middle.
    expect(nightCol.getX(0)).toBeLessThan(dayCol.getX(0) / 2);
    expect(nightCol.getW(0)).toBeLessThan(dayCol.getW(0));
    for (const m of [day, night]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
});

describe('the horizon ring at night on a map with its own trees (M75, owner decision 8)', () => {
  const trees = (scene: THREE.Scene): number => {
    const mesh = scene.getObjectByName('trees') as THREE.Mesh | undefined;
    return mesh ? mesh.geometry.getAttribute('position').count / 3 : 0;
  };
  // The ring alone: Woodland without its set dressing, whose skyline (G9) joins the same mesh on Medium and High.
  const WOODS: typeof WOODLAND = { ...WOODLAND };
  delete WOODS.dressing;

  it('caps the ring at ATMOSPHERE.trees.nightWithOwnTrees by night in the woods, and keeps the setting anywhere else', () => {
    const cap = ATMOSPHERE.trees.nightWithOwnTrees;
    expect(cap).toBe(1);
    for (const setting of [0, 1, 2] as const) {
      expect(horizonTreeLevel(setting, true, true)).toBe(Math.min(setting, cap));
      expect(horizonTreeLevel(setting, false, true)).toBe(setting);
      expect(horizonTreeLevel(setting, true, false)).toBe(setting);
    }
  });

  it('draws Woodland’s ring as the simple one on Medium by night, as Depot’s under the same night keeps the detailed one', () => {
    const night = resolveLighting(WOODS);
    expect(night.night).toBe(true);
    expect(QUALITY.medium.trees).toBe(2);
    const ring = (map: typeof WOODS, quality: typeof QUALITY.medium): { scene: THREE.Scene; dispose: () => void } => {
      const scene = new THREE.Scene();
      const lighting = addLighting(scene, map, quality, night);
      return { scene, dispose: () => lighting.dispose() };
    };
    const woodsMedium = ring(WOODS, QUALITY.medium);
    const woodsLow = ring(WOODS, QUALITY.low);
    const depotMedium = ring(DEPOT, QUALITY.medium);
    const depotLow = ring(DEPOT, QUALITY.low);
    expect(trees(woodsMedium.scene)).toBe(trees(woodsLow.scene));
    expect(trees(depotMedium.scene)).toBeGreaterThan(trees(depotLow.scene));
    // Trees: None stays none.
    const woodsNone = ring(WOODS, { ...QUALITY.medium, trees: 0 });
    expect(trees(woodsNone.scene)).toBe(0);
    for (const r of [woodsMedium, woodsLow, depotMedium, depotLow, woodsNone]) r.dispose();
  });

  it('keeps the setting’s own ring on Woodland by day, and on Depot and Neon Heights under their own presets (M75, QA)', () => {
    const ring = (map: typeof WOODS, quality: typeof QUALITY.medium, preset: typeof LIGHTING_PRESETS.day): number => {
      const scene = new THREE.Scene();
      const lighting = addLighting(scene, map, quality, preset);
      const n = trees(scene);
      lighting.dispose();
      return n;
    };
    const simple = ring(WOODS, QUALITY.low, LIGHTING_PRESETS.night);
    expect(simple).toBeGreaterThan(0);
    // Woodland: the detailed ring by day (the preset's own level), the simple one by night.
    const woodsDay = ring(WOODS, QUALITY.medium, LIGHTING_PRESETS.day);
    expect(woodsDay).toBeGreaterThan(simple);
    expect(ring(WOODS, QUALITY.medium, resolveLighting(WOODS))).toBe(simple);
    expect(ring(WOODS, QUALITY.high, LIGHTING_PRESETS.night)).toBe(simple);
    expect(ring(WOODS, QUALITY.high, LIGHTING_PRESETS.day)).toBeGreaterThan(simple);
    // A Low setting is kept by day too (the cap only lowers).
    expect(ring(WOODS, QUALITY.low, LIGHTING_PRESETS.day)).toBe(simple);
    // Neon Heights (night by default, and day): no trees of its own, so Medium and High keep the detailed ring.
    expect(NEON_HEIGHTS.blocks.some((b) => b.kind === 'tree')).toBe(false);
    for (const preset of [resolveLighting(NEON_HEIGHTS), resolveLighting(NEON_HEIGHTS, 'day')]) {
      expect(ring(NEON_HEIGHTS, QUALITY.medium, preset)).toBeGreaterThan(ring(NEON_HEIGHTS, QUALITY.low, preset));
    }
    // Depot (day): untouched.
    expect(ring(DEPOT, QUALITY.medium, resolveLighting(DEPOT))).toBeGreaterThan(ring(DEPOT, QUALITY.low, resolveLighting(DEPOT)));
  });

  it('applies the cap when Trees changes during play, not only when the ring is first built', () => {
    const field = mapBoundingBox(WOODLAND);
    const build = (ownTrees: boolean, preset: typeof LIGHTING_PRESETS.day, quality: typeof QUALITY.low) => {
      const scene = new THREE.Scene();
      const sun = new THREE.Vector3(1, 2, 0).normalize();
      const atmosphere = addAtmosphere(scene, new THREE.Vector3(), sun, quality, field, preset, [], ownTrees);
      return { scene, atmosphere };
    };
    const night = LIGHTING_PRESETS.night;
    const woods = build(true, night, QUALITY.low);
    const open = build(false, night, QUALITY.low);
    const simple = trees(woods.scene);
    expect(simple).toBeGreaterThan(0);
    expect(trees(open.scene)).toBe(simple);
    for (const level of [2, 1, 2, 0, 2] as const) {
      woods.atmosphere.setQuality({ trees: level, clouds: false });
      open.atmosphere.setQuality({ trees: level, clouds: false });
      expect(trees(woods.scene)).toBe(level === 0 ? 0 : simple);
      if (level === 0) expect(trees(open.scene)).toBe(0);
      else if (level === 1) expect(trees(open.scene)).toBe(simple);
      else expect(trees(open.scene)).toBeGreaterThan(simple);
    }
    woods.atmosphere.dispose();
    open.atmosphere.dispose();
  });
});
