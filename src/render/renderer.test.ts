import * as THREE from 'three';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TONE_MAPPING } from '../config/render';
import type { SurfaceTextures } from './proceduralTextures';
import { handOverRenderer, releaseGpuResources, toneMappingOf, verticalFovFor, warmSurfacesInIdle, zoomedFov } from './renderer';

describe('verticalFovFor', () => {
  it('converts a 16:9 horizontal FOV to the matching vertical FOV', () => {
    // 90° horizontal at 16:9 is ~58.7° vertical.
    expect(verticalFovFor(90)).toBeCloseTo(58.72, 1);
    expect(verticalFovFor(100)).toBeCloseTo(67.67, 1);
  });
});

describe('zoomedFov', () => {
  it('narrows the view by the zoom factor (and leaves it alone at 1)', () => {
    const fov = verticalFovFor(100);
    expect(zoomedFov(fov, 1)).toBeCloseTo(fov, 9);
    const DEG = Math.PI / 180;
    expect(Math.tan((zoomedFov(fov, 1.25) * DEG) / 2)).toBeCloseTo(Math.tan((fov * DEG) / 2) / 1.25, 12);
  });
});

describe('warmSurfacesInIdle (REN-14)', () => {
  /** A queue of idle moments run by hand. */
  function manualIdle() {
    const jobs: (() => void)[] = [];
    return { idle: (work: () => void) => void jobs.push(work), runOne: () => jobs.shift()?.(), waiting: () => jobs.length };
  }
  const fakeSet = () =>
    Object.fromEntries(['concrete', 'blockWall', 'crate'].map((id) => [id, { texture: { name: id } as unknown as THREE.Texture }])) as unknown as SurfaceTextures;

  it('draws the set in one idle moment, then uploads one texture a moment until all are up, and stops', () => {
    const { idle, runOne, waiting } = manualIdle();
    const set = fakeSet();
    const draw = vi.fn(() => set);
    const uploaded: string[] = [];
    warmSurfacesInIdle(draw, () => set, (t) => uploaded.push(t.name), idle);
    expect(draw).not.toHaveBeenCalled();
    runOne();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(uploaded).toEqual([]);
    runOne();
    expect(uploaded).toEqual(['concrete']);
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['concrete', 'blockWall', 'crate']);
  });

  it('stops uploading once the set is dropped (a texture-size change)', () => {
    const { idle, runOne, waiting } = manualIdle();
    const set = fakeSet();
    let current: SurfaceTextures | null = set;
    const uploaded: string[] = [];
    warmSurfacesInIdle(() => set, () => current, (t) => uploaded.push(t.name), idle);
    runOne();
    runOne();
    current = null;
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['concrete']);
  });
});

describe('toneMappingOf (audit F2)', () => {
  it('gives each Tone mapping choice its Three.js mapper and exposure, Neutral at 1 by default', () => {
    expect(toneMappingOf(TONE_MAPPING.default)).toEqual({ mapping: NeutralToneMapping, exposure: 1 });
    expect(toneMappingOf('agx').mapping).toBe(AgXToneMapping);
    expect(toneMappingOf('aces')).toEqual({ mapping: ACESFilmicToneMapping, exposure: TONE_MAPPING.exposure.aces });
  });
});

describe('handOverRenderer (REN-24)', () => {
  /**
   * A stand-in for THREE.WebGLRenderer that keeps what Three keeps: a dispose listener (holding the renderer) on every
   * geometry, material, texture, instanced mesh and shadow map it draws, removed only when that object is disposed.
   */
  /** Three's DFG lookup table: one texture shared by every renderer, bound to standard materials by the renderer itself. */
  const lookupTable = new THREE.DataTexture(new Uint8Array(4), 1, 1);

  class StubRenderer {
    readonly domElement = { replaceWith: vi.fn() };
    /** The renderer's own uniforms per material (WebGLRenderer.properties). */
    private readonly own = new WeakMap<object, { uniforms?: Record<string, THREE.IUniform> }>();
    readonly properties = { get: (o: object) => this.own.get(o) ?? this.own.set(o, {}).get(o)! };
    readonly held = new Set<THREE.EventDispatcher<{ dispose: object }>>();
    disposed = false;
    lost = false;
    dispose(): void {
      this.disposed = true;
    }
    forceContextLoss(): void {
      this.lost = true;
    }
    draw(roots: THREE.Object3D[]): void {
      for (const root of roots) {
        root.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) this.hold(o);
          const { geometry, material } = o as Partial<THREE.Mesh>;
          if (geometry) this.hold(geometry);
          for (const m of material ? [material].flat() : []) {
            this.hold(m);
            if (m instanceof THREE.MeshStandardMaterial) {
              this.properties.get(m).uniforms = { dfgLUT: { value: lookupTable } };
              this.hold(lookupTable);
            }
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) this.hold(v);
            for (const u of Object.values((m as Partial<THREE.ShaderMaterial>).uniforms ?? {})) if (u.value instanceof THREE.Texture) this.hold(u.value);
          }
          const shadow = (o as Partial<THREE.DirectionalLight>).shadow;
          if (shadow && (o as THREE.Light).castShadow) this.hold((shadow.map ??= new THREE.WebGLRenderTarget(64, 64)));
        });
      }
    }
    private hold(target: THREE.EventDispatcher<{ dispose: object }>): void {
      if (this.held.has(target)) return;
      this.held.add(target);
      const listener = (): void => {
        target.removeEventListener('dispose', listener);
        this.held.delete(target);
      };
      target.addEventListener('dispose', listener);
    }
  }

  function world(): { scene: THREE.Scene; overlay: THREE.Scene; instanced: THREE.InstancedMesh } {
    const scene = new THREE.Scene();
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map })));
    const instanced = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 4);
    instanced.setMatrixAt(2, new THREE.Matrix4().makeTranslation(1, 2, 3));
    scene.add(instanced);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial({ uniforms: { tex: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) } } })));
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    scene.add(sun);
    const overlay = new THREE.Scene();
    overlay.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()]));
    return { scene, overlay, instanced };
  }

  it('leaves only the renderer in use holding the scenes after repeated swaps, the old ones freed with their contexts', () => {
    const { scene, overlay, instanced } = world();
    const roots = [scene, overlay];
    const made = [new StubRenderer()];
    made[0]!.draw(roots);
    for (let swap = 0; swap < 6; swap++) {
      const next = new StubRenderer();
      handOverRenderer(made.at(-1)!, next as unknown as { domElement: HTMLCanvasElement }, roots);
      next.draw(roots); // the next frame uploads everything to the new context
      made.push(next);
    }
    // Only the last renderer is still reachable from the scenes; every one before it is disposed and its context lost.
    expect(made.filter((r) => r.held.size > 0)).toEqual([made.at(-1)]);
    for (const r of made.slice(0, -1)) {
      expect([r.disposed, r.lost]).toEqual([true, true]);
      expect(r.domElement.replaceWith).toHaveBeenCalledTimes(1);
    }
    expect(made.at(-1)!.held.size).toBeGreaterThan(8);
    // Nothing on the CPU side is lost: the instances keep their matrices for the new context's upload.
    expect(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(instanced.instanceMatrix.array, 2 * 16))).toEqual(new THREE.Vector3(1, 2, 3));
  });

  it('frees a shadow map so the next renderer makes its own', () => {
    const { scene } = world();
    const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
    new StubRenderer().draw([scene]);
    const map = sun.shadow.map!;
    const freed = vi.fn();
    map.addEventListener('dispose', freed);
    releaseGpuResources(scene);
    expect(freed).toHaveBeenCalledTimes(1);
    expect(sun.shadow.map).toBeNull();
  });
});
