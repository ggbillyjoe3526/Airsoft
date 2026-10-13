import { DIFFICULTIES, type Difficulty } from '../../config/bots';
import { countsForRecords, CUSTOM_RULES_PAY_CAP, DEFAULT_RULESET, matchRulesSummary, recordsKeyOf, roundRulesFor, runRulesSummary, type RulesetId, rulesetOf, standardMatchText } from '../../config/matchRules';
import { squadSize } from '../../config/extraction';
import { mapStillFile } from '../../config/menuArt';
import { PLAY_TEXT } from '../../config/menus';
import { MATCH_MODES } from '../../config/modes';
import { DEFAULT_TEAM_PICK, TEAMS, teamOfPick } from '../../config/teams';
import type { LightingPresetId } from '../../config/render';
import { LIGHTING_LABELS, lightingChoices } from '../../map/lightingChoice';
import { type MapId, mapData, mapEntry } from '../../map/maps';
import { type NewGamePicks, playedPicks, playedTeamSize } from '../../newGamePicks';
import { menuArt } from './chrome';
import type { MenusOptions } from './menus';
import { describeRules, sideText } from './rulesText';
import type { PlayView } from './setupScreen';

/**
 * What the Play screen and the title's next match show (G3, out of menus.ts): the match as it will play, worked out
 * from the picks, and the notes under its rules saying why it won't count, if it won't. Pure apart from reading the
 * options' getters; nothing here runs per frame.
 */

/** The match as it will play: dev content's picks play as their defaults while Dev content is off (M35). */
export function playView(picked: NewGamePicks, opts: Pick<MenusOptions, 'rules' | 'dev' | 'loadout'>, lightingOf: (id: MapId) => LightingPresetId): PlayView {
  const devContent = opts.dev.devContent();
  const played = playedPicks(picked, devContent);
  // Each map offers as many players a side as it has room for (Depot up to 3v3, Woodland 5v5 or 6v6, M33, M88).
  // An Extraction run takes a squad of at most three (M43).
  const map = mapEntry(played.map);
  const run = played.mode === 'extraction' ? mapData(map.id).extraction : undefined;
  const sizeMax = run ? squadSize(map.teamSize.max) : map.teamSize.max;
  // Woodland offers only 5v5 and 6v6 (owner, 2026-10-06, M88); a run's squad may be smaller.
  const sizeMin = run ? 1 : map.teamSize.min;
  const m = { ...played.rules, teamSize: playedTeamSize(played) };
  const light = lightingOf(map.id);
  // A map that offers Day and Night names the one picked (M34d).
  const lightLine = lightingChoices(mapData(map.id)).length > 1 ? ` · ${LIGHTING_LABELS[light]}` : '';
  const still = mapStillFile(map.id, light);
  const match = run ? runRulesSummary(m, run, played.difficulty) : matchRulesSummary(m, played.mode);
  const opponents = difficultyLabel(played.difficulty);
  const mates = difficultyLabel(played.teammateDifficulty);
  const recorded = countsForRecords(m, played.difficulty, played.teammateDifficulty, played.ruleset);
  const roundRules = roundRulesFor(m);
  // Your side as picked (M98); an Extraction run's squad is Alpha (playedPicks).
  const team = teamOfPick(played.team ?? DEFAULT_TEAM_PICK);
  const rules = describeRules({ ...opts.rules, ...sideText(team, roundRules), ...m, halfTimeAfter: roundRules.halfTimeAfter, switches: m, opponents: played.difficulty }, played.mode, run);
  const levels = m.teamSize === 1 || played.difficulty === played.teammateDifficulty ? opponents : `${opponents} / ${mates}`;
  const devContentUsed = opts.dev.devContentUsed();
  // XP (LV1): none with Dev settings that change play (Disable levelling among them) or with dev content.
  const cheating = opts.dev.cheating();
  const paid = !cheating && !devContentUsed;
  return {
    played,
    devContent,
    run: run !== undefined,
    sizeMax,
    sizeMin,
    mapLine: `${map.label}${lightLine}`,
    still: still ? menuArt(still) : null,
    modeLabel: MATCH_MODES.find((o) => o.id === played.mode)?.label ?? played.mode,
    rules: `${rulesetOf(played.ruleset).label} · ${match.value}`,
    // Your team first ("Beta · Hard / Normal bots"); a run's squad has no pick, so it says only the bots.
    bots: run ? PLAY_TEXT.botsLine(levels) : `${TEAMS[team]!.name} · ${PLAY_TEXT.botsLine(levels)}`,
    notes: setupNotes(rules, { recorded, cheating, devContentUsed, ruleset: played.ruleset }),
    loadout: opts.loadout.summary(),
    pays: paid ? (played.ruleset === DEFAULT_RULESET || recordsKeyOf(played.ruleset) !== null ? PLAY_TEXT.pays : PLAY_TEXT.paysCapped(CUSTOM_RULES_PAY_CAP)) : '',
  };
}

/**
 * New game's text under its buttons: the rules, then why the match won't count, said before it is played: custom rules
 * (M20, not `recorded`), Dev settings that change play (M24, `cheating`), or dev content (M35, `devContentUsed`: in full,
 * or only that it won't pay when a note before it already says it won't be recorded). Pure.
 */
export function setupNotes(rules: string, why: { recorded: boolean; cheating: boolean; devContentUsed: boolean; ruleset?: RulesetId }): string {
  const notes = [rules];
  if (!why.recorded) notes.push(notRecordedNote(why.ruleset ?? DEFAULT_RULESET));
  else if (why.cheating) notes.push(DEV_NOT_RECORDED_NOTE);
  if (why.devContentUsed) notes.push(notes.length > 1 ? DEV_CONTENT_PAY_NOTE : DEV_CONTENT_NOTE);
  return notes.join(' ');
}

/** Under New game's rules while Dev settings that change play are on (M24): no records, and no XP (LV1). */
export const DEV_NOT_RECORDED_NOTE = "Dev settings are on, so this match won't go into your records or give XP.";

/**
 * Under New game's rules when the picks, the Loadout or the opponents' possible gear use dev content (M35); the second
 * when another note already says the match won't be recorded.
 */
export const DEV_CONTENT_NOTE = "This match uses content still being built, so it won't go into your records or give XP.";
export const DEV_CONTENT_PAY_NOTE = "It uses content still being built, so it won't give XP either.";

/** Under New game's rules when the setup isn't the standard match. */
export const NOT_RECORDED_NOTE = `This match won't go into your records, which count only the standard match: ${standardMatchText()}`;

/** Under New game's rules when the setup isn't `ruleset`'s standard match (M39): Skirmish's note, its own, or Custom's. */
export function notRecordedNote(ruleset: RulesetId): string {
  if (ruleset === DEFAULT_RULESET) return NOT_RECORDED_NOTE;
  if (recordsKeyOf(ruleset) === null) return CUSTOM_NOT_RECORDED_NOTE;
  return `This match won't go into your ${rulesetOf(ruleset).label} records, which count only its standard match: ${standardMatchText(ruleset)}`;
}

/** Under New game's rules with the Custom ruleset (M39). */
export const CUSTOM_NOT_RECORDED_NOTE = `Custom rules never go into your records, and give XP at no more than ×${CUSTOM_RULES_PAY_CAP}.`;

function difficultyLabel(d: Difficulty): string {
  return DIFFICULTIES.find((o) => o.id === d)?.label ?? d;
}
