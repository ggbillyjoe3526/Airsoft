import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lowCoverBlocks, tallCoverBlocks } from '../ai/cover';
import { BOT_BEHAVIOUR, NIGHT_SIGHT } from '../config/bots';
import { blockMaterial } from '../config/materials';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LIGHTING_PRESETS, SIGNS } from '../config/render';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { buildNavGrid } from '../nav/navGrid';
import { blockTint, texturesFor } from '../render/mapMeshes';
import { resolveLighting } from '../render/lightingPreset';
import { mapUnderLighting } from './lightingChoice';
import { NEON_HEIGHTS } from './neonHeights';
import type { MapBlock } from './mapTypes';
import { buildNightField, underRoof } from './nightSight';

/** FNV-1a of a string, as 8 hex digits. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const isStreet = (b: MapBlock): boolean => b.kind === 'floor' && Math.abs(b.center.y + b.size.y / 2) < 1e-6;

/**
 * What Neon Heights is to play, exactly and in order (physics builds its colliders in this order): every block's box,
 * what BBs make of it, whether it is walked on and its slope and footsteps. Its look (finish, paint, which prop kind) is
 * left out.
 */
export function playFingerprint(blocks: readonly MapBlock[]): string {
  const rows = blocks.map((b) =>
    [b.center.x, b.center.y, b.center.z, b.size.x, b.size.y, b.size.z, blockMaterial(b), b.kind === 'floor' || b.kind === 'ramp' ? b.kind : 'solid', b.rise ?? '', b.surface ?? ''].join(','),
  );
  return `${rows.length}:${fnv(rows.join('|'))}`;
}

/**
 * The bots' map of Neon Heights: the nav grid's corner, size and every node's floor height and walkability, exactly
 * (no rounding: a corner shifted by 1e-15 moves cell centres across floor edges and changes who wins).
 */
export function navFingerprint(): string {
  const g = buildNavGrid(NEON_HEIGHTS, NAV);
  const text = [g.minX, g.minZ, g.cols, g.rows, Array.from(g.cellStart).join(','), Array.from(g.floorY).join(','), Array.from(g.walkable).join(',')].join('|');
  return `${g.floorY.length}:${fnv(text)}`;
}

describe('Neon Heights art (M34f)', () => {
  it('plays exactly as before its art: the same boxes in the same order, ricochets, slopes and footsteps', () => {
    // Pinned from main before M34f (2026-10-05, 4780b4a): 281 blocks, the street one slab. Re-pinned for M55 (audit
    // SIM-04): 297 blocks, the same space filled without two blocks in one place (walls stop under the floors laid
    // into them, the Sky Bridge ends at the Tower's wall, planters stand against walls); the nav grid below is as it was.
    expect(playFingerprint(NEON_HEIGHTS.blocks)).toBe('297:9333f1ea');
  });

  it('gives the bots exactly the same nav grid as before its art', () => {
    // Pinned from main before M34f (2026-10-05, 7ec2c27). The street split into three strips once laid this grid from
    // -23.509999999999998 instead of -23.51 and lifted the Pro attackers from 55 % to 64 %; the road is decor now.
    expect(navFingerprint()).toBe('52822:7b34b809');
  });

  it('gives the bots the same cover and night roofs after M55 seated its floors (audit SIM-04)', () => {
    // A wall rising through a floor's edge, cut at the floor, would put its part over the floor on the bots' cover list
    // and its strip beside the floor would roof the cells next to it at night (the Plaza stair's foot): such walls stay
    // whole (seatFloors). The cover lists, pinned after M55: main's (a9c45dd), but for the planters butted against walls,
    // the Sky Bridge's sides ending at the Tower and the stairwell's south wall starting past its west wall.
    const nav = buildNavGrid(NEON_HEIGHTS, NAV);
    const cover = [...lowCoverBlocks(NEON_HEIGHTS.blocks, nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), ...tallCoverBlocks(NEON_HEIGHTS.blocks, nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap)];
    expect(`${cover.length}:${fnv(cover.map((c) => [c.x, c.z, c.halfX, c.halfZ].join(',')).join('|'))}`).toBe('180:0a302f02');
    // Whether night sight counts each nav node indoors, pinned from main before M55 (2026-10-05, a9c45dd).
    const field = buildNightField(mapUnderLighting(NEON_HEIGHTS, 'night'), NIGHT_SIGHT, true)!;
    let roofed = '';
    for (let k = 0; k < nav.floorY.length; k++) {
      const c = nav.nodeCell[k]!;
      roofed += underRoof(field, { x: nav.minX + ((c % nav.cols) + 0.5) * nav.cell, y: nav.floorY[k]!, z: nav.minZ + (Math.floor(c / nav.cols) + 0.5) * nav.cell }) ? '1' : '0';
    }
    expect(fnv(roofed)).toBe('94eda2d0');
  });

  it('fills the space it did before M55 moved its overlaps: the solid blocks (not the ramps) hold the same volume to a few cubic metres (QA)', () => {
    // Measured on main before M55 (2026-10-05, claude/audit2-fixes-1padgo, 281 blocks): 2644.2 m³ of the solid blocks' union
    // on a 0.2 m grid over the map's plan; M55's 297 blocks measure the same, but for a 0.1 m sliver of a planter at the
    // grand stair's foot (0.13 m³ on a 0.1 m grid). Cutting a wall under a floor, or a strip beside it, and losing it
    // is 3 to 5 m³.
    const CELL = 0.2;
    let volume = 0;
    for (let x = -23.6 + CELL / 2; x < 23.6; x += CELL) {
      for (let z = -15.6 + CELL / 2; z < 15.6; z += CELL) {
        const spans: [number, number][] = [];
        for (const b of NEON_HEIGHTS.blocks) {
          if (b.kind === 'ramp' || Math.abs(x - b.center.x) >= b.size.x / 2 || Math.abs(z - b.center.z) >= b.size.z / 2) continue;
          spans.push([b.center.y - b.size.y / 2, b.center.y + b.size.y / 2]);
        }
        spans.sort((p, q) => p[0] - q[0]);
        let top = Number.NEGATIVE_INFINITY;
        for (const [from, to] of spans) {
          if (to <= top) continue;
          volume += (to - Math.max(from, top)) * CELL * CELL;
          top = to;
        }
      }
    }
    expect(Math.abs(volume - 2644.2)).toBeLessThan(0.5);
  });

  it('is a city: every wall, floor and rail finished, the street paving with an asphalt road, no site toilet or container left', () => {
    for (const b of NEON_HEIGHTS.blocks) {
      if (b.kind === 'wall' || b.kind === 'barrier' || b.kind === 'floor') expect(b.finish, `${b.kind} at ${b.center.x},${b.center.y},${b.center.z}`).toBeDefined();
      expect(['toilet', 'container']).not.toContain(b.kind);
    }
    const street = NEON_HEIGHTS.blocks.filter(isStreet);
    expect(street.map((b) => b.finish)).toEqual(['paving']);
    // The road is look-only decor on the slab, a few millimetres proud of it, under the markings.
    const decor = NEON_HEIGHTS.decor ?? [];
    expect(decor.map((b) => [b.kind, b.finish])).toEqual([['floor', 'asphalt']]);
    const roadTop = decor[0]!.center.y + decor[0]!.size.y / 2;
    expect(roadTop).toBeGreaterThan(0);
    expect(roadTop).toBeLessThan(SIGNS.offset);
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
    // More sky light: the fill's sky side as light (linear luminance × intensity), since M52 lit the base night's fill
    // at the city's intensity with a darker sky colour (audit REN-02).
    const skyLight = (h: { sky: number; intensity: number }): number => {
      const c = new THREE.Color(h.sky);
      return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * h.intensity;
    };
    expect(skyLight(night.hemi)).toBeGreaterThan(skyLight(LIGHTING_PRESETS.night.hemi) * 1.5);
    expect(night.nightSky!.stars).toBeLessThan(LIGHTING_PRESETS.night.nightSky!.stars);
    expect(night.fog.near).toBe(LIGHTING_PRESETS.night.fog.near); // only the colour
    expect(resolveLighting(mapUnderLighting(NEON_HEIGHTS, 'day'))).toEqual(LIGHTING_PRESETS.day);
  });
});
