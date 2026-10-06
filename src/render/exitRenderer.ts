import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXIT_VISUALS } from '../config/render';
import { cssColor } from '../config/teams';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import type { RunExit, RunState } from '../sim/extraction';

const V = EXIT_VISUALS;
/** Scratch for an instance's matrix while the exits are built. */
const PLACE = new THREE.Matrix4();
/** Components of the floor's colours: RGB and the see-through alpha (EXIT_VISUALS.ringOpacity and fillOpacity). */
const RGBA = 4;

/** One drawn exit: where its ring and wash sit in the floor's vertices, its board's place, the state last drawn. */
interface ExitSlot {
  /** Its ring's and wash's vertices in the floor geometry: [first, first + count). */
  first: number;
  count: number;
  board: THREE.Matrix4;
  shownOpen: boolean | null;
}

/** The sign's board: white text on the exit's colour, drawn once per state. */
function drawBoard(text: string, color: number): THREE.CanvasTexture {
  const { width, height } = V.boardPixels;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = cssColor(color);
    g.fillRect(0, 0, width, height);
    g.strokeStyle = '#ffffff';
    g.lineWidth = height * 0.06;
    g.strokeRect(g.lineWidth, g.lineWidth, width - 2 * g.lineWidth, height - 2 * g.lineWidth);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(height * (text.length > 5 ? 0.34 : 0.5))}px sans-serif`;
    g.fillText(text, width / 2, height / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Extraction's exits in the world (M43): a painted ring with a faint wash inside, site cones round it and an EXIT sign
 * on a post, green while open and grey while a late exit is still shut; exits closed for the run aren't drawn. Built
 * once from the run's exits; a frame only repaints an exit when it opens. Reads the run state only. On a field with
 * terrain (M48: Woodland) the ring, its wash, the cones and the post follow the ground, so a slope buries none of them.
 *
 * A fixed number of draws whatever the exit count (M75, audit REN-04): every ring and wash in one merged floor mesh
 * (each draped on its own ground, so no two share a shape; their colour and see-through are per vertex, repainted when
 * an exit opens), the boards in two instanced draws (open and shut: their faces are two textures), the cones in one
 * and the posts in another (M48).
 */
export class ExitRenderer {
  readonly object = new THREE.Group();
  private readonly exits: ExitSlot[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  /** The rings' and washes' one material: colour and alpha from the vertices (EXIT_VISUALS' colours and opacities). */
  private readonly floorMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  private readonly cone = new THREE.MeshStandardMaterial({ color: V.coneColor, roughness: 0.7 });
  private readonly post = new THREE.MeshStandardMaterial({ color: V.postColor, roughness: 0.6 });
  private readonly openTexture = drawBoard(V.openText, V.openColor);
  private readonly shutTexture = drawBoard(V.shutText, V.shutColor);
  private readonly boardOpen = new THREE.MeshStandardMaterial({ map: this.openTexture, roughness: 0.8, side: THREE.DoubleSide });
  private readonly boardShut = new THREE.MeshStandardMaterial({ map: this.shutTexture, roughness: 0.8, side: THREE.DoubleSide });
  /** The open and shut colours in the working colour space, as the materials' `color` took them before M75. */
  private readonly openColor = new THREE.Color(V.openColor);
  private readonly shutColor = new THREE.Color(V.shutColor);
  private readonly floor: THREE.Mesh;
  private readonly cones: THREE.InstancedMesh;
  private readonly posts: THREE.InstancedMesh;
  private readonly boardsOpen: THREE.InstancedMesh;
  private readonly boardsShut: THREE.InstancedMesh;

  constructor(
    run: RunState,
    private readonly terrain: Terrain | null = null,
  ) {
    const coneGeo = this.keep(new THREE.ConeGeometry(V.coneRadius, V.coneHeight, V.coneSegments));
    coneGeo.translate(0, V.coneHeight / 2, 0);
    const postGeo = this.keep(new THREE.CylinderGeometry(V.postRadius, V.postRadius, V.postHeight, 8));
    postGeo.translate(0, V.postHeight / 2, 0);
    const boardGeo = this.keep(new THREE.PlaneGeometry(V.boardWidth, V.boardHeight));
    const drawn = run.exits.filter((e) => !e.closed);
    const capacity = Math.max(1, drawn.length);
    this.cones = new THREE.InstancedMesh(coneGeo, this.cone, capacity * V.cones);
    this.posts = new THREE.InstancedMesh(postGeo, this.post, capacity);
    this.boardsOpen = new THREE.InstancedMesh(boardGeo, this.boardOpen, capacity);
    this.boardsShut = new THREE.InstancedMesh(boardGeo, this.boardShut, capacity);
    this.cones.count = drawn.length * V.cones;
    this.posts.count = drawn.length;
    for (const m of [this.cones, this.posts]) m.castShadow = true;
    this.cones.name = 'exit-cones';
    this.posts.name = 'exit-posts';
    this.boardsOpen.name = 'exit-boards-open';
    this.boardsShut.name = 'exit-boards-shut';
    const floorParts: THREE.BufferGeometry[] = [];
    let vertices = 0;
    for (let i = 0; i < drawn.length; i++) {
      const parts = this.build(drawn[i]!, i);
      for (const g of parts.floor) floorParts.push(g);
      this.exits.push({ first: vertices, count: parts.vertices, board: parts.board, shownOpen: null });
      vertices += parts.vertices;
    }
    // No exits drawn (none in the run): an empty floor, which draws nothing.
    const floorGeo = this.keep(floorParts.length > 0 ? mergeGeometries(floorParts)! : new THREE.BufferGeometry());
    for (const g of floorParts) g.dispose();
    this.floor = new THREE.Mesh(floorGeo, this.floorMaterial);
    this.floor.name = 'exit-floor';
    this.floor.visible = vertices > 0;
    for (const m of [this.cones, this.posts]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    this.placeBoards();
    this.object.add(this.floor, this.cones, this.posts, this.boardsOpen, this.boardsShut);
    this.object.name = 'exits';
  }

  /** Repaints an exit when it opens (a late exit) and moves its board to the open draw; nothing is rebuilt per frame. */
  update(run: RunState): void {
    let i = 0;
    let changed = false;
    for (const e of run.exits) {
      if (e.closed) continue;
      const slot = this.exits[i++];
      if (!slot || slot.shownOpen === e.open) continue;
      slot.shownOpen = e.open;
      this.paint(slot, e.open);
      changed = true;
    }
    if (changed) this.placeBoards();
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of [this.floorMaterial, this.cone, this.post, this.boardOpen, this.boardShut]) m.dispose();
    for (const m of [this.cones, this.posts, this.boardsOpen, this.boardsShut]) m.dispose();
    this.openTexture.dispose();
    this.shutTexture.dispose();
    this.object.removeFromParent();
  }

  /** Colours an exit's ring and wash open or shut, keeping each vertex's alpha. */
  private paint(slot: ExitSlot, open: boolean): void {
    const colour = this.floor.geometry.getAttribute('color') as THREE.BufferAttribute;
    const c = open ? this.openColor : this.shutColor;
    for (let v = slot.first; v < slot.first + slot.count; v++) colour.setXYZ(v, c.r, c.g, c.b);
    colour.addUpdateRange(slot.first * RGBA, slot.count * RGBA);
    colour.needsUpdate = true;
  }

  /** Puts every exit's board in the open draw or the shut one by the state it shows (shut until first seen open). */
  private placeBoards(): void {
    let open = 0;
    let shut = 0;
    for (const slot of this.exits) {
      if (slot.shownOpen) this.boardsOpen.setMatrixAt(open++, slot.board);
      else this.boardsShut.setMatrixAt(shut++, slot.board);
    }
    for (const [m, count] of [[this.boardsOpen, open], [this.boardsShut, shut]] as const) {
      m.count = count;
      m.visible = count > 0;
      m.instanceMatrix.needsUpdate = true;
      if (count > 0) m.computeBoundingSphere();
    }
  }

  /** Puts instance `i` of `mesh` on the ground at (dx, dz) from exit `e`'s middle (world, as the instances' parent is). */
  private place(mesh: THREE.InstancedMesh, i: number, e: RunExit, dx: number, dz: number): void {
    PLACE.makeTranslation(e.position.x + dx, e.position.y + this.groundOffset(e, dx, dz), e.position.z + dz);
    mesh.setMatrixAt(i, PLACE);
  }

  /** How far the ground at (dx, dz) from the exit's middle is above the middle: 0 on a flat field. */
  private groundOffset(e: RunExit, dx: number, dz: number): number {
    if (!this.terrain) return 0;
    const h = terrainHeightAt(this.terrain, e.position.x + dx, e.position.z + dz);
    return h === undefined ? 0 : h - e.position.y;
  }

  /**
   * A flat piece of the floor (in the exit's frame) laid onto the ground under it, `lift` over it, moved to the exit
   * and coloured shut with `alpha`: ready to merge (positions and colours only).
   */
  private floorPiece(g: THREE.BufferGeometry, e: RunExit, lift: number, alpha: number): THREE.BufferGeometry {
    const piece = g.index ? g.toNonIndexed() : g;
    if (piece !== g) g.dispose();
    piece.deleteAttribute('uv');
    piece.deleteAttribute('normal');
    const p = piece.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + this.groundOffset(e, p.getX(i), p.getZ(i)) + lift);
    piece.translate(e.position.x, e.position.y, e.position.z);
    const colours = new Float32Array(p.count * RGBA);
    for (let i = 0; i < p.count; i++) colours.set([this.shutColor.r, this.shutColor.g, this.shutColor.b, alpha], i * RGBA);
    piece.setAttribute('color', new THREE.BufferAttribute(colours, RGBA));
    return piece;
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  /**
   * Builds exit `e`, the `index`th drawn: its cones' and post's instances, its ring and wash as floor pieces (and their
   * vertex count), and where its board hangs.
   */
  private build(e: RunExit, index: number): { floor: THREE.BufferGeometry[]; vertices: number; board: THREE.Matrix4 } {
    const ring = this.floorPiece(new THREE.RingGeometry(e.radius - V.ringWidth, e.radius, V.ringSegments).rotateX(-Math.PI / 2), e, V.ringLift, V.ringOpacity);
    const fill = this.floorPiece(new THREE.CircleGeometry(e.radius - V.ringWidth, V.ringSegments).rotateX(-Math.PI / 2), e, V.ringLift * 0.5, V.fillOpacity);
    for (let i = 0; i < V.cones; i++) {
      const a = (i / V.cones) * Math.PI * 2;
      const dx = Math.cos(a) * e.radius;
      const dz = Math.sin(a) * e.radius;
      this.place(this.cones, index * V.cones + i, e, dx, dz);
    }
    // The sign stands at the ring's edge on the side nearest the middle of the field, so it faces whoever comes.
    const toMiddle = Math.atan2(-e.position.x, -e.position.z);
    const px = Math.sin(toMiddle) * e.radius;
    const pz = Math.cos(toMiddle) * e.radius;
    this.place(this.posts, index, e, px, pz);
    const board = new THREE.Matrix4()
      .makeRotationY(toMiddle)
      .setPosition(e.position.x + px, e.position.y + this.groundOffset(e, px, pz) + V.postHeight - V.boardHeight / 2, e.position.z + pz);
    const vertices = ring.getAttribute('position').count + fill.getAttribute('position').count;
    return { floor: [ring, fill], vertices, board };
  }
}
