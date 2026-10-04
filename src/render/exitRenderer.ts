import * as THREE from 'three';
import { EXIT_VISUALS } from '../config/render';
import type { RunExit, RunState } from '../sim/extraction';

const V = EXIT_VISUALS;

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
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
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
 * once from the run's exits; each frame only swaps materials when an exit opens. Reads the run state only.
 */
export class ExitRenderer {
  readonly object = new THREE.Group();
  private readonly exits: ExitMeshes[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly ringOpen = new THREE.MeshBasicMaterial({ color: V.openColor, transparent: true, opacity: V.ringOpacity, depthWrite: false, side: THREE.DoubleSide });
  private readonly ringShut = new THREE.MeshBasicMaterial({ color: V.shutColor, transparent: true, opacity: V.ringOpacity, depthWrite: false, side: THREE.DoubleSide });
  private readonly fillOpen = new THREE.MeshBasicMaterial({ color: V.openColor, transparent: true, opacity: V.fillOpacity, depthWrite: false, side: THREE.DoubleSide });
  private readonly fillShut = new THREE.MeshBasicMaterial({ color: V.shutColor, transparent: true, opacity: V.fillOpacity, depthWrite: false, side: THREE.DoubleSide });
  private readonly cone = new THREE.MeshStandardMaterial({ color: V.coneColor, roughness: 0.7 });
  private readonly post = new THREE.MeshStandardMaterial({ color: V.postColor, roughness: 0.6 });
  private readonly openTexture = drawBoard(V.openText, V.openColor);
  private readonly shutTexture = drawBoard(V.shutText, V.shutColor);
  private readonly boardOpen = new THREE.MeshStandardMaterial({ map: this.openTexture, roughness: 0.8, side: THREE.DoubleSide });
  private readonly boardShut = new THREE.MeshStandardMaterial({ map: this.shutTexture, roughness: 0.8, side: THREE.DoubleSide });

  constructor(run: RunState) {
    const coneGeo = this.keep(new THREE.ConeGeometry(V.coneRadius, V.coneHeight, V.coneSegments));
    coneGeo.translate(0, V.coneHeight / 2, 0);
    const postGeo = this.keep(new THREE.CylinderGeometry(V.postRadius, V.postRadius, V.postHeight, 8));
    postGeo.translate(0, V.postHeight / 2, 0);
    const boardGeo = this.keep(new THREE.PlaneGeometry(V.boardWidth, V.boardHeight));
    for (const e of run.exits) {
      if (e.closed) continue;
      this.exits.push(this.build(e, coneGeo, postGeo, boardGeo));
    }
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
    this.openTexture.dispose();
    this.shutTexture.dispose();
    this.object.removeFromParent();
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private build(e: RunExit, coneGeo: THREE.BufferGeometry, postGeo: THREE.BufferGeometry, boardGeo: THREE.BufferGeometry): ExitMeshes {
    const group = new THREE.Group();
    group.position.set(e.position.x, e.position.y, e.position.z);
    const ringGeo = this.keep(new THREE.RingGeometry(e.radius - V.ringWidth, e.radius, V.ringSegments));
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, this.ringShut);
    ring.position.y = V.ringLift;
    const fillGeo = this.keep(new THREE.CircleGeometry(e.radius - V.ringWidth, V.ringSegments));
    fillGeo.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(fillGeo, this.fillShut);
    fill.position.y = V.ringLift * 0.5;
    group.add(ring, fill);
    for (let i = 0; i < V.cones; i++) {
      const a = (i / V.cones) * Math.PI * 2;
      const cone = new THREE.Mesh(coneGeo, this.cone);
      cone.position.set(Math.cos(a) * e.radius, 0, Math.sin(a) * e.radius);
      cone.castShadow = true;
      group.add(cone);
    }
    // The sign stands at the ring's edge on the side nearest the middle of the field, so it faces whoever comes.
    const toMiddle = Math.atan2(-e.position.x, -e.position.z);
    const post = new THREE.Mesh(postGeo, this.post);
    post.position.set(Math.sin(toMiddle) * e.radius, 0, Math.cos(toMiddle) * e.radius);
    post.castShadow = true;
    const board = new THREE.Mesh(boardGeo, this.boardShut);
    board.position.set(post.position.x, V.postHeight - V.boardHeight / 2, post.position.z);
    board.rotation.y = toMiddle;
    group.add(post, board);
    this.object.add(group);
    return { group, ring, fill, board, shownOpen: null };
  }
}
