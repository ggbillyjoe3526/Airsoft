import * as THREE from 'three';
import { ATMOSPHERE, RENDER, type QualitySettings } from '../config/render';

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
  readonly renderer: THREE.WebGLRenderer;
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
  /** Told when the graphics context is lost (true) and when it comes back (false); see onContextChange. */
  private contextListener: (lost: boolean) => void = () => undefined;

  /**
   * `quality` is the preset the game loads with: its antialiasing is fixed for the WebGL context's life; the rest can
   * change later (setQuality).
   */
  constructor(
    private readonly container: HTMLElement,
    private quality: QualitySettings,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER.toneMappingExposure;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    // Vertical FOV is fixed; horizontal grows with aspect (Hor+).
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, RENDER.near, RENDER.far);
    this.camera.rotation.order = 'YXZ';

    // The match's sky dome covers this (render/atmosphere.ts); the haze fades far things into the horizon's colour.
    this.scene.background = new THREE.Color(ATMOSPHERE.horizon);
    this.scene.fog = new THREE.Fog(ATMOSPHERE.horizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);

    this.resize();
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestored);
  }

  /**
   * A lost graphics context (a driver reset, the GPU taken by another app; audit W-01): `listener(true)` when it goes,
   * `listener(false)` when the browser gives it back. Three.js keeps every geometry, texture and shader's source and
   * uploads them again on the next frame drawn, so nothing needs rebuilding.
   */
  onContextChange(listener: (lost: boolean) => void): void {
    this.contextListener = listener;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
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
   * A new quality preset (Settings → Graphics): the pixel ratio and whether shadows are drawn change at once. The
   * match's lights, surfaces and effects follow it through MatchSession.setQuality; antialiasing stays as loaded.
   */
  setQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.resize();
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
    // Count both passes in renderer.info (the debug overlay reads it).
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (!overlay) return;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(overlay.scene, overlay.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly contextLost = (e: Event): void => {
    // Without this the browser never gives the context back (Three.js does it too; repeating it is harmless).
    e.preventDefault();
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
    // Re-read on every resize: moving the window to a monitor with another scaling changes it.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
