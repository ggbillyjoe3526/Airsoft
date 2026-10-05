import * as THREE from 'three';
import { Kit } from './kit';

/**
 * Replicas built in code, Marathon-style: hard-edged, chamfered slabs and near-modular parts, with Valorant's clean
 * two-tone finish. Ultra adds the small parts (rail teeth, slots, serrations, screws, switches) and bevels every
 * profile; Low keeps the silhouette with plain extrusions. Every replica points along -Z, the grip's top at the origin.
 */

export type ReplicaId = 'aeg' | 'pistol' | 'cyber';
export interface ReplicaOpts {
  optic?: 'redDot' | 'scope2x';
  grip?: 'vertical' | 'angled';
  muzzle?: 'silencer';
  barrel?: 'long';
  torch?: boolean;
  laser?: boolean;
  mag?: 'hiCap' | 'extended';
  /** The two-tone colour scheme (William, round 2: bold colours that sit with the maps, Marathon style). */
  scheme?: SchemeId;
  /** The "Realistic colours" setting: each scheme swaps for one plain family (black, grey, tan or green), never mixed. */
  realistic?: boolean;
  /** Older options, still accepted: a furniture colour over the scheme's, and a team accent (unused since v3). */
  furniture?: number;
  accent?: number;
}

/**
 * A replica's colours by role: the body (receiver, slide), the furniture (stock, grip, handguard, foregrip), the
 * details (rails, sights, mags, small parts) and a thin accent line (glowing when `glow`). Every scheme is two-tone
 * at heart, like a painted airsoft replica, and names the plain scheme the Realistic colours setting swaps it for.
 */
export interface Scheme {
  name: string;
  body: number;
  furniture: number;
  detail: number;
  accent: number;
  glow?: boolean;
  /** Barrel and muzzle steel. */
  steel: number;
  realistic: SchemeId;
}

export type SchemeId = 'cobalt' | 'signal' | 'acid' | 'ghost' | 'onyx' | 'coral' | 'teal' | 'hazard' | 'black' | 'grey' | 'tan' | 'ranger';

export const SCHEMES: Record<SchemeId, Scheme> = {
  // Bold: colours taken from the maps (container teal, safety orange, hazard yellow, team blue).
  cobalt: { name: 'Cobalt', body: 0x24282f, furniture: 0x2f6fd6, detail: 0x30343b, accent: 0xf2f0ea, steel: 0x484d56, realistic: 'black' },
  signal: { name: 'Signal', body: 0xe8ebee, furniture: 0xff5a1f, detail: 0x2a2d33, accent: 0x2a2d33, steel: 0x484d56, realistic: 'tan' },
  acid: { name: 'Acid', body: 0x2a2e33, furniture: 0xb8e636, detail: 0x1e2125, accent: 0xb8e636, steel: 0x40454c, realistic: 'ranger' },
  teal: { name: 'Teal', body: 0x23272c, furniture: 0x22a196, detail: 0x2e3238, accent: 0xffb23a, steel: 0x484d56, realistic: 'ranger' },
  hazard: { name: 'Hazard', body: 0x2a2d32, furniture: 0xf0b429, detail: 0x1f2226, accent: 0x1f2226, steel: 0x484d56, realistic: 'tan' },
  coral: { name: 'Coral', body: 0xf1ece3, furniture: 0xff4f6d, detail: 0x34373e, accent: 0x34373e, steel: 0x50555d, realistic: 'tan' },
  // Plain but stylish: all black with greys, and white with greys and a near-neon line.
  onyx: { name: 'Onyx', body: 0x1d1f23, furniture: 0x34383e, detail: 0x2a2d32, accent: 0x7d838c, steel: 0x40454c, realistic: 'black' },
  ghost: { name: 'Ghost', body: 0xeef0f2, furniture: 0xc4c9cf, detail: 0x3a3e45, accent: 0x30f0ff, glow: true, steel: 0x6a7079, realistic: 'grey' },
  // Realistic colours: one family each.
  black: { name: 'Black', body: 0x26292e, furniture: 0x30343a, detail: 0x2b2e33, accent: 0x4a4f56, steel: 0x3c4046, realistic: 'black' },
  grey: { name: 'Wolf grey', body: 0x4f545b, furniture: 0x646a72, detail: 0x464a50, accent: 0x7a8088, steel: 0x3c4046, realistic: 'grey' },
  tan: { name: 'Tan', body: 0xb49668, furniture: 0xc9ab79, detail: 0x564a39, accent: 0x8c7250, steel: 0x45433f, realistic: 'tan' },
  ranger: { name: 'Ranger green', body: 0x4a5439, furniture: 0x5a6645, detail: 0x434c34, accent: 0x6c7856, steel: 0x3f4536, realistic: 'ranger' },
};

/** The colours the builders below draw with, set per replica by buildReplica. */
let C: Scheme = SCHEMES.cobalt;

function useScheme(o: ReplicaOpts, fallback: SchemeId): Scheme {
  const base = SCHEMES[o.scheme ?? fallback];
  const pick = o.realistic ? SCHEMES[base.realistic] : base;
  return o.furniture !== undefined && !o.realistic ? { ...pick, furniture: o.furniture } : pick;
}

/** The accent line: a thin painted stripe, or a glowing one on schemes that have it. */
function accentSlab(k: Kit, f0: number, f1: number, u0: number, u1: number, hw: number, x = 0): void {
  if (C.glow && k.p.emissive) slab(k, 'figGlow', f0, f1, u0, u1, hw, new THREE.Color(C.accent).multiplyScalar(3) as unknown as number, x, 0.0004);
  else slab(k, 'gunPolymer', f0, f1, u0, u1, hw, C.accent, x, 0.0004);
}

export interface Replica {
  group: THREE.Group;
  /** Hand points (replica space): the firing hand's grip, the support hand, the stock's butt, the sight line. */
  grip: THREE.Vector3;
  support: THREE.Vector3;
  butt: THREE.Vector3;
  sight: THREE.Vector3;
  /** The firing hand's grip as an axis (top to bottom of the grip, replica space) with its half width and half depth. */
  hand: GripWrap;
  /** The support hand's grip (a vertical foregrip), when fitted. */
  supportGrip?: GripWrap;
  /** Where the trigger finger rests. */
  trigger: THREE.Vector3;
}

export interface GripWrap {
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  hx: number;
  hd: number;
}

const wrap = (top: [number, number, number], bottom: [number, number, number], hx: number, hd: number): GripWrap => ({ top: new THREE.Vector3(...top), bottom: new THREE.Vector3(...bottom), hx, hd });

const ORANGE_TIP = 0xff6a1a;

type P2 = [number, number];

/** Side-view profile (forward f, up u) extruded `w` wide, centred on x. */
function profile(k: Kit, key: string, pts: P2[], w: number, tint: number, x = 0, holes: P2[][] = []): void {
  const shape = new THREE.Shape(pts.map(([f, u]) => new THREE.Vector2(f, u)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([f, u]) => new THREE.Vector2(f, u))));
  const bevel = k.p.bevelSegments > 0;
  const bt = bevel ? Math.min(0.0025, w * 0.15) : 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, w - 2 * bt),
    bevelEnabled: bevel,
    bevelThickness: bt,
    bevelSize: bt * 0.8,
    bevelSegments: Math.max(1, k.p.bevelSegments - 1),
    curveSegments: 4,
  });
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  m.setPosition(x - w / 2 + bt, 0, 0);
  k.add(key, geo, m, tint, {});
}

/** Front-view shape (x, up u) extruded along the bore from f0 to f1: hoods, rings, anything you look through. */
function frontProfile(k: Kit, key: string, pts: P2[], f0: number, f1: number, tint: number, holes: P2[][] = []): void {
  const shape = new THREE.Shape(pts.map(([x, u]) => new THREE.Vector2(x, u)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, u]) => new THREE.Vector2(x, u))));
  const bevel = k.p.bevelSegments > 0;
  const bt = bevel ? 0.0015 : 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, f1 - f0 - 2 * bt),
    bevelEnabled: bevel,
    bevelThickness: bt,
    bevelSize: bt * 0.8,
    bevelSegments: Math.max(1, k.p.bevelSegments - 1),
    curveSegments: k.p.smallParts ? 12 : 4,
  });
  k.add(key, geo, new THREE.Matrix4().makeTranslation(0, 0, -f1 + bt), tint, {});
}

/** A rounded-rectangle outline (x, u) centred at (0, cu), for front profiles. */
function rrect(w: number, h: number, r: number, cu: number, n = 4): P2[] {
  const out: P2[] = [];
  const corners: [number, number, number][] = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (Math.PI / 2);
    out.push([cx + Math.cos(a) * r, cu + cy + Math.sin(a) * r]);
  }
  return out;
}

/** A box from forward f0..f1, up u0..u1, x half-width hw (centred at x). */
function slab(k: Kit, key: string, f0: number, f1: number, u0: number, u1: number, hw: number, tint: number, x = 0, r = 0.003): void {
  k.box(key, x, (u0 + u1) / 2, -(f0 + f1) / 2, hw * 2, u1 - u0, f1 - f0, tint, { radius: r });
}

/** A tube along the bore from f0 to f1 at height u. */
function tube(k: Kit, key: string, f0: number, f1: number, u: number, r: number, tint: number, sides?: number, x = 0): void {
  const g = new THREE.CylinderGeometry(r, r, f1 - f0, sides ?? k.p.curveSegments);
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  m.setPosition(x, u, -(f0 + f1) / 2);
  k.add(key, g, m, tint, {});
}

function rail(k: Kit, f0: number, f1: number, u: number, w: number, tint: number, x = 0): void {
  slab(k, 'gunMetal', f0, f1, u, u + 0.006, w / 2, tint, x, 0.001);
  if (k.p.smallParts) {
    for (let f = f0 + 0.004; f < f1 - 0.005; f += 0.01) slab(k, 'gunMetal', f, f + 0.0055, u + 0.006, u + 0.0105, w / 2, tint, x, 0.0008);
  } else {
    slab(k, 'gunMetal', f0, f1, u + 0.006, u + 0.0105, w / 2 - 0.002, tint, x, 0.001);
  }
}

function orangeTip(k: Kit, f: number, u: number, r: number, len = 0.012): void {
  tube(k, 'gunPolymer', f, f + len, u, r, ORANGE_TIP);
}

function redDot(k: Kit, f0: number, u: number): THREE.Vector3 {
  // An enclosed reflex sight: a squared hood you look THROUGH along the bore, a tinted lens across the window, the
  // dot on the lens, brightness buttons and a battery cap on the side, a low mount on the rail.
  const axis = u + 0.034;
  const len = 0.052;
  slab(k, 'gunMetal', f0 - 0.002, f0 + len + 0.002, u, u + 0.01, 0.015, C.detail, 0, 0.002);
  if (k.p.smallParts) for (const f of [f0 + 0.008, f0 + len - 0.012]) slab(k, 'gunMetal', f, f + 0.006, u - 0.004, u + 0.004, 0.017, C.steel, 0, 0.001);
  const outer = rrect(0.04, 0.046, 0.009, axis + 0.002, k.p.smallParts ? 5 : 2);
  const window = rrect(0.03, 0.032, 0.006, axis + 0.002, k.p.smallParts ? 5 : 2).reverse();
  frontProfile(k, 'gunMetal', outer, f0, f0 + len, C.detail, [window]);
  // The lens sits two-thirds of the way forward, tilted a touch like a real reflex window.
  const lens = new THREE.PlaneGeometry(0.031, 0.033);
  const lm = new THREE.Matrix4().makeRotationX(-0.12);
  lm.setPosition(0, axis + 0.002, -(f0 + len * 0.66));
  k.add('lens', lens, lm, 0x7fd8c0, {});
  const back = lens.clone().rotateY(Math.PI);
  k.add('lens', back, lm, 0x7fd8c0, {});
  if (k.p.emissive) k.add('figGlow', new THREE.SphereGeometry(0.0012, 8, 6), new THREE.Matrix4().makeTranslation(0, axis + 0.002, -(f0 + len * 0.66) + 0.0006), new THREE.Color(0xff2a2a).multiplyScalar(40), {});
  // A sunshade lip over the front, the buttons and the battery cap.
  slab(k, 'gunMetal', f0 + len - 0.004, f0 + len + 0.006, axis + 0.021, axis + 0.025, 0.017, C.detail, 0, 0.001);
  if (k.p.smallParts) {
    for (const f of [f0 + 0.012, f0 + 0.024]) slab(k, 'gunRubber', f, f + 0.008, u + 0.008, u + 0.014, 0.003, 0x2a2d32, 0.021, 0.001);
    tube(k, 'gunMetal', f0 + 0.03, f0 + 0.031, axis - 0.004, 0.0001, C.detail, 4);
    const cap = new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 16).rotateZ(Math.PI / 2);
    k.add('gunMetal', cap, new THREE.Matrix4().makeTranslation(0.022, axis - 0.004, -(f0 + 0.034)), C.steel, {});
    const turret = new THREE.CylinderGeometry(0.006, 0.006, 0.005, 16);
    k.add('gunMetal', turret, new THREE.Matrix4().makeTranslation(0, axis + 0.0275, -(f0 + 0.022)), C.steel, {});
  }
  return new THREE.Vector3(0, axis + 0.002, -f0);
}

function scope2x(k: Kit, f0: number, u: number): THREE.Vector3 {
  const axis = u + 0.04;
  for (const f of [f0 + 0.02, f0 + 0.085]) slab(k, 'gunMetal', f, f + 0.015, u, axis, 0.012, C.detail);
  tube(k, 'gunMetal', f0 - 0.01, f0 + 0.12, axis, 0.0145, C.detail);
  tube(k, 'gunMetal', f0 + 0.1, f0 + 0.14, axis, 0.021, C.detail);
  tube(k, 'gunMetal', f0 - 0.04, f0 - 0.005, axis, 0.019, C.detail);
  // Round lenses at both ends, facing along the bore.
  tube(k, 'lens', f0 + 0.137, f0 + 0.1395, axis, 0.018, 0x6fb4e8, k.p.smallParts ? 32 : 12);
  tube(k, 'lens', f0 - 0.0415, f0 - 0.039, axis, 0.0155, 0x6fb4e8, k.p.smallParts ? 32 : 12);
  tube(k, 'gunRubber', f0 - 0.05, f0 - 0.04, axis, 0.0205, 0x1c1e22, k.p.smallParts ? 32 : 12);
  if (k.p.smallParts) {
    tube(k, 'gunPolymer', f0 + 0.05, f0 + 0.066, axis, 0.0152, 0x8a6a40, 24);
    const t = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 16);
    k.add('gunMetal', t, new THREE.Matrix4().makeTranslation(0, axis + 0.019, -(f0 + 0.055)), C.detail, {});
    const t2 = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 16).rotateZ(Math.PI / 2);
    k.add('gunMetal', t2, new THREE.Matrix4().makeTranslation(0.019, axis, -(f0 + 0.055)), C.detail, {});
  }
  return new THREE.Vector3(0, axis, -f0 + 0.04);
}

function torch(k: Kit, f0: number, u: number, x: number, len = 0.09): void {
  slab(k, 'gunPolymer', f0 + 0.01, f0 + 0.04, u - 0.004, u + 0.004, 0.006, C.detail, x - 0.008 * Math.sign(x));
  tube(k, 'gunMetal', f0, f0 + len, u, 0.0105, C.detail, undefined, x);
  tube(k, 'gunMetal', f0 + len, f0 + len + 0.018, u, 0.0135, C.detail, undefined, x);
  if (k.p.emissive) tube(k, 'figGlow', f0 + len + 0.018, f0 + len + 0.0185, u, 0.011, new THREE.Color(0xfff6d8).multiplyScalar(4) as unknown as number, 24, x);
  if (k.p.smallParts) {
    for (let i = 0; i < 6; i++) tube(k, 'gunRubber', f0 + 0.012 + i * 0.008, f0 + 0.016 + i * 0.008, u, 0.0112, 0x1c1e22, 24, x);
    tube(k, 'gunRubber', f0 - 0.012, f0, u, 0.008, 0x1c1e22, 12, x);
  }
}

function silencer(k: Kit, f0: number, u: number, r: number, len: number, accent: number): void {
  tube(k, 'gunMetal', f0, f0 + len, u, r, C.steel, k.p.smallParts ? 6 : 6);
  tube(k, 'gunMetal', f0 + len, f0 + len + 0.006, u, r * 0.8, C.detail, 24);
  tube(k, C.glow && k.p.emissive ? 'figGlow' : 'gunPolymer', f0 + len * 0.2, f0 + len * 0.24, u, r * 1.03, C.glow && k.p.emissive ? (new THREE.Color(accent).multiplyScalar(3) as unknown as number) : accent, 6);
  if (k.p.smallParts) for (let i = 0; i < 5; i++) tube(k, 'gunMetal', f0 + 0.01 + i * 0.006, f0 + 0.013 + i * 0.006, u, r * 1.02, C.detail, 6);
  orangeTip(k, f0 + len + 0.006, u, r * 0.5, 0.004);
}

function buildAeg(k: Kit, o: ReplicaOpts): Replica {
  C = useScheme(o, 'cobalt');
  const body = C.body;
  const fur = C.furniture;
  const det = C.detail;
  const small = k.p.smallParts;
  // v3: a touch bulkier and blockier (William, round 2): wider receivers, a squarer handguard, chunkier stock and
  // grip, raised side plates. Still a believable AEG.
  // Upper receiver: an angular slab with a chamfered rear, a raised ejection-port panel and a side plate.
  profile(k, 'gunPaint', [[-0.118, 0.012], [0.16, 0.012], [0.16, 0.06], [-0.096, 0.06], [-0.118, 0.04]], 0.058, body);
  rail(k, -0.1, 0.16, 0.06, 0.024, det);
  if (small) {
    slab(k, 'gunMetal', -0.01, 0.045, 0.024, 0.05, 0.0302, C.steel);
    slab(k, 'gunPaint', -0.062, -0.044, 0.022, 0.046, 0.033, body); // forward assist block
    slab(k, 'gunPolymer', -0.135, -0.105, 0.044, 0.056, 0.014, det); // charging handle
    for (const f of [-0.08, 0.13]) tube(k, 'gunMetal', f, f + 0.0001, 0.03, 0.003, 0x8a8f96, 8, 0.0295);
  }
  slab(k, 'gunPaint', 0.06, 0.155, 0.02, 0.05, 0.0312, body, 0, 0.002);
  // Lower receiver with a flared, squared magwell and the accent line.
  profile(k, 'gunPaint', [[-0.108, -0.036], [0.152, -0.036], [0.152, 0.014], [-0.108, 0.014]], 0.054, body);
  profile(k, 'gunPaint', [[0.012, -0.03], [0.112, -0.03], [0.108, -0.09], [0.018, -0.09]], 0.054, body);
  slab(k, 'gunPaint', 0.012, 0.112, -0.094, -0.084, 0.0285, det, 0, 0.002); // magwell lip
  accentSlab(k, 0.06, 0.15, -0.008, -0.002, 0.0275);
  // Trigger guard (squared, thick) and trigger.
  profile(k, 'gunPolymer', [[-0.024, -0.03], [0.034, -0.03], [0.034, -0.076], [-0.03, -0.076]], 0.014, det, 0, [[[-0.015, -0.037], [0.025, -0.037], [0.025, -0.067], [-0.019, -0.067]]]);
  slab(k, 'gunMetal', -0.004, 0.004, -0.06, -0.034, 0.003, C.steel);
  // Pistol grip: a solid block with a slight rake, a palm shelf and a squared base cap.
  profile(k, 'gunFurniture', [[-0.012, -0.032], [-0.062, -0.032], [-0.1, -0.134], [-0.098, -0.146], [-0.062, -0.15], [-0.03, -0.098], [-0.024, -0.07]], 0.038, fur);
  slab(k, 'gunFurniture', -0.104, -0.06, -0.156, -0.144, 0.0195, det, 0, 0.002);
  if (small) for (let i = 0; i < 4; i++) slab(k, 'gunRubber', -0.074 + i * 0.008, -0.07 + i * 0.008, -0.122 + i * 0.02, -0.114 + i * 0.02, 0.0192, new THREE.Color(fur).multiplyScalar(0.72) as unknown as number, 0, 0.001);
  // Buffer tube and a hard-angled modular stock with a cheek riser, a block butt and a rubber pad.
  tube(k, 'gunMetal', -0.3, -0.105, 0.03, 0.017, det, k.p.curveSegments);
  profile(k, 'gunFurniture', [[-0.162, 0.056], [-0.34, 0.062], [-0.36, 0.05], [-0.36, -0.07], [-0.312, -0.076], [-0.236, 0.0], [-0.162, 0.012]], 0.048, fur, 0, k.p.smallParts ? [[[-0.215, 0.012], [-0.28, 0.012], [-0.3, -0.032], [-0.255, -0.032]]] : []);
  slab(k, 'gunFurniture', -0.335, -0.2, 0.062, 0.076, 0.02, fur);
  slab(k, 'gunPaint', -0.36, -0.3, -0.078, 0.064, 0.026, det, 0, 0.004);
  slab(k, 'gunRubber', -0.378, -0.36, -0.072, 0.064, 0.025, 0x22252a, 0, 0.004);
  accentSlab(k, -0.3, -0.24, 0.0555, 0.0605, 0.0242);
  // Handguard: a squared slab with chamfered corners, M-LOK slots and a full top rail.
  const hg: P2[] = [[0.16, -0.004], [0.42, -0.004], [0.43, 0.012], [0.43, 0.058], [0.42, 0.068], [0.16, 0.068]];
  const holes: P2[][] = [];
  if (small) for (const f of [0.2, 0.25, 0.3, 0.35]) holes.push([[f, 0.02], [f + 0.032, 0.02], [f + 0.032, 0.032], [f, 0.032]]);
  profile(k, 'gunFurniture', hg, 0.068, fur, 0, holes);
  if (!small) for (const f of [0.2, 0.25, 0.3, 0.35]) for (const sd of [-1, 1]) slab(k, 'dark', f, f + 0.032, 0.02, 0.032, 0.001, 0x1a1c20, sd * 0.0345, 0);
  if (small) slab(k, 'dark', 0.17, 0.41, 0.004, 0.06, 0.03, 0x14161a, 0, 0); // the dark inside seen through the slots
  rail(k, 0.165, 0.42, 0.068, 0.024, det);
  slab(k, 'gunFurniture', 0.17, 0.41, -0.012, -0.004, 0.026, det, 0, 0.002); // a bottom rail strip
  accentSlab(k, 0.165, 0.42, 0.04, 0.044, 0.0342);
  // Barrel, gas block, muzzle.
  const longB = o.barrel === 'long' ? 0.1 : 0;
  tube(k, 'gunMetal', 0.42, 0.56 + longB, 0.034, 0.0105, C.steel);
  slab(k, 'gunPolymer', 0.43, 0.46, 0.02, 0.05, 0.017, det);
  if (o.muzzle === 'silencer') silencer(k, 0.56 + longB, 0.034, 0.021, 0.13, C.accent);
  else {
    tube(k, 'gunMetal', 0.56 + longB, 0.61 + longB, 0.034, 0.0125, det, small ? 12 : 8);
    if (small) for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) slab(k, 'dark', 0.57 + longB + i * 0.012, 0.576 + longB + i * 0.012, 0.03, 0.038, 0.001, 0x101114, sd * 0.0125, 0);
    orangeTip(k, 0.61 + longB, 0.034, 0.0112);
  }
  // Magazine: an angular, gently forward-curved mag (hi-cap: a wider body with a winding wheel).
  const hi = o.mag === 'hiCap';
  profile(k, 'gunPolymer', [[0.024, -0.086], [0.104, -0.086], [0.116, -0.2], [0.108, -0.238], [0.04, -0.234], [0.032, -0.2]], hi ? 0.044 : 0.036, det);
  if (hi) {
    const wheel = new THREE.CylinderGeometry(0.013, 0.013, 0.006, 16).rotateZ(Math.PI / 2);
    k.add('gunPolymer', wheel, new THREE.Matrix4().makeTranslation(0.0, -0.215, -0.072), 0x55595f, {});
  } else if (small) {
    for (let i = 0; i < 4; i++) slab(k, 'gunPolymer', 0.04 + i * 0.002, 0.098 + i * 0.003, -0.112 - i * 0.025, -0.106 - i * 0.025, 0.0188, new THREE.Color(det).multiplyScalar(1.15) as unknown as number, 0, 0.001);
  }
  // Sights: flip-ups folded when an optic is fitted.
  let sight: THREE.Vector3;
  if (o.optic === 'redDot') sight = redDot(k, 0.0, 0.0705);
  else if (o.optic === 'scope2x') sight = scope2x(k, 0.0, 0.0705);
  else {
    slab(k, 'gunPolymer', -0.09, -0.07, 0.0705, 0.102, 0.012, det);
    slab(k, 'gunPolymer', 0.39, 0.41, 0.0745, 0.107, 0.008, det);
    sight = new THREE.Vector3(0, 0.102, 0.1);
  }
  if (o.optic) {
    slab(k, 'gunPolymer', -0.09, -0.07, 0.0705, 0.079, 0.012, det);
    slab(k, 'gunPolymer', 0.39, 0.41, 0.0745, 0.083, 0.008, det);
  }
  // Foregrip and torch on the handguard.
  if (o.grip === 'vertical') {
    slab(k, 'gunPolymer', 0.298, 0.334, -0.016, -0.004, 0.014, det);
    profile(k, 'gunFurniture', [[0.298, -0.014], [0.336, -0.014], [0.332, -0.104], [0.324, -0.114], [0.304, -0.114], [0.296, -0.104]], 0.034, fur);
    if (small) for (let i = 0; i < 3; i++) slab(k, 'gunRubber', 0.297, 0.335, -0.04 - i * 0.022, -0.033 - i * 0.022, 0.0172, new THREE.Color(fur).multiplyScalar(0.72) as unknown as number, 0, 0.001);
  } else if (o.grip === 'angled') {
    profile(k, 'gunFurniture', [[0.24, -0.008], [0.34, -0.008], [0.33, -0.028], [0.255, -0.056]], 0.034, fur);
  }
  if (o.torch) torch(k, 0.32, 0.034, 0.046);
  return {
    group: new THREE.Group(),
    grip: new THREE.Vector3(0, -0.05, 0.045),
    support: new THREE.Vector3(0, -0.024, o.grip === 'vertical' ? -0.32 : -0.3),
    butt: new THREE.Vector3(0, 0.0, 0.37),
    sight,
    hand: wrap([0, -0.068, 0.05], [0, -0.138, 0.079], 0.019, 0.023),
    supportGrip: o.grip === 'vertical' ? wrap([0, -0.032, -0.317], [0, -0.1, -0.315], 0.017, 0.017) : undefined,
    trigger: new THREE.Vector3(0, -0.052, -0.001),
  };
}

function buildPistol(k: Kit, o: ReplicaOpts): Replica {
  C = useScheme(o, 'onyx');
  const body = C.body;
  const fur = C.furniture;
  const det = C.detail;
  const small = k.p.smallParts;
  // Slide: squarer and a little wider (v3), angular top chamfers, front and rear serrations, an ejection port.
  profile(k, 'gunPaint', [[-0.086, 0.0], [0.106, 0.0], [0.106, 0.03], [0.097, 0.038], [-0.076, 0.038], [-0.086, 0.032]], 0.034, body);
  slab(k, 'gunPaint', -0.07, 0.092, 0.036, 0.04, 0.0125, body, 0, 0.001);
  if (small) {
    for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) slab(k, 'dark', -0.075 + i * 0.0065, -0.072 + i * 0.0065, 0.006, 0.034, 0.0008, 0x0f1012, sd * 0.0172, 0);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) slab(k, 'dark', 0.077 + i * 0.0065, 0.08 + i * 0.0065, 0.008, 0.032, 0.0008, 0x0f1012, sd * 0.0172, 0);
    slab(k, 'gunMetal', 0.0, 0.035, 0.014, 0.038, 0.0174, C.steel, 0.0005, 0.001);
  }
  accentSlab(k, -0.08, 0.1, 0.012, 0.016, 0.0172);
  // Sights.
  slab(k, 'gunMetal', -0.08, -0.068, 0.038, 0.048, 0.012, det, 0, 0.001);
  slab(k, 'gunMetal', 0.088, 0.097, 0.038, 0.046, 0.0035, det, 0, 0.001);
  // Frame with a dust-cover rail, squared trigger guard.
  profile(k, 'gunPolymer', [[-0.076, -0.012], [0.102, -0.012], [0.102, 0.002], [-0.076, 0.002]], 0.032, fur);
  rail(k, 0.03, 0.097, -0.025, 0.022, fur);
  slab(k, 'gunPolymer', 0.025, 0.102, -0.025, -0.012, 0.014, fur);
  profile(k, 'gunPolymer', [[-0.004, -0.012], [0.054, -0.012], [0.054, -0.047], [-0.008, -0.047]], 0.014, fur, 0, [[[0.003, -0.019], [0.047, -0.019], [0.047, -0.04], [-0.001, -0.04]]]);
  slab(k, 'gunMetal', 0.006, 0.012, -0.034, -0.012, 0.003, C.steel);
  // Grip: a solid, rectangular block at a steady rake, straight front and back straps, the same width all the way
  // down, a short beavertail on top. Stippled panels on both sides.
  profile(k, 'gunPolymer', [[-0.012, -0.012], [-0.078, -0.012], [-0.094, -0.003], [-0.099, -0.009], [-0.082, -0.024], [-0.11, -0.128], [-0.106, -0.132], [-0.054, -0.132], [-0.051, -0.129], [-0.02, -0.02]], 0.035, fur);
  if (small) {
    const stip = new THREE.Color(fur).multiplyScalar(0.8) as unknown as number;
    profile(k, 'gunRubber', [[-0.03, -0.04], [-0.078, -0.04], [-0.102, -0.12], [-0.056, -0.12]], 0.0366, stip);
    slab(k, 'gunPolymer', -0.024, -0.02, -0.03, -0.024, 0.018, fur, 0, 0.001); // a small thumb ledge
  }
  // Magazine base (extended: a longer base pad), squared to the grip.
  const ext = o.mag === 'extended' ? 0.03 : 0;
  profile(k, 'gunPolymer', [[-0.05, -0.13], [-0.112, -0.13], [-0.114, -0.143 - ext], [-0.052, -0.143 - ext]], 0.037, det);
  if (ext) accentSlab(k, -0.107, -0.055, -0.134, -0.131, 0.0188);
  // Barrel and orange tip.
  tube(k, 'gunMetal', 0.08, 0.108, 0.016, 0.0068, C.steel, 16);
  if (o.muzzle === 'silencer') silencer(k, 0.108, 0.016, 0.0145, 0.1, C.accent);
  else orangeTip(k, 0.106, 0.016, 0.006, 0.004);
  if (o.laser) {
    profile(k, 'gunPolymer', [[0.03, -0.025], [0.1, -0.025], [0.1, -0.052], [0.04, -0.052], [0.03, -0.042]], 0.028, det);
    if (k.p.emissive) tube(k, 'figGlow', 0.1, 0.1005, -0.038, 0.003, new THREE.Color(0xff2020).multiplyScalar(30) as unknown as number, 12);
    tube(k, 'lens', 0.099, 0.1002, -0.038, 0.005, 0x802020, 16);
  }
  if (o.torch) torch(k, 0.035, -0.041, 0, 0.055);
  return { group: new THREE.Group(), grip: new THREE.Vector3(0, -0.04, 0.045), support: new THREE.Vector3(0, -0.07, 0.04), butt: new THREE.Vector3(0, 0, 0.1), sight: new THREE.Vector3(0, 0.048, 0.06), hand: wrap([0, -0.04, 0.057], [0, -0.124, 0.0805], 0.0175, 0.027), trigger: new THREE.Vector3(0, -0.027, -0.009) };
}

function buildCyber(k: Kit, o: ReplicaOpts): Replica {
  // The Cyber Pistol: a white slab of a pistol with cyan light lines and a magenta core: Marathon by way of Neon Heights.
  const small = k.p.smallParts;
  C = SCHEMES.onyx;
  // Realistic colours: a dark grey slab with plain grey lines instead of the white body and the glow.
  const real = o.realistic === true;
  const white = real ? 0x4a4f57 : 0xe9edf0;
  const cyan = real ? new THREE.Color(0x2a2d32) : new THREE.Color(0x30f0ff).multiplyScalar(3);
  const magenta = real ? new THREE.Color(0x6a7079) : new THREE.Color(0xff3aa8).multiplyScalar(3);
  profile(k, 'gunPolymer', [[-0.09, -0.004], [0.11, -0.004], [0.12, 0.012], [0.11, 0.04], [-0.06, 0.044], [-0.09, 0.032]], 0.034, white);
  profile(k, 'gunPolymer', [[-0.004, -0.004], [0.06, -0.004], [0.06, -0.048], [-0.01, -0.048]], 0.012, 0x23262c, 0, [[[0.004, -0.012], [0.052, -0.012], [0.052, -0.04], [0.0, -0.04]]]);
  profile(k, 'gunPolymer', [[-0.004, -0.004], [-0.08, -0.004], [-0.094, -0.012], [-0.08, -0.024], [-0.108, -0.13], [-0.054, -0.13], [-0.02, -0.014]], 0.032, 0x23262c);
  slab(k, 'gunPolymer', -0.112, -0.05, -0.142, -0.13, 0.0175, white, 0, 0.003);
  slab(k, 'gunPolymer', 0.06, 0.112, -0.03, -0.004, 0.014, white);
  // Light lines along both sides and a glowing core window.
  for (const s of [-1, 1]) {
    slab(k, 'figGlow', -0.07, 0.1, 0.022, 0.025, 0.0007, cyan as unknown as number, s * 0.0172, 0);
    if (small) slab(k, 'figGlow', -0.05, 0.02, 0.031, 0.033, 0.0007, cyan as unknown as number, s * 0.0172, 0);
    slab(k, 'figGlow', 0.0, 0.05, 0.004, 0.014, 0.0007, magenta as unknown as number, s * 0.0172, 0);
  }
  profile(k, 'figGlow', [[-0.083, -0.03], [-0.087, -0.03], [-0.106, -0.112], [-0.102, -0.112]], 0.012, cyan as unknown as number);
  // Top fin sight and a muzzle with a cyan ring.
  profile(k, 'gunPolymer', [[-0.05, 0.044], [-0.02, 0.044], [-0.03, 0.056], [-0.046, 0.056]], 0.008, 0x23262c);
  tube(k, 'gunMetal', 0.112, 0.124, 0.02, 0.008, 0x23262c, 6);
  tube(k, 'figGlow', 0.124, 0.1245, 0.02, 0.0085, cyan as unknown as number, 6);
  if (small) profile(k, 'gunRubber', [[-0.03, -0.04], [-0.076, -0.04], [-0.1, -0.118], [-0.056, -0.118]], 0.0336, 0x3a3e46);
  if (o.torch) torch(k, 0.04, -0.04, 0, 0.05);
  return { group: new THREE.Group(), grip: new THREE.Vector3(0, -0.04, 0.045), support: new THREE.Vector3(0, -0.07, 0.04), butt: new THREE.Vector3(0, 0, 0.1), sight: new THREE.Vector3(0, 0.056, 0.04), hand: wrap([0, -0.04, 0.056], [0, -0.122, 0.0795], 0.016, 0.027), trigger: new THREE.Vector3(0, -0.026, -0.009) };
}

export function buildReplica(k: Kit, id: ReplicaId, o: ReplicaOpts = {}): Replica {
  const r = id === 'aeg' ? buildAeg(k, o) : id === 'pistol' ? buildPistol(k, o) : buildCyber(k, o);
  r.group = k.build();
  return r;
}

/** Attachments on their own, for the armoury shot. */
export function buildAttachment(k: Kit, id: string, scheme: SchemeId = 'onyx', realistic = false): THREE.Group {
  C = useScheme({ scheme, realistic }, 'onyx');
  const acc = C.accent;
  switch (id) {
    case 'redDot':
      rail(k, -0.01, 0.07, -0.006, 0.022, C.detail);
      redDot(k, 0.0, 0.0045);
      break;
    case 'scope2x':
      rail(k, -0.01, 0.13, -0.006, 0.022, C.detail);
      scope2x(k, 0.0, 0.0045);
      break;
    case 'silencer':
      silencer(k, 0, 0, 0.019, 0.13, acc);
      break;
    case 'torch':
      torch(k, 0, 0, 0, 0.09);
      break;
    case 'vertical':
      slab(k, 'gunPolymer', -0.002, 0.032, -0.008, 0.0, 0.012, C.detail);
      profile(k, 'gunFurniture', [[0.0, -0.008], [0.034, -0.008], [0.03, -0.1], [0.022, -0.11], [0.004, -0.11], [-0.002, -0.1]], 0.03, C.furniture);
      if (k.p.smallParts) for (let i = 0; i < 3; i++) slab(k, 'gunRubber', -0.001, 0.033, -0.035 - i * 0.022, -0.028 - i * 0.022, 0.0152, new THREE.Color(C.furniture).multiplyScalar(0.72) as unknown as number, 0, 0.001);
      break;
    case 'angled':
      profile(k, 'gunFurniture', [[0.0, 0.0], [0.1, 0.0], [0.09, -0.02], [0.015, -0.048]], 0.03, C.furniture);
      break;
    case 'laser':
      profile(k, 'gunPolymer', [[0.0, 0.0], [0.068, 0.0], [0.068, -0.026], [0.01, -0.026], [0.0, -0.016]], 0.026, C.detail);
      if (k.p.emissive) tube(k, 'figGlow', 0.068, 0.0685, -0.013, 0.003, new THREE.Color(0xff2020).multiplyScalar(30) as unknown as number, 12);
      break;
    case 'hiCap':
      profile(k, 'gunPolymer', [[0.0, 0.0], [0.072, 0.0], [0.086, -0.12], [0.078, -0.155], [0.014, -0.15], [0.006, -0.12]], 0.04, 0x30343a);
      {
        const wheel = new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16).rotateZ(Math.PI / 2);
        k.add('gunPolymer', wheel, new THREE.Matrix4().makeTranslation(0.0, -0.135, -0.045), 0x55595f, {});
      }
      break;
    case 'longBarrel':
      tube(k, 'gunMetal', 0, 0.16, 0, 0.0095, C.steel);
      tube(k, 'gunMetal', 0.16, 0.21, 0, 0.0115, C.detail, k.p.smallParts ? 12 : 8);
      orangeTip(k, 0.21, 0, 0.0102);
      break;
  }
  return k.build();
}
