import { beforeAll, describe, expect, it } from 'vitest';
import { lowCoverBlocks, tallCoverBlocks } from '../ai/cover';
import { canSee } from '../ai/perception';
import { BOTS } from '../config/bots';
import { DRESSING, POSTERS } from '../config/dressing';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { boxHitsBlock, clearOfPlay, clearSpots, floorUnder, frontRect, junkRect } from '../render/dressingSpots';
import { placeDressing } from '../render/mapDressing';
import { neonPlate, neonSpellable } from '../render/neonDressing';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import type { MapBlock, MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { blockMaterial } from '../config/materials';

/**
 * G9: Neon Heights' set dressing is look only. The street plays exactly as it does without it (the same blocks in the
 * same order, colliders, nav grid, cover and bot sight), its litter keeps the rules of G8's loose junk, and its posters
 * and neon signs sit flat on the walls above head height.
 */

/** FNV-1a of a string, as 8 hex digits (as neonHeightsArt.test.ts hashes the map). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** What the map is to play, exactly and in order, as neonHeightsArt.test.ts pins it (its look left out). */
function playFingerprint(blocks: readonly MapBlock[]): string {
  const rows = blocks.map((b) =>
    [b.center.x, b.center.y, b.center.z, b.size.x, b.size.y, b.size.z, blockMaterial(b), b.kind === 'floor' || b.kind === 'ramp' ? b.kind : 'solid', b.rise ?? '', b.surface ?? ''].join(','),
  );
  return `${rows.length}:${fnv(rows.join('|'))}`;
}

/** Neon Heights as it was before G9: the same map without its set dressing. */
const BARE: MapData = { ...NEON_HEIGHTS };
delete BARE.dressing;
const layout = placeDressing(NEON_HEIGHTS);
const STOREYS = [0, 3, 6];

describe("Neon Heights' dressing changes nothing in play (G9)", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('has a dressing, and keeps its blocks in their exact order (the art test pins them)', () => {
    expect(NEON_HEIGHTS.dressing).toBeDefined();
    // The pin of neonHeightsArt.test.ts: the same 297 blocks in the same order, so the colliders are built as before.
    expect(playFingerprint(NEON_HEIGHTS.blocks)).toBe('297:9333f1ea');
    expect(NEON_HEIGHTS.blocks).toBe(BARE.blocks);
    expect(NEON_HEIGHTS.decor).toBe(BARE.decor);
    expect(NEON_HEIGHTS.lanes).toBe(BARE.lanes);
    expect(NEON_HEIGHTS.spawns).toBe(BARE.spawns);
    expect(NEON_HEIGHTS.signs).toBe(BARE.signs);
  });

  it('builds the same nav grid and the same cover blocks with and without the dressing', { timeout: 60_000 }, () => {
    const navA = buildNavGrid(NEON_HEIGHTS, NAV);
    const navB = buildNavGrid(BARE, NAV);
    expect(navA).toEqual(navB);
    expect(lowCoverBlocks(NEON_HEIGHTS.blocks, navA, BODY, BOTS.lowCoverFloorGap)).toEqual(lowCoverBlocks(BARE.blocks, navB, BODY, BOTS.lowCoverFloorGap));
    expect(tallCoverBlocks(NEON_HEIGHTS.blocks, navA, BODY, BOTS.lowCoverFloorGap)).toEqual(tallCoverBlocks(BARE.blocks, navB, BODY, BOTS.lowCoverFloorGap));
  });

  it('gives the same colliders on every storey and the same bot sight', { timeout: 60_000 }, () => {
    const a = new PhysicsWorld(NEON_HEIGHTS, BODY, 1 / 60);
    const b = new PhysicsWorld(BARE, BODY, 1 / 60);
    for (let x = -22; x <= 22; x += 3) {
      for (let z = -14; z <= 14; z += 3) {
        for (const base of STOREYS) {
          for (const y of [0.05, 0.2, 1.0, 1.6]) {
            for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071]] as const) {
              const from = vec3(x, base + y, z);
              const dir = vec3(dx, 0, dz);
              expect(a.raycastStatic(from, dir, 50)).toBe(b.raycastStatic(from, dir, 50));
            }
          }
        }
      }
    }
    const spots = [];
    for (let x = -21; x <= 21; x += 6) for (let z = -13; z <= 13; z += 6.5) for (const base of STOREYS) spots.push(vec3(x, base, z));
    const viewer = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const target = createCharacter(1, vec3(), 0, LOADOUT, 1);
    let seen = 0;
    for (const p of spots) {
      for (const q of spots) {
        if (p === q) continue;
        viewer.position = p;
        target.position = q;
        viewer.yaw = Math.atan2(-(q.x - p.x), -(q.z - p.z));
        const sees = canSee(viewer, target, a, BOTS, BODY, HITS);
        expect(canSee(viewer, target, b, BOTS, BODY, HITS)).toBe(sees);
        if (sees) seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    a.dispose();
    b.dispose();
  });
});

describe("Neon Heights' street dressing (G9)", () => {
  it('drops litter, puddles, posters and neon signs, and no woodland floor', () => {
    expect(layout.junk.length).toBeGreaterThanOrEqual(10);
    expect(layout.puddles.length).toBeGreaterThanOrEqual(5);
    expect(layout.posters.length).toBeGreaterThanOrEqual(10);
    expect(layout.neon.length).toBe(NEON_HEIGHTS.dressing!.neon!.length);
    expect(layout.fallen).toEqual([]);
    expect(layout.leaves).toEqual([]);
    // A city's mix: bin bags and cans, and no tyres or cable coils (DRESSING.junk.street).
    const kinds = new Set(layout.junk.map((p) => p.kind));
    expect(kinds.has('tyre')).toBe(false);
    expect(kinds.has('coil')).toBe(false);
  });

  it('keeps every piece of litter low, on a floor and out of the way', () => {
    const spots = clearSpots(NEON_HEIGHTS);
    for (const p of layout.junk) {
      const r = junkRect(p);
      const where = `${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
      expect(p.height, where).toBeLessThanOrEqual(DRESSING.junk.maxHeight);
      expect(floorUnder(NEON_HEIGHTS.blocks, r, p.y), `${where}: on a floor`).not.toBeNull();
      expect(clearOfPlay(NEON_HEIGHTS, r, spots), `${where}: clear of play`).toBe(true);
      // DRESSING.junk.openFront (1.6 m) of floor stays clear in front of it, so it narrows no passage or doorway.
      const front = frontRect(p);
      expect(boxHitsBlock(NEON_HEIGHTS.blocks, front, p.y + 0.05, p.y + BODY.height), `${where}: open in front`).toBe(false);
    }
  });

  it('pastes every poster flat on a street wall, clear of the ground and of the coping', () => {
    for (const q of layout.posters) {
      const where = `poster at ${q.centre.join(', ')}`;
      expect(q.width, where).toBeGreaterThanOrEqual(POSTERS.width[0]);
      expect(q.width, where).toBeLessThanOrEqual(POSTERS.width[1]);
      expect(q.centre[1] - q.height / 2, `${where}: off the ground`).toBeGreaterThan(0.4);
      expect(q.centre[1] + q.height / 2, `${where}: under the coping`).toBeLessThan(3.2);
      // On a wall of the map, its face within a few millimetres of the wall's side.
      const wall = NEON_HEIGHTS.blocks.some((b) => {
        if (b.kind !== 'wall') return false;
        const face = (q.axis === 0 ? b.center.x : b.center.z) + q.sign * (q.axis === 0 ? b.size.x : b.size.z) / 2;
        return Math.abs(face - q.centre[q.axis]) < 0.05;
      });
      expect(wall, `${where}: on a wall`).toBe(true);
    }
  });

  it('hangs every neon sign above head height, flat on its wall and spellable in tubes', () => {
    for (const s of layout.neon) {
      const where = `${s.text ?? s.emblem} at ${s.centre.x}, ${s.centre.z}`;
      const [, h] = neonPlate(s);
      // A player stands 1.8 m and jumps about half a metre: a sign's foot clears both.
      expect(s.centre.y - h / 2, `${where}: over head height`).toBeGreaterThanOrEqual(2.3);
      if (s.text) expect(neonSpellable(s.text), `${where}: in the tube alphabet`).toBe(true);
      // Only a few flicker, each on one of the three channels.
      if (s.flicker !== undefined) expect([1, 2, 3]).toContain(s.flicker);
    }
    expect(layout.neon.filter((s) => s.flicker !== undefined).length).toBeLessThanOrEqual(3);
  });

  it('is deterministic: the same seed gives the same street, another seed another', () => {
    expect(placeDressing(NEON_HEIGHTS)).toEqual(layout);
    const other = placeDressing({ ...NEON_HEIGHTS, dressing: { ...NEON_HEIGHTS.dressing!, seed: NEON_HEIGHTS.dressing!.seed + 1 } });
    expect(other.junk).not.toEqual(layout.junk);
    expect(other.posters).not.toEqual(layout.posters);
    // The signs are placed by hand, so they are the same whatever the seed.
    expect(other.neon).toEqual(layout.neon);
  });
});
