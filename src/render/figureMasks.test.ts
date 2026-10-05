import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE_MODEL } from '../config/assets';
import { FIGURE } from '../config/characters';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { buildFigure, disposeFigure, type Figure, HUMAN_DRESS } from './characterModels';
import { prepareFigureModel } from './externalModels';

const tris = (o: THREE.Object3D): number => (o as THREE.Mesh).geometry.getAttribute('position').count / 3;
const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
};
const build = (team: number, id: number, robot: boolean, detail: 'low' | 'high' = 'low'): Figure =>
  buildFigure(team, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, FIGURE.detail[detail], undefined, { ...HUMAN_DRESS, robot });

/** A colour that reads as skin: an orange-brown hue, moderately saturated, neither near black nor near white. */
function skinLike(r: number, g: number, b: number): boolean {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(r, g, b).getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.h * 360 >= 10 && hsl.h * 360 <= 45 && hsl.s >= 0.3 && hsl.s <= 0.8 && hsl.l >= 0.3 && hsl.l <= 0.85;
}

describe('masked heads (G7: no bare faces)', () => {
  it('recognises the skins the figures wore before G7', () => {
    for (const hex of [0xe3b796, 0xc68e68, 0x8a5a3c, 0xf0c9a8, 0xd9a47e, 0xb57a52]) {
      const c = new THREE.Color(hex);
      expect(skinLike(c.r, c.g, c.b), hex.toString(16)).toBe(true);
    }
  });

  it('covers every face, human and robot, in every look, team colour set and detail: no skin in front of the head', () => {
    for (const set of Object.values(TEAM_COLOUR_SETS)) {
      for (const team of set.figures) {
        const exact = new THREE.Color(team);
        for (const detail of ['low', 'high'] as const) {
          for (const robot of [false, true]) {
            for (const id of [0, 1, 2, 3, 4, 5]) {
              const f = build(team, id, robot, detail);
              const mesh = f.upper.children[0] as THREE.Mesh;
              const pos = mesh.geometry.getAttribute('position');
              const col = mesh.geometry.getAttribute('color');
              let face = 0;
              for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i) + FIGURE.hipHeight;
                // The face: in front of the head's centre (figures face -Z), from the chin to the brow.
                if (pos.getZ(i) > -0.04 || Math.abs(pos.getX(i)) > 0.08 || y < FIGURE.headHeight - 0.1 || y > FIGURE.headHeight + 0.06) continue;
                face++;
                const [r, g, b] = [col.getX(i), col.getY(i), col.getZ(i)];
                if (Math.abs(r - exact.r) + Math.abs(g - exact.g) + Math.abs(b - exact.b) < 1e-6) continue; // the team's own colour
                expect(skinLike(r, g, b), `look ${id} ${robot ? 'robot' : 'human'} ${detail} #${team.toString(16)}: rgb ${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)}`).toBe(false);
              }
              expect(face, 'something covers the face').toBeGreaterThan(0);
              disposeFigure(f);
            }
          }
        }
      }
    }
  });

  it('has no skin colour left in the figures\' config', () => {
    expect('skin' in FIGURE.colors).toBe(false);
    for (const look of FIGURE.looks) expect('skin' in look).toBe(false);
  });
});

describe('the rig is as before, for humans and robots (G7)', () => {
  it('is six merged meshes on one material, four drawn at once, its holds ending at the muzzles', () => {
    for (const robot of [false, true]) {
      for (const detail of ['low', 'high'] as const) {
        const material = new THREE.MeshStandardMaterial();
        const f = buildFigure(0x3d8bff, material, new THREE.SpriteMaterial(), 2, null, FIGURE.detail[detail], undefined, { ...HUMAN_DRESS, robot });
        const meshes = meshesOf(f.root);
        expect(meshes).toHaveLength(6);
        for (const m of meshes) expect(m.material).toBe(material);
        expect([f.aimRifle.visible, f.aimPistol.visible, f.hitPose.visible].filter(Boolean)).toHaveLength(1);
        const rifle = new THREE.Box3().setFromBufferAttribute((f.aimRifle as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute);
        const pistol = new THREE.Box3().setFromBufferAttribute((f.aimPistol as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute);
        expect(rifle.min.z).toBeCloseTo(FIGURE.rifle.butt - FIGURE.rifle.length, 4);
        expect(pistol.min.z).toBeCloseTo(FIGURE.pistol.butt - FIGURE.pistol.length, 4);
        disposeFigure(f);
      }
    }
  });

  it('lets a figure model\'s parts replace the built legs and body on robots too', () => {
    const scene = new THREE.Group();
    const part = (name: string, x: number, y0: number, h: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), new THREE.MeshStandardMaterial({ name: name === 'body' ? 'TeamTape' : 'cloth' }));
      m.name = name;
      m.position.set(x, y0 + h / 2, 0);
      return m;
    };
    const s = 2;
    scene.add(part('body', 0, FIGURE.hipHeight * s, (FIGURE_MODEL.height - FIGURE.hipHeight) * s), part('legL', FIGURE.hipSpread * s, 0, FIGURE.hipHeight * s), part('legR', -FIGURE.hipSpread * s, 0, FIGURE.hipHeight * s));
    const model = prepareFigureModel(scene);
    const material = new THREE.MeshStandardMaterial();
    const f = buildFigure(0x3d8bff, material, new THREE.SpriteMaterial(), 0, model, undefined, undefined, { ...HUMAN_DRESS, robot: true });
    const meshes = meshesOf(f.root);
    // The model, plus the built rifle hold, pistol hold and hit pose: no built-in legs or body.
    expect(meshes.filter((m) => m.material === material)).toHaveLength(3);
    expect(meshes.filter((m) => m.material !== material).length).toBeGreaterThan(0);
    disposeFigure(f);
    model.dispose();
  });
});

describe('what the figures cost (G7)', () => {
  /** Low's triangles per part before G7 (the cheapest look's body): none may grow. */
  const BEFORE = { leg: 424, body: 1392, rifle: 1064, pistol: 824, hit: 1028 };

  it('keeps every Low part, human and robot, within what it was before, in the same six meshes', () => {
    for (const robot of [false, true]) {
      for (const id of [0, 1, 2, 3, 4, 5]) {
        const f = build(0x3d8bff, id, robot);
        expect(tris(f.legL)).toBeLessThanOrEqual(BEFORE.leg);
        expect(tris(f.legR)).toBeLessThanOrEqual(BEFORE.leg);
        expect(tris(f.upper.children[0]!)).toBeLessThanOrEqual(BEFORE.body);
        expect(tris(f.aimRifle)).toBeLessThanOrEqual(BEFORE.rifle);
        expect(tris(f.aimPistol)).toBeLessThanOrEqual(BEFORE.pistol);
        expect(tris(f.hitPose)).toBeLessThanOrEqual(BEFORE.hit);
        expect(meshesOf(f.root)).toHaveLength(6);
        disposeFigure(f);
      }
    }
  });

  it('draws a detailed figure, human or robot, in under 7,500 triangles', () => {
    for (const robot of [false, true]) {
      for (const id of [0, 1, 2, 3, 4, 5]) {
        for (const kit of [undefined, { rifleSilencer: true, rifleTorch: true, pistolTorch: true }]) {
          const f = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, FIGURE.detail.high, kit, { ...HUMAN_DRESS, robot });
          const drawn = tris(f.legL) + tris(f.legR) + tris(f.upper.children[0]!) + Math.max(tris(f.aimRifle), tris(f.aimPistol), tris(f.hitPose));
          expect(drawn).toBeLessThan(7500);
          disposeFigure(f);
        }
      }
    }
  });
});
