import { SQUAD_ORDERS } from '../config/squad';
import { canReload } from '../sim/armament';
import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, flagRole, pick, threatInMind, wantsFlag } from './bot';
import { aimBot, lowOnBBs, reloadBot, shootBot } from './botCombat';
import { enterFlagMode, keepApart, moveBot, startSearch, teammateSpots, wantRoute } from './botMovement';
import { currentTarget, perceive } from './botSenses';
import { stepBotTorch } from './botTorch';
import { type CoverSearch, findCover, hidesFrom, leanSideToSee } from './cover';
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

/** Narrowed cover search for a fresh contact: close cover to peek from only, no random tries (filled per call). */
const contactSearch: CoverSearch = { radius: 0, randomCandidates: 0, peekable: true };
/** The same for trading a teammate's hit (M38): a spot to peek from towards where the shot came from. */
const tradeSearch: CoverSearch = { radius: 0, randomCandidates: 0, peekable: true };

/**
 * Looks for cover from `threat` and heads there (`search` narrows the search, see findCover); false
 * if no spot nearby hides the bot. Ducks for `down` seconds once there before looking again.
 */
function takeCover(b: Bot, w: BotWorld, threat: Character, down: number, search?: CoverSearch): boolean {
  eyeOf(threat, w.body, w.hits, threatEye);
  return takeCoverFrom(b, w, threatEye, down, search);
}

/** takeCover from a threat whose eye is at `eye` (seen, or only known: knownThreatEye). */
function takeCoverFrom(b: Bot, w: BotWorld, eye: Vec3, down: number, search?: CoverSearch): boolean {
  const cfg = w.cfg;
  // Never the spot a teammate is at or heading for (AI-01).
  if (!findCover(b.character.position, eye, w, b.rng, b.cover, search, teammateSpots(b, w))) return false;
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

/** Where the bot knows the threat to be (last seen or heard), at standing eye height, into `threatEye`. */
function knownThreatEye(b: Bot, w: BotWorld): void {
  threatEye.x = b.lastKnown.x;
  threatEye.y = b.lastKnown.y + w.body.standEyeHeight;
  threatEye.z = b.lastKnown.z;
}

/**
 * At a lean spot: re-checks, from where the bot actually stands, which way a lean shows where the threat
 * was (the bot stops a few centimetres off the planned spot). False if neither way does (the caller ends
 * the cover episode; the spot stays a lean spot until then), or not a lean spot.
 */
function leansOutHere(b: Bot, w: BotWorld): boolean {
  if (b.cover.lean === 0) return false;
  knownThreatEye(b, w);
  const side = leanSideToSee(b.character.position, threatEye, w);
  if (side !== 0) b.cover.lean = side;
  return side !== 0;
}

/** Leaning out of full cover at a corner: peeking, or fighting from the spot. */
function leaningOut(b: Bot): boolean {
  return b.cover.lean !== 0 && ((b.mode === 'cover' && b.coverPhase === 'peek') || (b.mode === 'fight' && b.fromCover));
}

/**
 * Ducks back down behind the crouch cover (or leans back in behind the corner) it is fighting from,
 * unless the spot no longer hides it from where the bot knows the threat to be (flanked). Ducking with
 * the enemy still in sight (under fire, reloading, end of a burst) renews its looks; ducking because the
 * enemy went out of sight doesn't.
 */
function duckBack(b: Bot, w: BotWorld, target: Character | undefined, seeing: boolean): boolean {
  const cfg = w.cfg;
  if (seeing && target) {
    eyeOf(target, w.body, w.hits, threatEye);
  } else {
    knownThreatEye(b, w);
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
  const outOfAmmo = ammo.mag === 0 && !canReload(ammo);
  const empty = ammo.mag === 0 && !outOfAmmo; // empty, but a spare mag has BBs
  const suppressed = w.time - b.suppressedAt < cfg.suppressionTime;
  // A lean spot only works right on it: a few centimetres decide whether the lean sees round the corner.
  const arrive = b.cover.lean !== 0 ? cfg.leanSpotArrive : cfg.coverArrive;
  const atCover = Math.hypot(b.cover.position.x - me.position.x, b.cover.position.z - me.position.z) < arrive;
  const coverOver = w.time - b.coverSince > cfg.coverEpisodeMax || outOfAmmo;

  // Fighting over crouch cover (or round a corner): duck (lean back in) again when shot at, reloading,
  // out of sight or after a short burst. With the target gone (hit, or forgotten), there's nothing to duck from: move on.
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
      // Time to look again: over crouch cover by standing up, round a corner by leaning out, otherwise
      // by moving on.
      if ((b.cover.crouchOnly || leansOutHere(b, w)) && b.peeksLeft > 0) {
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
  // A guard in Extraction (M46) is leashed the same way to its case, within guardLeash.
  const fresh = threatInMind(b, w);
  const guarding = b.role === 'guard';
  const defending = flagRole(b, w) === 'defend' || guarding;
  const post = guarding ? w.round.run.cases[b.guardCase]!.position : w.round.flag.position;
  const leash = guarding ? cfg.guardLeash : cfg.defendSearchRadius;
  const watchFromPost = fresh && defending && Math.hypot(b.lastKnown.x - post.x, b.lastKnown.z - post.z) > leash;
  const remembered = fresh && !watchFromPost;
  if (seeing && target) {
    // A fresh contact at range while on the move: get behind close crouch cover first, then peek. Not a hunter (M46):
    // it pushes.
    if ((b.mode === 'advance' || b.mode === 'search' || b.mode === 'order') && b.coverCooldown <= 0 && b.role !== 'hunter') {
      const d = Math.hypot(target.position.x - me.position.x, target.position.z - me.position.z);
      contactSearch.radius = cfg.contactCoverRadius;
      if (d >= b.skill.contactCoverMinDistance && takeCover(b, w, target, 0, contactSearch)) {
        b.coverCooldown = cfg.coverCooldown;
        return;
      }
    }
    // A new fight looks afresh whether a hunter's push keeps its target in sight (BP2): never the last fight's look.
    if (b.mode !== 'fight') b.pushLookFor = -1;
    b.mode = 'fight';
  } else if (b.order !== 'none') {
    // A squad order (M22) comes before the team plan: the pole, chasing noises and the lane. A noise still turns its
    // head (aimBot watches lastKnown) until it is old news.
    if (b.mode !== 'order') {
      b.mode = 'order';
      b.routeState = 'none';
      b.route.length = 0;
    }
    if (!fresh) b.hasLastKnown = false;
  } else if (wantsFlag(b, w)) {
    // Attack / Defend: the pole comes before chasing noises.
    if (b.mode !== 'flag') enterFlagMode(b, w);
  } else if (fresh && (tradeHit(b, w) || reloadFromCover(b, w))) {
    return;
  } else if (remembered) {
    if (b.mode !== 'search') {
      // Lost sight of someone still in play (M38): a bot with peekWatchTime first watches where they ducked out.
      // A hunter (M46) goes straight after them.
      if (b.mode === 'fight' && b.contact && b.skill.peekWatchTime[1] > 0 && b.role !== 'hunter') b.watchUntil = w.time + pick(b.rng, b.skill.peekWatchTime);
      b.routeState = 'none';
      b.mode = 'search';
      startSearch(b, w);
    }
  } else if (b.mode !== 'advance') {
    b.hasLastKnown = watchFromPost; // back to the post (or lane), still watching that way if holding
    b.mode = 'advance';
    b.routeState = 'none';
    b.route.length = 0; // not "arrived" anywhere: the old route was for another mode
    b.waitForTeam = false;
    b.holdLeft = 0; // a pause cut short by a fight doesn't resume somewhere else
    b.holdCover = false;
    if (b.role === 'patrol' && b.patrolIndex >= 0) b.patrolIndex--; // re-take the patrol's stop we left (M46)
    else if (!b.hunting && b.laneIndex >= 0) b.laneIndex -= b.laneDir; // re-take the lane point we left
  } else if (defending && !fresh) {
    b.hasLastKnown = false; // holding a post: stop watching where a noise was once it's old news
  }
  if (b.mode === 'advance' && !b.hunting && pushingLate(b, w)) {
    // Behind on players late in the round (M38): stop holding the lane and go looking for them.
    b.hunting = true;
    b.routeState = 'none';
    b.route.length = 0;
    b.holdLeft = 0;
    b.waitForTeam = false;
    b.holdCover = false;
  }
}

/** A teammate's hit call heard moments ago (M38, teamPlay): head for a spot to peek where it came from, once per call. */
function tradeHit(b: Bot, w: BotWorld): boolean {
  const cfg = w.cfg;
  if (!b.skill.teamPlay || b.tradeTried || w.time - b.tradeAt > cfg.tradeTime || b.coverCooldown > 0) return false;
  b.tradeTried = true;
  knownThreatEye(b, w);
  tradeSearch.radius = cfg.tradeCoverRadius;
  if (!takeCoverFrom(b, w, threatEye, 0, tradeSearch)) return false; // nowhere to peek from: straight there (search)
  b.coverCooldown = cfg.coverCooldown;
  return true;
}

/**
 * A low magazine with a threat in mind (M38, slicesCorners): to cover from where it is known to be, to top up there
 * (reloadBot waits for the spot). False if it needn't or no spot hides it.
 */
function reloadFromCover(b: Bot, w: BotWorld): boolean {
  const cfg = w.cfg;
  if (!b.skill.slicesCorners || b.coverCooldown > 0 || !lowOnBBs(b, cfg.tacticalReloadFraction)) return false;
  // Cooled down whether or not a spot is found, as for ducking under fire: no search every tick while none is near.
  b.coverCooldown = cfg.coverCooldown;
  knownThreatEye(b, w);
  return takeCoverFrom(b, w, threatEye, pick(b.rng, cfg.coverTime));
}

/** Elimination (M38, teamPlay): latePushTime or less left, and fewer of its team in play than of the other. */
export function pushingLate(b: Bot, w: BotWorld): boolean {
  if (!b.skill.teamPlay || w.round.mode !== 'elimination' || w.round.clock > w.cfg.latePushTime) return false;
  let balance = 0;
  for (const c of w.characters) if (isInPlay(c)) balance += c.team === b.character.team ? 1 : -1;
  return balance < 0;
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
  cmd.lean = 0;
  cmd.jump = false;
  cmd.aim = false; // bots aim from the hip and keep the fire mode their replica starts in
  cmd.cycleFireMode = false;
  cmd.fire = false;
  cmd.reload = false;
  cmd.switchTo = 0; // bots use their primary
  stepBotTorch(b, w, cmd); // M33h: night fields only (nothing by day)
  if (!isInPlay(me)) {
    b.mode = 'advance';
    b.atPost = false;
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
  // With a threat in mind, or walking its lane in the enemy's half (M38, slicesCorners): walk and slice each corner
  // ahead. Hunting with nothing heard, trading a hit teammate or pushing late, it hurries.
  const trading = w.time - b.tradeAt < cfg.tradeTime;
  const near = b.skill.slicesCorners && (threatInMind(b, w) || (!b.hunting && w.inEnemyHalf(b)));
  const hunter = b.role === 'hunter';
  b.careful = near && !trading && !hunter && (b.mode === 'advance' || b.mode === 'search') && !pushingLate(b, w);
  // Steer clear of anyone close by, or step out of their way (AI-01).
  const moving = keepApart(b, w, moveBot(b, w, cmd, dt, target), cmd);
  // Holding a lane point or a post: crouch once settled, where crouched eyes still see the enemy side (AI-02).
  if (b.holding && b.holdCrouch && b.teamWait >= cfg.holdCrouchDelay) cmd.crouch = true;
  // Round a corner of full cover: lean out to look and fight, back in to hide. A guard at a lean post, or a teammate
  // covering you from one while you open a case, leans out to watch (M55, audit AI-01).
  if (leaningOut(b)) cmd.lean = b.cover.lean;
  else if (b.mode === 'advance' && b.atPost) cmd.lean = b.holdLean;
  else if (b.mode === 'order' && b.orderCovering && b.orderLeanChecked) cmd.lean = b.orderLean;
  eyeOf(me, w.body, w.hits, myEye);
  const offAim = aimBot(b, w, target, myEye, aimAt, moving, cmd, dt);
  cmd.yaw = b.aim.yaw;
  cmd.pitch = b.aim.pitch;
  if (moving) {
    // World direction → command axes relative to the view as this tick's turn left it (AI-16: not last tick's view,
    // which walked a few degrees off while turning and judged the sprint gate late).
    const dir = b.moveDir;
    cmd.forward = -Math.sin(b.aim.yaw) * dir.x - Math.cos(b.aim.yaw) * dir.z;
    cmd.right = Math.cos(b.aim.yaw) * dir.x - Math.sin(b.aim.yaw) * dir.z;
    const calm = w.time - b.lastThreatAt > cfg.sprintWhenCalmFor;
    // Hurrying to an order (regroup, keeping up) sprints even with a fight just over, and through the small turns of
    // following someone (a looser forward gate), so it doesn't flick between run and sprint at each one.
    const hurry = b.mode === 'order' && b.orderRush;
    // A hunter (M46) runs at where the squad was, footsteps and all: it pushes. A patrol keeps to a run.
    const going = (b.mode === 'advance' && b.role !== 'patrol') || b.mode === 'flag' || (hunter && b.mode === 'search');
    cmd.sprint = hurry ? cmd.forward > SQUAD_ORDERS.sprintForward : going && (calm || hunter) && cmd.forward > cfg.sprintForward;
    // Closing in on where someone was seen or heard: walk, so footsteps don't give us away (not while trading, M38).
    cmd.walk ||= b.mode === 'search' && !trading && !hunter && Math.hypot(b.lastKnown.x - me.position.x, b.lastKnown.z - me.position.z) < b.skill.searchWalkDistance;
    if (b.careful) {
      cmd.walk = true;
      cmd.sprint = false;
    }
  }
  shootBot(b, w, target, myEye, aimAt, offAim, cmd, dt);
  reloadBot(b, w, cmd);
}
