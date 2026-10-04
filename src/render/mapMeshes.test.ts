import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { vec3 } from '../sim/vec';
import { blockTint } from './mapMeshes';

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
