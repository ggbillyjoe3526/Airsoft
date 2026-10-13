import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RANGE, RANGE_VISUALS } from '../config/range';
import { type RangeTarget, targetPosts } from '../sim/rangeTargets';

const V = RANGE_VISUALS;
const VD = V.detail;
const G = V.gear;

/** A copy of `geo` turned by `turn` (Euler, radians) and moved to (x, y, z), painted `colour` (for a merged mesh). */
export function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, colour: number | null = null, turn: readonly [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...turn)));
  g.translate(x, y, z);
  if (colour !== null) {
    const c = new THREE.Color(colour);
    const n = g.getAttribute('position').count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }
  return g;
}

/** One geometry from several (build time only): the parts are disposed. */
export function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('range detail: parts do not merge');
  return geo;
}

/**
 * A copy of `geo` set in target `t`'s own frame (M93: every target faces its yaw): `x` across it, `z` along its facing,
 * both from its home, and `y` up from its floor.
 */
function inFrame(geo: THREE.BufferGeometry, t: RangeTarget, x: number, y: number, z: number, colour: number | null = null): THREE.BufferGeometry {
  return placed(geo, t.home.x + t.face.z * x + t.face.x * z, t.floor + y, t.home.z - t.face.x * x + t.face.z * z, colour, [0, t.yaw, 0]);
}

/** The gear that never moves, for `targets`: in the posts' grey (always shown), and Map detail's coloured fittings. */
export interface TargetGear {
  posts: THREE.BufferGeometry[];
  fittings: THREE.BufferGeometry[];
}

/**
 * Every target's fixed gear: a plate's post (M21) and, with Map detail, the arm its chains hang from and a safety band;
 * a figure's hinge brackets (detail); M93's moving targets' gear, always shown: a pop-up's motor box beside its hinge,
 * a mover's rails and end stops along its track, a swinger's frame (two legs and a crossbar over the pivot).
 */
export function targetGear(targets: readonly RangeTarget[]): TargetGear {
  const posts: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];
  const armGeo = new THREE.BoxGeometry(2 * VD.chainSpread + RANGE.postWidth, VD.armDepth, RANGE.postBehind + RANGE.postWidth / 2);
  const bandGeo = new THREE.BoxGeometry(RANGE.postWidth * 1.15, VD.band.height, RANGE.postWidth * 1.15);
  const hingeGeo = new THREE.BoxGeometry(VD.hinge.width, VD.hinge.height, VD.hinge.depth);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sized = (w: number, h: number, d: number): THREE.BufferGeometry => box.clone().scale(w, h, d);
  for (const t of targets) {
    if (t.kind === 'steel') {
      const legs = targetPosts(t);
      const width = t.motion === 'swinger' ? RANGE.swinger.frameWidth : RANGE.postWidth;
      for (const p of legs) {
        const height = p.top - t.floor;
        const leg = sized(width, height, width);
        posts.push(inFrame(leg, t, p.x, height / 2, p.z));
        leg.dispose();
      }
      if (t.motion === 'swinger') {
        // The crossbar the arm hangs from, over the pivot, from leg to leg.
        const span = legs[1]!.x - legs[0]!.x + width;
        const bar = sized(span, width, width);
        posts.push(inFrame(bar, t, 0, legs[0]!.top - t.floor + width / 2, legs[0]!.z));
        bar.dispose();
        continue;
      }
      // Detail: the plate on two short chains from an arm off the post's top, and a safety band on the post.
      const top = legs[0]!.top - t.floor;
      fittings.push(inFrame(armGeo, t, 0, top + VD.armDepth / 2, -RANGE.postBehind / 2, VD.metal));
      fittings.push(inFrame(bandGeo, t, 0, Math.min(VD.band.at, top - VD.band.height), -RANGE.postBehind, VD.band.colour));
      continue;
    }
    if (t.motion === 'mover') {
      // Two rails along the track, each end closed by a stop block; the trolley rides them (it moves: the renderer's).
      const length = 2 * t.track + G.trolley.width;
      const rail = sized(length, G.rail, G.rail);
      for (const side of [-1, 1]) posts.push(inFrame(rail, t, 0, G.rail / 2, (side * G.gauge) / 2));
      rail.dispose();
      const stop = sized(G.stop.width, G.stop.height, G.gauge + G.rail);
      for (const end of [-1, 1]) posts.push(inFrame(stop, t, end * (length / 2 + G.stop.width / 2), G.stop.height / 2, 0));
      stop.dispose();
      continue;
    }
    // Detail: the hinge brackets a figure stands on (a mover's ride its trolley, drawn with it).
    for (const side of [-1, 1]) fittings.push(inFrame(hingeGeo, t, side * (V.figureWidth / 2 - VD.hinge.inset), VD.hinge.height / 2, 0, VD.metal));
    if (t.motion === 'popup') {
      // The motor box beside the hinge that stands it up and lays it down (beside, so the figure lies back clear of it).
      const b = G.popupBox;
      const motor = sized(b.width, b.height, b.depth);
      posts.push(inFrame(motor, t, V.figureWidth / 2 + b.gap + b.width / 2, b.height / 2, 0));
      motor.dispose();
    }
  }
  for (const g of [armGeo, bandGeo, hingeGeo, box]) g.dispose();
  return { posts, fittings };
}
