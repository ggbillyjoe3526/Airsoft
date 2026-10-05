import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../config/render';
import { DEPOT } from '../map/depot';
import { WOODLAND } from '../map/woodland';
import { buildLightFixtures, flameGeometry, flicker, flickerSeed, lanternMount } from './lightFixtures';

const flat = () => 0;

describe('light fixtures (M33i: camp fires and lanterns from MapLight.kind)', () => {
  it('flickers within 1 ± amount, about 1 on average, the same every time, and differently per light', () => {
    const A = FIXTURES.flicker.amount;
    let sum = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const v = flicker(i / 100, flickerSeed(0));
      expect(v).toBeGreaterThanOrEqual(1 - A - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + A + 1e-9);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(1, 2);
    expect(flicker(12.3, 1.5)).toBe(flicker(12.3, 1.5));
    expect(flicker(1, flickerSeed(0))).not.toBe(flicker(1, flickerSeed(1)));
  });

  it('builds nothing for a map whose lights have no kind (Depot; Neon Heights’ street lights)', () => {
    expect(buildLightFixtures(DEPOT, flat, true)).toBeNull();
    expect(buildLightFixtures({ ...WOODLAND, lights: WOODLAND.lights!.map(({ kind: _kind, ...l }) => l) }, flat, true)).toBeNull();
  });

  it('gives Woodland’s fires flames and embers, drawn every frame from one clock, with no per-frame CPU work on the mesh', () => {
    const fx = buildLightFixtures(WOODLAND, flat, false)!;
    const flames = fx.group.getObjectByName('fire-flames') as THREE.Mesh;
    const embers = fx.group.getObjectByName('fire-embers') as THREE.Points;
    expect(flames.frustumCulled).toBe(false);
    expect(flames.geometry.getAttribute('flicker').itemSize).toBe(3);
    expect((flames.material as THREE.Material).forceSinglePass).toBe(true);
    expect(embers.visible).toBe(false);
    fx.setEmbers(true);
    expect(embers.visible).toBe(true);
    const fires = WOODLAND.lights!.filter((l) => l.kind === 'fire').length;
    expect(embers.geometry.getAttribute('position').count).toBe(fires * FIXTURES.embers.perFire);
    const before = flames.geometry.getAttribute('position').array.slice();
    fx.advance(0.5);
    expect(fx.time).toBeCloseTo(0.5, 9);
    expect(flames.geometry.getAttribute('position').array).toEqual(before);
    fx.advance(1e6);
    expect(fx.time).toBeLessThan(3600);
    fx.dispose();
  });

  it('draws a pane for each lantern and cards for each fire', () => {
    const lights = WOODLAND.lights!;
    const fires = lights.filter((l) => l.kind === 'fire').length;
    const lanterns = lights.filter((l) => l.kind === 'lantern').length;
    expect(fires).toBeGreaterThan(0);
    expect(lanterns).toBeGreaterThan(0);
    const geo = flameGeometry(lights, flat);
    expect(geo.index!.count / 3).toBeGreaterThanOrEqual(fires * FIXTURES.fire.flames.cards * 2 + lanterns * 2);
  });

  it('hangs a lantern on a block within reach, else on a post', () => {
    const light = { position: { x: 0, y: 1.5, z: 0 }, colour: 0xffffff, radius: 5 };
    const wall = { kind: 'log' as const, center: { x: 0.3, y: 1, z: 0 }, size: { x: 0.2, y: 2, z: 2 } };
    expect(lanternMount(light, [wall])?.block).toBe(wall);
    expect(lanternMount(light, [{ ...wall, center: { x: 3, y: 1, z: 0 } }])).toBeNull();
  });
});
