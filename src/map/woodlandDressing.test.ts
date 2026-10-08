import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { lowCoverBlocks, tallCoverBlocks } from '../ai/cover';
import { canSee } from '../ai/perception';
import { BOTS } from '../config/bots';
import { DRESSING, WOODS } from '../config/dressing';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { boxHitsBlock, clearOfPlay, clearSpots, frontRect, junkRect } from '../render/dressingSpots';
import { placeDressing } from '../render/mapDressing';
import { fallenCorners, fallenParts } from '../render/woodsDressing';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import type { MapData } from './mapTypes';
import { terrainHeightAt } from './terrain';
import { WOODLAND } from './woodland';

/**
 * G9: Woodland's set dressing is look only. The map plays exactly as it does without it (the same colliders, nav grid,
 * cover and bot sight), every fallen piece and leaf drift keeps the rules of G8's loose junk on the terrain, and the
 * placement is the same every time for the dressing's seed.
 */

/** Woodland as it was before G9: the same map without its set dressing. */
const BARE: MapData = { ...WOODLAND };
delete BARE.dressing;
const layout = placeDressing(WOODLAND);
const terrain = WOODLAND.terrain!;
const ground = (x: number, z: number): number => terrainHeightAt(terrain, x, z) ?? 0;

describe("Woodland's dressing changes nothing in play (G9)", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('has a dressing, and leaves the blocks, lanes, spawns, bushes and terrain as they are', () => {
    expect(WOODLAND.dressing).toBeDefined();
    expect(WOODLAND.blocks).toBe(BARE.blocks);
    expect(WOODLAND.lanes).toBe(BARE.lanes);
    expect(WOODLAND.spawns).toBe(BARE.spawns);
    expect(WOODLAND.foliage).toBe(BARE.foliage);
    expect(WOODLAND.terrain).toBe(BARE.terrain);
    expect(WOODLAND.ground).toBe(BARE.ground);
  });

  it('builds the same nav grid and the same cover blocks with and without the dressing', { timeout: 60_000 }, () => {
    const navA = buildNavGrid(WOODLAND, NAV);
    const navB = buildNavGrid(BARE, NAV);
    expect(navA).toEqual(navB);
    expect(lowCoverBlocks(WOODLAND.blocks, navA, BODY, BOTS.lowCoverFloorGap)).toEqual(lowCoverBlocks(BARE.blocks, navB, BODY, BOTS.lowCoverFloorGap));
    expect(tallCoverBlocks(WOODLAND.blocks, navA, BODY, BOTS.lowCoverFloorGap)).toEqual(tallCoverBlocks(BARE.blocks, navB, BODY, BOTS.lowCoverFloorGap));
  });

  it('gives the same colliders (every ray stops at the same place) and the same bot sight', { timeout: 60_000 }, () => {
    const a = new PhysicsWorld(WOODLAND, BODY, 1 / 60);
    const b = new PhysicsWorld(BARE, BODY, 1 / 60);
    // Rays across the field at foot, shin, crouch and eye height over the terrain: a dressing collider would change one.
    for (let x = -58; x <= 58; x += 6) {
      for (let z = -38; z <= 38; z += 5) {
        const g = ground(x, z);
        for (const y of [0.05, 0.2, 1.0, 1.6]) {
          for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071]] as const) {
            const from = vec3(x, g + y, z);
            const dir = vec3(dx, 0, dz);
            expect(a.raycastStatic(from, dir, 40)).toBe(b.raycastStatic(from, dir, 40));
          }
        }
      }
    }
    // Bot sight between people standing on a grid over the field.
    const spots = [];
    for (let x = -54; x <= 54; x += 13) for (let z = -35; z <= 35; z += 11) spots.push(vec3(x, ground(x, z), z));
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

describe("Woodland's wood floor (G9)", () => {
  it('lays down fallen pieces and leaf drifts, and no yard junk', () => {
    expect(layout.fallen.length).toBeGreaterThanOrEqual(20);
    expect(layout.leaves.length).toBeGreaterThanOrEqual(50);
    expect(new Set(layout.fallen.map((q) => q.kind)).size).toBe(3);
    expect(layout.junk).toEqual([]);
    expect(layout.posters).toEqual([]);
    expect(layout.neon).toEqual([]);
    // Every piece of it is drawn, so none of it is a stray data row.
    expect(layout.puddles.length).toBeGreaterThan(10);
  });

  it('keeps every fallen piece low, on the ground, out of the way and out of the bushes', () => {
    const spots = clearSpots(WOODLAND);
    expect(layout.fallen.length).toBeLessThanOrEqual(DRESSING.junk.max);
    for (const q of layout.fallen) {
      const where = `${q.kind} at ${q.x.toFixed(2)}, ${q.z.toFixed(2)}`;
      expect(q.height, where).toBeLessThanOrEqual(DRESSING.junk.maxHeight);
      expect(WOODS.fallen.sink + q.out, where).toBeLessThanOrEqual(DRESSING.junk.reach);
      // Lying on the ground: no corner of its footprint floats over the terrain or sinks far into it.
      for (const c of fallenCorners(q)) {
        const g = ground(c.x, c.z);
        expect(c.y - g, `${where}: floating`).toBeLessThanOrEqual(0.02);
        expect(g - c.y, `${where}: buried`).toBeLessThanOrEqual(0.08);
      }
      // Clear of every lane, spawn, dead zone, the flag and the Extraction spots, and of every bush.
      const r = junkRect(q);
      expect(clearOfPlay(WOODLAND, r, spots), `${where}: clear of play`).toBe(true);
      const reach = Math.hypot(r[1] - r[0], r[3] - r[2]) / 2;
      for (const b of WOODLAND.foliage ?? []) expect(Math.hypot(b.x - q.x, b.z - q.z), `${where}: bush`).toBeGreaterThanOrEqual(b.radius + reach + WOODS.leaves.bushClear);
      // DRESSING.junk.openFront (1.6 m) of ground stays clear in front of it, so it narrows no passage: no block
      // stands in that strip at body height, and no other piece lies in it.
      const front = frontRect(q);
      expect(front[1] - front[0], where).toBeGreaterThan(0);
      expect(front[3] - front[2], where).toBeGreaterThan(0);
      expect(boxHitsBlock(WOODLAND.blocks, front, q.y + 0.05, q.y + BODY.height), `${where}: open in front`).toBe(false);
      for (const p of layout.fallen) {
        if (p === q) continue;
        const s = junkRect(p);
        expect(Math.max(s[0] - r[1], r[0] - s[1], s[2] - r[3], r[2] - s[3]), `${where}: apart from ${p.kind}`).toBeGreaterThanOrEqual(DRESSING.junk.gap);
        expect(Math.max(s[0] - front[1], front[0] - s[1], s[2] - front[3], front[2] - s[3]), `${where}: ${p.kind} in its front`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every part of a fallen piece inside its own footprint and height', () => {
    const box = new THREE.Box3();
    for (const q of layout.fallen) {
      box.makeEmpty();
      for (const { geo } of fallenParts(q)) {
        geo.computeBoundingBox();
        box.union(geo.boundingBox!);
        geo.dispose();
      }
      const where = `${q.kind}`;
      expect(box.max.y, where).toBeLessThanOrEqual(q.height + 1e-6);
      expect(box.min.y, where).toBeGreaterThanOrEqual(-WOODS.fallen.sink - 1e-6);
      expect(Math.max(-box.min.x, box.max.x), where).toBeLessThanOrEqual(q.along / 2 + 1e-6);
      expect(Math.max(-box.min.z, box.max.z), where).toBeLessThanOrEqual(q.out / 2 + 1e-6);
    }
  });

  it('puts every leaf drift on the ground, clear of the bushes and the fallen pieces', () => {
    for (const d of layout.leaves) {
      expect(terrainHeightAt(terrain, d.x, d.z)).toBeDefined();
      for (const b of WOODLAND.foliage ?? []) expect(Math.hypot(b.x - d.x, b.z - d.z)).toBeGreaterThanOrEqual(b.radius + WOODS.leaves.bushClear);
      for (const q of layout.fallen) expect(Math.hypot(q.x - d.x, q.z - d.z)).toBeGreaterThanOrEqual(WOODS.leaves.radius);
    }
  });

  it('keeps every puddle and mud patch at least 1.5 m from every spawn and Extraction insertion (a figure starts on clean ground)', () => {
    const starts = [...WOODLAND.spawns.flat(), ...(WOODLAND.extraction?.insertions ?? []).flatMap((i) => i.spawns)].map((s) => s.position);
    expect(starts.length).toBeGreaterThan(10);
    for (const p of layout.puddles) {
      for (const s of starts) {
        const dx = Math.max(p.x - p.width / 2 - s.x, 0, s.x - (p.x + p.width / 2));
        const dz = Math.max(p.z - p.depth / 2 - s.z, 0, s.z - (p.z + p.depth / 2));
        expect(Math.hypot(dx, dz), `puddle at ${p.x}, ${p.z} by the start at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('lays every puddle and mud patch on the ground, under no block', () => {
    for (const p of layout.puddles) {
      expect(p.draped).toBe(true);
      expect(Math.abs(p.y - ground(p.x, p.z))).toBeLessThan(0.5);
    }
    expect(layout.puddles.some((p) => p.mud)).toBe(true);
    expect(layout.puddles.some((p) => !p.mud)).toBe(true);
  });

  it('is deterministic: the same seed gives the same floor, another seed another', () => {
    expect(placeDressing(WOODLAND)).toEqual(layout);
    const other = placeDressing({ ...WOODLAND, dressing: { ...WOODLAND.dressing!, seed: WOODLAND.dressing!.seed + 1 } });
    expect(other.fallen).not.toEqual(layout.fallen);
    expect(other.leaves).not.toEqual(layout.leaves);
  });
});
