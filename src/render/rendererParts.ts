import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { TONE_MAPPING, type ToneMappingId } from '../config/render';

/**
 * The Renderer's pure helpers (render/renderer.ts re-exports them): the field of view's maths, the tone mapping table,
 * the idle warm-up of the surface textures, and letting go of what a retiring renderer has drawn (a lost device's
 * replacement).
 */

const REFERENCE_ASPECT = 16 / 9;
const DEG = Math.PI / 180;

/** Vertical FOV (degrees) that yields the configured horizontal FOV on a 16:9 screen. */
export function verticalFovFor(horizontalFov16x9: number): number {
  return (2 * Math.atan(Math.tan((horizontalFov16x9 * DEG) / 2) / REFERENCE_ASPECT)) / DEG;
}

/** The vertical FOV (degrees) that magnifies a `fov` view by `zoom`. */
export function zoomedFov(fov: number, zoom: number): number {
  return (2 * Math.atan(Math.tan((fov * DEG) / 2) / zoom)) / DEG;
}

/** Three.js's tone mapping for each choice on the Tone mapping row (audit section 5, F2). */
const TONE_MAPPERS: Readonly<Record<ToneMappingId, THREE.ToneMapping>> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/** The renderer's tone mapping and exposure for a choice, the exposure times a lighting preset's `scale` (M33f). */
export function toneMappingOf(id: ToneMappingId, scale = 1): { mapping: THREE.ToneMapping; exposure: number } {
  return { mapping: TONE_MAPPERS[id], exposure: TONE_MAPPING.exposure[id] * scale };
}

/** Runs `work` in a spare moment. */
export type IdleScheduler = (work: () => void) => void;

/** The browser's idle callback (a timeout where it has none). */
export const browserIdle: IdleScheduler = (work) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => work());
  else setTimeout(work, 0);
};

/**
 * Draws the surface textures and uploads them in idle moments (audit REN-14), so the first Play doesn't: one moment
 * draws one of `ids` (`draw`), the next uploads it, and so on through the list. One texture a moment, not the whole set
 * (BP2): at High a library surface alone takes most of a second to draw, the set several seconds of a frozen title
 * screen. `upload` skips a texture its set no longer holds (a texture-size change dropped it).
 */
export function warmSurfacesInIdle<Id>(ids: readonly Id[], draw: (id: Id) => THREE.Texture, upload: (texture: THREE.Texture) => void, idle: IdleScheduler): void {
  let next = 0;
  const step = (): void => {
    if (next >= ids.length) return;
    const texture = draw(ids[next++]!);
    idle(() => {
      upload(texture);
      idle(step);
    });
  };
  idle(step);
}

/**
 * Runs `run` (the warm-up compile) with each of `hidden` shown, with its hidden ancestors, and every mesh under them
 * drawn wherever it stands (frustum culling off), then puts every flag back as it was (KI1). Three's compile gathers
 * what it compiles before its first wait, so the overtime flag, a tossed magazine or a scope's eyepiece, hidden at a
 * session's start, compile with the rest instead of on the frame they first show. Once per session build.
 */
export function withShown(hidden: readonly THREE.Object3D[], run: () => void): void {
  const shown: THREE.Object3D[] = [];
  const culled: THREE.Object3D[] = [];
  for (const object of hidden) {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (!o.visible) {
        o.visible = true;
        shown.push(o);
      }
    }
    object.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
  }
  try {
    run();
  } finally {
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
  }
}

/**
 * What `handOverRenderer` needs of the renderer it retires (a stub stands in for it in tests): a lost node renderer
 * (W1), which frees its own context or device on dispose.
 */
export interface RetiringRenderer {
  readonly domElement: { replaceWith(next: HTMLCanvasElement): void };
  dispose(): void;
}

/** The renderer drawing the game: the node renderer (WebGPU overhaul W1; the only one since W6). */
export type DrawingRenderer = WebGPURenderer;

/** This frame's draw calls and triangles, and the programs, geometries and textures held (the debug overlay). */
export interface DrawStats {
  calls: number;
  triangles: number;
  /**
   * Of `triangles`, those of the GPU dressing (Woodland's grass and tree stand-ins, W5): Three counts an indirect draw
   * at its cap, so this is every slot, not what the cull kept. The perf gate guards it on a line of its own (W6a).
   */
  dressingTriangles: number;
  programs: number;
  geometries: number;
  textures: number;
}

/**
 * Lets go of everything a renderer has seen under `root`: each geometry, material, texture (a material's maps and a
 * material's texture uniforms, a scene's background and environment), instanced mesh and light shadow map is disposed,
 * which drops the renderer's GPU copy and the dispose listener it keeps on the object. Nothing on the CPU side is lost:
 * the next renderer to draw them uploads them again from their copies (a shadow map is made again).
 */
export function releaseGpuResources(root: THREE.Object3D): void {
  if (root instanceof THREE.Scene) {
    disposeIfTexture(root.background);
    disposeIfTexture(root.environment);
  }
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    const { geometry, material } = o as Partial<THREE.Mesh>;
    geometry?.dispose();
    if (material) for (const m of Array.isArray(material) ? material : [material]) releaseMaterial(m);
    const shadow = (o as Partial<THREE.DirectionalLight>).shadow;
    if (shadow?.map) {
      shadow.map.dispose();
      shadow.map = null;
    }
  });
}

function releaseMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) disposeIfTexture(value);
  disposeUniformTextures((material as { uniforms?: Record<string, THREE.IUniform> }).uniforms);
  material.dispose();
}

function disposeUniformTextures(uniforms: Record<string, THREE.IUniform> | undefined): void {
  if (uniforms) for (const u of Object.values(uniforms)) disposeIfTexture(u.value);
}

function disposeIfTexture(value: unknown): void {
  if (value instanceof THREE.Texture) value.dispose();
}

/**
 * A lost device's replacement (W1, REN-24): `next` takes `old`'s place on the page, and `old` is freed with its device.
 * Three.js keeps a dispose listener (holding its renderer) on every geometry, material, texture, instanced mesh and
 * render target it has drawn, and never removes them on its own dispose(): without releasing `roots` first, every swap
 * would keep the old renderer, its lost device and its canvas alive for as long as the scene lives.
 */
export function handOverRenderer(old: RetiringRenderer, next: { domElement: HTMLCanvasElement }, roots: readonly THREE.Object3D[]): void {
  for (const root of roots) releaseGpuResources(root);
  old.domElement.replaceWith(next.domElement);
  old.dispose();
}
