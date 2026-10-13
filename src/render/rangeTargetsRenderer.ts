import * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import { RANGE, RANGE_VISUALS } from '../config/range';
import type { GameEvent } from '../sim/events';
import { type RangeTarget, swingAngle } from '../sim/rangeTargets';
import { createRng, rngNext } from '../sim/rng';
import { merged, placed, targetGear } from './rangeTargetGear';

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
 * How far back a figure lies (rad) with `down` seconds left before it stands up (0: standing), of a spell down `downFor`
 * long (M93: a pop-up's varies): it falls over V.fallTime, lies there, and comes back up over the last V.riseTime.
 */
export function figureTilt(down: number, downFor: number = RANGE.figureDownTime): number {
  if (down <= 0) return 0;
  const fallen = Math.min(1, Math.max(0, downFor - down) / V.fallTime);
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
export function figureRotation(down: number, downFor: number = RANGE.figureDownTime): number {
  return -figureTilt(down, downFor);
}

/**
 * A board's texture v (0..1 up the board) in the distance boards' atlas of `count` rows, board `row` from the top (the
 * canvas runs downwards and the texture is flipped, so the top row is the top of v). Exported for the tests.
 */
function signRow(v: number, row: number, count: number): number {
  return 1 - (row + 1 - v) / count;
}

/** Scratch for the per-frame instance matrices (allocation-free). */
const bodyM = new THREE.Matrix4();
const carrierM = new THREE.Matrix4();
const partM = new THREE.Matrix4();
const turnM = new THREE.Matrix4();
/** Draws nothing: a hidden target's instances, and a lit target's own (its lit twin is drawn instead). */
const NONE = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * One moving part of a target drawn as an instance: which mesh and instance, what it rides on (the target's `body`, the
 * plate or figure that swings or falls; or its `carrier`, a mover's trolley or a swinger's arm) and its place there.
 * `twin`: the index in `twins` of the lit copy drawn in its place while the target is lit (the timed challenge, M93), or
 * -1 for a part that stays as it is (a chain, a trolley, an arm).
 */
interface Part {
  mesh: THREE.InstancedMesh;
  index: number;
  rides: 'body' | 'carrier';
  local: THREE.Matrix4;
  twin: number;
}

/**
 * The practice range's targets: steel plates on hangers that swing when hit, plywood figures on hinges that fall back,
 * and M93's pop-ups, movers on their trolleys and rails, swingers on their arms and frames, small steel and the
 * challenge's START plate; their posts, the distance lines and boards. Few draw calls whatever the number of targets (the
 * range must fit the presets' budgets, audit section 5): each kind of part is one instanced mesh (plates, chains, torsos,
 * heads, trolleys, arms) whose instances follow the targets' motion, swing and fall, a lit target's plate or figure is
 * drawn by a lit twin of its mesh, and everything that doesn't move is one merged mesh per material (the posts and gear,
 * the lines, the boards on one atlas, Map detail's fittings and shelf). Reads the targets' state and the tick's events;
 * never writes.
 */
export class RangeTargetsRenderer {
  readonly object = new THREE.Group();
  /** Per target: seconds since a steel plate was last hit (Infinity: still). */
  private readonly swingT: number[] = [];
  /** Per target: the angle, lit and hidden state and cycle clock its instances were last drawn with (NaN: never). */
  private readonly drawnAngle: number[] = [];
  private readonly drawnLit: boolean[] = [];
  private readonly drawnHidden: boolean[] = [];
  private readonly drawnClock: number[] = [];
  /** Per target: its moving parts. */
  private readonly parts: Part[][] = [];
  private readonly movers: THREE.InstancedMesh[] = [];
  /** The lit twins (M93), and how many instances each draws this frame. */
  private readonly twins: THREE.InstancedMesh[] = [];
  private readonly twinDrawn: number[] = [];
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
    // A lit target (M93) in the challenge's colour, glowing a little so it reads at any distance.
    const lit = this.track(new THREE.MeshStandardMaterial({ color: V.litColour, emissive: V.litColour, emissiveIntensity: V.litGlow, roughness: V.litRoughness }));
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
    const plateGeo = this.trackGeo(new THREE.CylinderGeometry(RANGE.plateRadius, RANGE.plateRadius, V.plateThickness, V.plateSegments));
    plateGeo.rotateX(Math.PI / 2); // face the firing line (+z)
    const headGeo = this.trackGeo(new THREE.CylinderGeometry(hits.headRadius, hits.headRadius, V.figureThickness, 16));
    headGeo.rotateX(Math.PI / 2);
    // A torso 1 m tall, scaled to a standing or crouched figure by its instance; trolleys and arms likewise from a unit box.
    const torsoGeo = this.trackGeo(new THREE.BoxGeometry(V.figureWidth, 1, V.figureThickness));
    const boxGeo = this.trackGeo(new THREE.BoxGeometry(1, 1, 1));
    // The START plate's painted face (M93): a disc just in front of its plate.
    const faceGeo = this.trackGeo(new THREE.CircleGeometry(RANGE.plateRadius * V.start.inset, V.plateSegments));
    const face = this.track(new THREE.MeshStandardMaterial({ map: this.startFace(), roughness: V.start.roughness }));

    const count = (f: (t: RangeTarget) => boolean): number => targets.filter(f).length;
    const plates = count((t) => t.kind === 'steel');
    const chained = count((t) => t.kind === 'steel' && t.motion !== 'swinger');
    const figures = count((t) => t.kind === 'figure');
    const plateMesh = this.instanced(plateGeo, steel, plates, true);
    const chainMesh = this.instanced(this.trackGeo(merged(links)), metal, chained, false);
    const torsoMesh = this.instanced(torsoGeo, ply, figures, true);
    const headMesh = this.instanced(headGeo, plyHead, figures, true);
    const trolleyMesh = this.instanced(boxGeo, post, count((t) => t.motion === 'mover'), true);
    const armMesh = this.instanced(boxGeo, post, count((t) => t.motion === 'swinger'), true);
    const faceMesh = this.instanced(faceGeo, face, count((t) => t.start), false);
    // The START plate's stand (its post and the arm its chains hang from) goes with it, so it's drawn as moving parts.
    const standMesh = this.instanced(boxGeo, post, 2 * count((t) => t.start), true);
    const plateTwin = this.twin(plateGeo, lit, plates);
    const torsoTwin = this.twin(torsoGeo, lit, figures);
    const headTwin = this.twin(headGeo, lit, figures);
    this.detailParts.push(chainMesh);

    const next = new Map<THREE.InstancedMesh, number>();
    const part = (mesh: THREE.InstancedMesh, rides: Part['rides'], local: THREE.Matrix4, twin = -1): Part => {
      const index = next.get(mesh) ?? 0;
      next.set(mesh, index + 1);
      return { mesh, index, rides, local, twin };
    };
    for (const t of targets) {
      const parts: Part[] = [];
      if (t.kind === 'steel') {
        // A plate scaled to its radius (M93: small steel). A still plate hangs from the top of its post on two chains and
        // swings about the hanger; a swinger's is bolted to the end of its arm.
        const scale = t.radius / RANGE.plateRadius;
        const sized = new THREE.Matrix4().makeScale(scale, scale, 1);
        if (t.motion === 'swinger') {
          const G = V.gear;
          const arm = RANGE.swinger.arm;
          parts.push(part(armMesh, 'carrier', new THREE.Matrix4().makeScale(G.arm, arm, G.arm).setPosition(0, -arm / 2, -(V.plateThickness + G.arm) / 2)));
          parts.push(part(plateMesh, 'body', sized, plateTwin));
        } else {
          const hang = t.radius + RANGE.postAbovePlate;
          parts.push(part(plateMesh, 'body', sized.clone().setPosition(0, -hang, 0), plateTwin));
          parts.push(part(chainMesh, 'body', new THREE.Matrix4().makeScale(scale, 1, 1)));
          if (t.start) {
            parts.push(part(faceMesh, 'body', new THREE.Matrix4().makeTranslation(0, -hang, V.plateThickness / 2 + V.start.lift)));
            const p = t.posts[0]!;
            const height = p.top - t.floor;
            const w = RANGE.postWidth;
            parts.push(part(standMesh, 'carrier', new THREE.Matrix4().makeScale(w, height, w).setPosition(p.x, t.floor + height / 2 - t.home.y, p.z)));
            const arm = new THREE.Matrix4().makeScale(2 * VD.chainSpread + w, VD.armDepth, -p.z + w / 2);
            parts.push(part(standMesh, 'carrier', arm.setPosition(p.x, p.top + VD.armDepth / 2 - t.home.y, p.z / 2)));
          }
        }
      } else {
        // A plywood cut-out the size of a player's hit volume, standing or crouched, hinged at its feet (a mover's on its
        // trolley, which runs under it).
        const drop = t.crouched ? hits.crouchDrop : 0;
        const bodyTop = hits.bodyTop - drop;
        const torso = new THREE.Matrix4().makeScale(1, bodyTop - hits.bodyBottom, 1).setPosition(0, (bodyTop + hits.bodyBottom) / 2, 0);
        parts.push(part(torsoMesh, 'body', torso, torsoTwin));
        parts.push(part(headMesh, 'body', new THREE.Matrix4().makeTranslation(0, hits.headHeight - drop, 0), headTwin));
        if (t.motion === 'mover') {
          const T = V.gear.trolley;
          const h = RANGE.mover.trolleyHeight;
          parts.push(part(trolleyMesh, 'carrier', new THREE.Matrix4().makeScale(T.width, h, T.depth).setPosition(0, -h / 2, 0)));
        }
      }
      this.parts.push(parts);
      this.swingT.push(Number.POSITIVE_INFINITY);
      this.drawnAngle.push(Number.NaN);
      this.drawnLit.push(false);
      this.drawnHidden.push(false);
      this.drawnClock.push(Number.NaN);
    }
    const gear = targetGear(targets);
    if (gear.posts.length > 0) this.object.add(this.static('range-posts', merged(gear.posts), post, false));
    const fittingParts = gear.fittings;
    this.addShelf(fittingParts);
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
    // Off: the cached paint lets go of its GPU copies (it keeps its canvases and uploads again when detail comes back).
    if (!on && this.painted) for (const t of Object.values(this.painted)) t.dispose();
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

  /**
   * Once per frame, `alpha` of the way from the last tick to the next: figures follow their time down, plates swing and
   * settle, movers and swingers move on, and lit targets (M93) are drawn by the lit twins; only targets that moved or
   * changed are uploaded.
   */
  update(dt: number, alpha = 1): void {
    this.twinDrawn.fill(0);
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i]!;
      let angle: number;
      if (t.kind === 'figure') angle = figureRotation(t.down, t.downFor);
      else {
        const s = (this.swingT[i]! += dt);
        angle = Number.isFinite(s) && t.motion !== 'swinger' ? plateRotation(s) : 0;
      }
      const lit = t.lit > 0 && !t.hidden;
      // Where a mover or swinger is in its cycle, as drawn (between its last two ticks); the rest never change it.
      const clock = t.prevClock + (t.clock - t.prevClock) * alpha;
      // A lit target is drawn every frame: the lit twins are filled afresh each time.
      if (!lit && angle === this.drawnAngle[i] && lit === this.drawnLit[i] && t.hidden === this.drawnHidden[i] && clock === this.drawnClock[i]) continue;
      this.drawnAngle[i] = angle;
      this.drawnLit[i] = lit;
      this.drawnHidden[i] = t.hidden;
      this.drawnClock[i] = clock;
      this.place(t, angle, clock, alpha);
      for (const part of this.parts[i]!) {
        const m = part.rides === 'body' ? bodyM : carrierM;
        partM.multiplyMatrices(m, part.local);
        const twinned = lit && part.twin >= 0;
        if (twinned) {
          const twin = this.twins[part.twin]!;
          twin.setMatrixAt(this.twinDrawn[part.twin]!++, partM);
          twin.instanceMatrix.needsUpdate = true;
        }
        part.mesh.setMatrixAt(part.index, t.hidden || twinned ? NONE : partM);
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (let k = 0; k < this.twins.length; k++) this.twins[k]!.count = this.twinDrawn[k]!;
  }

  /**
   * Sets bodyM and carrierM for target `t` drawn `alpha` of the way between its last two ticks (a swinger at `clock` in
   * its swing), its plate swung or figure fallen by `angle` about its hinge's x. A still plate's body hangs from its
   * hanger over it; a figure's stands on its hinge at its feet (a mover's carrier is its trolley there); a swinger's
   * carrier is its arm from the pivot, its body the plate at the arm's end.
   */
  private place(t: RangeTarget, angle: number, clock: number, alpha: number): void {
    if (t.motion === 'swinger') {
      // The pivot over the plate's lowest point, turned to face its yaw, the arm swung about its own z.
      carrierM.makeTranslation(t.home.x, t.home.y + RANGE.swinger.arm, t.home.z).multiply(turnM.makeRotationY(t.yaw)).multiply(turnM.makeRotationZ(swingAngle(clock)));
      bodyM.copy(carrierM).multiply(turnM.makeTranslation(0, -RANGE.swinger.arm, 0));
      return;
    }
    // Where it is between its last two ticks (a mover runs on; the rest stay put).
    const p = t.position;
    const q = t.prevPosition;
    const x = q.x + (p.x - q.x) * alpha;
    const y = q.y + (p.y - q.y) * alpha;
    const z = q.z + (p.z - q.z) * alpha;
    carrierM.makeTranslation(x, y, z).multiply(turnM.makeRotationY(t.yaw));
    // A plate hangs from its hanger over it; a figure stands on its hinge at its feet.
    const hang = t.kind === 'steel' ? t.radius + RANGE.postAbovePlate : 0;
    bodyM.makeTranslation(x, y + hang, z).multiply(turnM.makeRotationY(t.yaw)).multiply(turnM.makeRotationX(angle));
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

  /** A lit twin of a moving mesh (M93): room for `capacity` instances, none drawn until a target lights. Its index. */
  private twin(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number): number {
    const mesh = this.instanced(geo, mat, capacity, true);
    mesh.count = 0;
    this.twins.push(mesh);
    this.twinDrawn.push(0);
    return this.twins.length - 1;
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

  /** The START plate's face (M93): safety orange with the word in white, read from the line. */
  private startFace(): THREE.Texture {
    const S = V.start;
    const n = S.textureSize;
    const tex = canvasTexture(n, n, (g) => {
      g.fillStyle = S.paint;
      g.fillRect(0, 0, n, n);
      g.fillStyle = S.ink;
      g.font = `bold ${Math.round(n * S.font)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('START', n / 2, n / 2 + n * S.drop);
    });
    this.textures.push(tex);
    return tex;
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
