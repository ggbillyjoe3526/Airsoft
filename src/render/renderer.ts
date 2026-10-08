import * as THREE from 'three';
import {
  type CoreSurfaceId,
  effectivePixelRatio,
  FRAME_TIMING,
  type LightingPreset,
  LIGHTING_PRESETS,
  RENDER,
  TONE_MAPPING,
  type QualitySettings,
  type RetroLook,
  type TextureSize,
  type ToneMappingId,
} from '../config/render';
import type { MapData } from '../map/mapTypes';
import type { FigureModel } from './externalModels';
import { GpuTimer } from './gpuTimer';
import { environmentLookOf } from './lightingPreset';
import { MapMeshCache } from './mapMeshCache';
import { mapLookOf, texturesFor } from './mapMeshes';
import { PostHost } from './post/postHost';
import type { PostPassId } from './post/postPlan';
import type { PostStack } from './post/postStack';
import { addSurfaceTextures, CORE_SURFACES, disposeSurfaceTextures, type ProceduralTexture, setSurfaceAnisotropy, type SurfaceTextures } from './proceduralTextures';
import { defaultEnvironmentLook, type EnvironmentLook, ReplicaSheen } from './replicaSheen';
import { RetroFilter, retroPixelAngle } from './retroFilter';
import { releaseNormalMaps, usesNormalMaps } from './surfaceNormals';

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
const browserIdle: IdleScheduler = (work) => {
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

/** A renderer's own record of each material (WebGLRenderer.properties): the uniforms it binds, its own textures among them. */
export interface RendererProperties {
  get(object: object): unknown;
}

/** What `handOverRenderer` needs of a WebGL renderer (a stub stands in for it in tests). */
export interface RetiringRenderer {
  readonly domElement: { replaceWith(next: HTMLCanvasElement): void };
  readonly properties: RendererProperties;
  dispose(): void;
  forceContextLoss(): void;
}

/**
 * Lets go of everything a WebGL renderer has seen under `root`: each geometry, material, texture (a material's maps and
 * a shader's texture uniforms, a scene's background and environment), instanced mesh and light shadow map is disposed,
 * which drops the renderer's GPU copy and the dispose listener it keeps on the object. With the renderer's `properties`,
 * the textures it binds to a material by itself go too (Three's shared DFG lookup table for standard materials, which
 * would otherwise keep every old renderer alive). Nothing on the CPU side is lost: the next renderer to draw them uploads
 * them again from their copies (a shadow map is made again).
 */
export function releaseGpuResources(root: THREE.Object3D, properties?: RendererProperties): void {
  if (root instanceof THREE.Scene) {
    disposeIfTexture(root.background);
    disposeIfTexture(root.environment);
  }
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    const { geometry, material } = o as Partial<THREE.Mesh>;
    geometry?.dispose();
    if (material) for (const m of Array.isArray(material) ? material : [material]) releaseMaterial(m, properties);
    const shadow = (o as Partial<THREE.DirectionalLight>).shadow;
    if (shadow?.map) {
      shadow.map.dispose();
      shadow.map = null;
    }
  });
}

function releaseMaterial(material: THREE.Material, properties: RendererProperties | undefined): void {
  for (const value of Object.values(material)) disposeIfTexture(value);
  disposeUniformTextures((material as Partial<THREE.ShaderMaterial>).uniforms);
  disposeUniformTextures((properties?.get(material) as { uniforms?: Record<string, THREE.IUniform> } | undefined)?.uniforms);
  material.dispose();
}

function disposeUniformTextures(uniforms: Record<string, THREE.IUniform> | undefined): void {
  if (uniforms) for (const u of Object.values(uniforms)) disposeIfTexture(u.value);
}

function disposeIfTexture(value: unknown): void {
  if (value instanceof THREE.Texture) value.dispose();
}

/**
 * Antialiasing's context swap (REN-04, REN-24): `next` takes `old`'s place on the page, and `old` is freed with its
 * context. Three.js keeps a dispose listener (holding its renderer) on every geometry, material, texture, instanced mesh
 * and render target it has drawn, and never removes them on its own dispose(): without releasing `roots` first, every
 * swap would keep the old renderer, its lost context and its canvas alive for as long as the scene lives.
 */
export function handOverRenderer(old: RetiringRenderer, next: { domElement: HTMLCanvasElement }, roots: readonly THREE.Object3D[]): void {
  for (const root of roots) releaseGpuResources(root, old.properties);
  old.domElement.replaceWith(next.domElement);
  old.dispose();
  // Frees the context at once rather than when the canvas is collected (REN-24): browsers cap live contexts.
  old.forceContextLoss();
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
  /**
   * The map surfaces' textures, drawn the first time a session asks (surfaceTextures) or one an idle moment before
   * (warmUp, so it may hold only some of the core ones), and the size they were drawn at.
   */
  private surfaces: Partial<SurfaceTextures> | null = null;
  private surfacesSize: TextureSize | null = null;
  /**
   * The prefiltered sky: the held replica's sheen and the scene's environment lighting (F1), made once per context and
   * freed while neither setting wants it (REN-06).
   */
  private readonly sheen = new ReplicaSheen();
  /** The sky the environment map is made from: the engine's daytime sky until a session passes another. */
  private environmentLook: EnvironmentLook = defaultEnvironmentLook();
  /** The scene's environment must be set again before the next frame (settings changed, a new or restored context). */
  private environmentDirty = true;
  /** Settings → Graphics → Tone mapping (F2): not part of a preset. */
  private toneMapping: ToneMappingId = TONE_MAPPING.default;
  /** The lighting preset in force (M33f, setLighting): its haze, exposure and environment. Day until a session sets one. */
  private lighting: LightingPreset = LIGHTING_PRESETS.day;
  /** GPU time per frame (REN-17), made while `gpuTiming` is on; null without it. */
  private gpuTimer: GpuTimer | null = null;
  /** Time the GPU's work each frame (the debug overlay, while shown). */
  gpuTiming = false;
  /**
   * The figure model every match draws its players with (M25a, render/externalModels.ts), loaded once at start; null
   * for the built-in figures. Shared by every match and freed with the renderer.
   */
  figureModel: FigureModel | null = null;
  /**
   * The last map's meshes, kept between sessions (audit CORE-33): Quit → Play on the same map takes them back. Sessions
   * take and release them (they must not dispose them); freed with the renderer.
   */
  readonly mapMeshes = new MapMeshCache();
  /**
   * The overlay scene drawn last (the held replica), released with the world when the context is swapped: kept while
   * spectating, when no overlay is drawn (BP2), until its owner lets go of it (forgetOverlay).
   */
  private overlayScene: THREE.Scene | null = null;
  /** The retro pixel filter's look while it is on (Settings → Dev, M42); null while off. */
  private retroLook: RetroLook | null = null;
  /** The filter's target and pass for the context in use, made while the filter is on. */
  private retro: RetroFilter | null = null;
  /** Told when the graphics context is lost (true) and when it comes back (false); see onContextChange. */
  private contextListener: (lost: boolean) => void = () => undefined;
  /**
   * The post stack (G5, render/post/postHost.ts) for the quality in force: none on Low (the frame is drawn straight to
   * the screen as before), while the retro filter is on and while the context is lost.
   */
  private readonly post = new PostHost(() => this.drawsHalfFloat());

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
    // Both follow the lighting preset (setLighting).
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0xffffff);
    this.applyHaze();

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
    // Every core surface, the ones the idle warm-up hasn't drawn yet drawn now.
    return addSurfaceTextures(this.surfaceSet(), CORE_SURFACES, this.surfacesSize!, this.quality.anisotropy) as SurfaceTextures;
  }

  /** The set in force, made (empty) at the quality's texture size if there is none. */
  private surfaceSet(): Partial<SurfaceTextures> {
    if (!this.surfaces) {
      this.surfaces = {};
      this.surfacesSize = this.quality.textureSize;
    }
    return this.surfaces;
  }

  /**
   * The surface textures `map`'s meshes are painted with (M33i): the shared set (surfaceTextures), with the woods' ones
   * (bark, boards, stone, the ground's tile) drawn into it the first time a map that uses them asks, at the set's size.
   * A map that uses none (Depot) gets the set exactly as before.
   */
  surfaceTexturesFor(map: MapData): SurfaceTextures {
    const set = this.surfaceTextures;
    return addSurfaceTextures(set, texturesFor(map), this.surfacesSize ?? this.quality.textureSize, this.quality.anisotropy);
  }

  /**
   * The held replica's sheen for the settings in force (render/replicaSheen.ts): made the first time it is wanted and
   * shared by every match and range; null while Replica sheen is off. Sessions must not dispose it.
   */
  get replicaSheen(): THREE.Texture | null {
    return this.sheen.texture(this.gl, this.quality.replicaSheen, this.environmentLook);
  }

  /**
   * The sky the environment map and the replica's sheen reflect (render/replicaSheen.ts EnvironmentLook): a map with
   * another sky passes its own; the prefiltered target is made again for a new look on the next frame. Sessions that
   * hold the sheen (CombatPresentation) ask for it again after this.
   */
  setEnvironmentLook(look: EnvironmentLook): void {
    this.environmentLook = look;
    this.environmentDirty = true;
  }

  /**
   * The map's light (M33f, render/lightingPreset.ts resolveLighting): the haze and background, the exposure, and the
   * environment map's sky, ground and strength. Every session sets it as it is built, so a map never keeps the last one's.
   */
  setLighting(preset: LightingPreset): void {
    this.lighting = preset;
    this.post.setLight(preset);
    // A session sets its light as it takes its map: the last map's reflective meshes must not be kept (G5 critic).
    this.post.rescan();
    this.applyHaze();
    this.setToneMapping(this.toneMapping);
    this.setEnvironmentLook(environmentLookOf(preset));
  }

  /** The lighting preset in force (setLighting). */
  get lightingPreset(): LightingPreset {
    return this.lighting;
  }

  /** The haze and the background in the preset's colour (the scene's own Fog and Color, changed in place). */
  private applyHaze(): void {
    const { colour, near, far } = this.lighting.fog;
    (this.scene.background as THREE.Color).setHex(colour);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(colour);
    fog.near = near;
    fog.far = far;
  }

  /** The tone mapping in use (Settings → Graphics). */
  get toneMappingId(): ToneMappingId {
    return this.toneMapping;
  }

  /**
   * Tone mapping (Settings → Graphics, F2): applies at once; Three.js rebuilds each shader once on its next draw. The
   * exposure goes with it (TONE_MAPPING.exposure), so the field stays about as bright under each.
   */
  setToneMapping(id: ToneMappingId): void {
    this.toneMapping = id;
    const { mapping, exposure } = toneMappingOf(id, this.lighting.exposureScale);
    this.gl.toneMapping = mapping;
    this.gl.toneMappingExposure = exposure;
  }

  /**
   * Draws and uploads the surface textures in the title screen's idle time (REN-14), so the first Play only builds the
   * map. Harmless if Play comes first: the set is drawn once either way and an uploaded texture isn't uploaded again.
   */
  warmUp(idle: IdleScheduler = browserIdle): void {
    warmSurfacesInIdle(
      CORE_SURFACES,
      (id: CoreSurfaceId) => addSurfaceTextures(this.surfaceSet(), [id], this.surfacesSize!, this.quality.anisotropy)[id]!.texture,
      (texture) => {
        if (this.surfaces && (Object.values(this.surfaces) as ProceduralTexture[]).some((t) => t.texture === texture)) this.gl.initTexture(texture);
      },
      idle,
    );
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
    this.sheen.trim(quality.replicaSheen || quality.environment);
    // Normal maps are freed while nothing draws with them, like the sheen (made again when a material asks).
    if (this.surfaces && !usesNormalMaps(quality)) releaseNormalMaps(this.surfaces);
    // Kept map meshes no session holds go when this look would build them again (a held map follows its session).
    this.mapMeshes.trim(mapLookOf(quality));
    this.environmentDirty = true;
    // The post stack is made again for the new settings on the next frame (G5); the map may be rebuilt, so its
    // reflective meshes are looked for again.
    this.post.drop();
    this.post.rescan();
    const replaced = quality.antialias !== this.contextAntialias && this.replaceContext(quality.antialias);
    this.gl.shadowMap.enabled = quality.shadows;
    this.resize();
    return replaced;
  }

  /**
   * The retro pixel filter (Settings → Dev, M42): `look` turns it on (or changes its pixel size and colours), null turns
   * it off and frees its render target and pass. Applies from the next frame, on every map and the range.
   */
  setRetro(look: RetroLook | null): void {
    this.retroLook = look ? { ...look } : null;
    // The retro filter draws instead of the post stack (a dev look): the stack goes while it is on, and comes back after.
    this.post.drop();
    if (!look) {
      this.retro?.dispose();
      this.retro = null;
      return;
    }
    if (this.retro) this.retro.setLook(look);
    else this.retro = this.makeRetro(look);
    this.retro.resize(this.width, this.height, this.gl.getPixelRatio());
  }

  /**
   * How wide one retro pixel is at the middle of the view (radians of the main camera's view, zoom included); 0 while
   * the filter is off. BBs are kept at least a couple of these wide (RETRO.bbMinPixels).
   */
  get retroPixelAngle(): number {
    return this.retroLook ? retroPixelAngle(this.camera.fov, this.height, this.retroLook.pixelSize) : 0;
  }

  /** Narrows the main camera's view by `zoom` (1 = the normal view), e.g. while aiming down an optic. */
  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.camera.fov = zoomedFov(this.baseFov, zoom);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Compiles the shaders the first frame would (M63, audit REN-06): every material in the world and in `overlay` under
   * the lights, haze, environment and render target that frame draws with, so a match's first frame (2 to 4 point
   * lights and a spot at night) is not where they are compiled. Called once, as a session's build ends; Three.js keys
   * each program on what it was compiled under, so the frame takes them as they are. Shadow depth shaders still compile
   * on the first frame (Three.js makes them as it draws the shadow map).
   */
  warmShaders(overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    if (this.environmentDirty) this.applyEnvironment();
    // A session's build has just ended: its reflective meshes (if any) are found on the next frame.
    this.post.rescan();
    const gl = this.gl;
    const retro = this.retro;
    // The world draws into the post stack's target when there is one (G5), the held replica onto the canvas after it.
    const post = this.postStack();
    const world = retro?.renderTarget ?? post?.sceneTarget ?? null;
    const held = retro?.renderTarget ?? null;
    if (world) gl.setRenderTarget(world);
    gl.compile(this.scene, this.camera);
    if (world !== held) gl.setRenderTarget(held);
    if (overlay) gl.compile(overlay.scene, overlay.camera);
    if (held) gl.setRenderTarget(null);
  }

  /** Lets go of `scene` as the overlay to release on a context swap (its match is over and has freed it, BP2). */
  forgetOverlay(scene: THREE.Scene): void {
    if (this.overlayScene === scene) this.overlayScene = null;
  }

  /** Draws the world, then (optionally) an overlay scene such as the held replica on top of it. */
  render(overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    if (this.environmentDirty) this.applyEnvironment();
    const gl = this.gl;
    const timer = this.timer();
    timer?.begin();
    // Count both passes in renderer.info (the debug overlay reads it).
    gl.info.autoReset = false;
    gl.info.reset();
    // The retro filter (M42): both passes draw into its small target, then its pass shows that on the canvas.
    const retro = this.retro;
    if (retro) gl.setRenderTarget(retro.renderTarget);
    gl.autoClear = true;
    // The post stack (G5) draws the world through its passes onto the canvas; the held replica goes on top after it,
    // so the temporal blend never smears it and the lens finish never covers it.
    const post = this.postStack();
    if (post) {
      this.post.findReflective(post, this.scene);
      post.render(gl, this.scene, this.camera);
    } else {
      gl.render(this.scene, this.camera);
    }
    if (overlay) {
      this.overlayScene = overlay.scene;
      gl.autoClear = false;
      gl.clearDepth();
      gl.render(overlay.scene, overlay.camera);
    }
    retro?.present(gl);
    timer?.end();
  }

  /** The post stack's passes in force, in order (the debug overlay): none on Low. */
  get postPasses(): readonly PostPassId[] {
    return this.post.plan;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.unlisten(this.canvas);
    this.post.drop();
    this.mapMeshes.clear();
    if (this.surfaces) disposeSurfaceTextures(this.surfaces);
    this.surfaces = null;
    this.sheen.dispose();
    this.retro?.dispose();
    this.retro = null;
    this.figureModel?.dispose();
    this.figureModel = null;
    this.dropTimer();
    this.gl.dispose();
    // Frees the context at once rather than when the canvas is collected (REN-24): browsers cap live contexts.
    this.gl.forceContextLoss();
    this.gl.domElement.remove();
  }

  /**
   * Environment lighting (F1): the prefiltered sky as the scene's environment while the setting is on, made on the
   * first frame that wants it (the sheen's prefilter, shared), none otherwise. Materials that must not take it (the
   * map's painted surfaces) opt out themselves (render/surfaceMaterials.ts).
   */
  private applyEnvironment(): void {
    this.environmentDirty = false;
    this.scene.environment = this.sheen.texture(this.gl, this.quality.environment, this.environmentLook);
    this.scene.environmentIntensity = this.lighting.environment.intensity;
  }

  /**
   * The retro filter for the context in use: a half-float target where the context can draw into one (WebGL 2 with
   * EXT_color_buffer_half_float or _float, near universal), else 8-bit.
   */
  private makeRetro(look: RetroLook): RetroFilter {
    return new RetroFilter(look, this.drawsHalfFloat());
  }

  /** Whether the context can draw into half floats (WebGL 2 with EXT_color_buffer_half_float or _float, near universal). */
  private drawsHalfFloat(): boolean {
    const ext = this.gl.extensions;
    return ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
  }

  /** The post stack for this frame (G5): none on Low, while the retro filter is on and while the context is lost. */
  private postStack(): PostStack | null {
    return this.post.stackFor(this.quality, this.lighting, this.retroLook !== null);
  }

  /** The post stack at the drawing buffer's size (the window times the pixel ratio, render scale included). */
  private sizePost(): void {
    const pr = this.gl.getPixelRatio();
    this.post.setSize(this.width * pr, this.height * pr);
  }

  /** A WebGL renderer with the game's output settings, on a canvas of its own. Throws if the browser refuses a context. */
  private makeWebGL(antialias: boolean): THREE.WebGLRenderer {
    const gl = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance' });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    const { mapping, exposure } = toneMappingOf(this.toneMapping, this.lighting.exposureScale);
    gl.toneMapping = mapping;
    gl.toneMappingExposure = exposure;
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
    // The post stack's targets belong to the old context: freed with it, and made again on the new one's first frame.
    this.post.drop();
    // The sheen's target is freed by the context that made it; the session asks for a new one (contextRestored), and
    // the scene's environment is made again on the next frame.
    this.sheen.dispose();
    this.environmentDirty = true;
    // The retro filter's target belongs to the old context: freed with it, and made again on the new one below.
    this.retro?.dispose();
    this.retro = null;
    // Kept map meshes outside the scene are freed rather than handed over (CORE-33); a held map is in the scene.
    this.mapMeshes.contextReplaced();
    // Everything the old renderer has drawn (or uploaded ahead, the surface textures) lets go of it (REN-24).
    const roots: THREE.Object3D[] = [this.scene];
    if (this.overlayScene) roots.push(this.overlayScene);
    const figure = this.figureModel;
    if (figure) for (const part of [...Object.values(figure.parts), figure.whole]) if (part) roots.push(part);
    if (this.surfaces) for (const t of Object.values(this.surfaces)) {
      t.texture.dispose();
      t.normal?.dispose();
    }
    handOverRenderer(old, next, roots);
    this.gl = next;
    this.contextAntialias = antialias;
    this.listen(next.domElement);
    // A swap while the old context was lost: its restore event will never come (the old canvas is no longer heard), and
    // the new context is live, so the renderer and the session carry on as after a restore (G5 QA).
    if (this.post.contextGone) {
      this.post.contextBack();
      this.contextListener(false);
    }
    if (this.retroLook) this.retro = this.makeRetro(this.retroLook);
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

  /**
   * The timer's query went with a lost context: forgotten rather than deleted (an object of a lost context can't be),
   * and the next frame timed makes one on the context in use.
   */
  private forgetTimer(): void {
    this.gpuTimer = null;
  }

  private readonly contextLost = (e: Event): void => {
    // Without this the browser never gives the context back (Three.js does it too; repeating it is harmless).
    e.preventDefault();
    this.forgetTimer();
    // The post stack goes with the context (its targets are gone) and is made again once the context is back.
    this.post.contextLost();
    this.contextListener(true);
  };

  private readonly contextRestored = (): void => {
    // A render target comes back empty: the sheen is prefiltered again when the session next asks (and the scene's
    // environment on the next frame).
    this.sheen.forget();
    this.environmentDirty = true;
    this.post.contextBack();
    // A timer made while the context was gone (a frame drawn then) holds no query, or one of the lost context: the next
    // frame makes a new one on the restored context (M63, audit REN-07).
    this.forgetTimer();
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
    this.retro?.resize(w, h, this.gl.getPixelRatio());
    this.sizePost();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
