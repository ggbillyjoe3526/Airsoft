import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../config/figureRig';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { figureDress, HUMAN_CROWD } from './figureMix';
import type { FigureSidecar } from './figureRig';
import { type RiggedFrame, RiggedFigure } from './riggedFigure';
import { figureFilesForTests, modelScene, readFile } from './testSupport';
import { ThrownMagazines } from './thrownMagazines';

/** RM9: the human's four heads (picked by id, hidden in first person), the triangle budgets, the clip set. */

const { rigs, files } = await figureFilesForTests();
const heads = FIGURE_RIG.parts.human.head;
const bodyParts = FIGURE_RIG.parts.human.body;
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

const sidecar = JSON.parse(new TextDecoder().decode(await readFile(new URL('../assets/models/characters/human.json', import.meta.url)))) as FigureSidecar & { firstPerson: { hide: string[] }; parts?: string[] };
const scene = await modelScene('characters/human.glb');
const meshTris = new Map<string, number>();
scene.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  // A part is a node, each material's primitive a mesh under it.
  let node: THREE.Object3D | null = o;
  while (node && !sidecar.parts?.includes(node.name)) node = node.parent;
  const name = node?.name ?? o.name;
  meshTris.set(name, (meshTris.get(name) ?? 0) + tris(o.geometry));
});

function figureWithId(id: number) {
  const c = createCharacter(id, vec3(0, 0, 0), 0);
  c.grounded = true;
  const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.authored = { opacity: 1, transparent: false };
  const f = new RiggedFigure({ rig: rigs.human, character: c, id, teamColour: 0x3d8bff, replicaMaterial: material, rifleColours: dress.rifle, pistolColours: dress.pistol, files, detail: 'high', pack: true, radio: true, thrown: new ThrownMagazines(), calloutMaterial: new THREE.SpriteMaterial() });
  return { f, c };
}
const frame = (firstPerson: boolean): RiggedFrame => ({ alpha: 1, dt: 1 / 60, eyeX: 0, eyeY: 1.6, eyeZ: 3, firstPerson, leanX: 0, leanZ: 0, peek: 0, peekPivot: 0.92, cycle: null, castShadow: true });
const shownTriangles = (f: RiggedFigure): number[] => {
  const out: number[] = [];
  f.root.traverseVisible((o) => {
    if (o instanceof THREE.SkinnedMesh && o.parent?.name !== FIGURE_RIG.bones.hand && !o.parent?.name.startsWith('Grip')) out.push(tris(o.geometry));
  });
  return out;
};

describe('four heads, one per figure by id', () => {
  it('lists four heads, each in the file and the sidecar with its two lower levels of detail', () => {
    expect(heads.length).toBe(4);
    for (const h of heads) {
      for (const n of [h, `${h}_LOD1`, `${h}_LOD2`]) {
        expect(meshTris.has(n), `${n} in the glb`).toBe(true);
        expect(sidecar.parts, `${n} in the sidecar`).toContain(n);
      }
    }
    expect(rigs.human.parts).toEqual(expect.arrayContaining([...heads]));
  });

  it('gives ids 0 to 3 four different heads, and id 4 the first again', () => {
    const body = rigs.human.geometry(0, bodyParts);
    const seen = new Set<number>();
    for (let id = 0; id < 5; id++) {
      const { f, c } = figureWithId(id);
      f.update(c, frame(false));
      const shown = shownTriangles(f);
      const head = heads[id % 4]!;
      // The body mesh (with the head, pack and radio) has this head's triangles in it.
      const expected = tris(body) + meshTris.get(head)! + meshTris.get('Kit_Pack')! + meshTris.get('Kit_Radio')!;
      expect(shown, `id ${id}`).toContain(expected);
      seen.add(expected);
      if (id === 4) expect(shown).toContain(tris(body) + meshTris.get(heads[0]!)! + meshTris.get('Kit_Pack')! + meshTris.get('Kit_Radio')!);
      f.dispose();
    }
    expect(seen.size).toBe(4);
  });

  it('lists every head for first person in the sidecar, and draws nothing of your own figure there (MV2)', () => {
    for (const h of heads) for (const n of [h, `${h}_LOD1`, `${h}_LOD2`]) expect(sidecar.firstPerson.hide, n).toContain(n);
    for (let id = 0; id < 4; id++) {
      const { f, c } = figureWithId(id);
      f.update(c, frame(true));
      expect(shownTriangles(f), `id ${id}`).toEqual([]);
      f.dispose();
    }
  });
});

describe('budgets of the shipped human.glb', () => {
  it('keeps each head at 2,500 triangles or fewer', () => {
    for (const h of heads) expect(meshTris.get(h)!, h).toBeLessThanOrEqual(2500);
  });

  it('keeps a figure (body, kit, pack, radio and its largest head) at 20,000 triangles or fewer', () => {
    const base = ['Body', 'Kit', 'Kit_Pack', 'Kit_Radio'].reduce((s, n) => s + meshTris.get(n)!, 0);
    const largest = Math.max(...heads.map((h) => meshTris.get(h)!));
    expect(base + largest).toBeLessThanOrEqual(20_000);
  });

  it('keeps the packed file under 3.5 MB', async () => {
    expect((await readFile(new URL('../assets/models/characters/human.glb', import.meta.url))).byteLength).toBeLessThan(3_500_000);
  });

  it('keeps the clip set and its names as on main (ad9bb88), plus the rest, vault (RM10) and holster (BP4) clips both figures share', () => {
    const onMain = ["CrouchIdle", "CrouchWalk", "HitCall", "Idle", "Jump", "Pistol_Aim", "Pistol_AimDown", "Pistol_AimUp", "Pistol_Fire", "Pistol_Reload", "Rifle_Aim", "Rifle_AimDown", "Rifle_AimUp", "Rifle_Fire", "Rifle_Reload", "Run_B", "Run_F", "Run_L", "Run_R", "Sprint", "Switch", "WalkOff", "Walk_F"];
    const shared = ['Pistol_Rest', 'Pistol_RestDown', 'Pistol_RestUp', 'Rifle_Rest', 'Rifle_RestDown', 'Rifle_RestUp', 'Vault'];
    const want = [...onMain, ...shared, 'Holster', 'Holster_Sprint'].sort();
    const names = scene.animations.map((c) => c.name);
    expect([...names].sort()).toEqual(want);
    expect(sidecar.clips.map((c) => c.name).sort()).toEqual(want);
  });
});
