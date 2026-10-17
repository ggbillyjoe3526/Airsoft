import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../../config/figureRig';
import { stepThrown, ThrownMagazines } from './thrownMagazines';

/** BF1 acceptance 3: the thrown magazine falls and lies on the ground, a few at most, freed with its thrower. */

/** A magazine-shaped box: thinnest along `thin` (0 x, 1 y, 2 z). */
const box = (thin: 0 | 1 | 2): THREE.BoxGeometry => new THREE.BoxGeometry(...([0.05, 0.1, 0.03].map((v, i) => (i === thin ? 0.01 : Math.max(v, 0.05))) as [number, number, number]));
const mat = (): THREE.Material => new THREE.MeshBasicMaterial();
const throwAt = (t: ThrownMagazines, g: THREE.BufferGeometry, m: THREE.Material, over: { y?: number; spin?: THREE.Vector3; v?: THREE.Vector3; life?: number; ground?: number } = {}) =>
  t.throw(g, m, new THREE.Matrix4().makeTranslation(0, over.y ?? 1, 0), over.v ?? new THREE.Vector3(1, 1, 0), over.spin ?? new THREE.Vector3(3, 2, 1), 9.8, over.ground ?? 0, over.life ?? 10, true);

describe('stepThrown', () => {
  const flying = (flatAxis: THREE.Vector3) => ({ velocity: new THREE.Vector3(1, 2, 0), spin: new THREE.Vector3(4, 0, 0), gravity: 10, restY: 0.02, flatAxis, landed: false });

  it('falls under gravity and turns by its spin while in the air', () => {
    const f = flying(new THREE.Vector3(0, 1, 0));
    const p = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    stepThrown(f, p, q, 0.1);
    expect(f.velocity.y).toBeCloseTo(1, 5);
    expect(p.x).toBeCloseTo(0.1, 5);
    expect(p.y).toBeCloseTo(1.1, 5);
    expect(f.landed).toBe(false);
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(0.4, 4);
  });

  it('lands at its rest height with its thin axis straight up or down, whatever it turned to', () => {
    for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      const f = flying(axis);
      f.velocity.set(0, -3, 0);
      const p = new THREE.Vector3(0, 0.03, 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 1.9, 2.4));
      stepThrown(f, p, q, 0.05);
      expect(f.landed).toBe(true);
      expect(p.y).toBe(0.02);
      expect(Math.abs(axis.clone().applyQuaternion(q).y)).toBeCloseTo(1, 5);
    }
  });

  it('a landed magazine stays put', () => {
    const f = flying(new THREE.Vector3(0, 1, 0));
    f.landed = true;
    const p = new THREE.Vector3(1, 0.02, 1);
    const q = new THREE.Quaternion(0, 0, 0, 1);
    stepThrown(f, p, q, 0.5);
    expect(p.toArray()).toEqual([1, 0.02, 1]);
    expect(f.velocity.y).toBe(2);
  });
});

describe('ThrownMagazines', () => {
  it('a thrown magazine flies, lands on the ground lying on its thinnest side and expires after its lifetime', () => {
    for (const thin of [0, 1, 2] as const) {
      const t = new ThrownMagazines();
      throwAt(t, box(thin), mat(), { y: 1.2, life: 3 });
      expect(t.count).toBe(1);
      expect(t.object.children).toHaveLength(1);
      const mesh = t.object.children[0] as THREE.Mesh;
      for (let i = 0; i < 120; i++) t.update(1 / 60);
      expect(mesh.position.y).toBeCloseTo(0.005, 4);
      const axis = new THREE.Vector3().setComponent(thin, 1).applyQuaternion(mesh.quaternion);
      expect(Math.abs(axis.y)).toBeCloseTo(1, 4);
      expect(t.count).toBe(1);
      for (let i = 0; i < 70; i++) t.update(1 / 60);
      expect(t.count).toBe(0);
      expect(t.object.children).toHaveLength(0);
    }
  });

  it('lands on the ground height it was thrown over', () => {
    const t = new ThrownMagazines();
    throwAt(t, box(1), mat(), { ground: 2.5, y: 3 });
    for (let i = 0; i < 120; i++) t.update(1 / 60);
    expect((t.object.children[0] as THREE.Mesh).position.y).toBeCloseTo(2.505, 4);
  });

  it('copies its inputs and carries the shadow setting', () => {
    const t = new ThrownMagazines();
    const v = new THREE.Vector3(0, 5, 0);
    t.throw(box(1), mat(), new THREE.Matrix4(), v, new THREE.Vector3(), 9.8, 0, 5, false);
    v.set(0, 0, 0);
    const mesh = t.object.children[0] as THREE.Mesh;
    expect(mesh.castShadow).toBe(false);
    t.update(0.1);
    expect(mesh.position.y).toBeGreaterThan(0.3);
  });

  it('reuses its meshes: a magazine thrown after one has gone is drawn with the same mesh, starting afresh', () => {
    const t = new ThrownMagazines();
    throwAt(t, box(1), mat(), { life: 0.5 });
    const first = t.object.children[0];
    for (let i = 0; i < 60; i++) t.update(1 / 60);
    expect(t.count).toBe(0);
    const g = box(2);
    throwAt(t, g, mat(), { y: 3 });
    const again = t.object.children[0] as THREE.Mesh;
    expect(again).toBe(first);
    expect(again.geometry).toBe(g);
    expect(again.position.y).toBeCloseTo(3, 6);
    t.update(1 / 60);
    expect(again.position.y).toBeGreaterThan(3);
  });

  it('holds at most FIGURE_RIG.thrownMagazines.max, the oldest going first', () => {
    const t = new ThrownMagazines();
    const max = FIGURE_RIG.thrownMagazines.max;
    const geos = Array.from({ length: max + 3 }, () => box(1));
    for (const g of geos) throwAt(t, g, mat());
    expect(t.count).toBe(max);
    const left = t.object.children.map((c) => (c as THREE.Mesh).geometry);
    expect(left).toEqual(geos.slice(3));
  });

  it('forget removes the magazines of a geometry or a material (a freed thrower), not the others', () => {
    const t = new ThrownMagazines();
    const g1 = box(1);
    const g2 = box(1);
    const m1 = mat();
    const m2 = mat();
    throwAt(t, g1, m1);
    throwAt(t, g2, m1);
    throwAt(t, g2, m2);
    throwAt(t, g1, m2);
    t.forget(g1, null);
    expect(t.count).toBe(2);
    t.forget(null, m1);
    expect(t.count).toBe(1);
    expect((t.object.children[0] as THREE.Mesh).geometry).toBe(g2);
    expect((t.object.children[0] as THREE.Mesh).material).toBe(m2);
    t.forget(null, null);
    expect(t.count).toBe(1);
  });

  it('clear empties it and dispose takes its group out of the scene', () => {
    const t = new ThrownMagazines();
    const scene = new THREE.Group();
    scene.add(t.object);
    throwAt(t, box(1), mat());
    throwAt(t, box(1), mat());
    t.clear();
    expect(t.count).toBe(0);
    expect(t.object.children).toHaveLength(0);
    throwAt(t, box(1), mat());
    t.dispose();
    expect(t.count).toBe(0);
    expect(t.object.parent).toBeNull();
  });
});
