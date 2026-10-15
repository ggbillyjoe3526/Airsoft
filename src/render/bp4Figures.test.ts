import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { FIGURE_RIG, FIGURE_RIG_KINDS, type FigureRigKind } from '../config/figureRig';
import { factoryParts } from '../config/attachments';
import { AEG, CYBER_PISTOL, GAS_PISTOL, type ReplicaConfig } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { figureDress, HUMAN_CROWD } from './figureMix';
import { prepareReplicaFile, type ReplicaFiles } from './replicaFiles';
import { type RiggedFrame, RiggedFigure } from './riggedFigure';
import { figureFilesForTests, modelScene } from './testSupport';
import { ThrownMagazines } from './thrownMagazines';

/** BP4 (Blender models bug pass): the rigged figures' fixes, built as render/riggedFigure.test.ts builds them. */

const base = await figureFilesForTests();
const { rigs } = base;
// The Cyber Pistol's file too, for the kit of two pistols.
const files: ReplicaFiles = new Map([...base.files, ['cyber', prepareReplicaFile('cyber', await modelScene('replicas/cyber.glb'), await modelScene('replicaParts/cyber.glb'))]]);

function figure(kind: FigureRigKind, c: Character, detail: 'high' | 'low' = 'high', thrown = new ThrownMagazines()) {
  c.grounded = true;
  const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.authored = { opacity: 1, transparent: false };
  const f = new RiggedFigure({ rig: rigs[kind], character: c, id: c.id, teamColour: 0x3d8bff, replicaMaterial: material, rifleColours: dress.rifle, pistolColours: dress.pistol, files, detail, pack: true, radio: true, thrown, calloutMaterial: new THREE.SpriteMaterial() });
  return { f, thrown };
}
const frame = (over: Partial<RiggedFrame> = {}): RiggedFrame => ({ alpha: 1, dt: 1 / 60, eyeX: 0, eyeY: 1, eyeZ: 3, firstPerson: false, leanX: 0, leanZ: 0, peek: 0, peekPivot: 0.92, cycle: null, castShadow: true, ...over });
const settle = (f: RiggedFigure, c: Character, n = 40, over: Partial<RiggedFrame> = {}): void => {
  for (let i = 0; i < n; i++) f.update(c, frame(over));
};
const skinnedCount = (f: RiggedFigure): number => {
  let n = -1;
  f.root.traverseVisible((o) => {
    if (o instanceof THREE.SkinnedMesh) n = o.geometry.getAttribute('position').count;
  });
  return n;
};
const holders = (f: RiggedFigure, name: string): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  f.root.traverse((o) => o.name === name && out.push(o));
  return out;
};
const holder = (f: RiggedFigure, name: string): THREE.Object3D => holders(f, name)[0]!;
const meshChildren = (o: THREE.Object3D): THREE.Mesh[] => o.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

/** Plays a reload from `from` seconds down to `to`, a step at a time. */
function reload(f: RiggedFigure, c: Character, from: number, to: number): void {
  for (let t = from; t > to; t -= 1 / 60) {
    c.armament.reload = t;
    f.update(c, frame());
  }
}

describe('F1 a reload carried on under a sprint doesn\'t throw its old magazine twice', () => {
  it('throws once when the arms come back to a reload that passed the release meanwhile', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    const { f, thrown } = figure('robot', c);
    settle(f, c, 10);
    const time = c.armament.handling[c.armament.active]!.reloadTime;
    let t = time;
    for (; t > 0 && thrown.count === 0; t -= 1 / 60) {
      c.armament.reload = t;
      f.update(c, frame());
    }
    expect(thrown.count).toBe(1);
    // A sprint takes the arms off the reload, which carries on; then the sprint ends with the reload still running.
    c.sprinting = true;
    c.velocity.z = -6;
    for (; t > time * 0.3; t -= 1 / 60) {
      c.armament.reload = t;
      f.update(c, frame());
    }
    c.sprinting = false;
    c.velocity.z = 0;
    reload(f, c, t, 0);
    c.armament.reload = 0;
    settle(f, c, 5);
    expect(thrown.count).toBe(1);
    f.dispose();
  });

  it('still throws one for each reload after another', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    const { f, thrown } = figure('robot', c);
    settle(f, c, 10);
    const time = c.armament.handling[c.armament.active]!.reloadTime;
    reload(f, c, time, 0);
    c.armament.reload = 0;
    settle(f, c, 30);
    expect(thrown.count).toBe(1);
    reload(f, c, time, 0);
    expect(thrown.count).toBe(2);
    f.dispose();
  });
});

describe('F5 level of detail', () => {
  const at = (kind: FigureRigKind, dist: number, detail: 'high' | 'low' = 'high') => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    const r = figure(kind, c, detail);
    settle(r.f, c, 1, { eyeZ: dist });
    return { ...r, c };
  };

  it('changes a step at a time with FIGURE_RIG.lodGive past each line', () => {
    for (const kind of FIGURE_RIG_KINDS) {
      const [l1, l2] = FIGURE_RIG.lod.high;
      const counts = [0, 1, 2].map((lod) => {
        const r = at(kind, [3, (l1! + l2!) / 2, l2! + 10][lod]!);
        const n = skinnedCount(r.f);
        r.f.dispose();
        return n;
      });
      expect(new Set(counts).size, kind).toBe(3);
      const { f, c } = at(kind, 3);
      const seen = (d: number): number => (settle(f, c, 1, { eyeZ: d }), skinnedCount(f));
      const g = FIGURE_RIG.lodGive;
      expect(seen(l1! + g * 0.5)).toBe(counts[0]);
      expect(seen(l1! + g * 2)).toBe(counts[1]);
      // Back over the line: held until it is `give` inside.
      expect(seen(l1! - g * 0.5)).toBe(counts[1]);
      expect(seen(l1! - g * 2)).toBe(counts[0]);
      // Crossing the first line alone doesn't take it to LOD2.
      expect(seen(l2! - 1)).toBe(counts[1]);
      expect(seen(l2! + g * 0.5)).toBe(counts[1]);
      expect(seen(l2! + g * 2)).toBe(counts[2]);
      // A jump across both lines (a new target) steps all the way, either way.
      expect(seen(3)).toBe(counts[0]);
      expect(seen(l2! + 20)).toBe(counts[2]);
      expect(seen(3)).toBe(counts[0]);
      f.dispose();
    }
  });

  it('shows the replica\'s whole model exactly at LOD0, the small figure version beyond', () => {
    const [l1] = FIGURE_RIG.lod.high;
    const { f, c } = at('human', 3);
    const shows = (d: number): boolean[] => {
      settle(f, c, 1, { eyeZ: d });
      const meshes = meshChildren(holder(f, 'held:rifle')).concat(meshChildren(holder(f, 'held:pistol')));
      return meshes.map((m) => m.visible);
    };
    const nearOnes = meshChildren(holder(f, 'held:pistol'));
    expect(nearOnes.length).toBeGreaterThanOrEqual(2);
    const near = shows(l1! - 1);
    // On the give: LOD0 still, so still the whole model.
    expect(shows(l1! + FIGURE_RIG.lodGive * 0.5)).toEqual(near);
    const far = shows(l1! + FIGURE_RIG.lodGive * 2);
    // Something is a whole model at LOD0 and hidden beyond, and the small version the reverse.
    expect(near.some((v, i) => v && !far[i])).toBe(true);
    expect(far.some((v, i) => v && !near[i])).toBe(true);
    expect('fullReplica' in FIGURE_RIG).toBe(false);
    f.dispose();
  });
});

describe('F7 a magazine thrown in the air lands on the ground last stood on', () => {
  it('rests near the ground, not at the airborne height', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    const { f, thrown } = figure('robot', c);
    settle(f, c, 10);
    // Jumps: a metre and a half up, off the ground, and reloads there.
    c.grounded = false;
    c.position.y = c.prevPosition.y = 1.5;
    settle(f, c, 10);
    const time = c.armament.handling[c.armament.active]!.reloadTime;
    reload(f, c, time, 0);
    expect(thrown.count).toBe(1);
    for (let i = 0; i < 90; i++) thrown.update(1 / 60);
    const mag = thrown.object.children[0]!;
    expect(mag.position.y).toBeGreaterThanOrEqual(0);
    expect(mag.position.y).toBeLessThan(0.05);
    f.dispose();
  });
});

describe('F9 a kit of two pistols draws the one out', () => {
  const kit = (): Character => {
    const c = createCharacter(2, vec3(0, 0, 0), 0);
    c.armament = createArmament([CYBER_PISTOL, GAS_PISTOL]);
    return c;
  };

  it('builds one held replica per loadout slot, named by hold and tagged with its slot', () => {
    const { f } = figure('human', kit());
    const pistols = holders(f, 'held:pistol');
    expect(pistols.map((h) => h.userData.slot).sort()).toEqual([0, 1]);
    expect(holders(f, 'held:rifle')).toHaveLength(0);
    f.dispose();
    const c = createCharacter(2, vec3(0, 0, 0), 0);
    const g = figure('human', c).f;
    expect(holders(g, 'held:rifle').map((h) => h.userData.slot)).toEqual([0]);
    expect(holders(g, 'held:pistol').map((h) => h.userData.slot)).toEqual([1]);
    g.dispose();
  });

  it('shows the active slot\'s and swaps when the other is drawn', () => {
    const c = kit();
    const { f } = figure('human', c);
    settle(f, c);
    const visible = (): number[] => holders(f, 'held:pistol').filter((h) => h.visible).map((h) => h.userData.slot as number);
    expect(visible()).toEqual([0]);
    c.armament.active = 1;
    settle(f, c);
    expect(visible()).toEqual([1]);
    c.armament.active = 0;
    settle(f, c);
    expect(visible()).toEqual([0]);
    f.dispose();
  });
});

describe('the holstered pose (M92, BP4)', () => {
  const slung = (kind: FigureRigKind) => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    c.armament.holstered = true;
    const r = figure(kind, c);
    settle(r.f, c, 40);
    return { ...r, c };
  };

  it('slings the rifle on the chest bone at the sling frame, visible, with the pistol away', () => {
    for (const kind of FIGURE_RIG_KINDS) {
      const { f } = slung(kind);
      const rifle = holder(f, 'held:rifle');
      expect(rifle.parent?.name, kind).toBe(FIGURE_RIG.bones.chest);
      expect(rifle.visible, kind).toBe(true);
      expect(holder(f, 'held:pistol').visible, kind).toBe(false);
      // Behind the figure (it faces -Z), its muzzle end low and to the left, the butt high on the right.
      f.root.updateMatrixWorld(true);
      const p = rifle.getWorldPosition(new THREE.Vector3());
      expect(p.z, kind).toBeGreaterThan(0);
      const bore = new THREE.Vector3(0, 0, -1).transformDirection(rifle.matrixWorld);
      expect(bore.y, kind).toBeLessThan(-0.3);
      expect(bore.x, kind).toBeLessThan(-0.3);
      f.dispose();
    }
  });

  it('hangs the arms (no aim weight) while holstered', () => {
    const { f } = slung('human');
    const hand = new THREE.Vector3();
    f.root.updateMatrixWorld(true);
    f.root.getObjectByName(FIGURE_RIG.bones.hand)!.getWorldPosition(hand);
    expect(hand.y).toBeLessThan(1.1);
    f.dispose();
  });

  it('brings the rifle to the grip FIGURE.holster.swapAt of the way through the draw', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    c.armament.holstered = true;
    const { f } = figure('human', c);
    settle(f, c, 30);
    c.armament.holstered = false;
    c.armament.drawTotal = 1;
    const parentAt = (left: number): string | undefined => {
      c.armament.draw = left;
      settle(f, c, 1);
      return holder(f, 'held:rifle').parent?.name;
    };
    expect(parentAt(0.95)).toBe(FIGURE_RIG.bones.chest);
    expect(parentAt(1 - FIGURE.holster.swapAt + 0.05)).toBe(FIGURE_RIG.bones.chest);
    expect(parentAt(1 - FIGURE.holster.swapAt - 0.05)).toBe(FIGURE_RIG.bones.grip);
    c.armament.draw = 0;
    settle(f, c, 40);
    expect(holder(f, 'held:rifle').parent?.name).toBe(FIGURE_RIG.bones.grip);
    expect(holder(f, 'held:rifle').visible).toBe(true);
    f.dispose();
  });

  it('does not sling a figure that is not alive', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    c.armament.holstered = true;
    c.status = 'calling';
    const { f } = figure('robot', c);
    settle(f, c, 30);
    expect(holder(f, 'held:rifle').parent?.name).toBe(FIGURE_RIG.bones.grip);
    f.dispose();
  });
});

describe('RiggedFigure.muzzleWorld (BB start)', () => {
  const standing = (armament?: Character['armament']) => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    if (armament) c.armament = armament;
    const { f } = figure('human', c);
    settle(f, c);
    return { f, c };
  };

  it('gives the drawn muzzle of the replica in hand, out ahead of the grip along the bore', () => {
    const { f } = standing();
    const out = new THREE.Vector3();
    expect(f.muzzleWorld(false, out)).toBe(true);
    const rifle = holder(f, 'held:rifle');
    const grip = rifle.getWorldPosition(new THREE.Vector3());
    const bore = new THREE.Vector3(0, 0, -1).transformDirection(rifle.matrixWorld);
    const d = out.clone().sub(grip);
    expect(d.length()).toBeGreaterThan(0.3);
    expect(d.normalize().dot(bore)).toBeGreaterThan(0.9);
    // The other replica isn't out.
    expect(f.muzzleWorld(true, out)).toBe(false);
    f.dispose();
  });

  it('is out at a longer barrel\'s end', () => {
    const plain = standing();
    const longBarrel = standing(createArmament([AEG, GAS_PISTOL] as ReplicaConfig[], [{ ...factoryParts(AEG), barrel: 'long' }]));
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    plain.f.muzzleWorld(false, a);
    longBarrel.f.muzzleWorld(false, b);
    expect(a.distanceTo(b)).toBeCloseTo(0.1, 2);
  });

  it('is false in first person, when the rifle is slung, and at the pistol once it is drawn', () => {
    const { f, c } = standing();
    const out = new THREE.Vector3();
    settle(f, c, 2, { firstPerson: true });
    expect(f.muzzleWorld(false, out)).toBe(false);
    settle(f, c, 2);
    expect(f.muzzleWorld(false, out)).toBe(true);
    c.armament.active = 1;
    settle(f, c);
    expect(f.muzzleWorld(true, out)).toBe(true);
    expect(f.muzzleWorld(false, out)).toBe(false);
    f.dispose();
    const s = createCharacter(1, vec3(0, 0, 0), 0);
    s.armament.holstered = true;
    const g = figure('robot', s).f;
    settle(g, s);
    expect(g.muzzleWorld(false, out)).toBe(false);
    g.dispose();
  });
});
