import { type Action, type CrouchMode, DEFAULT_AIM_MODE, DEFAULT_CROUCH_MODE, DEFAULT_SPRINT_MODE, type HoldMode, MOUSE } from '../config/controls';
import { AIMING } from '../config/optics';
import type { MovementConfig } from '../config/movement';
import type { PlayerCommand } from '../sim/commands';
import { wrapAngle } from '../sim/vec';
import type { Keyboard } from './keyboard';
import type { PointerLock } from './pointerLock';

/** A press of any of these stops a toggled sprint. */
const SPRINT_STOPPERS: readonly Action[] = ['crouch', 'aim', 'walk', 'fire'];

/**
 * Turns keyboard/mouse state into PlayerCommands. View angles update every render frame for
 * responsiveness; one-shot actions (jump, reload, switch, fire selector, a trigger click) are latched until
 * a simulation tick consumes them, so none is lost or duplicated when frames and ticks don't line up.
 * Fire and aim are actions like any other, on whatever key or mouse button they're bound to (M18).
 * Crouch, aim and sprint each work while held or as a toggle (M18; crouch toggles by default):
 * - a toggled crouch stands up on a sprint or jump press;
 * - a toggled aim drops on a sprint press, a replica switch, or when the replica in hand has no sight;
 * - a toggled sprint stops when forward is let go, or on a crouch, aim, walk or fire press.
 * The mouse turns at `aimSensitivity` times the normal rate once the sight is up; `invertY` swaps up and down.
 */
export class PlayerInput {
  yaw = 0;
  pitch = 0;
  sensitivity: number = MOUSE.defaultSensitivity;
  /** Mouse sensitivity while aiming down sights, as a multiple of `sensitivity`. */
  aimSensitivity: number = AIMING.defaultSensitivity;
  /** Invert mouse (Settings → Controls): moving the mouse forward looks down. */
  invertY = false;
  private crouchModeValue: CrouchMode = DEFAULT_CROUCH_MODE;
  private aimModeValue: HoldMode = DEFAULT_AIM_MODE;
  private sprintModeValue: HoldMode = DEFAULT_SPRINT_MODE;
  /** Toggle mode: crouched until the key is pressed again (or a sprint or jump stands you up). */
  private crouchToggled = false;
  /** Toggle modes: aiming / sprinting until pressed again (or something else ends it; see the class comment). */
  private aimToggled = false;
  private sprintToggled = false;

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

  /** The readable name of the key the player has bound to `action` ('' if unbound), for hints on screen. */
  keyName(action: Action): string {
    return this.keyboard.keyName(action);
  }

  get crouchMode(): CrouchMode {
    return this.crouchModeValue;
  }

  /** Switching modes stands you up (a held key in hold mode keeps you down). */
  set crouchMode(mode: CrouchMode) {
    this.crouchModeValue = mode;
    this.crouchToggled = false;
  }

  get aimMode(): HoldMode {
    return this.aimModeValue;
  }

  /** Switching modes lowers the sight (a held button in hold mode keeps it up). */
  set aimMode(mode: HoldMode) {
    this.aimModeValue = mode;
    this.aimToggled = false;
  }

  get sprintMode(): HoldMode {
    return this.sprintModeValue;
  }

  /** Switching modes stops a toggled sprint. */
  set sprintMode(mode: HoldMode) {
    this.sprintModeValue = mode;
    this.sprintToggled = false;
  }

  /**
   * Call once per render frame, before any ticks run. `activeSlot`/`slotCount` let the
   * mouse wheel cycle replicas; `aimRaised` (how far the sight is raised to the eye, 0..1) blends in the aiming
   * sensitivity as the view zooms, so the turn rate never jumps; `aimScale` scales it for the optic in use (a 2× scope
   * turns slower than the red dot the setting is for). `canAim`: the replica in hand has a sight
   * (sim/aiming.ts canAimDownSights), so a toggled aim doesn't wait, unseen, for a replica that has one.
   */
  update(activeSlot: number, slotCount: number, aimRaised = 0, aimScale = 1, canAim = true): void {
    this.pointer.consumeDelta(this.mouseDelta);
    const k = MOUSE.radiansPerCount * this.sensitivity * (1 + (this.aimSensitivity * aimScale - 1) * aimRaised);
    const maxPitch = this.movement.maxPitch;
    this.yaw = wrapAngle(this.yaw - this.mouseDelta.x * k);
    const up = this.invertY ? 1 : -1;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + up * this.mouseDelta.y * k));

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
    if (kb.wasPressed('fire')) this.fireLatch = true;
    const switchBefore = this.switchLatch;
    if (kb.wasPressed('slot1')) this.switchLatch = 0;
    if (kb.wasPressed('slot2')) this.switchLatch = 1;
    const cycle = this.pointer.consumeWheelSteps();
    if (cycle !== 0 && slotCount > 1) {
      const from = this.switchLatch >= 0 ? this.switchLatch : activeSlot;
      this.switchLatch = (((from + cycle) % slotCount) + slotCount) % slotCount;
    }
    const switching = this.switchLatch !== switchBefore && this.switchLatch !== activeSlot;
    if (this.aimModeValue === 'toggle') {
      if (kb.wasPressed('aim')) this.aimToggled = !this.aimToggled;
      if (kb.wasPressed('sprint') || switching || !canAim) this.aimToggled = false;
    }
    if (this.sprintModeValue === 'toggle') {
      if (kb.wasPressed('sprint')) this.sprintToggled = !this.sprintToggled;
      if (!kb.isDown('forward')) this.sprintToggled = false;
      for (const a of SPRINT_STOPPERS) if (kb.wasPressed(a)) this.sprintToggled = false;
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
    cmd.sprint = this.sprintModeValue === 'toggle' ? this.sprintToggled : kb.isDown('sprint');
    cmd.crouch = this.crouchModeValue === 'toggle' ? this.crouchToggled : kb.isDown('crouch');
    cmd.lean = (kb.isDown('leanRight') ? 1 : 0) - (kb.isDown('leanLeft') ? 1 : 0);
    cmd.jump = this.jumpLatch;
    cmd.reload = this.reloadLatch;
    cmd.aim = this.aimModeValue === 'toggle' ? this.aimToggled : kb.isDown('aim');
    cmd.fire = kb.isDown('fire') || this.fireLatch;
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

  /** Looks the way a new round starts: along `yaw`, level, standing, sight down and not sprinting. */
  resetView(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.crouchToggled = false;
    this.aimToggled = false;
    this.sprintToggled = false;
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
