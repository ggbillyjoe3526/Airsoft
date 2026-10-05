import * as THREE from 'three';
import { DEPOT } from '../../src/map/depot';
import type { MapBlock } from '../../src/map/mapTypes';
import { Kit } from './kit';
import type { Preset } from './quality';
import { canvasTex, fbm } from './textures';

/**
 * Depot re-dressed in the overhaul's style, built from the game's own map data (src/map/depot.ts): every block keeps
 * its exact bounds, only its look changes. Each kind is drawn as a prop inside its box.
 */

const PAL = {
  ground: 0xe0d5c3,
  wallBlock: 0xeedcbc,
  wallBand: 0x3f8c92,
  coping: 0xd6cdbd,
  office: 0xf4ead8,
  officeBand: 0xe2783a,
  blue: 0x3b78d8,
  orange: 0xec7a2c,
  containers: [0x2f9a90, 0xe0652c, 0xc2413d, 0x2f64b4, 0xe8b53a, 0x5f9a3c],
  crate: 0xcf9f62,
  ply: 0xdcb47c,
  post: 0xa6743f,
  toilet: [0x2f78d8, 0x3aa46a],
  roof: 0xf4f3ee,
  rackUp: 0xe8622a,
  rackBeam: 0x2e5cb0,
  cardboard: 0xc9a066,
  stones: 0xe8dfcf,
  wire: 0x6d7378,
  film: 0xe6f0f6,
  tank: 0xf6f4ec,
  cage: 0x8e949a,
  bags: 0xcdbb8e,
  generator: 0xf5bb2c,
  darkPanel: 0x2a2e35,
  skip: 0xf09a2a,
  tread: 0xaab1b8,
};

const hashPos = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}
const bounds = (b: MapBlock): Bounds => ({
  x0: b.center.x - b.size.x / 2,
  x1: b.center.x + b.size.x / 2,
  y0: b.center.y - b.size.y / 2,
  y1: b.center.y + b.size.y / 2,
  z0: b.center.z - b.size.z / 2,
  z1: b.center.z + b.size.z / 2,
  cx: b.center.x,
  cy: b.center.y,
  cz: b.center.z,
  w: b.size.x,
  h: b.size.y,
  d: b.size.z,
});

export interface BuiltMap {
  group: THREE.Group;
  /** Meshes that take screen-space reflections (puddles). */
  reflective: THREE.Mesh[];
  /** Emissive bits that bloom. */
  flagCloth?: THREE.Mesh;
}

function wall(k: Kit, b: Bounds, perimeter: boolean, office: boolean, band: number): void {
  const p = k.p;
  const along = b.w > b.d ? 'x' : 'z';
  const bandH = Math.min(1.1, b.h);
  if (office) {
    // Plaster office wall, a painted band below, a thin skirting.
    if (b.y0 < 0.01) {
      k.box('paint', b.cx, b.y0 + bandH / 2, b.cz, b.w + 0.01, bandH, b.d + 0.01, band, { ground: 0, radius: 0.015 });
      if (b.h > bandH) k.box('plaster', b.cx, b.y0 + bandH + (b.h - bandH) / 2, b.cz, b.w, b.h - bandH, b.d, PAL.office, { radius: 0.015 });
      if (p.smallParts) k.box('paint', b.cx, b.y0 + bandH, b.cz, b.w + 0.03, 0.05, b.d + 0.03, 0xf8f4ec, { radius: 0.01 });
    } else {
      k.box('plaster', b.cx, b.cy, b.cz, b.w, b.h, b.d, PAL.office, { radius: 0.015 });
    }
    // A coping strip on top.
    if (b.y1 > 2.5) k.box('paint', b.cx, b.y1 + 0.03, b.cz, b.w + 0.06, 0.06, b.d + 0.06, 0xd9d2c6, { radius: 0.01 });
    return;
  }
  // Block wall: painted lower band, blocks above, a concrete coping, pilasters every 4 m on the perimeter.
  k.box('paint', b.cx, b.y0 + bandH / 2, b.cz, b.w + 0.02, bandH, b.d + 0.02, band, { ground: 0, radius: 0.02 });
  k.box('blocks', b.cx, b.y0 + bandH + (b.h - bandH) / 2, b.cz, b.w, b.h - bandH, b.d, PAL.wallBlock, { radius: 0.02 });
  k.box('plaster', b.cx, b.y1 + 0.06, b.cz, b.w + 0.12, 0.12, b.d + 0.12, PAL.coping, { radius: 0.03 });
  if (perimeter) {
    const len = along === 'x' ? b.w : b.d;
    const n = Math.floor(len / 4);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i * len) / n;
      const x = along === 'x' ? b.cx + t : b.cx;
      const z = along === 'z' ? b.cz + t : b.cz;
      k.box('plaster', x, b.y0 + b.h / 2, z, along === 'x' ? 0.5 : b.w + 0.16, b.h + 0.02, along === 'z' ? 0.5 : b.d + 0.16, PAL.coping, { ground: 0, radius: 0.03 });
    }
  }
}

function container(k: Kit, b: Bounds): void {
  const p = k.p;
  const long = b.w > b.d ? 'x' : 'z';
  const stack = b.h > 3.5 ? 2 : 1;
  const unitH = b.h / stack;
  for (let s = 0; s < stack; s++) {
    const tint = PAL.containers[Math.floor(hashPos(b.cx + s * 3.1, b.cz) * PAL.containers.length)]!;
    const y0 = b.y0 + s * unitH;
    const inset = 0.06;
    // The corrugated shell, the frame of corner posts and rails, slightly darker.
    k.box('corrugated', b.cx, y0 + unitH / 2, b.cz, b.w - inset * 2, unitH - 0.1, b.d - inset * 2, tint, { ground: 0, radius: 0.01, uvRot: false });
    const frame = new THREE.Color(tint).multiplyScalar(0.72);
    const pw = 0.16;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box('steel', b.cx + sx * (b.w / 2 - pw / 2), y0 + unitH / 2, b.cz + sz * (b.d / 2 - pw / 2), pw, unitH, pw, frame, { ground: 0, radius: 0.015 });
      }
    }
    for (const yy of [y0 + 0.07, y0 + unitH - 0.07]) {
      if (long === 'x') {
        for (const sz of [-1, 1]) k.box('steel', b.cx, yy, b.cz + sz * (b.d / 2 - 0.07), b.w, 0.14, 0.14, frame, { radius: 0.015 });
      } else {
        for (const sx of [-1, 1]) k.box('steel', b.cx + sx * (b.w / 2 - 0.07), yy, b.cz, 0.14, 0.14, b.d, frame, { radius: 0.015 });
      }
    }
    // Door end: four locking bars and hinges on the +x / +z end.
    if (p.smallParts) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = -0.75 + (i * 1.5) / (n - 1);
        if (long === 'x') k.box('steel', b.x1 - 0.02, y0 + unitH / 2, b.cz + t * (b.d / 2.6), 0.05, unitH - 0.4, 0.05, 0xb9bec4, { radius: 0.02 });
        else k.box('steel', b.cx + t * (b.w / 2.6), y0 + unitH / 2, b.z1 - 0.02, 0.05, unitH - 0.4, 0.05, 0xb9bec4, { radius: 0.02 });
      }
    }
  }
}

function crate(k: Kit, b: Bounds): void {
  k.box('plywood', b.cx, b.cy, b.cz, b.w - 0.08, b.h - 0.08, b.d - 0.08, PAL.crate, { ground: b.y0, radius: 0.01 });
  const e = 0.09;
  const tint = new THREE.Color(PAL.crate).multiplyScalar(0.82);
  // Edge boards on all twelve edges.
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) k.box('planks', b.cx, b.cy + sy * (b.h / 2 - e / 2), b.cz + sz * (b.d / 2 - e / 2), b.w, e, e, tint, { ground: b.y0, radius: 0.012 });
    for (const sx of [-1, 1]) k.box('planks', b.cx + sx * (b.w / 2 - e / 2), b.cy + sy * (b.h / 2 - e / 2), b.cz, e, e, b.d - 2 * e, tint, { ground: b.y0, radius: 0.012 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('planks', b.cx + sx * (b.w / 2 - e / 2), b.cy, b.cz + sz * (b.d / 2 - e / 2), e, b.h - 2 * e, e, tint, { ground: b.y0, radius: 0.012 });
  if (k.p.smallParts) {
    // Diagonal braces on the four sides.
    const diag = Math.hypot(b.w - 2 * e, b.h - 2 * e);
    const ang = Math.atan2(b.h - 2 * e, b.w - 2 * e);
    for (const sz of [-1, 1]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(b.cx, b.cy, b.cz + sz * (b.d / 2 - 0.03)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sz * ang), new THREE.Vector3(1, 1, 1));
      k.add('planks', k.boxGeo(diag, e * 0.9, 0.04, 0.01), m, tint, { ground: b.y0 });
    }
    for (const sx of [-1, 1]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(b.cx + sx * (b.w / 2 - 0.03), b.cy, b.cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sx * ang), new THREE.Vector3(1, 1, 1));
      k.add('planks', k.boxGeo(0.04, e * 0.9, diag, 0.01), m, tint, { ground: b.y0 });
    }
  }
}

function barrier(k: Kit, b: Bounds): void {
  const thin = Math.min(b.w, b.d) <= 0.25;
  const along = b.w > b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  if (thin) {
    // A concrete kerb wall with a hazard-striped top.
    k.box('plaster', b.cx, b.cy - 0.06, b.cz, b.w, b.h - 0.12, b.d, 0xd2cbbf, { ground: b.y0, radius: 0.02 });
    k.box('hazard', b.cx, b.y1 - 0.06, b.cz, b.w + 0.01, 0.12, b.d + 0.01, 0xffffff, { radius: 0.01 });
    return;
  }
  // A plywood barricade: two sheets on a timber frame, posts every 1.2 m, ports in the tall ones.
  const t = Math.min(b.w, b.d);
  const tall = b.h > 2;
  const ports: [number, number][] = [];
  if (tall) {
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i < n; i++) ports.push([-len / 2 + (i + 0.5) * (len / n), 0.18]);
  }
  const sheet = (off: number) => {
    const sx = along === 'z' ? off : 0;
    const sz = along === 'x' ? off : 0;
    const thick = 0.03;
    if (!tall) {
      k.box('plywood', b.cx + sx, b.cy, b.cz + sz, along === 'x' ? b.w : thick, b.h, along === 'z' ? b.d : thick, PAL.ply, { ground: b.y0, radius: 0.008 });
      return;
    }
    // Below and above the port band, and the pieces between ports.
    const py0 = 1.3;
    const py1 = 1.7;
    k.box('plywood', b.cx + sx, b.y0 + py0 / 2, b.cz + sz, along === 'x' ? b.w : thick, py0, along === 'z' ? b.d : thick, PAL.ply, { ground: b.y0, radius: 0.008 });
    k.box('plywood', b.cx + sx, b.y0 + py1 + (b.h - py1) / 2, b.cz + sz, along === 'x' ? b.w : thick, b.h - py1, along === 'z' ? b.d : thick, PAL.ply, { radius: 0.008 });
    const edges = [-len / 2, ...ports.flatMap(([c, hw]) => [c - hw, c + hw]), len / 2];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i]!;
      const c = edges[i + 1]!;
      if (c - a < 0.01) continue;
      const mid = (a + c) / 2;
      k.box('plywood', b.cx + sx + (along === 'x' ? mid : 0), b.y0 + (py0 + py1) / 2, b.cz + sz + (along === 'z' ? mid : 0), along === 'x' ? c - a : thick, py1 - py0, along === 'z' ? c - a : thick, PAL.ply, { radius: 0.008 });
    }
  };
  sheet(-(t / 2 - 0.015));
  sheet(t / 2 - 0.015);
  // Posts and a top rail.
  const n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const s = -len / 2 + 0.05 + (i * (len - 0.1)) / n;
    k.box('planks', b.cx + (along === 'x' ? s : 0), b.cy, b.cz + (along === 'z' ? s : 0), along === 'x' ? 0.09 : t - 0.06, b.h, along === 'z' ? 0.09 : t - 0.06, PAL.post, { ground: b.y0, radius: 0.012 });
  }
  k.box('planks', b.cx, b.y1 - 0.045, b.cz, along === 'x' ? b.w : t + 0.02, 0.09, along === 'z' ? b.d : t + 0.02, PAL.post, { radius: 0.012 });
  // A painted stripe along the top sheet.
  k.box('paint', b.cx, b.y1 - 0.25, b.cz, along === 'x' ? b.w - 0.02 : t + 0.005, 0.1, along === 'z' ? b.d - 0.02 : t + 0.005, PAL.orange, { radius: 0.004 });
}

function toilet(k: Kit, b: Bounds): void {
  const tint = PAL.toilet[Math.floor(hashPos(b.cx, b.cz) * 2)]!;
  k.box('plastic', b.cx, b.y0 + 0.08, b.cz, b.w, 0.16, b.d, 0x30343a, { ground: b.y0, radius: 0.03 });
  k.box('plastic', b.cx, b.y0 + 0.16 + (b.h - 0.42) / 2, b.cz, b.w - 0.06, b.h - 0.42, b.d - 0.06, tint, { ground: b.y0, radius: 0.06 });
  k.box('plastic', b.cx, b.y1 - 0.13, b.cz, b.w, 0.26, b.d, PAL.roof, { radius: 0.1 });
  // Door with a vent and a handle, on the -x side (facing west), and moulded ribs.
  const door = new THREE.Color(tint).multiplyScalar(0.85);
  k.box('plastic', b.x0 + 0.02, b.y0 + 1.05, b.cz, 0.04, 1.75, b.d - 0.3, door, { radius: 0.03 });
  if (k.p.smallParts) {
    k.box('plastic', b.x0 + 0.0, b.y0 + 1.7, b.cz, 0.04, 0.12, b.d - 0.5, 0x22262c, { radius: 0.02 });
    k.box('steel', b.x0 - 0.02, b.y0 + 1.05, b.cz + 0.32, 0.05, 0.14, 0.04, 0xc0c4c8, { radius: 0.015 });
    for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) k.box('plastic', b.cx - 0.3 + i * 0.3, b.y0 + 1.1, b.cz + sz * (b.d / 2 - 0.02), 0.08, 1.6, 0.04, door, { radius: 0.02 });
  }
}

function rack(k: Kit, b: Bounds): void {
  const along = b.w > b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const bays = Math.max(1, Math.round(len / 1.3));
  const u = 0.08;
  for (let i = 0; i <= bays; i++) {
    const s = -len / 2 + u / 2 + (i * (len - u)) / bays;
    for (const side of [-1, 1]) {
      const depth = along === 'x' ? b.d : b.w;
      const o = side * (depth / 2 - u / 2);
      k.box('steel', b.cx + (along === 'x' ? s : o), b.cy, b.cz + (along === 'z' ? s : o), u, b.h, u, PAL.rackUp, { ground: b.y0, radius: 0.012 });
    }
  }
  const levels = [0.12, 1.2, 2.3];
  for (const y of levels) {
    for (const side of [-1, 1]) {
      const depth = along === 'x' ? b.d : b.w;
      const o = side * (depth / 2 - 0.05);
      k.box('steel', b.cx + (along === 'z' ? o : 0), b.y0 + y, b.cz + (along === 'x' ? o : 0), along === 'x' ? b.w : 0.06, 0.1, along === 'z' ? b.d : 0.06, PAL.rackBeam, { radius: 0.01 });
    }
  }
  // Stock on the two lower levels: cartons and drums, each bay different.
  for (let i = 0; i < bays; i++) {
    const s0 = -len / 2 + (i + 0.5) * (len / bays);
    for (const [li, y] of [0.17, 1.25].entries()) {
      const r = hashPos(b.cx + i * 1.7 + li, b.cz + li * 2.3);
      const hh = 0.55 + r * 0.4;
      const depth = (along === 'x' ? b.d : b.w) - 0.2;
      const ww = len / bays - 0.15;
      const tint = r > 0.7 ? 0x6b8fb0 : r > 0.45 ? PAL.cardboard : 0xd9b483;
      k.box('plywood', b.cx + (along === 'x' ? s0 : 0), b.y0 + y + hh / 2, b.cz + (along === 'z' ? s0 : 0), along === 'x' ? ww : depth, hh, along === 'z' ? ww : depth, tint, { ground: b.y0 + y, radius: 0.02 });
    }
  }
}

function gabion(k: Kit, b: Bounds): void {
  k.box('stones', b.cx, b.cy, b.cz, b.w - 0.02, b.h - 0.02, b.d - 0.02, PAL.stones, { ground: b.y0, radius: 0.01 });
  const step = k.p.smallParts ? 0.3 : 0.6;
  const wt = k.p.smallParts ? 0.012 : 0.02;
  const wire = PAL.wire;
  // Wire grid on all four sides and the top.
  for (let y = b.y0; y <= b.y1 + 1e-6; y += step) {
    for (const sz of [-1, 1]) k.box('steel', b.cx, y, b.cz + sz * (b.d / 2), b.w, wt, wt, wire, { radius: 0 });
    for (const sx of [-1, 1]) k.box('steel', b.cx + sx * (b.w / 2), y, b.cz, wt, wt, b.d, wire, { radius: 0 });
  }
  for (let x = b.x0; x <= b.x1 + 1e-6; x += step) for (const sz of [-1, 1]) k.box('steel', x, b.cy, b.cz + sz * (b.d / 2), wt, b.h, wt, wire, { radius: 0 });
  for (let z = b.z0; z <= b.z1 + 1e-6; z += step) for (const sx of [-1, 1]) k.box('steel', b.cx + sx * (b.w / 2), b.cy, z, wt, b.h, wt, wire, { radius: 0 });
  for (let x = b.x0; x <= b.x1 + 1e-6; x += step) k.box('steel', x, b.y1, b.cz, wt, wt, b.d, wire, { radius: 0 });
}

function pallet(k: Kit, x: number, y: number, z: number, w: number, d: number, tint = 0xc49a5f): void {
  k.box('planks', x, y + 0.13, z, w, 0.03, d, tint, { ground: y, radius: 0.005 });
  for (const s of [-1, 0, 1]) k.box('planks', x, y + 0.06, z + s * (d / 2 - 0.05), w, 0.1, 0.1, new THREE.Color(tint).multiplyScalar(0.85), { ground: y, radius: 0.008 });
}

function wrapped(k: Kit, b: Bounds): void {
  pallet(k, b.cx, b.y0, b.cz, b.w - 0.02, b.d - 0.02);
  // Stacked cartons under shrink film.
  const rows = 4;
  const h = (b.h - 0.2) / rows;
  for (let r = 0; r < rows; r++) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const t = hashPos(b.cx + sx + r, b.cz + sz) > 0.5 ? PAL.cardboard : 0xd8b27a;
        k.box('plywood', b.cx + sx * (b.w / 4 - 0.02), b.y0 + 0.15 + h * (r + 0.5), b.cz + sz * (b.d / 4 - 0.02), b.w / 2 - 0.06, h - 0.02, b.d / 2 - 0.06, t, { ground: b.y0, radius: 0.015 });
      }
    }
  }
  k.box('film', b.cx, b.y0 + 0.15 + (b.h - 0.17) / 2, b.cz, b.w - 0.03, b.h - 0.17, b.d - 0.03, PAL.film, { radius: 0.05 });
  // A band of coloured tape round the load.
  k.box('paint', b.cx, b.y0 + b.h * 0.55, b.cz, b.w - 0.02, 0.08, b.d - 0.02, PAL.blue, { radius: 0.04 });
}

function ibc(k: Kit, b: Bounds): void {
  k.box('plastic', b.cx, b.y0 + 0.07, b.cz, b.w, 0.14, b.d, 0x2c2f35, { ground: b.y0, radius: 0.02 });
  k.box('tank', b.cx, b.y0 + 0.14 + (b.h - 0.2) / 2, b.cz, b.w - 0.1, b.h - 0.22, b.d - 0.1, PAL.tank, { radius: 0.1 });
  const step = k.p.smallParts ? 0.2 : 0.4;
  const t = 0.025;
  for (let y = b.y0 + 0.2; y < b.y1; y += step) {
    for (const sz of [-1, 1]) k.box('steel', b.cx, y, b.cz + sz * (b.d / 2 - t), b.w, t, t, PAL.cage, { radius: 0.01 });
    for (const sx of [-1, 1]) k.box('steel', b.cx + sx * (b.w / 2 - t), y, b.cz, t, t, b.d, PAL.cage, { radius: 0.01 });
  }
  for (let s = -b.w / 2 + t; s <= b.w / 2; s += step) {
    for (const sz of [-1, 1]) k.box('steel', b.cx + s, b.cy + 0.07, b.cz + sz * (b.d / 2 - t), t, b.h - 0.14, t, PAL.cage, { radius: 0.01 });
    for (const sx of [-1, 1]) k.box('steel', b.cx + sx * (b.w / 2 - t), b.cy + 0.07, b.cz + s, t, b.h - 0.14, t, PAL.cage, { radius: 0.01 });
  }
  k.box('plastic', b.cx, b.y1 - 0.02, b.cz, 0.18, 0.06, 0.18, 0x2f6fd0, { radius: 0.02 });
}

function sandbags(k: Kit, b: Bounds): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const depth = along === 'x' ? b.d : b.w;
  const bagL = 0.58;
  const bagH = 0.15;
  const rows = Math.round(b.h / bagH);
  const lines = Math.max(1, Math.round(depth / 0.4));
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bagL / 2 : 0;
    const n = Math.ceil(len / bagL) + 1;
    for (let li = 0; li < lines; li++) {
      for (let i = 0; i < n; i++) {
        let s0 = -len / 2 + i * bagL - off;
        let s1 = s0 + bagL - 0.02;
        s0 = Math.max(s0, -len / 2);
        s1 = Math.min(s1, len / 2);
        if (s1 - s0 < 0.15) continue;
        const mid = (s0 + s1) / 2;
        const dd = depth / lines - 0.02;
        const lo = -depth / 2 + (li + 0.5) * (depth / lines);
        const tint = new THREE.Color(PAL.bags).multiplyScalar(0.9 + hashPos(i + r * 7, li) * 0.15);
        const y = b.y0 + bagH * (r + 0.5);
        k.box('fabric', b.cx + (along === 'x' ? mid : lo), y, b.cz + (along === 'z' ? mid : lo), along === 'x' ? s1 - s0 : dd, bagH, along === 'z' ? s1 - s0 : dd, tint, { ground: b.y0, radius: 0.06 });
      }
    }
  }
}

function generator(k: Kit, b: Bounds): void {
  k.box('steel', b.cx, b.y0 + 0.08, b.cz, b.w - 0.05, 0.16, b.d - 0.1, 0x30343a, { ground: b.y0, radius: 0.02 });
  k.box('paint', b.cx, b.y0 + 0.16 + (b.h - 0.2) / 2, b.cz, b.w - 0.1, b.h - 0.24, b.d - 0.12, PAL.generator, { ground: b.y0, radius: 0.06 });
  // Grilles on the long sides and a control panel on the end.
  for (const sz of [-1, 1]) k.box('steel', b.cx, b.y0 + 0.65, b.cz + sz * (b.d / 2 - 0.055), b.w - 0.4, 0.5, 0.02, PAL.darkPanel, { radius: 0.01 });
  k.box('steel', b.x1 - 0.045, b.y0 + 0.7, b.cz, 0.02, 0.4, b.d - 0.5, PAL.darkPanel, { radius: 0.01 });
  if (k.p.smallParts) {
    for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) k.box('steel', b.cx - 0.3 + i * 0.12, b.y0 + 0.65, b.cz + sz * (b.d / 2 - 0.045), 0.03, 0.44, 0.02, 0x4a4f57, { radius: 0.005 });
    k.box('glow', b.x1 - 0.03, b.y0 + 0.82, b.cz + 0.12, 0.01, 0.04, 0.04, new THREE.Color(0x40ff70).multiplyScalar(3), {});
    k.box('glow', b.x1 - 0.03, b.y0 + 0.82, b.cz + 0.22, 0.01, 0.04, 0.04, new THREE.Color(0xff5030).multiplyScalar(3), {});
    const pipe = new THREE.CylinderGeometry(0.035, 0.035, 0.35, 12);
    k.add('steel', pipe, new THREE.Matrix4().makeTranslation(b.x0 + 0.25, b.y1 + 0.1, b.cz - 0.25), 0x55595f, {});
  }
}

function skip(k: Kit, b: Bounds): void {
  // A tapered steel bin: the base narrower than the top, ribs down the long sides.
  const g = new THREE.BoxGeometry(b.w, b.h - 0.1, b.d, 1, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) {
      pos.setX(i, pos.getX(i) * 0.78);
      pos.setZ(i, pos.getZ(i) * 0.92);
    }
  }
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  k.add('paint', ng, new THREE.Matrix4().makeTranslation(b.cx, b.y0 + 0.1 + (b.h - 0.1) / 2, b.cz), PAL.skip, { ground: b.y0 });
  k.box('dark', b.cx, b.y1 - 0.02, b.cz, b.w - 0.12, 0.04, b.d - 0.12, 0x5a4a3a, {});
  const along = b.w > b.d;
  if (along) for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) k.box('paint', b.cx - b.w * 0.36 + i * b.w * 0.18, b.cy + 0.05, b.cz + sz * (b.d / 2 - 0.02), 0.08, b.h - 0.3, 0.06, new THREE.Color(PAL.skip).multiplyScalar(0.85), { radius: 0.02 });
  k.box('steel', b.cx, b.y0 + 0.05, b.cz, b.w * 0.7, 0.1, b.d * 0.85, 0x2f3238, { ground: b.y0, radius: 0.01 });
}

function ramp(k: Kit, blk: MapBlock, b: Bounds): void {
  // A wedge of tread plate over the box: rise along +x or -x (Depot's dock ramps).
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rise = blk.rise ?? '+x';
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const t = rise === '+x' ? x / b.w + 0.5 : rise === '-x' ? 0.5 - x / b.w : rise === '+z' ? z / b.d + 0.5 : 0.5 - z / b.d;
    if (pos.getY(i) > 0) pos.setY(i, -b.h / 2 + b.h * t + 0.002);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  k.add('tread', ng, new THREE.Matrix4().makeTranslation(b.cx, b.cy, b.cz), PAL.tread, { ground: b.y0 });
}

function floor(k: Kit, b: Bounds): void {
  if (b.y1 <= 0.01) return; // the yard's own floor is drawn as the ground
  k.box('concrete', b.cx, b.cy, b.cz, b.w, b.h, b.d, PAL.ground, { ground: b.y0, radius: 0.02 });
  // A steel nosing with hazard stripes round the dock's edge.
  k.box('hazard', b.cx, b.y1 - 0.085, b.cz, b.w + 0.02, 0.15, b.d + 0.02, 0xffffff, { radius: 0.01 });
  // Rubber dock bumpers along the road side.
  if (k.p.smallParts) {
    for (let x = b.x0 + 1; x < b.x1 - 0.5; x += 2.2) k.box('rubber', x, b.y1 - 0.45, b.z1 + 0.06, 0.25, 0.4, 0.12, 0x24262a, { radius: 0.03 });
  }
}

/** Stencils, bay lines and lane markings painted on the yard, drawn on transparent planes. */
function markings(group: THREE.Group, p: Preset): void {
  const decal = (tex: THREE.Texture, x: number, z: number, w: number, d: number, rot = 0, opacity = 0.9) => {
    const m = p.pbr ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) : new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot;
    mesh.position.set(x, 0.004, z);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  };
  const stencil = (text: string, color: string, w = 1024, h = 512, font = 'bold 360px Arial Black, Arial, sans-serif') =>
    canvasTex(w, h, (g) => {
      g.fillStyle = color;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 10);
      // Worn paint: punch holes.
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = Math.random() * 0.6;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, Math.random() * 6, 0, Math.PI * 2);
        g.fill();
      }
    });
  decal(stencil('03', '#f4f1ea'), -3.2, -5.6, 3.4, 1.7, Math.PI / 2, 0.85);
  decal(stencil('BAY', '#f2c230', 1024, 400, 'bold 300px Arial Black, Arial, sans-serif'), 12.5, 4.6, 3.2, 1.25, -Math.PI / 2, 0.85);
  // Lane lines on Dock Road and car park bays.
  const line = canvasTex(64, 64, (g) => {
    g.fillStyle = '#f5c43a';
    g.fillRect(0, 0, 64, 64);
  });
  decal(line, -6, -10.0, 26, 0.12, 0, 0.8);
  const bays = canvasTex(1024, 256, (g) => {
    g.strokeStyle = '#f6f3ec';
    g.lineWidth = 10;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(10 + i * 250, 0);
      g.lineTo(10 + i * 250, 256);
      g.stroke();
    }
  });
  decal(bays, -14.5, 12.6, 9.5, 2.4, 0, 0.75);
  // Chevrons pointing at the Bay's Main Gate.
  const chev = canvasTex(512, 256, (g) => {
    g.fillStyle = '#f6f3ec';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const x = 40 + i * 150;
      g.moveTo(x, 20);
      g.lineTo(x + 80, 128);
      g.lineTo(x, 236);
      g.lineTo(x + 40, 236);
      g.lineTo(x + 120, 128);
      g.lineTo(x + 40, 20);
      g.closePath();
      g.fill();
    }
  });
  decal(chev, 1.8, 6.2, 2.4, 1.2, 0, 0.7);
  // Oil stains and tyre marks: soft dark blots.
  const stain = canvasTex(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 120);
    grd.addColorStop(0, 'rgba(40,36,32,0.55)');
    grd.addColorStop(0.6, 'rgba(40,36,32,0.25)');
    grd.addColorStop(1, 'rgba(40,36,32,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
  for (const [x, z, s] of [[-11, -1.5, 2.2], [9.5, 2.2, 3], [-18, 11.5, 2.6], [15, -12, 2.4], [0.5, -10.5, 2], [-5, 10, 1.6], [20.5, 8, 2.8]] as const) decal(stain, x, z, s, s * 0.7, x * 0.3, 0.8);
  // The Bay's floor outlined in yellow paint.
  const box = canvasTex(1024, 1024, (g) => {
    g.strokeStyle = '#f2c230';
    g.lineWidth = 14;
    g.strokeRect(10, 10, 1004, 1004);
    g.setLineDash([60, 40]);
    g.lineWidth = 8;
    g.strokeRect(60, 60, 904, 904);
  });
  decal(box, 11.4, 1.0, 5.6, 5.6, 0, 0.85);
}

function puddles(group: THREE.Group, p: Preset, kit: Kit): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const spots: [number, number, number, number][] = [
    [-6.5, 0.8, 2.6, 1.6],
    [7.0, 8.4, 3.2, 1.8],
    [-14.5, 2.5, 2.2, 1.4],
    [2.2, -3.6, 1.8, 1.2],
  ];
  for (const [x, z, w, d] of spots) {
    // An irregular outline: a ring of points pushed in and out by noise.
    const shape = new THREE.Shape();
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.78 + (fbm(Math.cos(a) * 0.5 + 0.5 + x, Math.sin(a) * 0.5 + 0.5 + z, 3, 3, 40) - 0.5) * 0.7;
      const px = Math.cos(a) * r * (w / 2);
      const pz = Math.sin(a) * r * (d / 2);
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    const mat = p.pbr
      ? new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.03, metalness: 0.0, envMap: kit.envMap, envMapIntensity: 1.3 })
      : new THREE.MeshLambertMaterial({ color: 0xb9c7d2 });
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    group.add(m);
    out.push(m);
  }
  return out;
}

function flagPole(k: Kit, x: number, z: number): THREE.Mesh {
  k.box('plaster', x, 0.15, z, 0.9, 0.3, 0.9, 0xd6cfc3, { ground: 0, radius: 0.04 });
  k.add('steel', new THREE.CylinderGeometry(0.045, 0.06, 4.6, k.p.curveSegments), new THREE.Matrix4().makeTranslation(x, 2.6, z), 0xe8eaec, {});
  k.add('steel', new THREE.SphereGeometry(0.08, k.p.curveSegments, 8), new THREE.Matrix4().makeTranslation(x, 4.92, z), 0xf2c230, {});
  // The flag: a waved plane with a bold chevron emblem (neutral until captured).
  const tex = canvasTex(512, 320, (g) => {
    g.fillStyle = '#f3f1ea';
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#20232a';
    g.fillRect(0, 0, 512, 40);
    g.fillRect(0, 280, 512, 40);
    g.fillStyle = '#f2b52c';
    g.beginPath();
    g.moveTo(170, 80);
    g.lineTo(300, 160);
    g.lineTo(170, 240);
    g.lineTo(220, 240);
    g.lineTo(350, 160);
    g.lineTo(220, 80);
    g.fill();
  });
  const geo = new THREE.PlaneGeometry(1.6, 1.0, 24, 12);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.8;
    pos.setZ(i, Math.sin(u * 4.2 + pos.getY(i) * 0.8) * 0.09 * u);
  }
  geo.computeVertexNormals();
  const mat = k.p.pbr ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(geo, mat);
  flag.position.set(x + 0.84, 4.3, z);
  flag.rotation.y = 0.5;
  flag.castShadow = true;
  flag.receiveShadow = true;
  return flag;
}

export function buildDepot(kit: Kit): BuiltMap {
  const group = new THREE.Group();
  const p = kit.p;
  for (const blk of DEPOT.blocks) {
    const b = bounds(blk);
    switch (blk.kind) {
      case 'wall': {
        const perimeter = b.h >= 3.9;
        const office = !perimeter && b.cz > 7 && b.h <= 3.01 && b.h !== 2.6;
        const spawnWest = !perimeter && b.cx < -17;
        const spawnEast = !perimeter && b.cx > 18;
        const band = spawnWest ? PAL.blue : spawnEast ? PAL.orange : office ? PAL.officeBand : PAL.wallBand;
        wall(kit, b, perimeter, office, band);
        break;
      }
      case 'container':
        container(kit, b);
        break;
      case 'crate':
        crate(kit, b);
        break;
      case 'barrier':
        barrier(kit, b);
        break;
      case 'toilet':
        toilet(kit, b);
        break;
      case 'rack':
        rack(kit, b);
        break;
      case 'gabion':
        gabion(kit, b);
        break;
      case 'wrapped':
        wrapped(kit, b);
        break;
      case 'ibc':
        ibc(kit, b);
        break;
      case 'sandbags':
        sandbags(kit, b);
        break;
      case 'generator':
        generator(kit, b);
        break;
      case 'skip':
        skip(kit, b);
        break;
      case 'ramp':
        ramp(kit, blk, b);
        break;
      case 'floor':
        floor(kit, b);
        break;
      default:
        kit.box('plaster', b.cx, b.cy, b.cz, b.w, b.h, b.d, 0xcccccc, { ground: b.y0 });
    }
  }
  // The yard's concrete.
  kit.box('concrete', 0, -0.25, 0, 51, 0.5, 33, PAL.ground, { radius: 0 });
  const flagCloth = DEPOT.flag ? flagPole(kit, DEPOT.flag.x, DEPOT.flag.z) : undefined;
  group.add(kit.build());
  if (flagCloth) group.add(flagCloth);
  markings(group, p);
  const reflective = puddles(group, p, kit);
  return { group, reflective, flagCloth };
}
