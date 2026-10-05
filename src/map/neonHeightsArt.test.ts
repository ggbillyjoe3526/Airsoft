import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blockMaterial } from '../config/materials';
import { LIGHTING_PRESETS } from '../config/render';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { blockTint, texturesFor } from '../render/mapMeshes';
import { resolveLighting } from '../render/lightingPreset';
import { mapUnderLighting } from './lightingChoice';
import { NEON_HEIGHTS } from './neonHeights';
import type { MapBlock } from './mapTypes';

/** FNV-1a of a string, as 8 hex digits. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const r = (v: number): string => v.toFixed(3);
const isStreet = (b: MapBlock): boolean => b.kind === 'floor' && Math.abs(b.center.y + b.size.y / 2) < 1e-6;

/**
 * What Neon Heights is to play: every block but the street's slab as its box, what BBs make of it and its slope and
 * footsteps; the street as the area it covers. Its look (finish, paint, kind among the props) is left out.
 */
export function playFingerprint(blocks: readonly MapBlock[]): { blocks: string; street: string } {
  const rows = blocks
    .filter((b) => !isStreet(b))
    .map((b) => [r(b.center.x), r(b.center.y), r(b.center.z), r(b.size.x), r(b.size.y), r(b.size.z), blockMaterial(b), b.kind === 'floor' || b.kind === 'ramp' ? b.kind : 'solid', b.rise ?? '', b.surface ?? ''].join(','))
    .sort();
  const street = blocks.filter(isStreet);
  const x0 = Math.min(...street.map((b) => b.center.x - b.size.x / 2));
  const x1 = Math.max(...street.map((b) => b.center.x + b.size.x / 2));
  const z0 = Math.min(...street.map((b) => b.center.z - b.size.z / 2));
  const z1 = Math.max(...street.map((b) => b.center.z + b.size.z / 2));
  // Every point of the street's bounds, on a 10 cm grid, under some piece of it: no gap where it was split.
  let gaps = 0;
  for (let x = x0 + 0.05; x < x1; x += 0.1) {
    for (let z = z0 + 0.05; z < z1; z += 0.1) {
      if (!street.some((b) => Math.abs(x - b.center.x) <= b.size.x / 2 && Math.abs(z - b.center.z) <= b.size.z / 2)) gaps++;
    }
  }
  return { blocks: `${rows.length}:${fnv(rows.join('|'))}`, street: `${[r(x0), r(x1), r(z0), r(z1)].join(',')} gaps ${gaps}` };
}

describe('Neon Heights art (M34f)', () => {
  it('plays exactly as before its art: the same boxes, ricochets, slopes and footsteps, the same street', () => {
    // Pinned from main before M34f (2026-10-05, 8b336aa): 280 blocks besides the street, which was one slab.
    expect(playFingerprint(NEON_HEIGHTS.blocks)).toEqual({ blocks: '280:6750a11a', street: '-23.510,23.510,-15.510,15.510 gaps 0' });
  });

  it('is a city: every wall, floor and rail finished, the street asphalt and paving, no site toilet or container left', () => {
    for (const b of NEON_HEIGHTS.blocks) {
      if (b.kind === 'wall' || b.kind === 'barrier' || b.kind === 'floor') expect(b.finish, `${b.kind} at ${b.center.x},${b.center.y},${b.center.z}`).toBeDefined();
      expect(['toilet', 'container']).not.toContain(b.kind);
    }
    const street = NEON_HEIGHTS.blocks.filter(isStreet);
    expect(street.map((b) => b.finish)).toEqual(['paving', 'asphalt', 'paving']);
    const kinds = new Set(NEON_HEIGHTS.blocks.map((b) => b.kind));
    for (const k of ['cabinet', 'vending', 'stall', 'planter', 'booth', 'van'] as const) expect(kinds.has(k), k).toBe(true);
    expect(new Set(texturesFor(NEON_HEIGHTS))).toEqual(
      new Set(['concrete', 'blockWall', 'crate', 'corrugated', 'steelPlate', 'barrier', 'sandbag', 'gabion', 'plaster', 'cladding', 'tiles', 'asphalt', 'paving', 'glass', 'planks']),
    );
  });

  it('paints nothing in a colour that reads as a team (the rule mapMeshes.test.ts keeps for Depot)', () => {
    const hsl = (hex: number): { h: number; s: number } => {
      const out = { h: 0, s: 0, l: 0 };
      new THREE.Color(hex).getHSL(out);
      return { h: out.h * 360, s: out.s };
    };
    const teams = Object.values(TEAM_COLOUR_SETS).flatMap((t) => t.figures).map(hsl);
    for (const b of NEON_HEIGHTS.blocks) {
      const c = hsl(blockTint(b));
      if (c.s < 0.3) continue;
      for (const t of teams) {
        const d = Math.abs(c.h - t.h) % 360;
        expect(Math.min(d, 360 - d), `${b.kind} paint #${blockTint(b).toString(16)}`).toBeGreaterThan(20);
      }
    }
  });

  it('paints its road markings flat on the street, inside the field, clear of anything standing on it', () => {
    const marks = NEON_HEIGHTS.signs!.filter((s) => s.kind === 'paint');
    expect(marks.length).toBeGreaterThan(30);
    const standing = NEON_HEIGHTS.blocks.filter((b) => b.kind !== 'floor' && b.kind !== 'ramp' && Math.abs(b.center.y - b.size.y / 2) < 1e-6);
    for (const m of marks) {
      expect(m.facing).toBe('+y');
      expect(m.centre.y).toBe(0);
      expect(Math.abs(m.centre.x) + m.width / 2).toBeLessThan(23);
      expect(Math.abs(m.centre.z) + m.height / 2).toBeLessThan(15);
      const under = standing.find((b) => Math.abs(m.centre.x - b.center.x) < (m.width + b.size.x) / 2 && Math.abs(m.centre.z - b.center.z) < (m.height + b.size.z) / 2);
      expect(under, `marking at ${m.centre.x},${m.centre.z}`).toBeUndefined();
    }
  });

  it('lights its own night sky: a violet glow in the fog, more sky light, fewer stars; the day is untouched', () => {
    const night = resolveLighting(mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(night.night).toBe(true);
    expect(night.fog.colour).toBe(night.sky.horizon);
    expect(night.fog.colour).not.toBe(LIGHTING_PRESETS.night.fog.colour);
    expect(night.hemi.intensity).toBeGreaterThan(LIGHTING_PRESETS.night.hemi.intensity);
    expect(night.nightSky!.stars).toBeLessThan(LIGHTING_PRESETS.night.nightSky!.stars);
    expect(night.fog.near).toBe(LIGHTING_PRESETS.night.fog.near); // only the colour
    expect(resolveLighting(mapUnderLighting(NEON_HEIGHTS, 'day'))).toEqual(LIGHTING_PRESETS.day);
  });
});
