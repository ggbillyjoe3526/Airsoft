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
  /** Furniture colour (tan by default); the accent is a thin team stripe. */
  furniture?: number;
  accent?: number;
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

const BLACK = 0x3a3e46;
const GUNMETAL = 0x484d56;
const TAN = 0xc7a46e;
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
  slab(k, 'gunMetal', f0 - 0.002, f0 + len + 0.002, u, u + 0.01, 0.015, BLACK, 0, 0.002);
  if (k.p.smallParts) for (const f of [f0 + 0.008, f0 + len - 0.012]) slab(k, 'gunMetal', f, f + 0.006, u - 0.004, u + 0.004, 0.017, GUNMETAL, 0, 0.001);
  const outer = rrect(0.04, 0.046, 0.009, axis + 0.002, k.p.smallParts ? 5 : 2);
  const window = rrect(0.03, 0.032, 0.006, axis + 0.002, k.p.smallParts ? 5 : 2).reverse();
  frontProfile(k, 'gunMetal', outer, f0, f0 + len, BLACK, [window]);
  // The lens sits two-thirds of the way forward, tilted a touch like a real reflex window.
  const lens = new THREE.PlaneGeometry(0.031, 0.033);
  const lm = new THREE.Matrix4().makeRotationX(-0.12);
  lm.setPosition(0, axis + 0.002, -(f0 + len * 0.66));
  k.add('lens', lens, lm, 0x7fd8c0, {});
  const back = lens.clone().rotateY(Math.PI);
  k.add('lens', back, lm, 0x7fd8c0, {});
  if (k.p.emissive) k.add('figGlow', new THREE.SphereGeometry(0.0012, 8, 6), new THREE.Matrix4().makeTranslation(0, axis + 0.002, -(f0 + len * 0.66) + 0.0006), new THREE.Color(0xff2a2a).multiplyScalar(40), {});
  // A sunshade lip over the front, the buttons and the battery cap.
  slab(k, 'gunMetal', f0 + len - 0.004, f0 + len + 0.006, axis + 0.021, axis + 0.025, 0.017, BLACK, 0, 0.001);
  if (k.p.smallParts) {
    for (const f of [f0 + 0.012, f0 + 0.024]) slab(k, 'gunRubber', f, f + 0.008, u + 0.008, u + 0.014, 0.003, 0x2a2d32, 0.021, 0.001);
    tube(k, 'gunMetal', f0 + 0.03, f0 + 0.031, axis - 0.004, 0.0001, BLACK, 4);
    const cap = new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 16).rotateZ(Math.PI / 2);
    k.add('gunMetal', cap, new THREE.Matrix4().makeTranslation(0.022, axis - 0.004, -(f0 + 0.034)), GUNMETAL, {});
    const turret = new THREE.CylinderGeometry(0.006, 0.006, 0.005, 16);
    k.add('gunMetal', turret, new THREE.Matrix4().makeTranslation(0, axis + 0.0275, -(f0 + 0.022)), GUNMETAL, {});
  }
  return new THREE.Vector3(0, axis + 0.002, -f0);
}

function scope2x(k: Kit, f0: number, u: number): THREE.Vector3 {
  const axis = u + 0.04;
  for (const f of [f0 + 0.02, f0 + 0.085]) slab(k, 'gunMetal', f, f + 0.015, u, axis, 0.012, BLACK);
  tube(k, 'gunMetal', f0 - 0.01, f0 + 0.12, axis, 0.0145, BLACK);
  tube(k, 'gunMetal', f0 + 0.1, f0 + 0.14, axis, 0.021, BLACK);
  tube(k, 'gunMetal', f0 - 0.04, f0 - 0.005, axis, 0.019, BLACK);
  // Round lenses at both ends, facing along the bore.
  tube(k, 'lens', f0 + 0.137, f0 + 0.1395, axis, 0.018, 0x6fb4e8, k.p.smallParts ? 32 : 12);
  tube(k, 'lens', f0 - 0.0415, f0 - 0.039, axis, 0.0155, 0x6fb4e8, k.p.smallParts ? 32 : 12);
  tube(k, 'gunRubber', f0 - 0.05, f0 - 0.04, axis, 0.0205, 0x1c1e22, k.p.smallParts ? 32 : 12);
  if (k.p.smallParts) {
    tube(k, 'gunPolymer', f0 + 0.05, f0 + 0.066, axis, 0.0152, 0x8a6a40, 24);
    const t = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 16);
    k.add('gunMetal', t, new THREE.Matrix4().makeTranslation(0, axis + 0.019, -(f0 + 0.055)), BLACK, {});
    const t2 = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 16).rotateZ(Math.PI / 2);
    k.add('gunMetal', t2, new THREE.Matrix4().makeTranslation(0.019, axis, -(f0 + 0.055)), BLACK, {});
  }
  return new THREE.Vector3(0, axis, -f0 + 0.04);
}

function torch(k: Kit, f0: number, u: number, x: number, len = 0.09): void {
  slab(k, 'gunPolymer', f0 + 0.01, f0 + 0.04, u - 0.004, u + 0.004, 0.006, BLACK, x - 0.008 * Math.sign(x));
  tube(k, 'gunMetal', f0, f0 + len, u, 0.0105, BLACK, undefined, x);
  tube(k, 'gunMetal', f0 + len, f0 + len + 0.018, u, 0.0135, BLACK, undefined, x);
  if (k.p.emissive) tube(k, 'figGlow', f0 + len + 0.018, f0 + len + 0.0185, u, 0.011, new THREE.Color(0xfff6d8).multiplyScalar(4) as unknown as number, 24, x);
  if (k.p.smallParts) {
    for (let i = 0; i < 6; i++) tube(k, 'gunRubber', f0 + 0.012 + i * 0.008, f0 + 0.016 + i * 0.008, u, 0.0112, 0x1c1e22, 24, x);
    tube(k, 'gunRubber', f0 - 0.012, f0, u, 0.008, 0x1c1e22, 12, x);
  }
}

function silencer(k: Kit, f0: number, u: number, r: number, len: number, accent: number): void {
  tube(k, 'gunMetal', f0, f0 + len, u, r, GUNMETAL, k.p.smallParts ? 6 : 6);
  tube(k, 'gunMetal', f0 + len, f0 + len + 0.006, u, r * 0.8, BLACK, 24);
  tube(k, 'gunPolymer', f0 + len * 0.2, f0 + len * 0.24, u, r * 1.03, accent, 6);
  if (k.p.smallParts) for (let i = 0; i < 5; i++) tube(k, 'gunMetal', f0 + 0.01 + i * 0.006, f0 + 0.013 + i * 0.006, u, r * 1.02, BLACK, 6);
  orangeTip(k, f0 + len + 0.006, u, r * 0.5, 0.004);
}

function buildAeg(k: Kit, o: ReplicaOpts): Replica {
  const fur = o.furniture ?? TAN;
  const acc = o.accent ?? 0x3b78d8;
  const small = k.p.smallParts;
  // Upper receiver: an angular slab with a chamfered rear and a raised ejection-port panel.
  profile(k, 'gunPolymer', [[-0.115, 0.012], [0.16, 0.012], [0.16, 0.058], [-0.095, 0.058], [-0.115, 0.04]], 0.05, BLACK);
  rail(k, -0.1, 0.16, 0.058, 0.022, BLACK);
  if (small) {
    slab(k, 'gunMetal', -0.01, 0.045, 0.024, 0.048, 0.0265, GUNMETAL);
    slab(k, 'gunPolymer', -0.06, -0.045, 0.024, 0.044, 0.029, BLACK); // forward assist block
    slab(k, 'gunPolymer', -0.13, -0.105, 0.042, 0.054, 0.012, BLACK); // charging handle
    for (const f of [-0.08, 0.13]) tube(k, 'gunMetal', f, f + 0.0001, 0.03, 0.003, 0x8a8f96, 8, 0.0255);
  }
  // Lower receiver with a flared magwell and the accent stripe.
  profile(k, 'gunPolymer', [[-0.105, -0.034], [0.15, -0.034], [0.15, 0.014], [-0.105, 0.014]], 0.047, BLACK);
  profile(k, 'gunPolymer', [[0.016, -0.03], [0.108, -0.03], [0.104, -0.085], [0.022, -0.085]], 0.046, BLACK);
  slab(k, 'gunPolymer', 0.06, 0.15, -0.006, 0.0, 0.0242, acc, 0, 0.0005);
  // Trigger guard (squared) and trigger.
  profile(k, 'gunPolymer', [[-0.024, -0.03], [0.034, -0.03], [0.034, -0.074], [-0.03, -0.074]], 0.012, BLACK, 0, [[[-0.016, -0.036], [0.026, -0.036], [0.026, -0.066], [-0.02, -0.066]]]);
  slab(k, 'gunMetal', -0.004, 0.004, -0.06, -0.034, 0.003, GUNMETAL);
  // Pistol grip: an angular wedge with a palm swell and a finger notch, in furniture colour.
  profile(k, 'gunFurniture', [[-0.012, -0.03], [-0.058, -0.03], [-0.098, -0.135], [-0.064, -0.148], [-0.036, -0.1], [-0.02, -0.09], [-0.026, -0.07]], 0.034, fur);
  if (small) for (let i = 0; i < 4; i++) slab(k, 'gunRubber', -0.072 + i * 0.008, -0.068 + i * 0.008, -0.12 + i * 0.02, -0.112 + i * 0.02, 0.0172, 0x8f7550, 0, 0.001);
  // Buffer tube and a hard-angled modular stock with a cheek riser and rubber pad.
  tube(k, 'gunMetal', -0.3, -0.105, 0.03, 0.0145, BLACK, k.p.curveSegments);
  profile(k, 'gunFurniture', [[-0.165, 0.055], [-0.34, 0.06], [-0.355, 0.05], [-0.355, -0.065], [-0.315, -0.07], [-0.24, 0.0], [-0.165, 0.01]], 0.04, fur, 0, k.p.smallParts ? [[[-0.215, 0.012], [-0.28, 0.012], [-0.3, -0.03], [-0.255, -0.03]]] : []);
  slab(k, 'gunFurniture', -0.33, -0.2, 0.06, 0.072, 0.017, fur);
  slab(k, 'gunRubber', -0.37, -0.355, -0.068, 0.062, 0.022, 0x22252a, 0, 0.004);
  slab(k, 'gunPolymer', -0.3, -0.24, 0.0545, 0.059, 0.0202, acc, 0, 0.0005);
  // Handguard: a long hexagonal-ish slab with M-LOK slots and a full top rail.
  const hg: P2[] = [[0.16, 0.0], [0.42, 0.0], [0.425, 0.02], [0.42, 0.064], [0.16, 0.064]];
  const holes: P2[][] = [];
  if (small) for (const f of [0.2, 0.25, 0.3, 0.35]) holes.push([[f, 0.02], [f + 0.032, 0.02], [f + 0.032, 0.03], [f, 0.03]]);
  profile(k, 'gunFurniture', hg, 0.06, fur, 0, holes);
  if (!small) for (const f of [0.2, 0.25, 0.3, 0.35]) for (const s of [-1, 1]) slab(k, 'dark', f, f + 0.032, 0.02, 0.03, 0.001, 0x1a1c20, s * 0.0305, 0);
  if (small) slab(k, 'dark', 0.17, 0.41, 0.006, 0.058, 0.026, 0x14161a, 0, 0); // the dark inside seen through the slots
  rail(k, 0.165, 0.42, 0.064, 0.022, BLACK);
  slab(k, 'gunPolymer', 0.165, 0.42, 0.034, 0.038, 0.0302, acc, 0, 0.0004);
  // Barrel, gas block, muzzle.
  const longB = o.barrel === 'long' ? 0.1 : 0;
  tube(k, 'gunMetal', 0.42, 0.56 + longB, 0.034, 0.0095, GUNMETAL);
  slab(k, 'gunPolymer', 0.43, 0.46, 0.022, 0.048, 0.015, BLACK);
  if (o.muzzle === 'silencer') silencer(k, 0.56 + longB, 0.034, 0.019, 0.13, acc);
  else {
    tube(k, 'gunMetal', 0.56 + longB, 0.61 + longB, 0.034, 0.0115, BLACK, small ? 12 : 8);
    if (small) for (let i = 0; i < 3; i++) for (const s of [-1, 1]) slab(k, 'dark', 0.57 + longB + i * 0.012, 0.576 + longB + i * 0.012, 0.03, 0.038, 0.001, 0x101114, s * 0.0115, 0);
    orangeTip(k, 0.61 + longB, 0.034, 0.0102);
  }
  // Magazine: an angular, gently forward-curved mag (hi-cap: a wider body with a winding wheel).
  const hi = o.mag === 'hiCap';
  profile(k, 'gunPolymer', [[0.026, -0.08], [0.098, -0.08], [0.112, -0.2], [0.104, -0.235], [0.04, -0.23], [0.032, -0.2]], hi ? 0.04 : 0.032, hi ? 0x30343a : BLACK);
  if (hi) {
    const wheel = new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16).rotateZ(Math.PI / 2);
    k.add('gunPolymer', wheel, new THREE.Matrix4().makeTranslation(0.0, -0.215, -0.07), 0x55595f, {});
  } else if (small) {
    for (let i = 0; i < 4; i++) slab(k, 'gunPolymer', 0.04 + i * 0.002, 0.095 + i * 0.003, -0.11 - i * 0.025, -0.104 - i * 0.025, 0.0168, 0x3a3e46, 0, 0.001);
  }
  // Sights: flip-ups folded when an optic is fitted.
  let sight: THREE.Vector3;
  if (o.optic === 'redDot') sight = redDot(k, 0.0, 0.0685);
  else if (o.optic === 'scope2x') sight = scope2x(k, 0.0, 0.0685);
  else {
    slab(k, 'gunPolymer', -0.09, -0.07, 0.0685, 0.1, 0.012, BLACK);
    slab(k, 'gunPolymer', 0.39, 0.41, 0.0685, 0.105, 0.008, BLACK);
    sight = new THREE.Vector3(0, 0.1, 0.1);
  }
  if (o.optic) {
    slab(k, 'gunPolymer', -0.09, -0.07, 0.0685, 0.077, 0.012, BLACK);
    slab(k, 'gunPolymer', 0.39, 0.41, 0.0685, 0.077, 0.008, BLACK);
  }
  // Foregrip and torch on the handguard.
  if (o.grip === 'vertical') {
    slab(k, 'gunPolymer', 0.3, 0.33, -0.008, 0.0, 0.012, BLACK);
    profile(k, 'gunFurniture', [[0.3, -0.008], [0.334, -0.008], [0.33, -0.1], [0.322, -0.11], [0.304, -0.11], [0.298, -0.1]], 0.03, fur);
    if (small) for (let i = 0; i < 3; i++) slab(k, 'gunRubber', 0.299, 0.333, -0.035 - i * 0.022, -0.028 - i * 0.022, 0.0152, 0x8f7550, 0, 0.001);
  } else if (o.grip === 'angled') {
    profile(k, 'gunFurniture', [[0.24, -0.002], [0.34, -0.002], [0.33, -0.022], [0.255, -0.05]], 0.03, fur);
  }
  if (o.torch) torch(k, 0.32, 0.034, 0.042);
  return {
    group: new THREE.Group(),
    grip: new THREE.Vector3(0, -0.05, 0.045),
    support: new THREE.Vector3(0, -0.02, o.grip === 'vertical' ? -0.32 : -0.3),
    butt: new THREE.Vector3(0, 0.0, 0.36),
    sight,
    hand: wrap([0, -0.066, 0.048], [0, -0.136, 0.077], 0.017, 0.022),
    supportGrip: o.grip === 'vertical' ? wrap([0, -0.026, -0.317], [0, -0.096, -0.315], 0.015, 0.016) : undefined,
    trigger: new THREE.Vector3(0, -0.052, -0.001),
  };
}

function buildPistol(k: Kit, o: ReplicaOpts): Replica {
  const fur = o.furniture ?? BLACK;
  const acc = o.accent ?? 0x3b78d8;
  const small = k.p.smallParts;
  // Slide: angular top chamfers, front and rear serrations, an ejection port.
  profile(k, 'gunMetal', [[-0.085, 0.0], [0.105, 0.0], [0.105, 0.028], [0.095, 0.036], [-0.075, 0.036], [-0.085, 0.03]], 0.03, BLACK);
  slab(k, 'gunMetal', -0.07, 0.09, 0.034, 0.038, 0.011, BLACK, 0, 0.001);
  if (small) {
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) slab(k, 'dark', -0.075 + i * 0.0065, -0.072 + i * 0.0065, 0.006, 0.032, 0.0008, 0x0f1012, s * 0.0152, 0);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) slab(k, 'dark', 0.075 + i * 0.0065, 0.078 + i * 0.0065, 0.008, 0.03, 0.0008, 0x0f1012, s * 0.0152, 0);
    slab(k, 'gunMetal', 0.0, 0.035, 0.014, 0.036, 0.0154, GUNMETAL, 0.0005, 0.001);
  }
  slab(k, 'gunPolymer', -0.08, 0.1, 0.012, 0.016, 0.0152, acc, 0, 0.0004);
  // Sights.
  slab(k, 'gunMetal', -0.08, -0.068, 0.036, 0.046, 0.011, BLACK, 0, 0.001);
  slab(k, 'gunMetal', 0.088, 0.097, 0.036, 0.044, 0.003, BLACK, 0, 0.001);
  // Frame with a dust-cover rail, squared trigger guard, angular grip with a beavertail.
  profile(k, 'gunPolymer', [[-0.075, -0.012], [0.1, -0.012], [0.1, 0.002], [-0.075, 0.002]], 0.028, fur);
  rail(k, 0.03, 0.095, -0.024, 0.02, fur);
  slab(k, 'gunPolymer', 0.025, 0.1, -0.024, -0.012, 0.012, fur);
  profile(k, 'gunPolymer', [[-0.004, -0.012], [0.052, -0.012], [0.052, -0.045], [-0.008, -0.045]], 0.012, fur, 0, [[[0.002, -0.018], [0.046, -0.018], [0.046, -0.039], [-0.002, -0.039]]]);
  slab(k, 'gunMetal', 0.006, 0.012, -0.034, -0.012, 0.003, GUNMETAL);
  // Grip: a solid, rectangular block at a steady 17° rake, straight front and back straps, the same width all the
  // way down, a short beavertail on top. Stippled panels on both sides.
  profile(k, 'gunPolymer', [[-0.012, -0.012], [-0.076, -0.012], [-0.092, -0.003], [-0.097, -0.009], [-0.08, -0.024], [-0.108, -0.126], [-0.104, -0.13], [-0.055, -0.13], [-0.052, -0.127], [-0.021, -0.02]], 0.032, fur);
  if (small) {
    const stip = new THREE.Color(fur).multiplyScalar(0.8) as unknown as number;
    profile(k, 'gunRubber', [[-0.03, -0.04], [-0.076, -0.04], [-0.1, -0.118], [-0.056, -0.118]], 0.0336, stip);
    slab(k, 'gunPolymer', -0.024, -0.02, -0.03, -0.024, 0.0165, fur, 0, 0.001); // a small thumb ledge
  }
  // Magazine base (extended: a longer base pad), squared to the grip.
  const ext = o.mag === 'extended' ? 0.03 : 0;
  profile(k, 'gunPolymer', [[-0.05, -0.128], [-0.11, -0.128], [-0.112, -0.14 - ext], [-0.052, -0.14 - ext]], 0.034, BLACK);
  if (ext) slab(k, 'gunPolymer', -0.105, -0.055, -0.131, -0.129, 0.0172, acc, 0, 0.0005);
  // Barrel and orange tip.
  tube(k, 'gunMetal', 0.08, 0.107, 0.016, 0.0065, GUNMETAL, 16);
  if (o.muzzle === 'silencer') silencer(k, 0.107, 0.016, 0.0135, 0.1, acc);
  else orangeTip(k, 0.105, 0.016, 0.0058, 0.004);
  if (o.laser) {
    profile(k, 'gunPolymer', [[0.03, -0.024], [0.098, -0.024], [0.098, -0.05], [0.04, -0.05], [0.03, -0.04]], 0.026, BLACK);
    if (k.p.emissive) tube(k, 'figGlow', 0.098, 0.0985, -0.037, 0.003, new THREE.Color(0xff2020).multiplyScalar(30) as unknown as number, 12);
    tube(k, 'lens', 0.097, 0.0982, -0.037, 0.005, 0x802020, 16);
  }
  if (o.torch) torch(k, 0.035, -0.04, 0, 0.055);
  return { group: new THREE.Group(), grip: new THREE.Vector3(0, -0.04, 0.045), support: new THREE.Vector3(0, -0.07, 0.04), butt: new THREE.Vector3(0, 0, 0.1), sight: new THREE.Vector3(0, 0.046, 0.06), hand: wrap([0, -0.04, 0.056], [0, -0.122, 0.0795], 0.016, 0.027), trigger: new THREE.Vector3(0, -0.026, -0.009) };
}

function buildCyber(k: Kit, o: ReplicaOpts): Replica {
  // The Cyber Pistol: a white slab of a pistol with cyan light lines and a magenta core: Marathon by way of Neon Heights.
  const small = k.p.smallParts;
  const white = 0xe9edf0;
  const cyan = new THREE.Color(0x30f0ff).multiplyScalar(3);
  const magenta = new THREE.Color(0xff3aa8).multiplyScalar(3);
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
export function buildAttachment(k: Kit, id: string): THREE.Group {
  const acc = 0x3b78d8;
  switch (id) {
    case 'redDot':
      rail(k, -0.01, 0.07, -0.006, 0.022, BLACK);
      redDot(k, 0.0, 0.0045);
      break;
    case 'scope2x':
      rail(k, -0.01, 0.13, -0.006, 0.022, BLACK);
      scope2x(k, 0.0, 0.0045);
      break;
    case 'silencer':
      silencer(k, 0, 0, 0.019, 0.13, acc);
      break;
    case 'torch':
      torch(k, 0, 0, 0, 0.09);
      break;
    case 'vertical':
      slab(k, 'gunPolymer', -0.002, 0.032, -0.008, 0.0, 0.012, BLACK);
      profile(k, 'gunFurniture', [[0.0, -0.008], [0.034, -0.008], [0.03, -0.1], [0.022, -0.11], [0.004, -0.11], [-0.002, -0.1]], 0.03, TAN);
      if (k.p.smallParts) for (let i = 0; i < 3; i++) slab(k, 'gunRubber', -0.001, 0.033, -0.035 - i * 0.022, -0.028 - i * 0.022, 0.0152, 0x8f7550, 0, 0.001);
      break;
    case 'angled':
      profile(k, 'gunFurniture', [[0.0, 0.0], [0.1, 0.0], [0.09, -0.02], [0.015, -0.048]], 0.03, TAN);
      break;
    case 'laser':
      profile(k, 'gunPolymer', [[0.0, 0.0], [0.068, 0.0], [0.068, -0.026], [0.01, -0.026], [0.0, -0.016]], 0.026, BLACK);
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
      tube(k, 'gunMetal', 0, 0.16, 0, 0.0095, GUNMETAL);
      tube(k, 'gunMetal', 0.16, 0.21, 0, 0.0115, BLACK, k.p.smallParts ? 12 : 8);
      orangeTip(k, 0.21, 0, 0.0102);
      break;
  }
  return k.build();
}
