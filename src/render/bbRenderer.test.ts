import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BB_VISUALS } from '../config/render';
import { createBBPool, spawnBB, stepBBFlight } from '../sim/ballistics';
import { vec3 } from '../sim/vec';
import { BBRenderer } from './bbRenderer';

const DT = 1 / 60;

/** World position and uniform scale of drawn BB number `i`. */
function drawn(r: BBRenderer, i: number): { pos: THREE.Vector3; scale: number } {
  const balls = r.object.children[0] as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  balls.getMatrixAt(i, m);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  m.decompose(pos, new THREE.Quaternion(), scale);
  return { pos, scale: scale.x };
}

/** Corner `c` (0, 1 at the head; 2, 3 at the tail) of drawn BB `i`'s streak quad. */
function corner(r: BBRenderer, i: number, c: number): THREE.Vector3 {
  const trails = r.object.children[1] as THREE.Mesh;
  return new THREE.Vector3().fromBufferAttribute(trails.geometry.getAttribute('position') as THREE.BufferAttribute, i * 4 + c);
}

/** Head and tail of drawn BB `i`'s streak: the centre line of its quad (REN-19). */
function streakEnds(r: BBRenderer, i: number): { head: THREE.Vector3; tail: THREE.Vector3 } {
  return {
    head: corner(r, i, 0).add(corner(r, i, 1)).multiplyScalar(0.5),
    tail: corner(r, i, 2).add(corner(r, i, 3)).multiplyScalar(0.5),
  };
}

describe('BBRenderer', () => {
  const eye = { x: 0, y: 1.6, z: 0 };

  it('draws an own BB at the muzzle, then exactly on its path once it has converged', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    stepBBFlight(bb, BALLISTICS, DT); // as in the game: presentation sees the BB after its first tick
    r.startFromMuzzle(bb, { x: 0.2, y: 1.4, z: -0.5 }, Number.POSITIVE_INFINITY);
    r.update(0, eye);
    expect(drawn(r, 0).pos.distanceTo(new THREE.Vector3(0.2, 1.4, -0.5))).toBeLessThan(1e-6);
    const ticks = Math.ceil(BB_VISUALS.muzzleConvergeTime / DT) + 1;
    for (let i = 0; i < ticks; i++) stepBBFlight(bb, BALLISTICS, DT);
    r.update(1, eye);
    expect(drawn(r, 0).pos.distanceTo(new THREE.Vector3(bb.position.x, bb.position.y, bb.position.z))).toBeLessThan(1e-6);
    r.dispose();
  });

  it('finishes the muzzle blend before a close wall, so the BB arrives where it hits', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    stepBBFlight(bb, BALLISTICS, DT);
    const flight = 4.4 / 88; // a wall 4.4 m away: 0.05 s, much shorter than muzzleConvergeTime
    r.startFromMuzzle(bb, { x: 0.2, y: 1.4, z: -0.5 }, flight);
    const ticks = Math.ceil((flight * BB_VISUALS.convergeBeforeImpact) / DT) + 1;
    for (let i = 0; i < ticks; i++) stepBBFlight(bb, BALLISTICS, DT);
    r.update(1, eye);
    expect(drawn(r, 0).pos.distanceTo(new THREE.Vector3(bb.position.x, bb.position.y, bb.position.z))).toBeLessThan(1e-6);
    r.dispose();
  });

  it('keeps far BBs at least the minimum angular size', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    spawnBB(pool, 1, vec3(0, 1.6, -30), vec3(0, 0, -1), 88, 0, 0.25e-3);
    spawnBB(pool, 1, vec3(0, 1.6, -1), vec3(0, 0, -1), 88, 0, 0.25e-3);
    r.update(0, eye);
    const far = drawn(r, 0);
    expect((far.scale * BB_VISUALS.radius) / 30).toBeCloseTo(BB_VISUALS.minAngularRadius, 6);
    expect(drawn(r, 1).scale).toBe(1); // near BBs keep their real drawn size
    r.dispose();
  });

  it("draws the streak back along the tick's own path, not along the speed the BB ends the tick at (drag, M30)", () => {
    const pool = createBBPool(1);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 1, vec3(0, 1.6, -3), vec3(0, 0, -1), 88, 0, 0.25e-3);
    // A tick that carried the BB 1.4 m (84 m/s on average) while drag and gravity bent its end-of-tick velocity to
    // 70 m/s with a downward part: far from the mean velocity of the tick.
    bb.prevPosition.x = 0;
    bb.prevPosition.y = 1.6;
    bb.prevPosition.z = -3;
    bb.position.x = 0;
    bb.position.y = 1.6;
    bb.position.z = -4.4;
    bb.velocity.x = 0;
    bb.velocity.y = -5;
    bb.velocity.z = -70;
    bb.age = 1;
    r.update(0.5, eye);
    const { head, tail } = streakEnds(r, 0);
    expect(head.distanceTo(new THREE.Vector3(0, 1.6, -3.7))).toBeLessThan(1e-5); // half way along the tick
    // The tail is on the line prevPosition -> position: level here, and no further back than the tick's mean speed says.
    expect(tail.y).toBeCloseTo(1.6, 5);
    expect(tail.x).toBeCloseTo(0, 5);
    expect(tail.z - head.z).toBeCloseTo((1.4 / DT) * BB_VISUALS.trailSeconds, 4);
    r.dispose();
  });

  it('keeps the streak on the segment of a BB flying through real drag, whichever way it is drawn between ticks', () => {
    const pool = createBBPool(1);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 1, vec3(0, 1.6, 0), vec3(0.6, 0.1, -0.8), 88, 0.12, 0.25e-3);
    for (let i = 0; i < 90; i++) {
      bb.prevPosition.x = bb.position.x;
      bb.prevPosition.y = bb.position.y;
      bb.prevPosition.z = bb.position.z;
      stepBBFlight(bb, BALLISTICS, DT);
    }
    const dir = new THREE.Vector3(bb.position.x - bb.prevPosition.x, bb.position.y - bb.prevPosition.y, bb.position.z - bb.prevPosition.z).normalize();
    for (const alpha of [0, 0.5, 1]) {
      r.update(alpha, eye);
      const { head, tail } = streakEnds(r, 0);
      const along = tail.clone().sub(head);
      const off = along.clone().sub(dir.clone().multiplyScalar(along.dot(dir)));
      expect(off.length(), `alpha ${alpha}`).toBeLessThan(2e-4);
    }
    r.dispose();
  });
  describe('glowing BBs (M33b)', () => {
    const colorOf = (r: BBRenderer, i: number): THREE.Color => {
      const c = new THREE.Color();
      (r.object.children[0] as THREE.InstancedMesh).getColorAt(i, c);
      return c;
    };
    /** Floats per streak: a quad of four corners, two at the head and two at the tail. */
    const QUAD = 12;
    const headColor = (r: BBRenderer, i: number): THREE.Color => {
      const a = ((r.object.children[1] as THREE.Mesh).geometry.getAttribute('color') as THREE.BufferAttribute).array;
      return new THREE.Color(a[i * QUAD]!, a[i * QUAD + 1]!, a[i * QUAD + 2]!);
    };
    /** A BB that went 1.4 m last tick, level, so a streak shows. */
    const farBB = (pool: ReturnType<typeof createBBPool>, z: number) => {
      const bb = spawnBB(pool, 1, vec3(0, 1.6, z), vec3(0, 0, -1), 88, 0, 0.25e-3);
      bb.prevPosition.z = z + 1.4;
      bb.age = 1;
      return bb;
    };
    /** Head to tail, between the midpoints of the quad's head corners (0, 1) and tail corners (2, 3). */
    const streak = (r: BBRenderer, i: number): number => {
      const p = ((r.object.children[1] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute).array;
      const o = i * QUAD;
      const mid = (k: number, axis: number): number => (p[o + k * 6 + axis]! + p[o + k * 6 + 3 + axis]!) / 2;
      return Math.hypot(mid(1, 0) - mid(0, 0), mid(1, 1) - mid(0, 1), mid(1, 2) - mid(0, 2));
    };

    it('draws a glowing BB in the glow colour and a normal BB as before, in the same instanced mesh', () => {
      const pool = createBBPool(2);
      const r = new BBRenderer(pool, DT);
      const a = spawnBB(pool, 1, vec3(0, 1.6, -5), vec3(0, 0, -1), 88, 0, 0.25e-3);
      spawnBB(pool, 1, vec3(0, 1.6, -6), vec3(0, 0, -1), 88, 0, 0.25e-3);
      r.setGlowInDark(a, true);
      r.update(0, eye);
      expect((r.object.children[0] as THREE.InstancedMesh).count).toBe(2);
      expect(colorOf(r, 0).getHex()).toBe(new THREE.Color(BB_VISUALS.glowInDark.color).getHex());
      expect(colorOf(r, 1).getHex()).toBe(0xffffff);
      expect(headColor(r, 0).getHex()).toBe(new THREE.Color(BB_VISUALS.glowInDark.trailColor).getHex());
      expect(headColor(r, 1).getHex()).toBe(new THREE.Color(BB_VISUALS.trailColor).getHex());
      expect(r.object.children).toHaveLength(3); // still the balls, the streaks and FA8's halo: no mesh added
      r.dispose();
    });

    it('keeps a glowing BB at least the glow minimum angular size far away, larger than a normal one', () => {
      const pool = createBBPool(2);
      const r = new BBRenderer(pool, DT);
      const glowing = spawnBB(pool, 1, vec3(0, 1.6, -30), vec3(0, 0, -1), 88, 0, 0.25e-3);
      spawnBB(pool, 1, vec3(0, 1.6, -30), vec3(0, 0, -1), 88, 0, 0.25e-3);
      r.setGlowInDark(glowing, true);
      r.update(0, eye);
      const g = drawn(r, 0);
      const n = drawn(r, 1);
      expect((g.scale * BB_VISUALS.radius) / 30).toBeGreaterThanOrEqual(BB_VISUALS.glowInDark.minAngularRadius - 1e-9);
      expect((n.scale * BB_VISUALS.radius) / 30).toBeCloseTo(BB_VISUALS.minAngularRadius, 6);
      expect(g.scale).toBeGreaterThan(n.scale);
      r.dispose();
    });

    it('draws a longer streak behind a glowing BB, in proportion to the glow trail time', () => {
      const pool = createBBPool(2);
      const r = new BBRenderer(pool, DT);
      const a = farBB(pool, -10);
      farBB(pool, -10);
      r.setGlowInDark(a, true);
      r.update(0, eye);
      expect(streak(r, 1)).toBeCloseTo((1.4 / DT) * BB_VISUALS.trailSeconds, 4);
      expect(streak(r, 0)).toBeCloseTo((1.4 / DT) * BB_VISUALS.glowInDark.trailSeconds, 4);
      expect(streak(r, 0)).toBeGreaterThan(streak(r, 1));
      r.dispose();
    });

    it("doesn't change where a glowing BB is drawn along its flight", () => {
      const pool = createBBPool(2);
      const r = new BBRenderer(pool, DT);
      const a = farBB(pool, -10);
      farBB(pool, -10);
      r.setGlowInDark(a, true);
      r.update(0.5, eye);
      expect(drawn(r, 0).pos.distanceTo(drawn(r, 1).pos)).toBeLessThan(1e-6);
      r.dispose();
    });

    it("doesn't glow the new BB that reuses a glowing BB's pool slot", () => {
      const pool = createBBPool(1);
      const r = new BBRenderer(pool, DT);
      const first = spawnBB(pool, 1, vec3(0, 1.6, -30), vec3(0, 0, -1), 88, 0, 0.25e-3);
      r.setGlowInDark(first, true);
      r.update(0, eye);
      expect(colorOf(r, 0).getHex()).toBe(new THREE.Color(BB_VISUALS.glowInDark.color).getHex());
      const serial = first.serial;
      first.active = false; // it hit something; its slot is free
      const second = spawnBB(pool, 1, vec3(0, 1.6, -30), vec3(0, 0, -1), 88, 0, 0.25e-3);
      expect(second).toBe(first);
      expect(second.serial).not.toBe(serial);
      r.update(0, eye);
      expect(colorOf(r, 0).getHex()).toBe(0xffffff);
      expect(headColor(r, 0).getHex()).toBe(new THREE.Color(BB_VISUALS.trailColor).getHex());
      expect((drawn(r, 0).scale * BB_VISUALS.radius) / 30).toBeCloseTo(BB_VISUALS.minAngularRadius, 6);
      r.dispose();
    });

    it('can be switched off again for a BB (setGlow false)', () => {
      const pool = createBBPool(1);
      const r = new BBRenderer(pool, DT);
      const a = spawnBB(pool, 1, vec3(0, 1.6, -5), vec3(0, 0, -1), 88, 0, 0.25e-3);
      r.setGlowInDark(a, true);
      r.setGlowInDark(a, false);
      r.update(0, eye);
      expect(colorOf(r, 0).getHex()).toBe(0xffffff);
      r.dispose();
    });
  });
});

describe('BBRenderer streaks (REN-19)', () => {
  const eye = { x: 0, y: 1.6, z: 0 };

  it('draws each streak as a camera-facing quad as wide on screen at its head as at its tail, near or far', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    // Crossing the view at 3 m and at 30 m, old enough for a full-length streak.
    for (const z of [-3, -30]) {
      const bb = spawnBB(pool, 1, vec3(-1, 1.6, z), vec3(1, 0, 0), 88, 0, 0.25e-3);
      bb.age = 1;
      bb.prevPosition.x = bb.position.x - bb.velocity.x * DT; // the streak runs back along the last tick's path (M30)
    }
    r.update(1, eye);
    const trails = r.object.children[1] as THREE.Mesh;
    expect(trails.geometry.drawRange.count).toBe(2 * 6);
    const e = new THREE.Vector3(eye.x, eye.y, eye.z);
    for (const i of [0, 1]) {
      for (const [a, b] of [[0, 1], [2, 3]] as const) {
        const p = corner(r, i, a);
        const q = corner(r, i, b);
        const mid = p.clone().add(q).multiplyScalar(0.5);
        // Width over distance: the angle the streak spans across the line of sight.
        expect(p.distanceTo(q) / mid.distanceTo(e)).toBeCloseTo(BB_VISUALS.trailAngularWidth, 6);
        // Widened across the line of sight, not along it.
        expect(Math.abs(p.clone().sub(q).normalize().dot(mid.clone().sub(e).normalize()))).toBeLessThan(1e-6);
      }
    }
    r.dispose();
  });

  it('uploads nothing while no BB is in flight, and clears the last streak once (REN-22)', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    const balls = r.object.children[0] as THREE.InstancedMesh;
    const trails = (r.object.children[1] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute;
    r.update(0, eye);
    const idle = [balls.instanceMatrix.version, trails.version];
    r.update(0, eye);
    expect([balls.instanceMatrix.version, trails.version]).toEqual(idle);
    const bb = spawnBB(pool, 1, vec3(0, 1.6, -5), vec3(0, 0, -1), 88, 0, 0.25e-3);
    r.update(0, eye);
    expect(balls.instanceMatrix.version).toBeGreaterThan(idle[0]!);
    bb.active = false;
    r.update(0, eye); // the frame it goes: one upload with nothing drawn
    const after = [balls.instanceMatrix.version, trails.version];
    r.update(0, eye);
    expect([balls.instanceMatrix.version, trails.version]).toEqual(after);
    r.dispose();
  });
});
