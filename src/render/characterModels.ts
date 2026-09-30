import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE } from '../config/characters';

/**
 * Third-person figures: chunky greybox players in airsoft kit (cap, goggles, team-colour chest rig and
 * armbands, replica). Each moving part is one mesh with flat vertex colours; all figures share one
 * material. Figures face -Z with their feet at the origin.
 */

type Color = number;

/** Collects coloured primitives and merges them into one geometry with a `color` attribute. */
class PartBuilder {
  private readonly geos: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: Color): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geos.push(g);
    return this;
  }

  box(color: Color, w: number, h: number, d: number, x: number, y: number, z: number): this {
    return this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  }

  /** Capsule from a to b. */
  limb(color: Color, radius: number, a: THREE.Vector3, b: THREE.Vector3): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CapsuleGeometry(radius, Math.max(1e-3, dir.length()), 3, 8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(geo, color);
  }

  sphere(color: Color, r: number, x: number, y: number, z: number): this {
    return this.add(new THREE.SphereGeometry(r, 12, 8).translate(x, y, z), color);
  }

  /** Adds another builder's merged, already coloured parts transformed by `m`. */
  addPart(part: PartBuilder, m: THREE.Matrix4): this {
    this.geos.push(part.geometry().applyMatrix4(m));
    return this;
  }

  geometry(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (!merged) throw new Error('empty figure part');
    return merged;
  }

  build(material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = true;
    return mesh;
  }
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const C = FIGURE.colors;

/** A simple rifle along -Z from `z0` (butt) with its bore at height y. */
function addRifle(b: PartBuilder, x: number, y: number, z0: number): void {
  b.box(C.furniture, 0.05, 0.1, 0.2, x, y - 0.02, z0 - 0.1); // stock
  b.box(C.replica, 0.055, 0.08, 0.34, x, y, z0 - 0.37); // receiver
  b.box(C.furniture, 0.04, 0.14, 0.06, x, y - 0.1, z0 - 0.42); // magazine
  b.box(C.furniture, 0.06, 0.07, 0.24, x, y, z0 - 0.66); // handguard
  b.box(C.replica, 0.025, 0.025, 0.2, x, y, z0 - 0.88); // barrel
  b.box(C.replica, 0.04, 0.05, 0.08, x, y + 0.07, z0 - 0.33); // optic
}

export interface Figure {
  root: THREE.Group;
  /** Everything above the hips; drops when crouching. */
  upper: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  /** Arms and replica in the aiming pose; pitches with the view about the shoulders. */
  aim: THREE.Group;
  /** Hit-calling pose: one hand raised high, replica held muzzle-down. */
  hitPose: THREE.Mesh;
  callout: THREE.Sprite;
}

/** Builds one figure in its team colour. Geometry is per figure; `material` and `calloutMaterial` are shared. */
export function buildFigure(teamColor: Color, material: THREE.Material, calloutMaterial: THREE.SpriteMaterial): Figure {
  const F = FIGURE;
  const root = new THREE.Group();

  // Legs pivot at the hips so they can swing.
  const leg = (side: number): THREE.Mesh => {
    const b = new PartBuilder();
    b.limb(C.trousers, F.legRadius, v(0, 0, 0), v(0, -F.hipHeight + 0.12, 0));
    b.box(C.boots, 0.12, 0.1, 0.24, 0, -F.hipHeight + 0.05, -0.04);
    const mesh = b.build(material);
    mesh.position.set(side * F.hipSpread, F.hipHeight, 0);
    return mesh;
  };
  const legL = leg(-1);
  const legR = leg(1);

  // Upper body is built with the hips at y = 0 so crouching just lowers the group.
  const upper = new THREE.Group();
  upper.position.y = F.hipHeight;
  const hy = -F.hipHeight; // add this to world heights to get upper-body local heights
  const t = F.torso;
  const body = new PartBuilder();
  body.box(C.jacket, t.width, t.height, t.depth, 0, t.bottom + t.height / 2 + hy, 0);
  // Team-colour chest rig: the main way to tell teams apart at range.
  body.box(teamColor, t.width + 0.03, t.height * 0.55, t.depth + 0.04, 0, t.bottom + t.height * 0.62 + hy, 0);
  body.box(C.trousers, t.width - 0.04, 0.1, t.depth - 0.02, 0, t.bottom + hy, 0); // belt line
  body.limb(C.skin, 0.05, v(0, F.shoulderHeight + hy, 0), v(0, F.headHeight - 0.08 + hy, 0)); // neck
  body.sphere(C.skin, F.headRadius, 0, F.headHeight + hy, 0);
  // Cap with a brim, and full-seal goggles: eye protection is mandatory at every site.
  body.add(new THREE.SphereGeometry(F.headRadius * 1.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, F.headHeight + 0.02 + hy, 0), C.cap);
  body.box(C.cap, 0.16, 0.015, 0.1, 0, F.headHeight + 0.03 + hy, -0.13);
  body.box(C.goggles, 0.2, 0.06, 0.06, 0, F.headHeight + 0.0 + hy, -0.085);
  body.box(C.lens, 0.16, 0.035, 0.01, 0, F.headHeight + 0.0 + hy, -0.118);
  upper.add(body.build(material));

  // Aiming pose: pivot at the shoulder line, rifle shouldered on the right.
  const aim = new THREE.Group();
  aim.position.y = F.shoulderHeight + hy;
  const arms = new PartBuilder();
  const sR = v(F.shoulderSpread, 0, 0);
  const sL = v(-F.shoulderSpread, 0, 0);
  const grip = v(0.07, -0.12, -0.26);
  const fore = v(0.03, -0.08, -0.55);
  arms.limb(C.jacket, F.armRadius, sR, v(0.2, -0.2, -0.12));
  arms.limb(C.jacket, F.armRadius, v(0.2, -0.2, -0.12), grip);
  arms.limb(C.jacket, F.armRadius, sL, v(-0.14, -0.22, -0.3));
  arms.limb(C.jacket, F.armRadius, v(-0.14, -0.22, -0.3), fore);
  arms.box(teamColor, 0.13, 0.07, 0.13, F.shoulderSpread, -0.07, 0); // armbands
  arms.box(teamColor, 0.13, 0.07, 0.13, -F.shoulderSpread, -0.07, 0);
  arms.sphere(C.skin, 0.045, grip.x, grip.y, grip.z);
  arms.sphere(C.skin, 0.045, fore.x, fore.y, fore.z);
  addRifle(arms, 0.06, -0.06, 0.12);
  aim.add(arms.build(material));
  upper.add(aim);

  // Hit pose: right hand straight up (open hand), rifle hanging muzzle-down from the left hand.
  const hit = new PartBuilder();
  const top = F.shoulderHeight + hy;
  hit.limb(C.jacket, F.armRadius, v(F.shoulderSpread, top, 0), v(F.shoulderSpread + 0.04, top + 0.3, 0.02));
  hit.limb(C.jacket, F.armRadius, v(F.shoulderSpread + 0.04, top + 0.3, 0.02), v(F.shoulderSpread + 0.06, top + 0.58, 0));
  hit.box(C.skin, 0.09, 0.14, 0.04, F.shoulderSpread + 0.06, top + 0.67, 0); // open hand
  hit.box(teamColor, 0.13, 0.07, 0.13, F.shoulderSpread, top - 0.07, 0);
  hit.box(teamColor, 0.13, 0.07, 0.13, -F.shoulderSpread, top - 0.07, 0);
  hit.limb(C.jacket, F.armRadius, v(-F.shoulderSpread, top, 0), v(-F.shoulderSpread - 0.03, top - 0.5, -0.06));
  hit.sphere(C.skin, 0.045, -F.shoulderSpread - 0.03, top - 0.55, -0.06);
  const hanging = new PartBuilder();
  addRifle(hanging, 0, 0, 0.12);
  // Muzzle down and slightly forward, held at the left hand.
  hit.addPart(
    hanging,
    new THREE.Matrix4().makeTranslation(-F.shoulderSpread - 0.03, top - 0.55, -0.06).multiply(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - 0.25))),
  );
  const hitPose = hit.build(material);
  hitPose.visible = false;
  upper.add(hitPose);

  const callout = new THREE.Sprite(calloutMaterial);
  callout.scale.set(F.callout.width, F.callout.width * F.callout.aspect, 1);
  callout.position.y = F.callout.height;
  callout.visible = false;

  root.add(legL, legR, upper, callout);
  return { root, upper, legL, legR, aim, hitPose, callout };
}

/** The shared "HIT!" sign texture. */
export function createCalloutTexture(): THREE.CanvasTexture {
  const c = FIGURE.callout;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round(256 * c.aspect);
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = c.background;
    const r = canvas.height * 0.3;
    g.beginPath();
    g.roundRect(4, 4, canvas.width - 8, canvas.height - 8, r);
    g.fill();
    g.fillStyle = c.color;
    g.font = `900 ${Math.round(canvas.height * 0.62)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HIT!', canvas.width / 2, canvas.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function disposeFigure(f: Figure): void {
  f.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  f.root.removeFromParent();
}
