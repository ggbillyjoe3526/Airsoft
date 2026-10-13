import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from './config/bots';
import { availableChoice, type ContentTag, tagOf } from './config/content';
import { squadSize } from './config/extraction';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET, type MatchRules, RULESETS, type RulesetId, rulesetFits, rulesForMode, rulesUnder, TEAM_SIZE_CHOICES, WINS_NEEDED_CHOICES } from './config/matchRules';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from './config/modes';
import type { LightingPresetId } from './config/render';
import { DEFAULT_TEAM_PICK, type TeamPickId } from './config/teams';
import { playsAtNight as nightOf } from './map/lightingChoice';
import { DEFAULT_MAP, MAPS, type MapId, mapData, mapEntry, mapLoaded, teamSizeOn } from './map/maps';
import { modeOffered } from './map/playableMode';
import { botLight, type BotKitTable, kitsMayHoldDev } from './pool/botKit';
import type { ItemRef } from './pool/item';
import { contentPool, itemsUseDev } from './pool/contentPool';
import { GAME_BOT_KITS } from './pool/gameBotKits';
import type { Pool } from './pool/pool';

/** New game's picks: the Map, Mode, Match (with its Rules row, M39) and Difficulty pop-ups. */
export interface NewGamePicks {
  map: MapId;
  mode: MatchMode;
  difficulty: Difficulty;
  teammateDifficulty: Difficulty;
  /** Your team (M98): Alpha or Beta; absent, Alpha. An Extraction run has no pick: its squad plays as Alpha. */
  team?: TeamPickId;
  /** The Rules picker's ruleset (M39). */
  ruleset: RulesetId;
  /** The Match pop-up's picks; as played (playedPicks), with the ruleset's own switches over them (rulesUnder). */
  rules: MatchRules;
}

/**
 * The picks as they play (M35): while Dev content is off, each pick of dev content plays as its list's default (the
 * saved pick is kept, so it comes back when Dev content is on again); so does a mode the map doesn't offer (M43) and a
 * ruleset the mode doesn't fit (M89). The rules are the ruleset's (M39), with the rows the mode ignores at its standard
 * (M89). Pure.
 */
export function playedPicks(p: NewGamePicks, devContent: boolean): NewGamePicks {
  const d = DEFAULT_MATCH_RULES;
  // A dev map whose data hasn't arrived yet (M50, map/maps.ts loadDevMaps) plays as the default too.
  const offered = availableChoice(MAPS, p.map, devContent, DEFAULT_MAP);
  const map = mapLoaded(offered) ? offered : DEFAULT_MAP;
  const picked = availableChoice(MATCH_MODES, p.mode, devContent, DEFAULT_MODE);
  // A mode the map doesn't offer (Extraction without its data, M43) plays as the default, like a dev pick.
  const mode = modeOffered(mapData(map), picked) ? picked : DEFAULT_MODE;
  // A ruleset the mode doesn't fit (Tournament in Extraction, M89) plays as the default too, and so does a row it ignores.
  const offeredRuleset = availableChoice(RULESETS, p.ruleset, devContent, DEFAULT_RULESET);
  const ruleset = rulesetFits(mode, offeredRuleset) ? offeredRuleset : DEFAULT_RULESET;
  return {
    map,
    mode,
    difficulty: availableChoice(DIFFICULTIES, p.difficulty, devContent, DEFAULT_DIFFICULTY),
    teammateDifficulty: availableChoice(TEAMMATE_DIFFICULTIES, p.teammateDifficulty, devContent, DEFAULT_DIFFICULTY),
    // An Extraction run's squad is Alpha (M98: no pick there); the saved pick stays for the other modes.
    team: mode === 'extraction' ? DEFAULT_TEAM_PICK : (p.team ?? DEFAULT_TEAM_PICK),
    ruleset,
    rules: rulesForMode(
      mode,
      ruleset,
      rulesUnder(ruleset, {
        ...p.rules,
        winsNeeded: Number(availableChoice(WINS_NEEDED_CHOICES, String(p.rules.winsNeeded), devContent, String(d.winsNeeded))),
        teamSize: Number(availableChoice(TEAM_SIZE_CHOICES, String(p.rules.teamSize), devContent, String(d.teamSize))),
      }),
    ),
  };
}

/**
 * Players a side the picks play with: the team size, within what the map offers (M33; Woodland 5v5 or 6v6, M88), and in
 * an Extraction run on a map with its data a squad of at most a trio (M43), which the map's least team size doesn't
 * raise.
 */
export function playedTeamSize(p: Pick<NewGamePicks, 'map' | 'mode' | 'rules'>): number {
  if (p.mode === 'extraction' && mapData(p.map).extraction) return squadSize(Math.min(p.rules.teamSize, mapEntry(p.map).teamSize.max));
  return teamSizeOn(p.map, p.rules.teamSize);
}

/** The content tags of what the picks play: the map, the mode, both difficulties, the ruleset and the tagged Match pop-up choices. */
export function pickTags(p: NewGamePicks): ContentTag[] {
  return [
    tagOf(MAPS, p.map),
    tagOf(MATCH_MODES, p.mode),
    tagOf(DIFFICULTIES, p.difficulty),
    tagOf(RULESETS, p.ruleset),
    // A 1v1 has no teammates, so their level plays no part.
    p.rules.teamSize > 1 ? tagOf(TEAMMATE_DIFFICULTIES, p.teammateDifficulty) : 'public',
    tagOf(WINS_NEEDED_CHOICES, String(p.rules.winsNeeded)),
    tagOf(TEAM_SIZE_CHOICES, String(p.rules.teamSize)),
  ];
}

/** Whether the picks (as played) use dev content: such a match stays out of the records and gives no XP. */
export function picksUseDev(p: NewGamePicks): boolean {
  return pickTags(p).includes('dev');
}

/**
 * Whether the opponents may carry dev gear (M35): only with Dev content on, when a kit the difficulty weights in
 * bot-kits.md (`kits`, BG1) holds an asset `pool` tags dev. Counted whether or not a bot picks it, so New game can say
 * so before the match. Teammates carry LOADOUT as it comes, which is public.
 */
export function botsMayCarryDev(pool: Pool, devContent: boolean, difficulty: Difficulty, kits: BotKitTable = GAME_BOT_KITS): boolean {
  return devContent && kitsMayHoldDev(kits, difficulty, pool);
}

/**
 * Whether map `id` is played at night (M33h) under its Day/Night pick `lighting` (M34d): the picked preset's `night`, not
 * the map's own flag.
 */
export function playsAtNight(id: MapId, lighting?: LightingPresetId | null): boolean {
  return nightOf(mapData(id), lighting);
}

/**
 * The items of `kit` that count as used (M33h): a weapon light does nothing by day (it isn't fitted then), so a fitted
 * dev torch counts only on a night field; Depot by day with Dev content on pays as before.
 */
export function usedItems(pool: Pool, kit: readonly (ItemRef | null)[], night: boolean): (ItemRef | null)[] {
  return night ? [...kit] : kit.filter((r) => r === null || pool.byId.get(r.asset)?.category !== 'light');
}

/** Whether the bots carry a dev torch (M33h): every bot carries the offered light on a night field (pool/botKit.ts botLight). */
export function botsCarryDevLight(pool: Pool, devContent: boolean, night: boolean): boolean {
  if (!night) return false;
  const shown = contentPool(pool, devContent);
  const light = botLight(shown);
  return light !== null && shown.assets.some((a) => a.category === 'light' && a.key === light && a.tag === 'dev');
}

/**
 * Whether a match uses dev content (M35): its picks (as played), the player's kit (`kit`: the Loadout's items; a light
 * only at night, M33h) or the opponents' possible gear (botsMayCarryDev; the bots' torches at night). Night is under
 * the map's Day/Night pick `lighting` (M34d). Such a match stays out of the records and gives no XP. Under
 * the factory kit rule (M39) everyone carries LOADOUT as it comes, torchless, so neither kit counts.
 */
export function matchUsesDev(picks: NewGamePicks, kit: readonly (ItemRef | null)[], pool: Pool, devContent: boolean, lighting?: LightingPresetId | null): boolean {
  if (picksUseDev(picks)) return true;
  if (picks.rules.factoryKit) return false;
  const night = playsAtNight(picks.map, lighting);
  return itemsUseDev(pool, usedItems(pool, kit, night)) || botsMayCarryDev(pool, devContent, picks.difficulty) || botsCarryDevLight(pool, devContent, night);
}
