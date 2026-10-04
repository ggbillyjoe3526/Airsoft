import * as THREE from 'three';
import { FLAG_VISUALS } from '../config/render';
import type { RoundState } from '../sim/round';

const F = FLAG_VISUALS;

/**
 * Flag mode's pole: a pole on a weighted base, the attackers' flag (their team colour) at the height
 * the simulation says, rippling, and a painted ring on the floor at the rope's reach, coloured by who
 * is working the rope. Hidden in elimination. Reads round state only.
 */
export class FlagRenderer {
  readonly object = new THREE.Group();
  /** World point just above the pole, for the screen marker (valid while visible). */
  readonly markerAnchor = new THREE.Vector3();
  private readonly cloth: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  /** The cloth's flat vertex x positions (its ripple is computed from them every frame). */
  private readonly clothX: Float32Array;

  constructor(
    private readonly teamColors: readonly number[],
    ropeRadius: number,
  ) {
    const poleMat = this.track(new THREE.MeshStandardMaterial({ color: F.poleColor, roughness: F.poleRoughness, metalness: F.poleMetalness }));
    const pole = new THREE.Mesh(this.track(new THREE.CylinderGeometry(F.poleRadius, F.poleRadius, F.poleHeight, F.poleSegments)), poleMat);
    pole.position.y = F.poleHeight / 2;
    pole.castShadow = true;
    const base = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(F.baseTopRadius, F.baseRadius, F.baseHeight, F.baseSegments)),
      this.track(new THREE.MeshStandardMaterial({ color: F.baseColor, roughness: F.baseRoughness })),
    );
    base.position.y = F.baseHeight / 2;
    base.castShadow = true;
    base.receiveShadow = true;

    // The cloth hangs from the pole: its left edge on the pole, its bottom edge at y = 0 of the mesh.
    const clothGeo = this.track(new THREE.PlaneGeometry(F.clothWidth, F.clothHeight, F.clothSegments, 1));
    clothGeo.translate(F.clothWidth / 2 + F.poleRadius, F.clothHeight / 2, 0);
    this.clothX = Float32Array.from({ length: clothGeo.attributes.position!.count }, (_, i) => clothGeo.attributes.position!.getX(i));
    this.cloth = new THREE.Mesh(clothGeo, this.track(new THREE.MeshStandardMaterial({ roughness: F.clothRoughness, side: THREE.DoubleSide })));
    this.cloth.castShadow = true;

    const ringGeo = this.track(new THREE.RingGeometry(ropeRadius - F.ringWidth, ropeRadius, F.ringSegments));
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, this.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: F.ringOpacity, depthWrite: false })));
    this.ring.position.y = F.ringLift;

    this.object.add(pole, base, this.cloth, this.ring);
    this.object.visible = false;
  }

  /** Once per frame. `time` (s) drives the ripple. */
  update(round: RoundState, time: number): void {
    const show = round.mode === 'attackDefend' && round.attackers >= 0;
    this.object.visible = show;
    if (!show) return;
    const flag = round.flag;
    this.object.position.set(flag.position.x, flag.position.y, flag.position.z);
    this.markerAnchor.set(flag.position.x, flag.position.y + F.markerHeight, flag.position.z);
    this.cloth.position.y = F.clothLowest + (F.clothHighest - F.clothLowest) * flag.progress;
    this.cloth.material.color.setHex(this.teamColors[round.attackers]!);
    // Between rounds nobody works the rope any more: the ring goes back to neutral.
    const status = round.phase === 'live' ? flag.status : 'idle';
    const ringColor =
      status === 'raising'
        ? this.teamColors[round.attackers]!
        : status === 'lowering'
          ? this.teamColors[1 - round.attackers]!
          : status === 'contested'
            ? F.ringContestedColor
            : F.ringColor;
    this.ring.material.color.setHex(ringColor);

    // Ripple: a travelling wave, growing from nothing at the pole to full at the free edge. The normals follow the
    // wave's slope (M14), so the folds catch the sun.
    const pos = this.cloth.geometry.attributes.position!;
    const normal = this.cloth.geometry.attributes.normal!;
    const k = F.waveAmplitude / F.clothWidth;
    for (let i = 0; i < pos.count; i++) {
      const x = this.clothX[i]!;
      const phase = x * F.waveNumber - time * F.waveSpeed;
      pos.setZ(i, Math.sin(phase) * k * x);
      const slope = k * (Math.sin(phase) + x * F.waveNumber * Math.cos(phase));
      const inv = 1 / Math.hypot(slope, 1);
      normal.setXYZ(i, -slope * inv, 0, inv);
    }
    pos.needsUpdate = true;
    normal.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.object.removeFromParent();
  }

  private track<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T {
    if (resource instanceof THREE.Material) this.materials.push(resource);
    else this.geometries.push(resource);
    return resource;
  }
}
