import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_RIG, FIGURE_RIG_KINDS, type FigureRigKind } from '../config/figureRig';
import { type Character, createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { figureDress, HUMAN_CROWD } from './figureMix';
import { type RiggedFrame, RiggedFigure } from './riggedFigure';
import { figureFilesForTests } from './testSupport';
import { ThrownMagazines } from './thrownMagazines';

const { rigs, files } = await figureFilesForTests();

function figure(kind: FigureRigKind, c: Character, thrown = new ThrownMagazines()) {
  // On the ground, as the movement leaves a character standing (a new one starts in the air).
  c.grounded = true;
  const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.authored = { opacity: 1, transparent: false };
  const f = new RiggedFigure({
    rig: rigs[kind],
    character: c,
    id: c.id,
    teamColour: 0x3d8bff,
    replicaMaterial: material,
    rifleColours: dress.rifle,
    pistolColours: dress.pistol,
    files,
    detail: 'high',
    pack: true,
    radio: true,
    thrown,
    calloutMaterial: new THREE.SpriteMaterial(),
  });
  return { f, thrown };
}

const frame = (over: Partial<RiggedFrame> = {}): RiggedFrame => ({ alpha: 1, dt: 1 / 60, eyeX: 0, eyeY: 1.6, eyeZ: 3, firstPerson: false, leanX: 0, leanZ: 0, castShadow: true, ...over });

const visibleMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};

const worldOf = (root: THREE.Object3D, name: string): THREE.Vector3 => {
  root.updateMatrixWorld(true);
  return root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
};

/** The replica points where the shot goes (aimDirection) at every pitch the view takes, to within 3 degrees. */
function expectAimed(f: RiggedFigure, c: Character, held: string): void {
  // Back and forth, so a pose held between frames is checked as well as one just reached.
  for (const pitch of [-1.2, -0.6, -0.2, 0, 0.3, 0.8, 1.2, 0, 0.8, 0.8, -0.6]) {
    c.pitch = c.prevPitch = pitch;
    for (let i = 0; i < 40; i++) f.update(c, frame());
    f.root.updateMatrixWorld(true);
    const bore = new THREE.Vector3(0, 0, -1).transformDirection(f.root.getObjectByName(held)!.matrixWorld);
    const shot = new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch));
    expect(THREE.MathUtils.radToDeg(bore.angleTo(shot)), `${held} at pitch ${pitch}`).toBeLessThan(3);
  }
  c.pitch = c.prevPitch = 0;
  for (let i = 0; i < 40; i++) f.update(c, frame());
}

describe('the rigged figures (BF1)', () => {
  it('takes both files apart: every clip slot, the replica and magazine matrices, three levels of detail', () => {
    for (const kind of FIGURE_RIG_KINDS) {
      const r = rigs[kind];
      expect(r.boneNames.length).toBe(65);
      expect(r.magazines.rifle).not.toBeNull();
      expect(r.magazines.pistol).not.toBeNull();
      for (let lod = 0; lod < 3; lod++) expect(r.geometry(lod, FIGURE_RIG.parts[kind].body).getAttribute('position').count).toBeGreaterThan(0);
      // The levels of detail get lighter.
      const tris = [0, 1, 2].map((lod) => r.geometry(lod, FIGURE_RIG.parts[kind].body).getAttribute('position').count);
      expect(tris[1]).toBeLessThan(tris[0]!);
      expect(tris[2]).toBeLessThan(tris[1]!);
    }
  });

  it('holds the rifle in the right fist ahead of the chest, pointed where the shot goes', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    const { f } = figure('human', c);
    for (let i = 0; i < 30; i++) f.update(c, frame());
    const held = f.root.getObjectByName('held:rifle')!;
    expect(held.visible).toBe(true);
    expect(f.root.getObjectByName('held:pistol')!.visible).toBe(false);
    const level = worldOf(f.root, 'held:rifle');
    // Facing -Z at yaw 0: the replica is in front of the figure, at about chest height.
    expect(level.z).toBeLessThan(0);
    expect(level.y).toBeGreaterThan(1.1);
    expect(level.y).toBeLessThan(1.6);
    // The muzzle points ahead (-Z in the replica's frame is forward).
    const ahead = new THREE.Vector3(0, 0, -1).transformDirection(held.matrixWorld);
    expect(ahead.z).toBeLessThan(-0.9);
    expectAimed(f, c, 'held:rifle');
    f.dispose();
  });

  it('in a reload pulls the old magazine, throws it and seats a fresh one', () => {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    const { f, thrown } = figure('robot', c);
    for (let i = 0; i < 10; i++) f.update(c, frame());
    const time = c.armament.handling[c.armament.active]!.reloadTime;
    let sawFresh = false;
    let sawOld = false;
    for (let t = time; t > 0; t -= 1 / 60) {
      c.armament.reload = t;
      f.update(c, frame());
      // A magazine in the left hand (the old one out, then the fresh one in).
      sawFresh ||= visibleMeshes(f.root).some((m) => m.parent?.name === FIGURE_RIG.bones.hand);
      sawOld ||= thrown.count > 0;
    }
    c.armament.reload = 0;
    f.update(c, frame());
    expect(sawFresh).toBe(true);
    expect(sawOld).toBe(true);
    expect(thrown.count).toBe(1);
    // It falls to the ground and lies there.
    for (let i = 0; i < 120; i++) thrown.update(1 / 60);
    const mag = thrown.object.children[0]!;
    expect(mag.position.y).toBeGreaterThanOrEqual(0);
    expect(mag.position.y).toBeLessThan(0.05);
    for (let i = 0; i < 120; i++) thrown.update(1 / 60);
    expect(thrown.count).toBe(0);
    f.dispose();
  });

  it('switches to the pistol, and as your own body is drawn without its head, arms or replica', () => {
    const c = createCharacter(2, vec3(0, 0, 0), 0);
    const { f } = figure('human', c);
    f.update(c, frame());
    c.armament.active = 1;
    c.armament.draw = c.armament.handling[1]!.drawTime;
    for (let t = c.armament.draw; t > 0; t -= 1 / 60) {
      c.armament.draw = t;
      f.update(c, frame());
    }
    c.armament.draw = 0;
    for (let i = 0; i < 10; i++) f.update(c, frame());
    expect(f.root.getObjectByName('held:pistol')!.visible).toBe(true);
    expect(f.root.getObjectByName('held:rifle')!.visible).toBe(false);
    expectAimed(f, c, 'held:pistol');

    const third = visibleMeshes(f.root).filter((m) => m instanceof THREE.SkinnedMesh);
    expect(third.length).toBe(1);
    f.update(c, frame({ firstPerson: true }));
    const first = visibleMeshes(f.root).filter((m) => m instanceof THREE.SkinnedMesh);
    expect(first.length).toBe(1);
    expect(first[0]).not.toBe(third[0]);
    expect(first[0]!.geometry.getAttribute('position').count).toBeLessThan(third[0]!.geometry.getAttribute('position').count);
    expect(first[0]!.castShadow).toBe(false);
    expect(f.root.getObjectByName('held:pistol')!.visible).toBe(false);
    // Behind the eyes: drawn back along the facing (+Z at yaw 0).
    expect(f.root.position.z).toBeCloseTo(FIGURE_RIG.firstPerson.back, 6);
    f.update(c, frame());
    expect(f.root.position.z).toBeCloseTo(0, 6);
    f.dispose();
  });

  it('calls its hit with the hand up and the replica lowered, and draws farther figures lighter', () => {
    const c = createCharacter(3, vec3(0, 0, 0), 0);
    const { f } = figure('human', c);
    for (let i = 0; i < 10; i++) f.update(c, frame());
    const hand = worldOf(f.root, 'Hand_L').y;
    c.status = 'calling';
    c.statusTime = 0;
    for (let i = 0; i < 40; i++) {
      c.statusTime += 1 / 60;
      f.update(c, frame());
    }
    expect(worldOf(f.root, 'Hand_L').y).toBeGreaterThan(hand + 0.2);
    c.status = 'alive';
    const near = visibleMeshes(f.root).find((m) => m instanceof THREE.SkinnedMesh)!;
    f.update(c, frame({ eyeZ: 40 }));
    const far = visibleMeshes(f.root).find((m) => m instanceof THREE.SkinnedMesh)!;
    expect(far).not.toBe(near);
    expect(far.geometry.getAttribute('position').count).toBeLessThan(near.geometry.getAttribute('position').count);
    f.dispose();
  });
});
