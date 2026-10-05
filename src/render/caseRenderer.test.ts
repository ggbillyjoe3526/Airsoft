import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createRunState, DROPPED_CASE, type RunCase } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { CaseRenderer } from './caseRenderer';

function runCase(kind: string, x: number): RunCase {
  const dropped = kind === DROPPED_CASE;
  return { kind, name: kind, position: vec3(x, 0, 0), yaw: 0.5, openTime: 2, heard: 8, finds: [], open: false, dropped };
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) out.push(c);
  });
  return out;
}

/** Instance `i` of `m`'s matrix in the world. */
function instanceAt(m: THREE.InstancedMesh, i: number): THREE.Matrix4 {
  m.updateWorldMatrix(true, false);
  const at = new THREE.Matrix4();
  m.getMatrixAt(i, at);
  return at.premultiply(m.matrixWorld);
}

const named = (o: THREE.Object3D, name: string): THREE.InstancedMesh => o.getObjectByName(name) as THREE.InstancedMesh;

describe('CaseRenderer (M44, instanced in M48)', () => {
  it('draws the run’s cases in two instanced draws a kind (the banded bodies, the lids or doors), whatever their number', () => {
    const run = createRunState();
    run.cases = [runCase('ammo-can', 0), runCase('ammo-can', 2), runCase('locker', 4), runCase('field-case', 6), runCase('ammo-can', 8)];
    const r = new CaseRenderer(run, 0xff0000);
    const all = meshes(r.object);
    expect(all).toHaveLength(6);
    expect(all.every((m) => m instanceof THREE.InstancedMesh)).toBe(true);
    const cans = named(r.object, 'case-bodies-ammo-can');
    expect(cans.count).toBe(3);
    // The band is in the body's vertex colours.
    expect(cans.geometry.getAttribute('color')).toBeDefined();
    // Each instance stands on its spot, turned to its facing.
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    instanceAt(cans, 1).decompose(p, q, new THREE.Vector3());
    expect(p.toArray()).toEqual([2, 0, 0]);
    expect(new THREE.Euler().setFromQuaternion(q).y).toBeCloseTo(0.5);
    expect(cans.castShadow).toBe(true);
    expect(named(r.object, 'case-lids-ammo-can').castShadow).toBe(false);
    expect(named(r.object, 'case-lids-locker').castShadow).toBe(true);
    r.dispose();
  });

  it('swings a lid open once the case is opened, setting that one instance, and hides what you dropped once picked up', () => {
    const run = createRunState();
    run.cases = [runCase('field-case', 0), runCase('field-case', 5)];
    const r = new CaseRenderer(run, 0x3366ff);
    const lids = named(r.object, 'case-lids-field-case');
    const lidCentre = (i: number): THREE.Vector3 => {
      lids.geometry.computeBoundingBox();
      return lids.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(instanceAt(lids, i));
    };
    const before = lidCentre(0);
    const other = lidCentre(1);
    run.cases[0]!.open = true;
    run.cases.push(runCase(DROPPED_CASE, 3));
    r.update(run);
    expect(lidCentre(0).distanceTo(before)).toBeGreaterThan(0.05);
    expect(lidCentre(0).y).toBeGreaterThan(before.y);
    expect(lidCentre(1).distanceTo(other)).toBeCloseTo(0, 6);
    const dropped = r.object.children.find((c) => !(c instanceof THREE.InstancedMesh))!;
    expect(dropped.visible).toBe(true);
    expect(meshes(dropped)).toHaveLength(2);
    run.cases[2]!.open = true;
    r.update(run);
    expect(dropped.visible).toBe(false);
    r.dispose();
  });

  it('opens the marshal’s locker as a door swinging out about its front edge, not a lid', () => {
    const run = createRunState();
    run.cases = [runCase('locker', 0)];
    const r = new CaseRenderer(run, 0x3366ff);
    const doors = named(r.object, 'case-lids-locker');
    doors.geometry.computeBoundingBox();
    const centre = (): THREE.Vector3 => doors.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(instanceAt(doors, 0));
    const shut = centre();
    run.cases[0]!.open = true;
    r.update(run);
    const open = centre();
    expect(open.y).toBeCloseTo(shut.y, 6);
    expect(open.distanceTo(shut)).toBeGreaterThan(0.1);
    r.dispose();
  });

  it('gives a case dropped before the renderer was built plain meshes and the site cases after it their own instances, in run order', () => {
    const run = createRunState();
    run.cases = [runCase('ammo-can', 0), runCase(DROPPED_CASE, 3), runCase('ammo-can', 6), runCase('locker', 9)];
    const r = new CaseRenderer(run, 0x3366ff);
    // Two instanced cans, one locker; the dropped case is no instance of anything, and stands where it fell.
    expect(named(r.object, 'case-bodies-ammo-can').count).toBe(2);
    expect(named(r.object, 'case-bodies-locker').count).toBe(1);
    expect(r.object.getObjectByName(`case-bodies-${DROPPED_CASE}`)).toBeUndefined();
    const plain = r.object.children.filter((c) => !(c instanceof THREE.InstancedMesh));
    expect(plain).toHaveLength(1);
    expect(meshes(plain[0]!)).toHaveLength(2);
    expect(plain[0]!.position.x).toBe(3);
    // The third case is the second can: its lid opens at instance 1, not the dropped case's slot.
    const lids = named(r.object, 'case-lids-ammo-can');
    lids.geometry.computeBoundingBox();
    const at = (i: number): THREE.Vector3 => lids.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(instanceAt(lids, i));
    const shut = at(1);
    // The lid sits on its own spot, not on the dropped case's.
    expect(Math.hypot(shut.x - 6, shut.z)).toBeLessThan(1);
    run.cases[2]!.open = true;
    r.update(run);
    expect(at(1).y).toBeGreaterThan(shut.y);
    expect(Math.hypot(at(0).x, at(0).z)).toBeLessThan(1);
    expect(at(0).y).toBeCloseTo(shut.y, 5);
    // Opening a site case builds nothing new: still the one plain pair.
    expect(r.object.children.filter((c) => !(c instanceof THREE.InstancedMesh))).toHaveLength(1);
    r.dispose();
  });

  it('disposes every instanced mesh, the shared geometries and materials, and leaves the scene', () => {
    const run = createRunState();
    run.cases = [runCase('ammo-can', 0), runCase('locker', 4), runCase(DROPPED_CASE, 8)];
    const r = new CaseRenderer(run, 0x3366ff);
    const parent = new THREE.Group();
    parent.add(r.object);
    const all = meshes(r.object);
    const instanced = all.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh);
    expect(instanced).toHaveLength(4);
    const instanceSpies = instanced.map((m) => vi.spyOn(m, 'dispose'));
    const spies = all.flatMap((m) => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')]);
    r.dispose();
    for (const s of [...instanceSpies, ...spies]) expect(s).toHaveBeenCalled();
    expect(r.object.parent).toBeNull();
  });
});
