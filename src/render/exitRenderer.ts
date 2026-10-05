import * as THREE from 'three';
import { EXIT_VISUALS } from '../config/render';
import { cssColor, TEAM_COLOUR_SETS } from '../config/teams';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import type { RunExit, RunState } from '../sim/extraction';

const V = EXIT_VISUALS;
/** Scratch for an instance's matrix while the exits are built. */
const PLACE = new THREE.Matrix4();

/** One exit's meshes, and whether they were last drawn open. */
interface ExitMeshes {
  group: THREE.Group;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  board: THREE.Mesh;
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
 * on a post, in the team colour set's exit colour while open and grey while a late exit is still shut; exits closed for
 * the run aren't drawn. Built once from the run's exits; each frame only swaps materials when an exit opens. Reads the
 * run state only. On a field with terrain (M48: Woodland) the ring, its wash, the cones and the post follow the
 * ground, so a slope buries none of them.
 */
export class ExitRenderer {
  readonly object = new THREE.Group();
  private readonly exits: ExitMeshes[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly ringOpen: THREE.MeshBasicMaterial;
  private readonly ringShut = new THREE.MeshBasicMaterial({ color: V.shutColor, transparent: true, opacity: V.ringOpacity, depthWrite: false, side: THREE.DoubleSide });
  private readonly fillOpen: THREE.MeshBasicMaterial;
  private readonly fillShut = new THREE.MeshBasicMaterial({ color: V.shutColor, transparent: true, opacity: V.fillOpacity, depthWrite: false, side: THREE.DoubleSide });
  private readonly cone = new THREE.MeshStandardMaterial({ color: V.coneColor, roughness: 0.7 });
  private readonly post = new THREE.MeshStandardMaterial({ color: V.postColor, roughness: 0.6 });
  private readonly openTexture: THREE.CanvasTexture;
  private readonly shutTexture = drawBoard(V.shutText, V.shutColor);
  private readonly boardOpen: THREE.MeshStandardMaterial;
  private readonly boardShut = new THREE.MeshStandardMaterial({ map: this.shutTexture, roughness: 0.8, side: THREE.DoubleSide });
  private readonly cones: THREE.InstancedMesh;
  private readonly posts: THREE.InstancedMesh;

  constructor(
    run: RunState,
    private readonly terrain: Terrain | null = null,
    /** The open exits' colour: the picked team colour set's (teams.ts `exit`, M68, audit UI-15). */
    openColor: number = TEAM_COLOUR_SETS.standard.exit,
  ) {
    // The open look takes the colour set's exit colour, so these four are made here rather than where they are declared.
    this.ringOpen = new THREE.MeshBasicMaterial({ color: openColor, transparent: true, opacity: V.ringOpacity, depthWrite: false, side: THREE.DoubleSide });
    this.fillOpen = new THREE.MeshBasicMaterial({ color: openColor, transparent: true, opacity: V.fillOpacity, depthWrite: false, side: THREE.DoubleSide });
    this.openTexture = drawBoard(V.openText, openColor);
    this.boardOpen = new THREE.MeshStandardMaterial({ map: this.openTexture, roughness: 0.8, side: THREE.DoubleSide });
    const coneGeo = this.keep(new THREE.ConeGeometry(V.coneRadius, V.coneHeight, V.coneSegments));
    coneGeo.translate(0, V.coneHeight / 2, 0);
    const postGeo = this.keep(new THREE.CylinderGeometry(V.postRadius, V.postRadius, V.postHeight, 8));
    postGeo.translate(0, V.postHeight / 2, 0);
    const boardGeo = this.keep(new THREE.PlaneGeometry(V.boardWidth, V.boardHeight));
    // Every exit's cones in one instanced draw and every post in another (M48: on Woodland's Medium, a mesh each cost
    // about forty draws with their shadows, past the budget).
    const drawn = run.exits.filter((e) => !e.closed);
    this.cones = new THREE.InstancedMesh(coneGeo, this.cone, Math.max(1, drawn.length * V.cones));
    this.posts = new THREE.InstancedMesh(postGeo, this.post, Math.max(1, drawn.length));
    this.cones.count = drawn.length * V.cones;
    this.posts.count = drawn.length;
    for (const m of [this.cones, this.posts]) m.castShadow = true;
    this.cones.name = 'exit-cones';
    this.posts.name = 'exit-posts';
    for (let i = 0; i < drawn.length; i++) this.exits.push(this.build(drawn[i]!, i, boardGeo));
    for (const m of [this.cones, this.posts]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    this.object.add(this.cones, this.posts);
    this.object.name = 'exits';
  }

  /** Swaps an exit's look when it opens (a late exit), so nothing is rebuilt per frame. */
  update(run: RunState): void {
    let i = 0;
    for (const e of run.exits) {
      if (e.closed) continue;
      const m = this.exits[i++];
      if (!m || m.shownOpen === e.open) continue;
      m.shownOpen = e.open;
      m.ring.material = e.open ? this.ringOpen : this.ringShut;
      m.fill.material = e.open ? this.fillOpen : this.fillShut;
      m.board.material = e.open ? this.boardOpen : this.boardShut;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of [this.ringOpen, this.ringShut, this.fillOpen, this.fillShut, this.cone, this.post, this.boardOpen, this.boardShut]) m.dispose();
    this.cones.dispose();
    this.posts.dispose();
    this.openTexture.dispose();
    this.shutTexture.dispose();
    this.object.removeFromParent();
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

  /** Lays a flat geometry (in the exit's frame) onto the ground under it, once, as it is built. */
  private drape(g: THREE.BufferGeometry, e: RunExit): void {
    if (!this.terrain) return;
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + this.groundOffset(e, p.getX(i), p.getZ(i)));
    p.needsUpdate = true;
    g.computeVertexNormals();
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  /** Builds exit `e`, the `index`th drawn: its own ring, wash and board, and its cones' and post's instances. */
  private build(e: RunExit, index: number, boardGeo: THREE.BufferGeometry): ExitMeshes {
    const group = new THREE.Group();
    group.position.set(e.position.x, e.position.y, e.position.z);
    const ringGeo = this.keep(new THREE.RingGeometry(e.radius - V.ringWidth, e.radius, V.ringSegments));
    ringGeo.rotateX(-Math.PI / 2);
    this.drape(ringGeo, e);
    const ring = new THREE.Mesh(ringGeo, this.ringShut);
    ring.position.y = V.ringLift;
    const fillGeo = this.keep(new THREE.CircleGeometry(e.radius - V.ringWidth, V.ringSegments));
    fillGeo.rotateX(-Math.PI / 2);
    this.drape(fillGeo, e);
    const fill = new THREE.Mesh(fillGeo, this.fillShut);
    fill.position.y = V.ringLift * 0.5;
    group.add(ring, fill);
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
    const board = new THREE.Mesh(boardGeo, this.boardShut);
    board.position.set(px, this.groundOffset(e, px, pz) + V.postHeight - V.boardHeight / 2, pz);
    board.rotation.y = toMiddle;
    group.add(board);
    this.object.add(group);
    return { group, ring, fill, board, shownOpen: null };
  }
}
