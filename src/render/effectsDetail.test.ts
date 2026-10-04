import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { BB_VISUALS, IMPACT_GRIT } from '../config/render';
import { createBBPool, spawnBB } from '../sim/ballistics';
import { vec3 } from '../sim/vec';
import { BBRenderer } from './bbRenderer';
import { placeCallout } from './characterRenderer';
import { createCharacter } from '../sim/character';
import { ImpactGrit, shooterSide } from './impactGrit';

beforeAll(() => {
  // The glow's soft dot is drawn on a canvas: stood in for (it draws nothing here).
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterAll(() => vi.unstubAllGlobals());

const eye = { x: 0, y: 1.6, z: 0 };
const camera = new THREE.PerspectiveCamera();
camera.position.set(eye.x, eye.y, eye.z);

function flying(n: number): { r: BBRenderer; glow: THREE.InstancedMesh; balls: THREE.InstancedMesh } {
  const pool = createBBPool(8);
  for (let i = 0; i < n; i++) spawnBB(pool, 1, vec3(i, 1.5, -10 - i * 5), vec3(0, 0, -1), 90, 0, 0.25e-3);
  const r = new BBRenderer(pool, 1 / 60);
  return { r, balls: r.object.children[0] as THREE.InstancedMesh, glow: r.object.children[2] as THREE.InstancedMesh };
}

describe('BB glow (FA8, QualitySettings.bbGlow)', () => {
  it('draws nothing extra while off (Low), and a camera-facing glow at every BB while on', () => {
    const { r, glow, balls } = flying(3);
    r.update(0.5, eye, camera.quaternion);
    expect(balls.count).toBe(3);
    expect([glow.visible, glow.count]).toEqual([false, 0]);
    expect((glow.material as THREE.MeshBasicMaterial).map).toBeNull(); // its texture isn't even made on Low
    r.setGlow(true);
    r.update(0.5, eye, camera.quaternion);
    expect([glow.visible, glow.count]).toEqual([true, 3]);
    const m = new THREE.Matrix4();
    const [bp, gp, q, s] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
    for (let i = 0; i < 3; i++) {
      balls.getMatrixAt(i, m);
      bp.setFromMatrixPosition(m);
      glow.getMatrixAt(i, m);
      m.decompose(gp, q, s);
      expect(gp.distanceTo(bp)).toBeLessThan(1e-9);
      expect(q.angleTo(camera.quaternion)).toBeLessThan(1e-6);
    }
    // Added light, sharing the puffs' shader (a colour per instance, a soft-dot map).
    const mat = glow.material as THREE.MeshBasicMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.map).not.toBeNull();
    expect(glow.instanceColor).not.toBeNull();
    r.setGlow(false);
    r.update(0.5, eye, camera.quaternion);
    expect([glow.visible, glow.count]).toEqual([false, 0]);
    r.dispose();
  });

  it('shades the ball two-tone: lit cream on top, warm grey underneath', () => {
    const { r, balls } = flying(1);
    const pos = balls.geometry.getAttribute('position');
    const col = balls.geometry.getAttribute('color');
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > BB_VISUALS.radius * 0.99) top = col.getX(i);
      if (pos.getY(i) < -BB_VISUALS.radius * 0.99) bottom = col.getX(i);
    }
    expect(top).toBeCloseTo(new THREE.Color(BB_VISUALS.color).r, 6);
    expect(bottom).toBeCloseTo(new THREE.Color(BB_VISUALS.shadeColor).r, 6);
    r.dispose();
  });

  it('frees the glow with the rest', () => {
    const { r, glow } = flying(1);
    r.setGlow(true);
    const map = (glow.material as THREE.MeshBasicMaterial).map!;
    const freed: unknown[] = [];
    for (const res of [glow.geometry, glow.material as THREE.Material, map]) res.addEventListener('dispose', () => freed.push(res));
    r.dispose();
    expect(freed).toHaveLength(3);
  });
});

describe('impact grit (FA8, QualitySettings.impactGrit)', () => {
  const tint = new THREE.Color(0xf2cf98);
  const at = { x: 0, y: 1, z: -5 };

  it('finds the side to throw towards from the BB\'s owner (a bot\'s BB flies back towards the bot), the camera only as a fallback', () => {
    const bot = createCharacter(3, vec3(6, 0, -2), 0);
    const characters = [createCharacter(0, vec3(0, 0, 0), 0), bot];
    const out = { x: 0, y: 0, z: 0 };
    expect(shooterSide(characters, 3, eye, out)).toBe(out);
    expect(out).toEqual({ x: 6, y: FIGURE.shoulderHeight, z: -2 });
    bot.crouchAmount = 1;
    expect(shooterSide(characters, 3, eye, out).y).toBeCloseTo(FIGURE.shoulderHeight - FIGURE.crouchDrop, 6);
    expect(shooterSide(characters, -1, eye, out)).toEqual(eye); // no character fired it
    // A bot to the right of the camera: its BB's chips go right, not at the camera.
    const grit = new ImpactGrit();
    grit.setEnabled(true);
    grit.spawn(at, tint, shooterSide(characters, 3, eye, out));
    grit.update(1 / 60, camera);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let right = 0;
    for (let i = 0; i < grit.object.count; i++) {
      grit.object.getMatrixAt(i, m);
      if (p.setFromMatrixPosition(m).x > at.x) right++;
    }
    expect(right).toBeGreaterThan(grit.object.count / 2);
    grit.dispose();
  });

  it('throws nothing while off (Low)', () => {
    const grit = new ImpactGrit();
    grit.spawn(at, tint, eye);
    grit.update(1 / 60, camera);
    expect([grit.object.visible, grit.object.count]).toEqual([false, 0]);
    grit.dispose();
  });

  it('throws a few chips of the surface towards the shooter\'s side, which fall and are gone after their lifetime', () => {
    const grit = new ImpactGrit();
    grit.setEnabled(true);
    grit.spawn(at, tint, eye);
    grit.update(1 / 60, camera);
    const n = grit.object.count;
    expect(n).toBeGreaterThanOrEqual(IMPACT_GRIT.perImpact[0]);
    expect(n).toBeLessThanOrEqual(IMPACT_GRIT.perImpact[1]);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    let towards = 0;
    for (let i = 0; i < n; i++) {
      grit.object.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (p.z > at.z) towards++; // the shooter is at z 0, the wall at -5
      grit.object.getColorAt(i, c);
      expect(c.r).toBeCloseTo(tint.r * IMPACT_GRIT.shade, 6);
    }
    expect(towards).toBeGreaterThan(n / 2);
    // Gravity: after a while every chip is falling, and lower than its highest point.
    for (let t = 0; t < 10; t++) grit.update(1 / 60, camera);
    const mid = grit.object.count;
    expect(mid).toBe(n);
    for (let t = 0; t < 30; t++) grit.update(1 / 60, camera);
    expect(grit.object.count).toBe(0);
    grit.dispose();
  });

  it('throws the same chips every time (seeded) and clears what is in the air when turned off', () => {
    const throwOnce = () => {
      const g = new ImpactGrit();
      g.setEnabled(true);
      g.spawn(at, tint, eye);
      g.update(0.1, camera);
      const out = Array.from(g.object.instanceMatrix.array.slice(0, g.object.count * 16));
      g.setEnabled(false);
      expect(g.object.count).toBe(0);
      g.setEnabled(true);
      g.update(0.1, camera);
      expect(g.object.count).toBe(0);
      g.dispose();
      return out;
    };
    expect(throwOnce()).toEqual(throwOnce());
  });
});

describe('the HIT! sign at range (FA8)', () => {
  it('keeps its own size close up and its on-screen size beyond stableFrom, its bottom edge where it was', () => {
    const C = FIGURE.callout;
    const sign = new THREE.Sprite();
    const bottom = () => sign.position.y - sign.scale.y / 2;
    placeCallout(sign, 3);
    expect(sign.scale.x).toBeCloseTo(C.width, 9);
    const nearBottom = bottom();
    placeCallout(sign, C.stableFrom * 5);
    expect(sign.scale.x / (C.stableFrom * 5)).toBeCloseTo(C.width / C.stableFrom, 9); // same angle as at stableFrom
    expect(bottom()).toBeCloseTo(nearBottom, 9);
    expect(bottom()).toBeGreaterThan(FIGURE.headHeight + FIGURE.headRadius);
  });
});
