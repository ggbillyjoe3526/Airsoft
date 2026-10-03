import { type CrouchMode, DEFAULT_CROUCH_MODE, MOUSE } from '../config/controls';
import { AIMING } from '../config/optics';
import type { MovementConfig } from '../config/movement';
import type { PlayerCommand } from '../sim/commands';
import { wrapAngle } from '../sim/vec';
import type { Keyboard } from './keyboard';
import type { PointerLock } from './pointerLock';

/**
 * Turns keyboard/mouse state into PlayerCommands. View angles update every render frame for
 * responsiveness; one-shot actions (jump, reload, switch, fire selector, a trigger click) are latched until
 * a simulation tick consumes them, so none is lost or duplicated when frames and ticks don't line up.
 * The crouch key either toggles crouching (sprint or jump stands you back up) or crouches while held. The right
 * mouse button aims down sights while held; the mouse turns at `aimSensitivity` times the normal rate once the sight is up.
 */
export class PlayerInput {
  yaw = 0;
  pitch = 0;
  sensitivity: number = MOUSE.defaultSensitivity;
  /** Mouse sensitivity while aiming down sights, as a multiple of `sensitivity`. */
  aimSensitivity: number = AIMING.defaultSensitivity;
  private crouchModeValue: CrouchMode = DEFAULT_CROUCH_MODE;
  /** Toggle mode: crouched until the key is pressed again (or a sprint or jump stands you up). */
  private crouchToggled = false;

  private jumpLatch = false;
  private reloadLatch = false;
  private fireLatch = false;
  private fireModeLatch = false;
  private switchLatch = -1;
  private readonly mouseDelta = { x: 0, y: 0 };

  constructor(
    private readonly keyboard: Keyboard,
    private readonly pointer: PointerLock,
    private readonly movement: MovementConfig,
  ) {}

  get crouchMode(): CrouchMode {
    return this.crouchModeValue;
  }

  /** Switching modes stands you up (a held key in hold mode keeps you down). */
  set crouchMode(mode: CrouchMode) {
    this.crouchModeValue = mode;
    this.crouchToggled = false;
  }

  /**
   * Call once per render frame, before any ticks run. `activeSlot`/`slotCount` let the
   * mouse wheel cycle replicas; `aimRaised` (how far the sight is raised to the eye, 0..1) blends in the aiming
   * sensitivity as the view zooms, so the turn rate never jumps.
   */
  update(activeSlot: number, slotCount: number, aimRaised = 0): void {
    this.pointer.consumeDelta(this.mouseDelta);
    const k = MOUSE.radiansPerCount * this.sensitivity * (1 + (this.aimSensitivity - 1) * aimRaised);
    const maxPitch = this.movement.maxPitch;
    this.yaw = wrapAngle(this.yaw - this.mouseDelta.x * k);
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - this.mouseDelta.y * k));

    const kb = this.keyboard;
    if (kb.wasPressed('jump')) this.jumpLatch = true;
    if (kb.wasPressed('reload')) this.reloadLatch = true;
    if (kb.wasPressed('fireMode')) this.fireModeLatch = true;
    if (this.crouchModeValue === 'toggle') {
      if (kb.wasPressed('crouch')) this.crouchToggled = !this.crouchToggled;
      // Sprinting or jumping stands you up; that press only stands you up (the jump comes on the next one).
      if (kb.wasPressed('sprint')) this.crouchToggled = false;
      if (kb.wasPressed('jump') && this.crouchToggled) {
        this.crouchToggled = false;
        this.jumpLatch = false;
      }
    }
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
    cmd.crouch = this.crouchModeValue === 'toggle' ? this.crouchToggled : kb.isDown('crouch');
    cmd.lean = (kb.isDown('leanRight') ? 1 : 0) - (kb.isDown('leanLeft') ? 1 : 0);
    cmd.jump = this.jumpLatch;
    cmd.reload = this.reloadLatch;
    cmd.aim = this.pointer.aimHeld;
    cmd.fire = this.pointer.fireHeld || this.fireLatch;
    cmd.switchTo = this.switchLatch;
    cmd.cycleFireMode = this.fireModeLatch;
    this.clearLatches();
  }

  /** Returns true once per trigger click since the last tick (used for menus-in-play such as spectating). */
  takeClick(): boolean {
    const clicked = this.fireLatch;
    this.fireLatch = false;
    return clicked;
  }

  /** Looks the way a new round starts: along `yaw`, level, and standing. */
  resetView(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.crouchToggled = false;
    this.clearLatches();
  }

  /** Drops pending one-shot actions (e.g. when the game pauses). */
  clearLatches(): void {
    this.jumpLatch = false;
    this.reloadLatch = false;
    this.fireLatch = false;
    this.fireModeLatch = false;
    this.switchLatch = -1;
  }
}
