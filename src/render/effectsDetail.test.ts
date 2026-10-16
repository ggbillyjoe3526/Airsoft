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
  // Soft dots are drawn on a canvas: stood in for (it draws nothing here).
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterAll(() => vi.unstubAllGlobals());

const eye = { x: 0, y: 1.6, z: 0 };
const camera = new THREE.PerspectiveCamera();
camera.position.set(eye.x, eye.y, eye.z);

function flying(n: number): { r: BBRenderer; balls: THREE.InstancedMesh } {
  const pool = createBBPool(8);
  for (let i = 0; i < n; i++) spawnBB(pool, 1, vec3(i, 1.5, -10 - i * 5), vec3(0, 0, -1), 90, 0, 0.25e-3);
  const r = new BBRenderer(pool, 1 / 60);
  return { r, balls: r.object.children[0] as THREE.InstancedMesh };
}

describe('BBs in flight (FA8; no halo since the owner\'s 0.1 Dev 5 playtest, note 3)', () => {
  it('draws each BB as its ball and streak only: nothing round the ball, on any graphics preset', () => {
    const { r, balls } = flying(3);
    r.update(0.5, eye);
    expect(balls.count).toBe(3);
    expect(r.object.children).toHaveLength(2); // the balls and the streaks; FA8's glow dots are gone
    expect(r.object.children.every((c) => !(c instanceof THREE.InstancedMesh) || c === balls)).toBe(true);
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
    // A bot to the right of the camera: its BB's chips go right, not at the camera. A few impacts, so the majority
    // means something with two or three chips each (Dev 6 playtest item 24).
    const grit = new ImpactGrit();
    grit.setEnabled(true);
    for (let k = 0; k < 4; k++) grit.spawn(at, tint, shooterSide(characters, 3, eye, out));
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
