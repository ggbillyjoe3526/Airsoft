import * as THREE from 'three';
import { band, basis, shapedBand, between, boxIn, capsule, geoIn, gripHand, ik, inside, limbGeo, openHand, shellGeo, toWorld, V, type Fold, type HandStyle, type WorldWrap } from './anatomy';
import { Kit } from './kit';
import { buildReplica, type Replica, type ReplicaId, type ReplicaOpts } from './replicas';

/**
 * Players and bots built in code (v2, after William's notes on v1: more realistic, more definition in heads, helmets
 * and goggles, real hands). Two looks share one skeleton: human players in airsoft kit, and an optional robot
 * chassis wearing the same chest rig. Limbs are tapered tubes with cloth folds, placed by two-bone IK between joints,
 * so any pose the game's animation gives is a set of points. Figures face -Z, feet at the origin.
 */

export type Pose = 'aim' | 'ready' | 'hit' | 'pistol' | 'run';
export interface FigureOpts {
  team: 'blue' | 'orange';
  pose: Pose;
  headgear?: 'helmet' | 'cap' | 'bump' | 'none';
  face?: 'mask' | 'bare';
  pack?: boolean;
  skin?: number;
  hair?: number;
  beard?: boolean;
  weapon?: ReplicaId;
  weaponOpts?: ReplicaOpts;
  robot?: boolean;
}

const TEAM = {
  blue: { main: 0x2f6fd6, dark: 0x1d3f7c, camo: 0x6a7384, shirt: 0x535b69, glow: 0x4aa8ff, lens: 0x1d3a66, shell: 0xd9dee4 },
  orange: { main: 0xec7a2c, dark: 0x8a4318, camo: 0xb39f78, shirt: 0x9c8a66, glow: 0xff9a3c, lens: 0x6a3414, shell: 0x4b5159 },
};
const GEAR = 0x4b5059;
const GEAR_DARK = 0x2b2f35;
const GLOVE = 0x26292e;
const BOOT = 0x3a332b;
const SOLE = 0x24221f;
const JOINT = 0x2c3036;
const CHROME = 0xc9cdd3;

type Team = (typeof TEAM)['blue'];

interface Detail {
  radial: number;
  rings: number;
  full: boolean;
}

function detail(k: Kit): Detail {
  return k.p.smallParts ? { radial: 20, rings: 18, full: true } : { radial: 8, rings: 4, full: false };
}

/** A limb (or a body part built like one) from a to b, `over` metres past both ends. */
function limb(k: Kit, key: string, a: THREE.Vector3, b: THREE.Vector3, prof: [number, number, number][], tint: number | THREE.Color, d: Detail, folds: Fold[] = [], ref = V(0, 0, -1), over = 0.02): THREE.Matrix4 {
  const dir = b.clone().sub(a).normalize();
  const a2 = a.clone().addScaledVector(dir, -over);
  const len = a.distanceTo(b) + over * 2;
  const g = limbGeo(len, prof, d.radial, d.rings, d.full ? folds : []);
  return between(k, key, g, a2, a2.clone().addScaledVector(dir, len), tint, ref);
}

function sphere(k: Kit, key: string, c: THREE.Vector3, r: number, tint: number | THREE.Color, d: Detail): void {
  k.add(key, new THREE.SphereGeometry(r, d.full ? 18 : 8, d.full ? 12 : 6), new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), tint, {});
}

interface Skeleton {
  chest: THREE.Matrix4;
  pelvisY: number;
  cp: (x: number, y: number, z: number) => THREE.Vector3;
  ty: (y: number) => number;
  legs: { hip: THREE.Vector3; knee: THREE.Vector3; foot: THREE.Vector3; side: number; boot: THREE.Matrix4 }[];
  head: THREE.Matrix4;
  rep: Replica;
  /** Grips for each hand (null: an open hand held up). */
  grips: { side: number; wrap: WorldWrap | null; trigger?: THREE.Vector3 }[];
  shoulders: [THREE.Vector3, THREE.Vector3];
}

function skeleton(k: Kit, o: FigureOpts, t: Team): Skeleton {
  const pose = o.pose;
  const weaponId: ReplicaId = o.weapon ?? (pose === 'pistol' ? 'pistol' : 'aeg');
  const yaw = pose === 'aim' || pose === 'ready' ? 0.42 : pose === 'run' ? 0.12 : 0;
  const lean = pose === 'aim' ? 0.08 : pose === 'run' ? 0.22 : 0.03;
  const pelvisY = pose === 'run' ? 0.92 : 0.96;
  const chest = new THREE.Matrix4().compose(V(0, pelvisY, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean, yaw, 0, 'YXZ')), V(1, 1, 1));
  const cp = (x: number, y: number, z: number) => V(x, y - pelvisY, z).applyMatrix4(chest);
  const ty = (y: number) => y - pelvisY;

  const hips = [V(-0.095, pelvisY - 0.04, 0), V(0.095, pelvisY - 0.04, 0)];
  let feet = [V(-0.15, 0.1, -0.16), V(0.17, 0.1, 0.17)];
  let yaws = [-0.25, 0.55];
  if (pose === 'hit' || pose === 'pistol') {
    feet = [V(-0.15, 0.1, -0.05), V(0.15, 0.1, 0.06)];
    yaws = [-0.1, 0.15];
  }
  if (pose === 'run') {
    feet = [V(-0.12, 0.24, 0.32), V(0.12, 0.1, -0.34)];
    yaws = [0, 0];
  }
  const legs = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const hip = hips[i]!;
    const foot = feet[i]!;
    const knee = ik(hip, foot, 0.45, 0.43, V(side * 0.15, 0, -1));
    const boot = new THREE.Matrix4().compose(foot, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -yaws[i]!), V(1, 1, 1));
    if (pose === 'run' && side < 0) boot.multiply(new THREE.Matrix4().makeRotationX(0.6));
    return { hip, knee, foot, side, boot };
  });

  const head = chest.clone().multiply(new THREE.Matrix4().compose(V(0, ty(1.555), 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(pose === 'aim' ? 0.12 : 0, -yaw * 0.8, pose === 'aim' ? 0.12 : 0, 'YXZ')), V(1, 1, 1)));

  const k2 = new Kit(k.p);
  k2.envMap = k.envMap;
  const rep = buildReplica(k2, weaponId, o.weaponOpts ?? (weaponId === 'aeg' ? { optic: 'redDot', grip: 'vertical', accent: t.main } : { accent: t.main }));
  const wm = new THREE.Matrix4();
  const R = V(1, 0, 0);
  const L = V(-1, 0, 0);
  const FWD = V(0, 0, -1);
  const grips: Skeleton['grips'] = [];
  const support = (m: THREE.Matrix4) =>
    rep.supportGrip ? toWorld(rep.supportGrip, m, L, FWD) : toWorld({ top: V(0, 0.032, -0.34), bottom: V(0, 0.032, -0.25), hx: 0.033, hd: 0.031 }, m, V(0, -1, 0), R);
  if (pose === 'aim' || pose === 'ready' || pose === 'run') {
    if (pose === 'run') {
      wm.compose(V(0.05, 1.26, -0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0.5, 0.2, 'YXZ')), V(1, 1, 1));
    } else {
      const butt = cp(0.12, 1.44, -0.13);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose === 'ready' ? -0.6 : -0.02, 0.02, 0, 'YXZ'));
      wm.compose(V(0, 0, 0), q, V(1, 1, 1));
      wm.setPosition(butt.clone().sub(rep.butt.clone().applyQuaternion(q)));
    }
    grips.push({ side: -1, wrap: support(wm) });
    grips.push({ side: 1, wrap: toWorld(rep.hand, wm, R, FWD), trigger: rep.trigger.clone().applyMatrix4(wm) });
  } else if (pose === 'pistol') {
    wm.compose(V(0.0, 1.36, -0.52), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0, 0)), V(1, 1, 1));
    grips.push({ side: -1, wrap: toWorld(rep.hand, wm, L, FWD, 0.021, 0.7) });
    grips.push({ side: 1, wrap: toWorld(rep.hand, wm, R, FWD), trigger: rep.trigger.clone().applyMatrix4(wm) });
  } else {
    // Hit: the right hand up high, the replica hanging muzzle-down from the left hand.
    wm.compose(V(-0.3, 0.9, -0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.45, 0.25, 0, 'YXZ')), V(1, 1, 1));
    grips.push({ side: -1, wrap: toWorld(rep.hand, wm, L, FWD) });
    grips.push({ side: 1, wrap: null });
  }
  rep.group.applyMatrix4(wm);
  return { chest, pelvisY, cp, ty, legs, head, rep, grips, shoulders: [cp(-0.2, 1.465, 0.0), cp(0.2, 1.465, 0.0)] };
}

// ---------------------------------------------------------------- humans

function humanLegs(k: Kit, s: Skeleton, t: Team, d: Detail): void {
  for (const { hip, knee, foot, side, boot } of s.legs) {
    const thigh = limb(k, 'camo', hip, knee, [[0, 0.092, 0.096], [0.45, 0.08, 0.085], [1, 0.062, 0.066]], t.camo, d, [{ at: 0.93, width: 0.07, amp: 0.09 }, { at: 0.3, width: 0.12, amp: 0.03 }]);
    const ankle = foot.clone().add(V(0, 0.04, 0));
    limb(k, 'camo', knee, ankle, [[0, 0.062, 0.064], [0.3, 0.058, 0.062], [0.8, 0.048, 0.05], [1, 0.054, 0.056]], t.camo, d, [{ at: 0.06, width: 0.07, amp: 0.08 }, { at: 0.86, width: 0.09, amp: 0.12 }]);
    sphere(k, 'camo', knee, 0.064, t.camo, d);
    // Cargo pocket with a flap, on the outside of the thigh.
    const tl = hip.distanceTo(knee);
    boxIn(k, 'camo', thigh, side * 0.08, tl * 0.58, 0.005, 0.03, 0.14, 0.12, new THREE.Color(t.camo).multiplyScalar(0.96), 0.012);
    if (d.full) boxIn(k, 'camo', thigh, side * 0.097, tl * 0.66, 0.005, 0.008, 0.035, 0.125, new THREE.Color(t.camo).multiplyScalar(0.9), 0.003);
    // Knee pad: a moulded dome on a strap, in the team colour.
    const shin = foot.clone().sub(knee).normalize();
    const pole = V(side * 0.15, 0, -1);
    const kn = pole.clone().addScaledVector(shin, -pole.dot(shin)).normalize();
    const pm = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(kn, shin).normalize(), kn, shin);
    pm.setPosition(knee.clone().addScaledVector(kn, 0.045).addScaledVector(shin, 0.03));
    const dome = new THREE.SphereGeometry(1, d.full ? 18 : 8, d.full ? 8 : 4, 0, Math.PI * 2, 0, Math.PI / 2);
    k.add('armour', dome, pm.clone().multiply(new THREE.Matrix4().makeScale(0.058, 0.034, 0.072)), t.main, {});
    if (d.full) {
      k.add('figRubber', dome, pm.clone().multiply(new THREE.Matrix4().compose(V(0, 0.012, 0), new THREE.Quaternion(), V(0.036, 0.026, 0.046))), GEAR_DARK, {});
      limb(k, 'gear', knee.clone().addScaledVector(shin, 0.075), knee.clone().addScaledVector(shin, 0.1), [[0, 0.06, 0.063], [1, 0.059, 0.062]], GEAR_DARK, d, [], kn, 0);
      limb(k, 'gear', knee.clone().addScaledVector(shin, -0.04), knee.clone().addScaledVector(shin, -0.015), [[0, 0.066, 0.07], [1, 0.065, 0.069]], GEAR_DARK, d, [], kn, 0);
    }
    // Boots: a shaft, a shaped upper narrowing to the toe, a darker sole, laces.
    limb(k, 'figRubber', V(0, -0.055, 0).applyMatrix4(boot), V(0, 0.11, 0).applyMatrix4(boot), [[0, 0.056, 0.064], [1, 0.058, 0.064]], BOOT, d, [], V(0, 0, -1), 0);
    const ub = new THREE.BoxGeometry(0.11, 0.085, 0.29, d.full ? 4 : 1, d.full ? 3 : 1, d.full ? 10 : 2);
    const up = ub.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < up.count; i++) {
      const z = up.getZ(i);
      const toe = Math.max(0, -z - 0.04);
      const heel = Math.max(0, z - 0.1);
      const top = up.getY(i) > 0 ? 1 : 0;
      up.setX(i, up.getX(i) * (1 - toe * 1.6) * (1 - heel * 2));
      up.setY(i, up.getY(i) - top * toe * 0.42);
    }
    ub.computeVertexNormals();
    geoIn(k, 'figRubber', boot, ub, 0, -0.05, -0.045, BOOT);
    geoIn(k, 'figRubber', boot, new THREE.BoxGeometry(0.118, 0.026, 0.305, 1, 1, 1), 0, -0.088, -0.045, SOLE);
    if (d.full) {
      geoIn(k, 'figRubber', boot, new THREE.BoxGeometry(0.1, 0.03, 0.05), 0, -0.07, -0.17, 0x2a2622);
      for (let i = 0; i < 4; i++) geoIn(k, 'gear', boot, new THREE.BoxGeometry(0.05, 0.006, 0.012), 0, -0.01 + i * 0.03, -0.062 - (i < 1 ? 0.02 : 0), 0x1d1e20, new THREE.Euler(0.2, 0, 0));
    }
  }
}

function humanTorso(k: Kit, s: Skeleton, o: FigureOpts, t: Team, d: Detail): void {
  const { chest: C, ty } = s;
  const Tp = (x: number, y: number, z: number) => V(x, ty(y), z).applyMatrix4(C);
  // Hips (trousers), a padded battle belt, the shirt and the neck.
  limb(k, 'camo', Tp(0, 0.84, 0), Tp(0, 1.08, 0), [[0, 0.15, 0.1], [0.5, 0.165, 0.11], [1, 0.155, 0.103]], t.camo, d, [], V(0, 0, -1).transformDirection(C), 0);
  limb(k, 'gear', Tp(0, 1.02, 0), Tp(0, 1.085, 0), [[0, 0.17, 0.115], [1, 0.168, 0.113]], GEAR_DARK, d, [], V(0, 0, -1).transformDirection(C), 0);
  boxIn(k, 'galv', C, 0, ty(1.052), -0.116, 0.055, 0.04, 0.012, 0x9ea4aa, 0.004);
  limb(k, 'cloth', Tp(0, 1.06, 0), Tp(0, 1.5, 0), [[0, 0.15, 0.102], [0.25, 0.148, 0.1], [0.55, 0.178, 0.116], [0.82, 0.19, 0.112], [1, 0.08, 0.075]], t.shirt, d, [{ at: 0.18, width: 0.08, amp: 0.05 }], V(0, 0, -1).transformDirection(C), 0);
  limb(k, 'skin', Tp(0, 1.47, 0.005), Tp(0, 1.6, 0.012), [[0, 0.064, 0.064], [1, 0.056, 0.058]], o.skin ?? 0xd9a77e, d, [], V(0, 0, -1).transformDirection(C), 0);
  // The shirt's collar round the neck.
  limb(k, 'cloth', Tp(0, 1.49, 0.005), Tp(0, 1.545, 0.01), [[0, 0.085, 0.08], [1, 0.072, 0.07]], t.shirt, d, [{ at: 0.5, width: 0.3, amp: 0.05 }], V(0, 0, -1).transformDirection(C), 0);
  // Plate carrier: front and back plate bags (the team colour), a cummerbund, padded shoulder straps.
  boxIn(k, 'gear', C, 0, ty(1.33), -0.138, 0.3, 0.32, 0.058, t.main, 0.022);
  boxIn(k, 'gear', C, 0, ty(1.35), 0.135, 0.3, 0.34, 0.058, t.dark, 0.022);
  for (const sd of [-1, 1]) {
    const g = band(0.26, 0.15, 0.022, 0.155, d.full ? 10 : 3);
    g.rotateY(sd * Math.PI / 2);
    g.scale(1.1, 1, 0.82);
    geoIn(k, 'gear', C, g, 0, ty(1.22), 0, GEAR);
    boxIn(k, 'gear', C, sd * 0.1, ty(1.505), 0.0, 0.06, 0.022, 0.25, GEAR, 0.008);
  }
  if (d.full) {
    // MOLLE webbing rows on the back plate and the cummerbund.
    for (let r = 0; r < 5; r++) boxIn(k, 'gear', C, 0, ty(1.24 + r * 0.05), 0.166, 0.28, 0.014, 0.006, GEAR_DARK, 0.002);
    boxIn(k, 'gear', C, 0, ty(1.53), 0.166, 0.11, 0.03, 0.03, GEAR_DARK, 0.01); // drag handle
  }
  // Three magazine pouches with bungee retention, an admin pouch with a team patch and a name tape.
  for (let i = 0; i < 3; i++) {
    const x = -0.095 + i * 0.095;
    boxIn(k, 'gear', C, x, ty(1.235), -0.188, 0.082, 0.13, 0.05, GEAR, 0.012);
    boxIn(k, 'gunPolymer', C, x, ty(1.31), -0.188, 0.06, 0.03, 0.028, 0x24272c, 0.005);
    if (d.full) {
      boxIn(k, 'figRubber', C, x, ty(1.3), -0.204, 0.066, 0.006, 0.006, 0x1a1b1e, 0.002);
      boxIn(k, 'gear', C, x, ty(1.325), -0.2, 0.018, 0.022, 0.008, t.main, 0.002);
    }
  }
  boxIn(k, 'gear', C, 0.0, ty(1.41), -0.175, 0.14, 0.085, 0.032, GEAR, 0.01);
  boxIn(k, 'gear', C, 0.0, ty(1.425), -0.192, 0.07, 0.045, 0.004, t.dark, 0.002);
  if (d.full) boxIn(k, 'gear', C, 0.0, ty(1.465), -0.169, 0.16, 0.022, 0.004, 0xe7e3d8, 0.002);
  // A radio pouch on the left with its antenna, a dump pouch on the right hip.
  boxIn(k, 'gear', C, -0.2, ty(1.22), -0.02, 0.05, 0.13, 0.07, GEAR, 0.012);
  if (d.full) {
    const ant = C.clone().multiply(new THREE.Matrix4().compose(V(-0.205, ty(1.48), 0.0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.1), V(1, 1, 1)));
    k.add('gunPolymer', new THREE.CylinderGeometry(0.004, 0.006, 0.36, 6), ant, 0x1f2226, {});
    boxIn(k, 'gear', C, 0.17, ty(0.98), 0.04, 0.05, 0.15, 0.09, GEAR, 0.015);
  }
  if (o.pack !== false) {
    boxIn(k, 'gear', C, 0, ty(1.33), 0.2, 0.24, 0.32, 0.07, GEAR, 0.03);
    boxIn(k, 'gear', C, 0, ty(1.24), 0.238, 0.2, 0.1, 0.012, t.dark, 0.006);
    if (d.full) capsule(k, 'figRubber', Tp(0.11, 1.48, 0.18), Tp(0.15, 1.5, -0.1), 0.006, 0x1d1e20, 6);
  }
}

function humanHead(k: Kit, s: Skeleton, o: FigureOpts, t: Team, d: Detail): void {
  const H = s.head;
  const skin = o.skin ?? 0xd9a77e;
  const ws = d.full ? 28 : 10;
  const hs = d.full ? 20 : 7;
  // Skull, jaw, nose, ears and a brow: proportions of a real head, not a box.
  geoIn(k, 'skin', H, new THREE.SphereGeometry(1, ws, hs), 0, 0.15, 0.01, skin, undefined, V(0.088, 0.107, 0.1));
  geoIn(k, 'skin', H, new THREE.SphereGeometry(1, ws, hs), 0, 0.083, -0.022, skin, new THREE.Euler(0.25, 0, 0), V(0.07, 0.064, 0.084));
  const nose = new THREE.BoxGeometry(0.024, 0.044, 0.03, 1, 2, 1);
  const np = nose.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < np.count; i++) if (np.getY(i) > 0) np.setXYZ(i, np.getX(i) * 0.5, np.getY(i), np.getZ(i) + 0.008);
  nose.computeVertexNormals();
  // The mesh mask covers the nose, so only bare faces get one.
  if ((o.face ?? 'mask') === 'bare') geoIn(k, 'skin', H, nose, 0, 0.116, -0.102, new THREE.Color(skin).multiplyScalar(0.97), new THREE.Euler(-0.18, 0, 0), V(0.95, 1.05, 1.05));
  for (const sd of [-1, 1]) {
    geoIn(k, 'skin', H, new THREE.SphereGeometry(1, 10, 8), sd * 0.088, 0.132, 0.014, new THREE.Color(skin).multiplyScalar(0.94), undefined, V(0.014, 0.032, 0.022));
    // Cheekbones and the line of the jaw.
    geoIn(k, 'skin', H, new THREE.SphereGeometry(1, 12, 8), sd * 0.048, 0.114, -0.066, skin, undefined, V(0.024, 0.018, 0.026));
    geoIn(k, 'skin', H, new THREE.SphereGeometry(1, 12, 8), sd * 0.05, 0.07, -0.03, skin, new THREE.Euler(0, sd * 0.4, 0), V(0.024, 0.026, 0.046));
  }
  // Chin.
  geoIn(k, 'skin', H, new THREE.SphereGeometry(1, 12, 8), 0, 0.05, -0.076, skin, undefined, V(0.026, 0.018, 0.02));
  const face = o.face ?? 'mask';
  if (face === 'bare') {
    // Lips: a darker upper and lower lip, the line between them.
    geoIn(k, 'skin', H, new THREE.CapsuleGeometry(0.006, 0.026, 3, 8).rotateZ(Math.PI / 2), 0, 0.081, -0.095, new THREE.Color(skin).multiplyScalar(0.82).lerp(new THREE.Color(0x9a4a42), 0.25));
    geoIn(k, 'skin', H, new THREE.CapsuleGeometry(0.0068, 0.022, 3, 8).rotateZ(Math.PI / 2), 0, 0.069, -0.093, new THREE.Color(skin).multiplyScalar(0.85).lerp(new THREE.Color(0x9a4a42), 0.2));
    geoIn(k, 'dark', H, new THREE.BoxGeometry(0.03, 0.0015, 0.004), 0, 0.075, -0.1, 0x3a2420);
    if (o.beard) {
      const beard = shellGeo(ws, hs, (f) => (f > 0.2 ? 3.1 : 3.1));
      geoIn(k, 'hair', H, beard, 0, 0.083, -0.022, o.hair ?? 0x2d221b, new THREE.Euler(Math.PI + 0.25, 0, 0), V(0.075, 0.068, 0.089));
    }
  }
  const hg = o.headgear ?? 'helmet';
  if (hg !== 'helmet') {
    // Short hair at the back and sides.
    geoIn(k, 'hair', H, shellGeo(ws, hs, (f) => (f > 0 ? 1.55 - f * 0.55 : 1.55 - f * 0.5)), 0, 0.15, 0.012, o.hair ?? 0x2d221b, undefined, V(0.092, 0.111, 0.104));
  }
  // Goggles: a strap round the head, a thick rubber frame, a mirrored lens in the team's tint, vents.
  geoIn(k, 'gear', H, new THREE.CylinderGeometry(0.104, 0.104, 0.026, ws, 1, true), 0, 0.152, 0.012, GEAR_DARK);
  // The frame dips over the nose and rounds off at its ends; the lens follows the same outline, inset.
  const gs = d.full ? 44 : 8;
  const noseCut = (xn: number, w: number, depth: number) => depth * Math.max(0, 1 - (xn / w) ** 2) ** 1.5;
  const frameLo = (xn: number) => -0.029 + noseCut(xn, 0.19, 0.024) + 0.016 * xn ** 8;
  const frameHi = (xn: number) => 0.029 - 0.004 * xn * xn - 0.014 * xn ** 8;
  geoIn(k, 'figRubber', H, shapedBand(0.25, 0.02, 0.112, gs, d.full ? 6 : 2, frameLo, frameHi), 0, 0.15, 0.004, 0x1f2125);
  const lensLo = (xn: number) => -0.021 + noseCut(xn, 0.22, 0.02) + 0.012 * xn ** 8;
  const lensHi = (xn: number) => 0.021 - 0.003 * xn * xn - 0.01 * xn ** 8;
  geoIn(k, 'mirror', H, shapedBand(0.218, 0.004, 0.124, gs, d.full ? 6 : 2, lensLo, lensHi, 0.003), 0, 0.151, 0.004, t.lens);
  if (d.full) {
    // A raised lip round the lens and a hinge-like clip at each end where the strap joins.
    geoIn(k, 'figRubber', H, shapedBand(0.228, 0.006, 0.122, gs, 1, (xn) => lensHi(xn) - 0.001, (xn) => lensHi(xn) + 0.004), 0, 0.151, 0.004, 0x2a2c31);
    geoIn(k, 'figRubber', H, shapedBand(0.228, 0.006, 0.122, gs, 1, (xn) => lensLo(xn) - 0.004, (xn) => lensLo(xn) + 0.001), 0, 0.151, 0.004, 0x2a2c31);
    for (const sd of [-1, 1]) geoIn(k, 'gunPolymer', H, new THREE.BoxGeometry(0.008, 0.026, 0.02), sd * 0.111, 0.151, -0.02, 0x15161a, new THREE.Euler(0, sd * 0.35, 0));
  }
  if (d.full) {
    for (const x of [-0.05, -0.025, 0.025, 0.05]) geoIn(k, 'dark', H, new THREE.BoxGeometry(0.014, 0.004, 0.008), x, 0.178, -0.11 + Math.abs(x) * 0.15, 0x0f1012);
    for (const sd of [-1, 1]) geoIn(k, 'figRubber', H, new THREE.BoxGeometry(0.012, 0.03, 0.018), sd * 0.103, 0.152, -0.03, 0x1f2125);
  }
  if (face === 'mask') {
    // A perforated steel mesh mask with rubber trim and its own strap.
    // Cupped round the mouth, its lower edge sweeping up towards the ears along the jaw.
    const ms = d.full ? 40 : 8;
    // It rises to a peak over the nose, tucking under the goggles' nose cut-out.
    const maskLo = (xn: number) => -0.04 + 0.03 * xn * xn;
    const maskHi = (xn: number) => 0.03 + 0.014 * Math.max(0, 1 - (xn / 0.3) ** 2) - 0.006 * xn * xn;
    geoIn(k, 'meshMask', H, shapedBand(0.29, 0.005, 0.098, ms, d.full ? 8 : 2, maskLo, maskHi, 0.018), 0, 0.085, -0.004, 0x5f646b);
    geoIn(k, 'figRubber', H, shapedBand(0.296, 0.01, 0.098, ms, 1, (xn) => maskHi(xn) - 0.004, (xn) => maskHi(xn) + 0.005, 0.018 * 0.6), 0, 0.085, -0.004, 0x1f2125);
    geoIn(k, 'figRubber', H, shapedBand(0.296, 0.01, 0.098, ms, 1, (xn) => maskLo(xn) - 0.005, (xn) => maskLo(xn) + 0.004, 0.018 * 0.6), 0, 0.085, -0.004, 0x1f2125);
    geoIn(k, 'gear', H, new THREE.CylinderGeometry(0.098, 0.098, 0.018, ws, 1, true), 0, 0.085, 0.014, GEAR_DARK);
  }
  if (hg === 'helmet' || hg === 'bump') {
    // A high-cut helmet: the shell comes down low at the back, high over the ears, to the brow at the front.
    const cut = (f: number, side: number) => (f >= 0 ? 1.66 - 0.36 * f : 1.66 + 0.5 * -f) - (hg === 'helmet' ? 0.16 * THREE.MathUtils.smoothstep(side, 0.75, 0.97) * (1 - Math.abs(f)) : 0);
    const shell = shellGeo(d.full ? 36 : 12, d.full ? 18 : 6, cut);
    const sc = V(0.118, 0.122, 0.128);
    geoIn(k, 'armour', H, shell, 0, 0.148, 0.012, t.main, undefined, sc);
    geoIn(k, 'gear', H, inside(shell, 0.95), 0, 0.148, 0.012, GEAR_DARK, undefined, sc);
    if (hg === 'helmet') {
      for (const sd of [-1, 1]) {
        const rail = band(0.14, 0.018, 0.012, 0.13, d.full ? 10 : 3);
        rail.rotateY(sd * Math.PI / 2);
        geoIn(k, 'gunPolymer', H, rail, 0, 0.165, 0.012, 0x2a2d32, new THREE.Euler(0, 0, -sd * 0.05));
        // Headset cups under the rails, a boom mic on the left.
        geoIn(k, 'gear', H, new THREE.CylinderGeometry(0.04, 0.043, 0.034, d.full ? 18 : 8).rotateZ(Math.PI / 2), sd * 0.104, 0.128, 0.012, GEAR);
      }
      geoIn(k, 'gunPolymer', H, new THREE.BoxGeometry(0.05, 0.03, 0.02), 0, 0.212, -0.118, 0x2a2d32, new THREE.Euler(-0.55, 0, 0));
      if (d.full) {
        capsule(k, 'gunPolymer', V(-0.112, 0.12, -0.01).applyMatrix4(H), V(-0.05, 0.075, -0.115).applyMatrix4(H), 0.004, 0x1f2125, 6);
        geoIn(k, 'gear', H, band(0.1, 0.05, 0.006, 0.135, 8).rotateY(Math.PI), 0, 0.205, 0.012, t.dark, new THREE.Euler(0.1, 0, 0));
        geoIn(k, 'gear', H, new THREE.BoxGeometry(0.08, 0.05, 0.03), 0, 0.13, 0.142, GEAR, new THREE.Euler(0.25, 0, 0));
        geoIn(k, 'gear', H, new THREE.BoxGeometry(0.07, 0.006, 0.09), 0, 0.266, 0.02, t.dark, new THREE.Euler(0.1, 0, 0));
        geoIn(k, 'gunPolymer', H, new THREE.BoxGeometry(0.022, 0.018, 0.026), 0, 0.262, 0.075, 0x1f2125);
        if (k.p.emissive) geoIn(k, 'figGlow', H, new THREE.BoxGeometry(0.012, 0.008, 0.004), 0, 0.264, 0.089, new THREE.Color(0xff3030).multiplyScalar(5));
        for (const sd of [-1, 1]) capsule(k, 'gear', V(sd * 0.11, 0.155, -0.04).applyMatrix4(H), V(sd * 0.05, 0.04, -0.06).applyMatrix4(H), 0.005, GEAR_DARK, 6);
      }
    } else {
      if (d.full) for (const z of [-0.04, 0.0, 0.04]) for (const sd of [-1, 1]) geoIn(k, 'dark', H, new THREE.BoxGeometry(0.012, 0.006, 0.028), sd * 0.04, 0.258 - Math.abs(z) * 0.4, z, 0x111214);
      for (const sd of [-1, 1]) geoIn(k, 'gear', H, new THREE.CylinderGeometry(0.038, 0.04, 0.03, d.full ? 18 : 8).rotateZ(Math.PI / 2), sd * 0.1, 0.128, 0.012, GEAR);
    }
  } else if (hg === 'cap') {
    geoIn(k, 'cloth', H, shellGeo(d.full ? 28 : 10, d.full ? 10 : 4, () => 1.6), 0, 0.17, 0.008, t.main, undefined, V(0.1, 0.09, 0.11));
    geoIn(k, 'cloth', H, band(0.17, 0.007, 0.08, 0.145, d.full ? 14 : 4), 0, 0.172, 0.006, t.dark, new THREE.Euler(-0.12, 0, 0));
    geoIn(k, 'cloth', H, new THREE.SphereGeometry(0.008, 8, 6), 0, 0.262, 0.008, t.dark);
    for (const sd of [-1, 1]) geoIn(k, 'gear', H, new THREE.CylinderGeometry(0.036, 0.038, 0.028, d.full ? 18 : 8).rotateZ(Math.PI / 2), sd * 0.098, 0.13, 0.012, GEAR);
  }
}

function humanArms(k: Kit, s: Skeleton, t: Team, d: Detail, wrists: { side: number; wrist: THREE.Vector3; out: THREE.Vector3 }[], shoulders: [THREE.Vector3, THREE.Vector3], viewmodel = false): void {
  const st: HandStyle = { kind: 'glove', main: GLOVE, dark: GLOVE, accent: t.main };
  for (const { side, wrist, out } of wrists) {
    const sh = shoulders[side < 0 ? 0 : 1];
    const pole = viewmodel ? V(side, -1, 0.2) : wrist.y > 1.8 ? V(1, 0, 0.3) : V(side * 0.9, -1, 0.3);
    const elbow = ik(sh, wrist, 0.29, 0.27, pole);
    const up = limb(k, 'camo', sh, elbow, [[0, 0.06, 0.058], [0.45, 0.054, 0.052], [1, 0.046, 0.045]], t.camo, d, [{ at: 0.9, width: 0.08, amp: 0.1 }, { at: 0.55, width: 0.15, amp: 0.035 }], pole);
    limb(k, 'camo', elbow, wrist.clone().addScaledVector(out, -0.02), [[0, 0.048, 0.047], [0.3, 0.048, 0.046], [0.85, 0.038, 0.035], [1, 0.041, 0.038]], t.camo, d, [{ at: 0.1, width: 0.09, amp: 0.1 }, { at: 0.72, width: 0.12, amp: 0.07 }], pole);
    sphere(k, 'camo', elbow, 0.047, t.camo, d);
    if (!viewmodel) sphere(k, 'camo', sh, 0.062, t.camo, d);
    // A team armband on the upper arm (how airsoft teams tell each other apart), a velcro patch.
    const ul = sh.distanceTo(elbow);
    const ad = elbow.clone().sub(sh).normalize();
    limb(k, 'cloth', sh.clone().addScaledVector(ad, ul * 0.42), sh.clone().addScaledVector(ad, ul * 0.6), [[0, 0.0575, 0.0555], [1, 0.0545, 0.0525]], t.main, d, [], pole, 0);
    if (d.full) boxIn(k, 'gear', up, side * 0.05, ul * 0.25, 0, 0.012, 0.055, 0.07, t.dark, 0.004, new THREE.Euler(0, 0, 0));
    // Glove cuff over the sleeve, a velcro tab in the team colour.
    const fd = wrist.clone().sub(elbow).normalize();
    limb(k, 'glove', wrist.clone().addScaledVector(fd, -0.045), wrist.clone().addScaledVector(fd, 0.01), [[0, 0.041, 0.039], [1, 0.037, 0.035]], st.dark, d, [], pole, 0);
    if (d.full) limb(k, 'gear', wrist.clone().addScaledVector(fd, -0.04), wrist.clone().addScaledVector(fd, -0.025), [[0, 0.0425, 0.0405], [1, 0.0425, 0.0405]], t.main, d, [], pole, 0);
    if (viewmodel && side < 0 && d.full) {
      // A watch on the left wrist, just above the glove.
      const wpos = wrist.clone().addScaledVector(fd, -0.07);
      const wm = basis(fd, V(0, 1, 0));
      wm.setPosition(wpos);
      k.add('gunPolymer', k.boxGeo(0.044, 0.04, 0.012, 0.006), wm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.043)), 0x1f2226, {});
      k.add('lens', new THREE.BoxGeometry(0.03, 0.03, 0.002), wm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.05)), 0x30404a, {});
      limb(k, 'figRubber', wrist.clone().addScaledVector(fd, -0.084), wrist.clone().addScaledVector(fd, -0.06), [[0, 0.041, 0.039], [1, 0.041, 0.039]], 0x1f2226, d, [], V(0, 1, 0), 0);
    }
  }
}

// ---------------------------------------------------------------- robots

/** Robot colours: a light shell for Blue, a dark shell for Orange, team panels on both. */
function robotStyle(t: Team): HandStyle {
  return { kind: 'robot', main: t.shell, dark: JOINT, accent: t.main };
}

function robotLimb(k: Kit, a: THREE.Vector3, b: THREE.Vector3, rA: number, rB: number, t: Team, d: Detail, pole: THREE.Vector3, panel = true): THREE.Matrix4 {
  const dir = b.clone().sub(a).normalize();
  const len = a.distanceTo(b);
  capsule(k, 'joint', a, b, Math.min(rA, rB) * 0.55, JOINT, d.full ? 12 : 6);
  const radial = d.full ? 8 : 6;
  const g = limbGeo(len * 0.72, [[0, rA * 0.92, rA * 0.88], [0.25, rA, rA * 0.95], [1, rB, rB * 0.94]], radial, d.full ? 6 : 2);
  const m = between(k, 'shell', g, a.clone().addScaledVector(dir, len * 0.12), b, t.shell, pole);
  if (panel) {
    const p = basis(dir, pole);
    p.setPosition(a.clone().addScaledVector(dir, len * 0.45));
    k.add('shell', k.boxGeo(rA * 0.9, len * 0.32, 0.01, 0.003), p.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, rA * 0.97)), t.main, {});
  }
  return m;
}

function hinge(k: Kit, at: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number, wdt: number, d: Detail, cap = 0x2c3036): void {
  const ax = new THREE.Vector3().crossVectors(a.clone().sub(at), b.clone().sub(at));
  if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0);
  ax.normalize();
  const m = basis(ax, a.clone().sub(at));
  m.setPosition(at);
  k.add('joint', new THREE.CylinderGeometry(r, r, wdt, d.full ? 18 : 8), m, cap, {});
  if (d.full) k.add('chrome', new THREE.CylinderGeometry(r * 0.45, r * 0.45, wdt + 0.012, 12), m, CHROME, {});
}

function piston(k: Kit, a: THREE.Vector3, b: THREE.Vector3, d: Detail): void {
  if (!d.full) return;
  const mid = a.clone().lerp(b, 0.55);
  capsule(k, 'joint', a, mid, 0.011, JOINT, 8);
  capsule(k, 'chrome', mid, b, 0.0065, CHROME, 8);
}

function robotLegs(k: Kit, s: Skeleton, t: Team, d: Detail): void {
  for (const { hip, knee, foot, side, boot } of s.legs) {
    const ankle = foot.clone().add(V(0, 0.04, 0));
    const pole = V(side * 0.15, 0, -1);
    robotLimb(k, hip, knee, 0.078, 0.06, t, d, pole);
    robotLimb(k, knee, ankle, 0.058, 0.044, t, d, pole, false);
    hinge(k, knee, hip, ankle, 0.05, 0.1, d);
    hinge(k, ankle, knee, ankle.clone().add(V(0, 0, -0.2)), 0.034, 0.075, d);
    sphere(k, 'joint', hip, 0.06, JOINT, d);
    // A knee cap plate in the team colour, a calf piston.
    const shin = ankle.clone().sub(knee).normalize();
    const kn = pole.clone().addScaledVector(shin, -pole.dot(shin)).normalize();
    const pm = basis(shin, kn);
    pm.setPosition(knee.clone().addScaledVector(kn, 0.052).addScaledVector(shin, 0.03));
    k.add('shell', k.boxGeo(0.085, 0.11, 0.03, 0.01), pm, t.main, {});
    piston(k, knee.clone().addScaledVector(kn, -0.05).addScaledVector(shin, 0.06), ankle.clone().addScaledVector(kn, -0.04).addScaledVector(shin, -0.04), d);
    // Feet: a sole plate, an ankle block, a hinged toe.
    geoIn(k, 'shell', boot, k.boxGeo(0.115, 0.06, 0.2, 0.014), 0, -0.055, -0.01, t.shell);
    geoIn(k, 'shell', boot, k.boxGeo(0.105, 0.04, 0.09, 0.012), 0, -0.07, -0.16, t.shell, new THREE.Euler(0.08, 0, 0));
    geoIn(k, 'joint', boot, new THREE.BoxGeometry(0.125, 0.022, 0.31), 0, -0.088, -0.05, JOINT);
    if (d.full) geoIn(k, 'joint', boot, new THREE.CylinderGeometry(0.012, 0.012, 0.11, 10).rotateZ(Math.PI / 2), 0, -0.07, -0.112, JOINT);
  }
}

function robotTorso(k: Kit, s: Skeleton, o: FigureOpts, t: Team, d: Detail): void {
  const { chest: C, ty } = s;
  const Tp = (x: number, y: number, z: number) => V(x, ty(y), z).applyMatrix4(C);
  // Pelvis block, an exposed spine of rings and cables, a chest shell with a collar and team panels.
  boxIn(k, 'shell', C, 0, ty(0.95), 0, 0.3, 0.14, 0.2, t.shell, 0.03);
  boxIn(k, 'shell', C, 0, ty(0.95), -0.103, 0.14, 0.08, 0.01, t.main, 0.003);
  capsule(k, 'joint', Tp(0, 0.98, 0.0), Tp(0, 1.25, 0.0), 0.06, JOINT, d.full ? 14 : 6);
  for (const [y, r] of [[1.06, 0.105], [1.115, 0.1], [1.17, 0.108]] as const) geoIn(k, 'joint', C, new THREE.CylinderGeometry(r, r, 0.035, d.full ? 22 : 8), 0, ty(y), 0, JOINT, undefined, V(1.2, 1, 0.8));
  if (d.full) for (const x of [-0.06, 0.06]) capsule(k, 'figRubber', Tp(x, 1.0, 0.07), Tp(x * 1.2, 1.25, 0.08), 0.009, 0x1d1f23, 8);
  boxIn(k, 'shell', C, 0, ty(1.36), 0, 0.38, 0.27, 0.24, t.shell, 0.05);
  boxIn(k, 'shell', C, 0, ty(1.5), 0, 0.22, 0.05, 0.16, t.shell, 0.02);
  for (const sd of [-1, 1]) boxIn(k, 'shell', C, sd * 0.12, ty(1.42), -0.122, 0.11, 0.08, 0.012, t.main, 0.004);
  limb(k, 'joint', Tp(0, 1.5, 0.0), Tp(0, 1.61, 0.0), [[0, 0.04, 0.04], [1, 0.035, 0.035]], JOINT, d, [], V(0, 0, -1).transformDirection(C), 0);
  if (d.full) {
    for (const y of [1.53, 1.56, 1.59]) geoIn(k, 'joint', C, new THREE.CylinderGeometry(0.048, 0.048, 0.012, 16), 0, ty(y), 0, 0x3a3f46);
    for (const x of [-0.03, 0.03]) capsule(k, 'figRubber', Tp(x, 1.48, 0.04), Tp(x, 1.62, 0.03), 0.006, 0x1d1f23, 6);
    // Panel screws and a serial plate.
    boxIn(k, 'gunPolymer', C, -0.12, ty(1.28), -0.121, 0.08, 0.022, 0.004, 0x1f2226, 0.002);
  }
  // The same chest rig the humans wear: airsoft first, robot second.
  for (let i = 0; i < 3; i++) {
    const x = -0.095 + i * 0.095;
    boxIn(k, 'gear', C, x, ty(1.255), -0.142, 0.082, 0.13, 0.05, GEAR, 0.012);
    boxIn(k, 'gunPolymer', C, x, ty(1.33), -0.142, 0.06, 0.03, 0.028, 0x24272c, 0.005);
  }
  for (const sd of [-1, 1]) {
    boxIn(k, 'gear', C, sd * 0.11, ty(1.42), 0, 0.06, 0.32, 0.27, GEAR_DARK, 0.01);
    sphere(k, 'joint', Tp(sd * 0.21, 1.465, 0), 0.062, JOINT, d);
    boxIn(k, 'shell', C, sd * 0.235, ty(1.5), 0, 0.12, 0.05, 0.14, t.shell, 0.02, new THREE.Euler(0, 0, -sd * 0.35));
  }
  if (o.pack !== false) boxIn(k, 'gear', C, 0, ty(1.33), 0.155, 0.24, 0.3, 0.07, GEAR, 0.03);
}

function robotHead(k: Kit, s: Skeleton, o: FigureOpts, t: Team, d: Detail): void {
  const H = s.head;
  const hit = o.pose === 'hit';
  // A sensor head: a rounded skull, a face plate with vents, a wraparound visor with a light line (red when HIT).
  boxIn(k, 'shell', H, 0, 0.15, 0.01, 0.17, 0.19, 0.2, t.shell, 0.028);
  boxIn(k, 'shell', H, 0, 0.192, -0.088, 0.16, 0.03, 0.04, t.shell, 0.01, new THREE.Euler(0.3, 0, 0));
  boxIn(k, 'joint', H, 0, 0.078, -0.07, 0.13, 0.07, 0.07, JOINT, 0.02);
  if (d.full) for (let i = 0; i < 4; i++) boxIn(k, 'dark', H, 0, 0.06 + i * 0.012, -0.106, 0.08, 0.004, 0.004, 0x0e0f11, 0.001);
  geoIn(k, 'visor', H, band(0.2, 0.05, 0.012, 0.104, d.full ? 18 : 6), 0, 0.155, 0.0, 0x10161e);
  if (k.p.emissive) geoIn(k, 'figGlow', H, band(0.16, 0.008, 0.002, 0.111, d.full ? 18 : 6), 0, 0.155, 0.0, new THREE.Color(hit ? 0xff3030 : t.glow).multiplyScalar(5));
  for (const sd of [-1, 1]) {
    geoIn(k, 'joint', H, new THREE.CylinderGeometry(0.036, 0.036, 0.03, d.full ? 18 : 8).rotateZ(Math.PI / 2), sd * 0.094, 0.14, 0.015, JOINT);
    geoIn(k, 'shell', H, new THREE.CylinderGeometry(0.026, 0.026, 0.008, d.full ? 18 : 8).rotateZ(Math.PI / 2), sd * 0.112, 0.14, 0.015, t.main);
  }
  boxIn(k, 'shell', H, 0, 0.248, 0.02, 0.05, 0.016, 0.15, t.main, 0.005);
  if (d.full) {
    capsule(k, 'gunPolymer', V(-0.1, 0.16, 0.03).applyMatrix4(H), V(-0.13, 0.36, 0.09).applyMatrix4(H), 0.004, 0x1f2226, 6);
    if (k.p.emissive) sphere(k, 'figGlow', V(-0.13, 0.36, 0.09).applyMatrix4(H), 0.008, new THREE.Color(t.glow).multiplyScalar(5), d);
  }
}

function robotArms(k: Kit, s: Skeleton, t: Team, d: Detail, wrists: { side: number; wrist: THREE.Vector3; out: THREE.Vector3 }[], shoulders: [THREE.Vector3, THREE.Vector3], viewmodel = false): void {
  for (const { side, wrist } of wrists) {
    const sh = shoulders[side < 0 ? 0 : 1];
    const pole = viewmodel ? V(side, -1, 0.2) : wrist.y > 1.8 ? V(1, 0, 0.3) : V(side * 0.9, -1, 0.3);
    const elbow = ik(sh, wrist, 0.29, 0.27, pole);
    robotLimb(k, sh, elbow, 0.056, 0.046, t, d, pole);
    robotLimb(k, elbow, wrist, 0.05, 0.038, t, d, pole, false);
    hinge(k, elbow, sh, wrist, 0.042, 0.085, d);
    const fd = wrist.clone().sub(elbow).normalize();
    const pn = pole.clone().addScaledVector(fd, -pole.dot(fd)).normalize();
    piston(k, elbow.clone().addScaledVector(fd, 0.05).addScaledVector(pn, 0.05), wrist.clone().addScaledVector(fd, -0.05).addScaledVector(pn, 0.035), d);
    const p = basis(fd, pn.clone().negate());
    p.setPosition(elbow.clone().lerp(wrist, 0.45));
    k.add('shell', k.boxGeo(0.05, 0.12, 0.012, 0.004), p.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.048)), t.main, {});
    if (k.p.emissive && d.full) k.add('figGlow', new THREE.BoxGeometry(0.006, 0.09, 0.003), p.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.055)), new THREE.Color(t.glow).multiplyScalar(4), {});
    const wm = basis(fd, pn);
    wm.setPosition(wrist.clone().addScaledVector(fd, -0.012));
    k.add('joint', new THREE.CylinderGeometry(0.036, 0.036, 0.03, d.full ? 18 : 8), wm, JOINT, {});
  }
}

// ---------------------------------------------------------------- building

export interface Figure {
  group: THREE.Group;
}

function hands(k: Kit, s: Skeleton, st: HandStyle): { side: number; wrist: THREE.Vector3; out: THREE.Vector3 }[] {
  const out: { side: number; wrist: THREE.Vector3; out: THREE.Vector3 }[] = [];
  for (const g of s.grips) {
    if (g.wrap) {
      const h = gripHand(k, g.wrap, st, g.trigger);
      out.push({ side: g.side, ...h });
    } else {
      // The hand called up for HIT: high above the shoulder, palm forward.
      const wrist = s.cp(0.26, 2.0, -0.04);
      openHand(k, wrist, V(0.05, 1, 0), V(0, 0, -1), st, g.side);
      out.push({ side: g.side, wrist, out: V(0, 1, 0) });
    }
  }
  return out;
}

export function buildFigure(k: Kit, o: FigureOpts): Figure {
  const t = TEAM[o.team];
  const d = detail(k);
  const s = skeleton(k, o, t);
  if (o.robot) {
    robotLegs(k, s, t, d);
    robotTorso(k, s, o, t, d);
    robotHead(k, s, o, t, d);
    robotArms(k, s, t, d, hands(k, s, robotStyle(t)), s.shoulders);
  } else {
    humanLegs(k, s, t, d);
    humanTorso(k, s, o, t, d);
    humanHead(k, s, o, t, d);
    humanArms(k, s, t, d, hands(k, s, { kind: 'glove', main: GLOVE, dark: GLOVE, accent: t.main }), s.shoulders);
  }
  const group = k.build();
  group.add(s.rep.group);
  return { group };
}

export interface ViewmodelOpts {
  robot?: boolean;
  /** The replica's place in camera space and its turn (yaw, pitch, roll). */
  at?: THREE.Vector3;
  turn?: THREE.Euler;
  shoulders?: [THREE.Vector3, THREE.Vector3];
}

/** First-person arms and replica, in camera space (camera looks down -Z). */
export function buildViewmodel(k: Kit, team: 'blue' | 'orange', id: ReplicaId, opts: ReplicaOpts, vo: ViewmodelOpts = {}): THREE.Group {
  const t = TEAM[team];
  const d = detail(k);
  const k2 = new Kit(k.p);
  k2.envMap = k.envMap;
  const rep = buildReplica(k2, id, opts);
  const wm = new THREE.Matrix4().compose(vo.at ?? V(0.23, -0.27, -0.5), new THREE.Quaternion().setFromEuler(vo.turn ?? new THREE.Euler(0.03, 0.07, -0.04, 'YXZ')), V(1, 1, 1));
  rep.group.applyMatrix4(wm);
  const R = V(1, 0, 0);
  const L = V(-1, 0, 0);
  const FWD = V(0, 0, -1);
  const grips: Skeleton['grips'] = [];
  if (id === 'aeg') {
    grips.push({ side: -1, wrap: rep.supportGrip ? toWorld(rep.supportGrip, wm, L, FWD) : toWorld({ top: V(0, 0.032, -0.34), bottom: V(0, 0.032, -0.25), hx: 0.033, hd: 0.031 }, wm, V(0, -1, 0), R) });
  } else {
    grips.push({ side: -1, wrap: toWorld(rep.hand, wm, L, FWD, 0.021, 0.7) });
  }
  grips.push({ side: 1, wrap: toWorld(rep.hand, wm, R, FWD), trigger: rep.trigger.clone().applyMatrix4(wm) });
  const shoulders = vo.shoulders ?? [V(-0.2, -0.5, 0.05), V(0.3, -0.5, 0.1)];
  const s = { grips, cp: (x: number, y: number, z: number) => V(x, y, z) } as unknown as Skeleton;
  if (vo.robot) robotArms(k, s, t, d, hands(k, s, robotStyle(t)), shoulders, true);
  else humanArms(k, s, t, d, hands(k, s, { kind: 'glove', main: GLOVE, dark: GLOVE, accent: t.main }), shoulders, true);
  const g = k.build(false);
  g.add(rep.group);
  return g;
}
