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
  private placed = false;

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
    const hit = this.query.raycastStatic(h, d, len);
    const reach = hit >= 0 ? Math.max(0, hit - SPECTATOR.wallPadding) : len;
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
}
