import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPLICA_FILE } from '../config/assets';
import { CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { CYBER_COLOURS } from '../config/schemes';
import { FIGURE } from '../config/characters';
import { HUMAN_CROWD, figureDress } from './figureMix';
import { PartBuilder } from './figureParts';
import { addPistol } from './figureReplicas';
import { buildReplicaModels, CYBER_MUZZLE, LOW_DETAIL } from './replicaModels';
import { ItemPictures } from './itemPictures';
import { loadReplicaFiles, NO_REPLICA_FILES, prepareReplicaFile, type ReplicaFile, type ReplicaFiles, replicaFileUrls } from './replicaFiles';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

/** The Cyber Pistol's model file (M101), parsed as the game parses it. */
async function cyberScene(): Promise<THREE.Object3D> {
  const buf = readFileSync(new URL('../assets/models/replicas/cyber.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  // Its animations on the scene, as loadGltfScene leaves them (RM1).
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

const trianglesOf = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) n += o.geometry.getAttribute('position').count / 3;
  });
  return n;
};

/** The model's own meshes in a built replica: its group's direct meshes (hands drawn in glove, sleeve and armband). */
const bodyMeshes = (group: THREE.Group): THREE.Mesh[] =>
  group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && !['glove', 'sleeve', 'armband', 'orange'].includes(c.name));

describe('the replica model files (M101)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds the Cyber Pistol\'s file in the build, by its replica id', () => {
    expect([...replicaFileUrls().keys()]).toContain('cyber');
  });

  it('takes the Cyber Pistol\'s file apart into its parts, its muzzle where the built-in one fires from, within budget', async () => {
    const file = prepareReplicaFile('cyber', await cyberScene());
    // The muzzle marker is the built-in layout's to a tenth of a millimetre, so BBs leave where they always did.
    expect(file.muzzle.x).toBeCloseTo(0, 4);
    expect(file.muzzle.y).toBeCloseTo(CYBER_MUZZLE.up, 4);
    expect(file.muzzle.z).toBeCloseTo(-CYBER_MUZZLE.barrelEnd, 4);
    expect(file.torchMount).not.toBeNull();
    expect(new Set(file.body.map((p) => p.key))).toEqual(new Set(['cyberSlab', 'polymer', 'cyberLine', 'cyberCore', 'metal']));
    expect(file.magazine.length).toBeGreaterThan(0);
    expect(file.figure.length).toBeGreaterThan(0);
    expect(file.triangles.held).toBeLessThanOrEqual(REPLICA_FILE.warnTriangles.default!);
    expect(file.triangles.figure).toBeLessThanOrEqual(REPLICA_FILE.warnFigureTriangles);
    // Pinned so a new export is seen: 1,220 in the body, 132 in the magazine; 112 on a figure.
    expect(file.triangles).toEqual({ held: 1352, figure: 112 });
    // Every piece is plain: positions and normals only, no index (the builders add UVs and colours as they need).
    for (const p of [...file.body, ...file.magazine, ...file.figure]) {
      expect(p.geometry.index).toBeNull();
      expect(Object.keys(p.geometry.attributes).sort()).toEqual(['normal', 'position']);
    }
    file.dispose();
  });

  it('places the figure version in the figures\' pistol frame: the back of the slide at the origin, the bore on the axis', async () => {
    const file = prepareReplicaFile('cyber', await cyberScene());
    const box = new THREE.Box3();
    for (const p of file.figure) box.union((p.geometry.computeBoundingBox(), p.geometry.boundingBox!));
    // About 20 cm long, ahead of the origin (-Z), muzzle about FIGURE.pistol.length out; the grip hangs below the bore.
    expect(box.min.z).toBeCloseTo(-0.204, 2);
    expect(box.max.z).toBeLessThan(0.02);
    expect(box.max.y).toBeGreaterThan(0.02);
    expect(box.min.y).toBeLessThan(-0.14);
    file.dispose();
  });

  it('turns down a file without a Body or a Muzzle, or one in a material the game can\'t draw in', async () => {
    const noMuzzle = await cyberScene();
    noMuzzle.getObjectByName('Muzzle')!.name = 'Nozzle';
    expect(() => prepareReplicaFile('cyber', noMuzzle)).toThrow(/Muzzle/);
    const noBody = await cyberScene();
    noBody.getObjectByName('Body')!.name = 'Slide';
    expect(() => prepareReplicaFile('cyber', noBody)).toThrow(/Body/);
    const oddMaterial = await cyberScene();
    oddMaterial.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'CyberCore') (o.material as THREE.Material).name = 'Chrome';
    });
    expect(() => prepareReplicaFile('cyber', oddMaterial)).toThrow(/Chrome/);
  });

  it('leaves a file that can\'t be had out with a warning, so the built-in model is drawn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    const files = await loadReplicaFiles(new Map([['cyber', '/missing.glb']]));
    expect(files.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('built-in model is drawn'), expect.anything());
  });
});

describe('a replica drawn from its file (M101)', () => {
  let cached: ReplicaFile | null = null;
  const cyberFile = async (): Promise<Map<string, ReplicaFile>> => new Map([['cyber', (cached ??= prepareReplicaFile('cyber', await cyberScene()))]]);

  it('draws the Cyber Pistol from the file, in its own materials, its muzzle marker where BBs always left', async () => {
    const files = await cyberFile();
    const models = buildReplicaModels([CYBER_PISTOL], 0x3a7bd5, false, LOW_DETAIL, null, 'hands', undefined, files);
    const model = models.models.get('cyber')!;
    // On Low the file's steel shares the detail material, as the built-in models' does.
    expect(new Set(bodyMeshes(model.group).map((m) => m.name))).toEqual(new Set(['cyberSlab', 'polymer', 'cyberLine', 'cyberCore', 'detail']));
    expect(bodyMeshes(model.group).reduce((n, m) => n + trianglesOf(m), 0)).toBe(1220);
    expect(trianglesOf(model.magazine.group.getObjectByName('magazine:standard')!)).toBe(132);
    const slab = bodyMeshes(model.group).find((m) => m.name === 'cyberSlab')!.material as THREE.MeshStandardMaterial;
    expect(slab.color.getHex()).toBe(CYBER_COLOURS.bold.slab);
    model.group.updateMatrixWorld(true);
    const at = model.muzzle.getWorldPosition(new THREE.Vector3());
    expect(at.y).toBeCloseTo(CYBER_MUZZLE.up, 4);
    expect(at.z).toBeCloseTo(-CYBER_MUZZLE.barrelEnd, 4);
    // Low stays plain (no UVs or colours); High takes the speckle's UVs and the edge colours.
    for (const m of bodyMeshes(model.group)) {
      expect(m.geometry.getAttribute('uv'), m.name).toBeUndefined();
      expect(m.geometry.getAttribute('color'), m.name).toBeUndefined();
    }
    const high = buildReplicaModels([CYBER_PISTOL], 0x3a7bd5, false, { replica: 'high', hands: 'high' }, null, 'hands', undefined, files);
    const highSlab = bodyMeshes(high.models.get('cyber')!.group).find((m) => m.name === 'cyberSlab')!;
    expect(highSlab.geometry.getAttribute('uv')).toBeDefined();
    expect(highSlab.geometry.getAttribute('color')).toBeDefined();
    models.dispose();
    high.dispose();
  });

  it('adds the orange tip over the file\'s plain muzzle only with the setting', async () => {
    const files = await cyberFile();
    const plain = buildReplicaModels([CYBER_PISTOL], 0, false, LOW_DETAIL, null, 'bare', undefined, files);
    const tipped = buildReplicaModels([CYBER_PISTOL], 0, true, LOW_DETAIL, null, 'bare', undefined, files);
    expect(plain.models.get('cyber')!.group.getObjectByName('orange')).toBeUndefined();
    const tip = tipped.models.get('cyber')!.group.getObjectByName('orange') as THREE.Mesh;
    tip.geometry.computeBoundingBox();
    // In front of the muzzle's face by its proud margin.
    expect(tip.geometry.boundingBox!.min.z).toBeCloseTo(-CYBER_MUZZLE.barrelEnd - REPLICA_FILE.orangeTip.proud, 5);
    plain.dispose();
    tipped.dispose();
  });

  it('draws the built-in model without a file, and never a file on another replica', async () => {
    const files = await cyberFile();
    const without = buildReplicaModels([CYBER_PISTOL], 0x3a7bd5, false, LOW_DETAIL, null, 'bare', undefined, NO_REPLICA_FILES);
    const withFile = buildReplicaModels([CYBER_PISTOL, GAS_PISTOL], 0x3a7bd5, false, LOW_DETAIL, null, 'bare', undefined, files);
    const plainGas = buildReplicaModels([GAS_PISTOL], 0x3a7bd5, false, LOW_DETAIL, null, 'bare');
    expect(trianglesOf(without.models.get('cyber')!.group)).not.toBe(trianglesOf(withFile.models.get('cyber')!.group));
    expect(trianglesOf(withFile.models.get(GAS_PISTOL.id)!.group)).toBe(trianglesOf(plainGas.models.get(GAS_PISTOL.id)!.group));
    for (const m of [without, withFile, plainGas]) m.dispose();
  });

  it('gives a figure carrying the Cyber Pistol the file\'s shape, and the others none', async () => {
    const files = await cyberFile();
    expect(figureDress(HUMAN_CROWD, 0, 0, [CYBER_PISTOL], files).pistolShape).toBe(files.get('cyber')!.figure);
    expect(figureDress(HUMAN_CROWD, 0, 0, [GAS_PISTOL], files).pistolShape ?? null).toBeNull();
    expect(figureDress(HUMAN_CROWD, 0, 0, [CYBER_PISTOL]).pistolShape ?? null).toBeNull();
  });

  it('draws that shape on the figure in the Cyber Pistol\'s colours in place of the built-in blocks, at every detail', async () => {
    const files = await cyberFile();
    const dress = figureDress(HUMAN_CROWD, 0, 0, [CYBER_PISTOL], files);
    for (const detail of [FIGURE.detail.low, FIGURE.detail.high]) {
      const shaped = new PartBuilder(detail);
      addPistol(shaped, new THREE.Matrix4(), dress.pistol, undefined, dress.pistolShape);
      const mesh = shaped.build(new THREE.MeshStandardMaterial());
      expect(trianglesOf(mesh)).toBe(112);
      // The slab's white is on it.
      const colours = mesh.geometry.getAttribute('color');
      const slab = new THREE.Color(CYBER_COLOURS.bold.slab);
      let found = false;
      for (let i = 0; i < colours.count && !found; i++) found = Math.abs(colours.getX(i) - slab.r) < 0.02 && Math.abs(colours.getY(i) - slab.g) < 0.02 && Math.abs(colours.getZ(i) - slab.b) < 0.02;
      expect(found).toBe(true);
    }
  });
});

describe('the file model beside the built-in one (M101 gaps)', () => {
  afterEach(() => vi.restoreAllMocks());
  const paint = (realistic: boolean) => ({ schemes: ['cobalt'] as never, realistic });

  it('takes the Realistic colours look: muted slab and frame, no glow', async () => {
    const files = new Map([['cyber', prepareReplicaFile('cyber', await cyberScene())]]);
    const models = buildReplicaModels([CYBER_PISTOL], 0, false, LOW_DETAIL, paint(true), 'bare', undefined, files);
    const mat = (name: string) => bodyMeshes(models.models.get('cyber')!.group).find((m) => m.name === name)!.material as THREE.MeshStandardMaterial;
    expect(mat('cyberSlab').color.getHex()).toBe(CYBER_COLOURS.realistic.slab);
    expect(mat('polymer').color.getHex()).toBe(CYBER_COLOURS.realistic.frame);
    expect(mat('cyberLine').emissive.getHex()).toBe(0);
    expect(mat('cyberCore').emissive.getHex()).toBe(0);
    // The bold look glows, so the check above is not an always-zero.
    const bold = buildReplicaModels([CYBER_PISTOL], 0, false, LOW_DETAIL, paint(false), 'bare', undefined, files);
    const boldCore = bodyMeshes(bold.models.get('cyber')!.group).find((m) => m.name === 'cyberCore')!.material as THREE.MeshStandardMaterial;
    expect(boldCore.emissive.getHex()).not.toBe(0);
    models.dispose();
    bold.dispose();
  });

  it('keeps the weapon torch part and the built-in magazine drop axis on the file model', async () => {
    const files = new Map([['cyber', prepareReplicaFile('cyber', await cyberScene())]]);
    const fromFile = buildReplicaModels([CYBER_PISTOL], 0, false, LOW_DETAIL, null, 'bare', undefined, files).models.get('cyber')!;
    const builtIn = buildReplicaModels([CYBER_PISTOL], 0, false, LOW_DETAIL, null, 'bare', undefined, NO_REPLICA_FILES).models.get('cyber')!;
    expect(fromFile.group.getObjectByName('light:weaponTorch')).toBeDefined();
    expect(fromFile.group.getObjectByName('magazine')).toBe(fromFile.magazine.group);
    expect(fromFile.magazine.axis.toArray()).toEqual(builtIn.magazine.axis.toArray());
    expect(fromFile.magazine.axis.y).toBeLessThan(0);
  });

  it('pictures the Cyber Pistol from the file when it has one, and from the built-in model when not', async () => {
    const files = new Map([['cyber', prepareReplicaFile('cyber', await cyberScene())]]);
    const meshCount = async (given: () => ReplicaFiles): Promise<number> => {
      let meshes = 0;
      const target = {
        draw(scene: THREE.Scene) {
          scene.traverseVisible((o) => o instanceof THREE.Mesh && meshes++);
          return new Float32Array(4 * 4 * 4).fill(0.2);
        },
        encode: () => 'picture',
        dispose() {},
      };
      let run: (() => void) | null = null;
      const pictures = new ItemPictures(target, (w) => (run = w), given);
      const p = pictures.picture({ replica: CYBER_PISTOL, scheme: 'cobalt', realistic: false });
      run!();
      await p;
      return meshes;
    };
    const withFile = await meshCount(() => files);
    const without = await meshCount(() => NO_REPLICA_FILES);
    expect(withFile).toBeGreaterThan(0);
    expect(withFile).not.toBe(without);
  });

  it('warns and draws the built-in model when the answer is not a .glb', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<!doctype html><html></html>', { status: 200 }));
    const files = await loadReplicaFiles(new Map([['cyber', '/index.html']]));
    expect(files.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('built-in model is drawn'), expect.objectContaining({ message: expect.stringContaining('.glb') }));
  });
});
