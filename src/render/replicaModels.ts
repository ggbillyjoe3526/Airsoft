import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildForearm, buildHand, type FingerCurl, type GeometrySink, type HandPose, type V3 } from './handModels';
import { buildRobotForearm, buildRobotHand } from './robotHands';
import { FIGURE } from '../config/characters';
import { figurePalette, robotShell } from './figurePalette';
import type { MagazineId } from '../config/attachments';
import type { DetailLevel } from '../config/render';
import { REPLICA_FINISH } from '../config/replicaFinish';
import type { ReplicaConfig } from '../config/replicas';
import { CYBER_COLOURS, type CyberColours, hasFixedColours, type ReplicaPaint, schemeColours } from '../config/schemes';
import { LASERS } from '../config/lasers';
import { TORCHES } from '../config/torches';
import { projectSpeckleUvs, type SpeckleTextures, speckleTextures } from './replicaFinish';

/**
 * First-person replica models built in code. They resemble real-world replica types (an AR-pattern
 * AEG, a polymer striker pistol) but are generic (no brands, logos or copies of a specific design)
 * and rendered stylised (graphics overhaul G2: Marathon's blocky, chamfered slabs with Valorant's clean finish): chunky
 * side-profile silhouettes extruded with soft bevels, plus cylinders and small detail parts, two-tone in the player's
 * colour scheme (config/schemes.ts) with a thin accent line. The orange muzzle tip many real replicas carry is optional
 * (VIEWMODEL.orangeTips).
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
/** A point of a front-view outline: across the model (right is +) and up. */
type FrontPt = readonly [across: number, up: number];

type MaterialKey =
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
function createMaterials(teamColor: number, detail: ReplicaDetail, speckle: SpeckleTextures | null, colours: ReplicaColours, cyber: CyberColours, arms: ArmStyle): Record<MaterialKey, THREE.Material> {
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
    ...armMaterials(teamColor, arms, vertexColors),
  };
  // Vertex colours only darken (a colour can't pass white), so flat faces sit at VERTEX_BASE and the material is that
  // much brighter: a flat face is its colour as before, a bevel or worn edge lighter.
  if (vertexColors) for (const mat of Object.values(materials)) if (mat instanceof THREE.MeshStandardMaterial && mat.vertexColors) brighten(mat);
  return materials;
}

/**
 * Whose arms hold the replicas (G7): the player's own, gloved, in their team's camo; or, when their slot is a robot (the
 * Robots setting), a robot's, in the shell its figure wears (FIGURE.robot.shells by team).
 */
export interface ArmStyle {
  robot: boolean;
  shell: number;
}

/** A player's gloved arms. */
export const HUMAN_ARMS: ArmStyle = { robot: false, shell: robotShell(0) };

/**
 * The arms' three materials, as the figures wear them (G7): dark gloves and the team's camo sleeves (figurePalette), or
 * a robot's dark joints and satin shell; the team colour on the armband (a robot's panel) either way. Gloves and sleeves
 * were olive and grey before; the same three materials, so neither costs a draw call more.
 */
function armMaterials(teamColor: number, arms: ArmStyle, vertexColors: boolean): Pick<Record<MaterialKey, THREE.Material>, 'glove' | 'sleeve' | 'armband'> {
  const fabric = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness, vertexColors });
  const [shellRough, shellMetal] = FIGURE.finish.robot;
  return arms.robot
    ? {
        glove: fabric(FIGURE.robot.joint, FIGURE.finish.rubber[0]),
        sleeve: fabric(arms.shell, shellRough, shellMetal),
        armband: fabric(teamColor, shellRough, shellMetal),
      }
    : {
        glove: fabric(FIGURE.colors.glove, 0.9),
        sleeve: fabric(figurePalette(teamColor).camo, 1),
        // Team tape on the sleeve, as players wear at real sites.
        armband: fabric(teamColor, 0.7),
      };
}

/** The hand and forearm builders for a style of arms. */
interface ArmBuilders {
  hand: (sink: GeometrySink, pose: HandPose, detail: DetailLevel) => V3;
  forearm: (sink: GeometrySink, wrist: V3, elbow: V3, elbowRadius: number | undefined, detail: DetailLevel) => void;
}

const GLOVED: ArmBuilders = { hand: buildHand, forearm: buildForearm };
const ROBOT: ArmBuilders = { hand: buildRobotHand, forearm: buildRobotForearm };

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
const PAINTED: readonly MaterialKey[] = ['polymer', 'furniture', 'detail', 'metal', 'stipple', 'accent', 'cyberSlab', 'cyberLine', 'cyberCore'];

/** A stippled panel's colour: the furniture's, REPLICA_FINISH.stippleShade as bright. */
function stippleOf(furniture: number): number {
  return new THREE.Color(furniture).multiplyScalar(F.stippleShade).getHex();
}

/**
 * One replica's materials in `colours` (and, for the Cyber Pistol, `cyber`): new copies of the painted materials, the
 * rest shared with `base` (made in the unpainted colours).
 */
function paintedMaterials(base: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail, colours: ReplicaColours, cyber: CyberColours): Record<MaterialKey, THREE.Material> {
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
function coloursOf(r: ReplicaConfig, slot: number, paint: ReplicaPaint | null): { colours: ReplicaColours; cyber: CyberColours } | null {
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
function roundedRect(width: number, height: number, radius: number, up: number, steps: number): FrontPt[] {
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
class ModelBuilder {
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

// Hand poses (joint bends in radians: knuckle, middle, tip).
/** Pistol-grip axis, top to bottom: grips rake back about 22 degrees. */
const GRIP_DOWN = [0, -0.93, -0.37] as const;
/** Index finger laid straight along the frame, off the trigger. */
const STRAIGHT_INDEX: FingerCurl = [0.12, 0.08, 0.04];
/** Fingers wrapped round a pistol grip. */
const WRAP: FingerCurl = [1.15, 1.25, 0.7];
/**
 * The rifle's support hand (FA13): palm up under the handguard, the four fingers up its far (right) side, and the thumb
 * set against them up the near (left) side, where you see it holding the rifle. Before, the thumb followed the fingers
 * under the handguard, so all you saw was a glove below it. Each finger's bends are the closest it lies along the side
 * without going into it (`handPoses.test.ts` measures it).
 */
export const AEG_SUPPORT_POSE: HandPose = {
  side: 'left',
  palm: [-0.016, -0.016, 0.29],
  across: [0, 0, -1],
  back: [0, -1, 0],
  fingers: [
    [1.0, 0.6, 0.2],
    [1.1, 0.6, 0.5],
    [1.0, 0.6, 0.2],
    [0.8, 0.6, 0.4],
  ],
  thumb: { swing: 0.2, curl: [0, -0.2], aim: [-1.1, 1, 0.3] },
};

/** The AEG's handguard (the rifle's own numbers, below): across ±halfWidth, from bottom to top, forward from → to. */
export const AEG_HANDGUARD = { from: 0.15, to: 0.4, bottom: 0, top: 0.066, halfWidth: 0.029 } as const;
/** Support-hand fingers wrapped over the shooting hand. */
const SUPPORT: FingerCurl = [1.0, 1.05, 0.6];

/**
 * The red dot fitted to the rifle's receiver rail (an accessory, never part of the rifle: owner, 2026-10-03):
 * where its axis sits above the model's origin, where its hood starts and ends along the forward axis, and the hood's
 * half width outside and its window's inside (G2: an enclosed sight, square where it was a round tube).
 * The rifle's aiming hold (config/replicas.ts aimHold) puts this axis on the view's centre line.
 */
export const RIFLE_OPTIC = { axisUp: 0.126, from: -0.005, length: 0.056, outer: 0.022, inner: 0.018 } as const;

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
/** The Cyber Pistol's (M32): a longer slide, and nothing fits its muzzle. */
export const CYBER_MUZZLE = { barrelEnd: 0.114, up: 0.015, extensions: {}, tips: { none: 0 } } satisfies MuzzleLayout;

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

/**
 * The red dot (G2: an enclosed reflex sight, as the concept): a squared hood you look through along the bore, a tinted
 * lens across its window two-thirds of the way forward, a sunshade lip over the front, on a low mount and riser clamped
 * to the rail. High: the dot on the lens, brightness buttons and a battery cap on the right, a windage turret on top
 * and the clamp's cross-bolt.
 */
function redDot(b: ModelBuilder): void {
  const o = RIFLE_OPTIC;
  const front = o.from + o.length;
  const steps = b.high ? 4 : 1;
  b.box('detail', o.from - 0.002, front + 0.002, 0.074, 0.082, 0.032);
  // The riser keeps the receiver and the folded sights well below the dot in the aimed view (a lower-third co-witness).
  b.box('detail', o.from + 0.008, front - 0.008, 0.082, o.axisUp - o.inner, 0.026);
  b.hood('detail', roundedRect(o.outer * 2, o.outer * 2 + 0.004, 0.008, o.axisUp + 0.001, steps), [roundedRect(o.inner * 2, o.inner * 2, 0.005, o.axisUp, steps)], o.from, front);
  b.box('detail', front - 0.004, front + 0.006, o.axisUp + o.outer + 0.003, o.axisUp + o.outer + 0.007, o.outer * 2 - 0.006);
  const lens = o.from + o.length * 0.66;
  b.box('lens', lens - 0.0005, lens + 0.0005, o.axisUp - o.inner, o.axisUp + o.inner, o.inner * 2);
  if (!b.high) return;
  b.ball('laserLens', lens - 0.0012, o.axisUp, F.dot.radius);
  for (const at of [o.from + 0.012, o.from + 0.024]) b.box('detail', at, at + 0.008, o.axisUp - 0.016, o.axisUp - 0.01, 0.006, o.outer + 0.002);
  b.crossTube('metal', o.from + 0.036, o.axisUp - 0.004, 0.0075, 0.006, o.outer + 0.002, 16);
  b.uprightTube('metal', o.from + 0.022, o.axisUp + o.outer + 0.0045, 0.006, 0.005, 0, 16);
  b.crossTube('metal', (o.from + front) / 2, 0.078, 0.0035, 0.036, 0, 8);
}

/** The 2× scope (M17b): a longer tube on two rings, a wider objective bell in front, on the red dot's axis. */
function scope2x(b: ModelBuilder): void {
  const o = RIFLE_OPTIC;
  const sc = RIFLE_SCOPE;
  for (const x of [0.0, 0.07]) {
    b.box('detail', x, x + 0.024, 0.074, 0.084, 0.034);
    b.box('detail', x + 0.004, x + 0.02, 0.084, o.axisUp - sc.outer + 0.004, 0.022);
  }
  b.ringTube('detail', sc.from, sc.length, o.axisUp, sc.outer, sc.inner);
  b.ringTube('detail', sc.from + sc.length, sc.bellLength, o.axisUp, sc.bellOuter, sc.bellOuter - 0.003);
  b.ringTube('detail', sc.from - sc.eyeLength, sc.eyeLength, o.axisUp, sc.outer + 0.004, sc.inner);
  if (!b.high) b.box('detail', 0.03, 0.05, o.axisUp + sc.outer - 0.002, o.axisUp + sc.outer + 0.012, 0.016); // turret
  b.tube('lens', sc.from + sc.length + sc.bellLength - 0.004, 0.002, o.axisUp, sc.bellOuter - 0.003, 24);
  if (!b.high) return;
  // Turrets on top and on the right with their caps; a rubber eye cup; a dark inner tube in the bell, so the objective
  // reads as glass over black; scope rings round the tube with two screws a side.
  const turret = sc.from + sc.length / 2;
  b.box('detail', turret - 0.012, turret + 0.012, o.axisUp + sc.outer - 0.003, o.axisUp + sc.outer + 0.004, 0.02);
  b.uprightTube('detail', turret, o.axisUp + sc.outer + 0.009, 0.0085, 0.01, 0, 12);
  b.uprightTube('rubber', turret, o.axisUp + sc.outer + 0.0145, 0.0088, 0.002, 0, 12);
  b.crossTube('detail', turret, o.axisUp, 0.0085, 0.01, sc.outer + 0.004, 12);
  b.ringTube('rubber', sc.from - sc.eyeLength - 0.008, 0.01, o.axisUp, sc.outer + 0.006, sc.inner + 0.001);
  b.ringTube('rubber', sc.from + sc.length + 0.004, sc.bellLength - 0.01, o.axisUp, sc.bellOuter - 0.003, sc.bellOuter - 0.005);
  for (const x of [0.0, 0.07]) {
    b.ringTube('detail', x + 0.004, 0.016, o.axisUp, sc.outer + 0.003, sc.outer);
    for (const side of [-1, 1]) for (const dy of [-0.006, 0.006]) b.crossTube('detail', x + 0.012, o.axisUp + dy, 0.0018, 0.003, side * (sc.outer + 0.004), 6);
  }
}

/** The vertical grip on the handguard rail, behind the support hand: a squared, tapering block. High: three rubber bands. */
function verticalGrip(b: ModelBuilder): void {
  b.box('detail', 0.196, 0.244, -0.008, 0.002, 0.03);
  b.profile('furniture', [[0.202, -0.008], [0.238, -0.008], [0.234, -0.088], [0.228, -0.096], [0.21, -0.096], [0.204, -0.088]], 0.032, b.high ? 0.003 : 0.006);
  if (!b.high) return;
  for (let i = 0; i < 3; i++) b.box('stipple', 0.2045, 0.2345, -0.03 - i * 0.02, -0.024 - i * 0.02, 0.0335);
}

/** The angled grip: a flat wedge whose bevelled ridge catches the light (high). */
function angledGrip(b: ModelBuilder): void {
  b.profile('furniture', [[0.165, -0.002], [0.262, -0.002], [0.262, -0.014], [0.188, -0.046], [0.172, -0.04]], 0.03, 0.004);
  if (!b.high) return;
  // Thumb ribs along its back edge.
  for (let i = 0; i < 4; i++) b.box('detail', 0.2 + i * 0.012, 0.206 + i * 0.012, -0.03 + i * 0.0045, -0.026 + i * 0.0045, 0.032);
}

/** The rifle's angular, gently forward-curved magazine (G2), and its base plate's outline. */
const AEG_MAG: readonly Pt[] = [[0.03, -0.076], [0.094, -0.076], [0.112, -0.2], [0.106, -0.236], [0.042, -0.234], [0.034, -0.2]];
const AEG_MAG_BASE: readonly Pt[] = [[0.038, -0.23], [0.11, -0.232], [0.112, -0.246], [0.04, -0.244]];

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
const AEG_MAG_BACK: readonly Pt[] = [[0.03, -0.076], [0.034, -0.2], [0.042, -0.234]];
const AEG_MAG_FRONT: readonly Pt[] = [[0.094, -0.076], [0.112, -0.2], [0.106, -0.236]];

/** The standard (mid-cap) magazine: a detail-coloured body on a base plate in the body colour. High: four ribs and a witness window showing BBs. */
function aegStandardMag(b: ModelBuilder): void {
  b.profile('detail', AEG_MAG, 0.034, 0.004);
  b.profile('polymer', AEG_MAG_BASE, 0.038, 0.003);
  if (!b.high) return;
  for (const up of [-0.11, -0.135, -0.16, -0.185]) magRib(b, 'detail', AEG_MAG_BACK, AEG_MAG_FRONT, up, 0.005, 0.0365);
  // The witness window on the side you see: a dark slot down the body with four BBs behind it.
  b.profile('rubber', [[0.05, -0.09], [0.058, -0.09], [0.064, -0.106], [0.056, -0.106]], 0.0355, 0.0015);
  for (let i = 0; i < 2; i++) b.ball('bb', 0.055 + i * 0.003, -0.094 - i * 0.008, 0.0026, -0.0165);
}

/** The hi-cap: the same shape, wider and bulged, with a winding wheel under its base. High: a ribbed base, a notched wheel. */
function aegHiCap(b: ModelBuilder): void {
  b.profile('detail', [[0.03, -0.076], [0.094, -0.076], [0.112, -0.2], [0.118, -0.215], [0.106, -0.236], [0.042, -0.234], [0.03, -0.215], [0.034, -0.2]], 0.042, 0.004);
  b.profile('polymer', AEG_MAG_BASE, 0.046, 0.003);
  const wheel = { from: 0.06, length: 0.03, up: -0.256, radius: 0.013 };
  b.tube('metal', wheel.from, wheel.length, wheel.up, wheel.radius, 12); // the winding wheel
  if (!b.high) return;
  b.profile('polymer', [[0.046, -0.244], [0.104, -0.245], [0.105, -0.249], [0.047, -0.248]], 0.048, 0.0015);
  // Six notches round the wheel's rim, for a thumb to wind it.
  for (let i = 0; i < 6; i++) {
    const notch = new THREE.BoxGeometry(0.004, 0.004, wheel.length + 0.002).translate(0, wheel.radius - 0.0005, 0).rotateZ((i / 6) * Math.PI * 2);
    b.addGeometry('metal', notch.translate(0, wheel.up, -(wheel.from + wheel.length / 2)));
  }
}

/** The low-cap: short and straight. High: a steel body with three ribs on its base plate. */
function aegLowCap(b: ModelBuilder): void {
  const body: readonly Pt[] = [[0.03, -0.076], [0.094, -0.076], [0.104, -0.13], [0.108, -0.168], [0.042, -0.172], [0.034, -0.13]];
  b.profile(b.high ? 'metal' : 'detail', body, 0.034, 0.004);
  b.profile('polymer', [[0.04, -0.168], [0.11, -0.166], [0.112, -0.18], [0.042, -0.182]], 0.038, 0.003);
  if (!b.high) return;
  const back: readonly Pt[] = [[0.03, -0.076], [0.034, -0.13], [0.042, -0.172]];
  const front: readonly Pt[] = [[0.094, -0.076], [0.104, -0.13], [0.108, -0.168]];
  for (const up of [-0.098, -0.12, -0.142]) magRib(b, 'metal', back, front, up, 0.004, 0.0365);
}

/** The pistol's magazine outline (hidden in the grip until a reload drops it out). */
const PISTOL_MAG: readonly Pt[] = [[-0.058, -0.02], [-0.076, -0.02], [-0.1, -0.118], [-0.078, -0.12]];
/** The pistol magazine's base pad, squared to the grip (G2). */
const PISTOL_MAG_BASE: readonly Pt[] = [[-0.05, -0.13], [-0.112, -0.13], [-0.114, -0.143], [-0.052, -0.143]];

/** The pistol's standard magazine and base pad. High: a rim round the pad, worn lighter. */
function pistolStandardMag(b: ModelBuilder): void {
  b.profile('detail', PISTOL_MAG, 0.022, 0.003);
  b.profile('detail', PISTOL_MAG_BASE, 0.034, 0.003);
  if (b.high) b.worn(() => b.box('detail', -0.11, -0.054, -0.146, -0.141, 0.036));
}

/** The extended magazine (M17b): a sleeve standing out of the grip with a longer pad. Its accent line round the pad's top. */
function pistolExtendedMag(b: ModelBuilder): void {
  b.profile('detail', PISTOL_MAG, 0.022, 0.003);
  b.profile('furniture', [[-0.108, -0.13], [-0.052, -0.13], [-0.05, -0.162], [-0.11, -0.162]], 0.031, 0.003);
  b.profile('detail', PISTOL_MAG_BASE.map(([f, u]) => [f, u - 0.032] as const), 0.034, 0.003);
  b.box('accent', -0.108, -0.054, -0.166, -0.163, 0.0346);
  if (b.high) b.worn(() => b.box('detail', -0.11, -0.054, -0.178, -0.173, 0.036));
}

/** The Cyber Pistol's magazine (G2): hidden in the grip, its white base pad with a line of the core's colour round it (high). */
function cyberMag(b: ModelBuilder): void {
  b.profile('polymer', PISTOL_MAG, 0.022, 0.003);
  b.box('cyberSlab', -0.112, -0.05, -0.142, -0.13, 0.035);
  if (!b.high) return;
  b.box('cyberCore', -0.108, -0.054, -0.137, -0.135, 0.0356);
  b.worn(() => b.box('cyberSlab', -0.114, -0.048, -0.145, -0.141, 0.036));
}

/** The red laser (M26b): a chamfered module clipped to the dust cover's rail, its lens at the front. High: a clamp, a thumb screw, a switch cap. */
function redLaser(b: ModelBuilder): void {
  b.profile('detail', [[0.046, -0.026], [0.09, -0.026], [0.09, -0.042], [0.054, -0.042], [0.046, -0.036]], 0.022, 0.003);
  b.box('laserLens', 0.09, 0.093, -0.038, -0.03, 0.009);
  if (!b.high) return;
  b.box('metal', 0.05, 0.072, -0.028, -0.02, 0.026);
  b.crossTube('metal', 0.061, -0.024, 0.0035, 0.006, 0.016, 8);
  b.tube('rubber', 0.034, 0.012, -0.034, 0.006, 10);
}

/**
 * Where a weapon torch sits on a replica (M33h), in the model's (forward, up) and across (`x`): its body tube from
 * `from`, `length` long and `radius` round, a wider head in front of it with the lens, and the mount to the rail (a box
 * `mount` from forward → to, up y0 → y1, `width` wide at `mountX`).
 */
interface TorchLayout {
  from: number;
  length: number;
  up: number;
  x: number;
  radius: number;
  head: number;
  headRadius: number;
  mount: { from: number; to: number; y0: number; y1: number; width: number; x: number };
}

/** The AEG's: on the right of the handguard, ahead of the support hand, on the side rail. */
const AEG_TORCH: TorchLayout = { from: 0.325, length: 0.07, up: 0.034, x: 0.049, radius: 0.012, head: 0.024, headRadius: 0.016, mount: { from: 0.34, to: 0.375, y0: 0.026, y1: 0.042, width: 0.016, x: 0.036 } };
/** The Gas Pistol's: under the dust cover, below where the Red Laser clips on, so the two read as one unit. */
const PISTOL_TORCH: TorchLayout = { from: 0.042, length: 0.044, up: -0.058, x: 0, radius: 0.0105, head: 0.014, headRadius: 0.0135, mount: { from: 0.05, to: 0.08, y0: -0.05, y1: -0.026, width: 0.014, x: 0 } };
/** The Cyber Pistol's: a clamp under its slab dust cover. */
const CYBER_TORCH: TorchLayout = { from: 0.046, length: 0.046, up: -0.042, x: 0, radius: 0.0105, head: 0.014, headRadius: 0.0135, mount: { from: 0.056, to: 0.084, y0: -0.034, y1: -0.027, width: 0.014, x: 0 } };

/**
 * A weapon torch (M33h) at `t`: Low a six-sided body and head and a lens disc; High round, with a knurled bezel
 * (REPLICA_FINISH.torch.knurls rubber rings), a rubber tailcap switch and a steel clamp screw. Its lens is `torchLens`.
 */
function weaponTorch(t: TorchLayout): PartDraw {
  return (b) => {
    const seg = b.high ? 16 : 6;
    const m = t.mount;
    b.box('detail', m.from, m.to, m.y0, m.y1, m.width, m.x);
    b.tube('detail', t.from, t.length, t.up, t.radius, seg, t.x);
    const head = t.from + t.length;
    b.tube('detail', head, t.head, t.up, t.headRadius, seg, t.x);
    b.tube('torchLens', head + t.head, 0.0015, t.up, t.headRadius * 0.82, seg, t.x);
    if (!b.high) return;
    const step = t.head / (F.torch.knurls + 1);
    for (let i = 1; i <= F.torch.knurls; i++) b.tube('rubber', head + i * step - 0.001, 0.002, t.up, t.headRadius + 0.0008, seg, t.x);
    b.tube('rubber', t.from - 0.007, 0.007, t.up, t.radius * 0.8, seg, t.x);
    b.crossTube('metal', (m.from + m.to) / 2, (m.y0 + m.y1) / 2, 0.003, m.width + 0.004, m.x, 8);
  };
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
 * barrel between the gas block and the flash hider, an index band in the furniture colour at the gas block and a crown ring.
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
  b.tube(orangeTip ? 'orange' : 'detail', 0.016, 0.03, up, 0.012, 6);
  if (b.high) for (const side of [-1, 1]) b.box('rubber', 0.021, 0.041, up - 0.003, up + 0.003, 0.002, side * 0.0115);
}

/**
 * A silencer (M29b; G2 the concept's): a six-sided body `length` long and `radius` across its corners in the detail
 * colour with an accent ring near the back, its front `cap` steel (orange with `orangeTip`). High adds a steel thread
 * adapter, a stepped back cap, steel grooves and the dark bore at the front.
 */
function silencer(layout: MuzzleLayout, radius: number, cap: number): MuzzleDraw {
  const length = layout.tips.silencer ?? 0;
  const up = layout.up;
  const S = F.silencer;
  return (b, orangeTip) => {
    const from = b.high ? S.adapter + cap : 0;
    const body = length - cap - from;
    const capRadius = radius - S.capStep;
    b.tube('detail', from, body, up, radius, 6);
    b.tube('accent', from + body * S.ringAt, S.ring, up, radius * S.ringProud, 6);
    b.tube(orangeTip ? 'orange' : 'metal', length - cap, cap, up, capRadius, b.high ? S.segments : 12);
    if (!b.high) return;
    b.tube('metal', 0, S.adapter, up, radius * S.adapterShare, S.segments);
    b.tube('metal', S.adapter, cap, up, capRadius, S.segments);
    for (let i = 0; i < S.grooves; i++) b.tube('metal', from + body * S.ringAt + S.ring + S.groovePitch * (i + 0.5), S.groovePitch / 2, up, radius * (S.ringProud - 0.02), 6);
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
  'light:weaponTorch': weaponTorch(AEG_TORCH),
};
const AEG_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: aegStandardMag, hiCap: aegHiCap, lowCap: aegLowCap };
/** The muzzle devices by id ('none': the bare muzzle's own), drawn on the mount. */
const AEG_MUZZLE_DEVICES: Readonly<Record<string, MuzzleDraw>> = { none: flashHider, silencer: silencer(AEG_MUZZLE, 0.021, 0.006) };
const PISTOL_PARTS: Readonly<Record<string, PartDraw>> = { 'laser:redLaser': redLaser, 'light:weaponTorch': weaponTorch(PISTOL_TORCH) };
const PISTOL_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: pistolStandardMag, extended: pistolExtendedMag };
/** A silencer a little narrower than the slide; the bare muzzle has no device of its own. */
const PISTOL_MUZZLE_DEVICES: Readonly<Record<string, MuzzleDraw>> = { silencer: silencer(PISTOL_MUZZLE, 0.0155, 0.005) };

/** Nothing but a weapon torch (M33h) fits the Cyber Pistol (M32): its table is that and its own magazine. */
const CYBER_PARTS: Readonly<Record<string, PartDraw>> = { 'light:weaponTorch': weaponTorch(CYBER_TORCH) };
const CYBER_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: cyberMag };

/** Every part a replica's table draws, built and named (exported for the tests: one builder per entry). */
export const REPLICA_PART_TABLES = {
  aeg: { parts: AEG_PARTS, magazines: AEG_MAGAZINES, muzzles: AEG_MUZZLE_DEVICES },
  pistol: { parts: PISTOL_PARTS, magazines: PISTOL_MAGAZINES, muzzles: PISTOL_MUZZLE_DEVICES },
  cyber: { parts: CYBER_PARTS, magazines: CYBER_MAGAZINES, muzzles: {} },
} as const;

/**
 * Whether a replica is built with the hands holding it (in first person) or on its own (a picture of it in the
 * menus, G2 itemPictures.ts).
 */
export type HandsShown = 'hands' | 'bare';

/**
 * AR-pattern AEG (G2: the concept's blockier, Marathon-style build, in its scheme): an angular upper with a raised side
 * plate and a flat-top rail, a flared, squared magwell with the accent line along the lower, a solid pistol grip, a
 * squared handguard with chamfered corners (M-LOK slots on high) and its own accent line, a hard-angled stock with a
 * cheek riser and a block butt. Flip-up iron sights (folded down when an optic is fitted), a birdcage flash hider. The
 * optic is its own part, shown only when one is fitted. Every hand point and envelope is as before (AEG_HANDGUARD).
 */
function buildAeg(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null): ReplicaModel {
  const b = new ModelBuilder(detail);
  // Upper receiver: the chamfered slab, its rail, the side plate over the ejection port, forward assist and charging handle.
  b.profile('polymer', [[-0.116, 0.012], [0.15, 0.012], [0.15, 0.058], [-0.094, 0.058], [-0.116, 0.04]], 0.056, 0.004);
  b.rail(-0.09, 0.15, 0.058, 0.022);
  b.box('polymer', 0.06, 0.148, 0.02, 0.05, 0.0624);
  b.box('metal', -0.008, 0.052, 0.022, 0.048, 0.004, 0.029); // ejection port cover
  b.worn(() => b.box('polymer', -0.06, -0.042, 0.024, 0.046, 0.064)); // forward assist block
  b.worn(() => b.box('detail', -0.134, -0.11, 0.042, 0.054, 0.03)); // charging handle
  // Lower receiver with the flared magwell and its lip, the accent line, the squared trigger guard and the trigger.
  b.profile('polymer', [[-0.106, -0.034], [0.148, -0.034], [0.148, 0.014], [-0.106, 0.014]], 0.054, 0.004);
  b.profile('polymer', [[0.016, -0.03], [0.108, -0.03], [0.104, -0.086], [0.022, -0.086]], 0.052, 0.004);
  b.box('detail', 0.016, 0.108, -0.092, -0.082, 0.056);
  b.box('accent', 0.06, 0.145, -0.009, -0.003, 0.0552);
  b.profile('detail', [[-0.022, -0.03], [0.032, -0.03], [0.032, -0.074], [-0.028, -0.074]], 0.014, 0.008, [[[-0.014, -0.037], [0.024, -0.037], [0.024, -0.066], [-0.018, -0.066]]]);
  b.box('metal', 0.001, 0.008, -0.058, -0.034, 0.006);
  // Pistol grip: a solid block with a slight rake and a palm shelf, a squared base cap.
  b.worn(() => b.profile('furniture', [[-0.012, -0.032], [-0.06, -0.032], [-0.098, -0.134], [-0.096, -0.146], [-0.062, -0.15], [-0.03, -0.098], [-0.024, -0.07]], 0.036, 0.006));
  b.box('detail', -0.102, -0.06, -0.156, -0.146, 0.038);
  if (b.high) {
    // Stippled panels on the grip, the magazine release on the right of the magwell, the trigger's pivot pin, the selector.
    for (const side of [-1, 1]) b.profile('stipple', [[-0.022, -0.05], [-0.062, -0.05], [-0.09, -0.128], [-0.054, -0.128], [-0.03, -0.088]], 0.003, 0.004, [], side * 0.018);
    b.worn(() => b.box('detail', 0.03, 0.044, -0.018, -0.008, 0.012, 0.029));
    b.crossTube('metal', 0.006, -0.03, 0.0025, 0.05, 0, 8);
    b.crossTube('detail', -0.03, 0.0, 0.006, 0.006, -0.028, 10);
  }
  // Handguard: a squared slab with chamfered front corners in the envelope the support hand holds, its top rail and accent line.
  const H = AEG_HANDGUARD;
  const slotsAt = [0.19, 0.245, 0.3, 0.35];
  const slots = slotsAt.map((x): Pt[] => [[x, 0.02], [x + 0.032, 0.02], [x + 0.032, 0.032], [x, 0.032]]);
  b.profile('furniture', [[H.from, H.bottom], [H.to - 0.01, H.bottom], [H.to, H.bottom + 0.014], [H.to, H.top - 0.01], [H.to - 0.01, H.top], [H.from, H.top]], H.halfWidth * 2, 0.003, b.high ? slots : []);
  if (b.high) b.box('rubber', H.from + 0.02, H.to - 0.02, H.bottom + 0.006, H.top - 0.006, H.halfWidth * 2 - 0.012); // the dark inside, seen through the slots
  else for (const x of slotsAt) b.box('rubber', x, x + 0.032, 0.02, 0.032, H.halfWidth * 2 + 0.002);
  b.rail(0.155, 0.395, H.top, 0.02);
  b.box('accent', H.from + 0.004, H.to - 0.012, 0.048, 0.052, H.halfWidth * 2 + 0.0012);
  if (b.high) for (const side of [-1, 1]) b.sideRail(0.27, 0.39, 0.034, side, H.halfWidth);
  // Barrel and low-profile gas block (the front sight is a flip-up on the rail). The muzzle end (M29b) is drawn from the
  // part tables: a fitted barrel, and the flash hider or a silencer on the muzzle mount, at the fitted barrel's end.
  b.tube('metal', 0.4, 0.165, 0.034, 0.009);
  b.box('detail', 0.43, AEG_GAS_BLOCK_END, 0.022, 0.05, 0.03);
  // Buffer tube and the stock: a hard-angled frame (a lightening cut on high), a cheek riser, a block butt, a rubber pad.
  b.tube('detail', -0.27, 0.165, 0.032, 0.016);
  const cut: Pt[] = [[-0.21, 0.012], [-0.27, 0.012], [-0.288, -0.028], [-0.248, -0.028]];
  b.profile('furniture', [[-0.16, 0.056], [-0.326, 0.062], [-0.342, 0.05], [-0.342, -0.07], [-0.298, -0.076], [-0.226, 0], [-0.16, 0.012]], 0.048, 0.006, b.high ? [cut] : []);
  b.box('furniture', -0.322, -0.2, 0.06, 0.074, 0.04);
  b.box('detail', -0.342, -0.292, -0.076, 0.062, 0.052);
  b.box('rubber', -0.358, -0.342, -0.07, 0.06, 0.05);
  b.box('accent', -0.29, -0.23, 0.054, 0.06, 0.0484);
  // Flip-up iron sights: a rear aperture at the back of the receiver rail and a front post at the front of the
  // handguard rail, standing up on the bare rifle and folded flat under a fitted optic. High: a steel ring with a 2 mm
  // aperture at the back, a post between protective ears at the front.
  const sightsUp = new ModelBuilder(detail);
  sightsUp.box('detail', -0.085, -0.062, 0.074, 0.084, 0.026);
  if (sightsUp.high) {
    sightsUp.profile('detail', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.094], [-0.078, 0.094]], 0.022, 0.003);
    sightsUp.ringTube('metal', -0.0755, 0.004, 0.101, 0.0075, 0.001, 16);
  } else sightsUp.profile('detail', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.112], [-0.078, 0.112]], 0.022, 0.003, [[[-0.0755, 0.098], [-0.0705, 0.098], [-0.0705, 0.104], [-0.0755, 0.104]]]);
  sightsUp.box('detail', 0.365, 0.39, 0.082, 0.092, 0.024);
  if (sightsUp.high) {
    sightsUp.box('metal', 0.376, 0.38, 0.092, 0.11, 0.003); // the post
    for (const side of [-1, 1]) sightsUp.box('detail', 0.37, 0.386, 0.092, 0.112, 0.003, side * 0.007); // its ears
  } else sightsUp.profile('detail', [[0.37, 0.092], [0.386, 0.092], [0.381, 0.112], [0.375, 0.112]], 0.018, 0.002);
  const sightsDown = new ModelBuilder(detail);
  sightsDown.box('detail', -0.088, -0.054, 0.074, 0.082, 0.026);
  sightsDown.box('detail', 0.362, 0.396, 0.082, 0.089, 0.024);

  const support = new ModelBuilder(detail);
  if (arms) {
    // Right hand on the pistol grip: back of the hand to the right, knuckle row running down the grip, three fingers
    // wrapped round its front, index finger straight along the frame (trigger discipline), thumb across the left of the
    // receiver.
    const rightWrist = arms.hand(
      b,
      { side: 'right', palm: [0.034, -0.092, -0.074], across: GRIP_DOWN, back: [1, 0, 0], fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP], thumb: { swing: 0.9, curl: [0.3, 0.3] } },
      detail.hands,
    );
    arms.forearm(b, rightWrist, [0.2, -0.3, -0.42], undefined, detail.hands);
    // Left hand cradling the handguard: palm underneath, index finger forward, fingers curling up the right side, thumb
    // up the left side. Its own part: on reloads it cups the magazine's base plate.
    const leftWrist = arms.hand(support, AEG_SUPPORT_POSE, detail.hands);
    arms.forearm(support, leftWrist, [-0.3, -0.28, 0.02], undefined, detail.hands);
  }

  const group = b.build(m);
  const magazine = magazinePart(AEG_MAGAZINES, m, detail, [0, -0.97, 0.25], { lowCap: [0, 0.064, -0.002] });
  group.add(magazine.group);
  // From the handguard to just under the magazine's base plate.
  const supportHand = supportHandPart(support, m, [0.016, -0.244, -0.21]);
  group.add(supportHand.group);
  group.add(namedPart(sightsUp, m, 'sightsUp'), namedPart(sightsDown, m, 'sightsDown'));
  for (const [name, draw] of Object.entries(AEG_PARTS)) group.add(drawnPart(draw, m, detail, name));
  const mount = muzzleMount(AEG_MUZZLE, AEG_MUZZLE_DEVICES, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/** The pistols' two-handed grip (the Gas and Cyber Pistols share the grip's line): the right hand round the grip, index finger along the frame; the left pressed against the grip, its fingers over the right hand's. */
function pistolHands(b: ModelBuilder, support: ModelBuilder, detail: ReplicaDetail, arms: ArmBuilders): void {
  const rightWrist = arms.hand(
    b,
    { side: 'right', palm: [0.03, -0.068, -0.078], across: GRIP_DOWN, back: [1, 0, 0], fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP], thumb: { swing: 0.6, curl: [0.2, 0.2] } },
    detail.hands,
  );
  arms.forearm(b, rightWrist, [0.1, -0.26, -0.3], undefined, detail.hands);
  const leftWrist = arms.hand(
    support,
    { side: 'left', palm: [-0.034, -0.072, -0.066], across: GRIP_DOWN, back: [-1, 0, 0], fingers: [SUPPORT, SUPPORT, SUPPORT, SUPPORT], thumb: { swing: 0.3, curl: [0.1, 0.1] } },
    detail.hands,
  );
  arms.forearm(support, leftWrist, [-0.16, -0.26, -0.28], undefined, detail.hands);
}

/**
 * Polymer striker-fired gas pistol (G2: squarer, as the concept): an angular slide with top chamfers and the accent line
 * along both sides, a frame with a railed dust cover and a squared trigger guard, a rectangular grip at a steady rake
 * with a short beavertail. High: front and rear serrations, stippled grip panels and a thumb ledge.
 */
function buildPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null): ReplicaModel {
  const b = new ModelBuilder(detail);
  // Slide, its accent line, the barrel hood in the ejection port, sights, muzzle.
  b.profile('polymer', [[-0.09, 0.0], [0.1, 0.0], [0.1, 0.03], [0.092, 0.036], [-0.08, 0.036], [-0.09, 0.03]], 0.032, 0.003);
  b.box('accent', -0.08, 0.094, 0.012, 0.016, 0.0332);
  if (b.high) {
    // Seven grooves at the rear and four at the front, cut on both sides.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) b.box('rubber', -0.083 + i * 0.0065, -0.08 + i * 0.0065, 0.018, 0.033, 0.0008, side * 0.0161);
      for (let i = 0; i < 4; i++) b.box('rubber', 0.07 + i * 0.0065, 0.073 + i * 0.0065, 0.018, 0.033, 0.0008, side * 0.0161);
    }
    b.box('laserLens', 0.0, 0.003, 0.0355, 0.037, 0.003); // loaded-chamber dot
  } else for (let i = 0; i < 6; i++) b.box('rubber', -0.084 + i * 0.008, -0.081 + i * 0.008, 0.018, 0.033, 0.0325);
  b.box('metal', 0.008, 0.044, 0.03, 0.0365, 0.018);
  b.box('detail', -0.084, -0.072, 0.036, 0.045, 0.022); // rear sight
  b.box('detail', 0.086, 0.094, 0.036, 0.043, 0.006); // front sight
  b.tube(orangeTip ? 'orange' : 'rubber', 0.1, 0.004, 0.015, orangeTip ? 0.0095 : 0.006, 12);
  // Frame: the dust cover with an accessory rail, the squared trigger guard, the grip.
  b.profile('furniture', [[-0.085, 0.0], [0.096, 0.0], [0.096, -0.014], [0.038, -0.016], [-0.07, -0.016]], 0.03, 0.003);
  b.box('furniture', 0.042, 0.092, -0.026, -0.014, 0.024);
  for (const x of [0.05, 0.064, 0.078]) b.box('detail', x, x + 0.008, -0.026, -0.019, 0.025);
  b.worn(() => b.profile('furniture', [[-0.012, -0.012], [-0.078, -0.012], [-0.094, -0.003], [-0.099, -0.009], [-0.082, -0.024], [-0.11, -0.128], [-0.106, -0.132], [-0.054, -0.132], [-0.051, -0.129], [-0.024, -0.03]], 0.032, 0.004));
  if (b.high) {
    for (const side of [-1, 1]) b.profile('stipple', [[-0.034, -0.04], [-0.08, -0.04], [-0.1, -0.118], [-0.06, -0.118]], 0.003, 0.004, [], side * 0.016);
    b.box('furniture', -0.026, -0.02, -0.03, -0.024, 0.036); // thumb ledge
  }
  b.profile('furniture', [[-0.03, -0.014], [0.034, -0.014], [0.034, -0.048], [-0.036, -0.046]], 0.01, 0.006, [[[-0.022, -0.02], [0.026, -0.02], [0.026, -0.042], [-0.027, -0.04]]]);
  b.box('detail', -0.004, 0.003, -0.036, -0.016, 0.005); // trigger
  if (b.high) b.crossTube('metal', 0.0, -0.017, 0.0022, 0.012, 0, 8); // its pivot pin

  const support = new ModelBuilder(detail);
  if (arms) pistolHands(b, support, detail, arms);
  const group = b.build(m);
  for (const [name, draw] of Object.entries(PISTOL_PARTS)) group.add(drawnPart(draw, m, detail, name));
  group.getObjectByName('laser:redLaser')?.add(laserBeam(PISTOL_LASER_LENS));
  const magazine = magazinePart(PISTOL_MAGAZINES, m, detail, GRIP_DOWN, { extended: [0, -0.032, 0] });
  group.add(magazine.group);
  // From the side of the grip down to the magazine's base pad.
  const supportHand = supportHandPart(support, m, [0.004, -0.08, -0.024]);
  group.add(supportHand.group);
  // A silencer screwed onto the threaded barrel (M29b), from the muzzle-device table.
  const mount = muzzleMount(PISTOL_MUZZLE, PISTOL_MUZZLE_DEVICES, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/**
 * The Cyber Pistol (M32, the owner's design; G2 the concept's): a white slab of a pistol with light lines down both sides
 * and a core window that glow, over a dark frame and grip, the same on either team (CYBER_COLOURS; Realistic colours
 * turns it grey and unlit). A top fin sight, a dark muzzle with a ring of light. It sits in the hands like the Gas
 * Pistol (the same grip line and hold), so the hands and the figures' pistol pose fit it unchanged.
 */
function buildCyberPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null): ReplicaModel {
  const b = new ModelBuilder(detail);
  const muzzle = CYBER_MUZZLE.barrelEnd;
  // The slab over the barrel, chamfered nose and sloped back; the dust cover under it.
  b.profile('cyberSlab', [[-0.09, -0.004], [0.098, -0.004], [0.104, 0.006], [0.104, 0.034], [0.098, 0.04], [-0.06, 0.044], [-0.09, 0.032]], 0.034, 0.004);
  b.box('cyberSlab', 0.06, 0.1, -0.03, -0.004, 0.028);
  // Light lines along both sides, the core window, a line down the back strap.
  b.box('cyberLine', -0.07, 0.1, 0.022, 0.025, 0.0354);
  b.box('cyberCore', 0.0, 0.05, 0.004, 0.014, 0.0354);
  b.profile('cyberLine', [[-0.083, -0.03], [-0.087, -0.03], [-0.106, -0.112], [-0.102, -0.112]], 0.012, 0.001);
  // Frame: the squared trigger guard and the trigger, the raked grip; the top fin sight; the muzzle with its ring.
  b.profile('polymer', [[-0.004, -0.004], [0.06, -0.004], [0.06, -0.048], [-0.01, -0.048]], 0.012, 0.004, [[[0.004, -0.012], [0.052, -0.012], [0.052, -0.04], [0.0, -0.04]]]);
  b.box('polymer', 0.014, 0.02, -0.034, -0.008, 0.005);
  b.worn(() => b.profile('polymer', [[-0.004, -0.004], [-0.08, -0.004], [-0.094, -0.012], [-0.08, -0.024], [-0.108, -0.13], [-0.054, -0.13], [-0.02, -0.014]], 0.032, 0.004));
  b.profile('polymer', [[-0.05, 0.043], [-0.02, 0.042], [-0.03, 0.056], [-0.046, 0.056]], 0.008, 0.002);
  b.tube('polymer', 0.1, muzzle - 0.1 - 0.003, CYBER_MUZZLE.up, 0.009, 6);
  b.tube('cyberLine', muzzle - 0.003, 0.001, CYBER_MUZZLE.up, 0.0093, 6);
  b.tube(orangeTip ? 'orange' : 'polymer', muzzle - 0.002, 0.002, CYBER_MUZZLE.up, 0.0075, 12);
  if (b.high) {
    // A second line higher up, stippled grip panels, the slide pin and the trigger's pivot pin.
    b.box('cyberLine', -0.05, 0.02, 0.031, 0.033, 0.0354);
    b.profile('stipple', [[-0.03, -0.04], [-0.076, -0.04], [-0.1, -0.118], [-0.056, -0.118]], 0.0336, 0.004);
    b.crossTube('metal', 0.02, 0.008, 0.0025, 0.036, 0, 8);
    b.crossTube('metal', 0.017, -0.009, 0.0022, 0.013, 0, 8);
  }

  const support = new ModelBuilder(detail);
  if (arms) pistolHands(b, support, detail, arms);
  const group = b.build(m);
  for (const [name, draw] of Object.entries(CYBER_PARTS)) group.add(drawnPart(draw, m, detail, name));
  const magazine = magazinePart(CYBER_MAGAZINES, m, detail, GRIP_DOWN);
  group.add(magazine.group);
  // Down to its base pad (where the Gas Pistol's is).
  const supportHand = supportHandPart(support, m, [0.004, -0.08, -0.024]);
  group.add(supportHand.group);
  const mount = muzzleMount(CYBER_MUZZLE, {}, m, detail, orangeTip);
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
  /** The weapon torch's lens glows (M33h): its torch is on. A uniform change, never a new shader. */
  setTorchLit(on: boolean): void;
  dispose(): void;
}

/** Fingers held straight and together. */
const OPEN: FingerCurl = [0.06, 0.05, 0.03];

/** The hand raised to call a hit: palm forward, fingers up. */
export const RAISED_HAND_POSE: HandPose = {
  side: 'left',
  palm: [0, 0, 0],
  across: [-1, 0, 0],
  back: [0, 0, -1],
  fingers: [OPEN, OPEN, OPEN, OPEN],
  thumb: { swing: 0.1, curl: [0.1, 0.05] },
};

/** Left hand raised to call a hit: palm facing forward, fingers up, forearm dropping out of view. */
function buildRaisedHand(m: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail, arms: ArmBuilders): THREE.Group {
  const b = new ModelBuilder(detail);
  const wrist = arms.hand(
    b,
    RAISED_HAND_POSE,
    detail.hands,
  );
  arms.forearm(b, wrist, [wrist[0] + 0.03, wrist[1] - 0.3, wrist[2] - 0.08], undefined, detail.hands);
  return b.build(m);
}

/**
 * Builds the held-replica model (with hands and team armband) for each replica in the loadout, keyed by replica id, at
 * `detail` (Replica and Hand detail, FA8; Low's by default), each in its colour scheme from `paint` (G1; by loadout slot)
 * or, without one, the unpainted black and tan (the Cyber Pistol always in its own colours). `hands` 'bare': without the
 * hands, for a picture of the replica on its own (itemPictures.ts).
 */
export function buildReplicaModels(
  loadout: readonly ReplicaConfig[],
  teamColor: number,
  orangeTips: boolean,
  detail: ReplicaDetail = LOW_DETAIL,
  paint: ReplicaPaint | null = null,
  hands: HandsShown = 'hands',
  arms: ArmStyle = HUMAN_ARMS,
): ReplicaModels {
  const speckle = detail.replica === 'high' ? speckleTextures() : null;
  const materials = createMaterials(teamColor, detail, speckle, F.unpainted, CYBER_COLOURS.bold, arms);
  const builders = arms.robot ? ROBOT : GLOVED;
  const models = new Map<string, ReplicaModel>();
  // Every material made for a replica's own colours, to dispose and to switch with the sheen (setReflections).
  const painted: THREE.Material[] = [];
  loadout.forEach((r, slot) => {
    const build = r.look.viewmodel === 'cyber' ? buildCyberPistol : r.look.model === 'pistol' ? buildPistol : buildAeg;
    const own = coloursOf(r, slot, paint);
    const mats = own ? paintedMaterials(materials, detail, own.colours, own.cyber) : materials;
    for (const key of PAINTED) if (mats[key] !== materials[key]) painted.push(mats[key]);
    models.set(r.id, build(mats, orangeTips, detail, hands === 'hands' ? builders : null));
  });
  const raisedHand = buildRaisedHand(materials, detail, builders);
  const metals = [materials.metal, ...painted.filter((m) => (m as THREE.MeshStandardMaterial).metalness > 0)] as THREE.MeshStandardMaterial[];
  return {
    models,
    raisedHand,
    detail,
    setReflections(on) {
      if (detail.replica !== 'high') return;
      const M = on ? F.metal.lit : F.metal.unlit;
      for (const metal of metals) {
        metal.metalness = M.metalness;
        metal.roughness = M.roughness;
      }
    },
    setTorchLit(on) {
      const lens = materials.torchLens;
      if (lens instanceof THREE.MeshStandardMaterial) lens.emissiveIntensity = on ? F.torch.glow : 0;
      else (lens as THREE.MeshBasicMaterial).color.setHex(on ? TORCHES.weaponTorch.colour : F.torch.lensOff);
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
      for (const mat of painted) mat.dispose();
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
