import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GROUND_LOOK, LIGHTING_PRESETS, TERRAIN_LOOK } from '../config/render';
import { buildGroundGrid } from '../map/groundSurfaces';
import { terrainHeightAt, terrainRange } from '../map/terrain';
import { WOODLAND } from '../map/woodland';
import { meanLinearLuminance } from './natureTextures';
import { buildTerrainMesh, groundColour } from './terrainMeshes';

/** Rec. 709 luminance of a linear colour. */
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the ground’s brightness (M33i: a detail, never a darkening; figures read on the camp ground)', () => {
  const grid = buildGroundGrid(WOODLAND)!;
  const t = WOODLAND.terrain!;
  const low = new THREE.Color().setHex(TERRAIN_LOOK.low, THREE.SRGBColorSpace);
  const high = new THREE.Color().setHex(TERRAIN_LOOK.high, THREE.SRGBColorSpace);
  const { min, max } = terrainRange(t);

  it('measures a tile’s mean linear luminance', () => {
    expect(meanLinearLuminance([255, 255, 255, 255, 0, 0, 0, 255])).toBeCloseTo(0.5, 6);
    expect(meanLinearLuminance([188, 188, 188, 255])).toBeCloseTo(0.5, 2);
  });

  it('lifts the ground’s colours by the tile’s mean, so a textured ground averages its colours (grass as bright as before)', () => {
    const material = new THREE.MeshLambertMaterial();
    const one = buildTerrainMesh(t, { grid, material, tile: 4, mean: 1 });
    const dark = buildTerrainMesh(t, { grid, material, tile: 4, mean: 0.8 });
    const a = one.geometry.getAttribute('color');
    const b = dark.geometry.getAttribute('color');
    for (let v = 0; v < a.count; v += 97) expect(b.getY(v)).toBeCloseTo(a.getY(v) / 0.8, 6);
    // On open grass the colour is exactly the plain terrain's (M33c), before the tile.
    const plain = buildTerrainMesh(t).geometry.getAttribute('color');
    let grassVertices = 0;
    const pos = one.geometry.getAttribute('position');
    for (let v = 0; v < a.count; v++) {
      const c = groundColour(grid, pos.getX(v), pos.getZ(v), (pos.getY(v) - min) / (max - min), low, high, new THREE.Color());
      const isGrass = Math.abs(c.g - (low.g + (high.g - low.g) * ((pos.getY(v) - min) / (max - min)))) < 1e-6;
      if (!isGrass) continue;
      grassVertices++;
      expect(a.getY(v)).toBeCloseTo(plain.getY(v), 6);
    }
    expect(grassVertices).toBeGreaterThan(1000);
  });

  it('leaves the spawns’ ground as main drew it (grass), and earth lighter than leaf litter under the night key light', () => {
    const key = new THREE.Color(LIGHTING_PRESETS.night.key.colour);
    const lit = (c: THREE.Color): number => lum(c.clone().multiply(key));
    const c = new THREE.Color();
    for (const s of WOODLAND.spawns.flat()) {
      const k = ((terrainHeightAt(t, s.position.x, s.position.z) ?? min) - min) / (max - min);
      groundColour(grid, s.position.x, s.position.z, k, low, high, c);
      const grass = low.clone().lerp(high, k);
      expect([c.r, c.g, c.b].map((v) => +v.toFixed(5))).toEqual([grass.r, grass.g, grass.b].map((v) => +v.toFixed(5)));
    }
    const earth = new THREE.Color().setHex(GROUND_LOOK.colours.earth, THREE.SRGBColorSpace);
    const leaves = new THREE.Color().setHex(GROUND_LOOK.colours.leaves, THREE.SRGBColorSpace).multiplyScalar(GROUND_LOOK.underTreeShade);
    expect(lit(earth)).toBeGreaterThan(lit(leaves) * 2);
    expect(lit(earth.multiplyScalar(GROUND_LOOK.underTreeShade))).toBeGreaterThan(lit(leaves));
  });
});
