import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildForearm, buildHand, type FingerCurl } from './handModels';
import type { MagazineId } from '../config/attachments';
import type { ReplicaConfig } from '../config/replicas';
import { LASERS } from '../config/lasers';

/**
 * First-person replica models built in code. They resemble real-world replica types (an AR-pattern
 * AEG, a polymer striker pistol) but are generic (no brands, logos or copies of a specific design)
 * and rendered stylised: chunky side-profile silhouettes extruded with soft bevels, plus cylinders
 * and small detail parts, in two-tone black and tan. The orange muzzle tip many real replicas carry
 * is optional (VIEWMODEL.orangeTips).
 *
 * Profiles are drawn as (forward, up) in metres, with the receiver/frame near the origin. Parts are
 * merged per material, so each replica is only a few draw calls.
 */

type Pt = readonly [forward: number, up: number];

type MaterialKey = 'polymer' | 'furniture' | 'mag' | 'metal' | 'rubber' | 'orange' | 'lens' | 'laserLens' | 'glove' | 'sleeve' | 'armband';

/**
 * The replicas' materials (M14 polish): moulded polymer with a soft satin sheen (it catches the viewmodel's environment
 * on High and Medium), dull grey "metal" that is plainly painted zinc and plastic, rubber, tinted lens. Toys, not guns.
 */
function createMaterials(teamColor: number): Record<MaterialKey, THREE.Material> {
  return {
    polymer: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.5, metalness: 0 }),
    furniture: new THREE.MeshStandardMaterial({ color: 0xb79c70, roughness: 0.58, metalness: 0 }),
    mag: new THREE.MeshStandardMaterial({ color: 0x363a40, roughness: 0.52, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x6a6f78, roughness: 0.45, metalness: 0.35 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95, metalness: 0 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.5, metalness: 0 }),
    lens: new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.12, depthWrite: false }),
    // The red laser's lens glows its beam's colour (config/lasers.ts), unlit, so it reads in any light.
    laserLens: new THREE.MeshBasicMaterial({ color: LASERS.redLaser.colour }),
    // Olive gloves: clearly separate from the black polymer and tan furniture.
    glove: new THREE.MeshStandardMaterial({ color: 0x5d6146, roughness: 0.9, metalness: 0 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 1, metalness: 0 }),
    // Team tape on the sleeve, as players wear at real sites.
    armband: new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7, metalness: 0 }),
  };
}

/** A closed outline with every corner rounded by up to `radius`. */
function roundedPath(points: readonly Pt[], radius: number, path: THREE.Path): THREE.Path {
  const n = points.length;
  const corner = (i: number): { a: THREE.Vector2; c: THREE.Vector2; b: THREE.Vector2 } => {
    const p = points[(i + n) % n]!;
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const c = new THREE.Vector2(p[0], p[1]);
    const toPrev = new THREE.Vector2(prev[0] - p[0], prev[1] - p[1]);
    const toNext = new THREE.Vector2(next[0] - p[0], next[1] - p[1]);
    const r = Math.min(radius, toPrev.length() / 2, toNext.length() / 2);
    return {
      a: c.clone().add(toPrev.normalize().multiplyScalar(r)),
      c,
      b: c.clone().add(toNext.normalize().multiplyScalar(r)),
    };
  };
  const first = corner(0);
  path.moveTo(first.b.x, first.b.y);
  for (let i = 1; i <= n; i++) {
    const k = corner(i);
    path.lineTo(k.a.x, k.a.y);
    path.quadraticCurveTo(k.c.x, k.c.y, k.b.x, k.b.y);
  }
  return path;
}

/** Collects parts per material and merges them into one mesh per material. */
class ModelBuilder {
  private readonly parts = new Map<MaterialKey, THREE.BufferGeometry[]>();

  /** Side-profile silhouette extruded to `width`, centred on the model's axis, with a soft bevel. */
  profile(key: MaterialKey, outline: readonly Pt[], width: number, round = 0.006, hole?: readonly Pt[]): this {
    const bevel = Math.min(0.004, width / 4);
    const shape = roundedPath(outline, round, new THREE.Shape()) as THREE.Shape;
    if (hole) shape.holes.push(roundedPath(hole, round / 2, new THREE.Path()));
    const depth = Math.max(0.001, width - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 5,
    });
    geo.translate(0, 0, -depth / 2);
    // Shape x (forward) → -Z (the viewmodel faces -Z); extrusion → X (width).
    geo.rotateY(Math.PI / 2);
    return this.add(key, geo);
  }

  /** Box from `from` to `to` along the forward axis. */
  box(key: MaterialKey, from: number, to: number, y0: number, y1: number, width: number, x = 0): this {
    const geo = new THREE.BoxGeometry(width, y1 - y0, to - from);
    geo.translate(x, (y0 + y1) / 2, -(from + to) / 2);
    return this.add(key, geo);
  }

  /** Cylinder lying along the forward axis. */
  tube(key: MaterialKey, from: number, length: number, up: number, radius: number, segments = 14): this {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, up, -(from + length / 2));
    return this.add(key, geo);
  }

  /** Hollow tube along the forward axis (an optic's body you can look through), `outer` and `inner` radii. */
  ringTube(key: MaterialKey, from: number, length: number, up: number, outer: number, inner: number, segments = 24): this {
    const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2, false);
    shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: segments });
    geo.translate(0, up, -(from + length));
    return this.add(key, geo);
  }

  /** Adds a prebuilt part (used by the hand and forearm builders). */
  addGeometry(key: MaterialKey, geo: THREE.BufferGeometry): void {
    this.add(key, geo);
  }

  /** Picatinny-style rail: a strip with evenly spaced teeth. */
  rail(from: number, to: number, y: number, width: number): this {
    this.box('polymer', from, to, y, y + 0.01, width);
    for (let x = from + 0.004; x + 0.008 <= to; x += 0.016) this.box('polymer', x, x + 0.008, y + 0.01, y + 0.016, width + 0.004);
    return this;
  }

  build(materials: Record<MaterialKey, THREE.Material>): THREE.Group {
    const group = new THREE.Group();
    for (const [key, geos] of this.parts) {
      const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.name = key;
      group.add(mesh);
    }
    return group;
  }

  private add(key: MaterialKey, geo: THREE.BufferGeometry): this {
    geo.deleteAttribute('uv');
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(geo);
    return this;
  }
}

// Hand poses (joint bends in radians: knuckle, middle, tip).
/** Pistol-grip axis, top to bottom: grips rake back about 22 degrees. */
const GRIP_DOWN = [0, -0.93, -0.37] as const;
/** Index finger laid straight along the frame, off the trigger. */
const STRAIGHT_INDEX: FingerCurl = [0.12, 0.08, 0.04];
/** Fingers wrapped round a pistol grip. */
const WRAP: FingerCurl = [1.15, 1.25, 0.7];
/** Fingers curled up the side of a handguard. */
const CRADLE: FingerCurl = [0.85, 1.05, 0.6];
/** Support-hand fingers wrapped over the shooting hand. */
const SUPPORT: FingerCurl = [1.0, 1.05, 0.6];

/**
 * The red dot fitted to the rifle's receiver rail (an accessory, never part of the rifle: owner, 2026-10-03):
 * where its axis sits above the model's origin and where its tube starts and ends along the forward axis.
 * The rifle's aiming hold (config/replicas.ts aimHold) puts this axis on the view's centre line.
 */
export const RIFLE_OPTIC = { axisUp: 0.126, from: -0.005, length: 0.07, outer: 0.021, inner: 0.018 } as const;

/** The 2× scope's body on the same axis (M17b): main tube, objective bell in front, eyepiece behind (metres). */
export const RIFLE_SCOPE = { from: -0.01, length: 0.11, outer: 0.014, inner: 0.012, bellLength: 0.035, bellOuter: 0.022, eyeLength: 0.03 } as const;

/**
 * AR-pattern AEG in two-tone: black upper and lower receiver, tan stock, grip, handguard and magazine.
 * Flat-top rails with flip-up iron sights (folded down when an optic is fitted), birdcage-style flash hider.
 * The optic is its own part, shown only when one is fitted.
 */
function buildAeg(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean): ReplicaModel {
  const b = new ModelBuilder();
  // Upper receiver with flat-top rail, forward assist and ejection port (right side), charging handle.
  b.profile('polymer', [[-0.11, 0.012], [0.15, 0.012], [0.15, 0.058], [-0.092, 0.058], [-0.11, 0.042]], 0.05);
  b.rail(-0.09, 0.15, 0.058, 0.022);
  b.box('polymer', -0.052, -0.014, 0.026, 0.046, 0.016, 0.029); // forward assist
  b.box('metal', -0.008, 0.062, 0.02, 0.048, 0.004, 0.026); // ejection port cover
  b.box('polymer', -0.128, -0.106, 0.04, 0.053, 0.036); // charging handle
  // Lower receiver with flared magwell, trigger guard and trigger.
  b.profile('polymer', [[-0.1, -0.032], [0.145, -0.032], [0.145, 0.016], [-0.1, 0.016]], 0.047);
  b.profile('polymer', [[0.018, -0.03], [0.104, -0.03], [0.1, -0.08], [0.024, -0.08]], 0.044, 0.004);
  b.profile(
    'polymer',
    [[-0.02, -0.03], [0.032, -0.03], [0.032, -0.07], [-0.026, -0.07]],
    0.012,
    0.01,
    [[-0.012, -0.037], [0.024, -0.037], [0.024, -0.062], [-0.016, -0.062]],
  );
  b.box('metal', 0.001, 0.008, -0.056, -0.034, 0.006);
  b.profile('furniture', [[-0.012, -0.028], [-0.056, -0.028], [-0.092, -0.13], [-0.06, -0.142], [-0.03, -0.098]], 0.034, 0.012);
  // Curved polymer magazine with a black base plate (its own part so reloads can drop it out), one look per magazine
  // the rifle takes (M17b): the standard one; a hi-cap, the same shape with a winding wheel under its base; a low-cap,
  // short and straight.
  const mag = new ModelBuilder();
  mag.profile('furniture', [[0.03, -0.076], [0.092, -0.076], [0.105, -0.15], [0.127, -0.222], [0.073, -0.236], [0.055, -0.156]], 0.026, 0.008);
  mag.profile('polymer', [[0.071, -0.232], [0.129, -0.219], [0.133, -0.232], [0.074, -0.246]], 0.03, 0.004);
  const hiCap = new ModelBuilder();
  hiCap.profile('furniture', [[0.03, -0.076], [0.092, -0.076], [0.105, -0.15], [0.127, -0.222], [0.073, -0.236], [0.055, -0.156]], 0.03, 0.008);
  hiCap.profile('polymer', [[0.071, -0.232], [0.129, -0.219], [0.133, -0.232], [0.074, -0.246]], 0.034, 0.004);
  hiCap.tube('metal', 0.088, 0.03, -0.252, 0.014, 12); // the winding wheel
  const lowCap = new ModelBuilder();
  lowCap.profile('furniture', [[0.03, -0.076], [0.092, -0.076], [0.1, -0.13], [0.108, -0.168], [0.062, -0.176], [0.052, -0.13]], 0.026, 0.008);
  lowCap.profile('polymer', [[0.059, -0.172], [0.111, -0.164], [0.113, -0.176], [0.061, -0.186]], 0.03, 0.004);
  // Handguard (tan) with slots and a top rail.
  b.profile('furniture', [[0.15, 0.0], [0.4, 0.0], [0.4, 0.066], [0.15, 0.066]], 0.058, 0.014);
  for (const x of [0.19, 0.245, 0.3, 0.35]) b.box('rubber', x, x + 0.035, 0.026, 0.042, 0.06);
  b.rail(0.155, 0.395, 0.066, 0.02);
  // Barrel, low-profile gas block (the front sight is a flip-up on the rail), flash hider.
  b.tube('metal', 0.4, 0.165, 0.034, 0.009);
  b.box('polymer', 0.43, 0.455, 0.022, 0.05, 0.03);
  b.tube(orangeTip ? 'orange' : 'metal', 0.565, 0.016, 0.034, 0.013, 10);
  b.tube(orangeTip ? 'orange' : 'polymer', 0.581, 0.03, 0.034, 0.012, 6);
  // Buffer tube, collapsible stock, butt pad.
  b.tube('polymer', -0.27, 0.17, 0.032, 0.016);
  b.profile('furniture', [[-0.2, 0.056], [-0.33, 0.06], [-0.336, -0.056], [-0.31, -0.064], [-0.236, -0.012], [-0.2, 0.0]], 0.044, 0.012);
  b.profile('rubber', [[-0.332, 0.06], [-0.352, 0.06], [-0.358, -0.056], [-0.338, -0.058]], 0.046, 0.006);
  // Flip-up iron sights: a rear aperture at the back of the receiver rail and a front post at the front of the
  // handguard rail, standing up on the bare rifle and folded flat under a fitted optic.
  const sightsUp = new ModelBuilder();
  sightsUp.box('polymer', -0.085, -0.062, 0.074, 0.084, 0.026);
  sightsUp.profile('polymer', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.112], [-0.078, 0.112]], 0.022, 0.003, [[-0.0755, 0.098], [-0.0705, 0.098], [-0.0705, 0.104], [-0.0755, 0.104]]);
  sightsUp.box('polymer', 0.365, 0.39, 0.082, 0.092, 0.024);
  sightsUp.profile('polymer', [[0.37, 0.092], [0.386, 0.092], [0.381, 0.112], [0.375, 0.112]], 0.018, 0.002);
  const sightsDown = new ModelBuilder();
  sightsDown.box('polymer', -0.088, -0.054, 0.074, 0.082, 0.026);
  sightsDown.box('polymer', 0.362, 0.396, 0.082, 0.089, 0.024);
  // The red dot: a tall riser mount clamped to the rail under a tube you look through (front lens faintly tinted). The
  // riser keeps the receiver and the folded sights well below the dot in the aimed view (a lower-third co-witness).
  const optic = new ModelBuilder();
  const o = RIFLE_OPTIC;
  optic.box('polymer', 0.004, 0.056, 0.074, 0.084, 0.034);
  optic.box('polymer', 0.012, 0.048, 0.084, o.axisUp - o.outer + 0.004, 0.024);
  optic.ringTube('polymer', o.from, o.length, o.axisUp, o.outer, o.inner);
  optic.box('polymer', 0.02, 0.04, o.axisUp - 0.008, o.axisUp + 0.008, 0.012, o.outer + 0.004); // brightness dial, right side
  optic.tube('lens', o.from + o.length - 0.004, 0.002, o.axisUp, o.inner, 24);
  // The 2× scope (M17b): a longer tube on two rings, a wider objective bell at the front, on the same axis as the red
  // dot so the same aiming hold lines it up. Looking through it, the HUD's eyepiece hides the rest.
  const scope = new ModelBuilder();
  const sc = RIFLE_SCOPE;
  for (const x of [0.0, 0.07]) {
    scope.box('polymer', x, x + 0.024, 0.074, 0.084, 0.034);
    scope.box('polymer', x + 0.004, x + 0.02, 0.084, o.axisUp - sc.outer + 0.004, 0.022);
  }
  scope.ringTube('polymer', sc.from, sc.length, o.axisUp, sc.outer, sc.inner);
  scope.ringTube('polymer', sc.from + sc.length, sc.bellLength, o.axisUp, sc.bellOuter, sc.bellOuter - 0.003);
  scope.ringTube('polymer', sc.from - sc.eyeLength, sc.eyeLength, o.axisUp, sc.outer + 0.004, sc.inner);
  scope.box('polymer', 0.03, 0.05, o.axisUp + sc.outer - 0.002, o.axisUp + sc.outer + 0.012, 0.016); // turret
  scope.tube('lens', sc.from + sc.length + sc.bellLength - 0.004, 0.002, o.axisUp, sc.bellOuter - 0.003, 24);
  // Grips (M17b) on the handguard rail, behind the support hand: a straight vertical grip and a flat angled one.
  const vertical = new ModelBuilder();
  vertical.box('polymer', 0.196, 0.244, -0.008, 0.002, 0.03);
  vertical.profile('polymer', [[0.204, -0.008], [0.236, -0.008], [0.232, -0.088], [0.208, -0.092]], 0.026, 0.008);
  const angled = new ModelBuilder();
  angled.profile('polymer', [[0.165, -0.002], [0.262, -0.002], [0.262, -0.014], [0.188, -0.046], [0.172, -0.04]], 0.03, 0.006);

  // Right hand on the pistol grip: back of the hand to the right, knuckle row running down the
  // grip, three fingers wrapped round its front, index finger straight along the frame (trigger
  // discipline), thumb across the left of the receiver.
  const rightWrist = buildHand(b, {
    side: 'right',
    palm: [0.034, -0.092, -0.074],
    across: GRIP_DOWN,
    back: [1, 0, 0],
    fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP],
    thumb: { swing: 0.9, curl: [0.3, 0.3] },
  });
  buildForearm(b, rightWrist, [0.2, -0.3, -0.42]);

  // Left hand cradling the handguard: palm underneath, index finger forward, fingers curling up the
  // right side, thumb along the left side. Its own part: on reloads it cups the magazine's base plate.
  const support = new ModelBuilder();
  const leftWrist = buildHand(support, {
    side: 'left',
    palm: [-0.012, -0.018, 0.29],
    across: [0, 0, -1],
    back: [0, -1, 0],
    fingers: [CRADLE, CRADLE, CRADLE, CRADLE],
    thumb: { swing: 0.2, curl: [0.2, 0.2] },
  });
  buildForearm(support, leftWrist, [-0.3, -0.28, 0.02]);

  const group = b.build(m);
  const magazine = magazinePart({ standard: mag, hiCap, lowCap }, m, [0, -0.97, 0.25], { lowCap: [0, 0.06, -0.014] });
  group.add(magazine.group);
  // From the handguard to just under the magazine's base plate (forward 0.1, up -0.26).
  const supportHand = supportHandPart(support, m, [0.012, -0.242, -0.19]);
  group.add(supportHand.group);
  group.add(namedPart(sightsUp, m, 'sightsUp'), namedPart(sightsDown, m, 'sightsDown'));
  group.add(namedPart(optic, m, 'optic:redDot'), namedPart(scope, m, 'optic:scope2x'));
  group.add(namedPart(vertical, m, 'grip:vertical'), namedPart(angled, m, 'grip:angled'));
  const muzzle = muzzleMarker(0.611, 0.034);
  group.add(muzzle);
  return { group, muzzle, magazine, supportHand };
}

/** Polymer striker-fired gas pistol in two-tone: black slide over a tan frame with an accessory rail. */
function buildPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean): ReplicaModel {
  const b = new ModelBuilder();
  // Slide: boxy, rear serrations, barrel hood showing in the ejection port, sights, muzzle.
  b.profile('polymer', [[-0.095, 0.0], [0.1, 0.0], [0.1, 0.026], [0.092, 0.03], [-0.09, 0.03], [-0.097, 0.018]], 0.028, 0.004);
  for (let i = 0; i < 6; i++) b.box('rubber', -0.088 + i * 0.008, -0.085 + i * 0.008, 0.006, 0.026, 0.0295);
  b.box('metal', 0.008, 0.044, 0.026, 0.0305, 0.018);
  b.box('polymer', -0.093, -0.082, 0.03, 0.038, 0.022); // rear sight
  b.box('polymer', 0.086, 0.093, 0.03, 0.036, 0.006); // front sight
  b.tube(orangeTip ? 'orange' : 'rubber', 0.1, 0.004, 0.015, orangeTip ? 0.0095 : 0.006, 12);
  // Frame: dust cover with an accessory rail, squared trigger guard, angled grip, magazine base.
  b.profile('furniture', [[-0.085, 0.0], [0.092, 0.0], [0.092, -0.014], [0.038, -0.016], [-0.07, -0.016]], 0.026, 0.004);
  b.box('furniture', 0.042, 0.088, -0.024, -0.014, 0.022);
  for (const x of [0.05, 0.066]) b.box('rubber', x, x + 0.008, -0.024, -0.017, 0.023);
  b.profile('furniture', [[-0.03, -0.012], [-0.084, -0.012], [-0.104, -0.115], [-0.062, -0.122], [-0.044, -0.07]], 0.03, 0.008);
  b.profile(
    'furniture',
    [[-0.03, -0.014], [0.034, -0.014], [0.034, -0.048], [-0.036, -0.046]],
    0.01,
    0.006,
    [[-0.022, -0.02], [0.026, -0.02], [0.026, -0.042], [-0.027, -0.04]],
  );
  b.box('polymer', -0.004, 0.003, -0.036, -0.016, 0.005); // trigger
  // Magazine: hidden inside the grip until a reload drops it out, base plate showing below.
  const mag = new ModelBuilder();
  mag.profile('mag', [[-0.058, -0.02], [-0.076, -0.02], [-0.1, -0.118], [-0.078, -0.12]], 0.022, 0.003);
  mag.box('polymer', -0.108, -0.062, -0.13, -0.119, 0.032); // base plate
  // The extended magazine (M17b): a sleeve sticking out under the grip, its base plate lower down.
  const extended = new ModelBuilder();
  extended.profile('mag', [[-0.058, -0.02], [-0.076, -0.02], [-0.1, -0.118], [-0.078, -0.12]], 0.022, 0.003);
  extended.profile('furniture', [[-0.1, -0.118], [-0.064, -0.12], [-0.058, -0.158], [-0.104, -0.158]], 0.03, 0.004);
  extended.box('polymer', -0.11, -0.056, -0.168, -0.157, 0.032); // base plate

  // Two-handed grip: right hand round the grip, index finger along the frame; the left hand presses
  // against the left of the grip with its fingers wrapped over the right hand's.
  const rightWrist = buildHand(b, {
    side: 'right',
    palm: [0.03, -0.068, -0.078],
    across: GRIP_DOWN,
    back: [1, 0, 0],
    fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP],
    thumb: { swing: 0.6, curl: [0.2, 0.2] },
  });
  buildForearm(b, rightWrist, [0.1, -0.26, -0.3]);
  const support = new ModelBuilder();
  const leftWrist = buildHand(support, {
    side: 'left',
    palm: [-0.034, -0.072, -0.066],
    across: GRIP_DOWN,
    back: [-1, 0, 0],
    fingers: [SUPPORT, SUPPORT, SUPPORT, SUPPORT],
    thumb: { swing: 0.3, curl: [0.1, 0.1] },
  });
  buildForearm(support, leftWrist, [-0.16, -0.26, -0.28]);
  // The red laser (M26b): a module clipped to the dust cover's rail, its lens at the front.
  const laser = new ModelBuilder();
  laser.box('polymer', 0.046, 0.09, -0.042, -0.024, 0.022);
  laser.box('laserLens', 0.09, 0.093, -0.038, -0.03, 0.009);
  const group = b.build(m);
  group.add(namedPart(laser, m, 'laser:redLaser'));
  const magazine = magazinePart({ standard: mag, extended }, m, GRIP_DOWN, { extended: [0, -0.038, 0] });
  group.add(magazine.group);
  // From the side of the grip down to the magazine's base plate.
  const supportHand = supportHandPart(support, m, [0.004, -0.068, -0.024]);
  group.add(supportHand.group);
  const muzzle = muzzleMarker(0.104, 0.015);
  group.add(muzzle);
  return { group, muzzle, magazine, supportHand };
}

/**
 * One held replica's model and the parts the viewmodel moves (typed here rather than found by name and read from
 * userData, audit L-05). Positions are as (across, up, back) in the model's space.
 */
export interface ReplicaModel {
  group: THREE.Group;
  /** Empty marker at the muzzle, where visual BBs start. */
  muzzle: THREE.Object3D;
  magazine: MagazinePart;
  supportHand: SupportHandPart;
}

/** The magazine group (named 'magazine'), which slides out along `axis` (the magwell, a unit vector) on a reload. */
export interface MagazinePart {
  group: THREE.Group;
  axis: THREE.Vector3;
  /**
   * Per fitted-magazine part ('magazine:<id>') whose base plate sits elsewhere than the standard one's: the offset
   * there, where the support hand reaches on a reload. Missing: the standard base.
   */
  bases: ReadonlyMap<THREE.Object3D, THREE.Vector3>;
}

/** The support hand and forearm (named 'supportHand'); `toMag` moves it from its grip to holding the magazine. */
export interface SupportHandPart {
  group: THREE.Group;
  toMag: THREE.Vector3;
}

export interface ReplicaModels {
  models: Map<string, ReplicaModel>;
  /** Your own left hand raised high, palm forward: calling your hit. */
  raisedHand: THREE.Group;
  dispose(): void;
}

/** Fingers held straight and together. */
const OPEN: FingerCurl = [0.06, 0.05, 0.03];

/** Left hand raised to call a hit: palm facing forward, fingers up, forearm dropping out of view. */
function buildRaisedHand(m: Record<MaterialKey, THREE.Material>): THREE.Group {
  const b = new ModelBuilder();
  const wrist = buildHand(b, {
    side: 'left',
    palm: [0, 0, 0],
    across: [-1, 0, 0],
    back: [0, 0, -1],
    fingers: [OPEN, OPEN, OPEN, OPEN],
    thumb: { swing: 0.1, curl: [0.1, 0.05] },
  });
  buildForearm(b, wrist, [wrist[0] + 0.03, wrist[1] - 0.3, wrist[2] - 0.08]);
  return b.build(m);
}

/** Builds the held-replica model (with hands and team armband) for each replica in the loadout, keyed by replica id. */
export function buildReplicaModels(loadout: readonly ReplicaConfig[], teamColor: number, orangeTips: boolean): ReplicaModels {
  const materials = createMaterials(teamColor);
  const models = new Map<string, ReplicaModel>();
  for (const r of loadout) {
    models.set(r.id, r.look.model === 'pistol' ? buildPistol(materials, orangeTips) : buildAeg(materials, orangeTips));
  }
  const raisedHand = buildRaisedHand(materials);
  return {
    models,
    raisedHand,
    dispose() {
      raisedHand.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const { group } of models.values()) {
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
      }
      for (const mat of Object.values(materials)) mat.dispose();
    },
  };
}

/**
 * The magazine as its own group named 'magazine', so the viewmodel can slide it out along `axis`
 * (the magwell direction, as (across, up, forward)) during reloads. One child per magazine the replica takes, named
 * 'magazine:<id>'; the viewmodel shows the one fitted.
 */
function magazinePart(
  builders: Partial<Record<MagazineId, ModelBuilder>>,
  m: Record<MaterialKey, THREE.Material>,
  axis: readonly [number, number, number],
  baseShift: Partial<Record<MagazineId, readonly [number, number, number]>> = {},
): MagazinePart {
  const group = new THREE.Group();
  const bases = new Map<THREE.Object3D, THREE.Vector3>();
  for (const [id, builder] of Object.entries(builders)) {
    const part = namedPart(builder, m, `magazine:${id}`);
    // Where this magazine's base plate sits against the standard one's, as (across, up, forward): the support hand
    // reaches there on a reload.
    const shift = baseShift[id as MagazineId];
    if (shift) bases.set(part, new THREE.Vector3(shift[0], shift[1], -shift[2]));
    group.add(part);
  }
  group.name = 'magazine';
  return { group, axis: new THREE.Vector3(axis[0], axis[1], -axis[2]).normalize(), bases };
}

/**
 * The support (left) hand and forearm as their own group named 'supportHand', so reloads can move it
 * to the magazine: `toMag` is the offset from its grip to holding the magazine, as (across, up, forward).
 */
function supportHandPart(builder: ModelBuilder, m: Record<MaterialKey, THREE.Material>, toMag: readonly [number, number, number]): SupportHandPart {
  const group = builder.build(m);
  group.name = 'supportHand';
  return { group, toMag: new THREE.Vector3(toMag[0], toMag[1], -toMag[2]) };
}

/** A part the viewmodel shows or hides by name (the fitted optic, grip or magazine, the iron sights up or folded). */
function namedPart(builder: ModelBuilder, m: Record<MaterialKey, THREE.Material>, name: string): THREE.Group {
  const group = builder.build(m);
  group.name = name;
  return group;
}

/** Empty marker at the muzzle (forward, up) so presentation can start visual BBs there. */
function muzzleMarker(forward: number, up: number): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.name = 'muzzle';
  marker.position.set(0, up, -forward);
  return marker;
}
