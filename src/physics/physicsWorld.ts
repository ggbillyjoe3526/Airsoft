import RAPIER from '@dimforge/rapier3d-compat';
import { blockMaterial } from '../config/materials';
import type { BodyConfig } from '../config/movement';
import type { ImpactMaterial } from '../config/sounds';
import { PHYSICS } from '../config/physics';
import type { MapBlock, MapData } from '../map/mapTypes';
import { RAMP_FACES, rampCorners } from '../map/surfaces';
import type { SurfaceHit } from '../sim/armament';
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
/** Queries that should only see level geometry. */
const QUERY_STATIC_ONLY = groups(0xffff, GROUP_STATIC);
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const DOWN = { x: 0, y: -1, z: 0 };
/** A ground-probe hit counts as floor only if its surface normal is at most the max slope from vertical. */
const MIN_GROUND_NORMAL_Y = Math.cos(PHYSICS.maxSlopeClimb);

/** Box corners, then triangles wound counter-clockwise seen from outside (outward normals). */
const BOX_TRIANGLES = new Uint32Array([
  0, 1, 5, 0, 5, 4, // bottom (-y)
  3, 7, 6, 3, 6, 2, // top (+y)
  0, 2, 1, 0, 3, 2, // back (-z)
  4, 5, 6, 4, 6, 7, // front (+z)
  0, 4, 7, 0, 7, 3, // left (-x)
  1, 2, 6, 1, 6, 5, // right (+x)
]);

/** A ramp's wedge as triangles: each face of RAMP_FACES fanned from its first corner. */
const RAMP_TRIANGLES = new Uint32Array(RAMP_FACES.flatMap((f) => f.slice(2).flatMap((c, k) => [f[0]!, f[k + 1]!, c])));

/**
 * Level blocks collide as closed 12-triangle meshes rather than Rapier cuboids. With cuboids, the
 * capsule character controller sinks into a block when it moves along one of the block's diagonal
 * planes (x = ±z about the block centre), whatever the block's size or thickness; convex hulls and
 * round cuboids sink too. Triangle meshes don't. FIX_INTERNAL_EDGES is essential: without it the diagonal
 * edge splitting each face produces ghost "ground" contacts on vertical faces, letting players stick
 * to walls and climb crates by spamming jump (see physicsWorld.test.ts regression tests). A ramp is a
 * closed 8-triangle wedge built the same way.
 */
function blockCollider(b: MapBlock): RAPIER.ColliderDesc {
  if (b.kind === 'ramp') {
    const corners = new Float32Array(18);
    rampCorners(b, corners);
    return RAPIER.ColliderDesc.trimesh(corners, RAMP_TRIANGLES, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
  }
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
 * Static level collision + a kinematic character controller. Crouching lowers the eyes and the hit
 * volume but not the movement capsule; Depot has no crawl spaces.
 */
export class PhysicsWorld implements CharacterMover {
  private readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly characterColliders = new Map<number, RAPIER.Collider>();
  private readonly capsuleHalfHeight: number;
  private readonly capsuleCenterOffset: number;
  private readonly scratch = { x: 0, y: 0, z: 0 };
  private readonly groundProbe: RAPIER.Ball;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  /** What each level block's collider is made of, by collider handle (ricochets). */
  private readonly materials = new Map<number, ImpactMaterial>();

  /** Call `initPhysics()` first. */
  constructor(
    map: MapData,
    private readonly body: BodyConfig,
    timestep: number,
  ) {
    this.capsuleHalfHeight = body.height / 2 - body.radius;
    this.capsuleCenterOffset = body.height / 2;
    this.groundProbe = new RAPIER.Ball(body.radius - PHYSICS.groundProbeInset);

    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = timestep;

    for (const b of map.blocks) {
      const desc = blockCollider(b);
      desc.setTranslation(b.center.x, b.center.y, b.center.z).setCollisionGroups(STATIC_GROUPS);
      this.materials.set(this.world.createCollider(desc).handle, blockMaterial(b));
    }

    this.controller = this.world.createCharacterController(PHYSICS.controllerOffset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(PHYSICS.autostepHeight, PHYSICS.autostepMinWidth, false);
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

  probeGround(c: Character, maxDrop: number): number {
    const lift = PHYSICS.groundProbeLift;
    const s = this.scratch;
    s.x = c.position.x;
    s.y = c.position.y + lift + this.groundProbe.radius;
    s.z = c.position.z;
    const hit = this.world.castShape(
      s,
      IDENTITY_ROTATION,
      DOWN,
      this.groundProbe,
      PHYSICS.groundRestGap,
      lift + maxDrop,
      true,
      undefined,
      QUERY_STATIC_ONLY,
    );
    // Starting inside geometry (toi 0) gives no usable height; let the character fall and land normally.
    if (!hit || hit.time_of_impact <= 0) return Number.NaN;
    // Only surfaces facing up count as ground; the probe grazing the top edge of cover does not.
    // (World.castShape reports the hit collider as shape 1, so normal1 is the surface normal.)
    if (hit.normal1.y < MIN_GROUND_NORMAL_Y) return Number.NaN;
    return lift - hit.time_of_impact;
  }

  /**
   * Distance along a normalised direction to the first level surface, or -1 if nothing is hit
   * within `maxDist`. Characters are ignored.
   */
  raycastStatic(origin: Vec3, dir: Vec3, maxDist: number): number {
    const r = this.ray;
    r.origin.x = origin.x;
    r.origin.y = origin.y;
    r.origin.z = origin.z;
    r.dir.x = dir.x;
    r.dir.y = dir.y;
    r.dir.z = dir.z;
    const hit = this.world.castRay(r, maxDist, true, undefined, QUERY_STATIC_ONLY);
    return hit ? hit.timeOfImpact : -1;
  }

  /** raycastStatic, also giving the surface's normal (facing back along the ray) and material (BB ricochets). */
  raycastSurface(origin: Vec3, dir: Vec3, maxDist: number, out: SurfaceHit): number {
    const r = this.ray;
    r.origin.x = origin.x;
    r.origin.y = origin.y;
    r.origin.z = origin.z;
    r.dir.x = dir.x;
    r.dir.y = dir.y;
    r.dir.z = dir.z;
    const hit = this.world.castRayAndGetNormal(r, maxDist, true, undefined, QUERY_STATIC_ONLY);
    if (!hit) return -1;
    // A closed mesh's faces point outwards; flip one met from behind so the normal always faces the ray.
    const facing = hit.normal.x * dir.x + hit.normal.y * dir.y + hit.normal.z * dir.z > 0 ? -1 : 1;
    out.normal.x = hit.normal.x * facing;
    out.normal.y = hit.normal.y * facing;
    out.normal.z = hit.normal.z * facing;
    out.material = this.materials.get(hit.collider.handle) ?? 'concrete';
    return hit.timeOfImpact;
  }

  dispose(): void {
    this.materials.clear();
    this.controller.free();
    this.world.free();
    this.characterColliders.clear();
  }
}
