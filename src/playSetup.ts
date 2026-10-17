import type { AudioEngine } from './audio/audioEngine';
import { soundscapeOf } from './audio/soundscape';
import type { DevSettings } from './config/dev';
import { ROUNDS } from './config/hits';
import type { LookSettings } from './config/look';
import { ARMORY_TEXT } from './config/menus';
import type { LightingPresetId } from './config/render';
import { DEFAULT_TEAM_PICK } from './config/teams';
import { mapUnderLighting, mapUnderPreset, playsAtNight } from './map/lightingChoice';
import { type MapId, mapData } from './map/maps';
import type { MapData } from './map/mapTypes';
import { type PracticePlaceId, practiceMapId } from './map/practicePlaces';
import { matchUsesDev, type NewGamePicks, playedPicks } from './newGamePicks';
import { contentPool } from './pool/contentPool';
import { GAME_POOL } from './pool/gamePool';
import type { ItemRef } from './pool/item';
import { gameOwnership, LoadoutModel } from './pool/loadoutModel';
import { GAME_LEVELS } from './progress/gameLevels';
import { standing } from './progress/levels';
import { loadProgress, type Progress, syncProgress } from './progress/progress';
import { hasSavedTeammateDifficulty, loadLightingPicks, loadLook, loadNewGamePicks, loadPracticePlace } from './settings/savedChoices';
import { loadoutTile } from './ui/loadoutChoice';
import type { MenuLevel, MenusOptions } from './ui/menus/menusOptions';

/** Where Practice plays (M94): a map, and the course its timed challenge's best is kept under. */
export interface PracticeAt {
  map: MapData;
  course: string;
}

/** The menus' screens that change what the next Play builds (New game, the Loadout, the Armory, Settings › Look). */
export type SetupMenus = Pick<
  MenusOptions,
  'rules' | 'loadout' | 'armory' | 'map' | 'practicePlace' | 'lighting' | 'mode' | 'difficulty' | 'teammateDifficulty' | 'team' | 'matchRules' | 'ruleset' | 'look'
>;

/**
 * What the next Play builds from (out of game.ts, DX8): New game's picks as they play, where Practice is played, each
 * map's Day or Night, the Look settings, and the Loadout with the level progress it is unlocked from. `setupChanged`
 * and `loadoutChanged` say the match (or the range) loaded was built from something else (core/sessionPlan.ts).
 */
export class PlaySetup {
  /** New game's choices (settings/savedChoices.ts loadNewGamePicks): the next Play builds the match from them (playedPicks). */
  readonly picks: NewGamePicks = loadNewGamePicks();
  /** Where Practice is played (M94): the range or a map, its own pick on the Match screen. */
  practicePlace: PracticePlaceId = loadPracticePlace();
  /** Each map's Day or Night pick (M34d). */
  readonly lighting: Partial<Record<MapId, LightingPresetId>> = loadLightingPicks();
  /** Settings › Look (G1): robots and Realistic colours, for the next match or range visit. */
  look: LookSettings = loadLook();
  /** The player's level progress (LV1): XP and what it unlocked; and their loadout built from it (M26b). */
  readonly progress: Progress = loadProgress(GAME_LEVELS);
  readonly loadout: LoadoutModel;
  /**
   * New game's choices (or the team colours) changed since the match was built: Play builds it again. Unchanged, a Play
   * clicked again after a refused mouse lock reuses the match already built (audit L-33).
   */
  setupChanged = false;
  /** The loadout changed since the range was built: Resume rebuilds it with the new one. */
  loadoutChanged = false;

  constructor(
    /** The sounds of the field New game would play are rendered ahead (prefetchFieldSounds). */
    private readonly audio: AudioEngine,
    /** The Dev settings in force (M24): Disable levelling, Dev content, Time of day. */
    private readonly dev: () => DevSettings,
  ) {
    const unlocks = { unlocked: () => this.progress.unlocked, levelOf: (id: string) => GAME_LEVELS.unlockLevel.get(id) };
    this.loadout = new LoadoutModel(GAME_POOL, gameOwnership(GAME_POOL, unlocks, () => this.dev().unlockAllGear, () => this.dev().devContent));
  }

  /** The kit or what it is built from changed: the next Play builds the match again, and Resume the range. */
  kitChanged(): void {
    this.loadoutChanged = this.setupChanged = true;
  }

  /** New game's picks as they play now (M35: a dev pick plays as its list's default while Dev content is off). */
  playedPicks(): NewGamePicks {
    return playedPicks(this.picks, this.dev().devContent);
  }

  /**
   * The map a match on `id` is built with: under its Day or Night pick (M34d), or under Dev settings › Time of day
   * (M90) on any map. The same object for the same choice, so the sounds prefetched and the meshes kept are its.
   */
  playedMap(id: MapId): MapData {
    const base = mapData(id);
    const timeOfDay = this.dev().timeOfDay;
    return timeOfDay === 'map' ? mapUnderLighting(base, this.lighting[id]) : mapUnderPreset(base, timeOfDay);
  }

  /**
   * Where Practice plays (M94): its picked map under the map's Day or Night pick (as a match's, playedMap), with the
   * map's id as its timed challenge's course; undefined for the range (also for a dev map while Dev content is off).
   */
  practiceAt(): PracticeAt | undefined {
    const id = practiceMapId(this.practicePlace, this.dev().devContent);
    return id ? { map: this.playedMap(id), course: id } : undefined;
  }

  /** Whether a match of `picks` with the Loadout as it is uses dev content (M35): it then won't count or give XP. */
  devContentUsed(picks: NewGamePicks): boolean {
    return matchUsesDev(picks, this.equippedItems(), GAME_POOL, this.dev().devContent, this.lighting[picks.map]);
  }

  /** Every item in the Loadout: each gear slot's replica and what is fitted to it (null for an empty slot). */
  private equippedItems(): (ItemRef | null)[] {
    return this.loadout.equipped().flatMap((r) => (r ? [r, ...Object.values(this.loadout.fitOf(r.asset))] : []));
  }

  /** The progress, with another tab's newer save taken first (it is shared, so it changes in place). */
  syncedProgress(): Progress {
    // Another tab's level may have unlocked something: the Loadout and the next match follow it.
    if (syncProgress(this.progress, GAME_LEVELS)) this.kitChanged();
    return this.progress;
  }

  /**
   * The field New game would play now, under its Day/Night pick, has its own sounds rendered in the spare time after the
   * title screen's (M65, audit AUD-01), so Play doesn't. Again on every map, lighting or Dev content change; a dev map
   * only while Dev content is on and it is the pick (playedPicks).
   */
  prefetchFieldSounds(): void {
    const id = this.playedPicks().map;
    // The same map object (and so the same soundscape) the match is built with (play).
    const map = this.playedMap(id);
    this.audio.prefetch(() => soundscapeOf(map, playsAtNight(map)));
  }

  /** The level badge on the top bar (LV1); none while levelling is off. */
  private menuLevel(): MenuLevel {
    if (this.dev().unlockAllGear) return null;
    const s = standing(GAME_LEVELS, this.progress.xp);
    return { level: s.level, into: s.into, next: s.next, toNext: s.next === null ? '' : ARMORY_TEXT.toNext(s.next - s.into, s.level + 1) };
  }

  /** What the menus' New game, Loadout, Armory and Look screens show and change here. */
  menuOptions(): SetupMenus {
    return {
      rules: { raiseTime: ROUNDS.flag.raiseTime },
      loadout: {
        model: this.loadout,
        onChange: () => this.kitChanged(),
        summary: () => loadoutTile(this.loadout),
      },
      armory: {
        // Dev gear shows on the level track only with Dev content on (M35).
        pool: () => contentPool(GAME_POOL, this.dev().devContent),
        levels: GAME_LEVELS,
        // Another tab's XP since this one read it is taken first (audit POOL-02).
        progress: () => this.syncedProgress(),
        levellingOff: () => this.dev().unlockAllGear,
        devContent: () => this.dev().devContent,
        level: () => this.menuLevel(),
      },
      map: { initial: this.picks.map, onChange: (m) => ((this.picks.map = m), (this.setupChanged = true), this.prefetchFieldSounds()) },
      practicePlace: { initial: this.practicePlace, onChange: (p) => (this.practicePlace = p) },
      lighting: { initial: this.lighting, onChange: (m, light) => ((this.lighting[m] = light), (this.setupChanged = true), this.prefetchFieldSounds()) },
      mode: {
        initial: this.picks.mode,
        onChange: (m) => ((this.picks.mode = m), (this.setupChanged = true)),
      },
      difficulty: { initial: this.picks.difficulty, onChange: (d) => ((this.picks.difficulty = d), (this.setupChanged = true)) },
      teammateDifficulty: { initial: this.picks.teammateDifficulty, follows: !hasSavedTeammateDifficulty(), onChange: (d) => ((this.picks.teammateDifficulty = d), (this.setupChanged = true)) },
      team: { initial: this.picks.team ?? DEFAULT_TEAM_PICK, onChange: (t) => ((this.picks.team = t), (this.setupChanged = true)) },
      matchRules: { initial: this.picks.rules, onChange: (m) => ((this.picks.rules = m), (this.setupChanged = true)) },
      ruleset: { initial: this.picks.ruleset, onChange: (r) => ((this.picks.ruleset = r), (this.setupChanged = true)) },
      // Built into the figures and replicas, so a change shows from the next match (on the range, from Resume).
      look: {
        initial: this.look,
        onChange: (look) => ((this.look = look), this.kitChanged()),
      },
    };
  }
}
