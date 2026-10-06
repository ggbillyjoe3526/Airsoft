import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { CYBER_COLOURS, FAMILIES, SCHEMES } from '../config/schemes';
import { buildReplicaModels, LOW_DETAIL } from './replicaModels';

const HIGH = { replica: 'high', hands: 'high' } as const;

/** Every distinct material colour (hex) on one replica's model. */
function coloursOf(root: THREE.Object3D, scale = 1): Set<number> {
  const out = new Set<number>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of [o.material].flat() as THREE.MeshStandardMaterial[]) if (m.color) out.add(m.color.clone().multiplyScalar(scale).getHex());
  });
  return out;
}

describe('Replica paint (G1)', () => {
  it('draws each replica in its own scheme: body, furniture, details, accent line and steel', () => {
    // On Low the steel shares the detail material (G2: no more draw calls than before), so it shows on High only.
    const levels = [
      [LOW_DETAIL, ['body', 'furniture', 'detail', 'accent']],
      [HIGH, ['body', 'furniture', 'detail', 'accent', 'steel']],
    ] as const;
    for (const [detail, parts] of levels) {
      const models = buildReplicaModels([AEG, GAS_PISTOL], 0x3d8bff, false, detail, { schemes: ['signal', 'acid'], realistic: false });
      // High's vertex-coloured materials are brightened by 1 / wearLight (see below), so either form counts.
      const both = (root: THREE.Object3D): Set<number> => new Set([...coloursOf(root), ...coloursOf(root, 1 / REPLICA_FINISH.wearLight)]);
      const rifle = detail.replica === 'high' ? both(models.models.get(AEG.id)!.group) : coloursOf(models.models.get(AEG.id)!.group);
      const pistol = detail.replica === 'high' ? both(models.models.get(GAS_PISTOL.id)!.group) : coloursOf(models.models.get(GAS_PISTOL.id)!.group);
      for (const part of parts) expect(rifle.has(SCHEMES.signal[part]), `${detail.replica} ${part}`).toBe(true);
      for (const part of parts) expect(pistol.has(SCHEMES.acid[part]), `${detail.replica} ${part}`).toBe(true);
      expect(pistol.has(SCHEMES.signal.furniture)).toBe(false);
      models.dispose();
    }
  });

  it('draws the scheme’s plain family under Realistic colours, and the black and tan of before with no paint', () => {
    const real = buildReplicaModels([AEG], 0x3d8bff, false, LOW_DETAIL, { schemes: ['signal'], realistic: true });
    const colours = coloursOf(real.models.get(AEG.id)!.group);
    expect(colours.has(FAMILIES.tan.furniture)).toBe(true);
    expect(colours.has(SCHEMES.signal.furniture)).toBe(false);
    real.dispose();
    const plain = buildReplicaModels([AEG], 0x3d8bff, false, LOW_DETAIL);
    expect(coloursOf(plain.models.get(AEG.id)!.group).has(0xb79c70)).toBe(true);
    plain.dispose();
  });

  it('keeps the colour exact on high detail, where flat faces sit under their vertex colour', () => {
    const models = buildReplicaModels([AEG], 0x3d8bff, false, HIGH, { schemes: ['cobalt'], realistic: false });
    // High's materials are brightened by 1 / VERTEX_BASE (= wearLight) so a flat face shows the colour itself.
    const flat = coloursOf(models.models.get(AEG.id)!.group, 1 / REPLICA_FINISH.wearLight);
    expect(flat.has(SCHEMES.cobalt.furniture)).toBe(true);
    models.dispose();
  });

  it('keeps the Cyber Pistol in its own colours whatever the scheme, plain and unlit under Realistic colours', () => {
    const own = buildReplicaModels([CYBER_PISTOL], 0x3d8bff, false, LOW_DETAIL, { schemes: ['coral'], realistic: false });
    const colours = coloursOf(own.models.get(CYBER_PISTOL.id)!.group);
    expect(colours.has(CYBER_COLOURS.bold.slab)).toBe(true);
    expect(colours.has(SCHEMES.coral.furniture)).toBe(false);
    own.dispose();
    // The same with no paint at all (a tool or a test): its colours are its own.
    const bare = buildReplicaModels([CYBER_PISTOL], 0x3d8bff, false);
    expect(coloursOf(bare.models.get(CYBER_PISTOL.id)!.group).has(CYBER_COLOURS.bold.slab)).toBe(true);
    bare.dispose();
    const real = buildReplicaModels([CYBER_PISTOL], 0x3d8bff, false, LOW_DETAIL, { schemes: ['coral'], realistic: true });
    const plain = coloursOf(real.models.get(CYBER_PISTOL.id)!.group);
    expect(plain.has(CYBER_COLOURS.bold.slab)).toBe(false);
    expect(plain.has(CYBER_COLOURS.realistic.slab)).toBe(true);
    real.models.get(CYBER_PISTOL.id)!.group.traverse((o) => {
      if (o instanceof THREE.Mesh) expect((o.material as THREE.MeshStandardMaterial).emissive?.getHex() ?? 0, o.name).toBe(0);
    });
    real.dispose();
  });

  it('disposes the materials it made for each replica, and the sheen switches their steel too', () => {
    const disposed = vi.spyOn(THREE.Material.prototype, 'dispose');
    const models = buildReplicaModels([AEG, GAS_PISTOL], 0x3d8bff, false, HIGH, { schemes: ['teal', 'hazard'], realistic: false });
    const steels = new Set<THREE.MeshStandardMaterial>();
    for (const { group } of models.models.values()) {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).metalness > 0) steels.add(o.material as THREE.MeshStandardMaterial);
      });
    }
    models.setReflections(true);
    for (const m of steels) expect(m.metalness).toBe(REPLICA_FINISH.metal.lit.metalness);
    const made = new Set<THREE.Material>();
    for (const { group } of models.models.values()) group.traverse((o) => o instanceof THREE.Mesh && made.add(o.material as THREE.Material));
    disposed.mockClear();
    models.dispose();
    for (const m of made) expect(disposed.mock.contexts).toContain(m);
    disposed.mockRestore();
  });
});
