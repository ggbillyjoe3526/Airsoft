import * as THREE from 'three';
import type { LightingPreset, QualitySettings } from '../../config/render';
import { keyDirection } from '../lightingPreset';
import { type PostPassId, postPlan } from './postPlan';
import { PostStack } from './postStack';
import { findReflective } from './reflectionPass';

/**
 * The renderer's hold on the post stack (G5): makes it on the first frame that wants it after a change, keeps it at the
 * drawing buffer's size and the map's light, hands it the scene's reflective meshes, and frees it whole on a quality
 * change, the retro filter, a lost context and the antialiasing swap. Low (no post effect on) makes nothing at all.
 */
export class PostHost {
  private stack: PostStack | null = null;
  private dirty = true;
  /** The context is lost: nothing is made for it until it comes back. */
  private gone = false;
  /** The reflective meshes in the scene (puddles, glass), looked for again after the scene changed. */
  private readonly reflective: { mesh: THREE.Mesh; strength: number }[] = [];
  private reflectiveDirty = true;
  private readonly keyLight = new THREE.Vector3();
  private width = 1;
  private height = 1;

  /** `halfFloat` says whether the context in use can draw into half floats (asked only as a stack is made). */
  constructor(private readonly halfFloat: () => boolean) {}

  /** The stack in force; null on Low, while the retro filter is on, while the context is lost and before the first frame. */
  get current(): PostStack | null {
    return this.stack;
  }

  /** The stack's passes in force, in order (the debug overlay): none on Low. */
  get plan(): readonly PostPassId[] {
    return this.stack?.plan ?? [];
  }

  /** Whether the context is lost (contextLost) and not yet back. */
  get contextGone(): boolean {
    return this.gone;
  }

  /**
   * The stack for this frame, made for `quality` and `lighting` when it is first wanted after a change; null when the
   * quality has no post effect (Low), when `off` (the retro filter draws instead) and while the context is lost.
   */
  stackFor(quality: QualitySettings, lighting: LightingPreset, off: boolean): PostStack | null {
    if (off || this.gone) return null;
    if (this.dirty) {
      this.dirty = false;
      if (postPlan(quality).length > 0) {
        const stack = new PostStack({ quality, halfFloat: this.halfFloat() }, this.width, this.height);
        this.stack = stack;
        stack.setLight(keyDirection(lighting, this.keyLight), lighting.night);
        this.reflectiveDirty = true;
      }
    }
    return this.stack;
  }

  /** Hands the stack the scene's reflective meshes once after each change of the scene (rescan). */
  findReflective(stack: PostStack, scene: THREE.Scene): void {
    if (!this.reflectiveDirty) return;
    this.reflectiveDirty = false;
    if (!stack.wantsReflective) return;
    findReflective(scene, this.reflective);
    stack.setReflectiveSurfaces(this.reflective);
  }

  /** The scene changed (a session's build or its light, a quality change, a new context): look for reflective meshes again. */
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

  /** The context was lost: the stack goes with it (its targets are gone) and nothing is made until it comes back. */
  contextLost(): void {
    this.drop();
    this.gone = true;
  }

  /** The context is back (restored, or a new one took its place): the stack is made again on the next frame. */
  contextBack(): void {
    this.gone = false;
    this.reflectiveDirty = true;
  }
}
