import type * as Rapier from '@dimforge/rapier3d-compat';
import type { BodyConfig } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { MapBlock, MapData } from '../map/mapTypes';
import { RAMP_FACES, rampCorners } from '../map/surfaces';
import { terrainMesh } from '../map/terrain';
import type { SurfaceHit } from '../sim/armament';
import type { Character } from '../sim/character';
import { buildLevelRay, castLevelRay, type LevelRay } from '../sim/levelRay';
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
export function blockCollider(b: MapBlock): Rapier.ColliderDesc {
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

/**
 * Rapier, once `initPhysics()` has loaded it. Imported on demand (audit CORE-10), so its 4 MB chunk is no part of the
 * page's first script: the game's own code runs first and the loading screen can show the chunk's download
 * (main.ts, ui/loadingProgress.ts).
 */
let RAPIER: typeof Rapier.default;
let rapierReady: Promise<void> | null = null;

/** Loads the Rapier module and its WASM once. */
export function initPhysics(): Promise<void> {
  rapierReady ??= import('@dimforge/rapier3d-compat').then(async (module) => {
    RAPIER = module.default;
    await RAPIER.init();
  });
  return rapierReady;
}

/**
 * Static level collision + a kinematic character controller. Crouching lowers the eyes and the hit
 * volume but not the movement capsule; Depot has no crawl spaces.
 */
export class PhysicsWorld implements CharacterMover {
  private readonly world: Rapier.World;
  private readonly controller: Rapier.KinematicCharacterController;
  private readonly characterColliders = new Map<number, Rapier.Collider>();
  private readonly capsuleHalfHeight: number;
  private readonly capsuleCenterOffset: number;
  private readonly scratch = { x: 0, y: 0, z: 0 };
  /** The controller's corrected movement, filled in place each move (audit SIM-04: no Vector3 per call). */
  private readonly moved = { x: 0, y: 0, z: 0 };
  private readonly groundProbe: Rapier.Ball;
  /**
   * The ground probe's hit, filled in place (Rapier's broad-phase cast takes a target; World.castShape doesn't), so a
   * probe no longer allocates a hit object and its four vectors per standing character per tick.
   */
  private readonly probeHit = new RAPIER.ColliderShapeCastHit(null as unknown as Rapier.Collider, 0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  /** Ray casts against the level (sim/levelRay.ts, audit SIM-01): no Rapier query, nothing allocated per cast. */
  private readonly level: LevelRay;

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
      this.world.createCollider(desc);
    }
    if (map.terrain) {
      // The ground (M33c): its triangles as one fixed mesh, the same triangles the level ray and the nav grid use.
      const { positions, indices } = terrainMesh(map.terrain);
      this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setCollisionGroups(STATIC_GROUPS));
    }
    this.level = buildLevelRay(map.blocks, PHYSICS.rayGridCell, map.terrain ?? null);

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
    const m = this.controller.computedMovement(this.moved);
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
    const w = this.world;
    // World.castShape with the hit written into probeHit (the same call World.castShape makes, plus its target).
    const hit = w.broadPhase.castShape(
      w.narrowPhase,
      w.bodies,
      w.colliders,
      s,
      IDENTITY_ROTATION,
      DOWN,
      this.groundProbe,
      PHYSICS.groundRestGap,
      lift + maxDrop,
      true,
      undefined,
      QUERY_STATIC_ONLY,
      undefined,
      undefined,
      undefined,
      this.probeHit,
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
   * within `maxDist`. Characters are ignored. Cast against the level's blocks directly (sim/levelRay.ts), with the
   * same answer as a Rapier ray against their colliders (levelRay.rapier.test.ts checks every Depot block).
   */
  raycastStatic(origin: Vec3, dir: Vec3, maxDist: number): number {
    return castLevelRay(this.level, origin, dir, maxDist);
  }

  /** raycastStatic, also giving the surface's normal (facing back along the ray) and material (BB ricochets). */
  raycastSurface(origin: Vec3, dir: Vec3, maxDist: number, out: SurfaceHit): number {
    return castLevelRay(this.level, origin, dir, maxDist, out);
  }

  dispose(): void {
    this.controller.free();
    this.world.free();
    this.characterColliders.clear();
  }
}
