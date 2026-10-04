import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { REPLICA_SHEEN } from '../config/render';

/** What the sheen keeps on the GPU: a prefiltered render target (PMREMGenerator's output). */
export interface SheenTarget {
  readonly texture: THREE.Texture;
  dispose(): void;
}

/** Prefilters a room environment once; the generator's own buffers are freed at once (audit L-02). */
export function prefilterRoom(gl: THREE.WebGLRenderer): SheenTarget {
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, REPLICA_SHEEN.blur);
  room.dispose();
  pmrem.dispose();
  return target;
}

/**
 * The held replica's sheen (the Replica sheen setting), owned by the Renderer (audit REN-06): the environment never
 * changes, so it is prefiltered once per graphics context and shared by every match and range, not rebuilt on each
 * Play (380–520 ms in software). Turning the setting off frees its 6.3 MB at once (`trim`), as Low frees its shadow map.
 */
export class ReplicaSheen {
  private target: SheenTarget | null = null;

  constructor(private readonly make: (gl: THREE.WebGLRenderer) => SheenTarget = prefilterRoom) {}

  /** The sheen to light the replica with, made on first want; null while the setting is off. */
  texture(gl: THREE.WebGLRenderer, on: boolean): THREE.Texture | null {
    if (!on) return null;
    return (this.target ??= this.make(gl)).texture;
  }

  /** The setting changed: off frees the target (the next `texture(…, true)` makes it again). */
  trim(on: boolean): void {
    if (!on) this.dispose();
  }

  /**
   * The context was lost and given back: the target's GL objects went with it, so it is dropped, not disposed (freeing
   * them on the new context only logs WebGL warnings), and made again on the next want.
   */
  forget(): void {
    this.target = null;
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
  }
}
