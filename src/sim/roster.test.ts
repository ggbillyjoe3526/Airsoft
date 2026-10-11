import { describe, expect, it } from 'vitest';
import { botConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { MAPS, mapData } from '../map/maps';
import { playableMode } from '../map/playableMode';
import { createCharacter, respawnCharacter } from './character';
import { attackersInRound, placeTeams, teamEnd } from './round';
import { byTeam, rosterTeams } from './roster';
import { createGameState } from './state';
import { vec3 } from './vec';

/**
 * Your team (M98): the roster the match build makes (matchSession.ts spawnRoster), placed at round 1 and after
 * half-time, on every map and in every team mode, with the player on Alpha and on Beta.
 */

describe('the roster on the picked team (M98)', () => {
  it('puts the player first on its team, its teammates next and the other team last', () => {
    expect(rosterTeams(0, 3, 3)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(rosterTeams(1, 3, 3)).toEqual([1, 1, 1, 0, 0, 0]);
    // Extraction's sides differ: your squad, then the home team.
    expect(rosterTeams(1, 2, 5)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it('gives per-team values by team index: the teammates\' bot level to your team, wherever you are', () => {
    const mates = botConfig('easy');
    const opponents = botConfig('pro');
    expect(byTeam(0, mates, opponents)).toEqual([mates, opponents]);
    expect(byTeam(1, mates, opponents)).toEqual([opponents, mates]);
    expect(byTeam(1, 2, 5)).toEqual([5, 2]);
  });

  const teamModes = ['elimination', 'attackDefend'] as const;
  for (const entry of MAPS) {
    for (const mode of teamModes) {
      it(`places both teams on ${entry.label} in ${mode} with you on Alpha or Beta, and swaps them at half-time`, () => {
        const map = mapData(entry.id);
        // A map without a flagpole plays Attack / Defend as Elimination (MatchSession).
        const played = playableMode(map, mode);
        const size = entry.teamSize.standard;
        const spotsByTeam: string[][][] = [];
        for (const team of [0, 1]) {
          const state = createGameState(1, 8, ROUNDS, played, map.flag);
          for (const [id, t] of rosterTeams(team, size, size).entries()) state.characters.push(createCharacter(id, vec3(), 0, LOADOUT, t));
          const ctx = { rules: ROUNDS, spawns: map.spawns, spawnLift: 0, pole: map.flag };
          const where = (round: number): string[][] => {
            state.round.number = round;
            placeTeams(state.round, state.characters, ctx);
            for (const c of state.characters) respawnCharacter(c);
            return [0, 1].map((t) =>
              state.characters
                .filter((c) => c.team === t)
                .map((c) => `${c.end}:${c.position.x.toFixed(2)},${c.position.z.toFixed(2)}`)
                .sort(),
            );
          };
          const player = state.characters[0]!;
          expect(player.team, entry.label).toBe(team);
          for (const round of [1, ROUNDS.halfTimeAfter + 1]) {
            const spots = where(round);
            // Each team at its end for the round, on spots of its own.
            for (const c of state.characters) expect(c.end, `${entry.label} round ${round}`).toBe(teamEnd(c.team, played, round, ROUNDS));
            expect(new Set(spots.flat()).size, `${entry.label} round ${round}: one spawn each`).toBe(size * 2);
            expect(player.end).not.toBe(teamEnd(1 - team, played, round, ROUNDS));
            if (played === 'attackDefend') {
              // The attackers start at end 0 by the rules, whoever you are; Alpha attacks first and defends after half-time.
              const attackers = attackersInRound(round, ROUNDS);
              expect(player.end === 0, `${entry.label} round ${round}`).toBe(attackers === team);
            }
            spotsByTeam[team] = [...(spotsByTeam[team] ?? []), ...spots];
          }
          // Ends swap at half-time.
          const first = teamEnd(team, played, 1, ROUNDS);
          expect(teamEnd(team, played, ROUNDS.halfTimeAfter + 1, ROUNDS)).toBe(1 - first);
        }
        // Each team stands where it always did: the pick changes who you are, not where Alpha or Beta start.
        expect(spotsByTeam[1], entry.label).toEqual(spotsByTeam[0]);
      });
    }
  }
});
