import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../../config/figureRig';
import { createCharacter } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { figureDress, HUMAN_CROWD } from './figureMix';
import type { FigureSidecar } from './figureRig';
import { type RiggedFrame, RiggedFigure } from './riggedFigure';
import { figureFilesForTests, modelScene, readFile } from '../testSupport';
import { ThrownMagazines } from './thrownMagazines';

/** RM10: the shipped robot.glb (v12): its triangle budgets, its clip set, its head and its team colour. */

const { rigs, files } = await figureFilesForTests();
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const sidecar = JSON.parse(new TextDecoder().decode(await readFile(new URL('../../assets/models/characters/robot.json', import.meta.url)))) as FigureSidecar & { firstPerson: { hide: string[] }; parts?: string[]; teamMaterials?: string };
const scene = await modelScene('characters/robot.glb');
const meshTris = new Map<string, number>();
const materialNames = new Set<string>();
scene.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  let node: THREE.Object3D | null = o;
  while (node && !sidecar.parts?.includes(node.name)) node = node.parent;
  const name = node?.name ?? o.name;
  meshTris.set(name, (meshTris.get(name) ?? 0) + tris(o.geometry));
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) materialNames.add(m.name);
});
const [headPart] = FIGURE_RIG.parts.robot.head;
const bodyParts = FIGURE_RIG.parts.robot.body;

describe('budgets of the shipped robot.glb (acceptance 4)', () => {
  it('keeps the head at 2,500 triangles or fewer, and the whole figure at 20,000 or fewer', () => {
    expect(meshTris.get(headPart!)!).toBeGreaterThan(0);
    expect(meshTris.get(headPart!)!).toBeLessThanOrEqual(2500);
    const whole = bodyParts.reduce((s, n) => s + meshTris.get(n)!, 0) + meshTris.get(headPart!)!;
    expect(whole).toBeLessThanOrEqual(20_000);
    // Redesigned with more detail than v11's figure: not a thin shell.
    expect(whole).toBeGreaterThan(10_000);
  });

  it('draws no more than the budget at each level of detail, each lower level lighter', () => {
    for (const base of [...bodyParts, headPart!]) {
      const lods = [base, `${base}_LOD1`, `${base}_LOD2`].map((n) => meshTris.get(n));
      expect(lods.every((t) => t !== undefined), base).toBe(true);
      expect(lods[1]!, base).toBeLessThan(lods[0]!);
      expect(lods[2]!, base).toBeLessThanOrEqual(lods[1]!);
    }
  });

  it('keeps the packed file under 3.5 MB', async () => {
    expect((await readFile(new URL('../../assets/models/characters/robot.glb', import.meta.url))).byteLength).toBeLessThan(3_500_000);
  });
});

describe('the robot clip set (acceptance 2 and 5)', () => {
  const v11 = ['CrouchIdle', 'CrouchWalk', 'HitCall', 'Idle', 'Jump', 'Pistol_Aim', 'Pistol_AimDown', 'Pistol_AimUp', 'Pistol_Fire', 'Pistol_Reload', 'Rifle_Aim', 'Rifle_AimDown', 'Rifle_AimUp', 'Rifle_Fire', 'Rifle_Reload', 'Run_B', 'Run_F', 'Run_L', 'Run_R', 'Sprint', 'Switch', 'WalkOff', 'Walk_F'];
  const added = ['Pistol_Rest', 'Pistol_RestDown', 'Pistol_RestUp', 'Rifle_Rest', 'Rifle_RestDown', 'Rifle_RestUp', 'Vault'];

  it('keeps every v11 clip by name and adds the six rest clips, the vault and the two holster clips (BP4): 32 in the file and the sidecar', () => {
    const want = [...v11, ...added, 'Holster', 'Holster_Sprint'].sort();
    expect(want).toHaveLength(32);
    expect(scene.animations.map((c) => c.name).sort()).toEqual(want);
    expect(sidecar.clips.map((c) => c.name).sort()).toEqual(want);
  });

  it('has the rest clips as held single poses on the upper body, and the vault as a whole-body clip that plays once', () => {
    // The sidecar carries each clip's frame count too (the Blender export's), which FigureSidecar doesn't type.
    const by = new Map(sidecar.clips.map((c) => [c.name, c as typeof c & { frames: number }]));
    for (const n of added.filter((a) => a !== 'Vault')) {
      expect(by.get(n)!.upperBodyOnly, n).toBe(true);
      expect(by.get(n)!.frames, n).toBe(1);
    }
    const vault = by.get('Vault')!;
    expect(vault.upperBodyOnly).toBe(false);
    expect(vault.loop).toBe(false);
    expect(vault.seconds).toBeGreaterThan(0.5);
    // The rig reads the same clips from the file as the sidecar describes.
    const inFile = scene.animations.find((c) => c.name === 'Vault')!;
    expect(inFile.duration).toBeCloseTo(vault.seconds, 1);
  });
});

describe('the robot head and team colour (acceptance 1, 3 and 7)', () => {
  it('lists its head, neck and all their levels of detail in the first-person hide list', () => {
    for (const n of [...FIGURE_RIG.parts.robot.head, 'Body_Neck']) for (const lod of [n, `${n}_LOD1`, `${n}_LOD2`]) expect(sidecar.firstPerson.hide, lod).toContain(lod);
    expect(sidecar.firstPerson.hide).not.toContain('Body');
  });

  it('draws the head in third person, and nothing of your own figure in first person (MV2)', () => {
    const c = createCharacter(0, vec3(0, 0, 0), 0);
    c.grounded = true;
    const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    material.userData.authored = { opacity: 1, transparent: false };
    const f = new RiggedFigure({ rig: rigs.robot, character: c, id: 0, teamColour: 0x3d8bff, replicaMaterial: material, rifleColours: dress.rifle, pistolColours: dress.pistol, files, detail: 'high', pack: true, radio: true, thrown: new ThrownMagazines(), calloutMaterial: new THREE.SpriteMaterial() });
    const frame = (firstPerson: boolean): RiggedFrame => ({ alpha: 1, dt: 1 / 60, eyeX: 0, eyeY: 1.6, eyeZ: 3, firstPerson, leanX: 0, leanZ: 0, peek: 0, peekPivot: 0.92, cycle: null, castShadow: true });
    const shown = (): number[] => {
      const out: number[] = [];
      f.root.traverseVisible((o) => {
        if (o instanceof THREE.SkinnedMesh && o.parent?.name !== FIGURE_RIG.bones.hand && !o.parent?.name.startsWith('Grip')) out.push(tris(o.geometry));
      });
      return out;
    };
    const body = tris(rigs.robot.geometry(0, bodyParts));
    f.update(c, frame(false));
    expect(Math.max(...shown())).toBeGreaterThanOrEqual(body + meshTris.get(headPart!)!);
    // Your own figure is never drawn in first person (MV2), head or body.
    f.update(c, frame(true));
    expect(shown()).toEqual([]);
    f.dispose();
  });

  it('has team materials for the highlights, and ships no pouch, holster, magazine or pack part', () => {
    expect(sidecar.teamMaterials).toMatch(/^tint materials whose names start with Team/);
    expect([...materialNames].some((n) => n.startsWith('Team'))).toBe(true);
    expect(sidecar.parts).toEqual(['Body', 'Body_LOD1', 'Body_LOD2', 'Body_Neck', 'Body_Neck_LOD1', 'Body_Neck_LOD2', 'Head_Headset', 'Head_Headset_LOD1', 'Head_Headset_LOD2']);
    scene.traverse((o) => expect(o.name.toLowerCase()).not.toMatch(/pouch|holster|pack|mag(azine)?\b/));
  });
});
