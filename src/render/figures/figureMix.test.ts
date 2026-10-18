import { describe, expect, it } from 'vitest';
import { robotFigures } from './figureMix';

/** Characters by team, as a 3 v 3 or 5 v 5 lists them (team 0 first). */
const teams = (perTeam: number): number[] => [...Array(perTeam).fill(0), ...Array(perTeam).fill(1)];

describe('Robots mix (G1)', () => {
  it('draws everyone human with the setting off', () => {
    expect(robotFigures(7, teams(3), false)).toEqual(Array(6).fill(false));
  });

  it('mixes humans and robots on both teams of two or more, half each (rounded either way)', () => {
    for (const perTeam of [2, 3, 4, 5]) {
      for (let seed = 0; seed < 40; seed++) {
        const t = teams(perTeam);
        const robots = robotFigures(seed, t, true);
        for (const team of [0, 1]) {
          const count = robots.filter((r, i) => r && t[i] === team).length;
          expect(count).toBeGreaterThanOrEqual(Math.floor(perTeam / 2));
          expect(count).toBeLessThanOrEqual(Math.ceil(perTeam / 2));
        }
      }
    }
  });

  it('is the same for the same seed, and varies between seeds', () => {
    expect(robotFigures(123, teams(3), true)).toEqual(robotFigures(123, teams(3), true));
    const seen = new Set(Array.from({ length: 30 }, (_, s) => robotFigures(s, teams(3), true).join()));
    expect(seen.size).toBeGreaterThan(4);
  });

  it('makes a lone player a robot about half the time', () => {
    const robots = Array.from({ length: 400 }, (_, s) => robotFigures(s, [0], true)[0]).filter(Boolean).length;
    expect(robots).toBeGreaterThan(140);
    expect(robots).toBeLessThan(260);
  });
});
