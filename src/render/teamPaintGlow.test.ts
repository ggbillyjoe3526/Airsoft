import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_RIG, FIGURE_RIG_KINDS } from '../config/figureRig';
import { dayColours, TEAM_COLOUR_SETS } from '../config/teams';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { figureDress, HUMAN_CROWD } from './figureMix';
import { RiggedFigure } from './riggedFigure';
import { figureFilesForTests } from './testSupport';
import { ThrownMagazines } from './thrownMagazines';

const { rigs, files } = await figureFilesForTests();
const HC_ORANGE = TEAM_COLOUR_SETS.highContrast.figures[1]!;

function figure(kind: (typeof FIGURE_RIG_KINDS)[number], paintGlow: number | undefined): RiggedFigure {
  const c = createCharacter(4, vec3(0, 0, 0), 0, undefined, 1);
  const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.authored = { opacity: 1, transparent: false };
  return new RiggedFigure({ rig: rigs[kind], character: c, id: c.id, teamColour: HC_ORANGE, ...(paintGlow === undefined ? {} : { paintGlow }), replicaMaterial: material, rifleColours: dress.rifle, pistolColours: dress.pistol, files, detail: 'high', pack: true, radio: true, thrown: new ThrownMagazines(), calloutMaterial: new THREE.SpriteMaterial() });
}

const teamMaterials = (f: RiggedFigure): THREE.MeshStandardMaterial[] =>
  f.materials.filter((m) => m.name.toLowerCase().startsWith(FIGURE_RIG.teamMaterialPrefix)) as THREE.MeshStandardMaterial[];

describe('team paint glow (AX1)', () => {
  it('glows on High Contrast only, and never on a night field', () => {
    expect(TEAM_COLOUR_SETS.standard.paintGlow).toBe(0);
    expect(TEAM_COLOUR_SETS.highContrast.paintGlow).toBeGreaterThan(0);
    expect(dayColours(TEAM_COLOUR_SETS.highContrast, false)).toBe(TEAM_COLOUR_SETS.highContrast);
    expect(dayColours(TEAM_COLOUR_SETS.highContrast, true).paintGlow).toBe(0);
    expect(dayColours(TEAM_COLOUR_SETS.highContrast, true).figures).toBe(TEAM_COLOUR_SETS.highContrast.figures);
    expect(dayColours(TEAM_COLOUR_SETS.standard, true)).toBe(TEAM_COLOUR_SETS.standard);
  });

  it("lights the human's team paint at that share of the team colour, through the baked light's frames", () => {
    const glow = TEAM_COLOUR_SETS.highContrast.paintGlow;
    const f = figure('human', glow);
    const want = new THREE.Color(HC_ORANGE).multiplyScalar(glow);
    const paint = teamMaterials(f);
    expect(paint.length).toBeGreaterThan(0);
    for (const m of paint) expect(m.emissive.getHex()).toBe(want.getHex());
    // The baked light adds its bounce on top and keeps the glow (riggedFigure.light).
    f.light(0.5, 0.5, 0.5, new THREE.Color(0.01, 0.01, 0.01));
    for (const m of paint) expect(m.emissive.r).toBeCloseTo(want.r + 0.01, 6);
    // Nothing else glows.
    for (const m of f.materials as THREE.MeshStandardMaterial[]) if (!paint.includes(m) && m.emissive) expect(m.emissive.r).toBeCloseTo(0.01, 6);
    f.dispose();
  });

  it('leaves the paint unlit without a glow, and keeps the robot glow in the team colour as it was', () => {
    const plain = figure('human', undefined);
    for (const m of teamMaterials(plain)) expect(m.emissive.getHex()).toBe(0);
    plain.dispose();
    const glowing = figure('robot', 0.3);
    const without = figure('robot', 0);
    const lit = (f: RiggedFigure) => teamMaterials(f).map((m) => m.emissive.getHex());
    // The robot's own glowing parts are the team colour either way; its plain paint takes the share.
    const a = lit(glowing);
    const b = lit(without);
    a.forEach((hex, i) => (b[i] === 0 ? expect(hex).toBe(new THREE.Color(HC_ORANGE).multiplyScalar(0.3).getHex()) : expect(hex).toBe(b[i])));
    glowing.dispose();
    without.dispose();
  });
});
