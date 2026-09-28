import RAPIER from '@dimforge/rapier3d-compat';
import type { BodyConfig } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { MapBlock, MapData } from '../map/mapTypes';
import type { Character } from '../sim/character';
import type { CharacterMover } from '../sim/movement';
import type { Vec3 } from '../sim/vec';

/** Collision group bits (Rapier packs membership in the high 16 bits, filter in the low 16). */
const GROUP_STATIC = 0x0001;
const GROUP_CHARACTER = 0x0002;
const groups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);

const STATIC_GROUPS = groups(GROUP_STATIC, 0xffff);
/** Characters collide with level geometry only, never with each other. */
const CHARACTER_GROUPS = groups(GROUP_CHARACTER, GROUP_STATIC);

/** Box corners, then triangles wound counter-clockwise seen from outside (outward normals). */
const BOX_TRIANGLES = new Uint32Array([
  0, 1, 5, 0, 5, 4, // bottom (-y)
  3, 7, 6, 3, 6, 2, // top (+y)
  0, 2, 1, 0, 3, 2, // back (-z)
  4, 5, 6, 4, 6, 7, // front (+z)
  0, 4, 7, 0, 7, 3, // left (-x)
  1, 2, 6, 1, 6, 5, // right (+x)
]);

/**
 * Level blocks collide as closed 12-triangle meshes rather than Rapier cuboids. With cuboids, the
 * capsule character controller sinks into a block when it moves along one of the block's diagonal
 * planes (x = ±z about the block centre), whatever the block's size or thickness; convex hulls and
 * round cuboids sink too. Triangle meshes don't. FIX_INTERNAL_EDGES is essential: without it the diagonal
 * edge splitting each face produces ghost "ground" contacts on vertical faces, letting players stick
 * to walls and climb crates by spamming jump (see physicsWorld.test.ts regression tests).
 */
function blockCollider(b: MapBlock): RAPIER.ColliderDesc {
  const hx = b.size.x / 2;
  const hy = b.size.y / 2;
  const hz = b.size.z / 2;
  const corners = new Float32Array([
    -hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz,
    -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
  ]);
  return RAPIER.ColliderDesc.trimesh(corners, BOX_TRIANGLES, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
}

let rapierReady: Promise<void> | null = null;

/** Loads the Rapier WASM module once. */
export function initPhysics(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/**
 * Static level collision + a kinematic character controller. Crouching lowers the eyes (and later
 * the hitbox) but not the movement capsule; Phase 1 maps have no crawl spaces.
 */
export class PhysicsWorld implements CharacterMover {
  private readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly characterColliders = new Map<number, RAPIER.Collider>();
  private readonly capsuleHalfHeight: number;
  private readonly capsuleCenterOffset: number;
  private readonly scratch = { x: 0, y: 0, z: 0 };

  /** Call `initPhysics()` first. */
  constructor(
    map: MapData,
    private readonly body: BodyConfig,
    timestep: number,
  ) {
    this.capsuleHalfHeight = body.height / 2 - body.radius;
    this.capsuleCenterOffset = body.height / 2;

    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = timestep;

    for (const b of map.blocks) {
      const desc = blockCollider(b);
      desc.setTranslation(b.center.x, b.center.y, b.center.z).setCollisionGroups(STATIC_GROUPS);
      this.world.createCollider(desc);
    }

    this.controller = this.world.createCharacterController(PHYSICS.controllerOffset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(PHYSICS.autostepHeight, PHYSICS.autostepMinWidth, false);
    this.controller.enableSnapToGround(PHYSICS.snapToGround);
    this.controller.setMaxSlopeClimbAngle(PHYSICS.maxSlopeClimb);
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    // Builds the query acceleration structures for the static level.
    this.world.step();
  }

  addCharacter(c: Character): void {
    const desc = RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.body.radius)
      .setTranslation(c.position.x, c.position.y + this.capsuleCenterOffset, c.position.z)
      .setCollisionGroups(CHARACTER_GROUPS);
    this.characterColliders.set(c.id, this.world.createCollider(desc));
  }

  move(c: Character, desired: Vec3, out: Vec3): boolean {
    const col = this.characterColliders.get(c.id);
    if (!col) throw new Error(`No collider for character ${c.id}`);
    const s = this.scratch;
    s.x = c.position.x;
    s.y = c.position.y + this.capsuleCenterOffset;
    s.z = c.position.z;
    col.setTranslation(s);

    this.controller.computeColliderMovement(col, desired, undefined, CHARACTER_GROUPS);
    const m = this.controller.computedMovement();
    out.x = m.x;
    out.y = m.y;
    out.z = m.z;

    s.x += m.x;
    s.y += m.y;
    s.z += m.z;
    col.setTranslation(s);
    return this.controller.computedGrounded();
  }

  dispose(): void {
    this.controller.free();
    this.world.free();
    this.characterColliders.clear();
  }
}
