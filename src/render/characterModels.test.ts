import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { buildFigure, disposeFigure, figureLooks, figureMuzzle } from './characterModels';

describe('figureMuzzle', () => {
  it('matches the muzzle of the built figure for any position, yaw, pitch and crouch', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial());
    // A marker at the barrel tip, in the aim group's own space.
    const tip = new THREE.Object3D();
    tip.position.set(FIGURE.rifle.x, FIGURE.rifle.y, FIGURE.rifle.butt - FIGURE.rifle.length);
    const pistolTip = new THREE.Object3D();
    pistolTip.position.set(FIGURE.pistol.x, FIGURE.pistol.y, FIGURE.pistol.butt - FIGURE.pistol.length);
    figure.aim.add(tip, pistolTip);
    const c = createCharacter(0, vec3(), 0);
    const got = vec3();
    const want = new THREE.Vector3();
    for (const [x, z, yaw, pitch, crouch] of [
      [0, 0, 0, 0, 0],
      [3, -2, 1.1, 0.3, 0],
      [-5, 7, -2.5, -0.4, 1],
      [1, 1, Math.PI, 0.8, 0.5],
    ] as const) {
      c.position.x = x;
      c.position.z = z;
      c.yaw = yaw;
      c.pitch = pitch;
      c.crouchAmount = crouch;
      // Pose the figure the way CharacterRenderer does.
      figure.root.position.set(x, 0, z);
      figure.root.rotation.y = yaw;
      figure.upper.position.y = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
      figure.aim.rotation.x = pitch;
      figure.root.updateMatrixWorld(true);
      tip.getWorldPosition(want);
      figureMuzzle(c, got);
      expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(1e-6);
      // The pistol hold's muzzle too (gas puffs and BBs leave it when the pistol is drawn).
      pistolTip.getWorldPosition(want);
      figureMuzzle(c, got, FIGURE.pistol);
      expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(1e-6);
    }
  });

  it('puts the pistol muzzle at the end of the pistol the figure holds, nearer the body than the rifle muzzle', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial());
    const box = new THREE.Box3().setFromBufferAttribute(figure.aimPistol.geometry.getAttribute('position') as THREE.BufferAttribute);
    const P = FIGURE.pistol;
    expect(box.min.z).toBeCloseTo(P.butt - P.length, 2); // the slide's front is the furthest-forward point
    expect(P.butt - P.length).toBeGreaterThan(FIGURE.rifle.butt - FIGURE.rifle.length);
    disposeFigure(figure);
  });
});

describe('buildFigure (M14 art pass)', () => {
  /** Triangles a figure may draw at once (legs, body and one of its three arm poses): six must stay cheap on integrated graphics. */
  const TRIANGLE_BUDGET = 4000;

  const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) out.push(o);
    });
    return out;
  };

  const trianglesOf = (m: THREE.Mesh): number => m.geometry.getAttribute('position').count / 3;

  it('is six merged meshes on the one material given (four drawn at once), with vertex colours and no UVs', () => {
    for (const id of [0, 1, 2, 3, 4, 5]) {
      const material = new THREE.MeshStandardMaterial();
      const figure = buildFigure(0x3d8bff, material, new THREE.SpriteMaterial(), id);
      const meshes = meshesOf(figure.root);
      expect(meshes).toHaveLength(6); // two legs, body, arms with the rifle, arms with the pistol, hit pose
      for (const m of meshes) {
        expect(m.material).toBe(material);
        expect(m.geometry.getAttribute('color')).toBeDefined();
        expect(m.geometry.getAttribute('uv')).toBeUndefined();
      }
      const always = trianglesOf(figure.legL) + trianglesOf(figure.legR) + trianglesOf(figure.upper.children[0] as THREE.Mesh);
      const arms = Math.max(trianglesOf(figure.aimRifle), trianglesOf(figure.aimPistol), trianglesOf(figure.hitPose));
      expect(always + arms).toBeLessThan(TRIANGLE_BUDGET);
      disposeFigure(figure);
    }
  });

  it('wraps a broad band of team colour round the torso, under the arms, that reads across the map', () => {
    for (const id of [0, 1, 2, 3, 4, 5]) {
      const team = new THREE.Color(0xff8a2a);
      const figure = buildFigure(0xff8a2a, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id);
      const body = figure.upper.children[0] as THREE.Mesh;
      const pos = body.geometry.getAttribute('position');
      const col = body.geometry.getAttribute('color');
      // Team-coloured vertices on the torso (below the shoulder straps), in world heights.
      const box = new THREE.Box3();
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(col.getX(i) - team.r) + Math.abs(col.getY(i) - team.g) + Math.abs(col.getZ(i) - team.b) > 1e-6) continue;
        p.fromBufferAttribute(pos, i);
        p.y += FIGURE.hipHeight;
        if (p.y < FIGURE.shoulderHeight - 0.05) box.expandByPoint(p);
      }
      const size = box.getSize(new THREE.Vector3());
      expect(size.y, 'band height').toBeGreaterThanOrEqual(0.24);
      expect(size.x, 'all the way round').toBeGreaterThan(FIGURE.torso.width);
      expect(size.z, 'all the way round').toBeGreaterThan(FIGURE.torso.depth);
      // Under the arms: the aiming elbows and the rifle's magazine sit above its top edge.
      expect(box.max.y).toBeLessThanOrEqual(FIGURE.shoulderHeight - 0.2);
      disposeFigure(figure);
    }
  });

  it('wears the team colour on every part: legs, body, arms and the hit pose (tape and armbands)', () => {
    for (const set of Object.values(TEAM_COLOUR_SETS)) {
      for (const team of set.figures) {
        const figure = buildFigure(team, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 1);
        const want = new THREE.Color(team);
        for (const m of meshesOf(figure.root)) {
          const c = m.geometry.getAttribute('color');
          let found = false;
          for (let i = 0; i < c.count && !found; i++) found = Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b) < 1e-6;
          expect(found, `team colour on every part`).toBe(true);
        }
        disposeFigure(figure);
      }
    }
  });

  it('mixes six casual looks: varied clothes and headgear, most faces showing, both kinds of vest', () => {
    const looks = [0, 1, 2, 3, 4, 5].map(figureLooks);
    expect(new Set(looks.map((l) => `${l.top}-${l.trousers}-${l.headgear}`)).size).toBe(6);
    expect(new Set(looks.map((l) => l.headgear)).size).toBe(3);
    expect(new Set(looks.map((l) => l.vest)).size).toBe(2);
    expect(new Set(looks.map((l) => l.skin)).size).toBeGreaterThanOrEqual(4);
    expect(looks.filter((l) => l.mask === null).length).toBeGreaterThan(looks.length / 2);
    expect(figureLooks(6)).toBe(figureLooks(0));
  });

  it('never dresses a figure in anything that reads as a team colour', () => {
    const hsl = (hex: number): { h: number; s: number } => {
      const out = { h: 0, s: 0, l: 0 };
      new THREE.Color(hex).getHSL(out);
      return { h: out.h * 360, s: out.s };
    };
    const teams = Object.values(TEAM_COLOUR_SETS).flatMap((s) => s.figures).map(hsl);
    for (const look of FIGURE.looks) {
      for (const colour of [look.top, look.trousers, look.vestColor, look.pouches, look.hat, look.mask ?? 0]) {
        const c = hsl(colour);
        if (c.s < 0.3) continue; // greys, denim, sand: no hue to mistake
        for (const t of teams) {
          const d = Math.abs(c.h - t.h) % 360;
          expect(Math.min(d, 360 - d), `#${colour.toString(16)} near a team colour`).toBeGreaterThan(20);
        }
      }
    }
  });
});
