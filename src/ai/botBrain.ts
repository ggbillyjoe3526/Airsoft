import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { vec3 } from '../sim/vec';
import { type Bot, type BotWorld, flagRole, lastSeenAt, pick, wantsFlag } from './bot';
import { aimBot, reloadBot, shootBot } from './botCombat';
import { enterFlagMode, moveBot, wantRoute } from './botMovement';
import { currentTarget, perceive } from './botSenses';
import { type CoverSearch, findCover, hidesFrom } from './cover';
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

/** Narrowed cover search for a fresh contact: close crouch cover only, no random tries (filled per call). */
const contactSearch: CoverSearch = { radius: 0, randomCandidates: 0, crouchOnly: true };

/**
 * Looks for cover from `threat` and heads there (`search` narrows the search, see findCover); false
 * if no spot nearby hides the bot. Ducks for `down` seconds once there before looking again.
 */
function takeCover(b: Bot, w: BotWorld, threat: Character, down: number, search?: CoverSearch): boolean {
  const cfg = w.cfg;
  eyeOf(threat, w.body, threatEye);
  if (!findCover(b.character.position, threatEye, w.nav, w.query, cfg, w.body, b.rng, w.lowCover, b.cover, search)) return false;
  b.mode = 'cover';
  b.coverPhase = 'down';
  b.coverLeft = down;
  b.coverGiveUp = cfg.coverMaxTime;
  b.coverHeld = 0;
  b.coverSince = w.time;
  b.peeksLeft = Math.floor(pick(b.rng, cfg.peekCount));
  b.fromCover = false;
  b.routeState = 'none';
  wantRoute(b, b.cover.position, cfg);
  return true;
}

/**
 * Ducks back down behind the crouch cover it is fighting from, unless the spot no longer hides it from
 * where the bot knows the threat to be (flanked). Ducking with the enemy still in sight (under fire,
 * reloading, end of a burst) renews its looks; ducking because the enemy went out of sight doesn't.
 */
function duckBack(b: Bot, w: BotWorld, target: Character | undefined, seeing: boolean): boolean {
  const cfg = w.cfg;
  if (seeing && target) {
    eyeOf(target, w.body, threatEye);
  } else {
    // Only what it knows: where the enemy was last seen or heard, at standing eye height.
    threatEye.x = b.lastKnown.x;
    threatEye.y = b.lastKnown.y + w.body.standEyeHeight;
    threatEye.z = b.lastKnown.z;
  }
  if (!hidesFrom(b.cover.position, threatEye, w.query, w.body)) return false;
  b.mode = 'cover';
  b.coverPhase = 'down';
  b.coverLeft = pick(b.rng, cfg.peekDown);
  b.coverHeld = 0; // time to crouch before "still in sight" counts as exposed
  if (seeing) b.peeksLeft = Math.max(b.peeksLeft, Math.floor(pick(b.rng, cfg.peekCount)));
  b.fromCover = false;
  return true;
}

/** Picks the mode for this tick from what the bot knows and how it's doing. */
function chooseMode(b: Bot, w: BotWorld, target: Character | undefined, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  const seeing = b.targetVisible && target !== undefined;
  const armament = me.armament;
  const ammo = armament.ammo[0]!;
  const reloading = armament.reload > 0;
  const outOfAmmo = ammo.mag === 0 && ammo.reserve === 0;
  const empty = ammo.mag === 0 && !outOfAmmo; // empty, but a reload will fix it
  const suppressed = w.time - b.suppressedAt < cfg.suppressionTime;
  const atCover = Math.hypot(b.cover.position.x - me.position.x, b.cover.position.z - me.position.z) < cfg.coverArrive;
  const coverOver = w.time - b.coverSince > cfg.coverEpisodeMax || outOfAmmo;

  // Fighting over crouch cover: duck again when shot at, reloading, out of sight or after a short
  // burst. With the target gone (hit, or forgotten), there's nothing to duck from: move on.
  if (b.mode === 'fight' && b.fromCover) {
    b.peekFightLeft -= dt;
    const duck = !seeing || suppressed || reloading || empty || b.peekFightLeft <= 0;
    if (atCover && duck && target && !coverOver && duckBack(b, w, target, seeing)) return;
    if (!atCover || duck || coverOver) b.fromCover = false; // pushed off the spot, flanked or done: fight like anywhere else
  }
  if (seeing && target && (suppressed || reloading || empty) && b.mode !== 'cover' && b.coverCooldown <= 0) {
    b.coverCooldown = cfg.coverCooldown;
    if (takeCover(b, w, target, pick(b.rng, cfg.coverTime))) return;
  }
  if (b.mode === 'cover') {
    if (atCover) b.coverHeld += dt;
    else b.coverGiveUp -= dt; // only getting there can take too long
    if (atCover && b.coverPhase === 'down') b.coverLeft -= dt;
    // Settled in cover but still in sight of an enemy (flanked, or the spot doesn't hide us): fight back.
    const exposed = b.coverPhase === 'down' && b.coverHeld >= cfg.coverSettle && seeing && !reloading;
    let done = exposed || coverOver || b.coverGiveUp <= 0 || b.routeState === 'failed';
    if (!done && atCover && b.coverPhase === 'down' && b.coverLeft <= 0 && !reloading) {
      // Time to look again: over crouch cover by standing up, otherwise by moving on.
      if (b.cover.crouchOnly && b.peeksLeft > 0) {
        b.coverPhase = 'peek';
        b.peekLeft = pick(b.rng, cfg.peekLook);
        b.peeksLeft--;
      } else {
        done = true;
      }
    } else if (!done && b.coverPhase === 'peek') {
      if (seeing) {
        b.mode = 'fight';
        b.fromCover = true;
        b.peekFightLeft = pick(b.rng, cfg.peekFight);
        return;
      }
      b.peekLeft -= dt;
      if (b.peekLeft <= 0) {
        if (b.peeksLeft > 0) {
          b.coverPhase = 'down';
          b.coverLeft = pick(b.rng, cfg.peekDown);
          b.coverHeld = 0;
        } else {
          done = true;
        }
      }
    }
    if (!done) return;
    b.routeState = 'none';
  }
  // What the bot still remembers of an enemy it saw or heard (memoryTime). Attack / Defend defenders
  // only go after what is near their pole; anything further off they hold their post for, and keep
  // watching that way (aimBot looks at lastKnown) until it is old news.
  const fresh = b.hasLastKnown && w.time - Math.max(lastSeenAt(b), b.heardAt) < cfg.memoryTime;
  const defending = flagRole(b, w) === 'defend';
  const pole = w.round.flag.position;
  const watchFromPost = fresh && defending && Math.hypot(b.lastKnown.x - pole.x, b.lastKnown.z - pole.z) > cfg.defendSearchRadius;
  const remembered = fresh && !watchFromPost;
  if (seeing && target) {
    // A fresh contact at range while on the move: get behind close crouch cover first, then peek.
    if ((b.mode === 'advance' || b.mode === 'search') && b.coverCooldown <= 0) {
      const d = Math.hypot(target.position.x - me.position.x, target.position.z - me.position.z);
      contactSearch.radius = cfg.contactCoverRadius;
      if (d >= cfg.contactCoverMinDistance && takeCover(b, w, target, 0, contactSearch)) {
        b.coverCooldown = cfg.coverCooldown;
        return;
      }
    }
    b.mode = 'fight';
  } else if (wantsFlag(b, w)) {
    // Attack / Defend: the pole comes before chasing noises.
    if (b.mode !== 'flag') enterFlagMode(b, w);
  } else if (remembered) {
    if (b.mode !== 'search') b.routeState = 'none';
    b.mode = 'search';
  } else if (b.mode !== 'advance') {
    b.hasLastKnown = watchFromPost; // back to the post (or lane), still watching that way if holding
    b.mode = 'advance';
    b.routeState = 'none';
    b.route.length = 0; // not "arrived" anywhere: the old route was for another mode
    b.waitForTeam = false;
    b.holdLeft = 0; // a pause cut short by a fight doesn't resume somewhere else
    if (!b.hunting && b.laneIndex >= 0) b.laneIndex -= b.laneDir; // re-take the lane point we left
  } else if (defending && !fresh) {
    b.hasLastKnown = false; // holding a post: stop watching where a noise was once it's old news
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
    cmd.sprint = (b.mode === 'advance' || b.mode === 'flag') && calm && cmd.forward > cfg.sprintForward;
    // Closing in on where someone was seen or heard: walk, so footsteps don't give us away.
    cmd.walk = b.mode === 'search' && Math.hypot(b.lastKnown.x - me.position.x, b.lastKnown.z - me.position.z) < cfg.searchWalkDistance;
  }
  eyeOf(me, w.body, myEye);
  const offAim = aimBot(b, w, target, myEye, aimAt, moving, cmd, dt);
  cmd.yaw = b.aim.yaw;
  cmd.pitch = b.aim.pitch;
  shootBot(b, w, target, myEye, aimAt, offAim, cmd, dt);
  reloadBot(b, w, cmd);
}
