import * as THREE from 'three';
import { type PointKind, pointKind, type SharedBuffer, spriteTwin } from './effectNodes';

/**
 * Sized points on the node path (WebGPU overhaul W2). WebGPU draws a point primitive one pixel wide (and Three's
 * WebGL2 back end does the same), so the stars, the fires' embers, the fireflies and the dust motes, each a
 * `THREE.Points` whose size the GLSL sets, would shrink to dots. Here each such Points gets a twin: a `THREE.Sprite`
 * child drawing one camera-facing quad per point in one instanced draw (Three's own instanced-points path,
 * PointsNodeMaterial), reading the Points' own position, colour and per-point arrays per instance (no copy: the same
 * typed arrays, sent again in the frame the CPU changes them), while the Points itself leaves the camera's layers on
 * this path. The Points' visibility, draw range, transform and onBeforeRender (the stars follow the camera) still
 * drive what the twin draws, so the modules that own them don't know the twin exists.
 *
 * The Renderer asks for a scan after a session's build and after a quality change (`rescan`); the first frame after it
 * finds the new Points (`prepare`), so no frame walks the scene otherwise. A twin goes with its Points' material
 * (every owner disposes it with the Points) or with the node renderer (`dispose`, which also gives each Points its
 * layers back, so WebGL taking over after a lost device draws them as before).
 */

/** One Points' twin. */
interface PointTwin {
  readonly sprite: THREE.Sprite;
  readonly mask: number;
  dispose(): void;
}

/** The quad each point is drawn as: its own geometry, so freeing it frees the per-instance buffers read with it. */
function quad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Makes `points`' twin of `kind`, a child of it; `gone` is told when the Points' material is freed. */
function makeTwin(points: THREE.Points, kind: PointKind, gone: () => void): PointTwin {
  const buffers: SharedBuffer[] = [];
  const material = spriteTwin(points, kind, buffers);
  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  const geometry = quad();
  sprite.geometry = geometry;
  sprite.name = `${points.name}-sprites`;
  sprite.frustumCulled = false;
  sprite.renderOrder = points.renderOrder;
  const position = points.geometry.getAttribute('position');
  // Before each draw: as many quads as the Points draws, the CPU's changes sent, and the Points' own hook (the stars'
  // camera follow) run as if it were drawn. No allocation.
  sprite.onBeforeRender = (renderer, scene, camera, geo, mat, group) => {
    for (let i = 0; i < buffers.length; i++) {
      const b = buffers[i]!;
      if (b.from.version !== b.seen) {
        b.seen = b.from.version;
        b.buffer.needsUpdate = true;
      }
    }
    const range = points.geometry.drawRange;
    sprite.count = Math.max(0, Math.min(position.count - range.start, range.count));
    points.onBeforeRender(renderer, scene, camera, geo, mat, group);
  };
  const mask = points.layers.mask;
  points.layers.disableAll();
  points.add(sprite);
  const plain = points.material as THREE.Material;
  const onDispose = (): void => gone();
  plain.addEventListener('dispose', onDispose);
  return {
    sprite,
    mask,
    dispose: () => {
      plain.removeEventListener('dispose', onDispose);
      sprite.removeFromParent();
      points.layers.mask = mask;
      material.dispose();
      geometry.dispose();
    },
  };
}

export class PointSprites {
  private readonly twins = new Map<THREE.Points, PointTwin>();
  private dirty = true;

  /** The scene changed (a session's build, a quality change): the next `prepare` looks for new Points. */
  rescan(): void {
    this.dirty = true;
  }

  /** Before a frame: after a rescan, gives every new sized Points in `scene` its twin. */
  prepare(scene: THREE.Object3D): void {
    if (!this.dirty) return;
    this.dirty = false;
    scene.traverse(this.visit);
  }

  /** How many Points have a twin (the tests and the debug overlay's checks). */
  get count(): number {
    return this.twins.size;
  }

  /** Every twin freed and every Points given its layers back. */
  dispose(): void {
    for (const twin of this.twins.values()) twin.dispose();
    this.twins.clear();
  }

  private readonly visit = (o: THREE.Object3D): void => {
    if (!(o instanceof THREE.Points) || this.twins.has(o) || Array.isArray(o.material)) return;
    const kind = pointKind(o.material as THREE.Material);
    if (kind) this.twins.set(o, makeTwin(o, kind, () => this.drop(o)));
  };

  private drop(points: THREE.Points): void {
    this.twins.get(points)?.dispose();
    this.twins.delete(points);
  }
}
