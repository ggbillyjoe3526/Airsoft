import { MOUSE } from '../config/controls';
import type { MovementConfig } from '../config/movement';
import type { PlayerCommand } from '../sim/commands';
import type { Keyboard } from './keyboard';
import type { PointerLock } from './pointerLock';

/** Wraps an angle to (-PI, PI] so yaw never grows unbounded. */
function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}

/**
 * Turns keyboard/mouse state into PlayerCommands. View angles update every render frame for
 * responsiveness; the jump press is latched until a simulation tick consumes it, so it's never
 * lost or duplicated when frames and ticks don't line up.
 */
export class PlayerInput {
  yaw = 0;
  pitch = 0;
  sensitivity: number = MOUSE.defaultSensitivity;

  private jumpLatch = false;
  private readonly mouseDelta = { x: 0, y: 0 };

  constructor(
    private readonly keyboard: Keyboard,
    private readonly pointer: PointerLock,
    private readonly movement: MovementConfig,
  ) {}

  /** Call once per render frame, before any ticks run. */
  update(): void {
    this.pointer.consumeDelta(this.mouseDelta);
    const k = MOUSE.radiansPerCount * this.sensitivity;
    const maxPitch = this.movement.maxPitch;
    this.yaw = wrapAngle(this.yaw - this.mouseDelta.x * k);
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - this.mouseDelta.y * k));
    if (this.keyboard.wasPressed('jump')) this.jumpLatch = true;
  }

  /** Writes the command for the next tick and clears consumed one-shot actions. */
  fillCommand(cmd: PlayerCommand): void {
    const kb = this.keyboard;
    cmd.forward = (kb.isDown('forward') ? 1 : 0) - (kb.isDown('back') ? 1 : 0);
    cmd.right = (kb.isDown('right') ? 1 : 0) - (kb.isDown('left') ? 1 : 0);
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.sprint = kb.isDown('sprint');
    cmd.crouch = kb.isDown('crouch');
    cmd.jump = this.jumpLatch;
    this.jumpLatch = false;
  }

  /** Drops pending one-shot actions (e.g. when the game pauses). */
  clearLatches(): void {
    this.jumpLatch = false;
  }
}
