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

describe('CaseRenderer (M44)', () => {
  it('draws each case in two meshes (its banded body, its lid or door) on geometry and materials shared per kind', () => {
    const run = createRunState();
    run.cases = [runCase('ammo-can', 0), runCase('ammo-can', 2), runCase('locker', 4), runCase('field-case', 6)];
    const r = new CaseRenderer(run, 0xff0000);
    const all = meshes(r.object);
    expect(all).toHaveLength(8);
    const [can1, , can2] = all;
    expect(can1!.geometry).toBe(can2!.geometry);
    expect(can1!.material).toBe(can2!.material);
    // The band is in the body's vertex colours.
    expect(can1!.geometry.getAttribute('color')).toBeDefined();
    r.dispose();
  });

  it('swings a lid open once the case is opened, composing its matrix then, and hides what you dropped once picked up', () => {
    const run = createRunState();
    run.cases = [runCase('field-case', 0)];
    const r = new CaseRenderer(run, 0x3366ff);
    const lid = meshes(r.object)[1]!;
    const hinge = lid.parent!;
    const lidAt = (): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(hinge.matrix).multiply(lid.matrix));
    const before = lidAt();
    run.cases[0]!.open = true;
    run.cases.push(runCase(DROPPED_CASE, 3));
    r.update(run);
    expect(hinge.rotation.x).toBeCloseTo(V.lidOpenAngle);
    expect(lidAt().distanceTo(before)).toBeGreaterThan(0.05);
    const dropped = r.object.children[1]!;
    expect(dropped.visible).toBe(true);
    run.cases[1]!.open = true;
    r.update(run);
    expect(dropped.visible).toBe(false);
    r.dispose();
  });
});
