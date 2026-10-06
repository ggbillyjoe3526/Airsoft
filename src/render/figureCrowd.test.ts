import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { DEFAULT_LOOK } from '../config/look';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { BOT_SCHEMES, CYBER_COLOURS, FAMILIES, SCHEMES } from '../config/schemes';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { buildFigure, disposeFigure, type Figure, type FigureDress, HUMAN_DRESS } from './characterModels';
import { CharacterRenderer } from './characterRenderer';
import { figureCrowd, figureDress, HUMAN_CROWD, playerArms } from './figureMix';

/** True when some vertex of `mesh` is exactly `hex` (the Low figure's colours are flat, so a part shows as its colour). */
const hasColour = (mesh: THREE.Object3D, hex: number): boolean => {
  const want = new THREE.Color(hex);
  const c = (mesh as THREE.Mesh).geometry.getAttribute('color');
  for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b) < 1e-6) return true;
  return false;
};
const body = (f: Figure): THREE.Object3D => f.upper.children[0]!;

// Each test builds dozens of figures: a minute's timeout, for a loaded machine (the suite's default is 5 s).
describe('who the figures are (G7: figureCrowd and figureDress)', { timeout: 60_000 }, () => {
  const teams = [0, 0, 0, 1, 1, 1].map((team) => ({ team }));

  it('mixes robots into both teams from the seed when Robots is on, and none when off', () => {
    for (let seed = 0; seed < 30; seed++) {
      const on = figureCrowd(seed, teams, { ...DEFAULT_LOOK, robots: true });
      for (const team of [0, 1]) {
        const robots = on.robots.filter((r, i) => r && teams[i]!.team === team).length;
        expect(robots).toBeGreaterThan(0);
        expect(robots).toBeLessThan(3);
      }
      expect(figureCrowd(seed, teams, { ...DEFAULT_LOOK, robots: false }).robots).toEqual(Array(6).fill(false));
    }
    // No Look settings (an older setup): the defaults, as the paint takes them.
    expect(figureCrowd(5, teams).robots).toEqual(figureCrowd(5, teams, DEFAULT_LOOK).robots);
    expect(figureCrowd(5, teams, { robots: false, realisticColours: true }).realistic).toBe(true);
  });

  it('dresses each team in its own robot shell (light, dark) and its bot schemes, plain under Realistic colours', () => {
    const crowd = { robots: [true, false], realistic: false };
    const blue = figureDress(crowd, 0, 0, [AEG, GAS_PISTOL]);
    const orange = figureDress(crowd, 1, 1, [AEG, GAS_PISTOL]);
    expect(blue.robot).toBe(true);
    expect(orange.robot).toBe(false);
    expect(blue.shell).toBe(FIGURE.robot.shells[0]);
    expect(orange.shell).toBe(FIGURE.robot.shells[1]);
    expect(blue.shell).not.toBe(orange.shell);
    expect(blue.rifle).toBe(SCHEMES[BOT_SCHEMES[0]!.rifle]);
    expect(blue.pistol).toBe(SCHEMES[BOT_SCHEMES[0]!.pistol]);
    expect(orange.rifle).toBe(SCHEMES[BOT_SCHEMES[1]!.rifle]);
    const plain = figureDress({ ...crowd, realistic: true }, 1, 1, [AEG, GAS_PISTOL]);
    expect(plain.rifle).toBe(FAMILIES[SCHEMES[BOT_SCHEMES[1]!.rifle].family]);
    // The Cyber Pistol keeps its own colours: its white slab (dark grey under Realistic colours).
    expect(figureDress(crowd, 0, 1, [AEG, CYBER_PISTOL]).pistol.body).toBe(CYBER_COLOURS.bold.slab);
    expect(figureDress({ ...crowd, realistic: true }, 0, 1, [AEG, CYBER_PISTOL]).pistol.body).toBe(CYBER_COLOURS.realistic.slab);
  });

  it('gives the player robot arms in their team shell when their figure is a robot', () => {
    expect(playerArms({ robots: [false, true], realistic: false }, 1, 1)).toEqual({ robot: true, shell: FIGURE.robot.shells[1] });
    expect(playerArms(HUMAN_CROWD, 0, 0).robot).toBe(false);
  });
});

describe('the figures as dressed (G7)', { timeout: 60_000 }, () => {
  const robotOf = (team: number): FigureDress => ({ ...HUMAN_DRESS, robot: true, shell: FIGURE.robot.shells[team]! });

  it('builds a robot in its team shell, a human in none; both wear the team colour on every part', () => {
    for (const set of Object.values(TEAM_COLOUR_SETS)) {
      set.figures.forEach((team, t) => {
        for (const id of [0, 3]) {
          const robot = buildFigure(team, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, undefined, undefined, robotOf(t));
          const human = buildFigure(team, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id);
          expect(hasColour(body(robot), FIGURE.robot.shells[t]!), 'its team shell').toBe(true);
          expect(hasColour(body(robot), FIGURE.robot.shells[1 - t]!), 'not the other team\'s').toBe(false);
          expect(hasColour(body(human), FIGURE.robot.shells[t]!), 'a human has no shell').toBe(false);
          for (const f of [robot, human]) {
            for (const part of [f.legL, f.legR, body(f), f.aimRifle, f.aimPistol, f.hitPose]) expect(hasColour(part, team), 'team colour on every part').toBe(true);
            disposeFigure(f);
          }
        }
      });
    }
  });

  it('paints the replicas a figure holds in its dress colours (third person)', () => {
    const dress: FigureDress = { ...HUMAN_DRESS, rifle: SCHEMES.signal, pistol: SCHEMES.coral };
    const f = buildFigure(0xff8a2a, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, undefined, undefined, dress);
    expect(hasColour(f.aimRifle, SCHEMES.signal.body)).toBe(true);
    expect(hasColour(f.aimRifle, SCHEMES.signal.accent)).toBe(true);
    expect(hasColour(f.aimPistol, SCHEMES.coral.body)).toBe(true);
    expect(hasColour(f.hitPose, SCHEMES.signal.body), 'the rifle hanging from the raised-hand pose').toBe(true);
    disposeFigure(f);
  });
});

describe('CharacterRenderer with a crowd (G7)', { timeout: 60_000 }, () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());

  const figuresOf = (r: CharacterRenderer): Figure[] => (r as unknown as { figures: { figure: Figure }[] }).figures.map((s) => s.figure);

  it('draws the crowd\'s robots as robots, in their team\'s shell and bot schemes, through a detail rebuild', () => {
    const characters = [createCharacter(0, vec3(), 0, [AEG, GAS_PISTOL], 0), createCharacter(1, vec3(2, 0, 0), 0, [AEG, GAS_PISTOL], 1), createCharacter(2, vec3(4, 0, 0), 0, [AEG, GAS_PISTOL], 1)];
    const colours = TEAM_COLOUR_SETS.standard.figures;
    const r = new CharacterRenderer(characters, colours, HITS, null, 'low', { robots: [true, false, true], realistic: false });
    const check = (): void => {
      const [a, b, c] = figuresOf(r);
      expect(hasColour(body(a!), FIGURE.robot.shells[0]!)).toBe(true);
      expect(hasColour(body(b!), FIGURE.robot.shells[1]!)).toBe(false);
      expect(hasColour(body(c!), FIGURE.robot.shells[1]!)).toBe(true);
      expect(hasColour(a!.aimRifle, SCHEMES[BOT_SCHEMES[0]!.rifle].body)).toBe(true);
      expect(hasColour(b!.aimRifle, SCHEMES[BOT_SCHEMES[1]!.rifle].body)).toBe(true);
    };
    check();
    r.setDetail('high');
    r.setDetail('low');
    check();
    r.dispose();
  });

  it('frees every figure it replaced on a rebuild, and the rest when disposed (match end)', () => {
    const characters = [createCharacter(0, vec3(), 0, [AEG, GAS_PISTOL], 0), createCharacter(1, vec3(2, 0, 0), 0, [AEG, GAS_PISTOL], 1)];
    const r = new CharacterRenderer(characters, TEAM_COLOUR_SETS.standard.figures, HITS, null, 'low', { robots: [true, false], realistic: false });
    const geometries = (): Set<THREE.BufferGeometry> => {
      const out = new Set<THREE.BufferGeometry>();
      r.object.traverse((o) => o instanceof THREE.Mesh && out.add(o.geometry));
      return out;
    };
    const freed = new Set<THREE.BufferGeometry>();
    const watch = (set: Set<THREE.BufferGeometry>): Set<THREE.BufferGeometry> => {
      for (const g of set) g.addEventListener('dispose', () => freed.add(g));
      return set;
    };
    const before = watch(geometries());
    r.setDetail('high');
    expect([...before].every((g) => freed.has(g)), 'the Low figures are freed').toBe(true);
    const after = watch(geometries());
    expect(after.size).toBe(before.size);
    r.dispose();
    expect([...after].every((g) => freed.has(g)), 'the High figures are freed').toBe(true);
  });
});
