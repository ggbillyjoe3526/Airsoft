import type { BotSkill } from '../config/bots';
import { NEUTRAL_STYLE, type PersonalityStyle } from '../config/botsFile';
import { isInPlay } from '../sim/elimination';
import type { Bot, BotWorld } from './bot';
import { clamp01 } from '../core/math';

/**
 * Bot personalities (BN1, bots.md): how a bot plays on top of its difficulty. A personality scales the difficulty's
 * habits (pauses, cover, searching, bursts, angles and corners) into the bot's own BotSkill once, when the bot is made,
 * and leaves its senses, reaction, turning and aim as the level has them; the habits no level has (pushing in, keeping
 * its own lane, holding short of the middle, aiming from cover) are read from `Bot.style` where they apply. Pure.
 */

/** Who a bot is this match: its name and the personality that name plays (ai/botRoster.ts drawIdentities). */
export interface BotIdentity {
  readonly name: string;
  /** The personality's key (bots.md, lower case): "rusher". */
  readonly personality: string;
  readonly style: PersonalityStyle;
}

const scaled = (r: readonly [number, number], k: number): readonly [number, number] => (k === 1 ? r : [r[0] * k, r[1] * k]);

/**
 * `skill` with `style` laid over it. Reaction, turning, aim error, leading and the team and map habits (teamPlay,
 * huntsMiddle, huntMemory, keepsDark, the Extraction numbers) are the level's, whatever the personality. So is the
 * pause at a point (holdTime): the personality's scale is laid on where a bot with no run job pauses (botMovement.ts
 * startHold), so a patrol keeps its job's rhythm and its partner.
 */
export function personalSkill(skill: BotSkill, style: PersonalityStyle): BotSkill {
  if (style === NEUTRAL_STYLE) return skill;
  return {
    ...skill,
    holdCoverChance: clamp01(skill.holdCoverChance * style.holdCoverChance),
    contactCoverMinDistance: skill.contactCoverMinDistance * style.contactCoverMinDistance,
    searchWalkDistance: skill.searchWalkDistance * style.searchWalkDistance,
    flankChance: clamp01(skill.flankChance + style.flankChance),
    burst: scaled(skill.burst, style.burst),
    burstPause: scaled(skill.burstPause, style.burstPause),
    peekWatchTime: style.peekWatchTime ?? skill.peekWatchTime,
    holdsAngles: style.holdsAngles ?? skill.holdsAngles,
    slicesCorners: style.slicesCorners ?? skill.slicesCorners,
  };
}

/**
 * Pushes in (M46's hunters, and a personality that does): closes in on its target as it sidesteps, takes no cover on a
 * fresh contact and runs at where someone was. Not on a run's job (a guard holds its case, a patrol keeps with its
 * partner, and a rusher sent hunting pushes as every hunter does), nor under your order: it does what you asked.
 */
export function pushesIn(b: Bot): boolean {
  return b.role === 'hunter' || (b.style.pushesIn && b.role === 'none' && b.order === 'none');
}

/**
 * An anchor holding (bots.md › Holds until): in Elimination, on its lane and under no squad order, while the round clock
 * is above the personality's mark and a teammate is still in play. It stops at the last lane point short of the middle
 * (RoundPlanner.plan, ai/roundPlanner.ts) and holds there as a defender holds its post. Not once it hunts (BP5): a squad order ended
 * mid-round, or the late push, sends it hunting from where it is, and it stood there instead until its mark.
 */
export function anchorHolding(b: Bot, w: BotWorld): boolean {
  const until = b.style.holdUntil;
  if (until === null || b.hunting || b.role !== 'none' || b.order !== 'none' || w.round.mode !== 'elimination' || w.round.clock <= until) return false;
  const me = b.character;
  for (const c of w.characters) if (c !== me && c.team === me.team && isInPlay(c)) return true;
  return false;
}

/**
 * Watching the overtime flag first (bots.md › Habits › Watches the flag first, Dev 6 item 45): from the moment it would
 * go for the flag (Bot.overtimeAt) and for the personality's seconds, it holds cover by the flag, aiming at it, as the
 * attackers' guards hold the pole. Not under a squad order, nor once overtimeGoBy or less of the overtime is left, nor
 * when it is the last of its team in play: then it goes in for the touch.
 */
export function overtimeWatching(b: Bot, w: BotWorld): boolean {
  const watch = b.style.overtimeWatch;
  const flag = w.round.overtimeFlag;
  if (watch === null || !flag.up || b.order !== 'none' || w.time >= b.overtimeAt + watch || flag.left <= w.cfg.overtimeGoBy) return false;
  const me = b.character;
  for (const c of w.characters) if (c !== me && c.team === me.team && isInPlay(c)) return true;
  return false;
}
