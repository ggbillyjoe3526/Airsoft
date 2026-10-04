import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from './config/bots';
import { availableChoice, type ContentTag, tagOf } from './config/content';
import { DEFAULT_MATCH_RULES, type MatchRules, TEAM_SIZE_CHOICES, WINS_NEEDED_CHOICES } from './config/matchRules';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from './config/modes';
import { DEFAULT_MAP, MAPS, type MapId } from './map/maps';

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
 * saved pick is kept, so it comes back when Dev content is on again). Pure.
 */
export function playedPicks(p: NewGamePicks, devContent: boolean): NewGamePicks {
  const d = DEFAULT_MATCH_RULES;
  return {
    map: availableChoice(MAPS, p.map, devContent, DEFAULT_MAP),
    mode: availableChoice(MATCH_MODES, p.mode, devContent, DEFAULT_MODE),
    difficulty: availableChoice(DIFFICULTIES, p.difficulty, devContent, DEFAULT_DIFFICULTY),
    teammateDifficulty: availableChoice(TEAMMATE_DIFFICULTIES, p.teammateDifficulty, devContent, DEFAULT_DIFFICULTY),
    rules: {
      ...p.rules,
      winsNeeded: Number(availableChoice(WINS_NEEDED_CHOICES, String(p.rules.winsNeeded), devContent, String(d.winsNeeded))),
      teamSize: Number(availableChoice(TEAM_SIZE_CHOICES, String(p.rules.teamSize), devContent, String(d.teamSize))),
    },
  };
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
