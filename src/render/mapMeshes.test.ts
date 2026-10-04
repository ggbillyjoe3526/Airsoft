import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { vec3 } from '../sim/vec';
import { SURFACES, type SurfaceTextureId } from '../config/render';
import { blockPieces, blockShade, blockTint, buildMapMeshes, disposeMapMeshes, setMapRelief } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';

/** Every team colour of every set (Settings → Accessibility, M18b). */
const TEAM_COLORS = Object.values(TEAM_COLOUR_SETS).flatMap((s) => s.figures);

/** A prop colour "reads as a team" if it's saturated and within this hue distance of a team colour. */
const TEAM_HUE_MARGIN_DEG = 20;
const TEAM_MIN_SATURATION = 0.3;

function hsl(hex: number): { h: number; s: number } {
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(out);
  return { h: out.h * 360, s: out.s };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('blockTint', () => {
  it('gives mirror twins the same colour, so a symmetric map looks symmetric', () => {
    for (const b of DEPOT.blocks) {
      const twin = { ...b, center: vec3(-b.center.x, b.center.y, b.center.z) };
      expect(blockTint(twin)).toBe(blockTint(b));
    }
  });

  it('never paints props in anything that reads as a team colour', () => {
    const teams = TEAM_COLORS.map(hsl);
    for (const b of DEPOT.blocks) {
      const tint = hsl(blockTint(b));
      if (tint.s < TEAM_MIN_SATURATION) continue;
      for (const t of teams) {
        expect(hueDistance(tint.h, t.h), `${b.kind} tint too close to a team colour`).toBeGreaterThan(TEAM_HUE_MARGIN_DEG);
      }
    }
  });

  it('the team-colour check catches near-team colours', () => {
    // Guard the guard: the old blue and orange prop tints must be flagged.
    for (const nearTeam of [0x3d6ea8, 0xf07c2a, 0x8c5b3e]) {
      const c = hsl(nearTeam);
      const flagged = c.s >= TEAM_MIN_SATURATION && TEAM_COLORS.map(hsl).some((t) => hueDistance(c.h, t.h) <= TEAM_HUE_MARGIN_DEG);
      expect(flagged).toBe(true);
    }
  });

  it('varies colours between props of the same kind', () => {
    const containerTints = new Set(DEPOT.blocks.filter((b) => b.kind === 'container').map(blockTint));
    expect(containerTints.size).toBeGreaterThan(1);
  });
});

describe('the art pass on the map (M14)', () => {
  /** Stand-in textures (canvases need a browser): only their world size matters to the geometry. */
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const EPS = 1e-9;

  it('draws every detail inside its own block, so what you see is exactly what collides', () => {
    for (const b of DEPOT.blocks) {
      if (b.kind === 'ramp') continue;
      for (const p of blockPieces(b, DEPOT.blocks)) {
        for (let axis = 0; axis < 3; axis++) {
          const key = (['x', 'y', 'z'] as const)[axis]!;
          expect(p.box.min[axis]!).toBeGreaterThanOrEqual(b.center[key] - b.size[key] / 2 - EPS);
          expect(p.box.max[axis]!).toBeLessThanOrEqual(b.center[key] + b.size[key] / 2 + EPS);
          expect(p.box.max[axis]!).toBeGreaterThan(p.box.min[axis]!);
        }
      }
    }
  });

  it('dresses props: container frames, wall copings, and a pallet under each crate that stands on the ground', () => {
    const container = DEPOT.blocks.find((b) => b.kind === 'container')!;
    expect(blockPieces(container, DEPOT.blocks).length).toBeGreaterThan(8);
    const wall = DEPOT.blocks.find((b) => b.kind === 'wall')!;
    expect(blockPieces(wall, DEPOT.blocks).map((p) => p.texture)).toEqual(['blockWall', 'concrete']);
    const crates = DEPOT.blocks.filter((b) => b.kind === 'crate');
    const under = (b: (typeof crates)[number]): boolean =>
      crates.some((o) => o !== b && Math.abs(o.center.x - b.center.x) < 0.01 && Math.abs(o.center.z - b.center.z) < 0.01 && Math.abs(o.center.y + o.size.y / 2 - (b.center.y - b.size.y / 2)) < 0.01);
    const onGround = crates.filter((b) => b.center.y - b.size.y / 2 < 0.05);
    const stacked = crates.filter(under);
    expect(onGround.length).toBeGreaterThan(0);
    expect(stacked.length).toBeGreaterThan(0);
    for (const b of onGround) expect(blockPieces(b, DEPOT.blocks).length).toBeGreaterThan(1);
    for (const b of stacked) expect(blockPieces(b, DEPOT.blocks)).toHaveLength(1);
  });

  it('builds the whole of Depot in a handful of draw calls', () => {
    const group = buildMapMeshes(DEPOT, textures, true);
    expect(group.children.length).toBeLessThanOrEqual(10);
    disposeMapMeshes(group);
  });

  it('varies brightness a little between props without changing their hue, the same for mirror twins', () => {
    for (const b of DEPOT.blocks) {
      const shade = blockShade(b);
      expect(shade).toBeGreaterThanOrEqual(1 - SURFACES.shadeJitter - EPS);
      expect(shade).toBeLessThanOrEqual(1);
      expect(blockShade({ ...b, center: vec3(-b.center.x, b.center.y, b.center.z) })).toBe(shade);
    }
    expect(new Set(DEPOT.blocks.map(blockShade)).size).toBeGreaterThan(5);
  });

  it('turns surface relief on and off on a built map', () => {
    const group = buildMapMeshes(DEPOT, textures, false);
    const materials = group.children.map((m) => (m as THREE.Mesh).material as THREE.MeshLambertMaterial);
    expect(materials.every((m) => m.bumpMap === null)).toBe(true);
    setMapRelief(group, true);
    expect(materials.every((m) => m.bumpMap === m.map)).toBe(true);
    disposeMapMeshes(group);
  });
});
