import { ROBOT_SEED_SALT } from '../config/look';
import { createRng, rngNext } from '../sim/rng';

/**
 * Which figures are robots this match (by character index, `teams[i]` its team), from the match's seed. With robots on,
 * each team of two or more has both looks: half its figures (rounded at random either way) are robots, shuffled. A team
 * of one is a robot half the time. Off: none.
 */
export function robotFigures(seed: number, teams: readonly number[], robotsOn: boolean): boolean[] {
  const out = teams.map(() => false);
  if (!robotsOn) return out;
  const rng = createRng((seed ^ ROBOT_SEED_SALT) >>> 0);
  const byTeam = new Map<number, number[]>();
  teams.forEach((team, i) => byTeam.set(team, [...(byTeam.get(team) ?? []), i]));
  for (const members of [...byTeam.entries()].sort(([a], [b]) => a - b).map(([, m]) => m)) {
    // Fisher-Yates over the team's members, then the first `count` are robots.
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(rngNext(rng) * (i + 1));
      [members[i], members[j]] = [members[j]!, members[i]!];
    }
    const half = members.length / 2;
    const count = members.length === 1 ? (rngNext(rng) < 0.5 ? 1 : 0) : Number.isInteger(half) ? half : rngNext(rng) < 0.5 ? Math.floor(half) : Math.ceil(half);
    for (let k = 0; k < count; k++) out[members[k]!] = true;
  }
  return out;
}
