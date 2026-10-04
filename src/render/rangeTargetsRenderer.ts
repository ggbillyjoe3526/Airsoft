import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HitConfig } from '../config/hits';
import { RANGE, RANGE_VISUALS } from '../config/range';
import type { GameEvent } from '../sim/events';
import type { RangeTarget } from '../sim/rangeTargets';
import { createRng, rngNext } from '../sim/rng';

const V = RANGE_VISUALS;
const VD = V.detail;

/** A canvas of `w` × `h` drawn by `draw` (nothing where the browser gives no 2D context), as an sRGB texture. */
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, colour = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (g) draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A copy of `geo` turned by `turn` (Euler, radians) and moved to (x, y, z), painted `colour` (for a merged mesh). */
function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, colour: number | null = null, turn: readonly [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...turn)));
  g.translate(x, y, z);
  if (colour !== null) {
    const c = new THREE.Color(colour);
    const n = g.getAttribute('position').count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }
  return g;
}

/** One geometry from several (build time only): the parts are disposed. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('range detail: parts do not merge');
  return geo;
}

/**
 * Where a plate's BB scuffs are, in its texture's pixels (map detail): `count` discs bunched round the middle (a
 * normal spread of `scuffSpread` of the radius), each `scuffRadius` px. Seeded, so every plate of a size matches.
 */
export function plateScuffs(seed: number): { x: number; y: number; r: number }[] {
  const size = VD.textureSize;
  const rng = createRng(seed);
  const count = VD.scuffs[0] + Math.floor(rngNext(rng) * (VD.scuffs[1] - VD.scuffs[0] + 1));
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    // Box–Muller: hits bunch round the plate's middle.
    const a = rngNext(rng) * Math.PI * 2;
    const d = Math.sqrt(-2 * Math.log(1 - rngNext(rng) * 0.999)) * VD.scuffSpread * (size / 2) * 0.5;
    const r = VD.scuffRadius[0] + rngNext(rng) * (VD.scuffRadius[1] - VD.scuffRadius[0]);
    out.push({ x: size / 2 + Math.cos(a) * d, y: size / 2 + Math.sin(a) * d, r });
  }
  return out;
}

/**
 * How far back a figure lies (rad) with `down` seconds left before it stands up (0: standing): it falls over
 * V.fallTime, lies there, and comes back up over the last V.riseTime.
 */
export function figureTilt(down: number): number {
  if (down <= 0) return 0;
  const fallen = Math.min(1, (RANGE.figureDownTime - down) / V.fallTime);
  const rising = Math.min(1, down / V.riseTime);
  return V.downAngle * Math.min(fallen, rising);
}

/** How far a steel plate swings back (rad), `t` seconds after it was hit: out from hanging straight, back, and settling. */
export function plateSwing(t: number): number {
  return V.swingAngle * Math.exp(-V.swingDamping * t) * Math.abs(Math.sin(V.swingRate * t));
}

/** A hit plate's hanger turn about x (rad): positive, since the plate hangs below the hanger and swings back. */
export function plateRotation(t: number): number {
  return plateSwing(t);
}

/** A figure's hinge turn about x (rad): negative, since the figure stands above its hinge and falls back. */
export function figureRotation(down: number): number {
  return -figureTilt(down);
}

/**
 * The practice range's targets (M21): steel plates on posts that swing back when hit, plywood figures that fall back
 * on their hinge and stand up again, and the distance markers (a painted line across the floor and a board on each
 * wall at every distance). Reads the targets' state and the tick's events; never writes.
 */
/**
 * A board's texture v (0..1 up the board) in the distance boards' atlas of `count` rows, board `row` from the top (the
 * canvas runs downwards and the texture is flipped, so the top row is the top of v). Exported for the tests.
 */
export function signRow(v: number, row: number, count: number): number {
  return 1 - (row + 1 - v) / count;
}

/** Scratch for the per-frame instance matrices (allocation-free). */
const pivotM = new THREE.Matrix4();
const partM = new THREE.Matrix4();
const turnM = new THREE.Matrix4();

/** One moving part of a target drawn as an instance: its pivot (world), its place relative to the pivot. */
interface Part {
  mesh: THREE.InstancedMesh;
  index: number;
  pivot: THREE.Vector3;
  local: THREE.Matrix4;
}

/**
 * The practice range's targets: steel plates on hangers that swing when hit, plywood figures on hinges that fall back,
 * their posts, the distance lines and boards. Few draw calls whatever the number of targets (the range must fit the
 * presets' budgets, audit section 5): each kind of part is one instanced mesh (plates, chains, torsos, heads) whose
 * instances follow the targets' swing and fall, and everything that doesn't move is one merged mesh per material (the
 * posts, the lines, the boards on one atlas, Map detail's fittings and shelf).
 */
export class RangeTargetsRenderer {
  readonly object = new THREE.Group();
  /** Per target: seconds since a steel plate was last hit (Infinity: still). */
  private readonly swingT: number[] = [];
  /** Per target: the angle its instances were last drawn at (NaN: never). */
  private readonly drawnAngle: number[] = [];
  /** Per target: its moving parts. */
  private readonly parts: Part[][] = [];
  private readonly movers: THREE.InstancedMesh[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  /** Map detail (setDetail): the meshes shown only with it, the materials that take a painted texture, and those textures. */
  private readonly detailParts: THREE.Object3D[] = [];
  private readonly steel: THREE.MeshStandardMaterial;
  private readonly ply: THREE.MeshStandardMaterial;
  private readonly plyHead: THREE.MeshStandardMaterial;
  private painted: { steel: THREE.Texture; steelRough: THREE.Texture; ply: THREE.Texture; head: THREE.Texture } | null = null;

  constructor(
    private readonly targets: readonly RangeTarget[],
    hits: HitConfig,
  ) {
    const steel = (this.steel = this.track(new THREE.MeshStandardMaterial({ color: V.steelColor, metalness: V.steelMetalness, roughness: V.steelRoughness })));
    const post = this.track(new THREE.MeshStandardMaterial({ color: V.postColor, roughness: 0.8 }));
    const ply = (this.ply = this.track(new THREE.MeshStandardMaterial({ color: V.figureColor, roughness: V.figureRoughness })));
    const plyHead = (this.plyHead = this.track(new THREE.MeshStandardMaterial({ color: V.figureColor, roughness: V.figureRoughness })));
    // Map detail's parts: each plate's two short chains (instanced with the plates), and every static fitting (the arms
    // the chains hang from, the safety bands, the figures' hinge brackets, the shelf) as one vertex-coloured mesh.
    const metal = this.track(new THREE.MeshStandardMaterial({ color: VD.metal, metalness: 0.7, roughness: 0.4 }));
    const fittings = this.track(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.5 }));
    const linkGeo = new THREE.TorusGeometry(VD.linkRadius, VD.linkTube, 5, 10);
    const step = RANGE.postAbovePlate / VD.links;
    const links: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < VD.links; k++) links.push(placed(linkGeo, side * VD.chainSpread, -(k + 0.5) * step, 0, null, [0, k % 2 === 0 ? 0 : Math.PI / 2, Math.PI / 2]));
    }
    linkGeo.dispose();
    const armGeo = new THREE.BoxGeometry(2 * VD.chainSpread + RANGE.postWidth, VD.armDepth, RANGE.postBehind + RANGE.postWidth / 2);
    const bandGeo = new THREE.BoxGeometry(RANGE.postWidth * 1.15, VD.band.height, RANGE.postWidth * 1.15);
    const hingeGeo = new THREE.BoxGeometry(VD.hinge.width, VD.hinge.height, VD.hinge.depth);
    const plateGeo = this.trackGeo(new THREE.CylinderGeometry(RANGE.plateRadius, RANGE.plateRadius, V.plateThickness, V.plateSegments));
    plateGeo.rotateX(Math.PI / 2); // face the firing line (+z)
    const headGeo = this.trackGeo(new THREE.CylinderGeometry(hits.headRadius, hits.headRadius, V.figureThickness, 16));
    headGeo.rotateX(Math.PI / 2);
    // A torso 1 m tall, scaled to a standing or crouched figure by its instance.
    const torsoGeo = this.trackGeo(new THREE.BoxGeometry(V.figureWidth, 1, V.figureThickness));

    const plates = targets.filter((t) => t.kind === 'steel').length;
    const figures = targets.length - plates;
    const plateMesh = this.instanced(plateGeo, steel, plates, true);
    const chainMesh = this.instanced(this.trackGeo(merged(links)), metal, plates, false);
    const torsoMesh = this.instanced(torsoGeo, ply, figures, true);
    const headMesh = this.instanced(headGeo, plyHead, figures, true);
    this.detailParts.push(chainMesh);

    const posts: THREE.BufferGeometry[] = [];
    const fittingParts: THREE.BufferGeometry[] = [];
    let plate = 0;
    let figure = 0;
    for (const t of targets) {
      const parts: Part[] = [];
      if (t.kind === 'steel') {
        // The plate hangs from the top of a post frame; it swings about the hanger.
        const top = t.position.y + RANGE.plateRadius + RANGE.postAbovePlate;
        const upright = new THREE.BoxGeometry(RANGE.postWidth, top, RANGE.postWidth);
        posts.push(placed(upright, t.position.x, top / 2, t.position.z - RANGE.postBehind));
        upright.dispose();
        const pivot = new THREE.Vector3(t.position.x, top, t.position.z);
        parts.push({ mesh: plateMesh, index: plate, pivot, local: new THREE.Matrix4().makeTranslation(0, t.position.y - top, 0) });
        parts.push({ mesh: chainMesh, index: plate, pivot, local: new THREE.Matrix4() });
        plate++;
        // Detail: the plate on two short chains from an arm off the post's top, and a safety band on the post.
        fittingParts.push(placed(armGeo, t.position.x, top + VD.armDepth / 2, t.position.z - RANGE.postBehind / 2, VD.metal));
        fittingParts.push(placed(bandGeo, t.position.x, VD.band.at, t.position.z - RANGE.postBehind, VD.band.colour));
      } else {
        // A plywood cut-out the size of a player's hit volume, standing or crouched, hinged at its feet.
        const drop = t.crouched ? hits.crouchDrop : 0;
        const bodyTop = hits.bodyTop - drop;
        const pivot = new THREE.Vector3(t.position.x, 0, t.position.z);
        const torso = new THREE.Matrix4().makeScale(1, bodyTop - hits.bodyBottom, 1).setPosition(0, (bodyTop + hits.bodyBottom) / 2, 0);
        parts.push({ mesh: torsoMesh, index: figure, pivot, local: torso });
        parts.push({ mesh: headMesh, index: figure, pivot, local: new THREE.Matrix4().makeTranslation(0, hits.headHeight - drop, 0) });
        figure++;
        // Detail: the hinge brackets the figure stands on.
        for (const side of [-1, 1]) {
          fittingParts.push(placed(hingeGeo, t.position.x + side * (V.figureWidth / 2 - VD.hinge.inset), VD.hinge.height / 2, t.position.z, VD.metal));
        }
      }
      this.parts.push(parts);
      this.swingT.push(Number.POSITIVE_INFINITY);
      this.drawnAngle.push(Number.NaN);
    }
    if (posts.length > 0) this.object.add(this.static('range-posts', merged(posts), post, false));
    this.addShelf(fittingParts);
    for (const g of [armGeo, bandGeo, hingeGeo]) g.dispose();
    const stands = this.static('range-fittings', merged(fittingParts), fittings, true);
    this.object.add(stands);
    this.detailParts.push(stands);
    this.addMarkers();
    this.setDetail(false);
    this.update(0);
  }

  /**
   * Map detail on or off (QualitySettings.mapDetail): the chains, arms, bands, brackets and shelf, and the painted
   * plates (BB scuffs, rougher than the paint) and figures (scoring zones), drawn the first time detail is on.
   */
  setDetail(on: boolean): void {
    for (const part of this.detailParts) part.visible = on;
    const p = on ? (this.painted ??= this.paint()) : null;
    const set = (m: THREE.MeshStandardMaterial, map: THREE.Texture | null, roughnessMap: THREE.Texture | null = null): void => {
      if (m.map === map && m.roughnessMap === roughnessMap) return;
      m.map = map;
      m.roughnessMap = roughnessMap;
      m.needsUpdate = true;
    };
    set(this.steel, p?.steel ?? null, p?.steelRough ?? null);
    // White paint under the scuffs: the map carries the colour, the roughness map the scuffs' roughness.
    this.steel.color.setHex(p ? 0xffffff : V.steelColor);
    this.steel.roughness = p ? 1 : V.steelRoughness;
    set(this.ply, p?.ply ?? null);
    set(this.plyHead, p?.head ?? null);
    this.ply.color.setHex(p ? 0xffffff : V.figureColor);
    this.plyHead.color.setHex(p ? 0xffffff : V.figureColor);
  }

  /** Plates and figures shaded by the range's walls, or lit as if in full sun (QualitySettings.figureShadows, REN-07). */
  setReceiveShadows(on: boolean): void {
    for (const mesh of this.movers) mesh.receiveShadow = on;
  }

  /** After each simulation tick: steel plates that were hit start swinging. */
  afterTick(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type !== 'targetHit' || e.kind !== 'steel') continue;
      const i = this.targets.findIndex((t) => t.id === e.targetId);
      if (i >= 0) this.swingT[i] = 0;
    }
  }

  /** Once per frame: figures follow their time down, plates swing and settle; only targets that moved are uploaded. */
  update(dt: number): void {
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i]!;
      let angle: number;
      if (t.kind === 'figure') {
        angle = figureRotation(t.down);
      } else {
        const s = (this.swingT[i]! += dt);
        angle = Number.isFinite(s) ? plateRotation(s) : 0;
      }
      if (angle === this.drawnAngle[i]) continue;
      this.drawnAngle[i] = angle;
      for (const part of this.parts[i]!) {
        pivotM.makeTranslation(part.pivot.x, part.pivot.y, part.pivot.z).multiply(turnM.makeRotationX(angle));
        part.mesh.setMatrixAt(part.index, partM.multiplyMatrices(pivotM, part.local));
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.movers) m.dispose();
    this.object.removeFromParent();
  }

  /** An instanced mesh of `count` moving parts (never culled: its instances move). */
  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, castShadow: boolean): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    mesh.count = count;
    mesh.castShadow = castShadow;
    mesh.frustumCulled = false;
    this.movers.push(mesh);
    this.object.add(mesh);
    return mesh;
  }

  /** A merged mesh of parts that never move. */
  private static(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, castShadow: boolean): THREE.Mesh {
    const mesh = new THREE.Mesh(this.trackGeo(geo), mat);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** A painted line across the floor at every distance (one mesh), and a board on each side wall saying how far (one mesh, one atlas). */
  private addMarkers(): void {
    const lineMat = this.track(new THREE.MeshBasicMaterial({ color: V.lineColor }));
    const lineGeo = new THREE.PlaneGeometry(RANGE.halfWidth * 2, V.lineDepth);
    lineGeo.rotateX(-Math.PI / 2);
    const distances = [0, ...RANGE.distances];
    const lines = this.static('range-lines', merged(distances.map((d) => placed(lineGeo, 0, V.lineLift, -d))), lineMat, false);
    lines.receiveShadow = true;
    lineGeo.dispose();
    this.object.add(lines);

    const boards = RANGE.distances;
    const signGeo = new THREE.PlaneGeometry(V.signWidth, V.signHeight);
    const signs: THREE.BufferGeometry[] = [];
    boards.forEach((d, k) => {
      for (const side of [-1, 1]) {
        // On the wall's face, turned halfway towards the firing line so it reads from there; its row of the atlas.
        const g = placed(signGeo, side * (RANGE.halfWidth - (V.signWidth / 2) * Math.sin(V.signTurn) - 0.01), V.signLift, -d, null, [0, -side * (Math.PI / 2 - V.signTurn), 0]);
        const uv = g.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setY(i, signRow(uv.getY(i), k, boards.length));
        signs.push(g);
      }
    });
    signGeo.dispose();
    const mat = this.track(new THREE.MeshBasicMaterial({ map: this.signAtlas(boards.map((d) => `${d} m`)) }));
    this.object.add(this.static('range-signs', merged(signs), mat, false));
  }

  /** A shelf of BB bottles by the firing line (map detail): its parts go into the stands' merged mesh, `parts`. */
  private addShelf(parts: THREE.BufferGeometry[]): void {
    const S = VD.shelf;
    const B = VD.bottles;
    const top = new THREE.BoxGeometry(S.width, S.top, S.depth);
    parts.push(placed(top, S.x, S.height - S.top / 2, S.z, S.colour));
    const leg = new THREE.BoxGeometry(S.top, S.height - S.top, S.top);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) parts.push(placed(leg, S.x + sx * (S.width / 2 - S.top), (S.height - S.top) / 2, S.z + sz * (S.depth / 2 - S.top), VD.metal));
    }
    const bottle = new THREE.CylinderGeometry(B.radius, B.radius, B.height, 10);
    const cap = new THREE.CylinderGeometry(B.radius * 0.45, B.radius * 0.45, B.height * 0.15, 8);
    for (let i = 0; i < B.count; i++) {
      const x = S.x + (i - (B.count - 1) / 2) * B.radius * 3;
      parts.push(placed(bottle, x, S.height + B.height / 2, S.z, B.colour));
      parts.push(placed(cap, x, S.height + B.height * 1.075, S.z, B.capColour));
    }
    for (const g of [top, leg, bottle, cap]) g.dispose();
  }

  /** The painted textures (map detail): the plates' paint and scuffs, the figures' scoring zones and head ring. */
  private paint(): { steel: THREE.Texture; steelRough: THREE.Texture; ply: THREE.Texture; head: THREE.Texture } {
    const size = VD.textureSize;
    const scuffs = plateScuffs(V.plateSegments);
    const steel = canvasTexture(size, size, (g) => {
      g.fillStyle = `#${V.steelColor.toString(16).padStart(6, '0')}`;
      g.fillRect(0, 0, size, size);
      for (const s of scuffs) {
        g.fillStyle = 'rgba(150,146,138,0.9)';
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(110,106,100,0.8)';
        g.lineWidth = 1;
        g.stroke();
      }
    });
    const level = (r: number): string => {
      const v = Math.round(r * 255);
      return `rgb(${v},${v},${v})`;
    };
    const steelRough = canvasTexture(
      size,
      size,
      (g) => {
        g.fillStyle = level(VD.paintRoughness);
        g.fillRect(0, 0, size, size);
        g.fillStyle = level(VD.scuffRoughness);
        for (const s of scuffs) {
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          g.fill();
        }
      },
      false,
    );
    const ply = canvasTexture(size / 2, size, (g) => {
      const w = size / 2;
      g.fillStyle = VD.plywood;
      g.fillRect(0, 0, w, size);
      g.strokeStyle = VD.zoneInk;
      g.lineWidth = 3;
      g.strokeRect(6, 6, w - 12, size - 12);
      g.beginPath();
      g.arc(w / 2, size * 0.45, w * 0.22, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(w / 2, size * 0.45, w * 0.06, 0, Math.PI * 2);
      g.fillStyle = VD.zoneInk;
      g.fill();
    });
    const head = canvasTexture(size / 2, size / 2, (g) => {
      const w = size / 2;
      g.fillStyle = VD.plywood;
      g.fillRect(0, 0, w, w);
      g.strokeStyle = VD.zoneInk;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(w / 2, w / 2, w * 0.38, 0, Math.PI * 2);
      g.stroke();
    });
    this.textures.push(steel, steelRough, ply, head);
    return { steel, steelRough, ply, head };
  }

  /** The distance boards' atlas: one 256 × 128 board per text, top to bottom (signRow maps a board's UVs to its row). */
  private signAtlas(texts: readonly string[]): THREE.Texture {
    const tex = canvasTexture(256, 128 * texts.length, (g) => {
      texts.forEach((text, k) => {
        g.fillStyle = V.signColor;
        g.fillRect(0, k * 128, 256, 128);
        g.fillStyle = V.signText;
        g.font = 'bold 84px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, 128, k * 128 + 64 + 4);
      });
    });
    this.textures.push(tex);
    return tex;
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }
}
