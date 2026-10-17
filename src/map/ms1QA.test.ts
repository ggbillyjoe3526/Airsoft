import { describe, expect, it } from "vitest";
import { VAULT_WALL_HEIGHT } from "../config/vault";
import { BODY } from "../config/movement";
import { neonPlate } from "../render/dressing/neonDressing";
import { resolveLighting } from "../render/light/lightingPreset";
import { LIGHTING_PRESETS } from "../config/renderLighting";
import type { MapBlock, NeonSign } from "./mapTypes";
import { NEON_HEIGHTS } from "./neonHeights";
import { WOODLAND, WOODLAND_LAYOUT } from "./woodland";

/**
 * MS1 QA (acceptances 3 and 4): what src/render/dressing/skylineSeen.test.ts and the placement tests do not pin. The cabin's roof
 * closes the cabin; Woodland's bushes stay small and out of the way; Woodland's night is brighter than the preset;
 * no two Neon Heights signs overlap.
 */

const hx = WOODLAND_LAYOUT.halfX;
const hz = WOODLAND_LAYOUT.halfZ;
// The cabin, plan x 62..70.4 and z 18..26.4 (src/map/woodland.ts), in world coordinates (with a metre of slack).
const X0 = 62 - hx - 1;
const X1 = 70.4 - hx + 1;
const Z0 = hz - 26.4 - 1;
const Z1 = hz - 18 + 1;
const inCabin = (b: MapBlock): boolean =>
  b.center.x > X0 && b.center.x < X1 && b.center.z > Z0 && b.center.z < Z1;
const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;

const cabinBlocks = WOODLAND.blocks.filter(inCabin);
const roof = cabinBlocks.filter(
  (b) => b.kind === "ramp" && b.paint === 0x5d5a52,
);
const walls = cabinBlocks.filter((b) => b.kind === "log");

describe("MS1 Woodland: the cabin has a roof that closes it (acceptance 3)", () => {
  it("has a roof of two ramps meeting at a ridge, rising from the outside edges", () => {
    expect(roof).toHaveLength(2);
    expect(roof.map((r) => r.rise).sort()).toEqual(["+z", "-z"]);
    expect(roof[0]!.surface).toBe("metal");
    // The halves meet: one ends where the other starts.
    const [a, b] = [...roof].sort((p, q) => p.center.z - q.center.z);
    expect(a!.center.z + a!.size.z / 2).toBeCloseTo(
      b!.center.z - b!.size.z / 2,
      6,
    );
  });

  it("starts exactly at the highest wall top: no gap between the wall tops and the roof, no overlap into the walls", () => {
    const wallTop = Math.max(...walls.map(top));
    for (const r of roof) expect(bottom(r)).toBeCloseTo(wallTop, 6);
  });

  it("covers every wall in plan, so no wall top shows past the eaves", () => {
    for (const w of walls) {
      const lo = Math.min(...roof.map((r) => r.center.x - r.size.x / 2));
      const hi = Math.max(...roof.map((r) => r.center.x + r.size.x / 2));
      const zl = Math.min(...roof.map((r) => r.center.z - r.size.z / 2));
      const zh = Math.max(...roof.map((r) => r.center.z + r.size.z / 2));
      expect(w.center.x - w.size.x / 2).toBeGreaterThanOrEqual(lo);
      expect(w.center.x + w.size.x / 2).toBeLessThanOrEqual(hi);
      expect(w.center.z - w.size.z / 2).toBeGreaterThanOrEqual(zl);
      expect(w.center.z + w.size.z / 2).toBeLessThanOrEqual(zh);
    }
  });

  it("keeps every full-height wall at one level (the walls meet the roof evenly), 3 m over its floor", () => {
    const tall = walls.filter((w) => w.size.y > 2);
    const tops = tall.map(top);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1e-6);
  });

  it("leaves the west wall vaultable under the roof: the vault block is low and a standing body clears the roof over it", () => {
    const low = walls.filter(
      (w) =>
        w.size.y <= VAULT_WALL_HEIGHT + 0.5 && w.size.z > 1.5 && w.size.x < 0.6,
    );
    expect(low.length).toBeGreaterThan(0);
    const roofBase = Math.min(...roof.map(bottom));
    for (const w of low) {
      const h = w.size.y;
      expect(h).toBeGreaterThanOrEqual(VAULT_WALL_HEIGHT - 0.2);
      // Its top plus a body's height (a vaulter's head) stays under the roof's underside.
      expect(top(w) + BODY.height).toBeLessThanOrEqual(roofBase + 0.8);
      expect(top(w) + BODY.height * 0.6).toBeLessThan(roofBase);
    }
  });

  it("lights the cabin: lanterns inside the cabin footprint, beyond the old three", () => {
    const inside = (WOODLAND.lights ?? []).filter(
      (l) =>
        l.position.x > X0 &&
        l.position.x < X1 &&
        l.position.z > Z0 &&
        l.position.z < Z1,
    );
    expect(inside.length).toBeGreaterThanOrEqual(2);
    for (const l of inside) expect(l.kind).toBe("lantern");
  });
});

describe("MS1 Woodland: bushes are small and decorative (owner, 2026-10-16)", () => {
  const bushes = WOODLAND.foliage ?? [];

  it("keeps every bush under 1.3 m tall and 0.9 m in radius, and none taller than a standing body hides", () => {
    expect(bushes.length).toBeGreaterThan(30);
    for (const b of bushes) {
      expect(b.height).toBeLessThanOrEqual(1.3);
      expect(b.radius).toBeLessThanOrEqual(0.9);
      expect(b.height).toBeLessThan(BODY.height * 0.75);
    }
  });

  it("never narrows a lane: every lane point has no bush within a body radius of the bush edge", () => {
    for (const lane of WOODLAND.lanes) {
      for (const p of lane) {
        for (const b of bushes)
          expect(
            Math.hypot(b.x - p.x, b.z - p.z),
            `bush at ${b.x},${b.z}`,
          ).toBeGreaterThan(b.radius + BODY.radius);
      }
    }
  });

  it("keeps bushes off every spawn point", () => {
    for (const end of WOODLAND.spawns) {
      for (const s of end)
        for (const b of bushes)
          expect(
            Math.hypot(b.x - s.position.x, b.z - s.position.z),
          ).toBeGreaterThan(b.radius + BODY.radius);
    }
  });
});

describe("MS1 Woodland: the night is brighter than the preset (owner: 'less dark')", () => {
  it("lights Woodland's night above the stock night preset in the hemisphere fill, the moon and the exposure", () => {
    const stock = LIGHTING_PRESETS.night;
    const mine = resolveLighting(WOODLAND, "night");
    expect(mine.night).toBe(true);
    expect(mine.hemi.intensity).toBeGreaterThan(stock.hemi.intensity);
    expect(mine.key.intensity).toBeGreaterThan(stock.key.intensity);
    expect(mine.exposureScale).toBeGreaterThan(stock.exposureScale);
  });

  it("is a Woodland-only change: the stock preset and Neon Heights keep theirs", () => {
    const stock = LIGHTING_PRESETS.night;
    const neon = resolveLighting(NEON_HEIGHTS, "night");
    expect(neon.hemi.intensity).toBe(stock.hemi.intensity);
    expect(neon.exposureScale).toBe(stock.exposureScale);
    expect(stock.hemi.intensity).toBe(1);
    expect(stock.exposureScale).toBe(1.3);
  });

  it("keeps the rest of the night look (sky, fog, colours) from the preset", () => {
    const stock = LIGHTING_PRESETS.night;
    const mine = resolveLighting(WOODLAND, "night");
    expect(mine.sky).toEqual(stock.sky);
    expect(mine.fog).toEqual(stock.fog);
    expect(mine.hemi.sky).toBe(stock.hemi.sky);
  });
});

describe("MS1 Neon Heights: signs do not overlap (acceptance 4)", () => {
  const signs = NEON_HEIGHTS.dressing!.neon ?? [];

  /** A sign's plate as a box: its plane's offset on the facing axis, and extents along the wall and up. */
  function plate(s: NeonSign): {
    axis: 0 | 2;
    sign: number;
    off: number;
    a0: number;
    a1: number;
    y0: number;
    y1: number;
  } {
    const [w, h] = neonPlate(s);
    const axis: 0 | 2 = s.facing.endsWith("x") ? 0 : 2;
    const along = axis === 0 ? s.centre.z : s.centre.x;
    return {
      axis,
      sign: s.facing.startsWith("+") ? 1 : -1,
      off: axis === 0 ? s.centre.x : s.centre.z,
      a0: along - w / 2,
      a1: along + w / 2,
      y0: s.centre.y - h / 2,
      y1: s.centre.y + h / 2,
    };
  }

  it("has many more signs than before the change", () => {
    expect(signs.length).toBeGreaterThanOrEqual(35);
  });

  it("puts no two plates on the same wall plane over each other (a hand of margin: 5 cm)", () => {
    const clash = (all: readonly NeonSign[]): string[] => {
      const ps = all.map(plate);
      const clashes: string[] = [];
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const p = ps[i]!;
          const q = ps[j]!;
          if (p.axis !== q.axis || Math.abs(p.off - q.off) > 0.5) continue;
          // Facing opposite ways on nearly the same plane means walls of two sides: still not one over the other.
          if (p.sign !== q.sign) continue;
          const overlapA = Math.min(p.a1, q.a1) - Math.max(p.a0, q.a0);
          const overlapY = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
          if (overlapA > -0.05 && overlapY > -0.05)
            clashes.push(
              `${all[i]!.text ?? all[i]!.emblem} / ${all[j]!.text ?? all[j]!.emblem}`,
            );
        }
      }
      return clashes;
    };
    // Control: the checker sees a sign hung over another.
    expect(
      clash([
        signs[0]!,
        {
          ...signs[0]!,
          centre: { ...signs[0]!.centre, y: signs[0]!.centre.y + 0.1 },
        },
      ]),
    ).toHaveLength(1);
    expect(clash(signs)).toEqual([]);
  });

  it("keeps every sign above head height and under the walls", () => {
    for (const s of signs) {
      const [, h] = neonPlate(s);
      expect(s.centre.y - h / 2, s.text ?? s.emblem).toBeGreaterThan(
        BODY.height,
      );
    }
  });
});
