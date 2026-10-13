import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { fitOptics, fitParts } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { buildFigure, disposeFigure, type FigureKit } from './characterModels';
import { CharacterRenderer, riggedKit, rifleOptic } from './characterRenderer';
import { figureDress, HUMAN_CROWD } from './figureMix';
import { type FigureDetail, PartBuilder } from './figureParts';
import { addRifle } from './figureReplicas';
import { figureRigs } from './figureRig';
import { AEG_MUZZLE } from './replicaParts';
import { RiggedFigure } from './riggedFigure';
import { figureFilesForTests } from './testSupport';
import { ThrownMagazines } from './thrownMagazines';

/**
 * BG1: bots carry kits, and their figures show them. The rigged figures (behind the Dev switches) hold each replica's
 * own model with its fitted optic, grip, laser and barrel from the parts files, the muzzle device out at a longer
 * barrel's end; the built-in figures carry a fitted optic on the rifle at every detail.
 */

const { rigs, files } = await figureFilesForTests();

const vertices = (o: THREE.Object3D): number => {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) n += m.geometry.getAttribute('position').count;
  });
  return n;
};

/** A rigged human figure for `c`, drawn near (high detail). */
function rigged(c: Character): RiggedFigure {
  const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.authored = { opacity: 1, transparent: false };
  return new RiggedFigure({
    rig: rigs.human,
    character: c,
    id: c.id,
    teamColour: 0x3d8bff,
    replicaMaterial: material,
    rifleColours: dress.rifle,
    pistolColours: dress.pistol,
    files,
    detail: 'high',
    pack: false,
    radio: false,
    thrown: new ThrownMagazines(),
    calloutMaterial: new THREE.SpriteMaterial(),
  });
}

/** The near model of the replica held as `hold` (the holder's first mesh), in the holder's space. */
function nearOf(f: RiggedFigure, hold: 'rifle' | 'pistol'): THREE.Mesh {
  return f.root.getObjectByName(`held:${hold}`)!.children.find((m): m is THREE.Mesh => m instanceof THREE.Mesh)!;
}

/** A character with the factory loadout, its rifle (slot 0) and pistol (slot 1) fitted as given. */
function kitted(rifle: Record<string, string>, optic: 'redDot' | 'scope2x' | null, pistol: Record<string, string> = {}): Character {
  const c = createCharacter(1, vec3(), 0, undefined, 1);
  const a = c.armament;
  fitParts(a, [{ ...a.parts[0]!, ...rifle }, { ...a.parts[1]!, ...pistol }] as typeof a.parts);
  fitOptics(a, [optic, null]);
  return c;
}

describe('bot gear on the rigged figures (BG1)', () => {
  it('holds the rifle with its fitted optic, grip and barrel, and the pistol with its laser', () => {
    const bare = rigged(createCharacter(1, vec3(), 0, undefined, 1));
    const geared = rigged(kitted({ grip: 'vertical', barrel: 'long' }, 'scope2x', { laser: 'redLaser' }));
    for (const [kind, id] of [['optic', 'scope2x'], ['grip', 'vertical'], ['barrel', 'long']] as const) expect(files.get('aeg')!.parts.has(`${kind}:${id}`)).toBe(true);
    expect(vertices(nearOf(geared, 'rifle'))).toBeGreaterThan(vertices(nearOf(bare, 'rifle')));
    expect(vertices(nearOf(geared, 'pistol'))).toBeGreaterThan(vertices(nearOf(bare, 'pistol')));
    // The far model stays the cut-down one.
    bare.dispose();
    geared.dispose();
  });

  it('puts each part in the model by itself: a scope over the receiver, a red dot smaller', () => {
    const size = (optic: 'redDot' | 'scope2x' | null): number => {
      const f = rigged(kitted({}, optic));
      const n = vertices(nearOf(f, 'rifle'));
      f.dispose();
      return n;
    };
    const bare = size(null);
    expect(size('redDot')).toBeGreaterThan(bare);
    expect(size('scope2x')).toBeGreaterThan(size('redDot'));
  });

  it('moves the muzzle device out to a longer barrel\'s end', () => {
    const front = (barrel: string | null): number => {
      const f = rigged(kitted(barrel ? { barrel, muzzle: 'silencer' } : { muzzle: 'silencer' }, null));
      const g = nearOf(f, 'rifle').geometry;
      g.computeBoundingBox();
      const z = g.boundingBox!.min.z;
      f.dispose();
      return z;
    };
    // Bore along -Z: the long barrel's silencer ends its reach further forward.
    expect(front(null) - front('long')).toBeCloseTo(AEG_MUZZLE.extensions.long, 3);
    expect(front('tightBore')).toBeCloseTo(front(null), 6);
  });

  it('names a kit change between rounds by its optic, grip, laser and barrel too, so the figure is rebuilt', () => {
    const c = kitted({}, null);
    const before = riggedKit(c);
    fitOptics(c.armament, ['redDot', null]);
    const dot = riggedKit(c);
    expect(dot).not.toBe(before);
    fitParts(c.armament, [{ ...c.armament.parts[0]!, grip: 'angled' }, c.armament.parts[1]!]);
    expect(riggedKit(c)).not.toBe(dot);
  });
});

describe('bot gear in CharacterRenderer (BG1)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  for (const withRigs of [false, true]) {
    it(`rebuilds a figure whose rifle gains an optic between rounds, and only that one (${withRigs ? 'rigged' : 'built-in'})`, () => {
      const cs = [createCharacter(0, vec3(), 0), createCharacter(1, vec3(2, 0, 0), 0, undefined, 1)];
      const r = new CharacterRenderer(cs, [0x3d8bff, 0xff5a3d], HITS, null, 'low', HUMAN_CROWD, files, withRigs ? figureRigs(rigs.human, rigs.robot, () => {}) : null);
      r.update(1, 1 / 60, -1);
      const figures = (r as unknown as { figures: { figure: unknown; rigged: unknown }[] }).figures;
      const before = figures.map((s) => s.figure ?? s.rigged);
      fitOptics(cs[1]!.armament, ['scope2x', null]);
      expect(rifleOptic(cs[1]!)).toBe('scope2x');
      r.update(1, 1 / 60, -1);
      const after = figures.map((s) => s.figure ?? s.rigged);
      expect(after[0]).toBe(before[0]);
      expect(after[1]).not.toBe(before[1]);
      r.update(1, 1 / 60, -1);
      expect(figures.map((s) => s.figure ?? s.rigged)).toEqual(after);
      r.dispose();
    });
  }
});

describe('bot gear on the built-in figures (BG1)', () => {
  const figure = (kit: FigureKit, detail: FigureDetail = FIGURE.detail.low) => buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, detail, kit);
  /** The highest point of the rifle alone, built in its own frame (the bore on the axis). */
  const rifleTop = (kit: FigureKit, detail: FigureDetail = FIGURE.detail.low): number => {
    const b = new PartBuilder(detail);
    addRifle(b, new THREE.Matrix4(), figureDress(HUMAN_CROWD, 0, 0, createCharacter(0, vec3(), 0).armament.replicas).rifle, kit);
    const mesh = b.build(new THREE.MeshStandardMaterial());
    mesh.geometry.computeBoundingBox();
    const y = mesh.geometry.boundingBox!.max.y;
    mesh.geometry.dispose();
    return y;
  };

  it('carries a fitted optic on the rifle at every detail, above the receiver, a scope bigger than a red dot', () => {
    for (const detail of [FIGURE.detail.low, FIGURE.detail.high] as FigureDetail[]) {
      const bare = figure({ rifleSilencer: false }, detail);
      const dot = figure({ rifleSilencer: false, rifleOptic: 'redDot' }, detail);
      const scope = figure({ rifleSilencer: false, rifleOptic: 'scope2x' }, detail);
      expect(vertices(dot.aimRifle)).toBeGreaterThan(vertices(bare.aimRifle));
      expect(vertices(scope.aimRifle)).toBeGreaterThan(vertices(dot.aimRifle));
      expect(rifleTop({ rifleSilencer: false, rifleOptic: 'scope2x' }, detail)).toBeCloseTo(FIGURE.optic.scope2x.height + FIGURE.optic.scope2x.objective, 6);
      expect(rifleTop({ rifleSilencer: false, rifleOptic: 'redDot' }, detail)).toBeGreaterThan(rifleTop({ rifleSilencer: false }, detail));
      // The pistol never shows it.
      expect(vertices(scope.aimPistol)).toBe(vertices(bare.aimPistol));
      for (const f of [bare, dot, scope]) disposeFigure(f);
    }
  });

  it('reads the optic off the rifle, not the pistol', () => {
    const c = createCharacter(1, vec3(), 0, undefined, 1);
    expect(rifleOptic(c)).toBeNull();
    fitOptics(c.armament, [null, 'redDot']);
    expect(rifleOptic(c)).toBeNull();
    fitOptics(c.armament, ['redDot', null]);
    expect(rifleOptic(c)).toBe('redDot');
  });
});
