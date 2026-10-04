import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildForearm, buildHand, type FingerCurl } from './handModels';
import type { MagazineId } from '../config/attachments';
import type { DetailLevel } from '../config/render';
import { REPLICA_FINISH } from '../config/replicaFinish';
import type { ReplicaConfig } from '../config/replicas';
import { LASERS } from '../config/lasers';
import { projectSpeckleUvs, type SpeckleTextures, speckleTextures } from './replicaFinish';

/**
 * First-person replica models built in code. They resemble real-world replica types (an AR-pattern
 * AEG, a polymer striker pistol) but are generic (no brands, logos or copies of a specific design)
 * and rendered stylised: chunky side-profile silhouettes extruded with soft bevels, plus cylinders
 * and small detail parts, in two-tone black and tan. The orange muzzle tip many real replicas carry
 * is optional (VIEWMODEL.orangeTips).
 *
 * Profiles are drawn as (forward, up) in metres, with the receiver/frame near the origin. Parts are
 * merged per material, so each replica is only a few draw calls.
 *
 * Replica detail `high` (FA8, QualitySettings.replicaDetail; final alpha audit section 5) keeps every silhouette and
 * adds: rounded corners on boxes with a lighter bevel (the CS edge highlight) and lighter worn edges, a moulded speckle
 * (roughness and normal maps) on the polymer and a stipple on the rubber, painted steel that reflects the replica's sheen,
 * real rail slots, ring and post sights, glass lenses and an emissive laser lens, and per-part detail on every optic,
 * grip, magazine and the laser. Hand detail `high` dresses the gloves and sleeves (handModels.ts). Low is unchanged.
 */

type Pt = readonly [forward: number, up: number];

type MaterialKey = 'polymer' | 'furniture' | 'mag' | 'metal' | 'rubber' | 'orange' | 'lens' | 'laserLens' | 'bb' | 'glove' | 'sleeve' | 'armband';

/** The replica and hand detail a viewmodel is built at (QualitySettings.replicaDetail and handDetail, FA8). */
export interface ReplicaDetail {
  replica: DetailLevel;
  hands: DetailLevel;
}

/** Both as they were before the visual overhaul (Low). */
export const LOW_DETAIL: ReplicaDetail = { replica: 'low', hands: 'low' };

const F = REPLICA_FINISH;

/** The materials whose surface takes the speckle (high detail), and their grain. */
const SPECKLED: Partial<Record<MaterialKey, number>> = {
  polymer: F.density.polymer,
  furniture: F.density.polymer,
  mag: F.density.polymer,
  rubber: F.density.rubber,
};

/** How a part's vertices are coloured on high detail: which faces are its bevels, and whether its edges are worn. */
type EdgeKind = 'none' | 'extrude' | 'box';

/**
 * The replicas' materials (M14 polish): moulded polymer with a soft satin sheen (it catches the viewmodel's environment
 * on High and Medium), dull grey "metal" that is plainly painted zinc and plastic, rubber, tinted lens. Toys, not guns.
 * High detail (FA8): the speckle maps on polymer and rubber, vertex colours for the edge highlight, painted steel, a
 * glossy glass, a glowing laser lens.
 */
function createMaterials(teamColor: number, detail: ReplicaDetail, speckle: SpeckleTextures | null): Record<MaterialKey, THREE.Material> {
  const vertexColors = coloured(detail);
  const mean = F.speckle.grey / 255;
  const speckled = (color: number, roughness: number): THREE.MeshStandardMaterial =>
    speckle
      ? new THREE.MeshStandardMaterial({
          color,
          roughness: Math.min(1, roughness / mean),
          metalness: 0,
          roughnessMap: speckle.roughness,
          normalMap: speckle.normal,
          normalScale: new THREE.Vector2(F.normalScale, F.normalScale),
          vertexColors,
        })
      : new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors });
  const high = detail.replica === 'high';
  const materials: Record<MaterialKey, THREE.Material> = {
    polymer: speckled(0x2a2c31, high ? F.roughness.polymer : 0.5),
    furniture: speckled(0xb79c70, high ? F.roughness.furniture : 0.58),
    mag: speckled(0x363a40, high ? F.roughness.mag : 0.52),
    metal: high
      ? new THREE.MeshStandardMaterial({ color: F.metal.color, ...F.metal.unlit, vertexColors })
      : new THREE.MeshStandardMaterial({ color: 0x6a6f78, roughness: 0.45, metalness: 0.35, vertexColors }),
    rubber: speckled(0x17181a, high ? F.roughness.rubber : 0.95),
    orange: new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.5, metalness: 0, vertexColors }),
    lens: high
      ? new THREE.MeshStandardMaterial({ color: F.glass.color, roughness: F.glass.roughness, metalness: 0, transparent: true, opacity: F.glass.opacity, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.12, depthWrite: false }),
    // The red laser's lens glows its beam's colour (config/lasers.ts), unlit, so it reads in any light. High: emissive,
    // so the tone mapping rolls it into a glow without a bloom pass.
    laserLens: high
      ? new THREE.MeshStandardMaterial({ color: F.laserBody, emissive: LASERS.redLaser.colour, emissiveIntensity: F.laserGlow, roughness: 0.3, metalness: 0 })
      : new THREE.MeshBasicMaterial({ color: LASERS.redLaser.colour }),
    bb: new THREE.MeshStandardMaterial({ color: F.witnessBb, roughness: 0.35, metalness: 0, vertexColors }),
    // Olive gloves: clearly separate from the black polymer and tan furniture.
    glove: new THREE.MeshStandardMaterial({ color: 0x5d6146, roughness: 0.9, metalness: 0, vertexColors }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 1, metalness: 0, vertexColors }),
    // Team tape on the sleeve, as players wear at real sites.
    armband: new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7, metalness: 0, vertexColors }),
  };
  // Vertex colours only darken (a colour can't pass white), so flat faces sit at VERTEX_BASE and the material is that
  // much brighter: a flat face is its colour as before, a bevel or worn edge lighter.
  if (vertexColors) for (const mat of Object.values(materials)) if (mat instanceof THREE.MeshStandardMaterial && mat.vertexColors) mat.color.multiplyScalar(1 / VERTEX_BASE);
  return materials;
}

/** A flat face's vertex colour when parts are coloured: the brightest edge (a worn one) is white. */
const VERTEX_BASE = 1 / F.wearLight;

/** Parts carry vertex colours (edge highlights, seams) when either the replica or the hands are detailed. */
function coloured(detail: ReplicaDetail): boolean {
  return detail.replica === 'high' || detail.hands === 'high';
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

/** True for a bevel face's normal: an extrusion's (between its flat side and its outline) or a rounded box's (between two faces). */
function onBevel(kind: EdgeKind, nx: number, ny: number, nz: number): boolean {
  if (kind === 'extrude') return Math.abs(nx) > 0.12 && Math.abs(nx) < 0.97;
  if (kind !== 'box') return false;
  let axes = 0;
  if (Math.abs(nx) > 0.2) axes++;
  if (Math.abs(ny) > 0.2) axes++;
  if (Math.abs(nz) > 0.2) axes++;
  return axes >= 2;
}

/** Collects parts per material and merges them into one mesh per material. */
class ModelBuilder {
  private readonly parts = new Map<MaterialKey, THREE.BufferGeometry[]>();
  /** The next part's edges are worn (lighter than the edge highlight): set by `worn`. */
  private wear = false;

  constructor(readonly detail: ReplicaDetail = LOW_DETAIL) {}

  /** The replica's overhaul shapes and finishes are drawn (Replica detail `high`). */
  get high(): boolean {
    return this.detail.replica === 'high';
  }

  /** Side-profile silhouette extruded to `width`, centred on the model's axis (or `x` across it), with a soft bevel. */
  profile(key: MaterialKey, outline: readonly Pt[], width: number, round = 0.006, hole?: readonly Pt[], x = 0): this {
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
    if (x !== 0) geo.translate(x, 0, 0);
    return this.add(key, geo, 'extrude');
  }

  /**
   * Box from `from` to `to` along the forward axis. High detail rounds its corners (REPLICA_FINISH.bevel) when it is
   * big enough to show them; rail teeth and slivers stay sharp.
   */
  box(key: MaterialKey, from: number, to: number, y0: number, y1: number, width: number, x = 0): this {
    const [w, h, d] = [width, y1 - y0, to - from];
    const small = Math.min(w, h, d);
    const rounded = this.high && small >= F.bevel.minSize;
    const geo = rounded ? new RoundedBoxGeometry(w, h, d, 1, Math.min(F.bevel.radius, small / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
    geo.translate(x, (y0 + y1) / 2, -(from + to) / 2);
    return this.add(key, geo, rounded ? 'box' : 'none');
  }

  /** Cylinder lying along the forward axis. */
  tube(key: MaterialKey, from: number, length: number, up: number, radius: number, segments = 14): this {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, up, -(from + length / 2));
    return this.add(key, geo, 'none');
  }

  /** A cylinder across the model (along X), centred at (forward, up): knobs, screws, pivots, a wheel. */
  crossTube(key: MaterialKey, forward: number, up: number, radius: number, length: number, x = 0, segments = 8): this {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
    geo.rotateZ(Math.PI / 2);
    geo.translate(x, up, -forward);
    return this.add(key, geo, 'none');
  }

  /** A cylinder standing up (along Y), centred at (forward, up): a turret cap, a screw head on top. */
  uprightTube(key: MaterialKey, forward: number, up: number, radius: number, length: number, x = 0, segments = 8): this {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
    geo.translate(x, up, -forward);
    return this.add(key, geo, 'none');
  }

  /** Hollow tube along the forward axis (an optic's body you can look through), `outer` and `inner` radii. */
  ringTube(key: MaterialKey, from: number, length: number, up: number, outer: number, inner: number, segments = 24): this {
    const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2, false);
    shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: segments });
    geo.translate(0, up, -(from + length));
    return this.add(key, geo, 'none');
  }

  /** A small sphere (a BB behind a witness window). */
  ball(key: MaterialKey, forward: number, up: number, radius: number, x = 0): this {
    return this.add(key, new THREE.SphereGeometry(radius, 6, 4).translate(x, up, -forward), 'none');
  }

  /** Adds a prebuilt part (used by the hand and forearm builders). */
  addGeometry(key: MaterialKey, geo: THREE.BufferGeometry): void {
    this.add(key, geo, 'none');
  }

  /** Runs `draw` with its parts' edges worn lighter (high detail): where a hand rubs. */
  worn(draw: () => void): this {
    this.wear = true;
    draw();
    this.wear = false;
    return this;
  }

  /**
   * Picatinny-style rail: a strip with evenly spaced teeth. High detail: real slots, a tooth every centimetre, in steel
   * on a polymer strip (REPLICA_FINISH.rail).
   */
  rail(from: number, to: number, y: number, width: number): this {
    this.box('polymer', from, to, y, y + 0.01, width);
    if (!this.high) {
      for (let x = from + 0.004; x + 0.008 <= to; x += 0.016) this.box('polymer', x, x + 0.008, y + 0.01, y + 0.016, width + 0.004);
      return this;
    }
    const R = F.rail;
    for (let x = from + R.tooth / 2; x + R.tooth <= to; x += R.pitch) this.box('polymer', x, x + R.tooth, y + 0.01, y + 0.016, width + 0.004);
    return this;
  }

  /** A short rail along one side of the handguard (high detail), `side` -1 left or 1 right, its teeth facing out. */
  sideRail(from: number, to: number, up: number, side: number, halfWidth: number): this {
    const R = F.rail;
    this.box('polymer', from, to, up - 0.008, up + 0.008, 0.006, side * (halfWidth + 0.003));
    for (let x = from + R.tooth / 2; x + R.tooth <= to; x += R.pitch) this.box('polymer', x, x + R.tooth, up - 0.009, up + 0.009, 0.004, side * (halfWidth + 0.008));
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

  private add(key: MaterialKey, geo: THREE.BufferGeometry, edge: EdgeKind): this {
    if (this.high && SPECKLED[key] !== undefined) projectSpeckleUvs(geo, SPECKLED[key]! / F.speckle.size);
    else geo.deleteAttribute('uv');
    if (coloured(this.detail)) this.colour(geo, this.high ? edge : 'none');
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(geo);
    return this;
  }

  /** Vertex colours: the flat face's base (or what a hand part brought, on it), lighter on bevel faces and worn edges. */
  private colour(geo: THREE.BufferGeometry, edge: EdgeKind): void {
    const nor = geo.getAttribute('normal');
    const own = geo.getAttribute('color');
    const n = geo.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    const light = this.wear ? F.wearLight : F.edgeLight;
    for (let i = 0; i < n; i++) {
      const k = VERTEX_BASE * (onBevel(edge, nor.getX(i), nor.getY(i), nor.getZ(i)) ? light : 1);
      colors[i * 3] = Math.min(1, (own ? own.getX(i) : 1) * k);
      colors[i * 3 + 1] = Math.min(1, (own ? own.getY(i) : 1) * k);
      colors[i * 3 + 2] = Math.min(1, (own ? own.getZ(i) : 1) * k);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
 * Where a model's muzzle end is (M29b), forward from its origin (m): where its standard barrel ends and how high its bore
 * sits, how much further a longer barrel reaches, and how far beyond the barrel's end each muzzle device ('none': as it
 * comes) puts the muzzle.
 */
export interface MuzzleLayout {
  barrelEnd: number;
  up: number;
  extensions: Readonly<Record<string, number>>;
  tips: Readonly<Record<string, number>>;
}

/** The AEG's: a 0.1 m longer barrel; the flash hider 4.6 cm long, a silencer 12 cm. */
export const AEG_MUZZLE = { barrelEnd: 0.565, up: 0.034, extensions: { long: 0.1 }, tips: { none: 0.046, silencer: 0.12 } } satisfies MuzzleLayout;
/** The pistol's: no barrel swap; a silencer 10 cm. */
export const PISTOL_MUZZLE = { barrelEnd: 0.104, up: 0.015, extensions: {}, tips: { none: 0, silencer: 0.1 } } satisfies MuzzleLayout;

/**
 * Draws one fitted part (an optic, a grip, a magazine, the laser, a barrel) into its own builder. Every part the Loadout
 * can fit has an entry in its replica's table below, by name (the table keys are the viewmodel's 'kind:id' names); muzzle
 * devices have their own table, drawn on the muzzle mount.
 */
type PartDraw = (b: ModelBuilder) => void;

/**
 * Draws a muzzle device (M29b) on the mount: from 0 (the fitted barrel's end) forward along the bore (`up` high), its
 * tip painted orange with `orangeTip`.
 */
type MuzzleDraw = (b: ModelBuilder, orangeTip: boolean) => void;

/** The red dot: a tall riser mount clamped to the rail under a tube you look through (front lens faintly tinted). */
function redDot(b: ModelBuilder): void {
  const o = RIFLE_OPTIC;
  // The riser keeps the receiver and the folded sights well below the dot in the aimed view (a lower-third co-witness).
  b.box('polymer', 0.004, 0.056, 0.074, 0.084, 0.034);
  b.box('polymer', 0.012, 0.048, 0.084, o.axisUp - o.outer + 0.004, 0.024);
  b.ringTube('polymer', o.from, o.length, o.axisUp, o.outer, o.inner);
  if (!b.high) b.box('polymer', 0.02, 0.04, o.axisUp - 0.008, o.axisUp + 0.008, 0.012, o.outer + 0.004); // brightness dial, right side
  b.tube('lens', o.from + o.length - 0.004, 0.002, o.axisUp, o.inner, 24);
  if (!b.high) return;
  // A hood at the front with a 1 mm lip, a knurled brightness dial on the right, the emitter's housing low inside the
  // tube at the back, and the clamp's cross-bolt through the mount.
  b.ringTube('polymer', o.from + o.length - 0.006, 0.006, o.axisUp, o.outer + 0.0012, o.inner + 0.0005);
  b.crossTube('polymer', 0.03, o.axisUp, 0.009, 0.008, o.outer + 0.004, 12);
  b.box('polymer', o.from + 0.006, o.from + 0.018, o.axisUp - o.inner, o.axisUp - o.inner + 0.004, 0.012);
  b.crossTube('metal', 0.03, 0.079, 0.0035, 0.04, 0, 8);
}

/** The 2× scope (M17b): a longer tube on two rings, a wider objective bell in front, on the red dot's axis. */
function scope2x(b: ModelBuilder): void {
  const o = RIFLE_OPTIC;
  const sc = RIFLE_SCOPE;
  for (const x of [0.0, 0.07]) {
    b.box('polymer', x, x + 0.024, 0.074, 0.084, 0.034);
    b.box('polymer', x + 0.004, x + 0.02, 0.084, o.axisUp - sc.outer + 0.004, 0.022);
  }
  b.ringTube('polymer', sc.from, sc.length, o.axisUp, sc.outer, sc.inner);
  b.ringTube('polymer', sc.from + sc.length, sc.bellLength, o.axisUp, sc.bellOuter, sc.bellOuter - 0.003);
  b.ringTube('polymer', sc.from - sc.eyeLength, sc.eyeLength, o.axisUp, sc.outer + 0.004, sc.inner);
  if (!b.high) b.box('polymer', 0.03, 0.05, o.axisUp + sc.outer - 0.002, o.axisUp + sc.outer + 0.012, 0.016); // turret
  b.tube('lens', sc.from + sc.length + sc.bellLength - 0.004, 0.002, o.axisUp, sc.bellOuter - 0.003, 24);
  if (!b.high) return;
  // Turrets on top and on the right with their caps; a rubber eye cup; a dark inner tube in the bell, so the objective
  // reads as glass over black; scope rings round the tube with two screws a side.
  const turret = sc.from + sc.length / 2;
  b.box('polymer', turret - 0.012, turret + 0.012, o.axisUp + sc.outer - 0.003, o.axisUp + sc.outer + 0.004, 0.02);
  b.uprightTube('polymer', turret, o.axisUp + sc.outer + 0.009, 0.0085, 0.01, 0, 12);
  b.uprightTube('rubber', turret, o.axisUp + sc.outer + 0.0145, 0.0088, 0.002, 0, 12);
  b.crossTube('polymer', turret, o.axisUp, 0.0085, 0.01, sc.outer + 0.004, 12);
  b.ringTube('rubber', sc.from - sc.eyeLength - 0.008, 0.01, o.axisUp, sc.outer + 0.006, sc.inner + 0.001);
  b.ringTube('rubber', sc.from + sc.length + 0.004, sc.bellLength - 0.01, o.axisUp, sc.bellOuter - 0.003, sc.bellOuter - 0.005);
  for (const x of [0.0, 0.07]) {
    b.ringTube('polymer', x + 0.004, 0.016, o.axisUp, sc.outer + 0.003, sc.outer);
    for (const side of [-1, 1]) for (const dy of [-0.006, 0.006]) b.crossTube('polymer', x + 0.012, o.axisUp + dy, 0.0018, 0.003, side * (sc.outer + 0.004), 6);
  }
}

/** The vertical grip on the handguard rail, behind the support hand. High: a stippled rubber lower half and a capped foot. */
function verticalGrip(b: ModelBuilder): void {
  b.box('polymer', 0.196, 0.244, -0.008, 0.002, 0.03);
  if (!b.high) {
    b.profile('polymer', [[0.204, -0.008], [0.236, -0.008], [0.232, -0.088], [0.208, -0.092]], 0.026, 0.008);
    return;
  }
  b.profile('polymer', [[0.204, -0.008], [0.236, -0.008], [0.234, -0.046], [0.206, -0.048]], 0.026, 0.004);
  b.profile('rubber', [[0.206, -0.046], [0.234, -0.044], [0.232, -0.084], [0.208, -0.088]], 0.027, 0.004);
  b.profile('polymer', [[0.206, -0.084], [0.233, -0.081], [0.233, -0.09], [0.207, -0.094]], 0.029, 0.003);
}

/** The angled grip: a flat polymer wedge whose bevelled ridge catches the light (high). */
function angledGrip(b: ModelBuilder): void {
  b.profile('polymer', [[0.165, -0.002], [0.262, -0.002], [0.262, -0.014], [0.188, -0.046], [0.172, -0.04]], 0.03, 0.006);
  if (!b.high) return;
  // Thumb ribs along its back edge.
  for (let i = 0; i < 4; i++) b.box('polymer', 0.2 + i * 0.012, 0.206 + i * 0.012, -0.03 + i * 0.0045, -0.026 + i * 0.0045, 0.032);
}

/** The rifle's curved magazine outline, and its base plate's. */
const AEG_MAG: readonly Pt[] = [[0.03, -0.076], [0.092, -0.076], [0.105, -0.15], [0.127, -0.222], [0.073, -0.236], [0.055, -0.156]];
const AEG_MAG_BASE: readonly Pt[] = [[0.071, -0.232], [0.129, -0.219], [0.133, -0.232], [0.074, -0.246]];

/** The magazine's back and front edges at height `up` (the outline's first and last edges, as drawn). */
function magSpan(back: readonly Pt[], front: readonly Pt[], up: number): [number, number] {
  const at = (edge: readonly Pt[]): number => {
    for (let i = 1; i < edge.length; i++) {
      const [a, b] = [edge[i - 1]!, edge[i]!];
      if (up <= a[1] && up >= b[1]) return a[0] + ((b[0] - a[0]) * (up - a[1])) / (b[1] - a[1]);
    }
    return edge.at(-1)![0];
  };
  return [at(back), at(front)];
}

/** A rib round a magazine's body at `up`, `height` tall, set in `inset` from its edges and `proud` past its sides. */
function magRib(b: ModelBuilder, key: MaterialKey, back: readonly Pt[], front: readonly Pt[], up: number, height: number, width: number): void {
  const inset = 0.002;
  const [b0, f0] = magSpan(back, front, up);
  const [b1, f1] = magSpan(back, front, up - height);
  b.profile(key, [[b0 + inset, up], [f0 - inset, up], [f1 - inset, up - height], [b1 + inset, up - height]], width, 0.0015);
}

/** The rifle magazine's back and front edges (top to bottom), from AEG_MAG. */
const AEG_MAG_BACK: readonly Pt[] = [[0.03, -0.076], [0.055, -0.156], [0.073, -0.236]];
const AEG_MAG_FRONT: readonly Pt[] = [[0.092, -0.076], [0.105, -0.15], [0.127, -0.222]];

/** The standard (mid-cap) magazine: tan polymer, black base plate. High: two ribs and a witness window showing BBs. */
function aegStandardMag(b: ModelBuilder): void {
  b.profile('furniture', AEG_MAG, 0.026, 0.008);
  b.profile('polymer', AEG_MAG_BASE, 0.03, 0.004);
  if (!b.high) return;
  for (const up of [-0.09, -0.205]) magRib(b, 'furniture', AEG_MAG_BACK, AEG_MAG_FRONT, up, 0.005, 0.028);
  // The witness window on the side you see: a dark slot down the body with four BBs behind it.
  b.profile('rubber', [[0.062, -0.1], [0.07, -0.1], [0.086, -0.19], [0.078, -0.19]], 0.0275, 0.002);
  for (let i = 0; i < 4; i++) b.ball('bb', 0.068 + i * 0.0042, -0.112 - i * 0.021, 0.0028, -0.0125);
}

/** The hi-cap: the same shape, wider, with a winding wheel under its base. High: a bulged lower body, a ribbed base, a notched wheel. */
function aegHiCap(b: ModelBuilder): void {
  if (b.high) b.profile('furniture', [[0.03, -0.076], [0.092, -0.076], [0.105, -0.15], [0.13, -0.2], [0.127, -0.222], [0.073, -0.236], [0.052, -0.18], [0.055, -0.156]], 0.03, 0.008);
  else b.profile('furniture', AEG_MAG, 0.03, 0.008);
  b.profile('polymer', AEG_MAG_BASE, 0.034, 0.004);
  const wheel = { from: 0.088, length: 0.03, up: -0.252, radius: 0.014 };
  b.tube('metal', wheel.from, wheel.length, wheel.up, wheel.radius, 12); // the winding wheel
  if (!b.high) return;
  b.profile('polymer', [[0.08, -0.236], [0.124, -0.226], [0.125, -0.23], [0.081, -0.24]], 0.036, 0.0015);
  // Six notches round the wheel's rim, for a thumb to wind it.
  for (let i = 0; i < 6; i++) {
    const notch = new THREE.BoxGeometry(0.004, 0.004, wheel.length + 0.002).translate(0, wheel.radius - 0.0005, 0).rotateZ((i / 6) * Math.PI * 2);
    b.addGeometry('metal', notch.translate(0, wheel.up, -(wheel.from + wheel.length / 2)));
  }
}

/** The low-cap: short and straight. High: a grey steel body with three ribs on a polymer base. */
function aegLowCap(b: ModelBuilder): void {
  const body: readonly Pt[] = [[0.03, -0.076], [0.092, -0.076], [0.1, -0.13], [0.108, -0.168], [0.062, -0.176], [0.052, -0.13]];
  b.profile(b.high ? 'metal' : 'furniture', body, 0.026, 0.008);
  b.profile('polymer', [[0.059, -0.172], [0.111, -0.164], [0.113, -0.176], [0.061, -0.186]], 0.03, 0.004);
  if (!b.high) return;
  const back: readonly Pt[] = [[0.03, -0.076], [0.052, -0.13], [0.062, -0.176]];
  const front: readonly Pt[] = [[0.092, -0.076], [0.1, -0.13], [0.108, -0.168]];
  for (const up of [-0.098, -0.12, -0.142]) magRib(b, 'metal', back, front, up, 0.004, 0.028);
}

/** The pistol's magazine outline (hidden in the grip until a reload drops it out). */
const PISTOL_MAG: readonly Pt[] = [[-0.058, -0.02], [-0.076, -0.02], [-0.1, -0.118], [-0.078, -0.12]];

/** The pistol's standard magazine and base plate. High: a tan base plate with a rim (furniture). */
function pistolStandardMag(b: ModelBuilder): void {
  b.profile('mag', PISTOL_MAG, 0.022, 0.003);
  b.box(b.high ? 'furniture' : 'polymer', -0.108, -0.062, -0.13, -0.119, 0.032); // base plate
}

/** The extended magazine (M17b): a sleeve sticking out under the grip. High: its base lip 3 mm proud with a lighter rim. */
function pistolExtendedMag(b: ModelBuilder): void {
  b.profile('mag', PISTOL_MAG, 0.022, 0.003);
  b.profile('furniture', [[-0.1, -0.118], [-0.064, -0.12], [-0.058, -0.158], [-0.104, -0.158]], 0.03, 0.004);
  b.box('polymer', -0.11, -0.056, -0.168, -0.157, 0.032); // base plate
  if (b.high) b.worn(() => b.box('polymer', -0.113, -0.053, -0.16, -0.151, 0.038));
}

/** The red laser (M26b): a module clipped to the dust cover's rail, its lens at the front. High: a clamp, a thumb screw, a switch cap. */
function redLaser(b: ModelBuilder): void {
  b.box('polymer', 0.046, 0.09, -0.042, -0.024, 0.022);
  b.box('laserLens', 0.09, 0.093, -0.038, -0.03, 0.009);
  if (!b.high) return;
  b.box('metal', 0.05, 0.072, -0.026, -0.018, 0.026);
  b.crossTube('metal', 0.061, -0.022, 0.0035, 0.006, 0.016, 8);
  b.tube('rubber', 0.034, 0.012, -0.033, 0.006, 10);
}

/** Where the laser's lens is (forward, up): the beam starts there. */
const PISTOL_LASER_LENS: Pt = [0.093, -0.034];

/** Where the AEG's gas block ends and its bare outer barrel shows, forward (m). */
const AEG_GAS_BLOCK_END = 0.455;

/** Dark flutes cut along a barrel from `from` to `to`: one on top, one each side (high detail). */
function flutes(b: ModelBuilder, from: number, to: number, up: number, radius: number): void {
  const B = F.barrel;
  b.box('rubber', from, to, up + radius - B.fluteDepth, up + radius + B.fluteDepth, B.fluteWidth);
  for (const side of [-1, 1]) b.box('rubber', from, to, up - B.fluteWidth / 2, up + B.fluteWidth / 2, B.fluteDepth * 2, side * radius);
}

/**
 * The long barrel (M29b): the outer barrel carried 0.1 m further, the muzzle mount moved to its end. High: a steel
 * coupling collar with two wrench flats where it joins, and fluting along it.
 */
function longBarrel(b: ModelBuilder): void {
  const { barrelEnd: end, up, extensions } = AEG_MUZZLE;
  const B = F.barrel;
  b.tube('metal', end, extensions.long, up, B.radius);
  if (!b.high) return;
  b.tube('metal', end - B.collar / 2, B.collar, up, B.collarRadius, B.segments);
  for (const side of [-1, 1]) b.box('rubber', end - B.collar / 2 + 0.002, end + B.collar / 2 - 0.002, up - 0.004, up + 0.004, 0.001, side * B.collarRadius);
  flutes(b, end + B.collar, end + extensions.long - B.collar, up, B.radius);
}

/**
 * The tight-bore barrel (M29b): a precision inner barrel the same length. Low draws nothing for it (as M29b did: the
 * outer barrel looks the same, and Low gains no draw call); high shows it by a heavier fluted steel sleeve over the outer
 * barrel between the gas block and the flash hider, a tan index band at the gas block and a crown ring.
 */
function tightBoreBarrel(b: ModelBuilder): void {
  if (!b.high) return;
  const { barrelEnd: end, up } = AEG_MUZZLE;
  const B = F.barrel;
  const from = AEG_GAS_BLOCK_END;
  b.tube('metal', from, end - from, up, B.sleeveRadius, B.segments);
  b.tube('furniture', from + 0.004, 0.005, up, B.sleeveRadius + 0.0006, B.segments);
  flutes(b, from + 0.014, end - B.collar - 0.004, up, B.sleeveRadius);
  b.tube('metal', end - B.collar, B.collar, up, B.collarRadius, B.segments);
}


/** The AEG's birdcage flash hider (as it comes: 'muzzle:none'). High: its slots. */
function flashHider(b: ModelBuilder, orangeTip: boolean): void {
  const up = AEG_MUZZLE.up;
  b.tube(orangeTip ? 'orange' : 'metal', 0, 0.016, up, 0.013, 10);
  b.tube(orangeTip ? 'orange' : 'polymer', 0.016, 0.03, up, 0.012, 6);
  if (b.high) for (const side of [-1, 1]) b.box('rubber', 0.021, 0.041, up - 0.003, up + 0.003, 0.002, side * 0.0115);
}

/**
 * A silencer (M29b) `length` long and `radius` round, its front `cap` orange with `orangeTip`. High: a steel thread
 * adapter at the back, stepped steel end caps, two stippled rubber grip bands and the dark bore at the front.
 */
function silencer(layout: MuzzleLayout, radius: number, cap: number): MuzzleDraw {
  const length = layout.tips.silencer ?? 0;
  const up = layout.up;
  return (b, orangeTip) => {
    if (!b.high) {
      b.tube('polymer', 0, length - cap, up, radius, 16);
      b.tube(orangeTip ? 'orange' : 'polymer', length - cap, cap, up, radius, 16);
      return;
    }
    const S = F.silencer;
    const capRadius = radius - S.capStep;
    b.tube('metal', 0, S.adapter, up, radius * S.adapterShare, S.segments);
    b.tube('metal', S.adapter, cap, up, capRadius, S.segments);
    b.tube('polymer', S.adapter + cap, length - S.adapter - cap * 2, up, radius, S.segments);
    b.tube(orangeTip ? 'orange' : 'metal', length - cap, cap, up, capRadius, S.segments);
    for (const at of [S.adapter + cap + S.bandInset, length - cap - S.bandInset - S.band]) b.tube('rubber', at, S.band, up, radius + S.bandProud, S.segments);
    b.tube('rubber', length - S.boreDepth, S.boreDepth + 0.0005, up, radius * S.boreShare, 12);
  };
}

/** The rifle's parts by name (M17b), each drawn on demand; the Loadout's names are the keys. */
const AEG_PARTS: Readonly<Record<string, PartDraw>> = {
  'optic:redDot': redDot,
  'optic:scope2x': scope2x,
  'grip:vertical': verticalGrip,
  'grip:angled': angledGrip,
  'barrel:long': longBarrel,
  'barrel:tightBore': tightBoreBarrel,
};
const AEG_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: aegStandardMag, hiCap: aegHiCap, lowCap: aegLowCap };
/** The muzzle devices by id ('none': the bare muzzle's own), drawn on the mount. */
const AEG_MUZZLE_DEVICES: Readonly<Record<string, MuzzleDraw>> = { none: flashHider, silencer: silencer(AEG_MUZZLE, 0.019, 0.006) };
const PISTOL_PARTS: Readonly<Record<string, PartDraw>> = { 'laser:redLaser': redLaser };
const PISTOL_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: pistolStandardMag, extended: pistolExtendedMag };
/** A silencer a little narrower than the slide; the bare muzzle has no device of its own. */
const PISTOL_MUZZLE_DEVICES: Readonly<Record<string, MuzzleDraw>> = { silencer: silencer(PISTOL_MUZZLE, 0.0135, 0.005) };

/** Every part a replica's table draws, built and named (exported for the tests: one builder per entry). */
export const REPLICA_PART_TABLES = {
  aeg: { parts: AEG_PARTS, magazines: AEG_MAGAZINES, muzzles: AEG_MUZZLE_DEVICES },
  pistol: { parts: PISTOL_PARTS, magazines: PISTOL_MAGAZINES, muzzles: PISTOL_MUZZLE_DEVICES },
} as const;

/**
 * AR-pattern AEG in two-tone: black upper and lower receiver, tan stock, grip, handguard and magazine.
 * Flat-top rails with flip-up iron sights (folded down when an optic is fitted), birdcage-style flash hider.
 * The optic is its own part, shown only when one is fitted.
 */
function buildAeg(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail): ReplicaModel {
  const b = new ModelBuilder(detail);
  // Upper receiver with flat-top rail, forward assist and ejection port (right side), charging handle.
  b.profile('polymer', [[-0.11, 0.012], [0.15, 0.012], [0.15, 0.058], [-0.092, 0.058], [-0.11, 0.042]], 0.05);
  b.rail(-0.09, 0.15, 0.058, 0.022);
  b.box('polymer', -0.052, -0.014, 0.026, 0.046, 0.016, 0.029); // forward assist
  b.box('metal', -0.008, 0.062, 0.02, 0.048, 0.004, 0.026); // ejection port cover
  b.worn(() => b.box('polymer', -0.128, -0.106, 0.04, 0.053, 0.036)); // charging handle
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
  b.worn(() => b.profile('furniture', [[-0.012, -0.028], [-0.056, -0.028], [-0.092, -0.13], [-0.06, -0.142], [-0.03, -0.098]], 0.034, 0.012));
  if (b.high) {
    // The magazine release on the right of the magwell, the trigger's pivot pin, the selector on the left.
    b.worn(() => b.box('polymer', 0.03, 0.044, -0.018, -0.008, 0.012, 0.026));
    b.crossTube('metal', 0.006, -0.03, 0.0025, 0.05, 0, 8);
    b.crossTube('polymer', -0.03, 0.0, 0.006, 0.006, -0.026, 10);
  }
  // Handguard (tan) with slots and a top rail.
  b.profile('furniture', [[0.15, 0.0], [0.4, 0.0], [0.4, 0.066], [0.15, 0.066]], 0.058, 0.014);
  for (const x of [0.19, 0.245, 0.3, 0.35]) b.box('rubber', x, x + 0.035, 0.026, 0.042, 0.06);
  b.rail(0.155, 0.395, 0.066, 0.02);
  if (b.high) for (const side of [-1, 1]) b.sideRail(0.27, 0.39, 0.034, side, 0.029);
  // Barrel, low-profile gas block (the front sight is a flip-up on the rail), flash hider.
  b.tube('metal', 0.4, 0.165, 0.034, 0.009);
  b.box('polymer', 0.43, AEG_GAS_BLOCK_END, 0.022, 0.05, 0.03);
  // The muzzle end (M29b) is drawn from the part tables: a fitted barrel, and the flash hider or a silencer on the
  // muzzle mount, which moves out to the fitted barrel's end.
  // Buffer tube, collapsible stock, butt pad.
  b.tube('polymer', -0.27, 0.17, 0.032, 0.016);
  b.profile('furniture', [[-0.2, 0.056], [-0.33, 0.06], [-0.336, -0.056], [-0.31, -0.064], [-0.236, -0.012], [-0.2, 0.0]], 0.044, 0.012);
  b.profile('rubber', [[-0.332, 0.06], [-0.352, 0.06], [-0.358, -0.056], [-0.338, -0.058]], 0.046, 0.006);
  // Flip-up iron sights: a rear aperture at the back of the receiver rail and a front post at the front of the
  // handguard rail, standing up on the bare rifle and folded flat under a fitted optic. High: a steel ring with a 2 mm
  // aperture at the back, a post between protective ears at the front.
  const sightsUp = new ModelBuilder(detail);
  sightsUp.box('polymer', -0.085, -0.062, 0.074, 0.084, 0.026);
  if (sightsUp.high) {
    sightsUp.profile('polymer', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.094], [-0.078, 0.094]], 0.022, 0.003);
    sightsUp.ringTube('metal', -0.0755, 0.004, 0.101, 0.0075, 0.001, 16);
  } else sightsUp.profile('polymer', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.112], [-0.078, 0.112]], 0.022, 0.003, [[-0.0755, 0.098], [-0.0705, 0.098], [-0.0705, 0.104], [-0.0755, 0.104]]);
  sightsUp.box('polymer', 0.365, 0.39, 0.082, 0.092, 0.024);
  if (sightsUp.high) {
    sightsUp.box('metal', 0.376, 0.38, 0.092, 0.11, 0.003); // the post
    for (const side of [-1, 1]) sightsUp.box('polymer', 0.37, 0.386, 0.092, 0.112, 0.003, side * 0.007); // its ears
  } else sightsUp.profile('polymer', [[0.37, 0.092], [0.386, 0.092], [0.381, 0.112], [0.375, 0.112]], 0.018, 0.002);
  const sightsDown = new ModelBuilder(detail);
  sightsDown.box('polymer', -0.088, -0.054, 0.074, 0.082, 0.026);
  sightsDown.box('polymer', 0.362, 0.396, 0.082, 0.089, 0.024);

  // Right hand on the pistol grip: back of the hand to the right, knuckle row running down the
  // grip, three fingers wrapped round its front, index finger straight along the frame (trigger
  // discipline), thumb across the left of the receiver.
  const rightWrist = buildHand(
    b,
    { side: 'right', palm: [0.034, -0.092, -0.074], across: GRIP_DOWN, back: [1, 0, 0], fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP], thumb: { swing: 0.9, curl: [0.3, 0.3] } },
    detail.hands,
  );
  buildForearm(b, rightWrist, [0.2, -0.3, -0.42], undefined, detail.hands);

  // Left hand cradling the handguard: palm underneath, index finger forward, fingers curling up the
  // right side, thumb along the left side. Its own part: on reloads it cups the magazine's base plate.
  const support = new ModelBuilder(detail);
  const leftWrist = buildHand(
    support,
    { side: 'left', palm: [-0.012, -0.018, 0.29], across: [0, 0, -1], back: [0, -1, 0], fingers: [CRADLE, CRADLE, CRADLE, CRADLE], thumb: { swing: 0.2, curl: [0.2, 0.2] } },
    detail.hands,
  );
  buildForearm(support, leftWrist, [-0.3, -0.28, 0.02], undefined, detail.hands);

  const group = b.build(m);
  const magazine = magazinePart(AEG_MAGAZINES, m, detail, [0, -0.97, 0.25], { lowCap: [0, 0.06, -0.014] });
  group.add(magazine.group);
  // From the handguard to just under the magazine's base plate (forward 0.1, up -0.26).
  const supportHand = supportHandPart(support, m, [0.012, -0.242, -0.19]);
  group.add(supportHand.group);
  group.add(namedPart(sightsUp, m, 'sightsUp'), namedPart(sightsDown, m, 'sightsDown'));
  for (const [name, draw] of Object.entries(AEG_PARTS)) group.add(drawnPart(draw, m, detail, name));
  const mount = muzzleMount(AEG_MUZZLE, AEG_MUZZLE_DEVICES, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/** Polymer striker-fired gas pistol in two-tone: black slide over a tan frame with an accessory rail. */
function buildPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail): ReplicaModel {
  const b = new ModelBuilder(detail);
  // Slide: boxy, rear serrations, barrel hood showing in the ejection port, sights, muzzle.
  b.profile('polymer', [[-0.095, 0.0], [0.1, 0.0], [0.1, 0.026], [0.092, 0.03], [-0.09, 0.03], [-0.097, 0.018]], 0.028, 0.004);
  if (b.high) {
    // Eight shallow ridges cut across the slide's rear, their tops worn lighter; a loaded-chamber dot behind the port.
    b.worn(() => {
      for (let i = 0; i < 8; i++) b.box('polymer', -0.089 + i * 0.006, -0.086 + i * 0.006, 0.006, 0.026, 0.0296);
    });
    b.box('laserLens', 0.004, 0.007, 0.0295, 0.031, 0.003);
  } else for (let i = 0; i < 6; i++) b.box('rubber', -0.088 + i * 0.008, -0.085 + i * 0.008, 0.006, 0.026, 0.0295);
  b.box('metal', 0.008, 0.044, 0.026, 0.0305, 0.018);
  b.box('polymer', -0.093, -0.082, 0.03, 0.038, 0.022); // rear sight
  b.box('polymer', 0.086, 0.093, 0.03, 0.036, 0.006); // front sight
  b.tube(orangeTip ? 'orange' : 'rubber', 0.1, 0.004, 0.015, orangeTip ? 0.0095 : 0.006, 12);
  // Frame: dust cover with an accessory rail, squared trigger guard, angled grip, magazine base.
  b.profile('furniture', [[-0.085, 0.0], [0.092, 0.0], [0.092, -0.014], [0.038, -0.016], [-0.07, -0.016]], 0.026, 0.004);
  b.box('furniture', 0.042, 0.088, -0.024, -0.014, 0.022);
  for (const x of [0.05, 0.066]) b.box('rubber', x, x + 0.008, -0.024, -0.017, 0.023);
  b.worn(() => b.profile('furniture', [[-0.03, -0.012], [-0.084, -0.012], [-0.104, -0.115], [-0.062, -0.122], [-0.044, -0.07]], 0.03, 0.008));
  if (b.high) {
    // Stippled rubber panels on both sides of the grip.
    for (const side of [-1, 1]) b.profile('rubber', [[-0.04, -0.03], [-0.074, -0.03], [-0.092, -0.104], [-0.066, -0.108], [-0.05, -0.07]], 0.004, 0.006, undefined, side * 0.0145);
  }
  b.profile(
    'furniture',
    [[-0.03, -0.014], [0.034, -0.014], [0.034, -0.048], [-0.036, -0.046]],
    0.01,
    0.006,
    [[-0.022, -0.02], [0.026, -0.02], [0.026, -0.042], [-0.027, -0.04]],
  );
  b.box('polymer', -0.004, 0.003, -0.036, -0.016, 0.005); // trigger
  if (b.high) b.crossTube('metal', 0.0, -0.017, 0.0022, 0.012, 0, 8); // its pivot pin

  // Two-handed grip: right hand round the grip, index finger along the frame; the left hand presses
  // against the left of the grip with its fingers wrapped over the right hand's.
  const rightWrist = buildHand(
    b,
    { side: 'right', palm: [0.03, -0.068, -0.078], across: GRIP_DOWN, back: [1, 0, 0], fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP], thumb: { swing: 0.6, curl: [0.2, 0.2] } },
    detail.hands,
  );
  buildForearm(b, rightWrist, [0.1, -0.26, -0.3], undefined, detail.hands);
  const support = new ModelBuilder(detail);
  const leftWrist = buildHand(
    support,
    { side: 'left', palm: [-0.034, -0.072, -0.066], across: GRIP_DOWN, back: [-1, 0, 0], fingers: [SUPPORT, SUPPORT, SUPPORT, SUPPORT], thumb: { swing: 0.3, curl: [0.1, 0.1] } },
    detail.hands,
  );
  buildForearm(support, leftWrist, [-0.16, -0.26, -0.28], undefined, detail.hands);
  const group = b.build(m);
  for (const [name, draw] of Object.entries(PISTOL_PARTS)) group.add(drawnPart(draw, m, detail, name));
  group.getObjectByName('laser:redLaser')?.add(laserBeam(PISTOL_LASER_LENS));
  const magazine = magazinePart(PISTOL_MAGAZINES, m, detail, GRIP_DOWN, { extended: [0, -0.038, 0] });
  group.add(magazine.group);
  // From the side of the grip down to the magazine's base plate.
  const supportHand = supportHandPart(support, m, [0.004, -0.068, -0.024]);
  group.add(supportHand.group);
  // A silencer screwed onto the threaded barrel (M29b), from the muzzle-device table.
  const mount = muzzleMount(PISTOL_MUZZLE, PISTOL_MUZZLE_DEVICES, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/**
 * The laser's beam (QualitySettings.laserBeam, FA8): a line from the lens straight ahead, fading out, added (not
 * blended) so it reads as light. Named 'laserBeam'; hidden until the setting turns it on (Viewmodel.setLaserBeam).
 */
function laserBeam(lens: Pt): THREE.LineSegments {
  const L = F.laserBeam;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, lens[1], -lens[0], 0, lens[1], -(lens[0] + L.length)], 3));
  const c = new THREE.Color(LASERS.redLaser.colour);
  geo.setAttribute('color', new THREE.Float32BufferAttribute([c.r, c.g, c.b, 0, 0, 0], 3));
  const beam = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: L.opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.name = 'laserBeam';
  beam.visible = false;
  return beam;
}

/**
 * One held replica's model and the parts the viewmodel moves (typed here rather than found by name and read from
 * userData, audit L-05). Positions are as (across, up, back) in the model's space.
 */
export interface ReplicaModel {
  group: THREE.Group;
  /** Empty marker at the muzzle, where visual BBs start (on the muzzle mount: it follows the fitted barrel and device). */
  muzzle: THREE.Object3D;
  magazine: MagazinePart;
  supportHand: SupportHandPart;
  mount: MuzzleMount;
}

/** The muzzle mount (named 'muzzleMount'): the muzzle devices and the muzzle marker, moved out to the fitted barrel's end. */
export interface MuzzleMount {
  group: THREE.Group;
  marker: THREE.Object3D;
  layout: MuzzleLayout;
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
  /** The detail these were built at. */
  detail: ReplicaDetail;
  /**
   * There is (or isn't) an environment to reflect (the replica's sheen): high detail's painted steel is metallic only
   * then, and stays a dull painted grey without (it would look black). Low detail is as it was either way.
   */
  setReflections(on: boolean): void;
  dispose(): void;
}

/** Fingers held straight and together. */
const OPEN: FingerCurl = [0.06, 0.05, 0.03];

/** Left hand raised to call a hit: palm facing forward, fingers up, forearm dropping out of view. */
function buildRaisedHand(m: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail): THREE.Group {
  const b = new ModelBuilder(detail);
  const wrist = buildHand(
    b,
    { side: 'left', palm: [0, 0, 0], across: [-1, 0, 0], back: [0, 0, -1], fingers: [OPEN, OPEN, OPEN, OPEN], thumb: { swing: 0.1, curl: [0.1, 0.05] } },
    detail.hands,
  );
  buildForearm(b, wrist, [wrist[0] + 0.03, wrist[1] - 0.3, wrist[2] - 0.08], undefined, detail.hands);
  return b.build(m);
}

/**
 * Builds the held-replica model (with hands and team armband) for each replica in the loadout, keyed by replica id, at
 * `detail` (Replica and Hand detail, FA8; Low's by default).
 */
export function buildReplicaModels(loadout: readonly ReplicaConfig[], teamColor: number, orangeTips: boolean, detail: ReplicaDetail = LOW_DETAIL): ReplicaModels {
  const speckle = detail.replica === 'high' ? speckleTextures() : null;
  const materials = createMaterials(teamColor, detail, speckle);
  const models = new Map<string, ReplicaModel>();
  for (const r of loadout) {
    models.set(r.id, r.look.model === 'pistol' ? buildPistol(materials, orangeTips, detail) : buildAeg(materials, orangeTips, detail));
  }
  const raisedHand = buildRaisedHand(materials, detail);
  const metal = materials.metal as THREE.MeshStandardMaterial;
  return {
    models,
    raisedHand,
    detail,
    setReflections(on) {
      if (detail.replica !== 'high') return;
      const M = on ? F.metal.lit : F.metal.unlit;
      metal.metalness = M.metalness;
      metal.roughness = M.roughness;
    },
    dispose() {
      raisedHand.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const { group } of models.values()) {
        group.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
          if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
        });
      }
      for (const mat of Object.values(materials)) mat.dispose();
      speckle?.dispose();
    },
  };
}

/**
 * The magazine as its own group named 'magazine', so the viewmodel can slide it out along `axis`
 * (the magwell direction, as (across, up, forward)) during reloads. One child per magazine the replica takes, named
 * 'magazine:<id>'; the viewmodel shows the one fitted.
 */
function magazinePart(
  draws: Partial<Record<MagazineId, PartDraw>>,
  m: Record<MaterialKey, THREE.Material>,
  detail: ReplicaDetail,
  axis: readonly [number, number, number],
  baseShift: Partial<Record<MagazineId, readonly [number, number, number]>> = {},
): MagazinePart {
  const group = new THREE.Group();
  const bases = new Map<THREE.Object3D, THREE.Vector3>();
  for (const [id, draw] of Object.entries(draws)) {
    const part = drawnPart(draw, m, detail, `magazine:${id}`);
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

/** One entry of a part table drawn into its own builder and named. */
function drawnPart(draw: PartDraw, m: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail, name: string): THREE.Group {
  const b = new ModelBuilder(detail);
  draw(b);
  return namedPart(b, m, name);
}

/**
 * The muzzle mount at the standard barrel's end: the device parts (named 'muzzle:<id>', drawn from its table from 0
 * forward on the bore's axis) and the muzzle marker, at the bare muzzle's tip. The viewmodel moves the mount and the
 * marker to what is fitted (`fitMuzzle`).
 */
function muzzleMount(
  layout: MuzzleLayout,
  devices: Readonly<Record<string, MuzzleDraw>>,
  m: Record<MaterialKey, THREE.Material>,
  detail: ReplicaDetail,
  orangeTip: boolean,
): MuzzleMount {
  const group = new THREE.Group();
  group.name = 'muzzleMount';
  for (const [id, draw] of Object.entries(devices)) group.add(drawnPart((b) => draw(b, orangeTip), m, detail, `muzzle:${id}`));
  const marker = muzzleMarker(layout.tips.none ?? 0, layout.up);
  group.add(marker);
  group.position.z = -layout.barrelEnd;
  return { group, marker, layout };
}

/** Moves a mount (and its muzzle marker) to the end of the fitted barrel and device; null for as it comes. */
export function fitMuzzle(mount: MuzzleMount, barrel: string | null, device: string | null): void {
  const l = mount.layout;
  mount.group.position.z = -(l.barrelEnd + (barrel ? (l.extensions[barrel] ?? 0) : 0));
  mount.marker.position.z = -(l.tips[device ?? 'none'] ?? l.tips.none ?? 0);
}

/** Empty marker at the muzzle (forward, up) so presentation can start visual BBs there. */
function muzzleMarker(forward: number, up: number): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.name = 'muzzle';
  marker.position.set(0, up, -forward);
  return marker;
}
