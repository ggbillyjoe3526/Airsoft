import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, NIGHT_SKY } from '../config/render';
import { buildNightSky, moonGeometry, starGeometry } from './nightSky';

const TOWARDS = new THREE.Vector3(0.4, 0.5, -0.6).normalize();

describe('the night sky (M33i: a moon and stars from the lighting preset)', () => {
  it('draws nothing by day', () => {
    expect(buildNightSky(LIGHTING_PRESETS.day, TOWARDS)).toBeNull();
  });

  it('draws the night preset’s stars and moon, never culled, unfogged, writing no depth', () => {
    const sky = buildNightSky(LIGHTING_PRESETS.night, TOWARDS)!;
    const stars = sky.group.getObjectByName('night-stars') as THREE.Points;
    const moon = sky.group.getObjectByName('night-moon') as THREE.Mesh;
    expect(stars.geometry.getAttribute('position').count).toBe(LIGHTING_PRESETS.night.nightSky.stars);
    for (const o of [stars, moon]) {
      expect(o.frustumCulled).toBe(false);
      const m = o.material as THREE.Material & { fog: boolean };
      expect(m.fog).toBe(false);
      expect(m.depthWrite).toBe(false);
    }
    sky.dispose();
    expect(sky.group.children.length).toBe(2);
  });

  it('puts every star above the horizon band, the same every load', () => {
    const a = starGeometry(200);
    const b = starGeometry(200);
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
    const pos = a.getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i) / NIGHT_SKY.radius).toBeGreaterThanOrEqual(Math.sin(NIGHT_SKY.minElevation) - 1e-6);
  });

  it('centres the moon on the key light’s direction', () => {
    const geo = moonGeometry(LIGHTING_PRESETS.night.nightSky, TOWARDS);
    const p = geo.getAttribute('position');
    const centre = new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).normalize();
    expect(centre.dot(TOWARDS)).toBeCloseTo(1, 6);
  });

  it('follows the camera as it is drawn, allocation-free', () => {
    const sky = buildNightSky(LIGHTING_PRESETS.night, TOWARDS)!;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(3, 4, 5);
    camera.updateMatrixWorld();
    const moon = sky.group.getObjectByName('night-moon')!;
    moon.onBeforeRender(null as never, null as never, camera, null as never, null as never, null as never);
    expect(moon.matrixWorld.elements.slice(12, 15)).toEqual([3, 4, 5]);
    sky.dispose();
  });
});
