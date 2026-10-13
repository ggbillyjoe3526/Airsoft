import { describe, expect, it } from 'vitest';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { loadBotsFile } from '../config/botsFile';
import { drawIdentities, rosterSeed } from './botRoster';

/** BN1: who the bots are each match, drawn from bots.md's roster. */
const ROSTER = BOT_PERSONALITIES;
/** `n` bots a team, ids from 1 (the player is 0 and draws nothing), Blue then Orange. */
const teams = (perTeam: number, playerTeam = 0) => {
  const out: { id: number; team: number }[] = [];
  for (let team = 0; team < 2; team++) for (let i = 0; i < perTeam; i++) out.push({ id: team * perTeam + i, team });
  return out.filter((b) => !(b.id === 0 && b.team === playerTeam));
};

describe('drawIdentities (BN1)', () => {
  it('draws the same names for the same seed, and others for another', () => {
    const bots = teams(3);
    const names = (seed: number) => [...drawIdentities(seed, bots).values()].map((i) => i.name);
    expect(names(7)).toEqual(names(7));
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => names(s).join());
    expect(new Set(seeds).size).toBeGreaterThan(4);
  });

  it('draws from a stream of its own: the match’s seed itself isn’t it', () => {
    expect(rosterSeed(42)).not.toBe(42);
    expect(rosterSeed(42)).toBe(rosterSeed(42));
  });

  it('gives each bot a name off the roster and the personality that name always plays, never a name twice', () => {
    for (const perTeam of [3, 5, 6]) {
      for (let seed = 1; seed <= 20; seed++) {
        const drawn = drawIdentities(seed, teams(perTeam));
        expect(drawn.size, `${perTeam}v${perTeam}`).toBe(perTeam * 2 - 1);
        const names = [...drawn.values()].map((i) => i.name);
        expect(new Set(names).size).toBe(names.length);
        for (const i of drawn.values()) {
          const entry = ROSTER.roster.find((e) => e.name === i.name);
          expect(entry?.personality, i.name).toBe(i.personality);
          expect(i.style).toBe(ROSTER.styles.get(i.personality));
        }
      }
    }
  });

  it('mixes a team: different personalities while there are enough, then round again', () => {
    const kinds = ROSTER.styles.size;
    for (let seed = 1; seed <= 20; seed++) {
      for (const perTeam of [3, 4, 6]) {
        const drawn = drawIdentities(seed, teams(perTeam, -1));
        for (const team of [0, 1]) {
          const mine = teams(perTeam, -1)
            .filter((b) => b.team === team)
            .map((b) => drawn.get(b.id)!.personality);
          const counts = new Map<string, number>();
          for (const k of mine) counts.set(k, (counts.get(k) ?? 0) + 1);
          // At most ceil(n / kinds) of one personality, and every one there is before any comes twice.
          for (const [k, n] of counts) expect(n, `seed ${seed}, ${perTeam} a team: ${k}`).toBeLessThanOrEqual(Math.ceil(perTeam / kinds));
          expect(counts.size).toBe(Math.min(perTeam, kinds));
        }
      }
    }
  });

  it('gives no identity once the roster runs out, and none at all from an empty file', () => {
    const tiny = loadBotsFile(
      ['## Roster', '| Name | Personality |', '|---|---|', '| Dash | Rusher |', '', '## Personalities', '| Personality | Card note |', '|---|---|', '| Rusher | {name} rushes. |'].join('\n'),
    );
    const drawn = drawIdentities(3, teams(3), tiny);
    expect(drawn.size).toBe(1);
    expect([...drawn.values()][0]!.name).toBe('Dash');
    expect(drawIdentities(3, teams(3), loadBotsFile('')).size).toBe(0);
  });

  it('takes any name left when a personality’s names run out (it plays its own)', () => {
    const lopsided = loadBotsFile(
      [
        '## Roster',
        '| Name | Personality |',
        '|---|---|',
        '| Dash | Rusher |',
        '| Owl | Careful |',
        '| Hush | Careful |',
        '| Pip | Careful |',
        '',
        '## Personalities',
        '| Personality | Card note |',
        '|---|---|',
        '| Rusher | {name} rushes. |',
        '| Careful | {name} is careful. |',
      ].join('\n'),
    );
    const drawn = drawIdentities(5, teams(2, -1), lopsided);
    expect(drawn.size).toBe(4);
    const rushers = [...drawn.values()].filter((i) => i.personality === 'rusher');
    expect(rushers.map((i) => i.name)).toEqual(['Dash']);
  });
});
