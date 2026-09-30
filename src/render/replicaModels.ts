import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildForearm, buildHand, type FingerCurl } from './handModels';
import type { ReplicaConfig } from '../config/replicas';

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

type MaterialKey = 'polymer' | 'furniture' | 'mag' | 'metal' | 'rubber' | 'orange' | 'dot' | 'glove' | 'sleeve' | 'armband';

function createMaterials(teamColor: number): Record<MaterialKey, THREE.Material> {
  return {
    polymer: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.72, metalness: 0.05 }),
    furniture: new THREE.MeshStandardMaterial({ color: 0xb49a70, roughness: 0.82, metalness: 0 }),
    mag: new THREE.MeshStandardMaterial({ color: 0x34373c, roughness: 0.7, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.42, metalness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95, metalness: 0 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.55, metalness: 0 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
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
 * AR-pattern AEG in two-tone: black upper and lower receiver, tan stock, grip, handguard and magazine.
 * Flat-top rail with a red-dot, A-frame front sight, birdcage-style flash hider.
 */
function buildAeg(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean): THREE.Group {
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
  // Curved polymer magazine with a black base plate (its own part so reloads can drop it out).
  const mag = new ModelBuilder();
  mag.profile('furniture', [[0.03, -0.076], [0.092, -0.076], [0.105, -0.15], [0.127, -0.222], [0.073, -0.236], [0.055, -0.156]], 0.026, 0.008);
  mag.profile('polymer', [[0.071, -0.232], [0.129, -0.219], [0.133, -0.232], [0.074, -0.246]], 0.03, 0.004);
  // Handguard (tan) with slots and a top rail.
  b.profile('furniture', [[0.15, 0.0], [0.4, 0.0], [0.4, 0.066], [0.15, 0.066]], 0.058, 0.014);
  for (const x of [0.19, 0.245, 0.3, 0.35]) b.box('rubber', x, x + 0.035, 0.026, 0.042, 0.06);
  b.rail(0.155, 0.395, 0.066, 0.02);
  // Barrel, gas block with A-frame front sight, flash hider.
  b.tube('metal', 0.4, 0.165, 0.034, 0.009);
  b.box('polymer', 0.43, 0.455, 0.022, 0.05, 0.03);
  b.profile('polymer', [[0.425, 0.05], [0.46, 0.05], [0.449, 0.108], [0.436, 0.108]], 0.02, 0.003);
  b.tube(orangeTip ? 'orange' : 'metal', 0.565, 0.016, 0.034, 0.013, 10);
  b.tube(orangeTip ? 'orange' : 'polymer', 0.581, 0.03, 0.034, 0.012, 6);
  // Buffer tube, collapsible stock, butt pad.
  b.tube('polymer', -0.27, 0.17, 0.032, 0.016);
  b.profile('furniture', [[-0.2, 0.056], [-0.33, 0.06], [-0.336, -0.056], [-0.31, -0.064], [-0.236, -0.012], [-0.2, 0.0]], 0.044, 0.012);
  b.profile('rubber', [[-0.332, 0.06], [-0.352, 0.06], [-0.358, -0.056], [-0.338, -0.058]], 0.046, 0.006);
  // Red-dot sight on the rail.
  b.box('polymer', 0.0, 0.05, 0.074, 0.088, 0.03);
  b.tube('polymer', -0.008, 0.065, 0.108, 0.019);

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
  group.add(magazinePart(mag, m, [0, -0.97, 0.25]));
  // From the handguard to just under the magazine's base plate (forward 0.1, up -0.26).
  group.add(supportHandPart(support, m, [0.012, -0.242, -0.19]));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), m.dot);
  dot.position.set(0, 0.108, 0.009);
  dot.name = 'dot';
  group.add(muzzleMarker(0.611, 0.034));
  group.add(dot);
  return group;
}

/** Polymer striker-fired gas pistol in two-tone: black slide over a tan frame with an accessory rail. */
function buildPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean): THREE.Group {
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
  const group = b.build(m);
  group.add(magazinePart(mag, m, GRIP_DOWN));
  // From the side of the grip down to the magazine's base plate.
  group.add(supportHandPart(support, m, [0.004, -0.068, -0.024]));
  group.add(muzzleMarker(0.104, 0.015));
  return group;
}

export interface ReplicaModels {
  models: Map<string, THREE.Group>;
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
  const models = new Map<string, THREE.Group>();
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
      for (const group of models.values()) {
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
 * (the magwell direction, as (across, up, forward)) during reloads.
 */
function magazinePart(builder: ModelBuilder, m: Record<MaterialKey, THREE.Material>, axis: readonly [number, number, number]): THREE.Group {
  const group = builder.build(m);
  group.name = 'magazine';
  group.userData.axis = new THREE.Vector3(axis[0], axis[1], -axis[2]).normalize();
  return group;
}

/**
 * The support (left) hand and forearm as their own group named 'supportHand', so reloads can move it
 * to the magazine: `toMag` is the offset from its grip to holding the magazine, as (across, up, forward).
 */
function supportHandPart(builder: ModelBuilder, m: Record<MaterialKey, THREE.Material>, toMag: readonly [number, number, number]): THREE.Group {
  const group = builder.build(m);
  group.name = 'supportHand';
  group.userData.toMag = new THREE.Vector3(toMag[0], toMag[1], -toMag[2]);
  return group;
}

/** Empty marker at the muzzle (forward, up) so presentation can start visual BBs there. */
function muzzleMarker(forward: number, up: number): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.name = 'muzzle';
  marker.position.set(0, up, -forward);
  return marker;
}
