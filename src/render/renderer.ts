import * as THREE from 'three';
import { ATMOSPHERE, effectivePixelRatio, FRAME_TIMING, RENDER, type QualitySettings, type TextureSize } from '../config/render';
import type { FigureModel } from './externalModels';
import { GpuTimer } from './gpuTimer';
import { createSurfaceTextures, disposeSurfaceTextures, setSurfaceAnisotropy, type SurfaceTextures } from './proceduralTextures';

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

/** Owns the WebGL renderer, main camera and scene. Handles resizing. */
export class Renderer {
  /** The WebGL renderer: replaced (a new canvas and context) when antialiasing is turned on or off (setQuality). */
  private gl: THREE.WebGLRenderer;
  /** What the WebGL context was asked for: multisampling is fixed for a context's life. */
  private contextAntialias: boolean;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** The field of view setting: horizontal degrees on a 16:9 screen (Settings, Graphics). */
  private horizontalFov: number = RENDER.horizontalFov16x9;
  /** The main camera's vertical FOV with no zoom (degrees). */
  private baseFov = verticalFovFor(RENDER.horizontalFov16x9);
  private zoom = 1;
  /** View size in CSS pixels (kept up to date on resize, so HUD code never has to read layout). */
  width = 0;
  height = 0;
  /** The map surfaces' textures, drawn the first time a session asks (surfaceTextures), and the size they were drawn at. */
  private surfaces: SurfaceTextures | null = null;
  private surfacesSize: TextureSize | null = null;
  /** GPU time per frame (REN-17), made while `gpuTiming` is on; null without it. */
  private gpuTimer: GpuTimer | null = null;
  /** Time the GPU's work each frame (the debug overlay, while shown). */
  gpuTiming = false;
  /**
   * The figure model every match draws its players with (M25a, render/externalModels.ts), loaded once at start; null
   * for the built-in figures. Shared by every match and freed with the renderer.
   */
  figureModel: FigureModel | null = null;
  /** Told when the graphics context is lost (true) and when it comes back (false); see onContextChange. */
  private contextListener: (lost: boolean) => void = () => undefined;

  /** `quality` is what the game loads with; everything in it can change later (setQuality). */
  constructor(
    private readonly container: HTMLElement,
    private quality: QualitySettings,
  ) {
    this.gl = this.makeWebGL(quality.antialias);
    this.contextAntialias = quality.antialias;
    container.appendChild(this.gl.domElement);

    // Vertical FOV is fixed; horizontal grows with aspect (Hor+).
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, RENDER.near, RENDER.far);
    this.camera.rotation.order = 'YXZ';

    // The match's sky dome covers this (render/atmosphere.ts); the haze fades far things into the horizon's colour.
    this.scene.background = new THREE.Color(ATMOSPHERE.horizon);
    this.scene.fog = new THREE.Fog(ATMOSPHERE.horizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);

    this.resize();
    window.addEventListener('resize', this.resize);
    this.listen(this.canvas);
  }

  /** The WebGL renderer in use (a new one after antialiasing changes: don't keep it). */
  get renderer(): THREE.WebGLRenderer {
    return this.gl;
  }

  /**
   * Whether the screen is really multisampled (REN-21): the context reports what it was given, and Firefox on Linux and
   * some drivers give no multisampling whatever was asked.
   */
  get antialiased(): boolean {
    return this.gl.getContext().getContextAttributes()?.antialias ?? false;
  }

  /** Antialiasing asked for but not in force: a new context could not be made, so it changes on the next load (REN-04). */
  get antialiasPending(): boolean {
    return this.quality.antialias !== this.contextAntialias;
  }

  /** The most anisotropic filtering the graphics card offers (Texture filtering is clamped to it). */
  get maxAnisotropy(): number {
    return this.gl.capabilities.getMaxAnisotropy();
  }

  /** The GPU's milliseconds a frame, smoothed (REN-17): NaN without the timer extension (Firefox) or while not timing. */
  get gpuMs(): number {
    return this.gpuTimer?.ms ?? Number.NaN;
  }

  /**
   * A lost graphics context (a driver reset, the GPU taken by another app; audit W-01): `listener(true)` when it goes,
   * `listener(false)` when the browser gives it back. Three.js keeps every geometry, texture and shader's source and
   * uploads them again on the next frame drawn, except render targets, which come back empty: whatever draws into one
   * once must draw it again (CombatPresentation.contextRestored, audit L-02; shadow maps are redrawn every frame).
   */
  onContextChange(listener: (lost: boolean) => void): void {
    this.contextListener = listener;
  }

  /**
   * The map surfaces' textures (render/proceduralTextures.ts), shared by every match and range: they are the same each
   * time (fixed seeds), so they are drawn and uploaded once, the first time they are wanted, and freed with the renderer
   * (audit L-04). Sessions must not dispose them.
   */
  get surfaceTextures(): SurfaceTextures {
    if (!this.surfaces) {
      this.surfaces = createSurfaceTextures(this.quality.textureSize, this.quality.anisotropy);
      this.surfacesSize = this.quality.textureSize;
    }
    return this.surfaces;
  }

  get canvas(): HTMLCanvasElement {
    return this.gl.domElement;
  }

  /** The field of view setting in use (horizontal degrees on a 16:9 screen). */
  get fov(): number {
    return this.horizontalFov;
  }

  /**
   * Sets the field of view (horizontal degrees on a 16:9 screen; wider screens see more at the sides). Applies at
   * once, and a zoom (aiming down an optic) narrows whatever is set. The held replica keeps its own camera.
   */
  setFov(horizontalFov16x9: number): void {
    this.horizontalFov = horizontalFov16x9;
    this.baseFov = verticalFovFor(horizontalFov16x9);
    this.camera.fov = zoomedFov(this.baseFov, this.zoom);
    this.camera.updateProjectionMatrix();
  }

  /**
   * New quality settings (Settings → Graphics): the pixel ratio, whether shadows are drawn, the surface textures' size
   * and filtering, and antialiasing all change at once. The match's lights, surfaces and effects follow through
   * MatchSession.setQuality, which must come after this (a new texture size is drawn when the session asks for it).
   * Antialiasing needs a new WebGL context (REN-04): returns true when the context was replaced, and the session must
   * then render its render targets again (contextRestored), as after a lost context.
   */
  setQuality(quality: QualitySettings): boolean {
    this.quality = quality;
    if (this.surfaces && this.surfacesSize !== quality.textureSize) {
      disposeSurfaceTextures(this.surfaces);
      this.surfaces = null;
    }
    if (this.surfaces) setSurfaceAnisotropy(this.surfaces, quality.anisotropy);
    const replaced = quality.antialias !== this.contextAntialias && this.replaceContext(quality.antialias);
    this.gl.shadowMap.enabled = quality.shadows;
    this.resize();
    return replaced;
  }

  /** Narrows the main camera's view by `zoom` (1 = the normal view), e.g. while aiming down an optic. */
  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.camera.fov = zoomedFov(this.baseFov, zoom);
    this.camera.updateProjectionMatrix();
  }

  /** Draws the world, then (optionally) an overlay scene such as the held replica on top of it. */
  render(overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    const gl = this.gl;
    const timer = this.timer();
    timer?.begin();
    // Count both passes in renderer.info (the debug overlay reads it).
    gl.info.autoReset = false;
    gl.info.reset();
    gl.autoClear = true;
    gl.render(this.scene, this.camera);
    if (overlay) {
      gl.autoClear = false;
      gl.clearDepth();
      gl.render(overlay.scene, overlay.camera);
    }
    timer?.end();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.unlisten(this.canvas);
    if (this.surfaces) disposeSurfaceTextures(this.surfaces);
    this.surfaces = null;
    this.figureModel?.dispose();
    this.figureModel = null;
    this.dropTimer();
    this.gl.dispose();
    // Frees the context at once rather than when the canvas is collected (REN-24): browsers cap live contexts.
    this.gl.forceContextLoss();
    this.gl.domElement.remove();
  }

  /** A WebGL renderer with the game's output settings, on a canvas of its own. Throws if the browser refuses a context. */
  private makeWebGL(antialias: boolean): THREE.WebGLRenderer {
    const gl = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance' });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = RENDER.toneMappingExposure;
    gl.shadowMap.enabled = this.quality.shadows;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.domElement.className = 'game-canvas';
    return gl;
  }

  /**
   * Antialiasing on or off (REN-04): a new renderer on a new canvas takes the old one's place, and the old context is
   * freed at once (REN-24). Three.js uploads every geometry and texture to the new context from their copies on the next
   * frame, exactly as after a lost context; render targets come back empty (the caller has the session redraw them).
   * Returns false, keeping the old context, if the browser refuses a new one: the change then waits for the next load.
   */
  private replaceContext(antialias: boolean): boolean {
    let next: THREE.WebGLRenderer;
    try {
      next = this.makeWebGL(antialias);
    } catch {
      return false;
    }
    const old = this.gl;
    this.dropTimer();
    this.unlisten(old.domElement);
    old.domElement.replaceWith(next.domElement);
    old.dispose();
    old.forceContextLoss();
    this.gl = next;
    this.contextAntialias = antialias;
    this.listen(next.domElement);
    return true;
  }

  private listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
  }

  private unlisten(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('webglcontextlost', this.contextLost);
    canvas.removeEventListener('webglcontextrestored', this.contextRestored);
  }

  /** The GPU timer while timing is on (made on first use, for the context in use); null otherwise. */
  private timer(): GpuTimer | null {
    if (!this.gpuTiming) {
      if (this.gpuTimer) this.dropTimer();
      return null;
    }
    return (this.gpuTimer ??= new GpuTimer(this.gl.getContext() as WebGL2RenderingContext, FRAME_TIMING.smoothing));
  }

  private dropTimer(): void {
    this.gpuTimer?.dispose();
    this.gpuTimer = null;
  }

  private readonly contextLost = (e: Event): void => {
    // Without this the browser never gives the context back (Three.js does it too; repeating it is harmless).
    e.preventDefault();
    // The timer's query went with the context.
    this.gpuTimer = null;
    this.contextListener(true);
  };

  private readonly contextRestored = (): void => {
    this.contextListener(false);
  };

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    // Re-read on every resize: moving the window to a monitor with another scaling changes it. Below 1 (Render scale)
    // the canvas keeps its size on the page and the browser scales the picture up.
    this.gl.setPixelRatio(effectivePixelRatio(window.devicePixelRatio, this.quality));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
