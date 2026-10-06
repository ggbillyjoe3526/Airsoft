import { DIFFICULTIES, type Difficulty } from '../../config/bots';
import { countsForRecords, CUSTOM_RULES_PAY_CAP, DEFAULT_RULESET, matchRulesSummary, recordsKeyOf, roundRulesFor, runRulesSummary, type RulesetId, rulesetOf, standardMatchText } from '../../config/matchRules';
import { squadSize } from '../../config/extraction';
import { mapStillFile } from '../../config/menuArt';
import { PLAY_TEXT } from '../../config/menus';
import { MATCH_MODES } from '../../config/modes';
import type { LightingPresetId } from '../../config/render';
import { LIGHTING_LABELS, lightingChoices } from '../../map/lightingChoice';
import { type MapId, mapData, mapEntry } from '../../map/maps';
import { type NewGamePicks, playedPicks, playedTeamSize } from '../../newGamePicks';
import { menuArt } from './chrome';
import type { MenusOptions } from './menus';
import { describeRules } from './rulesText';
import type { PlayView } from './setupScreen';

/**
 * What the Play screen and the title's next match show (G3, out of menus.ts): the match as it will play, worked out
 * from the picks, and the notes under its rules saying why it won't count, if it won't. Pure apart from reading the
 * options' getters; nothing here runs per frame.
 */

/** The match as it will play: dev content's picks play as their defaults while Dev content is off (M35). */
export function playView(picked: NewGamePicks, opts: Pick<MenusOptions, 'rules' | 'dev' | 'armory' | 'loadout'>, lightingOf: (id: MapId) => LightingPresetId): PlayView {
  const devContent = opts.dev.devContent();
  const played = playedPicks(picked, devContent);
  // Each map offers as many players a side as it has room for (Depot 3v3, Woodland up to 5v5, M33).
  // An Extraction run takes a squad of at most three (M43).
  const map = mapEntry(played.map);
  const run = played.mode === 'extraction' ? mapData(map.id).extraction : undefined;
  const sizeMax = run ? squadSize(map.teamSize.max) : map.teamSize.max;
  const m = { ...played.rules, teamSize: playedTeamSize(played) };
  const light = lightingOf(map.id);
  // A map that offers Day and Night names the one picked (M34d).
  const lightLine = lightingChoices(mapData(map.id)).length > 1 ? ` · ${LIGHTING_LABELS[light]}` : '';
  const still = mapStillFile(map.id, light);
  const match = run ? runRulesSummary(m, run) : matchRulesSummary(m);
  const opponents = difficultyLabel(played.difficulty);
  const mates = difficultyLabel(played.teammateDifficulty);
  const recorded = countsForRecords(m, played.difficulty, played.teammateDifficulty, played.ruleset);
  const halfTimeAfter = roundRulesFor(m).halfTimeAfter;
  const rules = describeRules({ ...opts.rules, ...m, halfTimeAfter, switches: m }, played.mode, run);
  const devContentUsed = opts.dev.devContentUsed();
  const paid = opts.armory.wallet() !== null && !devContentUsed;
  return {
    played,
    devContent,
    run: run !== undefined,
    sizeMax,
    mapLine: `${map.label}${lightLine}`,
    still: still ? menuArt(still) : null,
    modeLabel: MATCH_MODES.find((o) => o.id === played.mode)?.label ?? played.mode,
    rules: `${rulesetOf(played.ruleset).label} · ${match.value}`,
    bots: m.teamSize === 1 || played.difficulty === played.teammateDifficulty ? PLAY_TEXT.botsLine(opponents) : PLAY_TEXT.botsLine(`${opponents} / ${mates}`),
    notes: setupNotes(rules, { recorded, cheating: opts.dev.cheating(), devContentUsed, ruleset: played.ruleset }),
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

/** Under New game's rules while Dev settings that change play are on (M24). */
export const DEV_NOT_RECORDED_NOTE = "Dev settings are on, so this match won't go into your records.";

/**
 * Under New game's rules when the picks, the Loadout or the opponents' possible gear use dev content (M35); the second
 * when another note already says the match won't be recorded.
 */
export const DEV_CONTENT_NOTE = "This match uses content still being built, so it won't go into your records or pay Field Credits.";
export const DEV_CONTENT_PAY_NOTE = "It uses content still being built, so it won't pay Field Credits either.";

/** Under New game's rules when the setup isn't the standard match. */
export const NOT_RECORDED_NOTE = `This match won't go into your records, which count only the standard match: ${standardMatchText()}`;

/** Under New game's rules when the setup isn't `ruleset`'s standard match (M39): Skirmish's note, its own, or Custom's. */
export function notRecordedNote(ruleset: RulesetId): string {
  if (ruleset === DEFAULT_RULESET) return NOT_RECORDED_NOTE;
  if (recordsKeyOf(ruleset) === null) return CUSTOM_NOT_RECORDED_NOTE;
  return `This match won't go into your ${rulesetOf(ruleset).label} records, which count only its standard match: ${standardMatchText(ruleset)}`;
}

/** Under New game's rules with the Custom ruleset (M39). */
export const CUSTOM_NOT_RECORDED_NOTE = `Custom rules never go into your records, and pay no more than ×${CUSTOM_RULES_PAY_CAP}.`;

function difficultyLabel(d: Difficulty): string {
  return DIFFICULTIES.find((o) => o.id === d)?.label ?? d;
}
