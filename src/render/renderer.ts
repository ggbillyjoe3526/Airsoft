import * as THREE from 'three';
import {
  type CoreSurfaceId,
  effectivePixelRatio,
  type LightingPreset,
  LIGHTING_PRESETS,
  RENDER,
  TONE_MAPPING,
  type QualitySettings,
  type RetroLook,
  type TextureSize,
  type ToneMappingId,
} from '../config/render';
import type { RenderBackend } from '../config/renderBackend';
import type { MapData } from '../map/mapTypes';
import type { FigureModel } from './externalModels';
import type { FigureRigs } from './figureRig';
import { ModelFiles } from './modelFiles';
import type { ReplicaFiles } from './replicaFiles';
import { environmentLookOf } from './lightingPreset';
import { MapMeshCache } from './mapMeshCache';
import { mapLookOf, texturesFor } from './mapMeshes';
import { type AnyPostChain, PostHost } from './post/postHost';
import type { PostPassId } from './post/postPlan';
import { addSurfaceTextures, CORE_SURFACES, disposeSurfaceTextures, type ProceduralTexture, setSurfaceAnisotropy, type SurfaceTextures } from './proceduralTextures';
import { defaultEnvironmentLook, type EnvironmentLook } from './replicaSheen';
import {
  browserIdle,
  type DrawingRenderer,
  type DrawStats,
  handOverRenderer,
  type IdleScheduler,
  toneMappingOf,
  verticalFovFor,
  warmSurfacesInIdle,
  zoomedFov,
} from './rendererParts';
import { retroPixelAngle, type RetroView } from './retroFilter';
import { releaseNormalMaps, usesNormalMaps } from './surfaceNormals';
import type { NodeBackend } from './webgpu/nodeBackend';

export {
  type DrawingRenderer,
  type DrawStats,
  handOverRenderer,
  type IdleScheduler,
  releaseGpuResources,
  type RetiringRenderer,
  toneMappingOf,
  verticalFovFor,
  warmSurfacesInIdle,
  zoomedFov,
} from './rendererParts';

/**
 * Owns the renderer, main camera and scene. Handles resizing. The renderer is the node renderer handed in by Game.create
 * (WebGPU overhaul W1; the only one since W6), on a WebGPU device or on its WebGL2 back end: every patched material as
 * its node twin (the world's W2, the figures' and the replica sheen W3), on WebGPU the night lit by clustered lights
 * (W3), the post stack, the retro filter and the output step as node passes (W4), and the particles, grass and tree
 * stand-ins by compute (W5). What it needs beyond the calls here lives in its own chunk (render/webgpu/nodeBackend.ts).
 */
export class Renderer {
  /** The node renderer, new on a lost device (nodeLost): don't keep it. */
  private gl: DrawingRenderer;
  /** What draws with it: the device, its passes and its counts (W1). */
  private node: NodeBackend;
  /** Set by dispose(): a device recovery still on its way does nothing. */
  private disposed = false;
  /** WebGL2 took over from a lost WebGPU device until the next load (W1): the Renderer row says so. */
  lostToWebGL = false;
  /** The antialiasing the renderer was made with: its multisampling is fixed for its life. */
  private readonly contextAntialias: boolean;
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
  /** The sky the environment map is made from: the engine's daytime sky until a session passes another. */
  private environmentLook: EnvironmentLook = defaultEnvironmentLook();
  /** The scene's environment must be set again before the next frame (settings changed, a new device). */
  private environmentDirty = true;
  /** Settings → Graphics → Tone mapping (F2): not part of a preset. */
  private toneMapping: ToneMappingId = TONE_MAPPING.default;
  /** The lighting preset in force (M33f, setLighting): its haze, exposure and environment. Day until a session sets one. */
  private lighting: LightingPreset = LIGHTING_PRESETS.day;
  /** Time the GPU's work each frame (the debug overlay, while shown). */
  gpuTiming = false;
  /** Whether the world may move (the match's MotionScale, set by CombatPresentation): the grass sway (W5). */
  motion = true;
  /**
   * The model files (render/modelFiles.ts): the figure model (M25a) and the replica models (M101), loaded as the Dev
   * tab's model switches let them in (RM4). Shared by every match and freed with the renderer.
   */
  models = new ModelFiles();
  /** The figure model the next match draws its players with; null for the built-in figures. */
  get figureModel(): FigureModel | null {
    return this.models.figureModel;
  }
  /** The rigged figures (BF1) the next match draws its players with, ahead of the figure model; null for the others. */
  get figureRigs(): FigureRigs | null {
    return this.models.figureRigs;
  }
  /** The replica models from files the viewmodel, the menus' pictures and the figures draw from; none for the built-in ones. */
  get replicaFiles(): ReplicaFiles {
    return this.models.replicaFiles;
  }
  /**
   * The last map's meshes, kept between sessions (audit CORE-33): Quit → Play on the same map takes them back. Sessions
   * take and release them (they must not dispose them); freed with the renderer.
   */
  readonly mapMeshes = new MapMeshCache();
  /**
   * The overlay scene drawn last (the held replica), released with the world when the device is replaced: kept while
   * spectating, when no overlay is drawn (BP2), until its owner lets go of it (forgetOverlay).
   */
  private overlayScene: THREE.Scene | null = null;
  /** The retro pixel filter's look while it is on (Settings → Dev, M42); null while off. */
  private retroLook: RetroLook | null = null;
  /** The filter's target and pass (the node renderer's, W4), made while the filter is on. */
  private retro: RetroView | null = null;
  /** Told when the device is lost (true) and when a new one draws (false); see onContextChange. */
  private contextListener: (lost: boolean) => void = () => undefined;
  /**
   * The post stack (G5, render/post/postHost.ts) for the quality in force: none on Low (the frame is drawn straight to
   * the screen), and none while the retro filter is on.
   */
  private readonly post = new PostHost((setup, width, height) => this.node.postStack(setup, width, height));

  /**
   * `quality` is what the game loads with; everything in it can change later (setQuality). `node`: the renderer to draw
   * with (render/rendererStart.ts startingRenderer), made for `quality.antialias`.
   */
  constructor(
    private readonly container: HTMLElement,
    private quality: QualitySettings,
    node: NodeBackend,
  ) {
    this.node = node;
    this.gl = this.dress(node.renderer);
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
    this.hear(node);
  }

  /** The renderer in use (a new one after a lost device: don't keep it). */
  get renderer(): DrawingRenderer {
    return this.gl;
  }

  /** Which back end draws (W1): WebGPU, or WebGL2. */
  get backend(): RenderBackend {
    return this.node.kind;
  }

  /** The WebGL2 back end's context (the diagnostics' GPU line); null on WebGPU. */
  get webglContext(): WebGL2RenderingContext | null {
    return this.node.webglContext;
  }

  /** WebGPU's clustered lights draw the night (W3): every lamp near the eye its own light; false on WebGL2. */
  get clusteredLights(): boolean {
    return this.node.clustered;
  }

  /** This frame's draw calls and triangles (both passes) and what the renderer holds (one object, refilled each read). */
  get stats(): DrawStats {
    return this.node.stats;
  }

  /**
   * Whether the screen is really multisampled (REN-21): what the renderer was given, which some browsers and drivers
   * make less than was asked.
   */
  get antialiased(): boolean {
    return this.node.antialiased;
  }

  /** The canvas's samples per pixel (the diagnostics' antialiasing line). */
  get samples(): number {
    return this.node.samples;
  }

  /** Antialiasing asked for but not in force: a renderer's multisampling is fixed, so it changes on the next load (REN-04). */
  get antialiasPending(): boolean {
    return this.quality.antialias !== this.contextAntialias;
  }

  /** The most anisotropic filtering the graphics card offers (Texture filtering is clamped to it). */
  get maxAnisotropy(): number {
    return this.node.maxAnisotropy;
  }

  /** The GPU's milliseconds a frame, smoothed (REN-17), from timestamp queries: NaN without them or while not timing. */
  get gpuMs(): number {
    return this.node.gpuMs;
  }

  /**
   * A lost device (a driver reset, the GPU taken by another app; audit W-01): `listener(true)` when it goes,
   * `listener(false)` when a new renderer draws (nodeLost). Every geometry and texture is uploaded again from its copy on
   * the next frame drawn, but render targets come back empty: whatever draws into one once must draw it again
   * (CombatPresentation.contextRestored, audit L-02; TorchBeams.contextRestored for the torch spot's shadow map, which
   * is drawn only while the torch is on, BP3; the sun's is redrawn every frame).
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
   * The held replica's sheen for the settings in force: the sky the renderer prefilters (W3), shared with the
   * environment map and by every match and range; null while Replica sheen is off. Sessions must not dispose it.
   */
  get replicaSheen(): THREE.Texture | null {
    return this.node.environment(this.quality.replicaSheen, this.environmentLook);
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
    // The stack is made afresh for each map (W4): its history and reflective stand-ins go with the last one.
    this.post.drop();
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
   * Tone mapping (Settings → Graphics, F2): applies at once. The exposure goes with it (TONE_MAPPING.exposure), so the
   * field stays about as bright under each.
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
    // A step that comes round after dispose() would draw a fresh surface set nobody frees (DX0): it runs nothing.
    const whileLive: IdleScheduler = (work) => idle(() => (this.disposed ? undefined : work()));
    warmSurfacesInIdle(
      CORE_SURFACES,
      (id: CoreSurfaceId) => addSurfaceTextures(this.surfaceSet(), [id], this.surfacesSize!, this.quality.anisotropy)[id]!.texture,
      (texture) => {
        if (this.surfaces && (Object.values(this.surfaces) as ProceduralTexture[]).some((t) => t.texture === texture)) this.gl.initTexture(texture);
      },
      whileLive,
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
   * and filtering change at once; antialiasing from the next load (antialiasPending). The match's lights, surfaces and
   * effects follow through MatchSession.setQuality, which must come after this (a new texture size is drawn when the
   * session asks for it).
   */
  setQuality(quality: QualitySettings): void {
    this.quality = quality;
    if (this.surfaces && this.surfacesSize !== quality.textureSize) {
      disposeSurfaceTextures(this.surfaces);
      this.surfaces = null;
    }
    if (this.surfaces) setSurfaceAnisotropy(this.surfaces, quality.anisotropy);
    this.node.trimSky(quality.replicaSheen || quality.environment);
    // Normal maps are freed while nothing draws with them, like the sheen (made again when a material asks).
    if (this.surfaces && !usesNormalMaps(quality)) releaseNormalMaps(this.surfaces);
    // Kept map meshes no session holds go when this look would build them again (a held map follows its session).
    this.mapMeshes.trim(mapLookOf(quality));
    this.environmentDirty = true;
    // The post stack is made again for the new settings on the next frame (G5); the map may be rebuilt, so its
    // reflective meshes are looked for again.
    this.post.drop();
    this.post.rescan();
    // The sized points (W2): effects a quality change makes are given their sprites on the next frame.
    this.node.rescan();
    this.gl.shadowMap.enabled = quality.shadows;
    this.resize();
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
    else this.retro = this.node.retro(look);
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
   * Compiles the pipelines the first frame would (M63, audit REN-06): every material in the world and in `overlay`
   * under the lights, haze, environment and target that frame draws with, so a match's first frame is not where they
   * are compiled. Called once, as a session's build ends; the renderer compiles them in the background (W1, W4).
   */
  warmShaders(overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    if (this.environmentDirty) this.applyEnvironment();
    // A session's build has just ended: its reflective meshes (if any) are found on the next frame.
    this.post.rescan();
    this.node.compile(this.scene, this.camera, overlay, this.retro ?? this.postStack(), this.quality);
  }

  /**
   * Settles once the warm-up compile under way (if any) is done. The item pictures wait for it (W6a): a picture drawn
   * meanwhile waits on the GPU for the whole match's pipelines inside its own draw, holding the page.
   */
  afterCompiles(): Promise<void> {
    return this.node.afterCompiles();
  }

  /** Lets go of `scene` as the overlay to release on a device swap (its match is over and has freed it, BP2). */
  forgetOverlay(scene: THREE.Scene): void {
    if (this.overlayScene === scene) this.overlayScene = null;
  }

  /**
   * Draws the world, then (optionally) an overlay scene such as the held replica on top of it: through the retro filter
   * or the post stack, or on Low straight onto the canvas (W4: render/webgpu/nodeBackend.ts draw).
   */
  render(overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    const node = this.node;
    // A lost device draws nothing until its replacement takes over (nodeLost).
    if (node.lost) return;
    if (this.environmentDirty) this.applyEnvironment();
    node.prepare(this.scene, this.quality, this.motion);
    node.setTiming(this.gpuTiming);
    // Count both passes in renderer.info (the debug overlay reads it).
    this.gl.info.autoReset = false;
    this.gl.info.reset();
    if (overlay) this.overlayScene = overlay.scene;
    const post = this.retro ? null : this.postStack();
    if (post) this.post.findReflective(post, this.scene);
    node.draw(this.scene, this.camera, overlay, this.retro ?? post);
    node.frameDone();
  }

  /** The post stack's passes in force, in order (the debug overlay): none on Low. */
  get postPasses(): readonly PostPassId[] {
    return this.post.plan;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.post.drop();
    this.mapMeshes.clear();
    if (this.surfaces) disposeSurfaceTextures(this.surfaces);
    this.surfaces = null;
    this.retro?.dispose();
    this.retro = null;
    this.models.dispose();
    this.disposed = true;
    // Frees the device (or the WebGL2 context) at once rather than when the canvas is collected (REN-24).
    this.node.dispose();
    this.gl.domElement.remove();
  }

  /**
   * Environment lighting (F1): the prefiltered sky as the scene's environment while the setting is on, made on the
   * first frame that wants it (the sheen's prefilter, shared), none otherwise. Materials that must not take it (the
   * map's painted surfaces) opt out themselves (render/surfaceMaterials.ts).
   */
  private applyEnvironment(): void {
    this.environmentDirty = false;
    this.scene.environment = this.node.environment(this.quality.environment, this.environmentLook);
    this.scene.environmentIntensity = this.lighting.environment.intensity;
  }

  /** The post stack for this frame (G5): none on Low, and none while the retro filter is on. */
  private postStack(): AnyPostChain | null {
    return this.post.stackFor(this.quality, this.lighting, this.retroLook !== null);
  }

  /** The post stack at the drawing buffer's size (the window times the pixel ratio, render scale included). */
  private sizePost(): void {
    const pr = this.gl.getPixelRatio();
    this.post.setSize(this.width * pr, this.height * pr);
  }

  /** The game's output settings on a new renderer: colour space, tone mapping, shadows, the canvas's class. */
  private dress(gl: DrawingRenderer): DrawingRenderer {
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
   * `next` takes the lost `old`'s place on the page. Everything made for the old device goes with it: the post stack's
   * and the retro filter's targets (made again on the new one's first frame) and the environment map (made again; the
   * session asks for the sheen again on contextRestored). Kept map meshes outside the scene are freed rather than handed
   * over (CORE-33; a held map is in the scene), and everything the old renderer has drawn (or uploaded ahead, the
   * surface textures) lets go of it (REN-24), to be uploaded again.
   */
  private takeOver(old: NodeBackend, next: NodeBackend): void {
    this.post.drop();
    this.environmentDirty = true;
    this.retro?.dispose();
    this.retro = null;
    this.mapMeshes.contextReplaced();
    const roots: THREE.Object3D[] = [this.scene];
    if (this.overlayScene) roots.push(this.overlayScene);
    const figure = this.models.anyFigure;
    if (figure) for (const part of [...Object.values(figure.parts), figure.whole]) if (part) roots.push(part);
    if (this.surfaces) for (const t of Object.values(this.surfaces)) {
      t.texture.dispose();
      t.normal?.dispose();
    }
    handOverRenderer({ domElement: old.renderer.domElement, dispose: () => old.dispose() }, next.renderer, roots);
    this.gl = this.dress(next.renderer);
    this.node = next;
    this.hear(next);
    if (this.retroLook) this.retro = next.retro(this.retroLook);
  }

  /**
   * Listens for the loss of the device (or the WebGL2 context), reported by the node renderer (W1). A renderer whose
   * device was lost before it got here (while the game waited for physics) is recovered the same way, a microtask on,
   * once the game has had the chance to hear about it (onContextChange).
   */
  private hear(node: NodeBackend): void {
    node.onLost(this.nodeLost);
    if (node.lost) queueMicrotask(this.nodeLost);
  }

  /**
   * Device-lost recovery (W1). The game pauses, and a new renderer on a new canvas and device takes the lost one's place
   * (render targets come back empty, so the session redraws them on contextRestored), and play can resume. When no new
   * WebGPU device is given, WebGL2 takes over until the next load (NodeBackend.replacement); if even that is refused,
   * the game stays paused under the graphics notice, which says to reload.
   */
  private readonly nodeLost = async (): Promise<void> => {
    const old = this.node;
    this.contextListener(true);
    const gone = (): boolean => this.disposed || this.node !== old;
    const next = await old.replacement(gone);
    if (gone()) return next?.dispose();
    if (!next) return;
    this.takeOver(old, next);
    if (old.kind === 'webgpu' && next.kind === 'webgl') this.lostToWebGL = true;
    this.resize();
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
