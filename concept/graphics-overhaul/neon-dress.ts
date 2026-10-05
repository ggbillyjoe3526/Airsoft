import * as THREE from 'three';
import { NEON_HEIGHTS } from '../../src/map/neonHeights';
import type { Kit } from './kit';
import { rng, steamTex, strokeText } from './neon-assets';
import { AREA, bags, bagGeo, bar, bx, cable, decal, halo, hashPos, hdr, HALF_X, HALF_Z, rod, screen, span, V, type Spot } from './neon-city';

/**
 * Set dressing for Neon Heights. None of it plays: flat or under 0.3 m on the street (litter, cans, squashed bags,
 * leaves, manholes), on walls above head height (AC units, pipes, cable runs, fire escapes over the spawn yards), on the
 * roofs above every eye line (tanks, condensers, masts with warning lights, a rooftop sign), or outside the site (the
 * ring of buildings round it). Steam is thin and rises from manholes, vents and the noodle pot.
 */

const UP = V(0, 1, 0);
/** How close to a high viewpoint (m, on the ground) the ring's blocks are kept low. */
const LOW_NEAR_RADIUS = 34;
/** The stretch of the north and south rings, along x, kept low over the avenue's ends. */
const AVENUE_GAP: [number, number] = [-4.5, 5];

/** Is (x, z) on the street inside a block's footprint (or within `pad` of one)? */
const STREET_BLOCKS = NEON_HEIGHTS.blocks.filter((b) => b.kind !== 'floor' && b.center.y - b.size.y / 2 < 0.05);
export function blocked(x: number, z: number, pad = 0.05): boolean {
  if (Math.abs(x) > HALF_X - pad || Math.abs(z) > HALF_Z - pad) return true;
  return STREET_BLOCKS.some((b) => Math.abs(x - b.center.x) < b.size.x / 2 + pad && Math.abs(z - b.center.z) < b.size.z / 2 + pad);
}

// ---------------------------------------------------------------------------------------------------------------- outer ring

/**
 * The ring of buildings round the site, rising behind the 10 m perimeter walls (which are their street frontage):
 * different heights, facades and colours, rows of lit and dark windows, cornices, AC units and fire escapes on some,
 * vertical neon on a few, and rooftops with water tanks, masts and warning lights.
 */
function outerRing(k: Kit, lights: Spot[], r: () => number, lowNear?: THREE.Vector3): void {
  const full = k.p.scenery === 'full';
  const sides: { fixed: 'x' | 'z'; at: number; out: number; from: number; to: number }[] = [
    { fixed: 'z', at: -HALF_Z - 0.5, out: -1, from: -HALF_X - 14, to: HALF_X + 14 },
    { fixed: 'z', at: HALF_Z + 0.5, out: 1, from: -HALF_X - 14, to: HALF_X + 14 },
    { fixed: 'x', at: -HALF_X - 0.5, out: -1, from: -HALF_Z - 0.5, to: HALF_Z + 0.5 },
    { fixed: 'x', at: HALF_X + 0.5, out: 1, from: -HALF_Z - 0.5, to: HALF_Z + 0.5 },
  ];
  const facades: [string, number[]][] = [
    ['plaster', [0x6a6e8a, 0x5a6a7a, 0x8a6a7a, 0x4e5a6e, 0x7a7088]],
    ['nhBrick', [0xb08070, 0x9a7a6a, 0xc09080]],
    ['cladding', [0x5a6a7e, 0x4a5a6a, 0x6a7a8a]],
    ['precast', [0x8a8a92, 0x7a7e88]],
  ];
  let signIx = 0;
  for (const s of sides) {
    let a = s.from;
    while (a < s.to - 2) {
      let w = Math.min(s.to - a, 7 + r() * 9);
      // The avenue's two ends stay low (one storey over the wall), so the far city and the sky show down the street.
      const gap = s.fixed === 'z' && a >= AVENUE_GAP[0] - 0.01 && a < AVENUE_GAP[1];
      if (gap) w = AVENUE_GAP[1] - a;
      else if (s.fixed === 'z' && a < AVENUE_GAP[0] && a + w > AVENUE_GAP[0]) w = AVENUE_GAP[0] - a;
      // Lower to the south-east, so the overview sees over them; taller to the north and west.
      const tallSide = (s.fixed === 'z' && s.out < 0) || (s.fixed === 'x' && s.out < 0);
      let h = gap ? 11.4 + r() * 0.8 : (tallSide ? 18 : 13) + r() * (tallSide ? 13 : 8);
      const depth = 10 + r() * 6;
      // Seen from high over one corner, the blocks on that corner stay one storey over the wall, so the view clears them.
      const mid = s.fixed === 'z' ? V(a + w / 2, 0, s.at + s.out * depth * 0.5) : V(s.at + s.out * depth * 0.5, 0, a + w / 2);
      if (lowNear && mid.distanceTo(V(lowNear.x, 0, lowNear.z)) < LOW_NEAR_RADIUS) h = 10.8 + (h % 1) * 1.2;
      const set = 0.0 + (r() > 0.7 ? 1.2 : 0);
      const [key, cols] = facades[Math.floor(r() * facades.length)]!;
      const col = new THREE.Color(cols[Math.floor(r() * cols.length)]!).multiplyScalar(0.8 + r() * 0.25);
      const b0 = s.at + s.out * set;
      const b1 = s.at + s.out * (set + depth);
      const [x0, x1, z0, z1] = s.fixed === 'z' ? [a, a + w, Math.min(b0, b1), Math.max(b0, b1)] : [Math.min(b0, b1), Math.max(b0, b1), a, a + w];
      span(k, key, x0, x1, 9.6, h, z0, z1, col, { radius: 0.03 });
      // Cornice and parapet.
      span(k, 'precast', x0 - 0.1, x1 + 0.1, h - 0.1, h + 0.25, z0 - 0.1, z1 + 0.1, 0x9a9aa2, { radius: 0.02 });
      span(k, 'nhRoof', x0 + 0.3, x1 - 0.3, h + 0.2, h + 0.26, z0 + 0.3, z1 - 0.3, 0xc0c0c8, { radius: 0 });
      // The face towards the site.
      const faceAt = s.at + s.out * set;
      const n = s.fixed === 'z' ? V(0, 0, -s.out) : V(-s.out, 0, 0);
      const pt = (u: number, y: number, o = 0) => (s.fixed === 'z' ? V(u, y, faceAt - s.out * o) : V(faceAt - s.out * o, y, u));
      const floorH = 2.9 + r() * 0.5;
      const winW = 0.9 + r() * 0.6;
      const pitch = winW + 0.8 + r() * 0.8;
      const lit = 0.3 + r() * 0.3;
      const nw = Math.floor((w - 0.8) / pitch);
      const u0 = a + (w - (nw - 1) * pitch) / 2;
      const fe = full && r() > 0.72 && nw > 1;
      for (let y = 11.2; y < h - 1.4; y += floorH) {
        for (let i = 0; i < nw; i++) {
          const u = u0 + i * pitch;
          const c = pt(u, y, -0.01);
          if (r() < lit) screen(k, `room${Math.floor(r() * 6)}`, c, n, winW, 1.3, new THREE.Color([0xffc890, 0x9fd8ff, 0xffe2b0][Math.floor(r() * 3)]!).multiplyScalar((k.p.bloom ? 1.2 : 0.9) * (0.6 + r() * 0.5)));
          else k.add('nhGlass', new THREE.PlaneGeometry(winW, 1.3), new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.012), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n), V(1, 1, 1)), 0x181c28, {});
          if (k.p.smallParts) {
            const sill = pt(u, y - 0.72, 0.06);
            bar(k, 'precast', sill.x, sill.y, sill.z, s.fixed === 'z' ? winW + 0.16 : 0.12, 0.07, s.fixed === 'z' ? 0.12 : winW + 0.16, 0x9a9aa2);
          }
          if (r() > 0.86) acUnit(k, pt(u + pitch * 0.15, y - 1.1, 0), n, r);
        }
      }
      if (fe) fireEscape(k, pt(u0 + pitch * 0.5 * (nw > 2 ? 1 : 0), 0, 0), n, s.fixed === 'z' ? V(1, 0, 0) : V(0, 0, 1), 10.4, h - 1.5, Math.min(pitch * 1.6, w - 1));
      // A vertical neon blade sign on a few, high up.
      if (r() > 0.78 && h > 17) {
        const names = ['HOTEL', 'KISS', 'NOVA', 'GAMES', 'SUSHI', 'CLUB'];
        const name = names[signIx++ % names.length]!;
        const colour = [0xff2bd6, 0x22e6ff, 0xffa531, 0x9a6bff, 0xff3b4a][Math.floor(r() * 5)]!;
        bladeSign(k, pt(a + w * (0.2 + r() * 0.6), Math.min(h - 3.5, 13 + r() * 4), 0), n, s.fixed === 'z' ? V(1, 0, 0) : V(0, 0, 1), name, colour, lights);
      }
      if (r() > 0.4 && !gap) rooftop(k, (x0 + x1) / 2 + (r() - 0.5) * w * 0.4, h + 0.26, (z0 + z1) / 2 + (r() - 0.5) * depth * 0.3, r, lights);
      a += w + (r() > 0.85 ? 0.6 : 0);
    }
  }
}

/** An AC unit on a wall: a grey box with a fan grille, a bracket, a drip stain down the wall. */
function acUnit(k: Kit, c: THREE.Vector3, n: THREE.Vector3, r: () => number): void {
  const across = new THREE.Vector3().crossVectors(UP, n);
  const w = 0.8;
  const h = 0.55;
  const d = 0.32;
  const centre = c.clone().addScaledVector(n, d / 2 + 0.02);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
  k.add('paintSteel', k.boxGeo(w, h, d, 0.02), new THREE.Matrix4().compose(centre, q, V(1, 1, 1)), new THREE.Color(0xc8ccd0).multiplyScalar(0.8 + r() * 0.2), {});
  const grille = centre.clone().addScaledVector(n, d / 2 + 0.002).addScaledVector(across, 0.1);
  k.add('louvre', new THREE.CircleGeometry(0.2, k.p.smallParts ? 20 : 8), new THREE.Matrix4().compose(grille, q, V(1, 1, 1)), 0x4a4e56, {});
  if (k.p.smallParts) {
    for (const s of [-0.3, 0.3]) rod(k, 'paintSteel', c.clone().addScaledVector(across, s).add(V(0, -h / 2 - 0.02, 0)), c.clone().addScaledVector(across, s).add(V(0, -h / 2 - 0.02, 0)).addScaledVector(n, d + 0.04), 0.012, 0x3a3e46, 4);
    rod(k, 'plastic', c.clone().addScaledVector(across, -0.32).add(V(0, -0.2, 0)).addScaledVector(n, 0.05), c.clone().addScaledVector(across, -0.32).add(V(0, -1.6, 0)).addScaledVector(n, 0.05), 0.01, 0xd8d8d8, 4);
  }
  decal(k, 'stain', c.clone().add(V(0, -1.1, 0)).addScaledVector(n, 0.002), n, 0.5, 1.6, 0x2a2a30, 0);
}

/**
 * A fire escape: grated landings under each row of windows, railed, zig-zag flights between them, and a counterweighted
 * ladder hanging at the bottom, all on the wall above head height.
 */
function fireEscape(k: Kit, base: THREE.Vector3, n: THREE.Vector3, along: THREE.Vector3, y0: number, y1: number, w: number): void {
  const depth = 0.9;
  const step = 2.0;
  const tint = 0x2a2e36;
  const P = (u: number, y: number, o: number) => base.clone().addScaledVector(along, u).setY(y).addScaledVector(n, o);
  const plate = (y: number) => {
    const c = P(0, y, depth / 2 + 0.02);
    const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), along);
    k.add('nhGrate', new THREE.BoxGeometry(w, 0.04, depth), new THREE.Matrix4().compose(c, q, V(1, 1, 1)), 0x6a707a, {});
    // Rail: posts, a top rail and a mid rail.
    for (const u of [-w / 2, -w / 4, 0, w / 4, w / 2]) rod(k, 'paintSteel', P(u, y, depth), P(u, y + 0.95, depth), 0.015, tint, 4);
    for (const dy of [0.95, 0.5]) rod(k, 'paintSteel', P(-w / 2, y + dy, depth), P(w / 2, y + dy, depth), 0.014, tint, 4);
    for (const u of [-w / 2, w / 2]) for (const dy of [0.95, 0.5]) rod(k, 'paintSteel', P(u, y + dy, 0.02), P(u, y + dy, depth), 0.014, tint, 4);
    // Brackets under the landing.
    for (const u of [-w / 2 + 0.1, w / 2 - 0.1]) rod(k, 'paintSteel', P(u, y - 0.5, 0.02), P(u, y - 0.02, depth - 0.05), 0.02, tint, 4);
  };
  let flip = 1;
  for (let y = y0; y <= y1; y += step) {
    plate(y);
    if (y + step <= y1) {
      // A flight along the wall from one end of this landing to the other end of the next.
      const a = P(-flip * (w / 2 - 0.3), y, depth * 0.5);
      const b = P(flip * (w / 2 - 0.3), y + step, depth * 0.5);
      const len = a.distanceTo(b);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize());
      k.add('nhGrate', new THREE.BoxGeometry(len, 0.03, depth * 0.55), new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, V(1, 1, 1)), 0x5a606a, {});
      rod(k, 'paintSteel', a.clone().add(V(0, 0.9, 0)).addScaledVector(n, depth * 0.28), b.clone().add(V(0, 0.9, 0)).addScaledVector(n, depth * 0.28), 0.012, tint, 4);
      flip = -flip;
    }
  }
  // The drop ladder, raised, its foot well above head height.
  const lu = flip * (w / 2 - 0.25);
  for (const o of [depth - 0.15, depth - 0.55]) rod(k, 'paintSteel', P(lu, y0 - 0.1, o), P(lu, y0 - 1.6, o), 0.014, tint, 4);
  for (let y = y0 - 1.5; y < y0; y += 0.3) rod(k, 'paintSteel', P(lu, y, depth - 0.15), P(lu, y, depth - 0.55), 0.01, tint, 4);
}

/** A flickering letter, caught mid-blink: a fraction of a lit one. */
const FLICKER_DIM = 0.1;

/** A vertical blade sign standing out from a wall high up (outside the site): a box with neon letters down both faces. */
function bladeSign(k: Kit, c: THREE.Vector3, n: THREE.Vector3, along: THREE.Vector3, text: string, colour: number, lights: Spot[], size = 1, dead: number[] = [], dim: number[] = []): void {
  const pitch = 0.9 * size;
  const H = text.length * pitch + 0.6 * size;
  const D = 1.3 * size;
  const centre = c.clone().addScaledVector(n, D / 2 + 0.2);
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), n);
  k.add('paintSteel', k.boxGeo(D, H, 0.22, 0.03), new THREE.Matrix4().compose(centre, q, V(1, 1, 1)), 0x14141c, {});
  for (const side of [-1, 1]) {
    const face = along.clone().multiplyScalar(side);
    const right = new THREE.Vector3().crossVectors(UP, face);
    [...text].forEach((ch, i) => {
      const st = strokeText(ch);
      const sc = (0.7 * size) / 6;
      const o = centre.clone().addScaledVector(face, 0.13).addScaledVector(UP, H / 2 - 0.3 * size - pitch * (i + 0.5) - 3 * sc).addScaledVector(right, (-st.width * sc) / 2);
      // A dead letter is a dark tube; a flickering one (caught mid-blink) glows dim.
      const off = dead.includes(i);
      for (const stroke of st.strokes) for (let j = 0; j + 1 < stroke.length; j++) {
        const pa = o.clone().addScaledVector(right, stroke[j]![0] * sc).addScaledVector(UP, stroke[j]![1] * sc);
        const pb = o.clone().addScaledVector(right, stroke[j + 1]![0] * sc).addScaledVector(UP, stroke[j + 1]![1] * sc);
        const tint = off ? new THREE.Color(colour).multiplyScalar(0.35) : hdr(colour, k, dim.includes(i) ? FLICKER_DIM : 1.1);
        rod(k, off ? 'nhTubeOff' : 'glow', pa, pb, 0.03 * Math.max(0.7, size), tint, k.p.smallParts ? 6 : 4);
      }
    });
    halo(k, centre.clone().addScaledVector(face, 0.12), face, D + 1.5 * size, H + 1.5 * size, colour, 0.25);
  }
  halo(k, c.clone().addScaledVector(n, 0.02), n, 3 * size, H + 2 * size, colour, 0.3);
  lights.push({ pos: centre.clone().addScaledVector(n, 1), colour, power: 12 * size, range: 14 * size });
}

/**
 * A flush box sign on a wall: a dark backing plate (6 cm), neon letters across it on standoffs, a glow on the wall
 * round it. `dead` letters are dark tubes, `dim` ones caught mid-flicker.
 */
function wallSign(k: Kit, c: THREE.Vector3, n: THREE.Vector3, right: THREE.Vector3, text: string, colour: number, lights: Spot[], letterH: number, dead: number[] = [], dim: number[] = []): void {
  const st = strokeText(text);
  const sc = letterH / 6;
  const W = st.width * sc + letterH * 0.8;
  const H = letterH * 1.6;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
  k.add('paintSteel', k.boxGeo(W, H, 0.06, 0.015), new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.03), q, V(1, 1, 1)), 0x15131c, {});
  const o = c.clone().addScaledVector(n, 0.1).addScaledVector(right, (-st.width * sc) / 2).addScaledVector(UP, -3 * sc);
  st.letters.forEach((letter, i) => {
    const off = dead.includes(i);
    // A dead tube is grey glass with a trace of its colour.
    const tint = off ? new THREE.Color(colour).lerp(new THREE.Color(0x8a8a92), 0.65).multiplyScalar(0.3) : hdr(colour, k, dim.includes(i) ? FLICKER_DIM : 1.1);
    for (const stroke of letter) for (let j = 0; j + 1 < stroke.length; j++) {
      const pa = o.clone().addScaledVector(right, stroke[j]![0] * sc).addScaledVector(UP, stroke[j]![1] * sc);
      const pb = o.clone().addScaledVector(right, stroke[j + 1]![0] * sc).addScaledVector(UP, stroke[j + 1]![1] * sc);
      rod(k, off ? 'nhTubeOff' : 'glow', pa, pb, 0.016, tint, k.p.smallParts ? 6 : 4);
    }
  });
  halo(k, c.clone().addScaledVector(n, 0.004), n, W + 1.6, H + 1.4, colour, 0.35);
  lights.push({ pos: c.clone().addScaledVector(n, 0.8), colour, power: 4, range: 6 });
}

/** Rooftop clutter: a water tank on legs or a pair of condensers, a mast with a warning light, a dish, a vent. */
function rooftop(k: Kit, x: number, y: number, z: number, r: () => number, lights: Spot[]): void {
  const seg = k.p.curveSegments;
  const pick = r();
  if (pick < 0.45) {
    // A timber water tank on a steel frame, a conical lid.
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]] as const) bar(k, 'paintSteel', x + dx, y + 1.0, z + dz, 0.12, 2, 0.12, 0x2a2e36);
    k.add('timber', new THREE.CylinderGeometry(1.25, 1.35, 2.6, seg), new THREE.Matrix4().makeTranslation(x, y + 3.3, z), 0x7a5a3e, {});
    k.add('paintSteel', new THREE.ConeGeometry(1.4, 0.7, seg), new THREE.Matrix4().makeTranslation(x, y + 4.95, z), 0x3a3e46, {});
    if (k.p.smallParts) for (const dy of [2.4, 3.3, 4.2]) k.add('steel', new THREE.TorusGeometry(1.3, 0.03, 4, seg).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y + dy, z), 0x2a2e36, {});
  } else if (pick < 0.75) {
    // Condensers with fans on top.
    for (const dx of [-0.7, 0.7]) {
      span(k, 'paintSteel', x + dx - 0.55, x + dx + 0.55, y, y + 1.0, z - 0.5, z + 0.5, 0xb8bcc2, { radius: 0.03 });
      k.add('louvre', new THREE.CircleGeometry(0.38, 16).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(x + dx, y + 1.005, z), 0x3a3e46, {});
    }
  }
  if (r() > 0.4) {
    // A lattice mast with a red warning light.
    const hgt = 4 + r() * 6;
    const mx = x + (r() - 0.5) * 3;
    const mz = z + (r() - 0.5) * 3;
    for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [0, 0.18]] as const) rod(k, 'galv', V(mx + dx, y, mz + dz), V(mx + dx * 0.3, y + hgt, mz + dz * 0.3), 0.025, 0x8a9096, 4);
    if (k.p.smallParts) for (let t = 0.5; t < hgt; t += 0.6) rod(k, 'galv', V(mx - 0.15 * (1 - t / hgt), y + t, mz - 0.15 * (1 - t / hgt)), V(mx + 0.15 * (1 - t / hgt), y + t + 0.3, mz - 0.15 * (1 - t / hgt)), 0.01, 0x8a9096, 3);
    k.add('glow', new THREE.SphereGeometry(0.09, 10, 6), new THREE.Matrix4().makeTranslation(mx, y + hgt + 0.1, mz), hdr(0xff2a1a, k, r() > 0.4 ? 1.6 : 0.4), {});
    halo(k, V(mx, y + hgt + 0.1, mz), V(0, 0, 1), 1.2, 1.2, 0xff2a1a, 0.6);
    halo(k, V(mx, y + hgt + 0.1, mz), V(1, 0, 0), 1.2, 1.2, 0xff2a1a, 0.6);
  }
  if (k.p.smallParts && r() > 0.5) {
    // A satellite dish.
    const g = new THREE.SphereGeometry(0.45, 16, 6, 0, Math.PI * 2, 0, 0.9);
    k.add('paintSteel', g, new THREE.Matrix4().compose(V(x + 1.6, y + 0.9, z - 1.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, r() * 6, 0)), V(1, 1, 1)), 0xd8dade, {});
    rod(k, 'galv', V(x + 1.6, y, z - 1.2), V(x + 1.6, y + 0.8, z - 1.2), 0.03, 0x8a9096, 6);
  }
  void lights;
}

// ---------------------------------------------------------------------------------------------------------------- site walls and roofs

/** AC units, drainpipes and cable runs on the perimeter's inner faces (above head height), fire escapes over the yards. */
function siteWalls(k: Kit, r: () => number): void {
  const windows = (NEON_HEIGHTS.signs ?? []).filter((s) => s.kind === 'window');
  for (const w of windows) {
    const n = w.facing === '+x' ? V(1, 0, 0) : w.facing === '-x' ? V(-1, 0, 0) : w.facing === '+z' ? V(0, 0, 1) : V(0, 0, -1);
    const c = V(w.centre.x, w.centre.y, w.centre.z);
    if (w.centre.y > 5 && r() > 0.72) acUnit(k, c.clone().add(V(0, -1.05, 0)).addScaledVector(new THREE.Vector3().crossVectors(UP, n), 0.3), n.clone(), r);
  }
  // Drainpipes from the roofline to the ground on some piers, a cable run along the cornice.
  const runs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [V(-HALF_X + 0.05, 0, -HALF_Z), V(-HALF_X + 0.05, 0, HALF_Z), V(1, 0, 0)],
    [V(HALF_X - 0.05, 0, -HALF_Z), V(HALF_X - 0.05, 0, HALF_Z), V(-1, 0, 0)],
    [V(-HALF_X, 0, -HALF_Z + 0.05), V(HALF_X, 0, -HALF_Z + 0.05), V(0, 0, 1)],
    [V(-HALF_X, 0, HALF_Z - 0.05), V(HALF_X, 0, HALF_Z - 0.05), V(0, 0, -1)],
  ];
  for (const [a, b, n] of runs) {
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    for (let t = 3.9; t < len - 1; t += 7.8 + (r() - 0.5) * 2) {
      const p = a.clone().addScaledVector(dir, t);
      const off = p.clone().addScaledVector(n, 0.06);
      // Skip where a building stands against the wall.
      if (inside(p.x + n.x * 0.5, p.z + n.z * 0.5)) continue;
      rod(k, 'paintSteel', off.clone().setY(0.05), off.clone().setY(9.6), 0.055, 0x3a4048, k.p.smallParts ? 10 : 5, false);
      if (k.p.smallParts) for (let y = 1; y < 9.6; y += 1.8) bar(k, 'steel', off.x, y, off.z, n.x ? 0.12 : 0.16, 0.04, n.z ? 0.12 : 0.16, 0x2a2e36);
    }
    if (k.p.smallParts) for (let i = 0; i < 2; i++) {
      const y = 9.0 - i * 0.12;
      cable(k, a.clone().setY(y).addScaledVector(n, 0.08), a.clone().addScaledVector(dir, len * 0.5).setY(y).addScaledVector(n, 0.08), 0.12, 0.012);
      cable(k, a.clone().addScaledVector(dir, len * 0.5).setY(y).addScaledVector(n, 0.08), b.clone().setY(y).addScaledVector(n, 0.08), 0.12, 0.012);
    }
  }
  // Fire escapes over the two spawn yards (nothing plays up there; the drop ladder stops well over head height).
  fireEscape(k, V(-HALF_X, 0, -6.4), V(1, 0, 0), V(0, 0, 1), 4.0, 8.2, 2.6);
  fireEscape(k, V(HALF_X, 0, 5.2), V(-1, 0, 0), V(0, 0, 1), 4.0, 8.2, 2.6);
  // A vent high on the Arcade's north wall breathing steam, a wall light or two over doors.
  bar(k, 'louvre', -7.2, 4.6, -10.04, 0.6, 0.4, 0.08, 0x5a5e66);
}

const inside = (x: number, z: number): boolean =>
  ([AREA.arcade, AREA.block, AREA.tower] as const).some((a) => x >= a[0] && x <= a[1] && z >= a[2] && z <= a[3]);

/** The roofs: tanks, condensers, masts and a rooftop sign on the tall ones (9.3 m, over every eye line); the Arcade's lower roof only gets flat things. */
function siteRoofs(k: Kit, lights: Spot[], r: () => number): void {
  rooftop(k, 13.5, 9.3, -6, r, lights);
  rooftop(k, 8, 9.3, 6.5, r, lights);
  rooftop(k, -9, 9.3, 9.5, r, lights);
  // A rooftop sign frame on the Tower, facing the avenue: a made-up hotel.
  const sx = 5.2;
  for (const z of [-7.5, -3.2, 1.1, 5.4]) {
    rod(k, 'paintSteel', V(sx, 9.3, z), V(sx, 13.2, z), 0.05, 0x2a2e36, 6);
    rod(k, 'paintSteel', V(sx + 1.2, 9.3, z), V(sx, 12.6, z), 0.03, 0x2a2e36, 4);
  }
  rod(k, 'paintSteel', V(sx, 10.4, -7.5), V(sx, 10.4, 5.4), 0.04, 0x2a2e36, 4);
  const st = strokeText('HOTEL LUMEN');
  const sc = 1.7 / 6;
  const right = V(0, 0, 1);
  const o = V(sx - 0.15, 10.8, -st.width * sc * 0.5 - 1.05);
  for (const stroke of st.strokes) for (let j = 0; j + 1 < stroke.length; j++) {
    const pa = o.clone().addScaledVector(right, stroke[j]![0] * sc).addScaledVector(UP, stroke[j]![1] * sc);
    const pb = o.clone().addScaledVector(right, stroke[j + 1]![0] * sc).addScaledVector(UP, stroke[j + 1]![1] * sc);
    rod(k, 'glow', pa, pb, 0.045, hdr(0xffa531, k, 1.2), k.p.smallParts ? 7 : 4);
  }
  halo(k, V(sx - 0.2, 11.6, -1.05), V(-1, 0, 0), st.width * sc + 3, 4, 0xffa531, 0.25);
  lights.push({ pos: V(sx - 1.5, 11.5, -1), colour: 0xffa531, power: 30, range: 22 });
  // Skylights lit from the floors below, glowing up off the tall roofs.
  for (const [x0, x1, z0, z1] of [[8, 10.4, -4.2, -1.4], [12.4, 14.4, 3.2, 5.6], [-8.6, -6.4, 10.4, 12.4]] as const) {
    span(k, 'paintSteel', x0 - 0.1, x1 + 0.1, 9.3, 9.52, z0 - 0.1, z1 + 0.1, 0x3a3e48, { radius: 0.02 });
    screen(k, 'podGlow', V((x0 + x1) / 2, 9.521, (z0 + z1) / 2), UP, x1 - x0, z1 - z0, k.p.bloom ? 0.8 : 0.55);
    lights.push({ pos: V((x0 + x1) / 2, 10.4, (z0 + z1) / 2), colour: 0xb8a8ff, power: 3, range: 6 });
  }
  // A stair hut on the Tower roof, its door open on a lit stair, a bulkhead lamp over it pooling on the roof.
  span(k, 'plaster', 13.6, 15.8, 9.3, 11.7, -9.6, -7.4, 0x6a8a98, { radius: 0.03 });
  span(k, 'precast', 13.5, 15.9, 11.7, 11.85, -9.7, -7.3, 0x9a9aa2, { radius: 0.02 });
  screen(k, 'room0', V(13.6, 10.35, -8.5), V(-1, 0, 0), 0.9, 2.0, k.p.bloom ? 1.1 : 0.8);
  bar(k, 'glow', 13.55, 11.45, -8.5, 0.08, 0.1, 0.3, hdr(0xffd6a0, k, 0.8));
  halo(k, V(12.6, 9.32, -8.5), UP, 3.2, 3.2, 0xffc890, 0.45);
  lights.push({ pos: V(13.1, 11.3, -8.5), colour: 0xffc890, power: 6, range: 8 });
  // Festoon lights over a roof terrace on the Repair block: warm bulbs on a sagging line between three posts.
  const posts = [V(-11.4, 9.3, 6.2), V(-7.8, 9.3, 7.4), V(-4.4, 9.3, 6.0)];
  for (const p of posts) rod(k, 'paintSteel', p, p.clone().setY(11.9), 0.035, 0x2a2e36, 6);
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i]!.clone().setY(11.8);
    const b = posts[i + 1]!.clone().setY(11.8);
    cable(k, a, b, 0.45, 0.008);
    const n = Math.round(a.distanceTo(b) / 0.55);
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const pt = a.clone().lerp(b, t).add(V(0, -0.45 * 4 * t * (1 - t) - 0.06, 0));
      k.add('glow', new THREE.SphereGeometry(0.045, 8, 6), new THREE.Matrix4().makeTranslation(pt.x, pt.y, pt.z), hdr(j % 5 === 2 ? 0xff8ad8 : 0xffc070, k, 0.9), {});
    }
  }
  halo(k, V(-7.8, 9.32, 6.6), UP, 7.5, 3, 0xffb070, 0.3);
  lights.push({ pos: V(-7.8, 11.2, 6.6), colour: 0xffb070, power: 5, range: 8 });
  // The Arcade's low roof: flat things only (a hatch, a skylight lit from the arcade below, puddles).
  span(k, 'paintSteel', -12.4, -11.4, 6.3, 6.42, -6, -5, 0x5a5e66, { radius: 0.02 });
  span(k, 'nhGlass', -9.5, -6.5, 6.3, 6.4, -4, -2.5, 0x5a3aa0, { radius: 0.02 });
  screen(k, 'podGlow', V(-8, 6.41, -3.25), UP, 2.9, 1.4, k.p.bloom ? 0.9 : 0.6);
}

// ---------------------------------------------------------------------------------------------------------------- overhead cables

/** Cables slung between the buildings over the avenue and the alleys, high above every eye line, and a pair of trainers on one. */
function overhead(k: Kit, r: () => number): void {
  const spans: [THREE.Vector3, THREE.Vector3, number][] = [];
  for (let z = -13.5; z < 14; z += 2.2 + r() * 1.6) {
    const za = z + (r() - 0.5) * 1.5;
    const ya = z > 4.5 ? 8.9 + r() * 0.3 : 8.6 + r() * 1.0;
    spans.push([V(-3.5, ya, za), V(4, 8.8 + r() * 0.4, z + (r() - 0.5) * 1.5), 0.35 + r() * 0.5]);
  }
  // Noodle Alley and the Back Alley: from the buildings to the perimeter's top.
  for (let x = -14; x < -4; x += 2.4 + r()) spans.push([V(x, 6.2, -10), V(x + (r() - 0.5), 9.6, -HALF_Z), 0.3]);
  for (let x = 5; x < 16; x += 2.6 + r()) spans.push([V(x, 9.1, -11), V(x + (r() - 0.5), 9.6, -HALF_Z), 0.3]);
  // Lantern Lane: from the Arcade's roof edge to the Repair block, over the walkway's eye line.
  for (let x = -14; x < -8; x += 2) spans.push([V(x, 6.3, 2), V(x + 0.4, 8.4, 5), 0.2]);
  for (const [a, b, sag] of spans) {
    const n = k.p.smallParts ? 1 + Math.floor(r() * 3) : 1;
    for (let i = 0; i < n; i++) cable(k, a.clone().add(V(0, -i * 0.07, i * 0.05)), b.clone().add(V(0, -i * 0.09, i * 0.05)), sag + i * 0.08, 0.012 + r() * 0.008);
  }
  if (k.p.smallParts) {
    // Trainers thrown over a cable above the avenue, hanging by their laces.
    const c = V(0.9, 8.35, -9.2);
    for (const dx of [-0.08, 0.08]) {
      rod(k, 'dark', c.clone().add(V(dx * 0.3, 0.25, 0)), c.clone().add(V(dx, 0, 0)), 0.003, 0xe8e8e8, 3);
      span(k, 'rubber', c.x + dx - 0.04, c.x + dx + 0.04, c.y - 0.1, c.y, c.z - 0.13, c.z + 0.13, dx < 0 ? 0xe8e8ec : 0xd8d8de, { radius: 0.03 });
      span(k, 'rubber', c.x + dx - 0.045, c.x + dx + 0.045, c.y - 0.13, c.y - 0.1, c.z - 0.14, c.z + 0.14, 0xff3cac, { radius: 0.01 });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- litter

/** Litter on the street, all flat or low: squashed bags, flattened cartons, cans, bottles, cups, papers, leaves. */
function litter(k: Kit, r: () => number): void {
  const p = k.p;
  const seg = p.smallParts ? 12 : 6;
  const can = (x: number, z: number, col: number) => {
    const g = new THREE.CylinderGeometry(0.033, 0.033, 0.115, seg).rotateZ(Math.PI / 2);
    k.add('galv', g, new THREE.Matrix4().compose(V(x, 0.034, z), new THREE.Quaternion().setFromAxisAngle(UP, r() * 6), V(1, 1, 1)), col, {});
  };
  const bottle = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(0.035, 0.035, 0.22, seg).rotateZ(Math.PI / 2);
    k.add('nhGlass', g, new THREE.Matrix4().compose(V(x, 0.036, z), new THREE.Quaternion().setFromAxisAngle(UP, r() * 6), V(1, 1, 1)), r() > 0.5 ? 0x2a6a3a : 0x6a3a1a, {});
  };
  const cup = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(0.045, 0.032, 0.12, seg, 1, true).rotateZ(Math.PI / 2);
    k.add('plastic', g, new THREE.Matrix4().compose(V(x, 0.04, z), new THREE.Quaternion().setFromAxisAngle(UP, r() * 6), V(1, 1, 1)), r() > 0.5 ? 0xf4f1ea : 0xe8303c, {});
  };
  const box = (x: number, z: number) => {
    const w = 0.3 + r() * 0.3;
    const d = 0.2 + r() * 0.3;
    k.add('carton', new THREE.BoxGeometry(w, 0.02, d), new THREE.Matrix4().compose(V(x, 0.012, z), new THREE.Quaternion().setFromAxisAngle(UP, r() * 6), V(1, 1, 1)), 0xb08856, {});
  };
  const cans = [0xd8303c, 0x2a6ad8, 0xc8ccd0, 0x3ad07a, 0xffd23a];
  // Where litter collects: along wall bases, kerbs and corners; scattered thin elsewhere.
  const spots: [number, number][] = [];
  for (let i = 0; i < (p.smallParts ? 520 : 140); i++) {
    const x = (r() - 0.5) * 2 * (HALF_X - 0.3);
    const z = (r() - 0.5) * 2 * (HALF_Z - 0.3);
    // Keep it where it drifts: near something standing, or by a kerb.
    const nearKerb = Math.abs(x - AREA.road[0]) < 0.5 || Math.abs(x - AREA.road[1]) < 0.5;
    if (blocked(x, z, 0.02)) continue;
    if (!nearKerb && !blocked(x, z, 0.7) && r() > 0.25) continue;
    spots.push([x, z]);
  }
  for (const [x, z] of spots) {
    const t = r();
    if (t < 0.22) can(x, z, cans[Math.floor(r() * cans.length)]!);
    else if (t < 0.3) bottle(x, z);
    else if (t < 0.38) cup(x, z);
    else if (t < 0.46) box(x, z);
    else if (t < 0.6) decal(k, ['newspaper', 'flyer', 'wrapper', 'cardboard'][Math.floor(r() * 4)]!, V(x, 0.008, z), UP, 0.3 + r() * 0.3, 0.25 + r() * 0.25, 0xd8d8d8, r() * 6);
    else decal(k, 'leaves', V(x, 0.007, z), UP, 0.5 + r() * 0.6, 0.4 + r() * 0.5, 0xb8b8b8, r() * 6);
  }
  // Squashed bin bags in corners (each under 0.3 m), by the skip, the noodle stall and the vending machines.
  const heaps: [number, number, number, number][] = [
    [14.6, 15.0, -14.9, -14.2],
    [-8.75, -7.9, -12.6, -11.4],
    [-5.15, -4.7, -14.9, -13.6],
    [-5.15, -4.6, -12.55, -12.05],
    [16.9, 17.8, -14.9, -14.2],
    [-17.85, -17.3, 9.5, 10.2],
    [-3.45, -2.95, 12.7, 13.3],
    [6.4, 7.3, -11.0, -10.55],
  ];
  for (const [x0, x1, z0, z1] of heaps) {
    bags(k, x0, x1, z0, z1, 0, 0.28, r, p.smallParts ? 4 : 2);
    decal(k, 'stain', V((x0 + x1) / 2, 0.006, (z0 + z1) / 2), UP, (x1 - x0) + 1, (z1 - z0) + 1, 0x24242a, r() * 6);
  }
  // Grime and leaves along wall bases.
  for (let i = 0; i < (p.smallParts ? 50 : 16); i++) {
    const x = (r() - 0.5) * 2 * (HALF_X - 0.4);
    const z = (r() - 0.5) * 2 * (HALF_Z - 0.4);
    if (blocked(x, z, 0.02) || !blocked(x, z, 0.6)) continue;
    decal(k, 'stain', V(x, 0.005, z), UP, 1 + r() * 1.5, 0.8 + r(), 0x2a2a30, r() * 6);
  }
}

/** Manhole covers and gutter drains, flat on the street. Returns where steam comes up. */
function streetIron(k: Kit): THREE.Vector3[] {
  const holes: THREE.Vector3[] = [V(0.9, 0, -0.6), V(-0.6, 0, 9.6), V(-9.6, 0, -12.6), V(11.6, 0, -13.7), V(-20.4, 0, -1.6)];
  for (const h of holes) {
    k.add('tread', new THREE.CylinderGeometry(0.36, 0.36, 0.012, k.p.smallParts ? 28 : 12), new THREE.Matrix4().makeTranslation(h.x, 0.008, h.z), 0x5a5e66, {});
    decal(k, 'manhole', V(h.x, 0.015, h.z), UP, 0.72, 0.72, 0x2a2c30, hashPos(h.x, h.z) * 6);
  }
  for (const z of [-12, -6.5, 1.5, 7.5, 13]) for (const x of [AREA.road[0] + 0.18, AREA.road[1] - 0.18]) {
    if (blocked(x, z, 0)) continue;
    span(k, 'dark', x - 0.16, x + 0.16, -0.004, 0.009, z - 0.4, z + 0.4, 0x0a0b0e, { radius: 0 });
    decal(k, 'drain', V(x, 0.01, z), UP, 0.3, 0.78, 0x4a4e56, Math.PI / 2);
  }
  return holes.slice(0, 4);
}

// ---------------------------------------------------------------------------------------------------------------- steam

/** A puff's opacity at the plume's foot (it thins as it rises): enough to read, never enough to hide behind. */
const STEAM_OPACITY = 0.38;

/** A thin plume of steam: soft puffs rising, spreading and fading, tinted by the light round it. */
export function steam(group: THREE.Group, at: THREE.Vector3, tint: number, n: number, height: number, drift: THREE.Vector3, strength = 1): void {
  const r = rng(Math.floor(Math.abs(at.x * 100 + at.z * 37)) + 3);
  for (let i = 0; i < n; i++) {
    const t = (i + r() * 0.5) / n;
    const mat = new THREE.SpriteMaterial({
      map: steamTex(),
      color: new THREE.Color(tint),
      transparent: true,
      opacity: (STEAM_OPACITY * (1 - t) * Math.min(1, t * 6 + 0.25)) * strength,
      depthWrite: false,
      fog: true,
    });
    mat.rotation = r() * 6;
    const s = new THREE.Sprite(mat);
    s.position.copy(at).add(V(0, 0.2 + t * height, 0)).addScaledVector(drift, t * t * height).add(V((r() - 0.5) * 0.3 * t, 0, (r() - 0.5) * 0.3 * t));
    const sc = 0.5 + t * 2.4;
    s.scale.set(sc * (1 + r() * 0.3), sc, 1);
    s.renderOrder = 3;
    group.add(s);
  }
}

/**
 * Noodle Alley's north-east corner, by the vending machines: a GYOZA blade sign high on the wall with one letter dead and
 * one caught mid-flicker, a kitchen extract vent breathing steam above head height, and a gutter drain steaming at the
 * foot of the wall. All on the perimeter wall's face or flat on the paving.
 */
function noodleCorner(k: Kit, group: THREE.Group, lights: Spot[]): void {
  const wallZ = -HALF_Z;
  const n = V(0, 0, 1);
  wallSign(k, V(-7.75, CORNER_SIGN_Y, wallZ), n, V(1, 0, 0), 'GYOZA', 0xffa531, lights, 0.36, [3], [1]);
  // The extract vent: a louvred box flush on the wall, a duct up to the cornice, and its plume.
  const vy = 3.1;
  span(k, 'galv', -3.95, -3.35, vy - 0.3, vy + 0.3, wallZ, wallZ + 0.04, 0x9aa0a8, { radius: 0.01 });
  for (let i = 0; i < 5; i++) span(k, 'dark', -3.9, -3.4, vy - 0.24 + i * 0.11, vy - 0.2 + i * 0.11, wallZ + 0.04, wallZ + 0.05, 0x14161a, { radius: 0 });
  rod(k, 'galv', V(-3.65, vy + 0.3, wallZ + 0.12), V(-3.65, 9.7, wallZ + 0.12), 0.1, 0x8a9096, 10, false);
  steam(group, V(-3.65, vy - 0.1, wallZ + 0.3), 0xffc8b0, k.p.smallParts ? 9 : 4, 2.2, V(0.15, 0, 0.35), 0.75);
  // A service hatch in the paving by the machines, steaming low.
  k.add('tread', new THREE.CylinderGeometry(0.3, 0.3, 0.012, k.p.smallParts ? 24 : 10), new THREE.Matrix4().makeTranslation(-3.95, 0.008, -12.55), 0x5a5e66, {});
  decal(k, 'manhole', V(-3.95, 0.015, -12.55), UP, 0.6, 0.6, 0x2a2c30, 1.1);
  steam(group, V(-3.95, -0.1, -12.55), 0xd8b8ff, k.p.smallParts ? 10 : 4, 2.4, V(0.1, 0, 0.2), 0.85);
}

/** The corner sign's centre height: flush on the wall, its foot above head height (a player is 1.8 m, a jump 0.5 more). */
const CORNER_SIGN_Y = 3.15;

/** Everything above, added to `k` (and steam sprites to `group`). */
export function dressCity(k: Kit, group: THREE.Group, lights: Spot[], lowNear?: THREE.Vector3): void {
  const r = rng(23);
  outerRing(k, lights, r, lowNear);
  siteWalls(k, r);
  siteRoofs(k, lights, r);
  overhead(k, r);
  litter(k, r);
  const holes = streetIron(k);
  const full = k.p.smallParts;
  const tints = [0xd8a0e8, 0xb8c8ff, 0xffc8a0, 0xa0f0ff];
  holes.forEach((h, i) => steam(group, h, tints[i % tints.length]!, full ? 12 : 5, 3.2, V(0.15, 0, -0.1), 0.9));
  noodleCorner(k, group, lights);
  // The noodle pot, the Arcade's wall vent, a roof vent on the Repair block.
  steam(group, V(-9.5, 1.15, -10.3), 0xffd0b0, full ? 8 : 3, 1.6, V(0, 0, 0.2), 0.8);
  steam(group, V(-7.2, 4.5, -10.4), 0xffb0e0, full ? 8 : 3, 2.5, V(0.1, 0, -0.3), 0.8);
  steam(group, V(-6.5, 9.4, 12.5), 0xc0b0ff, full ? 10 : 4, 5, V(0.3, 0, -0.1), 1);
  // A squashed bag and a crate of empties beside the Back Alley skip are inside heaps above; a bag shape cached:
  void bagGeo;
}
