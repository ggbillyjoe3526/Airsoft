import { BOT_LOADOUTS, DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from './config/bots';
import { availableChoice, type ContentTag, tagOf } from './config/content';
import { squadSize } from './config/extraction';
import { DEFAULT_MATCH_RULES, type MatchRules, TEAM_SIZE_CHOICES, WINS_NEEDED_CHOICES } from './config/matchRules';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from './config/modes';
import { LOADOUT } from './config/replicas';
import { DEFAULT_MAP, MAPS, type MapId, mapData, teamSizeOn } from './map/maps';
import { modeOffered } from './map/playableMode';
import { rolledKitMayHoldDev } from './pool/botKit';
import type { ItemRef } from './pool/collection';
import { itemsUseDev } from './pool/contentPool';
import { type Pool, replicaOf } from './pool/pool';

/** New game's picks: the Map, Mode, Match and Difficulty pop-ups. */
export interface NewGamePicks {
  map: MapId;
  mode: MatchMode;
  difficulty: Difficulty;
  teammateDifficulty: Difficulty;
  rules: MatchRules;
}

/**
 * The picks as they play (M35): while Dev content is off, each pick of dev content plays as its list's default (the
 * saved pick is kept, so it comes back when Dev content is on again); so does a mode the map doesn't offer (M43). Pure.
 */
export function playedPicks(p: NewGamePicks, devContent: boolean): NewGamePicks {
  const d = DEFAULT_MATCH_RULES;
  const map = availableChoice(MAPS, p.map, devContent, DEFAULT_MAP);
  const mode = availableChoice(MATCH_MODES, p.mode, devContent, DEFAULT_MODE);
  return {
    map,
    // A mode the map doesn't offer (Extraction without its data, M43) plays as the default, like a dev pick.
    mode: modeOffered(mapData(map), mode) ? mode : DEFAULT_MODE,
    difficulty: availableChoice(DIFFICULTIES, p.difficulty, devContent, DEFAULT_DIFFICULTY),
    teammateDifficulty: availableChoice(TEAMMATE_DIFFICULTIES, p.teammateDifficulty, devContent, DEFAULT_DIFFICULTY),
    rules: {
      ...p.rules,
      winsNeeded: Number(availableChoice(WINS_NEEDED_CHOICES, String(p.rules.winsNeeded), devContent, String(d.winsNeeded))),
      teamSize: Number(availableChoice(TEAM_SIZE_CHOICES, String(p.rules.teamSize), devContent, String(d.teamSize))),
    },
  };
}

/**
 * Players a side the picks play with: the team size, at most what the map has room for (M33), and in an Extraction run
 * on a map with its data at most a trio (M43).
 */
export function playedTeamSize(p: Pick<NewGamePicks, 'map' | 'mode' | 'rules'>): number {
  const size = teamSizeOn(p.map, p.rules.teamSize);
  return p.mode === 'extraction' && mapData(p.map).extraction ? squadSize(size) : size;
}

/** The content tags of what the picks play: the map, the mode, both difficulties and the tagged Match pop-up choices. */
export function pickTags(p: NewGamePicks): ContentTag[] {
  return [
    tagOf(MAPS, p.map),
    tagOf(MATCH_MODES, p.mode),
    tagOf(DIFFICULTIES, p.difficulty),
    // A 1v1 has no teammates, so their level plays no part.
    p.rules.teamSize > 1 ? tagOf(TEAMMATE_DIFFICULTIES, p.teammateDifficulty) : 'public',
    tagOf(WINS_NEEDED_CHOICES, String(p.rules.winsNeeded)),
    tagOf(TEAM_SIZE_CHOICES, String(p.rules.teamSize)),
  ];
}

/** Whether the picks (as played) use dev content: such a match stays out of the records and pays no Field Credits. */
export function picksUseDev(p: NewGamePicks): boolean {
  return pickTags(p).includes('dev');
}

/**
 * Whether the opponents may carry dev gear (M35): only with Dev content on, on a difficulty that rolls their kits
 * (config/bots.ts BOT_LOADOUTS), when the pool has dev gear such a kit could hold: LOADOUT's replicas, or a chase
 * replica the player owns (`chaseOwned`, M32: one opponent now and then carries it). Counted whether or not a bot rolls
 * it, so New game can say so before the match. Teammates carry LOADOUT as it comes, which is public.
 */
export function botsMayCarryDev(pool: Pool, devContent: boolean, difficulty: Difficulty, chaseOwned: readonly string[] = []): boolean {
  if (!devContent || BOT_LOADOUTS[difficulty] !== 'random') return false;
  const chase = chaseOwned.flatMap((id) => {
    const asset = pool.byId.get(id);
    return asset?.category === 'replica' ? [replicaOf(asset)] : [];
  });
  return rolledKitMayHoldDev(pool, [...LOADOUT, ...chase]);
}

/**
 * Whether a match uses dev content (M35): its picks (as played), the player's kit (`kit`: the Loadout's items) or the
 * opponents' possible gear (`chaseOwned` as in botsMayCarryDev). Such a match stays out of the records and pays no
 * Field Credits.
 */
export function matchUsesDev(picks: NewGamePicks, kit: readonly (ItemRef | null)[], pool: Pool, devContent: boolean, chaseOwned: readonly string[] = []): boolean {
  return picksUseDev(picks) || itemsUseDev(pool, kit) || botsMayCarryDev(pool, devContent, picks.difficulty, chaseOwned);
}
