import { AUDIO } from '../config/audio';

/**
 * An AEG's motor for sound: whether a shot starts a fresh trigger pull (the motor winds up from rest) and when
 * its wind-down should play if no further shot follows. Times in seconds of the simulation's clock (audio/sfx.ts).
 */
export class MotorSound {
  private lastShot = Number.NEGATIVE_INFINITY;

  /** Records a shot at `now` from a replica firing `fireRate` shots a second; true if the motor was at rest. */
  shot(now: number, fireRate: number): boolean {
    const cycle = 1 / fireRate;
    const fromRest = now - this.lastShot > cycle * AUDIO.motor.spinUpAfterCycles;
    this.lastShot = now;
    return fromRest;
  }

  /** When the wind-down after the latest shot plays, unless another shot comes first. */
  spinDownAt(fireRate: number): number {
    return this.lastShot + AUDIO.motor.spinDownAfterCycles / fireRate;
  }
}
