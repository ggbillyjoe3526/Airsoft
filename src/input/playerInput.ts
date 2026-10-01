import { MOUSE } from '../config/controls';
import type { MovementConfig } from '../config/movement';
import type { PlayerCommand } from '../sim/commands';
import { wrapAngle } from '../sim/vec';
import type { Keyboard } from './keyboard';
import type { PointerLock } from './pointerLock';

/**
 * Turns keyboard/mouse state into PlayerCommands. View angles update every render frame for
 * responsiveness; one-shot actions (jump, reload, switch, a trigger click) are latched until a
 * simulation tick consumes them, so none is lost or duplicated when frames and ticks don't line up.
 */
export class PlayerInput {
  yaw = 0;
  pitch = 0;
  sensitivity: number = MOUSE.defaultSensitivity;

  private jumpLatch = false;
  private reloadLatch = false;
  private fireLatch = false;
  private switchLatch = -1;
  private readonly mouseDelta = { x: 0, y: 0 };

  constructor(
    private readonly keyboard: Keyboard,
    private readonly pointer: PointerLock,
    private readonly movement: MovementConfig,
  ) {}

  /**
   * Call once per render frame, before any ticks run. `activeSlot`/`slotCount` let the
   * mouse wheel cycle replicas.
   */
  update(activeSlot: number, slotCount: number): void {
    this.pointer.consumeDelta(this.mouseDelta);
    const k = MOUSE.radiansPerCount * this.sensitivity;
    const maxPitch = this.movement.maxPitch;
    this.yaw = wrapAngle(this.yaw - this.mouseDelta.x * k);
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - this.mouseDelta.y * k));

    const kb = this.keyboard;
    if (kb.wasPressed('jump')) this.jumpLatch = true;
    if (kb.wasPressed('reload')) this.reloadLatch = true;
    if (this.pointer.consumeFirePress()) this.fireLatch = true;
    if (kb.wasPressed('slot1')) this.switchLatch = 0;
    if (kb.wasPressed('slot2')) this.switchLatch = 1;
    const cycle = this.pointer.consumeWheelSteps();
    if (cycle !== 0 && slotCount > 1) {
      const from = this.switchLatch >= 0 ? this.switchLatch : activeSlot;
      this.switchLatch = (((from + cycle) % slotCount) + slotCount) % slotCount;
    }
  }

  /** Writes the command for the next tick and clears consumed one-shot actions. */
  fillCommand(cmd: PlayerCommand): void {
    const kb = this.keyboard;
    cmd.forward = (kb.isDown('forward') ? 1 : 0) - (kb.isDown('back') ? 1 : 0);
    cmd.right = (kb.isDown('right') ? 1 : 0) - (kb.isDown('left') ? 1 : 0);
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.walk = kb.isDown('walk');
    cmd.sprint = kb.isDown('sprint');
    cmd.crouch = kb.isDown('crouch');
    cmd.jump = this.jumpLatch;
    cmd.reload = this.reloadLatch;
    cmd.fire = this.pointer.fireHeld || this.fireLatch;
    cmd.switchTo = this.switchLatch;
    this.clearLatches();
  }

  /** Returns true once per trigger click since the last tick (used for menus-in-play such as spectating). */
  takeClick(): boolean {
    const clicked = this.fireLatch;
    this.fireLatch = false;
    return clicked;
  }

  /** Looks the way a new round starts: along `yaw`, level. */
  resetView(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.clearLatches();
  }

  /** Drops pending one-shot actions (e.g. when the game pauses). */
  clearLatches(): void {
    this.jumpLatch = false;
    this.reloadLatch = false;
    this.fireLatch = false;
    this.switchLatch = -1;
  }
}
