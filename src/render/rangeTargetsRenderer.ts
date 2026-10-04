import * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import { RANGE, RANGE_VISUALS } from '../config/range';
import type { GameEvent } from '../sim/events';
import type { RangeTarget } from '../sim/rangeTargets';
import { createRng, rngNext } from '../sim/rng';
import { setReceiveShadows } from './characterModels';

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
  /** Map detail (setDetail): the parts shown only with it, the materials that take a painted texture, and those textures. */
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
    // Map detail's parts: chain links, the arm the chains hang from, a safety band on each post, hinge brackets.
    const metal = this.track(new THREE.MeshStandardMaterial({ color: VD.metal, metalness: 0.7, roughness: 0.4 }));
    const band = this.track(new THREE.MeshStandardMaterial({ color: VD.band.colour, roughness: 0.6 }));
    const linkGeo = this.trackGeo(new THREE.TorusGeometry(VD.linkRadius, VD.linkTube, 5, 10));
    const armGeo = this.trackGeo(new THREE.BoxGeometry(2 * VD.chainSpread + RANGE.postWidth, VD.armDepth, RANGE.postBehind + RANGE.postWidth / 2));
    const bandGeo = this.trackGeo(new THREE.BoxGeometry(RANGE.postWidth * 1.15, VD.band.height, RANGE.postWidth * 1.15));
    const hingeGeo = this.trackGeo(new THREE.BoxGeometry(VD.hinge.width, VD.hinge.height, VD.hinge.depth));
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
        // Detail: the plate on two short chains from an arm off the post's top, and a safety band on the post.
        const arm = new THREE.Mesh(armGeo, metal);
        arm.position.set(0, top + VD.armDepth / 2, -RANGE.postBehind / 2);
        const bandMesh = new THREE.Mesh(bandGeo, band);
        bandMesh.position.set(0, VD.band.at, -RANGE.postBehind);
        const chains = new THREE.Group();
        const step = RANGE.postAbovePlate / VD.links;
        for (const side of [-1, 1]) {
          for (let k = 0; k < VD.links; k++) {
            const link = new THREE.Mesh(linkGeo, metal);
            link.position.set(side * VD.chainSpread, -(k + 0.5) * step, 0);
            link.rotation.set(0, k % 2 === 0 ? 0 : Math.PI / 2, Math.PI / 2);
            chains.add(link);
          }
        }
        hanger.add(chains);
        stand.add(arm, bandMesh);
        this.detailParts.push(arm, bandMesh, chains);
      } else {
        // A plywood cut-out the size of a player's hit volume, standing or crouched, hinged at its feet.
        const drop = t.crouched ? hits.crouchDrop : 0;
        const bodyTop = hits.bodyTop - drop;
        const hinge = new THREE.Group();
        const torso = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(V.figureWidth, bodyTop - hits.bodyBottom, V.figureThickness)), ply);
        torso.position.y = (bodyTop + hits.bodyBottom) / 2;
        const head = new THREE.Mesh(headGeo, plyHead);
        head.position.y = hits.headHeight - drop;
        torso.castShadow = head.castShadow = true;
        hinge.add(torso, head);
        stand.add(hinge);
        mover = hinge;
        // Detail: the hinge brackets the figure stands on.
        for (const side of [-1, 1]) {
          const bracket = new THREE.Mesh(hingeGeo, metal);
          bracket.position.set(side * (V.figureWidth / 2 - VD.hinge.inset), VD.hinge.height / 2, 0);
          stand.add(bracket);
          this.detailParts.push(bracket);
        }
      }
      this.movers.push(mover);
      this.swingT.push(Number.POSITIVE_INFINITY);
      this.object.add(stand);
    }
    this.addMarkers();
    this.addShelf(metal);
    this.setDetail(false);
  }

  /**
   * Map detail on or off (QualitySettings.mapDetail): the chains, arms, bands, brackets and shelf, and the painted
   * plates (BB scuffs, rougher than the paint) and figures (scoring zones), drawn the first time detail is on.
   */
  setDetail(on: boolean): void {
    for (const part of this.detailParts) part.visible = on;
    const p = on ? (this.painted ??= this.paint()) : null;
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
    for (const mover of this.movers) setReceiveShadows(mover, on);
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

  /** A shelf of BB bottles by the firing line (map detail). */
  private addShelf(metal: THREE.Material): void {
    const S = VD.shelf;
    const B = VD.bottles;
    const shelf = new THREE.Group();
    shelf.position.set(S.x, 0, S.z);
    const top = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(S.width, S.top, S.depth)), this.track(new THREE.MeshStandardMaterial({ color: S.colour, roughness: 0.7 })));
    top.position.y = S.height - S.top / 2;
    const legGeo = this.trackGeo(new THREE.BoxGeometry(S.top, S.height - S.top, S.top));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, metal);
        leg.position.set(sx * (S.width / 2 - S.top), (S.height - S.top) / 2, sz * (S.depth / 2 - S.top));
        shelf.add(leg);
      }
    }
    const bottleGeo = this.trackGeo(new THREE.CylinderGeometry(B.radius, B.radius, B.height, 10));
    const capGeo = this.trackGeo(new THREE.CylinderGeometry(B.radius * 0.45, B.radius * 0.45, B.height * 0.15, 8));
    const bottleMat = this.track(new THREE.MeshStandardMaterial({ color: B.colour, roughness: 0.5 }));
    const capMat = this.track(new THREE.MeshStandardMaterial({ color: B.capColour, roughness: 0.6 }));
    for (let i = 0; i < B.count; i++) {
      const x = (i - (B.count - 1) / 2) * B.radius * 3;
      const bottle = new THREE.Mesh(bottleGeo, bottleMat);
      bottle.position.set(x, S.height + B.height / 2, 0);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, S.height + B.height * 1.075, 0);
      shelf.add(bottle, cap);
    }
    shelf.add(top);
    shelf.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
    this.object.add(shelf);
    this.detailParts.push(shelf);
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
