import type { BB } from '../sim/ballistics';
import type { BBRenderer } from './bbRenderer';

interface OwnShot {
  bb: BB | null;
  serial: number;
  /** Where the BB really left from (its first segment's start): the muzzle offset is measured from it. */
  x: number;
  y: number;
  z: number;
  flightTime: number;
}

/**
 * Your own shots wait here from the tick that fired them until the frame's camera is placed (KI1): the held replica's
 * muzzle is read from the main camera, which during the ticks still stood where the last frame left it, so on a fast
 * turn the drawn BB started off to the side of the replica. `record` on the shot, `start` once per frame with the
 * muzzle seen from the camera that frame draws with. Entries are reused: nothing is allocated once the most shots a
 * frame has held have been seen. At most `capacity` wait (the BB pool's size: no more can be in the air), so ticks run
 * with no frame drawn can't grow it; a shot past that is drawn from its true path.
 */
export class OwnShotStarts {
  private readonly shots: OwnShot[] = [];
  private count = 0;

  constructor(private readonly capacity: number) {}

  /** How many shots are waiting for this frame's muzzle. */
  get pending(): number {
    return this.count;
  }

  /** `bb` was just fired (presentation sees it after its first tick); `flightTime` as for BBRenderer.startFromMuzzle. */
  record(bb: BB, flightTime: number): void {
    if (this.count >= this.capacity) return;
    if (this.count === this.shots.length) this.shots.push({ bb: null, serial: 0, x: 0, y: 0, z: 0, flightTime: 0 });
    const s = this.shots[this.count++]!;
    s.bb = bb;
    s.serial = bb.serial;
    s.x = bb.prevPosition.x;
    s.y = bb.prevPosition.y;
    s.z = bb.prevPosition.z;
    s.flightTime = flightTime;
  }

  /**
   * Starts every waiting BB from `muzzle` (world space, this frame's), or none when `muzzle` is null (no replica shown),
   * and empties the list. A BB already gone (it hit something in a later tick of the frame) or its pool slot reused is
   * skipped.
   */
  start(bbs: Pick<BBRenderer, 'startFromMuzzle'>, muzzle: { x: number; y: number; z: number } | null): void {
    for (let i = 0; i < this.count; i++) {
      const s = this.shots[i]!;
      const bb = s.bb!;
      s.bb = null;
      if (muzzle && bb.active && bb.serial === s.serial) bbs.startFromMuzzle(bb, muzzle, s.flightTime, s);
    }
    this.count = 0;
  }

  /** Forgets every waiting shot (a new round, or the session closing). */
  clear(): void {
    for (let i = 0; i < this.count; i++) this.shots[i]!.bb = null;
    this.count = 0;
  }
}
