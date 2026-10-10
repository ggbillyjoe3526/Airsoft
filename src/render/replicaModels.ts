import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FingerCurl, HandPose } from './handModels';
import { type ArmBuilders, armBuilders, type ArmStyle, HUMAN_ARMS } from './replicaArms';
import type { MagazineId } from '../config/attachments';
import { REPLICA_FINISH } from '../config/replicaFinish';
import type { ReplicaConfig } from '../config/replicas';
import { CYBER_COLOURS, type ReplicaPaint } from '../config/schemes';
import { LASERS } from '../config/lasers';
import { TORCHES } from '../config/torches';
import { speckleTextures } from './replicaFinish';
import { AEG_GAS_BLOCK_END, AEG_MAGAZINES, AEG_MUZZLE, AEG_MUZZLE_DEVICES, AEG_PARTS, CYBER_MAGAZINES, CYBER_MUZZLE, CYBER_PARTS, type MuzzleDraw, type MuzzleLayout, type PartDraw, PISTOL_LASER_LENS, PISTOL_MAGAZINES, PISTOL_MUZZLE, PISTOL_MUZZLE_DEVICES, PISTOL_PARTS, REPLICA_PART_TABLES } from './replicaParts';
import { coloursOf, createMaterials, LOW_DETAIL, type MaterialKey, ModelBuilder, PAINTED, paintedMaterials, type Pt, type ReplicaDetail } from './replicaBuilder';
import { NO_REPLICA_FILES, type ReplicaFile, type ReplicaFilePiece, type ReplicaFiles } from './replicaFiles';
import { ReplicaRig, withBone } from './replicaRig';
import { REPLICA_FILE } from '../config/assets';

// The public names that moved out with the split stay importable from here.
export { type ArmStyle, HUMAN_ARMS } from './replicaArms';
export { LOW_DETAIL, type ReplicaColours, type ReplicaDetail } from './replicaBuilder';
export { AEG_MUZZLE, CYBER_MUZZLE, type MuzzleLayout, PISTOL_MUZZLE, REPLICA_PART_TABLES, RIFLE_OPTIC, RIFLE_SCOPE } from './replicaParts';

const F = REPLICA_FINISH;

/**
 * First-person replica models built in code. They resemble real-world replica types (an AR-pattern
 * AEG, a polymer striker pistol) but are generic (no brands, logos or copies of a specific design)
 * and rendered stylised (graphics overhaul G2: Marathon's blocky, chamfered slabs with Valorant's clean finish): chunky
 * side-profile silhouettes extruded with soft bevels, plus cylinders and small detail parts, two-tone in the player's
 * colour scheme (config/schemes.ts) with a thin accent line. The orange muzzle tip many real replicas carry is optional
 * (VIEWMODEL.orangeTips).
 *
 * Profiles are drawn as (forward, up) in metres, with the receiver/frame near the origin. Parts are
 * merged per material, so each replica is only a few draw calls.
 *
 * Replica detail `high` (FA8, QualitySettings.replicaDetail; final alpha audit section 5) keeps every silhouette and
 * adds: rounded corners on boxes with a lighter bevel (the CS edge highlight) and lighter worn edges, a moulded speckle
 * (roughness and normal maps) on the polymer and a stipple on the rubber, painted steel that reflects the replica's sheen,
 * real rail slots, ring and post sights, glass lenses and an emissive laser lens, and per-part detail on every optic,
 * grip, magazine and the laser. Hand detail `high` dresses the gloves and sleeves (handModels.ts). Low keeps
 * the same shapes, plain, with steel, rubber and stipple in the detail material, so it draws no more triangles and no
 * more meshes per part than before G2.
 */

// Hand poses (joint bends in radians: knuckle, middle, tip).
/** Pistol-grip axis, top to bottom: grips rake back about 22 degrees. */
const GRIP_DOWN = [0, -0.93, -0.37] as const;
/** Index finger laid straight along the frame, off the trigger. */
const STRAIGHT_INDEX: FingerCurl = [0.12, 0.08, 0.04];
/** Fingers wrapped round a pistol grip. */
const WRAP: FingerCurl = [1.15, 1.25, 0.7];
/**
 * The rifle's support hand (FA13): palm up under the handguard, the four fingers up its far (right) side, and the thumb
 * set against them on the near (left) side, where you see it holding the rifle. Before, the thumb followed the fingers
 * under the handguard, so all you saw was a glove below it. The thumb steps out round the bottom corner and lies forward
 * along the side under the side rail (FP1): aimed up and out past the side, it read in first person as a second barrel
 * under the real one. Each finger's bends are the closest it lies along the side without going into it
 * (`handPoses.test.ts` measures it).
 */
export const AEG_SUPPORT_POSE: HandPose = {
  side: 'left',
  palm: [-0.016, -0.017, 0.29],
  across: [0, 0, -1],
  back: [0, -1, 0],
  fingers: [
    [1.0, 0.6, 0.2],
    [1.1, 0.6, 0.5],
    [1.0, 0.6, 0.2],
    [0.8, 0.6, 0.4],
  ],
  thumb: { swing: 0.2, curl: [0, -0.2], aim: [-0.03, 0.02, 0.008], tipAim: [0.08, 0.1, 1] },
};

/**
 * The rifle's support hand on a fitted vertical grip: wrapped round it as the right hand wraps the pistol grip (palm on
 * its near side, fingers round its front to the far side), the thumb laid along the handguard's near side above it.
 */
export const AEG_VERTICAL_GRIP_POSE: HandPose = {
  side: 'left',
  palm: [-0.032, -0.054, 0.21],
  across: [0.3, -1, 0.05],
  back: [-1, 0, 0],
  // Each finger's bends are the closest it wraps the grip without going into it (`handPoses.test.ts` measures it).
  fingers: [
    [1.1, 1.1, 0.5],
    [1.3, 1.1, 0.8],
    [1.2, 1.3, 0.65],
    [1.3, 0.9, 0.65],
  ],
  thumb: { swing: 0.2, curl: [0, 0], aim: [-0.3, 0.35, 1], tipAim: [0.25, 0.05, 1] },
};

/** The AEG's handguard (the rifle's own numbers, below): across ±halfWidth, from bottom to top, forward from → to. */
export const AEG_HANDGUARD = { from: 0.15, to: 0.4, bottom: 0, top: 0.066, halfWidth: 0.029 } as const;
/** Support-hand fingers wrapped over the shooting hand. */
const SUPPORT: FingerCurl = [1.0, 1.05, 0.6];


/**
 * Whether a replica is built with the hands holding it (in first person) or on its own (a picture of it in the
 * menus, G2 itemPictures.ts).
 */
export type HandsShown = 'hands' | 'bare';

/**
 * AR-pattern AEG (G2: the concept's blockier, Marathon-style build, in its scheme): an angular upper with a raised side
 * plate and a flat-top rail, a flared, squared magwell with the accent line along the lower, a solid pistol grip, a
 * squared handguard with chamfered corners (M-LOK slots on high) and its own accent line, a hard-angled stock with a
 * cheek riser and a block butt. Flip-up iron sights (folded down when an optic is fitted), a birdcage flash hider. The
 * optic is its own part, shown only when one is fitted. Every hand point and envelope is as before (AEG_HANDGUARD).
 */
function buildAeg(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null): ReplicaModel {
  const b = new ModelBuilder(detail);
  // Upper receiver: the chamfered slab, its rail, the side plate over the ejection port, forward assist and charging handle.
  b.profile('polymer', [[-0.116, 0.012], [0.15, 0.012], [0.15, 0.058], [-0.094, 0.058], [-0.116, 0.04]], 0.056, 0.004);
  b.rail(-0.09, 0.15, 0.058, 0.022);
  b.box('polymer', 0.06, 0.148, 0.02, 0.05, 0.0624);
  b.box('metal', -0.008, 0.052, 0.022, 0.048, 0.004, 0.029); // ejection port cover
  b.worn(() => b.box('polymer', -0.06, -0.042, 0.024, 0.046, 0.064)); // forward assist block
  b.worn(() => b.box('detail', -0.134, -0.11, 0.042, 0.054, 0.03)); // charging handle
  // Lower receiver with the flared magwell and its lip, the accent line, the squared trigger guard and the trigger.
  b.profile('polymer', [[-0.106, -0.034], [0.148, -0.034], [0.148, 0.014], [-0.106, 0.014]], 0.054, 0.004);
  b.profile('polymer', [[0.016, -0.03], [0.108, -0.03], [0.104, -0.086], [0.022, -0.086]], 0.052, 0.004);
  b.box('detail', 0.016, 0.108, -0.092, -0.082, 0.056);
  b.box('accent', 0.06, 0.145, -0.009, -0.003, 0.0552);
  b.profile('detail', [[-0.022, -0.03], [0.032, -0.03], [0.032, -0.074], [-0.028, -0.074]], 0.014, 0.008, [[[-0.014, -0.037], [0.024, -0.037], [0.024, -0.066], [-0.018, -0.066]]]);
  b.box('metal', 0.001, 0.008, -0.058, -0.034, 0.006);
  // Pistol grip: a solid block with a slight rake and a palm shelf, a squared base cap.
  b.worn(() => b.profile('furniture', [[-0.012, -0.032], [-0.06, -0.032], [-0.098, -0.134], [-0.096, -0.146], [-0.062, -0.15], [-0.03, -0.098], [-0.024, -0.07]], 0.036, 0.006));
  b.box('detail', -0.102, -0.06, -0.156, -0.146, 0.038);
  if (b.high) {
    // Stippled panels on the grip, the magazine release on the right of the magwell, the trigger's pivot pin, the selector.
    for (const side of [-1, 1]) b.profile('stipple', [[-0.022, -0.05], [-0.062, -0.05], [-0.09, -0.128], [-0.054, -0.128], [-0.03, -0.088]], 0.003, 0.004, [], side * 0.018);
    b.worn(() => b.box('detail', 0.03, 0.044, -0.018, -0.008, 0.012, 0.029));
    b.crossTube('metal', 0.006, -0.03, 0.0025, 0.05, 0, 8);
    b.crossTube('detail', -0.03, 0.0, 0.006, 0.006, -0.028, 10);
  }
  // Handguard: a squared slab with chamfered front corners in the envelope the support hand holds, its top rail and accent line.
  const H = AEG_HANDGUARD;
  const slotsAt = [0.19, 0.245, 0.3, 0.35];
  const slots = slotsAt.map((x): Pt[] => [[x, 0.02], [x + 0.032, 0.02], [x + 0.032, 0.032], [x, 0.032]]);
  b.profile('furniture', [[H.from, H.bottom], [H.to - 0.01, H.bottom], [H.to, H.bottom + 0.014], [H.to, H.top - 0.01], [H.to - 0.01, H.top], [H.from, H.top]], H.halfWidth * 2, 0.003, b.high ? slots : []);
  if (b.high) b.box('rubber', H.from + 0.02, H.to - 0.02, H.bottom + 0.006, H.top - 0.006, H.halfWidth * 2 - 0.012); // the dark inside, seen through the slots
  else for (const x of slotsAt) b.box('rubber', x, x + 0.032, 0.02, 0.032, H.halfWidth * 2 + 0.002);
  b.rail(0.155, 0.395, H.top, 0.02);
  b.box('accent', H.from + 0.004, H.to - 0.012, 0.048, 0.052, H.halfWidth * 2 + 0.0012);
  if (b.high) for (const side of [-1, 1]) b.sideRail(0.27, 0.39, 0.034, side, H.halfWidth);
  // Barrel and low-profile gas block (the front sight is a flip-up on the rail). The muzzle end (M29b) is drawn from the
  // part tables: a fitted barrel, and the flash hider or a silencer on the muzzle mount, at the fitted barrel's end.
  b.tube('metal', 0.4, 0.165, 0.034, 0.009);
  b.box('detail', 0.43, AEG_GAS_BLOCK_END, 0.022, 0.05, 0.03);
  // Buffer tube and the stock: a hard-angled frame (a lightening cut on high), a cheek riser, a block butt, a rubber pad.
  b.tube('detail', -0.27, 0.165, 0.032, 0.016);
  const cut: Pt[] = [[-0.21, 0.012], [-0.27, 0.012], [-0.288, -0.028], [-0.248, -0.028]];
  b.profile('furniture', [[-0.16, 0.056], [-0.326, 0.062], [-0.342, 0.05], [-0.342, -0.07], [-0.298, -0.076], [-0.226, 0], [-0.16, 0.012]], 0.048, 0.006, b.high ? [cut] : []);
  b.box('furniture', -0.322, -0.2, 0.06, 0.074, 0.04);
  b.box('detail', -0.342, -0.292, -0.076, 0.062, 0.052);
  b.box('rubber', -0.358, -0.342, -0.07, 0.06, 0.05);
  b.box('accent', -0.29, -0.23, 0.054, 0.06, 0.0484);
  // Flip-up iron sights: a rear aperture at the back of the receiver rail and a front post at the front of the
  // handguard rail, standing up on the bare rifle and folded flat under a fitted optic. High: a steel ring with a 2 mm
  // aperture at the back, a post between protective ears at the front.
  const sightsUp = new ModelBuilder(detail);
  sightsUp.box('detail', -0.085, -0.062, 0.074, 0.084, 0.026);
  if (sightsUp.high) {
    sightsUp.profile('detail', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.094], [-0.078, 0.094]], 0.022, 0.003);
    sightsUp.ringTube('metal', -0.0755, 0.004, 0.101, 0.0075, 0.001, 16);
  } else sightsUp.profile('detail', [[-0.08, 0.084], [-0.066, 0.084], [-0.068, 0.112], [-0.078, 0.112]], 0.022, 0.003, [[[-0.0755, 0.098], [-0.0705, 0.098], [-0.0705, 0.104], [-0.0755, 0.104]]]);
  sightsUp.box('detail', 0.365, 0.39, 0.082, 0.092, 0.024);
  if (sightsUp.high) {
    sightsUp.box('metal', 0.376, 0.38, 0.092, 0.11, 0.003); // the post
    for (const side of [-1, 1]) sightsUp.box('detail', 0.37, 0.386, 0.092, 0.112, 0.003, side * 0.007); // its ears
  } else sightsUp.profile('detail', [[0.37, 0.092], [0.386, 0.092], [0.381, 0.112], [0.375, 0.112]], 0.018, 0.002);
  const sightsDown = new ModelBuilder(detail);
  sightsDown.box('detail', -0.088, -0.054, 0.074, 0.082, 0.026);
  sightsDown.box('detail', 0.362, 0.396, 0.082, 0.089, 0.024);

  const support = new ModelBuilder(detail);
  const supportOnGrip = new ModelBuilder(detail);
  if (arms) aegHands(b, support, supportOnGrip, detail, arms);

  const group = b.build(m);
  const magazine = magazinePart(AEG_MAGAZINES, m, detail, AEG_MAG_AXIS, AEG_MAG_BASES);
  group.add(magazine.group);
  const supportHand = supportHandPart(m, aegHolds(support, supportOnGrip, arms));
  group.add(supportHand.group);
  group.add(namedPart(sightsUp, m, 'sightsUp'), namedPart(sightsDown, m, 'sightsDown'));
  for (const [name, draw] of Object.entries(AEG_PARTS)) group.add(drawnPart(draw, m, detail, name));
  const mount = muzzleMount(AEG_MUZZLE, AEG_MUZZLE_DEVICES, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/** The AEG's magwell: the direction its magazine leaves in, as (across, up, forward). */
const AEG_MAG_AXIS = [0, -0.97, 0.25] as const;
/** Where the low-cap's base plate sits against the standard magazine's (the support hand reaches there on a reload). */
const AEG_MAG_BASES = { lowCap: [0, 0.064, -0.002] } as const;

/**
 * The rifle's hands (built-in and from its file, RM1): the right on the pistol grip in `b`, the left on the handguard in
 * `support` and, for a fitted vertical grip, on the grip in `supportOnGrip`.
 */
function aegHands(b: ModelBuilder, support: ModelBuilder, supportOnGrip: ModelBuilder, detail: ReplicaDetail, arms: ArmBuilders): void {
  // Right hand on the pistol grip: back of the hand to the right, knuckle row running down the grip, three fingers
  // wrapped round its front, index finger straight along the frame (trigger discipline), thumb across the left of the
  // receiver.
  const rightWrist = arms.hand(
    b,
    { side: 'right', palm: [0.034, -0.092, -0.074], across: GRIP_DOWN, back: [1, 0, 0], fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP], thumb: { swing: 0.9, curl: [0.3, 0.3] } },
    detail.hands,
  );
  arms.forearm(b, rightWrist, [0.2, -0.3, -0.42], undefined, detail.hands);
  // Left hand cradling the handguard: palm underneath, index finger forward, fingers curling up the right side, thumb
  // up the left side. Its own part: on reloads it cups the magazine's base plate.
  const leftWrist = arms.hand(support, AEG_SUPPORT_POSE, detail.hands);
  arms.forearm(support, leftWrist, [-0.3, -0.28, 0.02], undefined, detail.hands);
  // With a vertical grip fitted, the left hand holds the grip instead (on reloads it takes the magazine by its side).
  const gripWrist = arms.hand(supportOnGrip, AEG_VERTICAL_GRIP_POSE, detail.hands);
  arms.forearm(supportOnGrip, gripWrist, [-0.3, -0.3, 0.0], undefined, detail.hands);
}

/** The rifle's support-hand holds: from the handguard to just under the magazine's base plate; from the vertical grip to the magazine's side by its base. */
function aegHolds(support: ModelBuilder, supportOnGrip: ModelBuilder, arms: ArmBuilders | null): SupportHold[] {
  return [
    { grip: 'none', builder: support, toMag: [0.016, -0.244, -0.21] },
    ...(arms ? [{ grip: 'vertical', builder: supportOnGrip, toMag: [0, -0.146, -0.135] as const }] : []),
  ];
}

/** The pistols' two-handed grip (the Gas and Cyber Pistols share the grip's line): the right hand round the grip, index finger along the frame; the left pressed against the grip, its fingers over the right hand's. */
function pistolHands(b: ModelBuilder, support: ModelBuilder, detail: ReplicaDetail, arms: ArmBuilders): void {
  const rightWrist = arms.hand(
    b,
    { side: 'right', palm: [0.03, -0.068, -0.078], across: GRIP_DOWN, back: [1, 0, 0], fingers: [STRAIGHT_INDEX, WRAP, WRAP, WRAP], thumb: { swing: 0.6, curl: [0.2, 0.2] } },
    detail.hands,
  );
  arms.forearm(b, rightWrist, [0.1, -0.26, -0.3], undefined, detail.hands);
  const leftWrist = arms.hand(
    support,
    { side: 'left', palm: [-0.034, -0.072, -0.066], across: GRIP_DOWN, back: [-1, 0, 0], fingers: [SUPPORT, SUPPORT, SUPPORT, SUPPORT], thumb: { swing: 0.3, curl: [0.1, 0.1] } },
    detail.hands,
  );
  arms.forearm(support, leftWrist, [-0.16, -0.26, -0.28], undefined, detail.hands);
}

/**
 * Polymer striker-fired gas pistol (G2: squarer, as the concept): an angular slide with top chamfers and the accent line
 * along both sides, a frame with a railed dust cover and a squared trigger guard, a rectangular grip at a steady rake
 * with a short beavertail. High: front and rear serrations, stippled grip panels and a thumb ledge.
 */
function buildPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null): ReplicaModel {
  const b = new ModelBuilder(detail);
  // Slide, its accent line, the barrel hood in the ejection port, sights, muzzle.
  b.profile('polymer', [[-0.09, 0.0], [0.1, 0.0], [0.1, 0.03], [0.092, 0.036], [-0.08, 0.036], [-0.09, 0.03]], 0.032, 0.003);
  b.box('accent', -0.08, 0.094, 0.012, 0.016, 0.0332);
  if (b.high) {
    // Seven grooves at the rear and four at the front, cut on both sides.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) b.box('rubber', -0.083 + i * 0.0065, -0.08 + i * 0.0065, 0.018, 0.033, 0.0008, side * 0.0161);
      for (let i = 0; i < 4; i++) b.box('rubber', 0.07 + i * 0.0065, 0.073 + i * 0.0065, 0.018, 0.033, 0.0008, side * 0.0161);
    }
    b.box('laserLens', 0.0, 0.003, 0.0355, 0.037, 0.003); // loaded-chamber dot
  } else for (let i = 0; i < 6; i++) b.box('rubber', -0.084 + i * 0.008, -0.081 + i * 0.008, 0.018, 0.033, 0.0325);
  b.box('metal', 0.008, 0.044, 0.03, 0.0365, 0.018);
  b.box('detail', -0.084, -0.072, 0.036, 0.045, 0.022); // rear sight
  b.box('detail', 0.086, 0.094, 0.036, 0.043, 0.006); // front sight
  b.tube(orangeTip ? 'orange' : 'rubber', 0.1, 0.004, 0.015, orangeTip ? 0.0095 : 0.006, 12);
  // Frame: the dust cover with an accessory rail, the squared trigger guard, the grip.
  b.profile('furniture', [[-0.085, 0.0], [0.096, 0.0], [0.096, -0.014], [0.038, -0.016], [-0.07, -0.016]], 0.03, 0.003);
  b.box('furniture', 0.042, 0.092, -0.026, -0.014, 0.024);
  for (const x of [0.05, 0.064, 0.078]) b.box('detail', x, x + 0.008, -0.026, -0.019, 0.025);
  b.worn(() => b.profile('furniture', [[-0.012, -0.012], [-0.078, -0.012], [-0.094, -0.003], [-0.099, -0.009], [-0.082, -0.024], [-0.11, -0.128], [-0.106, -0.132], [-0.054, -0.132], [-0.051, -0.129], [-0.024, -0.03]], 0.032, 0.004));
  if (b.high) {
    for (const side of [-1, 1]) b.profile('stipple', [[-0.034, -0.04], [-0.08, -0.04], [-0.1, -0.118], [-0.06, -0.118]], 0.003, 0.004, [], side * 0.016);
    b.box('furniture', -0.026, -0.02, -0.03, -0.024, 0.036); // thumb ledge
  }
  b.profile('furniture', [[-0.03, -0.014], [0.034, -0.014], [0.034, -0.048], [-0.036, -0.046]], 0.01, 0.006, [[[-0.022, -0.02], [0.026, -0.02], [0.026, -0.042], [-0.027, -0.04]]]);
  b.box('detail', -0.004, 0.003, -0.036, -0.016, 0.005); // trigger
  if (b.high) b.crossTube('metal', 0.0, -0.017, 0.0022, 0.012, 0, 8); // its pivot pin

  const support = new ModelBuilder(detail);
  if (arms) pistolHands(b, support, detail, arms);
  const group = b.build(m);
  for (const [name, draw] of Object.entries(PISTOL_PARTS)) group.add(drawnPart(draw, m, detail, name));
  group.getObjectByName('laser:redLaser')?.add(laserBeam(PISTOL_LASER_LENS));
  const magazine = magazinePart(PISTOL_MAGAZINES, m, detail, GRIP_DOWN, { extended: [0, -0.032, 0] });
  group.add(magazine.group);
  // From the side of the grip down to the magazine's base pad.
  const supportHand = supportHandPart(m, [{ grip: 'none', builder: support, toMag: [0.004, -0.08, -0.024] }]);
  group.add(supportHand.group);
  // A silencer screwed onto the threaded barrel (M29b), from the muzzle-device table.
  const mount = muzzleMount(PISTOL_MUZZLE, PISTOL_MUZZLE_DEVICES, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/**
 * The Cyber Pistol (M32, the owner's design; G2 the concept's): a white slab of a pistol with light lines down both sides
 * and a core window that glow, over a dark frame and grip, the same on either team (CYBER_COLOURS; Realistic colours
 * turns it grey and unlit). A top fin sight, a dark muzzle with a ring of light. It sits in the hands like the Gas
 * Pistol (the same grip line and hold), so the hands and the figures' pistol pose fit it unchanged.
 */
function buildCyberPistol(m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null): ReplicaModel {
  const b = new ModelBuilder(detail);
  const muzzle = CYBER_MUZZLE.barrelEnd;
  // The slab over the barrel, chamfered nose and sloped back; the dust cover under it.
  b.profile('cyberSlab', [[-0.09, -0.004], [0.098, -0.004], [0.104, 0.006], [0.104, 0.034], [0.098, 0.04], [-0.06, 0.044], [-0.09, 0.032]], 0.034, 0.004);
  b.box('cyberSlab', 0.06, 0.1, -0.03, -0.004, 0.028);
  // Light lines along both sides, the core window, a line down the back strap.
  b.box('cyberLine', -0.07, 0.1, 0.022, 0.025, 0.0354);
  b.box('cyberCore', 0.0, 0.05, 0.004, 0.014, 0.0354);
  b.profile('cyberLine', [[-0.083, -0.03], [-0.087, -0.03], [-0.106, -0.112], [-0.102, -0.112]], 0.012, 0.001);
  // Frame: the squared trigger guard and the trigger, the raked grip; the top fin sight; the muzzle with its ring.
  b.profile('polymer', [[-0.004, -0.004], [0.06, -0.004], [0.06, -0.048], [-0.01, -0.048]], 0.012, 0.004, [[[0.004, -0.012], [0.052, -0.012], [0.052, -0.04], [0.0, -0.04]]]);
  b.box('polymer', 0.014, 0.02, -0.034, -0.008, 0.005);
  b.worn(() => b.profile('polymer', [[-0.004, -0.004], [-0.08, -0.004], [-0.094, -0.012], [-0.08, -0.024], [-0.108, -0.13], [-0.054, -0.13], [-0.02, -0.014]], 0.032, 0.004));
  b.profile('polymer', [[-0.05, 0.043], [-0.02, 0.042], [-0.03, 0.056], [-0.046, 0.056]], 0.008, 0.002);
  b.tube('polymer', 0.1, muzzle - 0.1 - 0.003, CYBER_MUZZLE.up, 0.009, 6);
  b.tube('cyberLine', muzzle - 0.003, 0.001, CYBER_MUZZLE.up, 0.0093, 6);
  b.tube(orangeTip ? 'orange' : 'polymer', muzzle - 0.002, 0.002, CYBER_MUZZLE.up, 0.0075, 12);
  if (b.high) {
    // A second line higher up, stippled grip panels, the slide pin and the trigger's pivot pin.
    b.box('cyberLine', -0.05, 0.02, 0.031, 0.033, 0.0354);
    b.profile('stipple', [[-0.03, -0.04], [-0.076, -0.04], [-0.1, -0.118], [-0.056, -0.118]], 0.0336, 0.004);
    b.crossTube('metal', 0.02, 0.008, 0.0025, 0.036, 0, 8);
    b.crossTube('metal', 0.017, -0.009, 0.0022, 0.013, 0, 8);
  }

  const support = new ModelBuilder(detail);
  if (arms) pistolHands(b, support, detail, arms);
  const group = b.build(m);
  for (const [name, draw] of Object.entries(CYBER_PARTS)) group.add(drawnPart(draw, m, detail, name));
  const magazine = magazinePart(CYBER_MAGAZINES, m, detail, GRIP_DOWN);
  group.add(magazine.group);
  // Down to its base pad (where the Gas Pistol's is).
  const supportHand = supportHandPart(m, [{ grip: 'none', builder: support, toMag: [0.004, -0.08, -0.024] }]);
  group.add(supportHand.group);
  const mount = muzzleMount(CYBER_MUZZLE, {}, m, detail, orangeTip);
  group.add(mount.group);
  return { group, muzzle: mount.marker, magazine, supportHand, mount };
}

/** A replica's model builder (the built-in ones above, or one from a file). */
type ReplicaBuild = (m: Record<MaterialKey, THREE.Material>, orangeTip: boolean, detail: ReplicaDetail, arms: ArmBuilders | null) => ReplicaModel;

/**
 * The built-in muzzle layout of each replica a file can draw, by its part table (REPLICA_PART_TABLES): a pistol's
 * barrel ends where its file's `Muzzle` is; the rifle's `Muzzle` is the flash hider's tip, its barrel's end the layout's.
 */
const FILE_LAYOUTS: Readonly<Record<FileTable, MuzzleLayout>> = { aeg: AEG_MUZZLE, pistol: PISTOL_MUZZLE, cyber: CYBER_MUZZLE };

/** The part tables a file can draw a replica with. */
type FileTable = keyof typeof REPLICA_PART_TABLES;

/**
 * A file piece's material as drawn (RM1). The muzzle's tip ring is orange with the setting, else rubber (as the built-in
 * tips). A file's parts (magazines, muzzle devices, optics …) draw their steel and rubber in the detail material, and on
 * Low their BBs too, and on Low the body's chamber dot: each part is its own mesh per material, so this keeps a file's
 * replica to the built-in one's draw calls (a fitted flash hider is one mesh on Low, as the built-in one).
 */
function fileKey(key: MaterialKey, orangeTip: boolean, high: boolean, part: boolean): MaterialKey {
  if (key === 'orange') return orangeTip ? 'orange' : part ? 'detail' : 'rubber';
  if (part && (key === 'metal' || key === 'rubber' || key === 'stipple')) return 'detail';
  if (!high && part && key === 'bb') return 'detail';
  if (!high && !part && key === 'laserLens') return 'detail';
  return key;
}

/**
 * Draws `list` (moved by `shift` along the bore first) into a builder: a part, magazine or muzzle device from a file. On
 * Low a muzzle device with an orange tip is orange all over (`device`), as the built-in flash hider is.
 */
function filePieces(list: readonly ReplicaFilePiece[], orangeTip = false, shift = 0, device = false): PartDraw {
  const tip = device && orangeTip && list.some((p) => p.key === 'orange');
  return (b) => {
    for (const p of list) {
      const g = shift ? p.geometry.clone().translate(0, 0, shift) : p.geometry;
      b.shape(tip && !b.high ? 'orange' : fileKey(p.key, orangeTip, b.high, true), g);
      if (g !== p.geometry) g.dispose();
    }
  };
}

/**
 * Moves each plain mesh of `group` that shares a material with one of `meshes` (the hands' steel and rubber on High)
 * into it, so the two cost one draw call; on a still part when the meshes ride a rig.
 */
function mergeTwins(group: THREE.Group, meshes: readonly THREE.Mesh[], rigged: boolean): void {
  for (const mesh of meshes) {
    const twin = group.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c !== mesh && c.name === mesh.name && !meshes.includes(c));
    if (!twin) continue;
    const other = rigged ? withBone(twin.geometry, 0) : twin.geometry;
    const merged = mergeGeometries([mesh.geometry, other]);
    if (other !== twin.geometry) other.dispose();
    if (!merged) continue;
    mesh.geometry.dispose();
    mesh.geometry = merged;
    twin.removeFromParent();
    twin.geometry.dispose();
  }
}

/**
 * A replica drawn from its model file (M101, RM1, render/replicaFiles.ts): the file's body, moving parts and magazine in
 * the replica's materials, held as the built-in one is (the same grips and hands), its parts and muzzle devices from its
 * parts file where it has them and from its table (`table`) where not, the muzzle where the file marks it. The moving
 * parts ride a small skeleton in the body's own meshes and are posed from the file's animations (replicaRig.ts). A
 * file without a magazine keeps the built-in one.
 */
function buildFromFile(file: ReplicaFile, table: FileTable): ReplicaBuild {
  const T = REPLICA_PART_TABLES[table];
  const rifle = table === 'aeg';
  const layout: MuzzleLayout = rifle ? FILE_LAYOUTS.aeg : { ...FILE_LAYOUTS[table], barrelEnd: -file.muzzle.z, up: file.muzzle.y };
  const fromFile = (name: string, draw: PartDraw): PartDraw => {
    const own = file.parts.get(name);
    return own ? filePieces(own) : draw;
  };
  return (m, orangeTip, detail, arms) => {
    // The file's own shapes in one builder (each carrying the bone it rides when the file has moving parts), the hands
    // (and any orange disc) in another: a skinned mesh can't share a mesh with the hands.
    const fb = new ModelBuilder(detail);
    const draw = (p: ReplicaFilePiece, bone: number): void => {
      const g = file.rig ? withBone(p.geometry, bone) : p.geometry;
      fb.shape(fileKey(p.key, orangeTip, fb.high, false), g);
      if (g !== p.geometry) g.dispose();
    };
    for (const p of file.body) draw(p, 0);
    for (const p of file.rig?.pieces ?? []) draw(p, p.bone + 1);
    const b = new ModelBuilder(detail);
    if (orangeTip && !file.ownTip) {
      // The file's muzzle is plain: the orange tip is a disc over its face, a little wider and proud of it.
      const O = REPLICA_FILE.orangeTip;
      b.tube('orange', layout.barrelEnd + O.proud - O.depth, O.depth, layout.up, O.radius, 12);
    }
    const support = new ModelBuilder(detail);
    const supportOnGrip = new ModelBuilder(detail);
    if (arms) {
      if (rifle) aegHands(b, support, supportOnGrip, detail, arms);
      else pistolHands(b, support, detail, arms);
    }
    const group = b.build(m);
    const own = [...fb.build(m).children] as THREE.Mesh[];
    group.add(...own);
    mergeTwins(group, own, file.rig !== null);
    const rig = file.rig ? new ReplicaRig(group, file.rig) : null;
    for (const [name, partDraw] of Object.entries(T.parts)) group.add(drawnPart(fromFile(name, partDraw), m, detail, name));
    group.getObjectByName('laser:redLaser')?.add(laserBeam(PISTOL_LASER_LENS));
    const magazines: Partial<Record<MagazineId, PartDraw>> = {};
    for (const [id, magDraw] of Object.entries(T.magazines)) magazines[id as MagazineId] = fromFile(`magazine:${id}`, magDraw);
    if (file.magazine.length > 0) magazines.standard = filePieces(file.magazine);
    const magazine = rifle ? magazinePart(magazines, m, detail, AEG_MAG_AXIS, AEG_MAG_BASES) : magazinePart(magazines, m, detail, GRIP_DOWN, table === 'pistol' ? { extended: [0, -0.032, 0] } : {});
    group.add(magazine.group);
    // Down to its base pad (where the built-in pistols' are), or the rifle's holds.
    const supportHand = supportHandPart(m, rifle ? aegHolds(support, supportOnGrip, arms) : [{ grip: 'none', builder: support, toMag: [0.004, -0.08, -0.024] }]);
    group.add(supportHand.group);
    // Muzzle devices sit in the mount from the barrel's end: the file's flash hider (the rifle's bare muzzle) and its
    // parts file's devices, moved back by the barrel's length from where they fit.
    const devices: Record<string, MuzzleDraw> = {};
    for (const [id, deviceDraw] of Object.entries(T.muzzles as Readonly<Record<string, MuzzleDraw>>)) {
      const own = id === 'none' && file.flashHider.length > 0 ? file.flashHider : file.parts.get(`muzzle:${id}`);
      devices[id] = own ? (mb, tip) => filePieces(own, tip, layout.barrelEnd, true)(mb) : deviceDraw;
    }
    const mount = muzzleMount(layout, devices, m, detail, orangeTip);
    group.add(mount.group);
    return { group, muzzle: mount.marker, magazine, supportHand, mount, rig };
  };
}

/**
 * The laser's beam (QualitySettings.laserBeam, FA8): a line from the lens straight ahead, fading out, added (not
 * blended) so it reads as light. Named 'laserBeam'; hidden until the setting turns it on (Viewmodel.setLaserBeam).
 */
function laserBeam(lens: Pt): THREE.LineSegments {
  const L = F.laserBeam;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, lens[1], -lens[0], 0, lens[1], -(lens[0] + L.length)], 3));
  const c = new THREE.Color(LASERS.redLaser.colour);
  geo.setAttribute('color', new THREE.Float32BufferAttribute([c.r, c.g, c.b, 0, 0, 0], 3));
  const beam = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: L.opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.name = 'laserBeam';
  beam.visible = false;
  return beam;
}

/**
 * One held replica's model and the parts the viewmodel moves (typed here rather than found by name and read from
 * userData, audit L-05). Positions are as (across, up, back) in the model's space.
 */
export interface ReplicaModel {
  group: THREE.Group;
  /** Empty marker at the muzzle, where visual BBs start (on the muzzle mount: it follows the fitted barrel and device). */
  muzzle: THREE.Object3D;
  magazine: MagazinePart;
  supportHand: SupportHandPart;
  mount: MuzzleMount;
  /** The moving parts from its model file (RM1), posed by the viewmodel; absent on a built-in model. */
  rig?: ReplicaRig | null;
}

/** The muzzle mount (named 'muzzleMount'): the muzzle devices and the muzzle marker, moved out to the fitted barrel's end. */
export interface MuzzleMount {
  group: THREE.Group;
  marker: THREE.Object3D;
  layout: MuzzleLayout;
}

/** The magazine group (named 'magazine'), which slides out along `axis` (the magwell, a unit vector) on a reload. */
export interface MagazinePart {
  group: THREE.Group;
  axis: THREE.Vector3;
  /**
   * Per fitted-magazine part ('magazine:<id>') whose base plate sits elsewhere than the standard one's: the offset
   * there, where the support hand reaches on a reload. Missing: the standard base.
   */
  bases: ReadonlyMap<THREE.Object3D, THREE.Vector3>;
}

/**
 * The support hand and forearm (named 'supportHand'); `toMag` moves it from its grip to holding the magazine. A replica
 * can hold it more than one way (`holds`, by the grip fitted: the rifle's hand takes a vertical grip), each its own part
 * named 'hold:<grip>'; `fitSupportHand` shows the fitted grip's hold (or 'none', on the handguard) and sets `toMag` to its.
 */
export interface SupportHandPart {
  group: THREE.Group;
  toMag: THREE.Vector3;
  holds: ReadonlyMap<string, { object: THREE.Object3D; toMag: THREE.Vector3 }>;
  /** The grip whose hold is shown. */
  shown: string;
}

/** One way a support hand holds a replica: with `grip` fitted ('none': no grip, or one it doesn't take), and its reach to the magazine. */
interface SupportHold {
  grip: string;
  builder: ModelBuilder;
  toMag: readonly [number, number, number];
}

export interface ReplicaModels {
  models: Map<string, ReplicaModel>;
  /** Your own left hand raised high, palm forward: calling your hit. */
  raisedHand: THREE.Group;
  /** The detail these were built at. */
  detail: ReplicaDetail;
  /**
   * There is (or isn't) an environment to reflect (the replica's sheen): high detail's painted steel is metallic only
   * then, and stays a dull painted grey without (it would look black). Low detail is as it was either way.
   */
  setReflections(on: boolean): void;
  /** The weapon torch's lens glows (M33h): its torch is on. A uniform change, never a new shader. */
  setTorchLit(on: boolean): void;
  dispose(): void;
}

/** Fingers held straight and together. */
const OPEN: FingerCurl = [0.06, 0.05, 0.03];

/** The hand raised to call a hit: palm forward, fingers up. */
export const RAISED_HAND_POSE: HandPose = {
  side: 'left',
  palm: [0, 0, 0],
  across: [-1, 0, 0],
  back: [0, 0, -1],
  fingers: [OPEN, OPEN, OPEN, OPEN],
  thumb: { swing: 0.1, curl: [0.1, 0.05] },
};

/** Left hand raised to call a hit: palm facing forward, fingers up, forearm dropping out of view. */
function buildRaisedHand(m: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail, arms: ArmBuilders): THREE.Group {
  const b = new ModelBuilder(detail);
  const wrist = arms.hand(
    b,
    RAISED_HAND_POSE,
    detail.hands,
  );
  arms.forearm(b, wrist, [wrist[0] + 0.03, wrist[1] - 0.3, wrist[2] - 0.08], undefined, detail.hands);
  return b.build(m);
}

/**
 * Builds the held-replica model (with hands and team armband) for each replica in the loadout, keyed by replica id, at
 * `detail` (Replica and Hand detail, FA8; Low's by default), each in its colour scheme from `paint` (G1; by loadout slot)
 * or, without one, the unpainted black and tan (the Cyber Pistol always in its own colours). `hands` 'bare': without the
 * hands, for a picture of the replica on its own (itemPictures.ts).
 */
export function buildReplicaModels(
  loadout: readonly ReplicaConfig[],
  teamColor: number,
  orangeTips: boolean,
  detail: ReplicaDetail = LOW_DETAIL,
  paint: ReplicaPaint | null = null,
  hands: HandsShown = 'hands',
  /** Whose arms hold them (G7): the player's gloved ones, or a robot's when their slot is a robot. */
  arms: ArmStyle = HUMAN_ARMS,
  /** Replica models from files (M101, RM1, render/replicaFiles.ts): a replica with one is drawn from it. The caller owns them. */
  files: ReplicaFiles = NO_REPLICA_FILES,
): ReplicaModels {
  const speckle = detail.replica === 'high' ? speckleTextures() : null;
  const materials = createMaterials(teamColor, detail, speckle, F.unpainted, CYBER_COLOURS.bold, arms);
  const builders = armBuilders(arms);
  const models = new Map<string, ReplicaModel>();
  // Every material made for a replica's own colours, to dispose and to switch with the sheen (setReflections).
  const painted: THREE.Material[] = [];
  loadout.forEach((r, slot) => {
    const file = files.get(r.id);
    const build: ReplicaBuild = file ? buildFromFile(file, r.look.viewmodel ?? (r.look.model === 'pistol' ? 'pistol' : 'aeg')) : r.look.viewmodel === 'cyber' ? buildCyberPistol : r.look.model === 'pistol' ? buildPistol : buildAeg;
    const own = coloursOf(r, slot, paint);
    const mats = own ? paintedMaterials(materials, detail, own.colours, own.cyber) : materials;
    for (const key of PAINTED) if (mats[key] !== materials[key]) painted.push(mats[key]);
    models.set(r.id, build(mats, orangeTips, detail, hands === 'hands' ? builders : null));
  });
  const raisedHand = buildRaisedHand(materials, detail, builders);
  const metals = [materials.metal, ...painted.filter((m) => (m as THREE.MeshStandardMaterial).metalness > 0)] as THREE.MeshStandardMaterial[];
  return {
    models,
    raisedHand,
    detail,
    setReflections(on) {
      if (detail.replica !== 'high') return;
      const M = on ? F.metal.lit : F.metal.unlit;
      for (const metal of metals) {
        metal.metalness = M.metalness;
        metal.roughness = M.roughness;
      }
    },
    setTorchLit(on) {
      const lens = materials.torchLens;
      if (lens instanceof THREE.MeshStandardMaterial) lens.emissiveIntensity = on ? F.torch.glow : 0;
      else (lens as THREE.MeshBasicMaterial).color.setHex(on ? TORCHES.weaponTorch.colour : F.torch.lensOff);
    },
    dispose() {
      raisedHand.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const { group, rig } of models.values()) {
        rig?.dispose();
        group.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
          if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
        });
      }
      for (const mat of Object.values(materials)) mat.dispose();
      for (const mat of painted) mat.dispose();
      speckle?.dispose();
    },
  };
}

/**
 * The magazine as its own group named 'magazine', so the viewmodel can slide it out along `axis`
 * (the magwell direction, as (across, up, forward)) during reloads. One child per magazine the replica takes, named
 * 'magazine:<id>'; the viewmodel shows the one fitted.
 */
function magazinePart(
  draws: Partial<Record<MagazineId, PartDraw>>,
  m: Record<MaterialKey, THREE.Material>,
  detail: ReplicaDetail,
  axis: readonly [number, number, number],
  baseShift: Partial<Record<MagazineId, readonly [number, number, number]>> = {},
): MagazinePart {
  const group = new THREE.Group();
  const bases = new Map<THREE.Object3D, THREE.Vector3>();
  for (const [id, draw] of Object.entries(draws)) {
    const part = drawnPart(draw, m, detail, `magazine:${id}`);
    // Where this magazine's base plate sits against the standard one's, as (across, up, forward): the support hand
    // reaches there on a reload.
    const shift = baseShift[id as MagazineId];
    if (shift) bases.set(part, new THREE.Vector3(shift[0], shift[1], -shift[2]));
    group.add(part);
  }
  group.name = 'magazine';
  return { group, axis: new THREE.Vector3(axis[0], axis[1], -axis[2]).normalize(), bases };
}

/**
 * The support (left) hand and forearm as their own group named 'supportHand', so reloads can move it
 * to the magazine: each hold's `toMag` is the offset from its grip to holding the magazine, as (across, up, forward).
 * The first hold ('none') shows until `fitSupportHand` picks another.
 */
function supportHandPart(m: Record<MaterialKey, THREE.Material>, holds: readonly SupportHold[]): SupportHandPart {
  const group = new THREE.Group();
  group.name = 'supportHand';
  const byGrip = new Map<string, { object: THREE.Object3D; toMag: THREE.Vector3 }>();
  for (const hold of holds) {
    const object = namedPart(hold.builder, m, `hold:${hold.grip}`);
    object.visible = byGrip.size === 0;
    group.add(object);
    byGrip.set(hold.grip, { object, toMag: new THREE.Vector3(hold.toMag[0], hold.toMag[1], -hold.toMag[2]) });
  }
  return { group, toMag: byGrip.get('none')!.toMag.clone(), holds: byGrip, shown: 'none' };
}

/**
 * Shows the support hand's hold for the fitted `grip` (on the handguard when it takes none) and aims its reload reach.
 * Called every frame: it changes (and allocates) nothing unless the hold does.
 */
export function fitSupportHand(hand: SupportHandPart, grip: string | null): void {
  const key = grip !== null && hand.holds.has(grip) ? grip : 'none';
  if (key === hand.shown) return;
  hand.shown = key;
  const fitted = hand.holds.get(key)!;
  for (const hold of hand.holds.values()) hold.object.visible = hold === fitted;
  hand.toMag.copy(fitted.toMag);
}

/** A part the viewmodel shows or hides by name (the fitted optic, grip or magazine, the iron sights up or folded). */
function namedPart(builder: ModelBuilder, m: Record<MaterialKey, THREE.Material>, name: string): THREE.Group {
  const group = builder.build(m);
  group.name = name;
  return group;
}

/** One entry of a part table drawn into its own builder and named. */
function drawnPart(draw: PartDraw, m: Record<MaterialKey, THREE.Material>, detail: ReplicaDetail, name: string): THREE.Group {
  const b = new ModelBuilder(detail);
  draw(b);
  return namedPart(b, m, name);
}

/**
 * The muzzle mount at the standard barrel's end: the device parts (named 'muzzle:<id>', drawn from its table from 0
 * forward on the bore's axis) and the muzzle marker, at the bare muzzle's tip. The viewmodel moves the mount and the
 * marker to what is fitted (`fitMuzzle`).
 */
function muzzleMount(
  layout: MuzzleLayout,
  devices: Readonly<Record<string, MuzzleDraw>>,
  m: Record<MaterialKey, THREE.Material>,
  detail: ReplicaDetail,
  orangeTip: boolean,
): MuzzleMount {
  const group = new THREE.Group();
  group.name = 'muzzleMount';
  for (const [id, draw] of Object.entries(devices)) group.add(drawnPart((b) => draw(b, orangeTip), m, detail, `muzzle:${id}`));
  const marker = muzzleMarker(layout.tips.none ?? 0, layout.up);
  group.add(marker);
  group.position.z = -layout.barrelEnd;
  return { group, marker, layout };
}

/** Moves a mount (and its muzzle marker) to the end of the fitted barrel and device; null for as it comes. */
export function fitMuzzle(mount: MuzzleMount, barrel: string | null, device: string | null): void {
  const l = mount.layout;
  mount.group.position.z = -(l.barrelEnd + (barrel ? (l.extensions[barrel] ?? 0) : 0));
  mount.marker.position.z = -(l.tips[device ?? 'none'] ?? l.tips.none ?? 0);
}

/** Empty marker at the muzzle (forward, up) so presentation can start visual BBs there. */
function muzzleMarker(forward: number, up: number): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.name = 'muzzle';
  marker.position.set(0, up, -forward);
  return marker;
}
