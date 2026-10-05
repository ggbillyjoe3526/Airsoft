import { describe, expect, it } from 'vitest';
import { AMBIENCES, type AmbienceId, AUDIO, type AmbientCallSpec } from '../config/audio';
import { BOTS } from '../config/bots';
import { SIM_DT } from '../config/sim';
import { GROUND_SURFACES, type GroundGrid, buildGroundGrid, groundAt } from '../map/groundSurfaces';
import type { MapBlock, MapData } from '../map/mapTypes';
import { MAPS } from '../map/maps';
import { RANGE_MAP } from '../map/range';
import { WOODLAND } from '../map/woodland';
import { resolveLighting } from '../render/lightingPreset';
import { vec3 } from '../sim/vec';
import { AmbientCalls } from './ambience';
import { surfaceUnder } from './soundMaterials';
import { soundscapeOf } from './soundscape';

/**
 * M33j QA: the woodland sounds, the edges the worker's tests (woodlandSound.test.ts, sfx.test.ts) leave open. Pure data
 * and synthesis; the match's nodes (lazy rendering, a match ending, switching maps) are in sfx.test.ts's M33j QA block.
 */

/** FNV-1a over a string: a short, exact fingerprint. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Every call `spec` makes over `seconds` of play, ticked at the simulation's rate round a fixed listener. */
function schedule(spec: AmbientCallSpec, seconds: number, seed?: number): { now: number; x: number; y: number; z: number }[] {
  const calls = seed === undefined ? new AmbientCalls(spec) : new AmbientCalls(spec, seed);
  const listener = vec3(3, 1.6, -4);
  const at = vec3();
  const out: { now: number; x: number; y: number; z: number }[] = [];
  for (let t = 0; t < Math.round(seconds / SIM_DT); t++) {
    const now = t * SIM_DT;
    if (calls.due(now, listener, at)) out.push({ now, x: at.x, y: at.y, z: at.z });
  }
  return out;
}

describe('M33j QA acceptance 3: footsteps read blocks first, then the ground grid', () => {
  /** A 20 × 20 m grid of gravel round the origin. */
  const gravel: GroundGrid = {
    minX: -10,
    minZ: -10,
    cell: 1,
    cols: 20,
    rows: 20,
    surface: new Uint8Array(400).fill(GROUND_SURFACES.indexOf('gravel')),
    underTrees: new Uint8Array(400),
  };
  const blocks: MapBlock[] = [
    // A plain floor (no surface: concrete) over x, z in [-2, 2], its top at y = 0.
    { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(4, 0.5, 4) },
    // A steel deck beside it, its top at y = 0.5.
    { kind: 'floor', center: vec3(5, 0.25, 0), size: vec3(2, 0.5, 2), surface: 'metal' },
    // A crate is no floor: standing on one still reads the ground (as before M33j, which read concrete for it).
    { kind: 'crate', center: vec3(-5, 0.5, 0), size: vec3(1, 1, 1) },
  ];

  it("plays a floor block's own surface over the ground grid under it", () => {
    expect(surfaceUnder(blocks, vec3(0, 0, 0), gravel)).toBe('concrete');
    expect(surfaceUnder(blocks, vec3(1.5, 0.1, -1.5), gravel)).toBe('concrete');
    expect(surfaceUnder(blocks, vec3(5, 0.5, 0), gravel)).toBe('metal');
  });

  it('falls to the ground grid off the blocks, and over a floor out of reach (a storey below)', () => {
    expect(surfaceUnder(blocks, vec3(8, 0, 8), gravel)).toBe('gravel');
    expect(surfaceUnder(blocks, vec3(0, 3, 0), gravel)).toBe('gravel');
    expect(surfaceUnder(blocks, vec3(-5, 1, 0), gravel)).toBe('gravel');
    // Without a grid, as before M33j: concrete.
    expect(surfaceUnder(blocks, vec3(8, 0, 8))).toBe('concrete');
  });

  it("reads the ground at the grid's edge past it (a step off the terrain's edge is never undefined)", () => {
    const grid = buildGroundGrid(WOODLAND)!;
    const far = 1000;
    for (const [x, z] of [[-far, -far], [far, -far], [-far, far], [far, far], [0, far], [far, 0]] as const) {
      const s = surfaceUnder(WOODLAND.blocks, vec3(x, 0, z), grid);
      expect(GROUND_SURFACES).toContain(s);
      const ex = Math.min(grid.minX + (grid.cols - 0.5) * grid.cell, Math.max(grid.minX + 0.5 * grid.cell, x));
      const ez = Math.min(grid.minZ + (grid.rows - 0.5) * grid.cell, Math.max(grid.minZ + 0.5 * grid.cell, z));
      expect(s, `${x}, ${z}`).toBe(groundAt(grid, ex, ez));
    }
  });

  it('takes, on every map, the grid the terrain is painted from (render/mapMeshes.ts: buildGroundGrid when the map has terrain)', () => {
    for (const entry of [...MAPS.map((m) => m.data), RANGE_MAP]) {
      const painted = entry.terrain ? buildGroundGrid(entry) : null;
      for (const night of [false, true]) expect(soundscapeOf(entry, night).ground).toEqual(painted);
    }
  });
});

describe('M33j QA acceptance 1: birds by day exactly as before, and none by night, on every field', () => {
  /** The yard's birds before M33j (audio/ambience.ts Birdsong, default seed), 600 s round (3, 1.6, -4): pinned from m33i. */
  const BIRDS_BEFORE = { fingerprint: '8c94282f', count: 44, first: { now: 18.75, x: -20.8628, y: 7, z: 19.8727 } };

  const pinned = (calls: { now: number; x: number; y: number; z: number }[]): string =>
    fingerprint(calls.map((c) => `${c.now.toFixed(4)}:${c.x.toFixed(4)},${c.y.toFixed(4)},${c.z.toFixed(4)}`).join('|'));

  it('sings every daytime ambience\'s birds at the times and places the yard\'s sang before M33j', () => {
    for (const id of Object.keys(AMBIENCES) as AmbienceId[]) {
      const call = AMBIENCES[id].day.call!;
      expect(call.cue, id).toBe('ambience.bird');
      expect(call.level, id).toEqual({ gain: 0.35, pitchSpread: 0.08 });
      const calls = schedule(call, 600);
      expect(calls.length, id).toBe(BIRDS_BEFORE.count);
      expect(calls[0]!.now, id).toBeCloseTo(BIRDS_BEFORE.first.now, 6);
      expect(calls[0]!.x, id).toBeCloseTo(BIRDS_BEFORE.first.x, 3);
      expect(pinned(calls), id).toBe(BIRDS_BEFORE.fingerprint);
    }
  });

  it('plays no bird and no daytime call under the night preset of any field, the range included', () => {
    for (const map of [...MAPS.map((m) => m.data), RANGE_MAP] as MapData[]) {
      const night = soundscapeOf(map, true);
      expect(night.ambience.call?.cue ?? 'none', map.name).not.toBe('ambience.bird');
      expect(night.cues, map.name).not.toContain('ambience.bird');
    }
    // The range plays as it resolves (day): its birds as on Depot.
    const range = resolveLighting(RANGE_MAP);
    expect(soundscapeOf(RANGE_MAP, range.night).ambience.call?.cue).toBe(range.night ? undefined : 'ambience.bird');
  });
});

describe('M33j QA acceptance 2: a distant owl now and then', () => {
  const owl = AMBIENCES.woods.night.call!;

  it('hoots every 25 to 60 s, 30 to 50 m off and up in the trees, over an hour of play', () => {
    const calls = schedule(owl, 3600);
    expect(calls.length).toBeGreaterThanOrEqual(Math.floor(3600 / 60) - 1);
    expect(calls.length).toBeLessThanOrEqual(Math.ceil(3600 / 25));
    expect(calls[0]!.now).toBeGreaterThanOrEqual(25 - SIM_DT);
    for (let i = 1; i < calls.length; i++) {
      const gap = calls[i]!.now - calls[i - 1]!.now;
      expect(gap).toBeGreaterThanOrEqual(25 - SIM_DT);
      expect(gap).toBeLessThanOrEqual(60 + SIM_DT);
    }
    for (const c of calls) {
      const d = Math.hypot(c.x - 3, c.z + 4);
      expect(d).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(d).toBeLessThanOrEqual(50 + 1e-9);
      expect(c.y).toBeGreaterThan(1.6);
    }
  });

  it("is timed from its own seed: never in step with the birds' (presentation only, never the simulation's RNG)", () => {
    expect(owl.seed).not.toBe(AUDIO.ambience.seed);
    expect(owl.level.gain).toBeLessThanOrEqual(AUDIO.levels.bird.gain);
  });
});

describe("M33j QA acceptance 3: bots' hearing unchanged (surface-blind)", () => {
  /** Every non-test source of the bots and the simulation, as text. */
  const sources: Record<string, string> = {
    ...import.meta.glob<string>(['../ai/**/*.ts', '!../ai/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob<string>(['../sim/**/*.ts', '!../sim/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }),
  };

  it('keeps the bots and the simulation away from the footstep surfaces, the soundscape and the ground grid', () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(20);
    for (const [f, text] of files) {
      // Static, side-effect and dynamic imports alike.
      const imports = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const i of imports) expect(i, f).not.toMatch(/\/audio\/|soundscape|soundMaterials|groundSurfaces/);
    }
  });

  it("keeps the bots' hearing distances and the footstep events' reach as they were", () => {
    expect([BOTS.hearingDistance, BOTS.hearingError, BOTS.hearingContactTime]).toEqual([22, 0.3, 2]);
    expect(AUDIO.footsteps.maxDistance).toBe(BOTS.hearingDistance);
  });
});
