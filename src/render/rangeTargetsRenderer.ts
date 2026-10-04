import * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import { RANGE, RANGE_VISUALS } from '../config/range';
import type { GameEvent } from '../sim/events';
import type { RangeTarget } from '../sim/rangeTargets';

const V = RANGE_VISUALS;

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
export class RangeTargetsRenderer {
  readonly object = new THREE.Group();
  /** Per target: the part that moves (the plate on its hanger, the figure on its hinge). */
  private readonly movers: THREE.Object3D[] = [];
  /** Per target: seconds since a steel plate was last hit (Infinity: still). */
  private readonly swingT: number[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];

  constructor(
    private readonly targets: readonly RangeTarget[],
    hits: HitConfig,
  ) {
    const steel = this.track(new THREE.MeshStandardMaterial({ color: V.steelColor, metalness: V.steelMetalness, roughness: V.steelRoughness }));
    const post = this.track(new THREE.MeshStandardMaterial({ color: V.postColor, roughness: 0.8 }));
    const ply = this.track(new THREE.MeshStandardMaterial({ color: V.figureColor, roughness: V.figureRoughness }));
    const plateGeo = this.trackGeo(new THREE.CylinderGeometry(RANGE.plateRadius, RANGE.plateRadius, V.plateThickness, V.plateSegments));
    plateGeo.rotateX(Math.PI / 2); // face the firing line (+z)
    const headGeo = this.trackGeo(new THREE.CylinderGeometry(hits.headRadius, hits.headRadius, V.figureThickness, 16));
    headGeo.rotateX(Math.PI / 2);

    for (const t of targets) {
      const stand = new THREE.Group();
      stand.position.set(t.position.x, 0, t.position.z);
      let mover: THREE.Object3D;
      if (t.kind === 'steel') {
        // The plate hangs from the top of a post frame; it swings about the hanger.
        const top = t.position.y + RANGE.plateRadius + RANGE.postAbovePlate;
        const upright = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(RANGE.postWidth, top, RANGE.postWidth)), post);
        upright.position.set(0, top / 2, -RANGE.postBehind);
        const hanger = new THREE.Group();
        hanger.position.set(0, top, 0);
        const plate = new THREE.Mesh(plateGeo, steel);
        plate.position.y = t.position.y - top;
        plate.castShadow = true;
        hanger.add(plate);
        stand.add(upright, hanger);
        mover = hanger;
      } else {
        // A plywood cut-out the size of a player's hit volume, standing or crouched, hinged at its feet.
        const drop = t.crouched ? hits.crouchDrop : 0;
        const bodyTop = hits.bodyTop - drop;
        const hinge = new THREE.Group();
        const torso = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(V.figureWidth, bodyTop - hits.bodyBottom, V.figureThickness)), ply);
        torso.position.y = (bodyTop + hits.bodyBottom) / 2;
        const head = new THREE.Mesh(headGeo, ply);
        head.position.y = hits.headHeight - drop;
        torso.castShadow = head.castShadow = true;
        hinge.add(torso, head);
        stand.add(hinge);
        mover = hinge;
      }
      this.movers.push(mover);
      this.swingT.push(Number.POSITIVE_INFINITY);
      this.object.add(stand);
    }
    this.addMarkers();
  }

  /** After each simulation tick: steel plates that were hit start swinging. */
  afterTick(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type !== 'targetHit' || e.kind !== 'steel') continue;
      const i = this.targets.findIndex((t) => t.id === e.targetId);
      if (i >= 0) this.swingT[i] = 0;
    }
  }

  /** Once per frame: figures follow their time down, plates swing and settle. */
  update(dt: number): void {
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i]!;
      const mover = this.movers[i]!;
      if (t.kind === 'figure') {
        mover.rotation.x = figureRotation(t.down);
      } else {
        const s = (this.swingT[i]! += dt);
        mover.rotation.x = Number.isFinite(s) ? plateRotation(s) : 0;
      }
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.object.removeFromParent();
  }

  /** A painted line across the floor at every distance, and a board on each side wall saying how far. */
  private addMarkers(): void {
    const lineMat = this.track(new THREE.MeshBasicMaterial({ color: V.lineColor }));
    const lineGeo = this.trackGeo(new THREE.PlaneGeometry(RANGE.halfWidth * 2, V.lineDepth));
    lineGeo.rotateX(-Math.PI / 2);
    const signGeo = this.trackGeo(new THREE.PlaneGeometry(V.signWidth, V.signHeight));
    for (const d of [0, ...RANGE.distances]) {
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(0, V.lineLift, -d);
      line.receiveShadow = true;
      this.object.add(line);
      if (d === 0) continue; // the firing line
      const mat = this.track(new THREE.MeshBasicMaterial({ map: this.signTexture(`${d} m`) }));
      for (const side of [-1, 1]) {
        const sign = new THREE.Mesh(signGeo, mat);
        // On the wall's face, turned halfway towards the firing line so it reads from there.
        sign.position.set(side * (RANGE.halfWidth - V.signWidth / 2 * Math.sin(V.signTurn) - 0.01), V.signLift, -d);
        sign.rotation.y = -side * (Math.PI / 2 - V.signTurn);
        this.object.add(sign);
      }
    }
  }

  private signTexture(text: string): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    if (g) {
      g.fillStyle = V.signColor;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = V.signText;
      g.font = 'bold 84px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
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
