import type * as THREE from 'three';
import type { BodyConfig } from '../config/movement';
import { SPECTATOR } from '../config/render';
import type { WorldQuery } from '../sim/armament';
import { type Character, eyeHeight } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { lerpAngle } from '../sim/vec';

/** Worth watching: still in play, or calling a hit that just happened (so you see them call it). */
function watchable(c: Character): boolean {
  return isInPlay(c) || c.status === 'calling';
}

/**
 * Over-the-shoulder camera for watching someone still in play after you've been hit. Prefers your
 * teammates; clicking cycles through everyone still in play. If nobody is left it watches your own
 * figure. Pulled in front of walls so it never looks through the level.
 */
export class SpectatorCamera {
  private targetId = -1;
  private readonly head = { x: 0, y: 0, z: 0 };
  private readonly dir = { x: 0, y: 0, z: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly castFrom = { x: 0, y: 0, z: 0 };
  private readonly castDir = { x: 0, y: 0, z: 0 };
  private placed = false;
  /**
   * The wall check behind the target, kept until the target moves (audit REN-12): a ray cast allocates a hit object,
   * and the camera only changes once a tick at most. `castFor` is what the last cast was made from.
   */
  private reach = 0;
  private readonly castFor = { id: -1, x: Number.NaN, y: Number.NaN, z: Number.NaN, yaw: Number.NaN, crouch: Number.NaN };

  constructor(
    private readonly characters: readonly Character[],
    /** You: watched when nobody else is left. */
    private readonly self: Character,
    private readonly body: BodyConfig,
    private readonly query: WorldQuery,
  ) {}

  /** Who is being watched, or undefined if that player is no longer worth watching. */
  private target(): Character | undefined {
    if (this.targetId === this.self.id) return this.self;
    for (const c of this.characters) if (c.id === this.targetId && watchable(c)) return c;
    return undefined;
  }

  /** Makes sure someone is being watched: a teammate in play, else anyone in play, else yourself. */
  ensureTarget(): Character {
    const current = this.target();
    if (current && (current !== this.self || !this.characters.some(isInPlay))) return current;
    let pick: Character | undefined;
    for (const c of this.characters) if (isInPlay(c) && c.team === this.self.team) pick ??= c;
    for (const c of this.characters) if (isInPlay(c)) pick ??= c;
    pick ??= this.self;
    this.targetId = pick.id;
    this.placed = false;
    return pick;
  }

  /** Switches to the next character in play. */
  next(): void {
    const inPlay = this.characters.filter(isInPlay);
    if (inPlay.length === 0) return;
    const i = inPlay.findIndex((c) => c.id === this.targetId);
    this.targetId = inPlay[(i + 1) % inPlay.length]!.id;
    this.placed = false;
  }

  /** Stops spectating (next time starts fresh). */
  reset(): void {
    this.targetId = -1;
    this.placed = false;
  }

  /** Places `camera` behind `c` (from ensureTarget). `alpha` interpolates ticks. */
  place(camera: THREE.PerspectiveCamera, c: Character, alpha: number, dt: number): void {
    const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
    const h = this.head;
    h.x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
    h.y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha + eyeHeight(crouch, this.body);
    h.z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;

    // Behind the target (it faces (-sin yaw, 0, -cos yaw)) and a little above, pulled in front of walls.
    const yaw = lerpAngle(c.prevYaw, c.yaw, alpha);
    const backX = Math.sin(yaw);
    const backZ = Math.cos(yaw);
    const d = this.dir;
    const len = Math.hypot(SPECTATOR.distance, SPECTATOR.height);
    d.x = (backX * SPECTATOR.distance) / len;
    d.y = SPECTATOR.height / len;
    d.z = (backZ * SPECTATOR.distance) / len;
    const reach = this.wallReach(c, len);
    const p = this.pos;
    const tx = h.x + d.x * reach;
    const ty = h.y + d.y * reach;
    const tz = h.z + d.z * reach;
    const k = this.placed ? 1 - Math.exp(-SPECTATOR.followRate * dt) : 1;
    p.x += (tx - p.x) * k;
    p.y += (ty - p.y) * k;
    p.z += (tz - p.z) * k;
    this.placed = true;

    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(h.x - backX * SPECTATOR.lookAhead, h.y, h.z - backZ * SPECTATOR.lookAhead);
  }

  /**
   * How far back the camera can sit before a wall (the same direction as `place`'s, from the target's latest tick pose),
   * cast only when that pose changes: a tick that moved or turned the target, or another target. The camera eases
   * towards the result anyway (followRate), so the tick pose stands in for the interpolated one between ticks.
   */
  private wallReach(c: Character, len: number): number {
    const k = this.castFor;
    if (k.id === c.id && k.x === c.position.x && k.y === c.position.y && k.z === c.position.z && k.yaw === c.yaw && k.crouch === c.crouchAmount) return this.reach;
    k.id = c.id;
    k.x = c.position.x;
    k.y = c.position.y;
    k.z = c.position.z;
    k.yaw = c.yaw;
    k.crouch = c.crouchAmount;
    const from = this.castFrom;
    from.x = c.position.x;
    from.y = c.position.y + eyeHeight(c.crouchAmount, this.body);
    from.z = c.position.z;
    const d = this.castDir;
    d.x = (Math.sin(c.yaw) * SPECTATOR.distance) / len;
    d.y = SPECTATOR.height / len;
    d.z = (Math.cos(c.yaw) * SPECTATOR.distance) / len;
    const hit = this.query.raycastStatic(from, d, len);
    this.reach = hit >= 0 ? Math.max(0, hit - SPECTATOR.wallPadding) : len;
    return this.reach;
  }
}
