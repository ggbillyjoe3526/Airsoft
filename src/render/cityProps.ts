import * as THREE from 'three';
import { CITY_PROPS, type SurfaceTextureId } from '../config/render';
import type { BlockKind, MapBlock, MapSign } from '../map/mapTypes';
import { vec3 } from '../sim/vec';
import type { Cuboid } from './cuboidMesh';
import type { Piece } from './mapMeshes';

/**
 * The city's props (M34f, BlockKind in map/mapTypes.ts): arcade cabinets, vending machines, stalls, planters, booths and
 * vans, built from boxes inside their block like the site props (render/mapMeshes.ts). Each is solid to its bounds: a
 * face is set in by at most CITY_PROPS.inset, and only where a panel (a screen, a window, a wheel) stands in front of
 * it, so what you see is what stops you and your BBs. Their screens and windows glow by Night (propSigns).
 */

const P = CITY_PROPS;

/** The city's prop kinds. */
export type CityPropKind = Extract<BlockKind, 'cabinet' | 'vending' | 'stall' | 'planter' | 'booth' | 'van'>;

const CITY_KINDS: ReadonlySet<BlockKind> = new Set<CityPropKind>(['cabinet', 'vending', 'stall', 'planter', 'booth', 'van']);

export function isCityProp(kind: BlockKind): kind is CityPropKind {
  return CITY_KINDS.has(kind);
}

/** The surface textures a city prop of `kind` is drawn with (render/mapMeshes.ts texturesFor). */
export function cityPropTextures(kind: CityPropKind): SurfaceTextureId[] {
  if (kind === 'stall' || kind === 'planter') return ['barrier', 'planks', 'plaster'];
  return ['barrier', 'glass'];
}

/** A block's bounds as min and max corners. */
function bounds(block: MapBlock): Cuboid {
  const { center: c, size: s } = block;
  return {
    min: [c.x - s.x / 2, c.y - s.y / 2, c.z - s.z / 2],
    max: [c.x + s.x / 2, c.y + s.y / 2, c.z + s.z / 2],
  };
}

/** The block's long horizontal axis (0 = x, 2 = z) and the one across it (x for a square block). */
function axes(block: MapBlock): [0 | 2, 0 | 2] {
  return block.size.x > block.size.z ? [0, 2] : [2, 0];
}

/** A box spanning `a0..a1` along `along`, `c0..c1` across it and `y0..y1` up. */
function span(along: 0 | 2, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number): Cuboid {
  return along === 0 ? { min: [a0, y0, c0], max: [a1, y1, c1] } : { min: [c0, y0, a0], max: [c1, y1, a1] };
}

const shade = (c: THREE.Color, k: number): THREE.Color => c.clone().multiplyScalar(k);
const srgb = (hex: number): THREE.Color => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);

/** The pieces of a city prop (its body in `color`, the block's paint or tint) into `out`. */
export function cityPropPieces(block: MapBlock & { kind: CityPropKind }, color: THREE.Color, out: Piece[]): void {
  const add = (box: Cuboid, texture: SurfaceTextureId, c: THREE.Color, grime = false): void => {
    out.push({ box, texture, uv: 'world', color: c, grime, castShadow: true });
  };
  const b = bounds(block);
  const [along, across] = axes(block);
  const y0 = b.min[1];
  const y1 = b.max[1];
  const h = y1 - y0;
  const a0 = b.min[along];
  const a1 = b.max[along];
  const c0 = b.min[across];
  const c1 = b.max[across];
  const i = P.inset;
  const dark = srgb(P.dark);
  switch (block.kind) {
    case 'cabinet': {
      // A plinth, the cabinets' body set in on both long faces, and per cabinet on each face a marquee, a screen and a
      // control deck standing out to the face, edged by the body's colour.
      const C = P.cabinet;
      add(span(along, a0, a1, c0, c1, y0, y0 + C.plinth), 'barrier', dark);
      add(span(along, a0, a1, c0 + i, c1 - i, y0 + C.plinth, y1), 'barrier', color, true);
      const n = Math.max(1, Math.round((a1 - a0) / C.width));
      const w = (a1 - a0) / n;
      for (let k = 0; k < n; k++) {
        const f0 = a0 + k * w + C.edge;
        const f1 = a0 + (k + 1) * w - C.edge;
        const hue = srgb(C.hues[(k + cabinetSeed(block)) % C.hues.length]!);
        for (const [d0, d1] of [
          [c0, c0 + i],
          [c1 - i, c1],
        ] as const) {
          add(span(along, f0, f1, d0, d1, y1 - C.marquee, y1 - C.edge / 2), 'barrier', hue);
          add(span(along, f0, f1, d0, d1, y0 + h * C.screen[0], y0 + h * C.screen[1]), 'glass', srgb(0xffffff));
          add(span(along, f0, f1, d0, d1, y0 + h * C.deck[0], y0 + h * C.deck[1]), 'barrier', dark);
        }
      }
      return;
    }
    case 'vending': {
      // The body set in on its long faces; on each, the product window, the dispenser slot and a lit header.
      const V = P.vending;
      add(span(along, a0, a1, c0 + i, c1 - i, y0, y1), 'barrier', color, true);
      const mid = (a0 + a1) / 2;
      const ww = ((a1 - a0) * V.windowShare) / 2;
      const sw = ((a1 - a0) * V.slotShare) / 2;
      for (const [d0, d1] of [
        [c0, c0 + i],
        [c1 - i, c1],
      ] as const) {
        add(span(along, mid - ww, mid + ww, d0, d1, y0 + h * V.window[0], y0 + h * V.window[1]), 'glass', srgb(0xffffff));
        add(span(along, mid - sw, mid + sw, d0, d1, y0 + h * V.slot[0], y0 + h * V.slot[1]), 'barrier', dark);
        add(span(along, a0, a1, d0, d1, y1 - V.header, y1), 'barrier', shade(color, 1.15));
      }
      return;
    }
    case 'stall': {
      // A timber counter, the goods behind it set in, and a striped awning over the whole stall.
      const S = P.stall;
      const top = y1 - S.awning;
      add(span(along, a0, a1, c0, c1, y0, y0 + S.counter), 'planks', srgb(S.wood), true);
      add(span(along, a0 + S.inset, a1 - S.inset, c0 + S.inset, c1 - S.inset, y0 + S.counter, top), 'plaster', srgb(S.goods));
      const n = Math.max(1, Math.round((a1 - a0) / S.stripe));
      const w = (a1 - a0) / n;
      for (let k = 0; k < n; k++) add(span(along, a0 + k * w, a0 + (k + 1) * w, c0, c1, top, y1), 'barrier', k % 2 === 0 ? color : srgb(S.stripeColour));
      return;
    }
    case 'planter': {
      // A timber box, its shrubs filling the top.
      const L = P.planter;
      add(span(along, a0, a1, c0, c1, y0, y1 - L.foliage), 'planks', color, true);
      add(span(along, a0 + L.inset, a1 - L.inset, c0 + L.inset, c1 - L.inset, y1 - L.foliage, y1), 'plaster', srgb(L.leaves));
      return;
    }
    case 'booth': {
      // A dark base, glass all round (a dark core behind it), a corner post at each corner, a sign band and a roof.
      const B = P.booth;
      const band = y1 - B.roof - B.band;
      add(
        {
          min: [b.min[0], y0, b.min[2]],
          max: [b.max[0], y0 + B.base, b.max[2]],
        },
        'barrier',
        dark,
      );
      add(
        {
          min: [b.min[0] + i, y0 + B.base, b.min[2] + i],
          max: [b.max[0] - i, band, b.max[2] - i],
        },
        'barrier',
        dark,
      );
      for (const [x0, x1] of [
        [b.min[0], b.min[0] + B.post],
        [b.max[0] - B.post, b.max[0]],
      ] as const) {
        for (const [z0, z1] of [
          [b.min[2], b.min[2] + B.post],
          [b.max[2] - B.post, b.max[2]],
        ] as const)
          add({ min: [x0, y0 + B.base, z0], max: [x1, band, z1] }, 'barrier', color);
      }
      // The glass on the four faces, between the posts.
      const px0 = b.min[0] + B.post;
      const px1 = b.max[0] - B.post;
      const pz0 = b.min[2] + B.post;
      const pz1 = b.max[2] - B.post;
      const glass = srgb(0xffffff);
      add({ min: [px0, y0 + B.base, b.min[2]], max: [px1, band, b.min[2] + i] }, 'glass', glass);
      add({ min: [px0, y0 + B.base, b.max[2] - i], max: [px1, band, b.max[2]] }, 'glass', glass);
      add({ min: [b.min[0], y0 + B.base, pz0], max: [b.min[0] + i, band, pz1] }, 'glass', glass);
      add({ min: [b.max[0] - i, y0 + B.base, pz0], max: [b.max[0], band, pz1] }, 'glass', glass);
      add(
        {
          min: [b.min[0], band, b.min[2]],
          max: [b.max[0], y1 - B.roof, b.max[2]],
        },
        'barrier',
        shade(color, 1.2),
      );
      add(
        {
          min: [b.min[0], y1 - B.roof, b.min[2]],
          max: [b.max[0], y1, b.max[2]],
        },
        'barrier',
        shade(color, 0.7),
      );
      return;
    }
    case 'van': {
      // A dark skirt set in under the body, a wheel at each corner out to the sides, the body (its sides set in by a
      // hair, so the wheels and windows stand out to them), a stripe, the windscreen at one end and cab windows.
      const V = P.van;
      const skirtTop = y0 + V.skirt;
      add(span(along, a0 + V.skirtInset, a1 - V.skirtInset, c0 + V.skirtInset, c1 - V.skirtInset, y0, skirtTop), 'barrier', dark);
      for (const at of [a0 + V.wheelFromEnd, a1 - V.wheelFromEnd]) {
        for (const [d0, d1] of [
          [c0, c0 + V.wheelDepth],
          [c1 - V.wheelDepth, c1],
        ] as const)
          add(span(along, at - V.wheelLength / 2, at + V.wheelLength / 2, d0, d1, y0, y0 + V.wheel), 'barrier', dark);
      }
      const body = span(along, a0, a1, c0 + V.body, c1 - V.body, skirtTop, y1);
      add(body, 'barrier', color, true);
      // The cab: the end the hash picks.
      const front = cabinetSeed(block) % 2 === 0;
      const end0 = front ? a0 : a1 - V.body;
      add(span(along, end0, end0 + V.body, c0 + V.body, c1 - V.body, y0 + h * V.windscreen[0], y0 + h * V.windscreen[1]), 'glass', srgb(0xffffff));
      const cab = front ? [a0 + V.body, a0 + V.cab] : [a1 - V.cab, a1 - V.body];
      for (const [d0, d1] of [
        [c0, c0 + V.body],
        [c1 - V.body, c1],
      ] as const) {
        add(span(along, cab[0]!, cab[1]!, d0, d1, y0 + h * V.windscreen[0], y0 + h * V.windscreen[1]), 'glass', srgb(0xffffff));
        add(span(along, front ? a0 + V.cab : a0, front ? a1 : a1 - V.cab, d0, d1, y0 + h * V.stripe[0], y0 + h * V.stripe[1]), 'barrier', shade(color, 0.6));
      }
      return;
    }
  }
}

/** A small hash of a prop's position (its |x|, so mirror twins match), for which hue or which end. */
function cabinetSeed(block: MapBlock): number {
  return (Math.imul(Math.round(Math.abs(block.center.x) * 10), 73856093) ^ Math.imul(Math.round(block.center.z * 10), 83492791)) >>> 0;
}

/**
 * The panels of a city prop that glow by Night (M34f), as lit-window signs on its faces: each arcade cabinet's screen in
 * its hue, a vending machine's product windows, a booth's sign band. By Day they are dark glass, like the panels drawn.
 */
export function propSigns(block: MapBlock): MapSign[] {
  if (block.kind !== 'cabinet' && block.kind !== 'vending' && block.kind !== 'booth') return [];
  const b = bounds(block);
  const [along, across] = axes(block);
  const y0 = b.min[1];
  const h = b.max[1] - y0;
  const out: MapSign[] = [];
  const facings = (axis: 0 | 2): [MapSign['facing'], number][] =>
    axis === 0
      ? [
          ['-x', b.min[0]],
          ['+x', b.max[0]],
        ]
      : [
          ['-z', b.min[2]],
          ['+z', b.max[2]],
        ];
  const panel = (a: number, width: number, y: number, height: number, colour: number, axis: 0 | 2 = across): void => {
    for (const [facing, at] of facings(axis)) {
      const centre = axis === 0 ? vec3(at, y, a) : vec3(a, y, at);
      out.push({ centre, width, height, facing, colour, kind: 'window' });
    }
  };
  if (block.kind === 'cabinet') {
    const C = P.cabinet;
    const a0 = b.min[along];
    const n = Math.max(1, Math.round((b.max[along] - a0) / C.width));
    const w = (b.max[along] - a0) / n;
    const y = y0 + (h * (C.screen[0] + C.screen[1])) / 2;
    for (let k = 0; k < n; k++)
      panel(a0 + (k + 0.5) * w, w - 2 * C.edge, y, h * (C.screen[1] - C.screen[0]), C.hues[(k + cabinetSeed(block)) % C.hues.length]!);
  } else if (block.kind === 'vending') {
    const V = P.vending;
    panel(
      (b.min[along] + b.max[along]) / 2,
      (b.max[along] - b.min[along]) * V.windowShare,
      y0 + (h * (V.window[0] + V.window[1])) / 2,
      h * (V.window[1] - V.window[0]),
      V.glow,
    );
  } else {
    const B = P.booth;
    const y = b.max[1] - B.roof - B.band / 2;
    for (const axis of [0, 2] as const) {
      const run = axis === 0 ? 2 : 0;
      panel((b.min[run] + b.max[run]) / 2, b.max[run] - b.min[run] - 2 * B.post, y, B.band * 0.7, B.glow, axis);
    }
  }
  return out;
}
