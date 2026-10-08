import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { buildFigure, disposeFigure, figureLeanRoll, figureLooks, figureMuzzle, HUMAN_DRESS, setReceiveShadows } from './characterModels';
import { figurePalette } from './figurePalette';

describe('figureMuzzle', () => {
  it('matches the muzzle of the built figure for any position, yaw, pitch, crouch and lean', () => {
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
      // Leaning left, upright and right (audit L-03: the BB and gas puff leave the rifle the figure is seen holding).
      for (const lean of [-1, 0, 1]) {
        c.position.x = x;
        c.position.z = z;
        c.yaw = yaw;
        c.pitch = pitch;
        c.crouchAmount = crouch;
        c.lean = lean;
        // Pose the figure the way CharacterRenderer does.
        figure.root.position.set(x, 0, z);
        figure.root.rotation.y = yaw;
        figure.upper.position.y = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
        figure.upper.rotation.z = figureLeanRoll(lean, HITS);
        figure.aim.rotation.x = pitch;
        figure.root.updateMatrixWorld(true);
        tip.getWorldPosition(want);
        figureMuzzle(c, got, FIGURE.rifle, HITS);
        expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(1e-6);
        // The pistol hold's muzzle too (gas puffs and BBs leave it when the pistol is drawn).
        pistolTip.getWorldPosition(want);
        figureMuzzle(c, got, FIGURE.pistol, HITS);
        expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(1e-6);
      }
    }
  });

  it('puts the pistol muzzle at the end of the pistol the figure holds, nearer the body than the rifle muzzle', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial());
    const box = new THREE.Box3().setFromBufferAttribute((figure.aimPistol as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute);
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

  /** Triangles the camera sees (the part's draw range: its shadow stand-ins after it are drawn in the shadow map only, M75). */
  const trianglesOf = (o: THREE.Object3D): number => {
    const g = (o as THREE.Mesh).geometry;
    return Math.min(g.drawRange.count, g.getAttribute('position').count) / 3;
  };

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

  // G7 replaced M14's band (under the arms) with a plate carrier: its plates rise to the chest, as the concept's do.
  it('wears a plate carrier in the team colour all round the torso (front, back and both sides) on humans and robots', () => {
    for (const robot of [false, true]) {
      for (const id of [0, 1, 2, 3, 4, 5]) {
        const team = new THREE.Color(0xff8a2a);
        const figure = buildFigure(0xff8a2a, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, undefined, undefined, { ...HUMAN_DRESS, robot });
        const body = figure.upper.children[0] as THREE.Mesh;
        const pos = body.geometry.getAttribute('position');
        const col = body.geometry.getAttribute('color');
        // Team-coloured vertices on the torso (from the hips to just over the shoulders), in world heights.
        const box = new THREE.Box3();
        const p = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (Math.abs(col.getX(i) - team.r) + Math.abs(col.getY(i) - team.g) + Math.abs(col.getZ(i) - team.b) > 1e-6) continue;
          p.fromBufferAttribute(pos, i);
          p.y += FIGURE.hipHeight;
          if (p.y > FIGURE.hipHeight && p.y < FIGURE.shoulderHeight + 0.1) box.expandByPoint(p);
        }
        const size = box.getSize(new THREE.Vector3());
        expect(size.y, 'carrier height').toBeGreaterThanOrEqual(0.24);
        // Seen from either side and from the front and back: wider and deeper than the torso.
        expect(size.x, 'all the way round').toBeGreaterThan(FIGURE.torso.width);
        expect(size.z, 'all the way round').toBeGreaterThan(FIGURE.torso.depth);
        expect(box.min.z, 'front plate').toBeLessThan(-FIGURE.torso.depth / 2);
        expect(box.max.z, 'back plate').toBeGreaterThan(FIGURE.torso.depth / 2);
        disposeFigure(figure);
      }
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

  it('mixes six looks over the four masked headgears (G7): helmets high-cut and bump, a balaclava, a visor', () => {
    const looks = [0, 1, 2, 3, 4, 5].map(figureLooks);
    expect(new Set(looks.map((l) => `${l.headgear}-${l.pack}-${l.radio}`)).size).toBe(6);
    expect(new Set(looks.map((l) => l.headgear))).toEqual(new Set(['highCut', 'bump', 'balaclava', 'visor']));
    expect(new Set(looks.map((l) => l.tone)).size).toBe(6);
    expect(figureLooks(6)).toBe(figureLooks(0));
  });

  // G7: the clothes are no longer fixed colours: the camo and shirt take the team's own hue, greyed right down.
  it('never dresses a figure in anything that reads as a team colour other than its own: camo and gear stay grey', () => {
    const hsl = (hex: number): { h: number; s: number; l: number } => {
      const out = { h: 0, s: 0, l: 0 };
      new THREE.Color().setHex(hex, THREE.SRGBColorSpace).getHSL(out, THREE.SRGBColorSpace);
      return out;
    };
    for (const set of Object.values(TEAM_COLOUR_SETS)) {
      for (const team of set.figures) {
        for (const tone of FIGURE.looks.map((l) => l.tone)) {
          const pal = figurePalette(team, tone);
          for (const colour of [pal.camo, pal.shirt]) expect(hsl(colour).s, `#${colour.toString(16)} for #${team.toString(16)}`).toBeLessThan(0.3);
        }
      }
    }
    for (const [name, colour] of Object.entries(FIGURE.colors)) if (name !== 'torchLens') expect(hsl(colour).s, name).toBeLessThan(0.3); // the lens is a light
  });
});

describe('figures in shadow (REN-07)', () => {
  it('makes every built mesh receive shadows when asked, and none when not', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial());
    const meshes: THREE.Mesh[] = [];
    figure.root.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(3);
    expect(meshes.some((m) => m.receiveShadow)).toBe(false); // Three.js' default, as built
    setReceiveShadows(figure.root, true);
    expect(meshes.every((m) => m.receiveShadow)).toBe(true);
    setReceiveShadows(figure.root, false);
    expect(meshes.some((m) => m.receiveShadow)).toBe(false);
    disposeFigure(figure);
  });
});
