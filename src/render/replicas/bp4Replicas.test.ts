import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { factoryParts } from '../../config/attachments';
import { AEG, GAS_PISTOL } from '../../config/replicas';
import { createArmament, fitOptics } from '../../sim/armament';
import { createCharacter } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { figureDress, HUMAN_CROWD } from '../figures/figureMix';
import { fitParts } from './itemPictures';
import { prepareReplicaFile, type ReplicaFile, type ReplicaFiles } from './replicaFiles';
import { buildReplicaModels, LOW_DETAIL } from './replicaModels';
import { clipEndMoves, SIGHTS_FOLD } from './replicaRig';
import { type RiggedFrame, RiggedFigure } from '../figures/riggedFigure';
import { figureFilesForTests, modelScene } from '../testSupport';
import { ThrownMagazines } from '../figures/thrownMagazines';

/** BP4 (Blender models bug pass): the replica model files' fixes, R1 to R7. */

const fileOf = async (id: 'aeg' | 'pistol'): Promise<ReplicaFile> => prepareReplicaFile(id, await modelScene(`replicas/${id}.glb`), await modelScene(`replicaParts/${id}.glb`));
const boxOf = (pieces: readonly { geometry: THREE.BufferGeometry }[]): THREE.Box3 => {
  const box = new THREE.Box3();
  for (const p of pieces) box.union((p.geometry.computeBoundingBox(), p.geometry.boundingBox!));
  return box;
};
const aeg = await fileOf('aeg');
const pistol = await fileOf('pistol');
const rigged = await figureFilesForTests();
const files: ReplicaFiles = new Map([
  ['aeg', aeg],
  ['pistol', pistol],
]);

describe('R1 a file\'s figure version loses the file\'s park offset', () => {
  it('sits where the body is, not 0.3 m under it', () => {
    for (const file of [aeg, pistol]) {
      const body = boxOf(file.body);
      const held = boxOf(file.figureHeld);
      expect(held.isEmpty(), file.id).toBe(false);
      const dy = (held.min.y + held.max.y) / 2 - (body.min.y + body.max.y) / 2;
      expect(Math.abs(dy), file.id).toBeLessThan(0.08);
      expect(Math.abs((held.min.z + held.max.z) / 2 - (body.min.z + body.max.z) / 2), file.id).toBeLessThan(0.08);
      expect(Math.abs((held.min.x + held.max.x) / 2), file.id).toBeLessThan(0.02);
    }
  });
});

describe('R4 a laser\'s beam leaves the parts file\'s _Beam marker', () => {
  it('reads the marker into ReplicaFile.beams', () => {
    expect(pistol.beams.get('laser:redLaser')).toBeDefined();
    expect(pistol.beams.get('laser:redLaser')!.z).toBeLessThan(-0.05);
    // A part without a marker has none.
    expect(pistol.beams.has('magazine:extended')).toBe(false);
    expect(aeg.beams.has('laser:redLaser')).toBe(false);
  });

  const beamStart = (file: ReplicaFile): THREE.Vector3 => {
    const models = buildReplicaModels([GAS_PISTOL], 0, false, LOW_DETAIL, null, 'bare', undefined, new Map([['pistol', file]]));
    const beam = models.models.get('pistol')!.group.getObjectByName('laserBeam') as THREE.LineSegments;
    const pos = beam.geometry.getAttribute('position');
    const out = new THREE.Vector3().fromArray([pos.getX(0), pos.getY(0), pos.getZ(0)]);
    models.dispose();
    return out;
  };

  it('starts the beam at the marker, else at the built-in lens', () => {
    const marker = pistol.beams.get('laser:redLaser')!;
    const at = beamStart(pistol);
    expect(at.y).toBeCloseTo(marker.y, 5);
    expect(at.z).toBeCloseTo(marker.z, 5);
    const copy = { ...pistol, beams: new Map<string, THREE.Vector3>() } as ReplicaFile;
    const fallback = beamStart(copy);
    // The built-in lens: 0.093 ahead, 0.034 under.
    expect(fallback.z).toBeCloseTo(-0.093, 5);
    expect(fallback.y).toBeCloseTo(-0.034, 5);
    expect(fallback.distanceTo(at)).toBeGreaterThan(0.005);
  });
});

describe('R7 ownTip counts only the replica\'s own muzzle pieces', () => {
  it('is false for the gas pistol although its parts file\'s silencer is tipped, true for the AEG with its own', () => {
    const tipped = [...pistol.parts].filter(([, ps]) => ps.some((p) => p.key === 'orange')).map(([k]) => k);
    expect(tipped).toContain('muzzle:silencer');
    expect([...pistol.body, ...pistol.flashHider, ...(pistol.rig?.pieces ?? [])].some((p) => p.key === 'orange')).toBe(false);
    expect(pistol.ownTip).toBe(false);
    expect(aeg.ownTip).toBe(true);
  });
});

describe('R3 iron sights fold under an optic', () => {
  it('clipEndMoves carries the sights\' bones to where the fold clip ends, and moves nothing without the clip', () => {
    const moves = clipEndMoves(aeg.rig!, SIGHTS_FOLD);
    const names = aeg.rig!.bones.map((b) => b.name);
    const identity = new THREE.Matrix4();
    const moved = (name: string): boolean => !moves[names.indexOf(name)]!.equals(identity);
    expect(moved('rearSight')).toBe(true);
    expect(moved('frontSight')).toBe(true);
    expect(moved('trigger')).toBe(false);
    for (const m of clipEndMoves(aeg.rig!, 'NoSuchClip')) expect(m.equals(identity)).toBe(true);
  });

  it('shows the sights folded in a menu picture\'s model with an optic, and standing without', () => {
    const models = buildReplicaModels([AEG], 0x3a7bd5, false, LOW_DETAIL, null, 'bare', undefined, files);
    const model = models.models.get('aeg')!;
    const sight = model.group.getObjectByName('rig_rearSight')!;
    const rest = sight.quaternion.clone();
    fitParts(model, { optic: 'redDot' });
    expect(sight.quaternion.angleTo(rest)).toBeCloseTo(Math.PI / 2, 1);
    fitParts(model, {});
    expect(sight.quaternion.angleTo(rest)).toBeLessThan(1e-6);
    models.dispose();
  });
});

describe('the figures\' near model (R2, R3)', () => {
  const frame: RiggedFrame = { alpha: 1, dt: 1 / 60, eyeX: 0, eyeY: 1, eyeZ: 3, firstPerson: false, leanX: 0, leanZ: 0, peek: 0, peekPivot: 0.92, cycle: null, castShadow: true };

  /** The near model's vertex positions of the replica in slot 0, for a character with `loadout`. */
  async function nearOf(loadout: Parameters<typeof createArmament>[0], parts: Parameters<typeof createArmament>[1], optic: 'redDot' | null = null): Promise<Float32Array> {
    const c = createCharacter(1, vec3(0, 0, 0), 0);
    c.armament = createArmament(loadout, parts);
    if (optic) fitOptics(c.armament, [optic]);
    c.grounded = true;
    const dress = figureDress(HUMAN_CROWD, 0, c.team, c.armament.replicas, files);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    material.userData.authored = { opacity: 1, transparent: false };
    const f = new RiggedFigure({ rig: rigged.rigs.human, character: c, id: 1, teamColour: 0, replicaMaterial: material, rifleColours: dress.rifle, pistolColours: dress.pistol, files, detail: 'high', pack: false, radio: false, thrown: new ThrownMagazines(), calloutMaterial: new THREE.SpriteMaterial() });
    f.update(c, frame);
    let out = new Float32Array();
    f.root.traverse((o) => {
      if ((o.name === 'held:pistol' || o.name === 'held:rifle') && out.length === 0) {
        const mesh = o.children.find((ch): ch is THREE.Mesh => ch instanceof THREE.Mesh)!;
        out = new Float32Array(mesh.geometry.getAttribute('position').array as ArrayLike<number>);
      }
    });
    f.dispose();
    return out;
  }

  it('R2 moves a torch fitted with a laser to the UnderLaser marker', async () => {
    const under = pistol.underLaser.get('light:weaponTorch')!;
    expect(Math.abs(under.y)).toBeGreaterThan(0.005);
    const fit = (extra: object) => [{ ...factoryParts(GAS_PISTOL), ...extra }];
    const none = await nearOf([GAS_PISTOL], fit({ laser: null, light: null }));
    const torch = await nearOf([GAS_PISTOL], fit({ laser: null, light: 'weaponTorch' }));
    const both = await nearOf([GAS_PISTOL], fit({ laser: 'redLaser', light: 'weaponTorch' }));
    const laser = await nearOf([GAS_PISTOL], fit({ laser: 'redLaser', light: null }));
    // The torch is the last shape: its vertices are the tail of the geometry.
    const n = torch.length - none.length;
    expect(n).toBeGreaterThan(0);
    expect(both.length - laser.length).toBe(n);
    for (let i = 0; i < n; i += 3) {
      const a = torch.length - n + i;
      const b = both.length - n + i;
      expect(both[b]! - torch[a]!).toBeCloseTo(under.x, 4);
      expect(both[b + 1]! - torch[a + 1]!).toBeCloseTo(under.y, 4);
      expect(both[b + 2]! - torch[a + 2]!).toBeCloseTo(under.z, 4);
    }
  });

  it('R3 folds the iron sights down on the rifle with an optic fitted', async () => {
    const parts = [factoryParts(AEG)];
    const bare = await nearOf([AEG], parts);
    const withOptic = await nearOf([AEG], [{ ...parts[0]!, optic: 'redDot' } as never], 'redDot');
    // The whole model, then the moving parts (the sights among them) come first in the geometry; the optic is added after.
    const count = (ps: readonly { geometry: THREE.BufferGeometry }[]): number => ps.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0);
    const prefix = (count(aeg.body) + count(aeg.rig!.pieces)) * 3;
    let lowered = 0;
    let raised = 0;
    for (let i = 0; i < Math.min(prefix, bare.length, withOptic.length); i += 3) {
      const dy = withOptic[i + 1]! - bare[i + 1]!;
      if (dy < -0.004) lowered++;
      if (dy > 0.004) raised++;
    }
    expect(lowered).toBeGreaterThan(10);
    expect(raised).toBe(0);
  });
});

describe('R6 a rigged-figure chunk that fails to load gives null with a warning', () => {
  afterEach(() => {
    vi.doUnmock('../figures/figureRig');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('resolves the figures as null (the built-in ones) and warns, not rejecting', async () => {
    vi.resetModules();
    vi.doMock('../figures/figureRig', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ModelFiles } = await import('../figures/modelFiles');
    const models = new ModelFiles(
      () => Promise.resolve({ dispose() {} } as never),
      () => Promise.resolve(new Map() as ReplicaFiles),
    );
    await expect(models.load()).resolves.toBeUndefined();
    expect(models.figureRigs).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('built-in figures'), expect.anything());
  });
});
