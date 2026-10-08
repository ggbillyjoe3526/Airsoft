import type { HitConfig } from '../config/hits';
import type { SpawnPoint } from '../map/mapTypes';
import { buildDistanceField, descendField, type NavGrid, nearestWalkable, pullRoute } from '../nav/navGrid';
import type { Character } from './character';
import type { PlayerCommand } from './commands';
import { copy } from './vec';

/**
 * Hit calling, enforced by the game: a hit character stops, raises a hand and calls the hit, then walks
 * off to the dead zone at its end of the map along a navigation route. From the moment of the hit it can't shoot and
 * BBs pass through it. A walk-off that gets stuck or takes too long ends with the character leaving
 * the field (fading out where it stands) and reappearing in the dead zone.
 */

/** What eliminating someone needs from the map. */
export interface EliminationContext {
  /** Per end of the map, its dead-zone spots (map data); a character uses its own end's (Character.end). */
  deadZones: readonly (readonly SpawnPoint[])[];
  nav: NavGrid;
  /**
   * Per end, the walking distance from every nav node to its dead zone (buildDistanceField, audit SIM-01): a walk-off
   * route walks down it, so a hit never runs a route search.
   */
  deadZoneFields: readonly Float32Array[];
  /** Route ends snap to the nearest walkable cell within this distance. */
  snap: number;
  /** Reused node list of the route being planned. */
  nodes: number[];
}

/**
 * The context eliminations need, with each end's dead-zone distance field built now (when a match is set up), unless
 * `fields` already holds them for these spots on this grid.
 */
export function createEliminationContext(
  deadZones: readonly (readonly SpawnPoint[])[],
  nav: NavGrid,
  snap: number,
  fields: readonly Float32Array[] = deadZoneFields(deadZones, nav, snap),
): EliminationContext {
  return { deadZones, nav, deadZoneFields: fields, snap, nodes: [] };
}

/** Per end, the walking distance from every node of `nav` to that end's dead-zone spots (buildDistanceField). */
export function deadZoneFields(deadZones: readonly (readonly SpawnPoint[])[], nav: NavGrid, snap: number): Float32Array[] {
  return deadZones.map((spots) => buildDistanceField(nav, spots.map((p) => p.position), snap));
}

/** Only characters still in play can be hit or shoot. */
export function isInPlay(c: Character): boolean {
  return c.status === 'alive';
}

/**
 * Out of play and standing in the dead zone since before this tick (audit SIM-15): nothing moves it until the next
 * round, so the simulation skips its movement, lean and accuracy steps (two Rapier calls a tick each). The tick it
 * arrives (statusTime still 0) runs as usual, so a character placed on its spot after leaving the field settles there.
 */
export function isParked(c: Character): boolean {
  return c.status === 'out' && c.grounded && c.statusTime > 0;
}

/**
 * Eliminates `victim` (no-op if already out of play) and picks its dead-zone spot (the next free one for
 * its team, in the order teammates were hit). The route there is planned by `planWalkOffRoutes` over the
 * following ticks, never inside the hit (M27).
 */
export function eliminate(victim: Character, shooterId: number, characters: readonly Character[], ctx: EliminationContext): void {
  if (!isInPlay(victim)) return;
  let alreadyOut = 0;
  for (const c of characters) if (c !== victim && c.team === victim.team && !isInPlay(c)) alreadyOut++;
  victim.status = 'calling';
  victim.statusTime = 0;
  victim.hitBy = shooterId;
  victim.walkOffStuck = 0;
  victim.sprinting = false;
  victim.torchOn = false; // a hit player's torch goes off as their hand goes up (M33h)
  const spots = ctx.deadZones[victim.end];
  const spot = spots && spots.length > 0 ? spots[alreadyOut % spots.length]! : undefined;
  copy(victim.deadZoneTarget, spot ? spot.position : victim.spawnPosition);
  victim.deadZoneYaw = spot ? spot.yaw : victim.spawnYaw;
  // The old route stays in place until the search overwrites it (findPath reuses its waypoint objects); nothing reads
  // it while the victim is still calling.
  victim.walkOffLeg = 0;
  victim.walkOffRoutePending = true;
}

/**
 * Plans the walk-off route of at most one victim per tick (the first still waiting, in character order): a walk down
 * its end's distance field, smoothed into straight legs, ending on its spot. A victim stands calling for `callTime`
 * before it walks, which covers the wait many times over. With no route (the spot is off the grid, or out of reach)
 * it heads straight for the spot, as before. Returns whether a route was planned.
 */
export function planWalkOffRoutes(characters: readonly Character[], ctx: EliminationContext): boolean {
  for (const c of characters) {
    if (!c.walkOffRoutePending) continue;
    c.walkOffRoutePending = false;
    c.walkOffLeg = 0;
    const field = ctx.deadZoneFields[c.end];
    const nodes = ctx.nodes;
    const p = c.position;
    const t = c.deadZoneTarget;
    if (field && descendField(ctx.nav, field, nearestWalkable(ctx.nav, p.x, p.y, p.z, ctx.snap), t.x, t.z, nodes)) {
      // The field leads to the nearest of the end's spots; this victim's own is the route's last node.
      const own = nearestWalkable(ctx.nav, t.x, t.y, t.z, ctx.snap);
      if (own >= 0 && own !== nodes[nodes.length - 1]) nodes.push(own);
      pullRoute(ctx.nav, nodes, p, t, c.walkOffRoute, 0);
    } else {
      c.walkOffRoute.length = 0;
      c.walkOffRoute.push({ x: t.x, y: t.y, z: t.z });
    }
    return true;
  }
  return false;
}

/**
 * The command an eliminated character follows instead of its controller's: stand still while calling,
 * walk the route to the dead zone, then stand there. Never fires, reloads or switches.
 */
export function fillEliminatedCommand(c: Character, cfg: HitConfig, out: PlayerCommand): PlayerCommand {
  out.right = 0;
  out.pitch = 0;
  out.sprint = false;
  out.walk = false;
  out.crouch = false;
  out.jump = false;
  out.fire = false;
  out.reload = false;
  out.switchTo = -1;
  // Every field, so a reused command (a test, a replay) never leaves a hit character leaning, aiming or cycling its
  // selector (audit SIM-11).
  out.lean = 0;
  out.aim = false;
  out.cycleFireMode = false;
  out.toggleTorch = false;
  out.yaw = c.yaw;
  out.forward = 0;
  if (c.status !== 'walkingOff') return out;
  // Advance past waypoints already reached (the last one is the dead-zone spot's cell).
  const route = c.walkOffRoute;
  while (c.walkOffLeg < route.length - 1) {
    const w = route[c.walkOffLeg]!;
    if (Math.hypot(w.x - c.position.x, w.z - c.position.z) > cfg.waypointReach) break;
    c.walkOffLeg++;
  }
  const w = route[c.walkOffLeg] ?? c.deadZoneTarget;
  const dx = w.x - c.position.x;
  const dz = w.z - c.position.z;
  if (Math.hypot(dx, dz) > cfg.deadZoneArrive || c.walkOffLeg < route.length - 1) {
    out.yaw = Math.atan2(-dx, -dz); // yaw 0 faces -Z, positive yaw turns left
    out.forward = cfg.walkOffSpeed;
  }
  return out;
}

/** Advances an eliminated character's hit call / walk-off / leaving by one tick. */
export function stepElimination(c: Character, cfg: HitConfig, dt: number): void {
  if (isInPlay(c)) return;
  c.statusTime += dt;
  if (c.status === 'calling') {
    if (c.statusTime >= cfg.callTime) setStatus(c, 'walkingOff');
  } else if (c.status === 'walkingOff') {
    const route = c.walkOffRoute;
    const last = route[route.length - 1] ?? c.deadZoneTarget;
    const arrived = c.walkOffLeg >= route.length - 1 && Math.hypot(last.x - c.position.x, last.z - c.position.z) <= cfg.deadZoneArrive;
    c.walkOffStuck = Math.hypot(c.velocity.x, c.velocity.z) < cfg.stuckSpeed ? c.walkOffStuck + dt : 0;
    if (arrived) {
      // Onto the spot itself (at most deadZoneArrive away), so teammates on neighbouring spots never overlap.
      // Only x and z move, and prevPosition stays, so the drawn figure slides that last bit instead of jumping.
      c.position.x = last.x;
      c.position.z = last.z;
      goOut(c, false);
    }
    else if (c.walkOffStuck >= cfg.stuckTime || c.statusTime >= cfg.walkOffTime) setStatus(c, 'leaving');
  } else if (c.status === 'leaving' && c.statusTime >= cfg.vanishTime) {
    goOut(c, true);
  }
}

function setStatus(c: Character, status: Character['status']): void {
  c.status = status;
  c.statusTime = 0;
}

/** Into the dead zone (placed on the spot if it left the field elsewhere), facing the way the spot faces. */
function goOut(c: Character, place: boolean): void {
  setStatus(c, 'out');
  if (place) {
    copy(c.position, c.deadZoneTarget);
    copy(c.prevPosition, c.deadZoneTarget);
  }
  c.velocity.x = 0;
  c.velocity.z = 0;
  c.yaw = c.deadZoneYaw;
}
