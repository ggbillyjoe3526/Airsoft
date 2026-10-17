import * as THREE from 'three';
import { SURFACES } from '../../../config/render';
import type { MapBlock } from '../../../map/mapTypes';
import { blockHash } from './blockStyles';
import { add, axes, boundsOf, type Piece, shade, span } from './pieceKit';
import { palletPieces } from './sitePieces';

/** The site props as pieces (M25b, A8): toilets, racks, gabions, wrapped pallets, IBCs, sandbags, generators, skips. */

const PALLET = SURFACES.pallet;
const PROP = SURFACES.siteProps;
const DETAIL = SURFACES.propDetail;

/** A portable toilet: moulded shell on a dark skid, a pale roof, and its door (with a latch) on the side the hash picks. */
export function toiletPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const p = PROP.toilet;
  const dark = shade(color, 0.45);
  add(out, [b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1] + p.skid, b.max[2]], 'barrier', dark);
  add(out, [b.min[0] + p.inset, b.min[1] + p.skid, b.min[2] + p.inset], [b.max[0] - p.inset, b.max[1] - p.roof, b.max[2] - p.inset], 'barrier', color);
  add(out, [b.min[0], b.max[1] - p.roof, b.min[2]], [b.max[0], b.max[1], b.max[2]], 'barrier', new THREE.Color(PROP.paleRoof), false);
  // The door: a panel standing proud of the shell, on one of the four sides.
  const side = blockHash(block) % 4;
  const along: 0 | 2 = side < 2 ? 2 : 0;
  const normal = along === 0 ? 2 : 0;
  const mid = (b.min[along] + b.max[along]) / 2;
  // Depths into the block from its face on that side: the latch stands proud of the door, the door of the shell.
  const outer = side % 2 === 0 ? b.min[normal] : b.max[normal];
  const dir = side % 2 === 0 ? 1 : -1;
  const depth = (d0: number, d1: number): [number, number] => [Math.min(outer + dir * d0, outer + dir * d1), Math.max(outer + dir * d0, outer + dir * d1)];
  const y0 = b.min[1] + p.skid;
  const [dMin, dMax] = span(along, mid - p.doorWidth / 2, mid + p.doorWidth / 2, ...depth(p.latchDepth, p.inset), y0, y0 + p.doorHeight);
  add(out, dMin, dMax, 'barrier', shade(color, 0.86));
  const latchAt = mid + p.doorWidth / 2 - p.latchFromEdge;
  const [lMin, lMax] = span(along, latchAt - p.latchSize / 2, latchAt + p.latchSize / 2, ...depth(0, p.latchDepth), y0 + p.latchY[0], y0 + p.latchY[1]);
  add(out, lMin, lMax, 'barrier', new THREE.Color(PROP.latch), false);
}

/**
 * Pallet racking (or shelving indoors): steel uprights at every bay, a mesh spine down the middle, a shelf deck at
 * crate height and beams top and bottom. Every bay is stocked on both sides of the spine on both levels (cardboard
 * boxes or film-wrapped stock), and the spine fills the gaps between loads, so it reads as the solid cover it is.
 */
export function rackPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const r = PROP.rack;
  const [along, across] = axes(block);
  const bays = Math.max(1, Math.round(block.size[along === 0 ? 'x' : 'z'] / r.bay));
  const bayLen = (b.max[along] - b.min[along]) / bays;
  const beam = shade(color, 0.7);
  const deckY = b.min[1] + (b.max[1] - b.min[1]) / 2;
  const mid = (b.min[across] + b.max[across]) / 2;
  // Uprights at every bay boundary, front and back.
  for (let i = 0; i <= bays; i++) {
    const at = Math.min(Math.max(b.min[along] + i * bayLen - r.post / 2, b.min[along]), b.max[along] - r.post);
    for (const c of [b.min[across], b.max[across] - r.post]) {
      const [min, max] = span(along, at, at + r.post, c, c + r.post, b.min[1], b.max[1]);
      add(out, min, max, 'barrier', color);
    }
  }
  // Beams along the front and back at the bottom, the deck and the top, between the end uprights and set into them
  // (no face shared with an upright); the deck and the spine inside the uprights.
  const inner = [b.min[along] + r.post, b.max[along] - r.post] as const;
  for (const y of [b.min[1], deckY, b.max[1] - r.beam - r.beamSet]) {
    for (const c of [b.min[across] + r.beamSet, b.max[across] - r.post + r.beamSet]) {
      const [min, max] = span(along, inner[0], inner[1], c, c + r.post - 2 * r.beamSet, y, y + r.beam);
      add(out, min, max, 'barrier', beam, false);
    }
  }
  // The deck runs out to the beams' backs, leaving no slit between them.
  const [dMin, dMax] = span(along, inner[0], inner[1], b.min[across] + r.post - r.beamSet, b.max[across] - r.post + r.beamSet, deckY, deckY + r.beam);
  add(out, dMin, dMax, 'steelPlate', beam, false);
  const [sMin, sMax] = span(along, inner[0], inner[1], mid - r.spine / 2, mid + r.spine / 2, b.min[1] + r.beam, b.max[1] - r.beam);
  add(out, sMin, sMax, 'steelPlate', shade(color, 0.55), false);
  // The stock: per bay, level and side of the spine, a film-wrapped load or two cardboard boxes of different heights.
  const levels: [number, number][] = [
    [b.min[1] + r.beam, deckY],
    [deckY + r.beam, b.max[1] - r.beam],
  ];
  const sides: [number, number][] = [
    [b.min[across] + r.loadInset, mid - r.spine / 2],
    [mid + r.spine / 2, b.max[across] - r.loadInset],
  ];
  const cardboard = new THREE.Color(PROP.cardboard);
  const film = new THREE.Color(PROP.film);
  let bits = blockHash(block);
  for (let i = 0; i < bays; i++) {
    const a0 = b.min[along] + i * bayLen + r.post;
    const a1 = b.min[along] + (i + 1) * bayLen - r.post;
    for (const [y0, y1] of levels) {
      for (const [c0, c1] of sides) {
        const pick = bits & 3;
        bits = (bits >>> 2) | (pick << 30);
        if (pick === 0) {
          const [min, max] = span(along, a0, a1, c0, c1, y0, y1 - r.headroom);
          add(out, min, max, 'barrier', film, false);
          continue;
        }
        // Two boxes side by side, the second shorter.
        const split = a0 + (a1 - a0) * (pick === 1 ? 0.5 : 0.58);
        for (const [f0, f1, h] of [
          [a0, split - r.boxGap / 2, 1],
          [split + r.boxGap / 2, a1, r.shortBoxes[pick === 3 ? 1 : 0]],
        ] as const) {
          const [min, max] = span(along, f0, f1, c0, c1, y0, y0 + (y1 - r.headroom - y0) * h);
          add(out, min, max, 'barrier', shade(cardboard, h === 1 ? 1 : 0.92), false);
        }
      }
    }
  }
}

/** A gabion: grey rubble behind galvanised wire mesh (G6: never sand), the rubble heaped a little at the top. */
export function gabionPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const h = PROP.gabion;
  add(out, b.min, [b.max[0], b.max[1] - h.topDrop, b.max[2]], 'gabion', color);
  add(out, [b.min[0] + h.topInset, b.max[1] - h.topDrop, b.min[2] + h.topInset], [b.max[0] - h.topInset, b.max[1], b.max[2] - h.topInset], 'gabion', shade(color, h.topShade), false);
}

/** A pallet load shrink-wrapped in film, on its pallet, with two straps round it. */
export function wrappedPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  palletPieces(block, new THREE.Color(PROP.palletWood), out, detail, { texture: 'barrier', uv: 'world', color, topGap: PROP.strapThickness });
  const strap = new THREE.Color(PROP.strap);
  const [along, across] = axes(block);
  for (const t of [0.3, 0.7]) {
    const at = b.min[along] + t * (b.max[along] - b.min[along]);
    const [min, max] = span(along, at - PROP.strapWidth / 2, at + PROP.strapWidth / 2, b.min[across], b.max[across], b.min[1] + PALLET.height, b.max[1]);
    // The film is set in from the block's sides and top, so the strap over it stands proud of it everywhere.
    add(out, min, max, 'barrier', strap, false);
  }
}

/** An IBC water tank: a white tank in a steel cage on a steel base, with a lid on top. */
export function ibcPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const c = PROP.ibc;
  const steel = new THREE.Color(PROP.cageSteel);
  add(out, b.min, [b.max[0], b.min[1] + c.base, b.max[2]], 'barrier', shade(steel, 0.6));
  add(out, [b.min[0] + c.inset, b.min[1] + c.base, b.min[2] + c.inset], [b.max[0] - c.inset, b.max[1] - c.inset, b.max[2] - c.inset], 'barrier', color, false);
  // The cage: rails round each side at three heights, and four bars up each side.
  const t = c.bar;
  for (const y of [b.min[1] + c.base, (b.min[1] + b.max[1]) / 2, b.max[1] - t]) {
    for (const along of [0, 2] as const) {
      const across = along === 0 ? 2 : 0;
      for (const at of [b.min[across], b.max[across] - t]) {
        const [min, max] = span(along, b.min[along], b.max[along], at, at + t, y, y + t);
        add(out, min, max, 'barrier', steel, false);
      }
    }
  }
  for (const along of [0, 2] as const) {
    const across = along === 0 ? 2 : 0;
    for (let k = 0; k <= 3; k++) {
      const x = b.min[along] + (k / 3) * (b.max[along] - b.min[along] - t);
      for (const at of [b.min[across], b.max[across] - t]) {
        const [min, max] = span(along, x, x + t, at, at + t, b.min[1] + c.base, b.max[1]);
        add(out, min, max, 'barrier', steel, false);
      }
    }
  }
  const mx = (b.min[0] + b.max[0]) / 2;
  const mz = (b.min[2] + b.max[2]) / 2;
  add(out, [mx - c.lid, b.max[1] - c.inset, mz - c.lid], [mx + c.lid, b.max[1], mz + c.lid], 'barrier', new THREE.Color(PROP.latch), false);
}

/** Sandbags: courses of bags, every other one set back a little, the top one more, so the wall reads as laid by hand. */
export function sandbagPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const courses = Math.max(1, Math.round(block.size.y / PROP.sandbags.course));
  const h = block.size.y / courses;
  for (let k = 0; k < courses; k++) {
    const inset = k === courses - 1 ? PROP.sandbags.topInset : (k % 2) * PROP.sandbags.inset;
    add(out, [b.min[0] + inset, b.min[1] + k * h, b.min[2] + inset], [b.max[0] - inset, b.min[1] + (k + 1) * h, b.max[2] - inset], 'sandbag', color, k === 0);
  }
}

/** A site generator: a painted canopy on a dark skid, with louvred panels down its sides and a control panel. */
export function generatorPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  const g = PROP.generator;
  const dark = shade(color, 0.4);
  // Map detail: a fuel cap stands on the canopy, which is lowered by its height to keep it inside the block.
  const cap = detail ? DETAIL.fuelCap : null;
  const canopyTop = b.max[1] - (cap?.height ?? 0);
  add(out, b.min, [b.max[0], b.min[1] + g.skid, b.max[2]], 'barrier', dark);
  add(out, [b.min[0] + g.inset, b.min[1] + g.skid, b.min[2] + g.inset], [b.max[0] - g.inset, canopyTop, b.max[2] - g.inset], 'barrier', color);
  const [along, across] = axes(block);
  if (cap) {
    const at = b.min[along] + (b.max[along] - b.min[along]) * 0.25;
    const mid = (b.min[across] + b.max[across]) / 2;
    const [min, max] = span(along, at - cap.size / 2, at + cap.size / 2, mid - cap.size / 2, mid + cap.size / 2, canopyTop, b.max[1]);
    add(out, min, max, 'barrier', new THREE.Color(PROP.latch), false);
  }
  const louvre = shade(color, 0.6);
  for (const at of [b.min[across], b.max[across] - g.inset]) {
    for (let k = 0; k < g.louvres; k++) {
      const y = b.min[1] + g.skid + g.louvreFrom + k * g.louvreStep;
      const [min, max] = span(along, b.min[along] + g.louvreEnd, b.max[along] - g.louvreEnd, at, at + g.inset, y, y + g.louvreHeight);
      add(out, min, max, 'barrier', louvre, false);
    }
  }
  const centre = (b.min[across] + b.max[across]) / 2;
  const [pMin, pMax] = span(along, b.max[along] - g.inset, b.max[along], centre - g.panelWidth / 2, centre + g.panelWidth / 2, b.min[1] + g.panelY[0], b.min[1] + g.panelY[1]);
  add(out, pMin, pMax, 'barrier', new THREE.Color(PROP.latch), false);
}

/** A skip: a ribbed steel bin narrower at its foot, a rim round its open top, and rubble inside. */
export function skipPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  const s = PROP.skip;
  const [along, across] = axes(block);
  const foot = span(along, b.min[along] + s.footInset, b.max[along] - s.footInset, b.min[across] + s.footInset, b.max[across] - s.footInset, b.min[1], b.min[1] + s.foot);
  add(out, foot[0], foot[1], 'corrugated', shade(color, 0.8));
  const body = span(along, b.min[along] + s.inset, b.max[along] - s.inset, b.min[across] + s.inset, b.max[across] - s.inset, b.min[1] + s.foot, b.max[1] - s.rim);
  add(out, body[0], body[1], 'corrugated', color);
  const rim = shade(color, 0.75);
  const y0 = b.max[1] - s.rim;
  for (const [a0, a1, c0, c1] of [
    [b.min[along], b.max[along], b.min[across], b.min[across] + s.rimWidth],
    [b.min[along], b.max[along], b.max[across] - s.rimWidth, b.max[across]],
    [b.min[along], b.min[along] + s.rimWidth, b.min[across] + s.rimWidth, b.max[across] - s.rimWidth],
    [b.max[along] - s.rimWidth, b.max[along], b.min[across] + s.rimWidth, b.max[across] - s.rimWidth],
  ] as const) {
    const [min, max] = span(along, a0, a1, c0, c1, y0, b.max[1]);
    add(out, min, max, 'barrier', rim, false);
  }
  const [rMin, rMax] = span(along, b.min[along] + s.rimWidth, b.max[along] - s.rimWidth, b.min[across] + s.rimWidth, b.max[across] - s.rimWidth, y0, b.max[1] - s.rubbleDrop);
  add(out, rMin, rMax, 'concrete', new THREE.Color(PROP.rubble), false);
  if (!detail) return;
  // Map detail: a heap of broken blocks on the rubble, up to the rim's top (never above the block).
  const H = DETAIL.skipHeap;
  let bits = blockHash(block);
  const free = [b.max[along] - b.min[along] - 2 * s.rimWidth - H.size, b.max[across] - b.min[across] - 2 * s.rimWidth - H.size];
  for (let k = 0; k < H.blocks; k++) {
    const a0 = b.min[along] + s.rimWidth + ((bits & 255) / 255) * free[0]!;
    const c0 = b.min[across] + s.rimWidth + (((bits >>> 8) & 255) / 255) * free[1]!;
    const top = Math.min(b.max[1], b.max[1] - s.rubbleDrop + H.heap * (0.5 + ((bits >>> 16) & 127) / 254));
    bits = Math.imul(bits ^ (bits >>> 13), 0x5bd1e995) >>> 0;
    const [min, max] = span(along, a0, a0 + H.size, c0, c0 + H.size * 0.7, b.max[1] - s.rubbleDrop - H.heap, top);
    add(out, min, max, 'concrete', shade(new THREE.Color(PROP.rubble), 0.85 + 0.1 * k), false);
  }
}
