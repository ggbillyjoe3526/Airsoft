import * as THREE from 'three';
import { CASE_VISUALS } from '../config/render';
import { DROPPED_CASE, type RunCase, type RunState } from '../sim/extraction';

const V = CASE_VISUALS;
type CaseLook = (typeof V.kinds)[keyof typeof V.kinds];

/** One kind's shared geometries and materials. */
interface KindParts {
  look: CaseLook;
  body: THREE.BufferGeometry;
  lid: THREE.BufferGeometry;
  band: THREE.BufferGeometry;
  bodyMaterial: THREE.Material;
  topMaterial: THREE.Material;
  bandMaterial: THREE.Material;
}

/** One case's meshes: its lid or door turns on `hinge`. */
interface CaseMeshes {
  group: THREE.Group;
  hinge: THREE.Group;
  opens: 'lid' | 'door';
  shownOpen: boolean | null;
}

/**
 * Extraction's cases in the world (M44): an ammo can, a field case or the marshal's locker on each case spot the run
 * uses, and the case you dropped when hit, in your team's colour. Opened, a lid swings up (the locker's door out) and
 * stays open; your dropped case goes once you've picked it up. Each kind's geometry and materials are shared and built
 * once; a dropped case's meshes are built the frame it appears, and nothing else is built per frame. Reads the run
 * state only.
 */
export class CaseRenderer {
  readonly object = new THREE.Group();
  private readonly kinds = new Map<string, KindParts>();
  private readonly cases: CaseMeshes[] = [];

  constructor(
    run: RunState,
    /** Your team's colour (the dropped case's band). */
    private readonly teamColor: number,
  ) {
    this.object.name = 'cases';
    this.update(run);
  }

  /** Builds any case new since the last frame (one you dropped), and swings open what was opened. */
  update(run: RunState): void {
    while (this.cases.length < run.cases.length) this.cases.push(this.build(run.cases[this.cases.length]!));
    for (let i = 0; i < this.cases.length; i++) {
      const k = run.cases[i]!;
      const m = this.cases[i]!;
      if (m.shownOpen === k.open) continue;
      m.shownOpen = k.open;
      // What you dropped is gone once picked up; a site case stays where it is, open and empty.
      if (k.dropped) m.group.visible = !k.open;
      else if (m.opens === 'door') m.hinge.rotation.y = k.open ? V.doorOpenAngle : 0;
      else m.hinge.rotation.x = k.open ? V.lidOpenAngle : 0;
    }
  }

  dispose(): void {
    for (const p of this.kinds.values()) {
      for (const g of [p.body, p.lid, p.band]) g.dispose();
      for (const m of [p.bodyMaterial, p.topMaterial, p.bandMaterial]) m.dispose();
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
    // The body stands on the floor; the lid sits on top of it (a door: a plate over its front).
    const body = new THREE.BoxGeometry(w, door ? h : h - look.lid, d);
    const lid = door ? new THREE.BoxGeometry(w, h, look.lid) : new THREE.BoxGeometry(w, look.lid, d);
    const band = new THREE.BoxGeometry(w * 1.02, look.bandHeight, d * 1.02);
    const material = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: V.roughness });
    const parts: KindParts = {
      look,
      body,
      lid,
      band,
      bodyMaterial: material(look.body),
      topMaterial: material(look.top),
      bandMaterial: material(key === DROPPED_CASE ? this.teamColor : look.band),
    };
    this.kinds.set(key, parts);
    return parts;
  }

  /**
   * A case's group at its spot, its front along the spot's facing (forward is (-sin yaw, -cos yaw), local -z). A lid
   * hinges on the body's back top edge (+z); the locker's door on its front left edge.
   */
  private build(k: RunCase): CaseMeshes {
    const p = this.parts(k.kind);
    const [w, h, d] = p.look.size;
    const group = new THREE.Group();
    group.position.set(k.position.x, k.position.y, k.position.z);
    group.rotation.y = k.yaw;
    const door = p.look.opens === 'door';
    const bodyHeight = door ? h : h - p.look.lid;
    const body = new THREE.Mesh(p.body, p.bodyMaterial);
    body.position.y = bodyHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    const band = new THREE.Mesh(p.band, p.bandMaterial);
    band.position.y = bodyHeight * V.bandAt;
    const hinge = new THREE.Group();
    const lid = new THREE.Mesh(p.lid, p.topMaterial);
    lid.castShadow = true;
    if (door) {
      hinge.position.set(-w / 2, 0, -d / 2);
      lid.position.set(w / 2, h / 2, -p.look.lid / 2);
    } else {
      hinge.position.set(0, bodyHeight, d / 2);
      lid.position.set(0, p.look.lid / 2, -d / 2);
    }
    hinge.add(lid);
    group.add(body, band, hinge);
    this.object.add(group);
    return { group, hinge, opens: p.look.opens, shownOpen: null };
  }
}
