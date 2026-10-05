import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CASE_VISUALS as V } from '../config/render';
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
});
