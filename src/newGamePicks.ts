import { BOT_LOADOUTS, DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from './config/bots';
import { availableChoice, type ContentTag, tagOf } from './config/content';
import { DEFAULT_MATCH_RULES, type MatchRules, TEAM_SIZE_CHOICES, WINS_NEEDED_CHOICES } from './config/matchRules';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from './config/modes';
import { LOADOUT } from './config/replicas';
import { DEFAULT_MAP, mapData, MAPS, type MapId } from './map/maps';
import { botLight, rolledKitMayHoldDev } from './pool/botKit';
import type { ItemRef } from './pool/collection';
import { contentPool, itemsUseDev } from './pool/contentPool';
import { type Pool, replicaOf } from './pool/pool';
import { resolveLighting } from './render/lightingPreset';

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
 * Whether map `id` is played at night (M33h): its resolved lighting preset's `night`, so a Day/Night pick (M34) decides
 * it, not the map's own flag.
 */
export function playsAtNight(id: MapId): boolean {
  return resolveLighting(mapData(id)).night;
}

/**
 * The items of `kit` that count as used (M33h): a weapon light does nothing by day (only its lens glows), so a fitted
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
 * only at night, M33h) or the opponents' possible gear (`chaseOwned` as in botsMayCarryDev; the bots' torches at
 * night). Such a match stays out of the records and pays no Field Credits.
 */
export function matchUsesDev(picks: NewGamePicks, kit: readonly (ItemRef | null)[], pool: Pool, devContent: boolean, chaseOwned: readonly string[] = []): boolean {
  const night = playsAtNight(picks.map);
  return (
    picksUseDev(picks) ||
    itemsUseDev(pool, usedItems(pool, kit, night)) ||
    botsMayCarryDev(pool, devContent, picks.difficulty, chaseOwned) ||
    botsCarryDevLight(pool, devContent, night)
  );
}
