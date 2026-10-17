import * as THREE from 'three';
import type { LightingPreset, QualitySettings } from '../../config/render';
import { keyDirection } from '../lightingPreset';
import { type PostPassId, postPlan } from './postPlan';
import type { PostChain, PostSetup } from './postStack';
import { findReflective } from './postHelpers';

/** Any post chain: the node renderer's (W4). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the host never draws; the Renderer casts per renderer.
export type AnyPostChain = PostChain<any, any>;

/**
 * The renderer's hold on the post stack (G5): makes it on the first frame that wants it after a change, keeps it at the
 * drawing buffer's size and the map's light, hands it the scene's reflective meshes, and frees it whole on a quality
 * change, a map change, the retro filter and a lost device. Low (no post effect on) makes nothing at all.
 */
export class PostHost {
  private stack: AnyPostChain | null = null;
  private dirty = true;
  /** The reflective meshes in the scene (puddles, glass), looked for again after the scene changed. */
  private readonly reflective: { mesh: THREE.Mesh; strength: number }[] = [];
  private reflectiveDirty = true;
  private readonly keyLight = new THREE.Vector3();
  private width = 1;
  private height = 1;

  /** `make` makes the stack for the renderer in use (the node renderer's, W4), which always draws into half floats. */
  constructor(private readonly make: (setup: PostSetup, width: number, height: number) => AnyPostChain) {}

  /** The stack in force; null on Low, while the retro filter is on and before the first frame. */
  get current(): AnyPostChain | null {
    return this.stack;
  }

  /** The stack's passes in force, in order (the debug overlay): none on Low. */
  get plan(): readonly PostPassId[] {
    return this.stack?.plan ?? [];
  }

  /**
   * The stack for this frame, made for `quality` and `lighting` when it is first wanted after a change; null when the
   * quality has no post effect (Low) and when `off` (the retro filter draws instead).
   */
  stackFor(quality: QualitySettings, lighting: LightingPreset, off: boolean): AnyPostChain | null {
    if (off) return null;
    if (this.dirty) {
      this.dirty = false;
      if (postPlan(quality).length > 0) {
        const stack = this.make({ quality, halfFloat: true }, this.width, this.height);
        this.stack = stack;
        stack.setLight(keyDirection(lighting, this.keyLight), lighting.night);
        this.reflectiveDirty = true;
      }
    }
    return this.stack;
  }

  /** Hands the stack the scene's reflective meshes once after each change of the scene (rescan). */
  findReflective(stack: AnyPostChain, scene: THREE.Scene): void {
    if (!this.reflectiveDirty) return;
    this.reflectiveDirty = false;
    if (!stack.wantsReflective) return;
    findReflective(scene, this.reflective);
    stack.setReflectiveSurfaces(this.reflective);
  }

  /**
   * The warm-up's draws (PF1) are under way (`on`): every pass draws, the shafts with the sun off screen too. Once they
   * are done, the stack forgets the temporal history they leave (they are never shown).
   */
  warming(on: boolean): void {
    this.stack?.setWarming(on);
    if (!on) this.stack?.reset();
  }

  /** The scene changed (a session's build or its light, a quality change, a new device): look for reflective meshes again. */
  rescan(): void {
    this.reflectiveDirty = true;
  }

  /** The map's light: the stack's sun or moon for the light shafts. */
  setLight(lighting: LightingPreset): void {
    this.stack?.setLight(keyDirection(lighting, this.keyLight), lighting.night);
  }

  /** The drawing buffer's size (the window times the pixel ratio, render scale included). */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.stack?.setSize(this.width, this.height);
  }

  /** Frees the stack; the next frame makes one again for the settings then in force. */
  drop(): void {
    this.stack?.dispose();
    this.stack = null;
    this.dirty = true;
  }
}
