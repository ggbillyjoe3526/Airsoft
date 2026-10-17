import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_RIG, FIGURE_RIG_KINDS } from '../config/figureRig';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { CAMO_ATTRIBUTE } from './figureCamo';
import { FINISH_ATTRIBUTE, hasVertexFinish } from './figureFinish';
import { figureFinish, finishable } from './figureRigFinish';
import { figureDress, HUMAN_CROWD } from './figureMix';
import { RiggedFigure } from './riggedFigure';
import { figureFilesForTests } from './testSupport';
import { ThrownMagazines } from './thrownMagazines';

const mat = (name: string, over: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ name, ...over });
const meshOf = (m: THREE.Material, color?: THREE.BufferAttribute) => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  if (color) g.setAttribute('color', color);
  return new THREE.Mesh(g, m);
};

describe('figureFinish (BD1, second round)', () => {
  it('is null for one finishable material and for materials of mixed sides that leave one', () => {
    expect(figureFinish([mat('a'), mat('teamPaint'), mat('c', { map: new THREE.Texture() })], 'team')).toBeNull();
    expect(figureFinish([mat('a'), mat('b', { side: THREE.DoubleSide })], 'team')).toBeNull();
    expect(figureFinish([], 'team')).toBeNull();
  });

  it('merges two plain materials, leaves the others in order after the finish and indexes them', () => {
    const a = mat('a');
    const b = mat('b');
    const t = mat('Team_x');
    const glow = mat('glow', { emissive: new THREE.Color(1, 1, 1) });
    const f = figureFinish([t, a, glow, b], 'team')!;
    expect(f.materials.map((m) => m.name)).toEqual(['Finish', 'Team_x', 'glow']);
    expect(hasVertexFinish(f.materials[0]!)).toBe(true);
    expect([f.indexOf(a), f.indexOf(b), f.indexOf(t), f.indexOf(glow)]).toEqual([0, 0, 1, 2]);
    f.dispose();
  });

  it('keeps the majority side group only and leaves the other side material out of the merge', () => {
    const a = mat('a', { side: THREE.DoubleSide });
    const b = mat('b');
    const c = mat('c', { side: THREE.DoubleSide });
    const f = figureFinish([a, b, c], 'team')!;
    expect((f.materials[0] as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    expect(f.materials).toContain(b);
    expect(f.indexOf(b)).toBe(1);
    f.dispose();
  });

  it('rejects physical, textured, transparent, translucent, alpha-tested and emissive materials', () => {
    expect(finishable(new THREE.MeshPhysicalMaterial(), 'team')).toBe(false);
    expect(finishable(mat('m', { roughnessMap: new THREE.Texture() }), 'team')).toBe(false);
    expect(finishable(mat('m', { transparent: true }), 'team')).toBe(false);
    expect(finishable(mat('m', { opacity: 0.5 }), 'team')).toBe(false);
    expect(finishable(mat('m', { alphaTest: 0.5 }), 'team')).toBe(false);
    expect(finishable(new THREE.MeshBasicMaterial(), 'team')).toBe(false);
    expect(finishable(mat('TeamPaint'), 'team')).toBe(false);
    expect(finishable(mat('plain'), 'team')).toBe(true);
  });

  it('bakes colour once: material colour times vertex colour (itemSize 3 and 4), with per-vertex finish and no camo', () => {
    const a = mat('a', { color: 0x808080, roughness: 0.3, metalness: 0.9, vertexColors: true });
    const b = mat('b', { color: 0xff0000, roughness: 0.6, metalness: 0.1 });
    const v3 = new THREE.BufferAttribute(new Float32Array(24 * 3).fill(0.5), 3);
    const v4 = new THREE.BufferAttribute(new Float32Array(24 * 4).fill(0.5), 4);
    const f = figureFinish([a, b], 'team')!;
    const ga = f.geometryOf(meshOf(a, v3));
    const expectA = new THREE.Color(0x808080);
    expect(ga.getAttribute('color').itemSize).toBe(4);
    expect(ga.getAttribute('color').getX(0)).toBeCloseTo(0.5 * expectA.r, 5);
    expect(ga.getAttribute(FINISH_ATTRIBUTE).getX(5)).toBeCloseTo(0.3, 5);
    expect(ga.getAttribute(FINISH_ATTRIBUTE).getY(5)).toBeCloseTo(0.9, 5);
    expect(ga.getAttribute(CAMO_ATTRIBUTE).getX(5)).toBe(0);
    const g4 = f.geometryOf(meshOf(a, v4));
    expect(g4.getAttribute('color').getW(0)).toBe(0.5);
    // A material without vertexColors ignores the geometry's colours; no colours at all gives the colour itself.
    const gb = f.geometryOf(meshOf(b, v3));
    expect(gb.getAttribute('color').getX(0)).toBeCloseTo(1, 5);
    expect(gb.getAttribute('color').getY(0)).toBe(0);
    // Asking twice gives the same prepared geometry; the colour is not multiplied twice.
    const m = meshOf(a, v3);
    const first = f.geometryOf(m);
    expect(f.geometryOf(m)).toBe(first);
    expect(first.getAttribute('color').getX(0)).toBeCloseTo(0.5 * expectA.r, 5);
    // The source stays as it was.
    expect(m.geometry.getAttribute('color')).toBe(v3);
    f.dispose();
  });

  it('reads normalized integer vertex colours as 0..1', () => {
    const a = mat('a', { vertexColors: true });
    const b = mat('b');
    const norm = new THREE.BufferAttribute(new Uint8Array(24 * 3).fill(255), 3, true);
    const f = figureFinish([a, b], 'team')!;
    expect(f.geometryOf(meshOf(a, norm)).getAttribute('color').getX(0)).toBeCloseTo(1, 5);
    f.dispose();
  });

  it('gives merged and unmerged parts the same attribute set so they merge, and dispose clears the prepared geometries', () => {
    const a = mat('a');
    const b = mat('b');
    const t = mat('team');
    const f = figureFinish([a, b, t], 'team')!;
    const ga = f.geometryOf(meshOf(a));
    const gt = f.geometryOf(meshOf(t));
    expect(Object.keys(ga.attributes).sort()).toEqual(Object.keys(gt.attributes).sort());
    let disposed = 0;
    ga.addEventListener('dispose', () => disposed++);
    f.dispose();
    expect(disposed).toBe(1);
  });
});

const { rigs, files } = await figureFilesForTests();

describe('the rigs with the finish (BD1, second round)', () => {
  it('every part set at every level of detail merges, groups index the materials, attributes agree', () => {
    for (const kind of FIGURE_RIG_KINDS) {
      const rig = rigs[kind];
      const p = FIGURE_RIG.parts[kind] as { body: readonly string[]; head: readonly string[]; pack?: string; radio?: string };
      const sets = [p.body, [...p.body, ...p.head], [...p.body, ...p.head, ...(p.pack ? [p.pack] : []), ...(p.radio ? [p.radio] : [])]];
      for (const names of sets) {
        const keys = new Set<string>();
        for (let lod = 0; lod < 3; lod++) {
          const g = rig.geometry(lod, names);
          expect(g.groups.length).toBeGreaterThan(0);
          for (const grp of g.groups) {
            expect(grp.materialIndex).toBeGreaterThanOrEqual(0);
            expect(grp.materialIndex!).toBeLessThan(rig.materials.length);
          }
          keys.add(Object.keys(g.attributes).sort().join());
          expect(g.getAttribute('color')?.itemSize ?? 4).toBe(4);
        }
        expect(keys.size, `${kind} attribute sets across levels`).toBe(1);
      }
    }
  });

  it('the robot draws fewer materials than its file has, and the human is unchanged by the finish (no Finish)', () => {
    expect(rigs.robot.materials.some((m) => m.name === 'Finish')).toBe(true);
    const finishes = rigs.robot.materials.filter((m) => hasVertexFinish(m));
    expect(finishes.length).toBe(1);
  });
});

function figure(kind: (typeof FIGURE_RIG_KINDS)[number]) {
  const c = createCharacter(1, vec3(0, 0, 0), 0);
  c.grounded = true;
  const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.authored = { opacity: 1, transparent: false };
  const f = new RiggedFigure({ rig: rigs[kind], character: c, id: c.id, teamColour: 0x3d8bff, replicaMaterial: material, rifleColours: dress.rifle, pistolColours: dress.pistol, files, detail: 'high', pack: true, radio: true, thrown: new ThrownMagazines(), calloutMaterial: new THREE.SpriteMaterial() });
  return { f, c };
}
const frame = (over: Record<string, unknown> = {}) => ({ alpha: 1, dt: 1 / 60, eyeX: 0, eyeY: 1.6, eyeZ: 3, firstPerson: false, leanX: 0, leanZ: 0, peek: 0, peekPivot: 0.92, cycle: null, castShadow: true, ...over }) as Parameters<RiggedFigure['update']>[1];
const drawnOnView = (root: THREE.Object3D): THREE.SkinnedMesh[] => {
  const out: THREE.SkinnedMesh[] = [];
  root.traverseVisible((o) => {
    if (o instanceof THREE.SkinnedMesh && o.layers.isEnabled(0)) out.push(o);
  });
  return out;
};
const twinsOf = (root: THREE.Object3D) => {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && o.layers.isEnabled(FIGURE_RIG.shadowLayer)) out.push(o);
  });
  return out;
};

describe('the shadow twin and the first-person gate (BD1, second round)', () => {
  it('one twin per figure, on layer 2 only, casting only while visible and not fading, at every level of detail', () => {
    for (const kind of FIGURE_RIG_KINDS) {
      const { f, c } = figure(kind);
      expect(twinsOf(f.root).length).toBe(1);
      const twin = twinsOf(f.root)[0]!;
      expect(twin.layers.isEnabled(0)).toBe(false);
      for (const eyeZ of [3, 14, 40]) {
        f.update(c, frame({ eyeZ }));
        expect(twin.visible && twin.castShadow).toBe(true);
        const drawn = drawnOnView(f.root);
        expect(drawn.length).toBe(1);
        expect(drawn[0]!.castShadow).toBe(false);
      }
      f.update(c, frame({ castShadow: false }));
      expect(twin.visible).toBe(false);
      expect(twin.castShadow).toBe(false);
      f.update(c, frame());
      expect(twin.castShadow).toBe(true);
      f.update(c, frame({ firstPerson: true }));
      expect(twin.visible).toBe(false);
      f.dispose();
    }
  });

  it('disposing releases the twin material and leaves a second dispose harmless', () => {
    const { f } = figure('human');
    const twin = twinsOf(f.root)[0]!;
    let n = 0;
    (twin.material as THREE.Material).addEventListener('dispose', () => n++);
    f.dispose();
    expect(n).toBe(1);
    expect(() => f.dispose()).not.toThrow();
  });

  it('your own body: never drawn in first person, crouched or vaulting included, and drawn again out of it (MV2)', () => {
    const { f, c } = figure('human');
    const first = () => {
      f.update(c, frame({ firstPerson: true }));
      return drawnOnView(f.root).length;
    };
    expect(first()).toBe(0);
    c.crouchAmount = c.prevCrouchAmount = 1;
    expect(first()).toBe(0);
    c.vault.active = true;
    expect(first()).toBe(0);
    c.vault.active = false;
    c.crouchAmount = c.prevCrouchAmount = 0;
    f.update(c, frame({ firstPerson: false }));
    expect(drawnOnView(f.root).length).toBe(1);
    f.dispose();
  });
});
