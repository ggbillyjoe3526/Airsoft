import { type Difficulty, defaultTeammateDifficulty } from '../../config/bots';
import type { MatchRules, RulesetId } from '../../config/matchRules';
import type { MatchMode } from '../../config/modes';
import type { LightingPresetId } from '../../config/render';
import type { TeamPickId } from '../../config/teams';
import { lightingPicked } from '../../map/lightingChoice';
import { type MapId, mapData, mapEntry } from '../../map/maps';
import { DEFAULT_PRACTICE_PLACE, type PracticePlaceId } from '../../map/practicePlaces';
import type { NewGamePicks } from '../../newGamePicks';
import { saveSetting } from '../../settings/storage';
import type { PlayModel } from './setupScreen';

/** What the picks report to the game, and the views to redraw after a change (the menus' own). */
export interface PlayPicksHooks {
  onMap: (m: MapId) => void;
  /** Where Practice is played (M94): the cards have saved it. */
  onPracticePlace?: (p: PracticePlaceId) => void;
  onLight: (m: MapId, light: LightingPresetId) => void;
  onMode: (m: MatchMode) => void;
  onRuleset: (r: RulesetId) => void;
  onRules: (rules: MatchRules) => void;
  onDifficulty: (d: Difficulty) => void;
  onTeammates: (d: Difficulty) => void;
  onTeam: (t: TeamPickId) => void;
  /** The screens again, after a pick. */
  refresh: () => void;
}

/**
 * The Match screen's model (M100, out of menus.ts): the picks as made, each change saved and reported to the game. A
 * dev pick stays as picked (`NewGamePicks`; playedPicks says how it plays). Until a teammate level is picked and saved,
 * teammates follow the opponents' level, as every bot did before M20.
 */
export class PlayPicks implements PlayModel {
  private teammatesFollow: boolean;

  constructor(
    private readonly picked: NewGamePicks,
    private readonly lightingPicks: Partial<Record<MapId, LightingPresetId>>,
    teammatesFollow: boolean,
    private readonly hooks: PlayPicksHooks,
    private place: PracticePlaceId = DEFAULT_PRACTICE_PLACE,
  ) {
    this.teammatesFollow = teammatesFollow;
  }

  picks(): Readonly<NewGamePicks> {
    return this.picked;
  }

  /** Where Practice is played (M94): the range, or a map (as picked: a dev map stays picked while Dev content is off). */
  practicePlace(): PracticePlaceId {
    return this.place;
  }

  /** A place for Practice was picked (M94): kept apart from the match's map, so practising never changes the match. */
  setPracticePlace(id: PracticePlaceId): void {
    this.place = id;
    this.hooks.onPracticePlace?.(id);
    this.hooks.refresh();
  }

  /** The light `id` plays under (M34d): its saved pick if it offers it, else its first preset. */
  lightingOf(id: MapId): LightingPresetId {
    return lightingPicked(mapData(id), this.lightingPicks[id]);
  }

  /** A map was picked: the team size becomes the map's own (Depot 3v3, Woodland 5v5, M33, M88), and is saved. */
  setMap(id: MapId): void {
    this.picked.map = id;
    this.hooks.onMap(id);
    const size = mapEntry(id).teamSize.standard;
    if (this.picked.rules.teamSize !== size) {
      this.picked.rules.teamSize = size;
      saveSetting('teamSize', String(size));
      this.hooks.onRules({ ...this.picked.rules });
    }
    this.hooks.refresh();
  }

  setLight(id: MapId, light: LightingPresetId): void {
    if (this.lightingOf(id) === light) return;
    this.lightingPicks[id] = light;
    saveSetting(`lighting.${id}`, light);
    this.hooks.onLight(id, light);
    this.hooks.refresh();
  }

  setMode(mode: MatchMode): void {
    this.picked.mode = mode;
    this.hooks.onMode(mode);
    this.hooks.refresh();
  }

  setRuleset(r: RulesetId): void {
    this.picked.ruleset = r;
    this.hooks.onRuleset(r);
    this.hooks.refresh();
  }

  setRules(rules: MatchRules): void {
    Object.assign(this.picked.rules, rules);
    this.hooks.onRules({ ...this.picked.rules });
    this.hooks.refresh();
  }

  setDifficulty(d: Difficulty): void {
    this.picked.difficulty = d;
    this.hooks.onDifficulty(d);
    if (this.teammatesFollow) {
      this.picked.teammateDifficulty = defaultTeammateDifficulty(d);
      this.hooks.onTeammates(this.picked.teammateDifficulty);
    }
    this.hooks.refresh();
  }

  /** Your team (M98): the picker has saved it; the rules text and "Your match" follow. */
  setTeam(t: TeamPickId): void {
    this.picked.team = t;
    this.hooks.onTeam(t);
    this.hooks.refresh();
  }

  setTeammates(d: Difficulty): void {
    this.teammatesFollow = false;
    this.picked.teammateDifficulty = d;
    this.hooks.onTeammates(d);
    this.hooks.refresh();
  }
}
