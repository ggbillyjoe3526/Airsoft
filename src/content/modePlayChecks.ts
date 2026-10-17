import { MODE_PLAY_TEST } from '../config/contentRules';
import { squadSize } from '../config/extraction';
import { DEFAULT_MATCH_RULES as STANDARD_RULES, roundRulesFor } from '../config/matchRules';
import type { MatchMode } from '../config/modes';
import type { MapEntry } from '../map/maps';
import type { MapData } from '../map/mapTypes';
import { teamEnd } from '../sim/round';
import { type CheckResult, num, result } from './checks';
import { listWords, type ModeEntry, modeItem } from './modeCheckSupport';
import type { ModePairing } from './modeChecks';
import { playModeMatch, playsRounds } from './modePlay';

/**
 * Test-only (CT3): level 2's checks that play the mode, headless (src/content/modePlay.ts): every pairing of its
 * compatibility grid plays, and the bots play it their own way rather than as Elimination. Call `initPhysics()` first.
 */

/** What went wrong in one short match of `pairing`, in words (none when it played as it should). */
export function pairingProblems(mode: MatchMode, map: MapData, pairing: ModePairing, seed: number, seconds: number): string[] {
  let played;
  try {
    played = playModeMatch({ mode, map, level: pairing.level, teamSize: pairing.rules.teamSize, rules: pairing.rules, seed, seconds });
  } catch (e) {
    return [`it stopped with an error (${e instanceof Error ? e.message : String(e)})`];
  }
  const out: string[] = [];
  const size = pairing.rules.teamSize;
  const squad = playsRounds(mode) ? size : squadSize(size);
  if (played.teams[0] !== squad || (playsRounds(mode) && played.teams[1] !== size)) out.push(`the teams were ${played.teams[0]} and ${played.teams[1]}, not ${squad} a side`);
  if (played.lost.length > 0) out.push(`${played.lost.length} lost their place (not a number)`);
  if (played.watched.fell > 0) out.push(`${played.watched.fell} fell through the floor`);
  if (played.seconds < seconds - 1 && played.ended.length === 0) out.push(`it stopped after ${num(played.seconds, 0)} s with nothing decided`);
  return out;
}

/** Every pairing plays: the match starts with the teams it should, nobody falls through or is lost, nothing stops it. */
export function playsCheck(mode: ModeEntry, entry: MapEntry, map: MapData, pairings: readonly ModePairing[], seed = 1, seconds: number = MODE_PLAY_TEST.seconds): CheckResult {
  const item = modeItem(mode);
  const bad: string[] = [];
  for (const p of pairings) {
    const problems = pairingProblems(mode.id, map, p, seed, seconds);
    if (problems.length > 0) bad.push(`${p.label}: ${problems.join(', ')}`);
  }
  if (bad.length > 0) return result('compatibility', 'mode.plays', item, 'fail', `On ${entry.label}, ${bad.length} of ${pairings.length} pairings went wrong: ${bad.join('; ')}.`);
  return result('compatibility', 'mode.plays', item, 'pass', `On ${entry.label}, ${seconds} s of each of ${pairings.length} pairings played: ${listWords(pairings.map((p) => p.label))}.`);
}

/**
 * How far apart (m, on average over the bots and the ticks) the bots stand in `mode` and in Elimination, from the same
 * seed, map and ends: a mode whose bots have no plan of their own plays them as Elimination's, step for step.
 */
export function botsApart(mode: MatchMode, map: MapData, teamSize: number, seed: number, seconds: number): number {
  const rules = roundRulesFor({ ...STANDARD_RULES, teamSize });
  const track = (m: MatchMode, firstEnd?: number): Map<number, { x: number; z: number }[]> => {
    const paths = new Map<number, { x: number; z: number }[]>();
    playModeMatch({ mode: m, map, level: 'normal', teamSize, rules: { ...STANDARD_RULES, teamSize }, seed, seconds, ...(firstEnd === undefined ? {} : { firstEnd }) }, (_state, bots) => {
      for (const b of bots.bots) {
        const c = b.character;
        const path = paths.get(c.id) ?? [];
        path.push({ x: c.position.x, z: c.position.z });
        paths.set(c.id, path);
      }
    });
    return paths;
  };
  const own = track(mode);
  const elimination = track('elimination', teamEnd(0, mode, 1, rules));
  let sum = 0;
  let n = 0;
  for (const [id, path] of own) {
    const other = elimination.get(id);
    if (!other) continue;
    for (let i = 0; i < Math.min(path.length, other.length); i++) {
      sum += Math.hypot(path[i]!.x - other[i]!.x, path[i]!.z - other[i]!.z);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** The bots play the mode their own way: not, step for step, as they play Elimination (a mode other than Elimination). */
export function botsCheck(mode: ModeEntry, entry: MapEntry, map: MapData, seed = 1, seconds: number = MODE_PLAY_TEST.botSeconds): CheckResult {
  const item = modeItem(mode);
  if (mode.id === 'elimination') return result('compatibility', 'mode.bots', item, 'pass', 'The bots’ own mode: every other mode is measured against how they play it.');
  const apart = botsApart(mode.id, map, entry.teamSize.standard, seed, seconds);
  if (apart < MODE_PLAY_TEST.botApart) return result('compatibility', 'mode.bots', item, 'fail', `In ${seconds} s on ${entry.label} the bots stood ${num(apart)} m on average from where they stand in Elimination: they play it as Elimination. Give them a plan for it (ai/roundPlanner.ts RoundPlanner.plan).`);
  return result('compatibility', 'mode.bots', item, 'pass', `In ${seconds} s on ${entry.label} the bots stood ${num(apart, 1)} m on average from where they stand in Elimination, from the same start: they play it their own way.`);
}
