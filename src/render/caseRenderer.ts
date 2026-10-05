import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CASE_VISUALS } from '../config/render';
import { DROPPED_CASE, type RunCase, type RunState } from '../sim/extraction';

const V = CASE_VISUALS;
type CaseLook = (typeof V.kinds)[keyof typeof V.kinds];

/** One kind's shared geometries and materials: the body carries its band in vertex colours (one draw for both). */
interface KindParts {
  look: CaseLook;
  body: THREE.BufferGeometry;
  lid: THREE.BufferGeometry;
  bodyMaterial: THREE.Material;
  topMaterial: THREE.Material;
}

/** A dropped case's meshes (built the frame it appears). */
interface DroppedMeshes {
  group: THREE.Group;
}

/** A site case: which kind's instances hold it, at which index, and how its lid's matrix is made. */
interface SiteCase {
  kind: KindInstances;
  index: number;
  /** Where the case stands (its group's matrix) and where its hinge sits in it. */
  place: THREE.Matrix4;
  hingeAt: THREE.Vector3;
  opens: 'lid' | 'door';
  shownOpen: boolean | null;
}

/** One kind's instanced bodies and lids (or doors), one draw each for every case of the kind in the run. */
interface KindInstances {
  bodies: THREE.InstancedMesh;
  lids: THREE.InstancedMesh;
}

/**
 * Extraction's cases in the world (M44): an ammo can, a field case or the marshal's locker on each case spot the run
 * uses, and the case you dropped when hit, in your team's colour. Opened, a lid swings up (the locker's door out) and
 * stays open; your dropped case goes once you've picked it up. Each kind's geometry and materials are shared and built
 * once. The run's site cases are drawn instanced, two draws a kind whatever the number of cases (M48: on Woodland's
 * Medium two draws a case, with their shadows, pushed the scene past its budget); an instance's matrix is set once and
 * a lid's again only when it opens. A dropped case is two plain meshes built the frame it appears. Nothing else is built
 * per frame. Reads the run state only.
 */
export class CaseRenderer {
  readonly object = new THREE.Group();
  private readonly kinds = new Map<string, KindParts>();
  private readonly instances: KindInstances[] = [];
  private readonly site: SiteCase[] = [];
  private readonly dropped: (DroppedMeshes | null)[] = [];

  constructor(
    run: RunState,
    /** Your team's colour (the dropped case's band). */
    private readonly teamColor: number,
  ) {
    this.object.name = 'cases';
    this.buildSite(run.cases);
    this.update(run);
  }

  /** Builds any case new since the last frame (one you dropped), and swings open what was opened. */
  update(run: RunState): void {
    for (let i = 0; i < run.cases.length; i++) {
      const k = run.cases[i]!;
      const s = this.site[i];
      if (s) {
        if (s.shownOpen === k.open) continue;
        s.shownOpen = k.open;
        s.kind.lids.setMatrixAt(s.index, lidMatrix(s, k.open));
        s.kind.lids.instanceMatrix.needsUpdate = true;
        continue;
      }
      // What you dropped is gone once picked up.
      let m = this.dropped[i];
      if (m === undefined) {
        m = k.dropped ? this.buildDropped(k) : null;
        this.dropped[i] = m;
      }
      if (m) m.group.visible = !k.open;
    }
  }

  dispose(): void {
    for (const p of this.kinds.values()) {
      for (const g of [p.body, p.lid]) g.dispose();
      for (const m of [p.bodyMaterial, p.topMaterial]) m.dispose();
    }
    for (const k of this.instances) {
      k.bodies.dispose();
      k.lids.dispose();
    }
    this.object.removeFromParent();
  }

  private parts(kind: string): KindParts {
    const key = kind in V.kinds ? (kind as keyof typeof V.kinds) : 'field-case';
    const known = this.kinds.get(key);
    if (known) return known;
    const look = V.kinds[key];
    const [w, h, d] = look.size;
    const door = look.opens === 'door';
    // The body stands on the floor, its band painted round it; the lid sits on top (a door: a plate over its front).
    const bodyHeight = door ? h : h - look.lid;
    const body = mergeGeometries([
      painted(new THREE.BoxGeometry(w, bodyHeight, d), look.body),
      painted(new THREE.BoxGeometry(w * 1.02, look.bandHeight, d * 1.02).translate(0, bodyHeight * V.bandAt - bodyHeight / 2, 0), key === DROPPED_CASE ? this.teamColor : look.band),
    ])!;
    // Both stand on their own origin (the body's foot, the lid's hinge edge), so an instance's matrix is a case's place.
    body.translate(0, bodyHeight / 2, 0);
    const lid = door ? new THREE.BoxGeometry(w, h, look.lid).translate(w / 2, h / 2, -look.lid / 2) : new THREE.BoxGeometry(w, look.lid, d).translate(0, look.lid / 2, -d / 2);
    const parts: KindParts = {
      look,
      body,
      lid,
      bodyMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: V.roughness }),
      topMaterial: new THREE.MeshStandardMaterial({ color: look.top, roughness: V.roughness }),
    };
    this.kinds.set(key, parts);
    return parts;
  }

  /**
   * Where a case's hinge sits on its body (local, the front along -z): a lid hinges on the body's back top edge (+z);
   * the locker's door on its front left edge.
   */
  private hingeOf(p: KindParts): THREE.Vector3 {
    const [w, h, d] = p.look.size;
    return p.look.opens === 'door' ? new THREE.Vector3(-w / 2, 0, -d / 2) : new THREE.Vector3(0, h - p.look.lid, d / 2);
  }

  /** The run's site cases, instanced per kind: each at its spot, its front along the spot's facing (-sin yaw, -cos yaw). */
  private buildSite(cases: readonly RunCase[]): void {
    const byKind = new Map<string, RunCase[]>();
    for (const k of cases) if (!k.dropped) byKind.set(k.kind, [...(byKind.get(k.kind) ?? []), k]);
    const at = new Map<RunCase, SiteCase>();
    for (const [kind, list] of byKind) {
      const p = this.parts(kind);
      const door = p.look.opens === 'door';
      const k: KindInstances = { bodies: new THREE.InstancedMesh(p.body, p.bodyMaterial, list.length), lids: new THREE.InstancedMesh(p.lid, p.topMaterial, list.length) };
      k.bodies.castShadow = true;
      k.bodies.receiveShadow = true;
      // A lid lies on its body's shadow; the locker's door stands on its own.
      k.lids.castShadow = door;
      k.bodies.name = `case-bodies-${kind}`;
      k.lids.name = `case-lids-${kind}`;
      list.forEach((c, index) => {
        const place = new THREE.Matrix4().compose(new THREE.Vector3(c.position.x, c.position.y, c.position.z), new THREE.Quaternion().setFromAxisAngle(UP, c.yaw), ONE);
        k.bodies.setMatrixAt(index, place);
        const s: SiteCase = { kind: k, index, place, hingeAt: this.hingeOf(p), opens: p.look.opens, shownOpen: null };
        k.lids.setMatrixAt(index, lidMatrix(s, false));
        at.set(c, s);
      });
      for (const m of [k.bodies, k.lids]) m.computeBoundingSphere();
      this.instances.push(k);
      this.object.add(k.bodies, k.lids);
    }
    for (const c of cases) this.site.push(at.get(c)!);
  }

  /** A case you dropped: its body and lid as two meshes, composed once (it never opens, it goes once picked up). */
  private buildDropped(k: RunCase): DroppedMeshes {
    const p = this.parts(k.kind);
    const group = new THREE.Group();
    group.position.set(k.position.x, k.position.y, k.position.z);
    group.rotation.y = k.yaw;
    const body = new THREE.Mesh(p.body, p.bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    const lid = new THREE.Mesh(p.lid, p.topMaterial);
    lid.position.copy(this.hingeOf(p));
    group.add(body, lid);
    for (const o of [group, body, lid]) {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    }
    this.object.add(group);
    return { group };
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const SIDE = new THREE.Vector3(1, 0, 0);
/** Scratch for a lid's matrix as a case opens (once a case). */
const LID = new THREE.Matrix4();
const HINGE = new THREE.Matrix4();
const TURN = new THREE.Quaternion();

/** A site case's lid matrix: its place, then its hinge, turned open (a door about y, a lid about x) or shut. */
function lidMatrix(s: SiteCase, open: boolean): THREE.Matrix4 {
  if (s.opens === 'door') TURN.setFromAxisAngle(UP, open ? V.doorOpenAngle : 0);
  else TURN.setFromAxisAngle(SIDE, open ? V.lidOpenAngle : 0);
  HINGE.compose(s.hingeAt, TURN, ONE);
  return LID.multiplyMatrices(s.place, HINGE);
}

/** `geometry` with every vertex in one colour (for a vertex-coloured material), indexless so it merges with others. */
function painted(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  const c = new THREE.Color(color);
  const n = flat.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}
