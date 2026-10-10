import * as THREE from 'three';
import { RIG_PREFIX, type ReplicaFileRig } from './replicaFiles';

/**
 * A replica's moving parts from its model file (RM1): the trigger, the selector, the sights, the slide … each riding a
 * bone of a small skeleton, drawn in the same meshes as the body (one skinned mesh per material, so the moving parts
 * cost no draw call), and posed from the file's animations. The viewmodel says how far into each animation it is
 * (`set`) and `apply` poses the bones; nothing is played on a clock here, so the pose always follows the game's state.
 */

/** The attribute a file's shapes carry through ModelBuilder: the bone each vertex rides on (0: the root, still). */
export const RIG_BONE = 'rigBone';

/** A copy of `geometry` riding bone `bone` (0: the root). */
export function withBone(geometry: THREE.BufferGeometry, bone: number): THREE.BufferGeometry {
  const g = geometry.clone();
  g.setAttribute(RIG_BONE, new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(bone), 1));
  return g;
}

/** One animated property of one bone and how to read it at a time. */
interface Channel {
  target: THREE.Vector3 | THREE.Quaternion;
  read: THREE.Interpolant;
}

export class ReplicaRig {
  private readonly bones: THREE.Bone[] = [];
  private readonly rest: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  /** The animations in the file's order (a later one wins a part two of them move), each with how far into it the parts are. */
  private readonly order: { duration: number; channels: Channel[]; time: number }[] = [];
  private readonly clips = new Map<string, { duration: number; channels: Channel[]; time: number }>();
  private readonly skeleton: THREE.Skeleton;

  /**
   * Builds the bones under `group` and turns its meshes whose shapes carry RIG_BONE (ModelBuilder.build's, one per
   * material) into skinned meshes on them. `group` must be at rest and unplaced (as a builder returns it).
   */
  constructor(group: THREE.Group, rig: ReplicaFileRig) {
    const root = new THREE.Bone();
    root.name = `${RIG_PREFIX}root`;
    rig.root.decompose(root.position, root.quaternion, root.scale);
    group.add(root);
    const all = [root];
    for (const b of rig.bones) {
      const bone = new THREE.Bone();
      bone.name = `${RIG_PREFIX}${b.name}`;
      bone.position.copy(b.position);
      bone.quaternion.copy(b.quaternion);
      bone.scale.copy(b.scale);
      root.add(bone);
      all.push(bone);
      this.bones.push(bone);
      this.rest.push({ position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() });
    }
    group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(all);
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || !child.geometry.getAttribute(RIG_BONE)) continue;
      const geometry = child.geometry as THREE.BufferGeometry;
      const bone = geometry.getAttribute(RIG_BONE);
      const n = bone.count;
      const index = new Uint16Array(n * 4);
      const weight = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        index[i * 4] = bone.getX(i);
        weight[i * 4] = 1;
      }
      geometry.deleteAttribute(RIG_BONE);
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
      const skinned = new THREE.SkinnedMesh(geometry, child.material);
      skinned.name = child.name;
      group.add(skinned);
      skinned.bind(this.skeleton, new THREE.Matrix4());
      child.removeFromParent();
    }
    const byName = new Map(this.bones.map((b) => [b.name, b]));
    for (const [name, clip] of rig.clips) {
      const channels: Channel[] = [];
      for (const track of clip.tracks) {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
        const bone = byName.get(nodeName);
        if (!bone) continue;
        const target = propertyName === 'quaternion' ? bone.quaternion : propertyName === 'position' ? bone.position : propertyName === 'scale' ? bone.scale : null;
        // Every track has it at run time (a quaternion's slerps); three's types leave it out.
        if (target) channels.push({ target, read: (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant() });
      }
      if (channels.length === 0) continue;
      const entry = { duration: clip.duration, channels, time: 0 };
      this.clips.set(name, entry);
      this.order.push(entry);
    }
  }

  /** The file has this animation (and it moves something the game draws). */
  has(clip: string): boolean {
    return this.clips.has(clip);
  }

  /** The animation's length in seconds (0 without it). */
  duration(clip: string): number {
    return this.clips.get(clip)?.duration ?? 0;
  }

  /** How far into `clip` the parts are (seconds; 0 or less: at rest). Takes effect at the next `apply`. */
  set(clip: string, time: number): void {
    const entry = this.clips.get(clip);
    if (entry) entry.time = time;
  }

  /** Poses the bones: every part at rest, then each animation under way at its time (a later one wins a shared part). */
  apply(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i]!;
      const rest = this.rest[i]!;
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
      bone.scale.copy(rest.scale);
    }
    for (const clip of this.order) {
      if (clip.time <= 0) continue;
      const t = Math.min(clip.time, clip.duration);
      for (const c of clip.channels) c.target.fromArray(c.read.evaluate(t) as unknown as number[]);
    }
  }

  dispose(): void {
    this.skeleton.dispose();
  }
}
