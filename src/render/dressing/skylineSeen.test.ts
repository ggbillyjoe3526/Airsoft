import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { MapBlock, MapData, SkylinePiece } from '../../map/mapTypes';
import { DEPOT } from '../../map/depot';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { skylineGeometries } from './skyline';

/**
 * MS1 (owner, 2026-10-16: "if the player will never see it, remove it"): every piece of a walled map's skyline is seen
 * from somewhere a player stands, over the field's walls and past the nearer pieces; and the look-only fixtures hung
 * inside the field (Neon Heights' wall units and cables, which nothing collides with) keep out of the room a player
 * takes up on any floor, so none of them reads as cover a BB goes through.
 */

/** Eye height over a lane point, a spawn or a raised floor; the room a player takes up over a floor. */
const EYE = 1.7;
const ROOM = 2.2;
/** A floor's edge (m) a cable's end may touch where it is tied to the wall over it. */
const EDGE = 0.05;
/** Points on a piece looked for: a 3 × 3 grid on its footprint at these shares of its height. */
const SHARES = [1, 0.75, 0.5];
/** Occluding pieces are shrunk this much (m) on every side: a ray along a face isn't hidden by it. */
const SHRINK = 0.3;

interface Box {
  lo: [number, number, number];
  hi: [number, number, number];
}

const blockBox = (b: MapBlock): Box => ({
  lo: [b.center.x - b.size.x / 2, b.center.y - b.size.y / 2, b.center.z - b.size.z / 2],
  hi: [b.center.x + b.size.x / 2, b.center.y + b.size.y / 2, b.center.z + b.size.z / 2],
});

/** Whether the ray from `o` along unit `d` meets `b` within `len`. */
function meets(o: readonly number[], d: readonly number[], len: number, b: Box): boolean {
  let t0 = 0;
  let t1 = len;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-9) {
      if (o[i]! < b.lo[i]! || o[i]! > b.hi[i]!) return false;
      continue;
    }
    let a = (b.lo[i]! - o[i]!) / d[i]!;
    let c = (b.hi[i]! - o[i]!) / d[i]!;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

/** A piece that stands on the ground with a footprint: towers, sheds, silos, container stacks. */
type Standing = Extract<SkylinePiece, { width: number; depth: number; height: number; x: number; z: number }>;
const standing = (p: SkylinePiece): p is Standing => p.kind === 'tower' || p.kind === 'shed' || p.kind === 'silo' || p.kind === 'containers';
const footprint = (p: Standing): [number, number] => ('turned' in p && p.turned ? [p.depth, p.width] : [p.width, p.depth]);

/** A standing piece as an occluder: its footprint, up to its setback where it has one. */
function occluder(p: Standing): Box {
  const [w, d] = footprint(p);
  const top = p.kind === 'tower' && p.setback ? p.base + (p.height - p.base) * p.setback.at : p.height;
  return { lo: [p.x - w / 2 + SHRINK, 0, p.z - d / 2 + SHRINK], hi: [p.x + w / 2 - SHRINK, top - SHRINK, p.z + d / 2 - SHRINK] };
}

const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const floors = (map: MapData): MapBlock[] => map.blocks.filter((b) => b.kind === 'floor' || b.kind === 'ramp');

/** Where a player's eyes can be: over each lane point, each spawn, and a grid on each raised floor. */
function eyes(map: MapData): number[][] {
  const out: number[][] = [];
  for (const lane of map.lanes) for (const p of lane) out.push([p.x, p.y + EYE, p.z]);
  for (const end of map.spawns) for (const s of end) out.push([s.position.x, s.position.y + EYE, s.position.z]);
  for (const b of floors(map)) {
    if (top(b) < 0.5) continue;
    for (const fx of [-0.4, 0, 0.4]) for (const fz of [-0.4, 0, 0.4]) out.push([b.center.x + fx * b.size.x, top(b) + EYE, b.center.z + fz * b.size.z]);
  }
  return out;
}

/** The standing pieces of `map`'s skyline that no eye sees any of. */
function unseen(map: MapData): string[] {
  const sky = map.dressing?.skyline ?? [];
  const from = eyes(map);
  const walls = map.blocks.filter((b) => b.kind !== 'floor').map(blockBox);
  const out: string[] = [];
  sky.forEach((p, i) => {
    if (!standing(p)) return;
    const others = [...walls, ...sky.flatMap((q, j) => (j !== i && standing(q) ? [occluder(q)] : []))];
    const [w, d] = footprint(p);
    const seen = [-0.5, 0, 0.5].some((fx) =>
      [-0.5, 0, 0.5].some((fz) =>
        SHARES.some((fy) => {
          const q = [p.x + fx * w, p.height * fy, p.z + fz * d];
          return from.some((e) => {
            const v = [q[0]! - e[0]!, q[1]! - e[1]!, q[2]! - e[2]!];
            const len = Math.hypot(v[0]!, v[1]!, v[2]!);
            const u = v.map((c) => c / len);
            return !others.some((b) => meets(e, u, len - 0.5, b));
          });
        }),
      ),
    );
    if (!seen) out.push(`${p.kind} ${i} at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
  });
  return out;
}

describe('MS1: nothing in a walled map’s skyline is out of every player’s sight', () => {
  it.each([
    ['Depot', DEPOT],
    ['Neon Heights', NEON_HEIGHTS],
  ] as const)('%s: every standing piece is seen from a lane, a spawn or a raised floor', { timeout: 30_000 }, (_, map) => {
    expect(map.dressing!.skyline!.filter(standing).length).toBeGreaterThan(15);
    expect(unseen(map)).toEqual([]);
  });

  it('control: a tower hidden right behind another is caught', () => {
    const sky = NEON_HEIGHTS.dressing!.skyline!;
    // A low, narrow tower just behind (further out than) a first-row tower beside the field.
    const near = sky.find((p): p is Standing => p.kind === 'tower' && Math.abs(p.x) > Math.abs(p.z) && Math.abs(p.x) < 40)!;
    const lower = occluder(near).hi[1];
    const hidden: SkylinePiece = { kind: 'tower', x: near.x + Math.sign(near.x) * (near.width / 2 + 3), z: near.z, width: 4, depth: 4, height: lower * 0.5, base: 0 };
    const map = { ...NEON_HEIGHTS, dressing: { ...NEON_HEIGHTS.dressing!, skyline: [...sky, hidden] } };
    expect(unseen(map)).toEqual([`tower ${sky.length} at ${hidden.x.toFixed(0)}, ${hidden.z.toFixed(0)}`]);
  });
});

describe('MS1: Neon Heights’ wall units and cables keep out of every player’s room', () => {
  /** The pieces of `kinds` whose drawn shape comes into the room over any floor or ramp. */
  function inRoom(kinds: readonly SkylinePiece['kind'][]): string[] {
    const out: string[] = [];
    for (const p of NEON_HEIGHTS.dressing!.skyline!) {
      if (!kinds.includes(p.kind)) continue;
      const pts: THREE.Vector3[] = [];
      for (const g of skylineGeometries([p], { x: 0, z: 0 })) {
        const pos = g.getAttribute('position');
        for (let k = 0; k < pos.count; k++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, k));
        g.dispose();
      }
      const hit = floors(NEON_HEIGHTS).find((b) => {
        const box = blockBox(b);
        return pts.some((v) => v.x > box.lo[0] + EDGE && v.x < box.hi[0] - EDGE && v.z > box.lo[2] + EDGE && v.z < box.hi[2] - EDGE && v.y > top(b) && v.y < top(b) + ROOM);
      });
      const at = p.kind === 'wallUnit' ? `${p.x}, ${p.y}, ${p.z}` : p.kind === 'wire' ? `${p.points[0]!.x}, ${p.y}, ${p.points[0]!.z}` : p.kind;
      if (hit) out.push(`${p.kind} ${at} over the ${hit.kind} at ${top(hit)}`);
    }
    return out;
  }

  it('has dozens of wall units and a run of cables, and none of them in a player’s room', () => {
    const sky = NEON_HEIGHTS.dressing!.skyline!;
    expect(sky.filter((p) => p.kind === 'wallUnit').length).toBeGreaterThan(30);
    expect(sky.filter((p) => p.kind === 'wire').length).toBeGreaterThanOrEqual(8);
    const found = inRoom(['wallUnit', 'wire']);
    expect(found, found.join('\n')).toEqual([]);
  });
});
