import { type Action, type CrouchMode, DEFAULT_AIM_MODE, DEFAULT_CROUCH_MODE, DEFAULT_SPRINT_MODE, type HoldMode, MOUSE } from '../config/controls';
import { AIMING } from '../config/optics';
import type { MovementConfig } from '../config/movement';
import { SIM_DT } from '../config/sim';
import { DEFAULT_WHEEL_SELECT, ORDER_WHEEL, type SquadCommand, type WheelSelect } from '../config/squad';
import type { PlayerCommand } from '../sim/commands';
import { fillScriptedCommand, type ScriptStep } from './scriptedInput';
import { wrapAngle } from '../sim/vec';
import type { Keyboard } from './keyboard';
import { WheelPointer } from './orderWheel';
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
 *
 * The order wheel (M23, while `ordersEnabled`): holding its key opens it, and from then until it closes the mouse moves
 * the wheel's pointer, never the view; the wheel takes the mouse wheel too, and the trigger, so a click can never fire
 * (a held trigger needs a new pull once the wheel is gone). The keyboard still moves you. See `wheelSelect`.
 */
export class PlayerInput {
  yaw = 0;
  pitch = 0;
  sensitivity: number = MOUSE.defaultSensitivity;
  /** Mouse sensitivity while aiming down sights, as a multiple of `sensitivity`. */
  aimSensitivity: number = AIMING.defaultSensitivity;
  /** Invert mouse (Settings → Controls): moving the mouse forward looks down. */
  invertY = false;
  /**
   * The order wheel can open: true in a match, false on the range (no teammates to order). Turning it off closes it.
   */
  ordersEnabled = false;
  /** How the wheel gives an order (Settings → Controls): let go of its key while pointing at it, or click it. */
  wheelSelect: WheelSelect = DEFAULT_WHEEL_SELECT;
  private readonly wheel = new WheelPointer();
  /** The trigger is the wheel's: no shot until it is let go of after the wheel closes. */
  private fireBlocked = false;
  /** Aim pressed while the wheel was open: no raising the sight until it is let go of after the wheel closes. */
  private aimBlocked = false;
  /** The order last handed over by takeOrder came from the wheel (M23), not an order key. */
  orderFromWheel = false;
  private latchFromWheel = false;
  private crouchModeValue: CrouchMode = DEFAULT_CROUCH_MODE;
  private aimModeValue: HoldMode = DEFAULT_AIM_MODE;
  private sprintModeValue: HoldMode = DEFAULT_SPRINT_MODE;
  /** Toggle mode: crouched until the key is pressed again (or a sprint or jump stands you up). */
  private crouchToggled = false;
  /** Toggle modes: aiming / sprinting until pressed again (or something else ends it; see the class comment). */
  private aimToggled = false;
  private sprintToggled = false;
  /** A toggled sprint has had forward held: letting go of forward now ends it (before that it waits for forward). */
  private sprintRunning = false;

  private jumpLatch = false;
  private reloadLatch = false;
  private fireLatch = false;
  private fireModeLatch = false;
  /** A squad order key pressed (M22), or an order picked on the wheel (M23), since the last takeOrder. */
  private orderLatch: SquadCommand | null = null;
  private switchLatch = -1;
  private readonly mouseDelta = { x: 0, y: 0 };

  /**
   * A scripted player (input/scriptedInput.ts) for the perf harness: while set, `fillCommand` takes the command from
   * the script by tick instead of the keyboard and mouse. The dev server and the e2e build only (`?script=perf`).
   */
  script: readonly ScriptStep[] | null = null;
  private scriptTick = 0;

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
    this.updateWheel();
    const k = MOUSE.radiansPerCount * this.sensitivity * (1 + (this.aimSensitivity * aimScale - 1) * aimRaised);
    const maxPitch = this.movement.maxPitch;
    // A scripted run (`?script=`) looks where its script says; the mouse would make it unrepeatable (bug pass).
    if (this.script) this.mouseDelta.x = this.mouseDelta.y = 0;
    this.yaw = wrapAngle(this.yaw - this.mouseDelta.x * k);
    const up = this.invertY ? 1 : -1;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + up * this.mouseDelta.y * k));

    const kb = this.keyboard;
    if (kb.wasPressed('jump')) this.jumpLatch = true;
    if (kb.wasPressed('reload')) this.reloadLatch = true;
    if (kb.wasPressed('fireMode')) this.fireModeLatch = true;
    if (kb.wasPressed('orderFollow')) this.latchOrder('follow', false);
    if (kb.wasPressed('orderHold')) this.latchOrder('hold', false);
    if (kb.wasPressed('orderRegroup')) this.latchOrder('regroup', false);
    if (this.crouchModeValue === 'toggle') {
      if (kb.wasPressed('crouch')) this.crouchToggled = !this.crouchToggled;
      // Sprinting or jumping stands you up; that press only stands you up (the jump comes on the next one).
      if (kb.wasPressed('sprint')) this.crouchToggled = false;
      if (kb.wasPressed('jump') && this.crouchToggled) {
        this.crouchToggled = false;
        this.jumpLatch = false;
      }
    }
    if (kb.wasPressed('fire') && !this.fireBlocked) this.fireLatch = true;
    const switchBefore = this.switchLatch;
    if (kb.wasPressed('slot1')) this.switchLatch = 0;
    if (kb.wasPressed('slot2')) this.switchLatch = 1;
    const cycle = this.pointer.consumeWheelSteps();
    if (cycle !== 0 && slotCount > 1 && !this.wheel.open) {
      const from = this.switchLatch >= 0 ? this.switchLatch : activeSlot;
      this.switchLatch = (((from + cycle) % slotCount) + slotCount) % slotCount;
    }
    const switching = this.switchLatch !== switchBefore && this.switchLatch !== activeSlot;
    if (this.aimModeValue === 'toggle') {
      if (kb.wasPressed('aim') && !this.aimBlocked) this.aimToggled = !this.aimToggled;
      if (kb.wasPressed('sprint') || switching || !canAim) this.aimToggled = false;
    }
    if (this.sprintModeValue === 'toggle') {
      if (kb.wasPressed('sprint')) {
        this.sprintToggled = !this.sprintToggled;
        this.sprintRunning = false;
      }
      // Pressed before forward, it waits for forward (M18a review); once you've run, letting go of forward ends it.
      if (this.sprintToggled && kb.isDown('forward')) this.sprintRunning = true;
      else if (this.sprintRunning) this.sprintToggled = false;
      for (const a of SPRINT_STOPPERS) if (kb.wasPressed(a) && !(a === 'fire' && this.fireBlocked) && !(a === 'aim' && this.aimBlocked)) this.sprintToggled = false;
    }
    if (this.fireBlocked && !this.wheel.open && !kb.isDown('fire')) this.fireBlocked = false;
    if (this.aimBlocked && !this.wheel.open && !kb.isDown('aim')) this.aimBlocked = false;
  }

  /** The order wheel is open (M23). */
  get wheelOpen(): boolean {
    return this.wheel.open;
  }

  /** The wheel's pointer (px from its middle) and the order it is on (an index into ORDER_WHEEL.items, or -1). */
  get wheelPointer(): { readonly x: number; readonly y: number; readonly pick: number } {
    return this.wheel;
  }

  /**
   * The order wheel, before the mouse turns the view: opens on its key, and while open takes this frame's mouse
   * movement for its pointer. A click on an order gives it (either way of picking); letting go of the key closes the
   * wheel, giving the order pointed at when picking by hover.
   */
  private updateWheel(): void {
    const kb = this.keyboard;
    const w = this.wheel;
    if (!this.ordersEnabled) {
      if (w.open) w.close();
      return;
    }
    if (!w.open && kb.wasPressed('orderWheel')) {
      w.start();
      this.fireBlocked = true;
      this.fireLatch = false;
    }
    if (!w.open) return;
    if (kb.wasPressed('aim')) this.aimBlocked = true;
    const gain = ORDER_WHEEL.pointerGain * this.sensitivity;
    w.move(this.mouseDelta.x * gain, this.mouseDelta.y * gain);
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    const pick = w.pick;
    if (pick >= 0 && kb.wasPressed('fire')) {
      this.latchOrder(ORDER_WHEEL.items[pick]!.command, true);
      w.close();
    } else if (!kb.isDown('orderWheel')) {
      if (pick >= 0 && this.wheelSelect === 'hover') this.latchOrder(ORDER_WHEEL.items[pick]!.command, true);
      w.close();
    }
  }

  private latchOrder(command: SquadCommand, fromWheel: boolean): void {
    this.orderLatch = command;
    this.latchFromWheel = fromWheel;
  }

  /** Writes the command for the next tick and clears consumed one-shot actions. */
  fillCommand(cmd: PlayerCommand): void {
    if (this.script) {
      this.yaw = wrapAngle(fillScriptedCommand(this.script, this.scriptTick++, this.yaw, SIM_DT, cmd));
      this.pitch = cmd.pitch;
      this.clearOneShots();
      return;
    }
    const kb = this.keyboard;
    cmd.forward = (kb.isDown('forward') ? 1 : 0) - (kb.isDown('back') ? 1 : 0);
    cmd.right = (kb.isDown('right') ? 1 : 0) - (kb.isDown('left') ? 1 : 0);
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.walk = kb.isDown('walk');
    cmd.sprint = this.sprintModeValue === 'toggle' ? this.sprintToggled && kb.isDown('forward') : kb.isDown('sprint');
    cmd.crouch = this.crouchModeValue === 'toggle' ? this.crouchToggled : kb.isDown('crouch');
    cmd.lean = (kb.isDown('leanRight') ? 1 : 0) - (kb.isDown('leanLeft') ? 1 : 0);
    cmd.jump = this.jumpLatch;
    cmd.reload = this.reloadLatch;
    cmd.aim = this.aimModeValue === 'toggle' ? this.aimToggled : kb.isDown('aim') && !this.aimBlocked;
    cmd.fire = !this.fireBlocked && (kb.isDown('fire') || this.fireLatch);
    cmd.switchTo = this.switchLatch;
    cmd.cycleFireMode = this.fireModeLatch;
    this.clearOneShots();
  }

  /** Returns true once per trigger click since the last tick (used for menus-in-play such as spectating). */
  takeClick(): boolean {
    const clicked = this.fireLatch;
    this.fireLatch = false;
    return clicked;
  }

  /** The squad order key pressed or the wheel's order picked this frame, once (null if none; M22, M23). */
  takeOrder(): SquadCommand | null {
    const order = this.orderLatch;
    this.orderFromWheel = this.latchFromWheel;
    this.orderLatch = null;
    return order;
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

  /** A scripted run (`?script=`) starts again from its first tick: a new match, or Play Again (bug pass). */
  restartScript(): void {
    this.scriptTick = 0;
  }

  /** Drops pending one-shot actions and closes the order wheel without an order (e.g. when the game pauses). */
  clearLatches(): void {
    this.clearOneShots();
    this.wheel.close();
    this.fireBlocked = false;
    this.aimBlocked = false;
  }

  private clearOneShots(): void {
    this.jumpLatch = false;
    this.reloadLatch = false;
    this.fireLatch = false;
    this.fireModeLatch = false;
    this.orderLatch = null;
    this.switchLatch = -1;
  }
}
