import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DetailLevel } from '../config/render';
import { REPLICA_FINISH } from '../config/replicaFinish';
import type { ReplicaConfig } from '../config/replicas';
import { CYBER_COLOURS, type CyberColours, hasFixedColours, type ReplicaPaint, schemeColours } from '../config/schemes';
import { LASERS } from '../config/lasers';
import { TORCHES } from '../config/torches';
import { armMaterials, type ArmStyle, HUMAN_ARMS } from './replicaArms';
import { projectSpeckleUvs, type SpeckleTextures } from './replicaFinish';

/**
 * The replicas' materials and the builder their models are drawn with (split from replicaModels.ts, G2): the material
 * set per detail and colour scheme, rounded outlines, and ModelBuilder, which collects parts and merges them into one
 * mesh per material.
 */

export type Pt = readonly [forward: number, up: number];
/** A point of a front-view outline: across the model (right is +) and up. */
type FrontPt = readonly [across: number, up: number];

export type MaterialKey =
  | 'polymer'
  | 'furniture'
  | 'detail'
  | 'metal'
  | 'rubber'
  | 'stipple'
  | 'accent'
  | 'orange'
  | 'lens'
  | 'laserLens'
  | 'torchLens'
  | 'bb'
  | 'glove'
  | 'sleeve'
  | 'armband'
  | 'cyberSlab'
  | 'cyberLine'
  | 'cyberCore';

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
  detail: F.density.polymer,
  rubber: F.density.rubber,
  stipple: F.density.rubber,
  cyberSlab: F.density.polymer,
};

/** How a part's vertices are coloured on high detail: which faces are its bevels, and whether its edges are worn. */
type EdgeKind = 'none' | 'extrude' | 'box';

/**
 * A replica's colours by role (graphics overhaul G1, G2): the body (receiver, slide), the furniture (stock, grip,
 * handguard, foregrip), the details (rails, sights, magazines, small parts), a thin accent line (glowing when `glow`) and
 * the steel of its barrel and pins. A scheme (config/schemes.ts) is one.
 */
export interface ReplicaColours {
  body: number;
  furniture: number;
  detail: number;
  accent: number;
  steel: number;
  glow?: boolean;
}

/**
 * The replicas' materials (M14 polish; repainted per scheme in G2): moulded polymer in the scheme's two tones with a soft
 * satin sheen (it catches the viewmodel's environment on High and Medium), painted steel, rubber, tinted lens. Toys, not
 * guns. High detail (FA8): the speckle maps on polymer and rubber, vertex colours for the edge highlight, metallic steel
 * under a sheen, a glossy glass, a glowing laser lens.
 */
export function createMaterials(teamColor: number, detail: ReplicaDetail, speckle: SpeckleTextures | null, colours: ReplicaColours, cyber: CyberColours, arms: ArmStyle = HUMAN_ARMS): Record<MaterialKey, THREE.Material> {
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
    polymer: speckled(colours.body, high ? F.roughness.polymer : 0.5),
    furniture: speckled(colours.furniture, high ? F.roughness.furniture : 0.58),
    detail: speckled(colours.detail, high ? F.roughness.mag : 0.52),
    metal: high
      ? new THREE.MeshStandardMaterial({ color: colours.steel, ...F.metal.unlit, vertexColors })
      : new THREE.MeshStandardMaterial({ color: colours.steel, roughness: 0.45, metalness: 0.35, vertexColors }),
    rubber: speckled(0x17181a, high ? F.roughness.rubber : 0.95),
    // Stippled grip panels: the furniture's colour a shade darker, rough.
    stipple: speckled(stippleOf(colours.furniture), high ? F.roughness.rubber : 0.95),
    accent: accentMaterial(colours.accent, colours.glow === true, vertexColors),
    // The Cyber Pistol's own colours: a white slab, a dark frame (its polymer), light lines and a core that glow.
    cyberSlab: speckled(cyber.slab, high ? F.roughness.polymer : 0.5),
    cyberLine: accentMaterial(cyber.line, cyber.glow, vertexColors),
    cyberCore: accentMaterial(cyber.core, cyber.glow, vertexColors),
    orange: new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.5, metalness: 0, vertexColors }),
    lens: high
      ? new THREE.MeshStandardMaterial({ color: F.glass.color, roughness: F.glass.roughness, metalness: 0, transparent: true, opacity: F.glass.opacity, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.12, depthWrite: false }),
    // The red laser's lens (and the red dot's dot) glow their beam's colour (config/lasers.ts), unlit, so they read in
    // any light. High: emissive, so the tone mapping (and bloom, where on) rolls it into a glow.
    laserLens: high
      ? new THREE.MeshStandardMaterial({ color: F.laserBody, emissive: LASERS.redLaser.colour, emissiveIntensity: F.laserGlow, roughness: 0.3, metalness: 0 })
      : new THREE.MeshBasicMaterial({ color: LASERS.redLaser.colour }),
    // The weapon torch's lens (M33h): dark glass, lit by setTorchLit (a uniform: no shader is rebuilt by a switch).
    torchLens: high
      ? new THREE.MeshStandardMaterial({ color: F.torch.lensOff, emissive: TORCHES.weaponTorch.colour, emissiveIntensity: 0, roughness: 0.1, metalness: 0 })
      : new THREE.MeshBasicMaterial({ color: F.torch.lensOff }),
    bb: new THREE.MeshStandardMaterial({ color: F.witnessBb, roughness: 0.35, metalness: 0, vertexColors }),
    // The arms (G7): gloved in the team's camo, or a robot's shell (replicaArms.ts).
    ...armMaterials(teamColor, arms, vertexColors),
  };
  // Vertex colours only darken (a colour can't pass white), so flat faces sit at VERTEX_BASE and the material is that
  // much brighter: a flat face is its colour as before, a bevel or worn edge lighter.
  if (vertexColors) for (const mat of Object.values(materials)) if (mat instanceof THREE.MeshStandardMaterial && mat.vertexColors) brighten(mat);
  return materials;
}

/** A painted line, or (glow) one lit from within: emissive in its colour, so it reads in the dark and blooms where bloom is on. */
function accentMaterial(color: number, glow: boolean, vertexColors: boolean): THREE.MeshStandardMaterial {
  return glow
    ? new THREE.MeshStandardMaterial({ color: 0x101114, emissive: color, emissiveIntensity: F.accentGlow, roughness: 0.4, metalness: 0 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, vertexColors });
}

/** Lifts a vertex-coloured material by 1 / VERTEX_BASE, so a flat face shows the material's own colour. */
function brighten(mat: THREE.MeshStandardMaterial): void {
  mat.color.multiplyScalar(1 / VERTEX_BASE);
}

/** The materials a replica's colours repaint: the scheme's roles, and the Cyber Pistol's own. */
export const PAINTED: readonly MaterialKey[] = ['polymer', 'furniture', 'detail', 'metal', 'stipple', 'accent', 'cyberSlab', 'cyberLine', 'cyberCore'];

/** A stippled panel's colour: the furniture's, REPLICA_FINISH.stippleShade as bright. */
function stippleOf(furniture: number): number {
  return new THREE.Color(furniture).multiplyScalar(F.stippleShade).getHex();
}

/**
 * One replica's materials in `colours` (and, for the Cyber Pistol, `cyber`): new copies of the painted materials, the
 * rest shared with `base` (made in the unpainted colours).
 */
export function paintedMaterials(base: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail, colours: ReplicaColours, cyber: CyberColours): Record<MaterialKey, THREE.Material> {
  const vertexColors = coloured(detail);
  const out = { ...base };
  const tint: Partial<Record<MaterialKey, number>> = {
    polymer: colours.body,
    furniture: colours.furniture,
    detail: colours.detail,
    metal: colours.steel,
    stipple: stippleOf(colours.furniture),
    cyberSlab: cyber.slab,
  };
  for (const [key, hex] of Object.entries(tint) as [MaterialKey, number][]) {
    const mat = (base[key] as THREE.MeshStandardMaterial).clone();
    mat.color.setHex(hex);
    if (mat.vertexColors) brighten(mat);
    out[key] = mat;
  }
  out.accent = accentMaterial(colours.accent, colours.glow === true, vertexColors);
  out.cyberLine = accentMaterial(cyber.line, cyber.glow, vertexColors);
  out.cyberCore = accentMaterial(cyber.core, cyber.glow, vertexColors);
  for (const key of ['accent', 'cyberLine', 'cyberCore'] as const) {
    const mat = out[key] as THREE.MeshStandardMaterial;
    if (mat.vertexColors) brighten(mat);
  }
  return out;
}

/**
 * A replica's own colours: its scheme by loadout slot (plain under Realistic colours), or for the Cyber Pistol its fixed
 * ones (CYBER_COLOURS: the frame dark, the lines its accent); null for a replica drawn unpainted (no paint given).
 */
export function coloursOf(r: ReplicaConfig, slot: number, paint: ReplicaPaint | null): { colours: ReplicaColours; cyber: CyberColours } | null {
  if (hasFixedColours(r)) {
    const cyber = paint?.realistic ? CYBER_COLOURS.realistic : CYBER_COLOURS.bold;
    return { colours: { body: cyber.frame, furniture: cyber.frame, detail: cyber.frame, accent: cyber.line, steel: F.unpainted.steel, glow: cyber.glow }, cyber };
  }
  const id = paint?.schemes[slot];
  return id ? { colours: schemeColours(id, paint!.realistic), cyber: CYBER_COLOURS.bold } : null;
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

/** A rectangle `width` by `height` (across, up) centred `up` high, its corners rounded by `radius` in `steps` steps each. */
export function roundedRect(width: number, height: number, radius: number, up: number, steps: number): FrontPt[] {
  const out: FrontPt[] = [];
  const [w, h] = [width / 2 - radius, height / 2 - radius];
  const corners: readonly (readonly [number, number])[] = [[w, h], [-w, h], [-w, -h], [w, -h]];
  corners.forEach(([cx, cy], i) => {
    for (let k = 0; k <= steps; k++) {
      const a = ((i + k / steps) * Math.PI) / 2;
      out.push([cx + Math.cos(a) * radius, up + cy + Math.sin(a) * radius]);
    }
  });
  return out;
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
export class ModelBuilder {
  private readonly parts = new Map<MaterialKey, THREE.BufferGeometry[]>();
  /** The next part's edges are worn (lighter than the edge highlight): set by `worn`. */
  private wear = false;

  constructor(readonly detail: ReplicaDetail = LOW_DETAIL) {}

  /** The replica's overhaul shapes and finishes are drawn (Replica detail `high`). */
  get high(): boolean {
    return this.detail.replica === 'high';
  }

  /**
   * Side-profile silhouette extruded to `width`, centred on the model's axis (or `x` across it), with a soft bevel;
   * `holes` cut right through it (a trigger guard's loop, a handguard's slots).
   */
  profile(key: MaterialKey, outline: readonly Pt[], width: number, round = 0.006, holes: readonly (readonly Pt[])[] = [], x = 0): this {
    const bevel = Math.min(0.004, width / 4);
    const shape = roundedPath(outline, round, new THREE.Shape()) as THREE.Shape;
    for (const hole of holes) shape.holes.push(roundedPath(hole, round / 2, new THREE.Path()));
    const depth = Math.max(0.001, width - bevel * 2);
    // Low rounds each corner and bevel in fewer steps (G2): the overhaul's busier outlines stay within Low's old budget.
    const steps = this.high ? F.profileSteps.high : F.profileSteps.low;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: steps.bevel,
      curveSegments: steps.corner,
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

  /** Cylinder lying along the forward axis (`x` across it: a part on the replica's side). */
  tube(key: MaterialKey, from: number, length: number, up: number, radius: number, segments = 14, x = 0): this {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments);
    geo.rotateX(Math.PI / 2);
    geo.translate(x, up, -(from + length / 2));
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
    this.box('detail', from, to, y, y + 0.01, width);
    if (!this.high) {
      for (let x = from + 0.004; x + 0.008 <= to; x += 0.016) this.box('detail', x, x + 0.008, y + 0.01, y + 0.016, width + 0.004);
      return this;
    }
    const R = F.rail;
    for (let x = from + R.tooth / 2; x + R.tooth <= to; x += R.pitch) this.box('detail', x, x + R.tooth, y + 0.01, y + 0.016, width + 0.004);
    return this;
  }

  /** A short rail along one side of the handguard (high detail), `side` -1 left or 1 right, its teeth facing out. */
  sideRail(from: number, to: number, up: number, side: number, halfWidth: number): this {
    const R = F.rail;
    this.box('detail', from, to, up - 0.008, up + 0.008, 0.006, side * (halfWidth + 0.003));
    for (let x = from + R.tooth / 2; x + R.tooth <= to; x += R.pitch) this.box('detail', x, x + R.tooth, up - 0.009, up + 0.009, 0.004, side * (halfWidth + 0.008));
    return this;
  }

  /**
   * A front-view outline (across, up) extruded along the bore from `from` to `to`, with `holes` through it: a sight's
   * hood you look through.
   */
  hood(key: MaterialKey, outline: readonly FrontPt[], holes: readonly (readonly FrontPt[])[], from: number, to: number): this {
    const shape = new THREE.Shape(outline.map(([x, u]) => new THREE.Vector2(x, u)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, u]) => new THREE.Vector2(x, u))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: to - from, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -to);
    return this.add(key, geo, 'none');
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
