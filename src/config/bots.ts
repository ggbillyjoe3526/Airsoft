import type { NightSightConfig } from '../map/nightSight';
import type { ContentTag } from './content';
import type { SightId } from './optics';
import { BOT_EXTRACTION } from './botsExtraction';
import { BOT_MOVEMENT } from './botsMovement';
import { BOT_SENSES } from './botsSenses';
import { BOT_SKILL, type BotSkill, type Difficulty } from './botsSkill';
import { BOT_SQUAD } from './botsSquad';

// Split by concern (DX7); every importer still imports from here.
export * from './botsSkill';

/**
 * Bot behaviour tuning shared by every difficulty level (the skill per level is BOT_SKILL, config/botsSkill.ts).
 * Bots play through the same commands as the player and have human limits: they only know what
 * they've seen or heard, react after a delay, turn at a finite speed and aim with an error that
 * settles over time. Ranges are [min, max], picked at random (seeded) each time.
 */
export const BOT_BEHAVIOUR = {
  // By concern, in this order (DX7): senses, reaction and firing; movement and cover; team play, routes, the flag and
  // Pro's tuning; Extraction. Each file's own comments say what each number does.
  ...BOT_SENSES,
  ...BOT_MOVEMENT,
  ...BOT_SQUAD,
  ...BOT_EXTRACTION,
  /** At most this many route searches per simulation tick, shared by all bots. */
  pathsPerTick: 1,
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends readonly [number, number] ? readonly [number, number] : number };

/**
 * Difficulty levels in the order the Difficulty pop-up lists them, with their labels and content tags (M35,
 * config/content.ts: a `dev` level, as Pro is while it is built, is offered only with Dev content on).
 */
export const DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string; tag: ContentTag }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, shaky aim. Learn the map.', tag: 'public' },
  { id: 'normal', label: 'Normal', blurb: 'A fair fight: their first BBs up close can miss.', tag: 'public' },
  { id: 'hard', label: 'Hard', blurb: 'Quick and steady, each on kit of its own. Get seen first and you\'re out.', tag: 'public' },
  { id: 'pro', label: 'Pro', blurb: 'Tournament-sharp: patient, accurate and well kitted. Slow down and slice every corner.', tag: 'dev' },
];

/** The same levels as the Difficulty pop-up's Teammates row describes them (M20), with the same tags. */
export const TEAMMATE_DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string; tag: ContentTag }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, shaky aim: you carry the team.', tag: 'public' },
  { id: 'normal', label: 'Normal', blurb: 'They hold their own in a fair fight.', tag: 'public' },
  { id: 'hard', label: 'Hard', blurb: 'Quick and steady: they win fights for you.', tag: 'public' },
  { id: 'pro', label: 'Pro', blurb: 'Patient and accurate: they hold their angles and win their duels.', tag: 'dev' },
];

/** True when `d` is `min` or above, in the Difficulty pop-up's order (Easy, Normal, Hard, Pro). */
export function difficultyAtLeast(d: Difficulty, min: Difficulty): boolean {
  return DIFFICULTY_RANK[d] >= DIFFICULTY_RANK[min];
}

const DIFFICULTY_RANK = Object.fromEntries(DIFFICULTIES.map((o, i) => [o.id, i])) as Readonly<Record<Difficulty, number>>;

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

/**
 * Your bot teammates' level until you pick one (audit AI-03): the opponents' level, as every bot had before M20, except
 * that Easy opponents give you Normal teammates. A new player on Easy needs teammates who win their fights, and Easy
 * against Easy plays the longest rounds.
 */
export function defaultTeammateDifficulty(opponents: Difficulty): Difficulty {
  return opponents === 'easy' ? DEFAULT_DIFFICULTY : opponents;
}

/** The behaviour tuning every bot shares, whatever its level (BOT_BEHAVIOUR's shape). */
export type BotBehaviour = Widen<typeof BOT_BEHAVIOUR>;

/** Everything a bot's decisions are tuned by: shared behaviour plus one difficulty's skill. */
export type BotConfig = BotBehaviour & BotSkill;

/** The full bot tuning for a difficulty level. */
export function botConfig(difficulty: Difficulty): BotConfig {
  return { ...BOT_BEHAVIOUR, ...BOT_SKILL[difficulty] };
}

/** Bots at the default difficulty: the reference bot for tests and tuning docs. */
export const BOTS: BotConfig = botConfig(DEFAULT_DIFFICULTY);

/**
 * How far bots make someone out on a night field (M33g, map/nightSight.ts; the concept's first guesses, the same as
 * players by eye): 40 m in a light pool (as by day), 25 m in the moonlit open, 10 m under the trees. The target's light
 * decides; `viewDistance` still caps it. Ground is under the trees where 3 trunks stand within 4 m (on a 1 m grid). A lit
 * weapon torch (M33h) gives its holder away from `lit` to anyone within 60° of where it points (its lens and spill
 * read from well off its axis), and lights whoever its beam falls on like a light pool.
 * On floors (M34e): a pool lights its own floor, feet from 0.5 m under it to 2 m over it (on terrain the floor is the
 * ground underfoot, so all of a camp fire's slope; never the next storey 3 m up); and feet with a block's underside 1.9 to 9.5 m over them are indoors (a doorway's
 * lintel, a floor, a roof up to three storeys over a stairwell or an atrium, a bridge over a street), seen from 15 m
 * when no pool lights them: darker than the moonlit open, lighter than the woods (the city's glow through the windows).
 * Measured on Neon Heights by Night over seeds 1-48 (2026-10-05): indoors at 10 m the west end won 61 % of Elimination,
 * at 15 m 48 %, at 18 m 44 %.
 */
export const NIGHT_SIGHT: NightSightConfig = {
  lit: 40,
  open: 25,
  canopy: 10,
  indoor: 15,
  canopyTrees: 3,
  canopyRadius: 4,
  canopyCell: 1,
  poolBelow: 0.5,
  poolAbove: 2,
  roofFrom: 1.9,
  roofTo: 9.5,
  torchSeenFromDeg: 60,
};

/**
 * How bots work their weapon torch on a night field (M33h, ai/botTorch.ts; every bot carries one there, pool/botKit.ts
 * botLight). On for the last stretch of a search (BotSkill.searchWalkDistance from where it last knew of someone) and
 * while fighting someone within `fightReach` metres (and the beam's reach); off while advancing and on the way to a
 * search (Easy: on; BotSkill.torchOnTheMove), in cover, at the pole and on squad orders. A state is held at least
 * `minHold` seconds, so the beam never strobes as the bot's mode flickers. First guesses for the owner's playtest.
 *
 * `fightReach` (M71): a beam switched on for a fight 20–40 m away lit its bot for every defender in the fort and lit
 * little it needed; Woodland Hard attackers won 28 % of Attack / Defend rounds with it at the beam's 40 m, 48 % at 20 m.
 */
export const BOT_TORCH = { minHold: 1.5, fightReach: 20 } as const;

/**
 * How the sight on a bot's replica changes its aim (BG1, ai/aim.ts sightAim): bots fire from the hip, but they aim as
 * a player looking through that sight would. Each number multiplies the difficulty's own (BotSkill): `settled` its
 * settled error (aimErrorSettledDeg: a magnified picture is aimed finer), `settleTime` how long a new target's aim takes
 * to settle (aimSettleTime: a heavier optic is slower to bring up, OPTICS raiseScale), `close` how far off its first aim
 * can be up close (aimErrorStartMetres: through a narrow view a near target fills the eyepiece and is hard to find),
 * and `tracking` its error on someone crossing its view (aimErrorTracking: a narrow view loses them). Its error while it
 * moves stays the difficulty's (bots strafe as they fight, so a penalty there would cancel what the sight is for). A
 * sight never changes what a bot sees or hears: difficulty is never different senses (DECISIONS). Iron sights are 1
 * throughout. First guesses for the owner's playtest.
 */
export interface BotSightAim {
  settled: number;
  settleTime: number;
  close: number;
  tracking: number;
}

export const BOT_SIGHT_AIM: Readonly<Record<SightId, BotSightAim>> = {
  iron: { settled: 1, settleTime: 1, close: 1, tracking: 1 },
  // A clear dot to put on the target, no magnifier and no slower raise: a little finer, a little quicker.
  redDot: { settled: 0.85, settleTime: 0.9, close: 1, tracking: 1 },
  // Twice the picture: much finer at range and a little slower to bring up, but up close it is slow to find someone and
  // it loses someone crossing its view.
  scope2x: { settled: 0.6, settleTime: 1.1, close: 1.4, tracking: 1.5 },
};

/**
 * How much more often a bot picks a kit in bot-kits.md whose Suits column names its personality than the other kits with
 * Suits (BG1, with the bot personalities; pool/botKit.ts kitWeights). Kits with no Suits (the Factory) keep their chance,
 * and a kit weighted 0 for the bot's level stays 0, so leaning never changes how often a level carries gear, nor brings
 * a kit (or dev gear) a level wouldn't carry. A first guess for the owner's playtest.
 */
export const BOT_KIT_SUIT_LEAN = 3;
