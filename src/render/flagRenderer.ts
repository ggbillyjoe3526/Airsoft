import * as THREE from 'three';
import { FLAG_VISUALS } from '../config/render';
import type { RoundState } from '../sim/round';

const F = FLAG_VISUALS;
const FD = F.detail;

/**
 * The cloth's ripple at a point `x` metres out from the pole's axis (the flat cloth's x) at `time`: a travelling wave
 * growing from the pole to the free edge as (x / width)^power (1: the plain cloth's straight growth; more damps it
 * near the pole). Writes the sideways offset and its slope along the cloth into `out`. Pure and allocation-free.
 */
export function clothRipple(x: number, time: number, power: number, out: { z: number; slope: number }): { z: number; slope: number } {
  const phase = x * F.waveNumber - time * F.waveSpeed;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const share = Math.max(0, x / F.clothWidth);
  const grow = Math.pow(share, power);
  out.z = F.waveAmplitude * s * grow;
  out.slope = F.waveAmplitude * (grow * F.waveNumber * c + (share > 0 ? (s * power * grow) / (share * F.clothWidth) : 0));
  return out;
}

/** The site's flag (map detail): a BB roundel between two stripes, white where the team colour shows (it tints it). */
function drawFlagDesign(): THREE.CanvasTexture {
  const d = FD.design;
  const canvas = document.createElement('canvas');
  canvas.width = d.width;
  canvas.height = d.height;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, d.width, d.height);
    g.fillStyle = d.stripe;
    g.fillRect(0, d.height * 0.1, d.width, d.height * 0.12);
    g.fillRect(0, d.height * 0.78, d.width, d.height * 0.12);
    const cx = d.width * 0.55;
    const cy = d.height / 2;
    const r = d.height * 0.24;
    g.fillStyle = d.ring;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = d.roundel;
    g.beginPath();
    g.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = d.bb;
    g.beginPath();
    g.arc(cx, cy, r * 0.36, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A cloth hanging from the pole: its left edge on the pole, its bottom edge at y = 0 of the mesh. */
function clothGeometry(along: number, down: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(F.clothWidth, F.clothHeight, along, down);
  geo.translate(F.clothWidth / 2 + F.poleRadius, F.clothHeight / 2, 0);
  return geo;
}

/** The detailed cloth's hem: a darker band round its top, bottom and free edge (vertex colours). */
function paintHem(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - F.poleRadius) / F.clothWidth;
    const y = pos.getY(i) / F.clothHeight;
    const hem = y < FD.hem || y > 1 - FD.hem || x > 1 - FD.hem;
    colours.fill(hem ? FD.hemShade : 1, i * 3, i * 3 + 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

interface Cloth {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  /** The flat vertex x positions (its ripple is computed from them every frame). */
  x: Float32Array;
  power: number;
}

/**
 * Flag mode's pole: a pole on a weighted base, the attackers' flag (their team colour) at the height
 * the simulation says, rippling, and a painted ring on the floor at the rope's reach, coloured by who
 * is working the rope. Hidden in elimination. Reads round state only. With map detail (setDetail): a ball finial, a
 * rope to a cleat, and a finer cloth painted with the site's flag, with a hem and a ripple damped near the pole.
 */
export class FlagRenderer {
  readonly object = new THREE.Group();
  /** World point just above the pole, for the screen marker (valid while visible). */
  readonly markerAnchor = new THREE.Vector3();
  private readonly plain: Cloth;
  private readonly fine: Cloth;
  private readonly detail = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  /** The site's flag (drawn the first time detail is on). */
  private design: THREE.Texture | null = null;
  private readonly ripple = { z: 0, slope: 0 };

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

    this.plain = this.cloth(clothGeometry(F.clothSegments, 1), new THREE.MeshStandardMaterial({ roughness: F.clothRoughness, side: THREE.DoubleSide }), 1);
    const fineGeo = clothGeometry(FD.clothDetailSegments[0], FD.clothDetailSegments[1]);
    paintHem(fineGeo);
    this.fine = this.cloth(fineGeo, new THREE.MeshStandardMaterial({ roughness: F.clothRoughness, side: THREE.DoubleSide, vertexColors: true }), FD.ripplePower);
    this.fine.mesh.visible = false;

    // Detail: a ball on top, and the rope from the top down one side to a cleat.
    const finial = new THREE.Mesh(this.track(new THREE.SphereGeometry(FD.finialRadius, 12, 8)), poleMat);
    finial.position.y = F.poleHeight + FD.finialRadius * 0.7;
    const ropeLength = F.poleHeight - FD.cleat.at;
    const ropeMat = this.track(new THREE.MeshStandardMaterial({ color: FD.ropeColor, roughness: 0.95 }));
    const rope = new THREE.Mesh(this.track(new THREE.CylinderGeometry(FD.ropeRadius, FD.ropeRadius, ropeLength, 5)), ropeMat);
    rope.position.set(-FD.ropeOffset, FD.cleat.at + ropeLength / 2, 0);
    const cleat = new THREE.Mesh(this.track(new THREE.BoxGeometry(FD.cleat.width, FD.cleat.height, FD.cleat.depth)), poleMat);
    cleat.position.set(-(F.poleRadius + FD.cleat.width / 2), FD.cleat.at, 0);
    for (const m of [finial, rope, cleat]) m.castShadow = true;
    this.detail.add(finial, rope, cleat);
    this.detail.visible = false;

    const ringGeo = this.track(new THREE.RingGeometry(ropeRadius - F.ringWidth, ropeRadius, F.ringSegments));
    ringGeo.rotateX(-Math.PI / 2);
    // Drawn after the floor with a depth offset, so it never flickers against it at a distance.
    this.ring = new THREE.Mesh(
      ringGeo,
      this.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: F.ringOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
    );
    this.ring.position.y = F.ringLift;
    this.ring.renderOrder = F.ringRenderOrder;

    this.object.add(pole, base, this.plain.mesh, this.fine.mesh, this.detail, this.ring);
    this.object.visible = false;
  }

  /** The cloth shaded by walls and containers, or lit as if in full sun (QualitySettings.figureShadows, REN-07). */
  setReceiveShadows(on: boolean): void {
    this.plain.mesh.receiveShadow = on;
    this.fine.mesh.receiveShadow = on;
  }

  /** Map detail on or off (QualitySettings.mapDetail): the finial, rope and cleat, and the finer painted cloth. */
  setDetail(on: boolean): void {
    this.detail.visible = on;
    this.fine.mesh.visible = on;
    this.plain.mesh.visible = !on;
    if (on && !this.design) {
      this.design = drawFlagDesign();
      this.fine.mesh.material.map = this.design;
      this.fine.mesh.material.needsUpdate = true;
    }
  }

  /** Once per frame. `time` (s) drives the ripple. */
  update(round: RoundState, time: number): void {
    const show = round.mode === 'attackDefend' && round.attackers >= 0;
    this.object.visible = show;
    if (!show) return;
    const flag = round.flag;
    this.object.position.set(flag.position.x, flag.position.y, flag.position.z);
    this.markerAnchor.set(flag.position.x, flag.position.y + F.markerHeight, flag.position.z);
    const cloth = this.fine.mesh.visible ? this.fine : this.plain;
    cloth.mesh.position.y = F.clothLowest + (F.clothHighest - F.clothLowest) * flag.progress;
    cloth.mesh.material.color.setHex(this.teamColors[round.attackers]!);
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
    const pos = cloth.mesh.geometry.attributes.position!;
    const normal = cloth.mesh.geometry.attributes.normal!;
    for (let i = 0; i < pos.count; i++) {
      const r = clothRipple(cloth.x[i]!, time, cloth.power, this.ripple);
      pos.setZ(i, r.z);
      const inv = 1 / Math.hypot(r.slope, 1);
      normal.setXYZ(i, -r.slope * inv, 0, inv);
    }
    pos.needsUpdate = true;
    normal.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.design?.dispose();
    this.object.removeFromParent();
  }

  private cloth(geo: THREE.PlaneGeometry, material: THREE.MeshStandardMaterial, power: number): Cloth {
    this.track(geo);
    this.track(material);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    const x = Float32Array.from({ length: geo.attributes.position!.count }, (_, i) => geo.attributes.position!.getX(i));
    return { mesh, x, power };
  }

  private track<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T {
    if (resource instanceof THREE.Material) this.materials.push(resource);
    else this.geometries.push(resource);
    return resource;
  }
}
