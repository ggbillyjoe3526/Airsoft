import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { vec3 } from '../sim/vec';
import { type Bot, type BotWorld, lastSeenAt, pick } from './bot';
import { aimBot, reloadBot, shootBot } from './botCombat';
import { wantRoute, moveBot } from './botMovement';
import { currentTarget, perceive } from './botSenses';
import { findCover } from './cover';
import { eyeOf } from './perception';

/**
 * One bot's mind. Bots are ordinary characters driven through PlayerCommands; each tick this decides
 * that command from what the bot has seen and heard: perceive (botSenses), pick a mode (below), move
 * (botMovement), then aim, shoot and reload (botCombat). See BotMode for the modes.
 */

// Scratch, each used only within one call of the function that fills it.
const myEye = vec3();
const aimAt = vec3();
const threatEye = vec3();

/** Picks the mode for this tick from what the bot knows and how it's doing. */
function chooseMode(b: Bot, w: BotWorld, target: Character | undefined, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  const seeing = b.targetVisible && target !== undefined;
  const armament = me.armament;
  const reloading = armament.reload > 0;
  const suppressed = w.time - b.suppressedAt < cfg.suppressionTime;

  if (seeing && target && (suppressed || reloading || armament.ammo[0]!.mag === 0) && b.mode !== 'cover' && b.coverCooldown <= 0) {
    b.coverCooldown = cfg.coverCooldown;
    eyeOf(target, w.body, threatEye);
    if (findCover(me.position, threatEye, w.nav, w.query, cfg, w.body, b.rng, b.cover)) {
      b.mode = 'cover';
      b.coverLeft = pick(b.rng, cfg.coverTime);
      b.coverGiveUp = cfg.coverMaxTime;
      b.coverHeld = 0;
      b.routeState = 'none';
      wantRoute(b, b.cover.position, cfg);
      return;
    }
  }
  if (b.mode === 'cover') {
    const atCover = Math.hypot(b.cover.position.x - me.position.x, b.cover.position.z - me.position.z) < cfg.coverArrive;
    if (atCover) {
      b.coverLeft -= dt;
      b.coverHeld += dt;
    }
    b.coverGiveUp -= dt;
    // Settled in cover but still in sight of an enemy (flanked, or the spot doesn't hide us): fight back.
    const exposed = b.coverHeld >= cfg.coverSettle && seeing && !reloading;
    const done = exposed || (b.coverLeft <= 0 && !reloading) || b.coverGiveUp <= 0 || b.routeState === 'failed';
    if (!done) return;
    b.routeState = 'none';
  }
  const remembered = b.hasLastKnown && w.time - Math.max(lastSeenAt(b), b.heardAt) < cfg.memoryTime;
  if (seeing) {
    b.mode = 'fight';
  } else if (remembered) {
    if (b.mode !== 'search') b.routeState = 'none';
    b.mode = 'search';
  } else if (b.mode !== 'advance') {
    b.hasLastKnown = false;
    b.mode = 'advance';
    b.routeState = 'none';
    if (!b.hunting && b.laneIndex >= 0) b.laneIndex -= b.laneDir; // re-take the lane point we left
  }
}

/**
 * One tick of decisions for bot `b`, written into `cmd`. Characters out of play are driven by the
 * simulation's hit-calling routine instead, so this only keeps the view in sync for them.
 */
export function thinkBot(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  cmd.forward = 0;
  cmd.right = 0;
  cmd.sprint = false;
  cmd.walk = false;
  cmd.crouch = false;
  cmd.jump = false;
  cmd.fire = false;
  cmd.reload = false;
  cmd.switchTo = 0; // bots use their primary
  if (!isInPlay(me)) {
    b.mode = 'advance';
    b.aim.yaw = cmd.yaw = me.yaw;
    b.aim.pitch = cmd.pitch = me.pitch;
    return;
  }

  b.thinkLeft -= dt;
  if (b.thinkLeft <= 0) {
    b.thinkLeft += cfg.thinkInterval;
    if (w.live) perceive(b, w);
    else b.targetVisible = false;
  }
  const target = currentTarget(b, w);
  if (!target) b.targetVisible = false;
  b.coverCooldown -= dt;

  chooseMode(b, w, target, dt);
  const moving = moveBot(b, w, cmd, dt);
  if (moving) {
    // World direction → command axes relative to the current view.
    const dir = b.moveDir;
    cmd.forward = -Math.sin(b.aim.yaw) * dir.x - Math.cos(b.aim.yaw) * dir.z;
    cmd.right = Math.cos(b.aim.yaw) * dir.x - Math.sin(b.aim.yaw) * dir.z;
    const calm = w.time - b.lastThreatAt > cfg.sprintWhenCalmFor;
    cmd.sprint = b.mode === 'advance' && calm && cmd.forward > cfg.sprintForward;
  }
  eyeOf(me, w.body, myEye);
  const offAim = aimBot(b, w, target, myEye, aimAt, moving, cmd.right !== 0, dt);
  cmd.yaw = b.aim.yaw;
  cmd.pitch = b.aim.pitch;
  shootBot(b, w, target, myEye, aimAt, offAim, cmd, dt);
  reloadBot(b, w, cmd);
}
