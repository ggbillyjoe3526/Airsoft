import type { BodyConfig, MovementConfig } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { VaultConfig } from '../config/vault';
import type { WorldQuery } from './armament';
import type { Character } from './character';
import type { PlayerCommand } from './commands';
import type { GameEvent } from './events';
import type { CharacterMover, MovementScratch } from './movement';
import { type Vec3, vec3 } from './vec';

/**
 * Vaulting (M102): Jump pressed at a low obstacle (a wall, barrier or crate whose top is `VaultConfig.minHeight` to
 * `maxHeight` over the floor and at most `maxLandingHeight` over the one past it, no deeper than `maxDepth`, with room
 * to land on the far side) takes the body over it in
 * one short, committed move instead of a jump. The body rises onto the top and crosses it on a path the character
 * controller follows (so it never passes through anything), then falls off the far side under gravity and lands as from
 * a jump. Meanwhile the replica is carried (no firing, aiming or reloading starts), the body tucks (a crouch: the eyes,
 * the hit volume and the drawn figure follow it) and the view still turns freely. Bots vault through the same command.
 * The obstacle is found with level rays only (`WorldQuery`), so the rule is the same for everyone and tested on its own.
 */
export interface VaultState {
  /** Vaulting now: the body follows the path below, not its command. */
  active: boolean;
  /**
   * A Jump press now would vault (DX6): the simulation's answer each tick for a character in play (stepVaultReady),
   * which the vault prompt reads, so nothing outside the simulation casts rays for it. False out of play.
   */
  ready: boolean;
  /** Seconds since the vault began. */
  time: number;
  /** Where it began (the feet), and the way it goes (a unit vector on the ground plane). */
  startX: number;
  startY: number;
  startZ: number;
  dirX: number;
  dirZ: number;
  /** Along the way from the start (m): where the body meets the obstacle's face, and where it is clear of the far side. */
  front: number;
  far: number;
  /** The obstacle's top (world height), and the feet's height while crossing it (the top plus the clearance). */
  topY: number;
  overY: number;
  /** Speed across the top and out of the vault (m/s). */
  speed: number;
  /** Seconds from the start: the rise onto the top ends, and the vault hands over to the fall. */
  riseEnd: number;
  end: number;
  /**
   * The one-shot presses made while vaulting (BP5): kept, and played into the first command after the vault
   * (`withVaultPresses`), as a reload pressed during a draw waits for it. Nothing starts mid-vault, and nothing pressed
   * is lost.
   */
  held: VaultPresses;
}

/** A command's one-shot presses (PlayerCommand's), as kept through a vault. */
export interface VaultPresses {
  /** Any kept at all. */
  any: boolean;
  reload: boolean;
  /** The last slot pressed (-1 none). */
  switchTo: number;
  holster: boolean;
  /** Fire selector presses (each steps the mode once). */
  cycleFireMode: number;
  /** Torch presses (each switches it). */
  toggleTorch: number;
  /** The last teammate asked to catch a magazine (-1 none). */
  tossMag: number;
  /** Hop-up notches turned (HD1), summed. */
  hopUpSteps: number;
}

export function createVaultState(): VaultState {
  return {
    active: false,
    ready: false,
    time: 0,
    startX: 0,
    startY: 0,
    startZ: 0,
    dirX: 0,
    dirZ: -1,
    front: 0,
    far: 0,
    topY: 0,
    overY: 0,
    speed: 0,
    riseEnd: 0,
    end: 0,
    held: { any: false, reload: false, switchTo: -1, holster: false, cycleFireMode: 0, toggleTorch: 0, tossMag: -1, hopUpSteps: 0 },
  };
}

/**
 * The command `c` follows while vaulting, written into `out` (BP5): the view from `cmd`, the trigger and the aim as they
 * were when the vault began (one held through it is no new pull or aim press after it, and one pressed during it counts
 * once it is over), nothing else. `cmd`'s one-shot presses are kept in the vault for after it.
 */
export function vaultingCommand(c: Character, cmd: Readonly<PlayerCommand>, out: PlayerCommand): PlayerCommand {
  const h = c.vault.held;
  if (cmd.reload) h.reload = h.any = true;
  if (cmd.switchTo >= 0) {
    h.switchTo = cmd.switchTo;
    h.any = true;
  }
  if (cmd.holster) h.holster = h.any = true;
  if (cmd.cycleFireMode) {
    h.cycleFireMode++;
    h.any = true;
  }
  if (cmd.toggleTorch) {
    h.toggleTorch++;
    h.any = true;
  }
  if (cmd.tossMag >= 0) {
    h.tossMag = cmd.tossMag;
    h.any = true;
  }
  if (cmd.hopUpSteps !== 0) {
    h.hopUpSteps += cmd.hopUpSteps;
    h.any = true;
  }
  out.yaw = cmd.yaw;
  out.pitch = cmd.pitch;
  out.fire = c.armament.triggerWasDown;
  out.aim = c.armament.aimWasDown;
  return out;
}

/**
 * The first command after a vault: `cmd` with the presses kept through it (vaultingCommand), written into `out`, and
 * those presses cleared. A fire selector or torch pressed twice plays the second on the tick after. `cmd` itself when
 * nothing was kept.
 */
export function withVaultPresses(v: VaultState, cmd: PlayerCommand, out: PlayerCommand): PlayerCommand {
  const h = v.held;
  if (!h.any) return cmd;
  Object.assign(out, cmd);
  out.reload ||= h.reload;
  if (h.switchTo >= 0 && out.switchTo < 0) out.switchTo = h.switchTo;
  out.holster ||= h.holster;
  if (h.cycleFireMode > 0 && !out.cycleFireMode) {
    out.cycleFireMode = true;
    h.cycleFireMode--;
  }
  if (h.toggleTorch > 0 && !out.toggleTorch) {
    out.toggleTorch = true;
    h.toggleTorch--;
  }
  if (h.tossMag >= 0 && out.tossMag < 0) out.tossMag = h.tossMag;
  out.hopUpSteps += h.hopUpSteps;
  h.reload = h.holster = false;
  h.switchTo = h.tossMag = -1;
  h.hopUpSteps = 0;
  h.any = h.cycleFireMode > 0 || h.toggleTorch > 0;
  return out;
}

/** Drops whatever was kept through a vault (a respawn, or a hit: nothing pressed then is owed). */
function dropVaultPresses(h: VaultPresses): void {
  h.any = h.reload = h.holster = false;
  h.switchTo = h.tossMag = -1;
  h.cycleFireMode = h.toggleTorch = h.hopUpSteps = 0;
}

/** The gap the planned path keeps from the obstacle's faces: the controller's skin and a hair more. */
const SKIN = PHYSICS.controllerOffset + 0.01;
/**
 * The clearance rays look for anything this far over the feet's path, at the body's middle and just under its head
 * (walls), and down through the body from its head to that low line (beams and lintels between them).
 */
const LOW_RAY = 0.15;
const HEAD_RAY = 0.05;
/** The side rays run this far inside the body's radius, so a wall it brushes along doesn't count. */
const SIDE_INSET = 0.04;
/** The scan line runs this far over the highest top a vault takes, so a top of exactly maxHeight is under it. */
const SCAN_ABOVE = 0.02;

const origin = vec3();
const ray = vec3();

function cast(query: WorldQuery, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
  origin.x = ox;
  origin.y = oy;
  origin.z = oz;
  ray.x = dx;
  ray.y = dy;
  ray.z = dz;
  return query.raycastStatic(origin, ray, maxDist);
}

/** Distance down from `fromY` over the point `s` metres along the way to the first surface, or -1 within `maxDist`. */
function down(query: WorldQuery, p: Readonly<Vec3>, dirX: number, dirZ: number, s: number, fromY: number, maxDist: number): number {
  return cast(query, p.x + dirX * s, fromY, p.z + dirZ * s, 0, -1, 0, maxDist);
}

/**
 * Looks for an obstacle to vault from feet position `p` along the unit way (`dirX`, `dirZ`) at `speed` (m/s, towards
 * it), and writes the vault into `out` (not started: `active` is left as it was). False if there is none: nothing low
 * enough within reach, a top that isn't flat, deeper than a vault, no floor to land on within the heights allowed, or
 * no room for the body over the top or on the far side.
 */
export function planVault(p: Readonly<Vec3>, dirX: number, dirZ: number, speed: number, cfg: VaultConfig, body: BodyConfig, query: WorldQuery, out: VaultState): boolean {
  const floor = p.y - PHYSICS.groundRestGap;
  const r = body.radius;
  // Its face, within reach of the body.
  const face = cast(query, p.x, floor + cfg.faceProbe, p.z, dirX, 0, dirZ, r + cfg.reach + Math.max(0, speed) * cfg.reachPerSpeed);
  if (face < r * 0.5) return false;
  // A line just over the highest top a vault takes: open until anything taller (the obstacle itself when it is cover,
  // or a wall behind it). Every sample below starts on it in the open.
  const scanY = floor + cfg.maxHeight + SCAN_ABOVE;
  const reachEnd = face + cfg.maxDepth + 2 * r + cfg.landingRoom + cfg.depthStep;
  const hit = cast(query, p.x, scanY, p.z, dirX, 0, dirZ, reachEnd);
  const open = hit < 0 ? reachEnd : hit;
  if (open <= face + cfg.depthStep) return false;
  // The top, just inside the face: at least minHeight over the floor (and under the scan line, so at most about maxHeight).
  let s = face + cfg.depthStep * 0.5;
  const t = down(query, p, dirX, dirZ, s, scanY, scanY - (floor + cfg.minHeight));
  if (t < 0) return false;
  const top = scanY - t;
  if (top - floor > cfg.maxHeight) return false;
  // Along the top to its far side: flat all the way, and no deeper than maxDepth.
  let edge = -1;
  for (s += cfg.depthStep; s <= face + cfg.maxDepth + cfg.depthStep && s < open; s += cfg.depthStep) {
    const d = down(query, p, dirX, dirZ, s, scanY, scanY - (top - cfg.topTolerance));
    if (d < 0) {
      edge = s;
      break;
    }
    if (scanY - d > top + cfg.topTolerance) return false;
  }
  if (edge < 0) return false;
  // The far side exactly: a ray back from past it, under the top.
  const back = cast(query, p.x + dirX * edge, top - cfg.topTolerance * 0.5, p.z + dirZ * edge, -dirX, 0, -dirZ, cfg.depthStep + 1e-3);
  const farSide = back >= 0 ? edge - back : edge - cfg.depthStep * 0.5;
  // Room for the body past the far side, and a floor there: no higher than maxClimb over this one, and the top no more
  // than maxLandingHeight over it.
  const land = farSide + r + cfg.landingRoom;
  if (land + r > open) return false;
  const l = down(query, p, dirX, dirZ, land, scanY, scanY - (top - cfg.maxLandingHeight));
  if (l < 0 || scanY - l > floor + cfg.maxClimb) return false;
  // Room for the body on its way: rising here, and over the top to clear of the far side.
  const overY = top + cfg.clearance;
  const far = farSide + r + SKIN;
  if (cast(query, p.x, p.y + body.height - HEAD_RAY, p.z, 0, 1, 0, overY - p.y + HEAD_RAY) >= 0) return false;
  const pass = far + r;
  const mid = overY + body.height / 2;
  if (cast(query, p.x, overY + LOW_RAY, p.z, dirX, 0, dirZ, pass) >= 0) return false;
  if (cast(query, p.x, mid, p.z, dirX, 0, dirZ, pass) >= 0) return false;
  if (cast(query, p.x, overY + body.height - HEAD_RAY, p.z, dirX, 0, dirZ, pass) >= 0) return false;
  // Down through the body's height along the way: a beam, a lintel or a low roof between those lines.
  for (let at = 0; at < pass + cfg.depthStep; at += cfg.depthStep) {
    if (down(query, p, dirX, dirZ, Math.min(at, pass), overY + body.height, body.height - LOW_RAY) >= 0) return false;
  }
  // Either side of the body's middle: a gap narrower than the body (a low wall between two posts) is no way through.
  const side = r - SIDE_INSET;
  if (cast(query, p.x - dirZ * side, mid, p.z + dirX * side, dirX, 0, dirZ, pass) >= 0) return false;
  if (cast(query, p.x + dirZ * side, mid, p.z - dirX * side, dirX, 0, dirZ, pass) >= 0) return false;

  out.time = 0;
  out.startX = p.x;
  out.startY = p.y;
  out.startZ = p.z;
  out.dirX = dirX;
  out.dirZ = dirZ;
  out.front = Math.max(0, face - r - SKIN);
  out.far = far;
  out.topY = top;
  out.overY = overY;
  const u = Math.min(cfg.maxSpeed, Math.max(cfg.minSpeed, speed));
  out.speed = u;
  out.riseEnd = Math.max(cfg.riseTime, out.front / u);
  out.end = out.riseEnd + (out.far - out.front) / u;
  return true;
}

/**
 * The way a vault would go for `cmd`, written into `out` (a unit vector on the ground plane): the way the movement keys
 * push (relative to the view, as stepMovement turns them), or the view's way with none held. False if that is more than
 * `cfg.vault.maxViewAngle` off the view: nobody vaults sideways or backwards without looking.
 */
export function vaultWay(cmd: PlayerCommand, cfg: MovementConfig, out: { x: number; z: number }): boolean {
  const sin = Math.sin(cmd.yaw);
  const cos = Math.cos(cmd.yaw);
  const f = cmd.forward;
  const r = cmd.right;
  const mag = Math.hypot(f, r);
  if (mag <= cfg.inputDeadzone) {
    out.x = -sin;
    out.z = -cos;
    return true;
  }
  out.x = (-sin * f + cos * r) / mag;
  out.z = (-cos * f - sin * r) / mag;
  // The cosine of the angle off the view is f / mag (the view's way is (-sin, -cos)).
  return f / mag >= Math.cos(cfg.vault.maxViewAngle);
}

const way = { x: 0, z: 0 };

/**
 * Whether `c` could vault now along the way `cmd` pushes, written into `out` if so (not started): standing on the ground,
 * not crouched, the jump ready, and an obstacle there (planVault). Pure apart from the level rays; for the simulation
 * (tryVault), and for anyone who asks first (a bot at a vault on its route).
 */
export function findVault(c: Character, cmd: PlayerCommand, cfg: MovementConfig, body: BodyConfig, query: WorldQuery, out: VaultState): boolean {
  if (c.vault.active || !c.grounded || c.jumpCooldown > 0 || c.crouchAmount >= cfg.crouchedThreshold) return false;
  if (!vaultWay(cmd, cfg, way)) return false;
  const speed = c.velocity.x * way.x + c.velocity.z * way.z;
  return planVault(c.position, way.x, way.z, speed, cfg.vault, body, query, out);
}

/**
 * The tick's answer to whether a Jump press would vault now, into `c.vault.ready` (DX6; false out of play): asked after
 * the character's move with the tick's command, as a press next tick would be. The vault it finds goes into `scratch`,
 * never into `c.vault`. Level rays only, read-only, so the simulation stays deterministic.
 */
export function stepVaultReady(c: Character, cmd: PlayerCommand, inPlay: boolean, cfg: MovementConfig, body: BodyConfig, query: WorldQuery, scratch: VaultState): void {
  c.vault.ready = inPlay && findVault(c, cmd, cfg, body, query, scratch);
}

/**
 * A Jump press (or one still buffered, MovementConfig.jumpBuffer) at an obstacle `c` can vault starts the vault, before
 * the movement step would make it a jump: it takes the press, the jump's cooldown and a vault footstep (hands and boots
 * on the obstacle, the loudest step a bot hears: BotConfig.footstepHearingVault). Returns whether it started. Call for
 * characters in play.
 */
export function tryVault(c: Character, cmd: PlayerCommand, cfg: MovementConfig, body: BodyConfig, query: WorldQuery, events: GameEvent[]): boolean {
  if (!cmd.jump && c.jumpWanted <= 0) return false;
  if (!findVault(c, cmd, cfg, body, query, c.vault)) return false;
  c.vault.active = true;
  c.jumpWanted = 0;
  c.jumpCooldown = cfg.jumpCooldown;
  c.sprinting = false;
  c.walking = false;
  events.push({ type: 'footstep', characterId: c.id, kind: 'vault' });
  return true;
}

/**
 * One tick of a vault in progress, in place of stepMovement: the view turns with `cmd`, the body follows the vault's
 * path through `mover` (rising onto the top, eased, then across it at the vault's speed with a slight arc). Clear of
 * the far side, it hands over to the movement step falling, at the vault's speed with a push down; held back by
 * something the plan didn't see, it gives up and falls where it is. Allocation-free.
 */
export function stepVault(c: Character, cmd: PlayerCommand, cfg: MovementConfig, dt: number, mover: CharacterMover, scratch: MovementScratch): void {
  const v = c.vault;
  const vc = cfg.vault;
  c.yaw = cmd.yaw;
  c.pitch = Math.max(-cfg.maxPitch, Math.min(cfg.maxPitch, cmd.pitch));
  v.time += dt;
  const t = Math.min(v.time, v.end);
  let along: number;
  let y: number;
  let rise = 1;
  if (t < v.riseEnd) {
    const x = t / v.riseEnd;
    rise = 1 - (1 - x) * (1 - x);
    along = v.front * x;
    y = v.startY + (v.overY - v.startY) * rise;
  } else {
    const span = v.end - v.riseEnd;
    along = v.front + v.speed * (t - v.riseEnd);
    y = v.overY + vc.arc * Math.sin(Math.PI * (span > 0 ? (t - v.riseEnd) / span : 1));
  }
  const { desired, corrected } = scratch;
  desired.x = v.startX + v.dirX * along - c.position.x;
  desired.y = y - c.position.y;
  desired.z = v.startZ + v.dirZ * along - c.position.z;
  mover.move(c, desired, corrected);
  c.position.x += corrected.x;
  c.position.y += corrected.y;
  c.position.z += corrected.z;
  c.velocity.x = corrected.x / dt;
  c.velocity.y = corrected.y / dt;
  c.velocity.z = corrected.z / dt;

  c.crouchAmount = vc.tuck * rise;
  c.grounded = false;
  c.sprinting = false;
  c.walking = false;
  c.groundRise = 0;
  c.jumpWanted = 0;
  c.jumpCooldown = Math.max(0, c.jumpCooldown - dt);
  // Carried through the vault, and up again only a moment after it (Character.fireLockout).
  c.fireLockout = vc.fireLockout;

  if (Math.hypot(desired.x - corrected.x, desired.y - corrected.y, desired.z - corrected.z) > vc.blockedAt) {
    v.active = false;
    c.velocity.y = Math.min(0, c.velocity.y);
  } else if (v.time >= v.end) {
    v.active = false;
    c.velocity.x = v.dirX * v.speed;
    c.velocity.y = -vc.dropSpeed;
    c.velocity.z = v.dirZ * v.speed;
  }
}

/** Ends a vault at once (a respawn, or a rescue back into the level). */
export function cancelVault(c: Character): void {
  c.vault.active = false;
  c.vault.ready = false;
  c.vault.time = 0;
  dropVaultPresses(c.vault.held);
}

/**
 * How far through its vault `c` is drawn (0..1, `alpha` of the way through the tick of `dt` seconds), or 0 when it isn't
 * vaulting: for the view's dip and tip, and the figure.
 */
export function vaultProgress(c: Character, alpha: number, dt: number): number {
  const v = c.vault;
  if (!v.active || !(v.end > 0)) return 0;
  return Math.max(0, Math.min(1, (v.time - dt * (1 - alpha)) / v.end));
}
