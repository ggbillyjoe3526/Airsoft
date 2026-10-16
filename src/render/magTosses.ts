import * as THREE from 'three';
import { MAG_SHARE } from '../config/magShare';
import type { Character } from '../sim/character';
import { catchPoint, type MagShareWorld, type MagToss } from '../sim/magShare';
import { vec3 } from '../sim/vec';

/**
 * A tossed magazine's height over the straight line at `u` (0 to 1) of a toss `metres` long: a parabola peaking at the
 * middle, higher the longer the toss (MAG_SHARE.arcPerMetre, up to arcHeight).
 */
export function tossArc(u: number, metres: number): number {
  return 4 * Math.min(MAG_SHARE.arcHeight, MAG_SHARE.arcPerMetre * metres) * u * (1 - u);
}

/**
 * The magazines in the air (MG1, GameState.magTosses): each a small box, a rifle's or a pistol's by where it came from,
 * on an arc from the thrower's hand to the catcher's chest wherever the catcher is now, turning end over end. One mesh
 * per slot of the state's tosses, made once; two shared boxes and one material. Code-made, so no model switch hides it.
 */
export class MagTossRenderer {
  readonly object = new THREE.Group();
  private readonly meshes: THREE.Mesh[];
  private readonly rifle: THREE.BoxGeometry;
  private readonly pistol: THREE.BoxGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly to = vec3();

  constructor(
    private readonly tosses: readonly MagToss[],
    private readonly characters: readonly Character[],
    private readonly world: MagShareWorld,
    /** A simulation tick (s): `alpha` of one moves a magazine on by a tick's flight. */
    private readonly tickSeconds: number,
  ) {
    const L = MAG_SHARE.look;
    this.rifle = new THREE.BoxGeometry(...L.rifle);
    this.pistol = new THREE.BoxGeometry(...L.pistol);
    this.material = new THREE.MeshStandardMaterial({ color: L.colour, roughness: L.roughness });
    this.meshes = tosses.map(() => {
      const m = new THREE.Mesh(this.rifle, this.material);
      m.visible = false;
      m.frustumCulled = false;
      this.object.add(m);
      return m;
    });
  }

  /** Once a frame, `alpha` of the way through the tick: each magazine in the air where its flight has it. */
  update(alpha: number): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const t = this.tosses[i]!;
      const m = this.meshes[i]!;
      const r = t.active ? this.characters[t.toId] : undefined;
      if (!t.active || !r || r.id !== t.toId || t.flight <= 0) {
        m.visible = false;
        continue;
      }
      const u = Math.min(1, (t.age + alpha * this.tickSeconds) / t.flight);
      catchPoint(r, this.world, this.to);
      m.geometry = this.rifleMag(t) ? this.rifle : this.pistol;
      const dx = this.to.x - t.from.x;
      const dz = this.to.z - t.from.z;
      m.position.set(t.from.x + dx * u, t.from.y + (this.to.y - t.from.y) * u + tossArc(u, Math.sqrt(dx * dx + dz * dz)), t.from.z + dz * u);
      // End over end along its flight, and turned to face the way it goes.
      m.rotation.set(u * t.flight * MAG_SHARE.spin * Math.PI * 2, Math.atan2(dx, dz), 0, 'YXZ');
      m.visible = true;
    }
  }

  /** What the warm-up shows to compile ahead (KI1): one magazine (both boxes share the material), none without slots. */
  warmTargets(): THREE.Object3D[] {
    return this.meshes.slice(0, 1);
  }

  /** Whether `t` came out of a rifle's pouch (the class of the thrower's replica it was tossed from); else a pistol's. */
  private rifleMag(t: MagToss): boolean {
    const from = this.characters[t.fromId];
    if (!from || from.id !== t.fromId) return true;
    for (const r of from.armament.replicas) if (r.id === t.replicaId) return r.siteClass !== 'pistol';
    return true;
  }

  dispose(): void {
    this.rifle.dispose();
    this.pistol.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
