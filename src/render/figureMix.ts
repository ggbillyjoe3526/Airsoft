import { DEFAULT_LOOK, type LookSettings, ROBOT_SEED_SALT } from '../config/look';
import { REPLICA_FINISH } from '../config/replicaFinish';
import type { ReplicaConfig } from '../config/replicas';
import { BOT_SCHEMES, CYBER_COLOURS, hasFixedColours, schemeColours } from '../config/schemes';
import { createRng, rngNext } from '../sim/rng';
import type { FigureDress, FigureReplicaColours } from './characterModels';
import { robotShell } from './figurePalette';
import type { ArmStyle } from './replicaModels';

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

/**
 * Who the figures of a match are drawn as (G7): which are robots (robotFigures, by character index) and whether
 * replicas are in their plain Realistic colours (Settings › Look).
 */
export interface FigureCrowd {
  robots: readonly boolean[];
  realistic: boolean;
}

/**
 * The crowd of a match or the range from its seed, its characters' teams (by index) and the Look settings (their
 * defaults, as kitPaint takes them, when a setup has none).
 */
export function figureCrowd(seed: number, characters: readonly { team: number }[], look: LookSettings = DEFAULT_LOOK): FigureCrowd {
  return { robots: robotFigures(seed, characters.map((c) => c.team), look.robots), realistic: look.realisticColours };
}

/** Every figure human, every replica in its scheme: what a renderer draws unless told otherwise. */
export const HUMAN_CROWD: FigureCrowd = { robots: [], realistic: false };

/** The Cyber Pistol on a figure: its white slab, dark frame and light line (plain grey under Realistic colours). */
function cyberOnFigure(realistic: boolean): FigureReplicaColours {
  const c = CYBER_COLOURS[realistic ? 'realistic' : 'bold'];
  return { body: c.slab, furniture: c.frame, detail: c.frame, accent: c.line, steel: REPLICA_FINISH.unpainted.steel };
}

/**
 * How character `index` of `team`, carrying `replicas`, is dressed: a robot or not (from the crowd), its team's robot
 * shell, and its rifle and pistol in its team's bot schemes (BOT_SCHEMES; the Cyber Pistol in its own colours), each
 * plain under Realistic colours. Built once per figure build, never per frame.
 */
export function figureDress(crowd: FigureCrowd, index: number, team: number, replicas: readonly ReplicaConfig[]): FigureDress {
  const schemes = BOT_SCHEMES[team] ?? BOT_SCHEMES[0]!;
  const pistol = replicas.find((r) => r.look.model === 'pistol');
  return {
    robot: crowd.robots[index] === true,
    shell: robotShell(team),
    rifle: schemeColours(schemes.rifle, crowd.realistic),
    pistol: pistol && hasFixedColours(pistol) ? cyberOnFigure(crowd.realistic) : schemeColours(schemes.pistol, crowd.realistic),
  };
}

/** The player's own first-person arms: a robot's in their team's shell when their figure is a robot. */
export function playerArms(crowd: FigureCrowd, index: number, team: number): ArmStyle {
  return { robot: crowd.robots[index] === true, shell: robotShell(team) };
}
