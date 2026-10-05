import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { CYBER_COLOURS, SCHEME_IDS, SCHEMES, schemeColours } from '../config/schemes';
import { buildReplicaModels, LOW_DETAIL, REPLICA_PART_TABLES, RIFLE_OPTIC, type ReplicaDetail } from './replicaModels';

/** G2's finish on the replica models: the accent line, the stippled panels, Low staying plain, the red dot's window. */

const HIGH: ReplicaDetail = { replica: 'high', hands: 'high' };
const BOTH = { low: LOW_DETAIL, high: HIGH } as const;
const REPLICAS = [AEG, GAS_PISTOL] as const;
const F = REPLICA_FINISH;

const meshesNamed = (root: THREE.Object3D, name: string): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && o.name === name && out.push(o));
  return out;
};
const allMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
};
const std = (m: THREE.Mesh): THREE.MeshStandardMaterial => m.material as THREE.MeshStandardMaterial;
/** The colour a flat face shows: High brightens a vertex-coloured material by wearLight, so undo it. */
const shown = (m: THREE.Mesh): THREE.Color => std(m).color.clone().multiplyScalar(std(m).vertexColors ? 1 / F.wearLight : 1);
const expectColour = (got: THREE.Color, hex: number, what: string): void => {
  const want = new THREE.Color(hex);
  for (const c of ['r', 'g', 'b'] as const) expect(got[c], `${what} ${c}`).toBeCloseTo(want[c], 5);
};

describe('G2: the accent line', () => {
  it('shows every scheme\'s accent on the rifle and the Gas Pistol, lit only where the scheme glows, on both levels', () => {
    for (const [level, detail] of Object.entries(BOTH)) {
      for (const realistic of [false, true]) {
        for (const id of SCHEME_IDS) {
          const scheme = schemeColours(id, realistic);
          const models = buildReplicaModels(REPLICAS, 0x3d8bff, false, detail, { schemes: [id, id], realistic });
          for (const r of REPLICAS) {
            const lines = meshesNamed(models.models.get(r.id)!.group, 'accent');
            expect(lines.length, `${level} ${id} ${r.id} has an accent line`).toBeGreaterThan(0);
            for (const line of lines) {
              const mat = std(line);
              const what = `${level} ${id}${realistic ? ' real' : ''} ${r.id}`;
              if (scheme.glow) {
                expect(mat.emissive.getHex(), what).toBe(scheme.accent);
                expect(mat.emissiveIntensity, what).toBe(F.accentGlow);
              } else {
                expect(mat.emissive.getHex(), what).toBe(0);
                expectColour(shown(line), scheme.accent, what);
              }
            }
          }
          models.dispose();
        }
      }
    }
  });

  it('glows Ghost\'s cyan line on both replicas and leaves Cobalt\'s painted, and Realistic colours put the glow out', () => {
    expect(SCHEMES.ghost.glow).toBe(true);
    expect(SCHEMES.cobalt.glow).toBeFalsy();
    for (const detail of [LOW_DETAIL, HIGH]) {
      const models = buildReplicaModels(REPLICAS, 0x3d8bff, false, detail, { schemes: ['ghost', 'cobalt'], realistic: false });
      const ghost = std(meshesNamed(models.models.get('aeg')!.group, 'accent')[0]!);
      const cobalt = std(meshesNamed(models.models.get('pistol')!.group, 'accent')[0]!);
      expect(ghost.emissive.getHex()).toBe(0x30f0ff);
      expect(cobalt.emissive.getHex()).toBe(0);
      expect(ghost).not.toBe(cobalt);
      models.dispose();
      const plain = buildReplicaModels(REPLICAS, 0x3d8bff, false, detail, { schemes: ['ghost', 'ghost'], realistic: true });
      for (const r of REPLICAS) expect(std(meshesNamed(plain.models.get(r.id)!.group, 'accent')[0]!).emissive.getHex(), r.id).toBe(0);
      plain.dispose();
    }
  });

  it('lights the Cyber Pistol\'s lines and core in colour under Bold, and leaves them grey and unlit under Realistic, on every part that carries them', () => {
    for (const [level, detail] of Object.entries(BOTH)) {
      for (const realistic of [false, true]) {
        const C = realistic ? CYBER_COLOURS.realistic : CYBER_COLOURS.bold;
        const models = buildReplicaModels([CYBER_PISTOL], 0x3d8bff, false, detail, { schemes: ['ghost'], realistic });
        const group = models.models.get('cyber')!.group;
        for (const [key, hex] of [['cyberLine', C.line], ['cyberCore', C.core]] as const) {
          const found = meshesNamed(group, key);
          expect(found.length, `${level} ${key}`).toBeGreaterThan(0);
          for (const mesh of found) {
            const what = `${level}${realistic ? ' real' : ''} ${key}`;
            if (realistic) {
              expect(std(mesh).emissive.getHex(), what).toBe(0);
              expectColour(shown(mesh), hex, what);
            } else {
              expect(std(mesh).emissive.getHex(), what).toBe(hex);
              expect(std(mesh).emissiveIntensity, what).toBe(F.accentGlow);
            }
          }
        }
        // On High the magazine's base pad carries a core line of its own: it follows the colours too.
        if (level === 'high') expect(meshesNamed(group.getObjectByName('magazine:standard')!, 'cyberCore').length).toBeGreaterThan(0);
        models.dispose();
      }
    }
  });
});

describe('G2: the stippled panels', () => {
  it('paint the furniture colour times the stipple shade, repainted for each replica\'s scheme and for Realistic colours', () => {
    expect(F.stippleShade).toBeLessThan(1);
    const schemes = ['cobalt', 'acid'] as const;
    for (const realistic of [false, true]) {
      const models = buildReplicaModels(REPLICAS, 0x3d8bff, false, HIGH, { schemes, realistic });
      const seen: THREE.Material[] = [];
      REPLICAS.forEach((r, slot) => {
        const group = models.models.get(r.id)!.group;
        const panels = meshesNamed(group, 'stipple');
        expect(panels.length, `${r.id} has stippled panels on high`).toBeGreaterThan(0);
        const furniture = new THREE.Color(schemeColours(schemes[slot]!, realistic).furniture).multiplyScalar(F.stippleShade);
        for (const panel of panels) expectColour(shown(panel), furniture.getHex(), `${r.id}${realistic ? ' real' : ''}`);
        // Its own material: not the rubber, not the other replica's, not the furniture's.
        const mat = panels[0]!.material as THREE.Material;
        expect(meshesNamed(group, 'furniture').every((m) => m.material !== mat)).toBe(true);
        seen.push(mat);
      });
      expect(seen[0]).not.toBe(seen[1]);
      models.dispose();
    }
    // The Cyber Pistol's grip panels: its dark frame times the shade, the same on either team and under Realistic colours.
    for (const realistic of [false, true]) {
      const cyber = buildReplicaModels([CYBER_PISTOL], 0x3d8bff, false, HIGH, { schemes: ['ghost'], realistic });
      const panels = meshesNamed(cyber.models.get('cyber')!.group, 'stipple');
      expect(panels.length).toBeGreaterThan(0);
      for (const panel of panels) expectColour(shown(panel), new THREE.Color(CYBER_COLOURS.bold.frame).multiplyScalar(F.stippleShade).getHex(), `cyber${realistic ? ' real' : ''}`);
      cyber.dispose();
    }
    // The fitted vertical grip's three bands are stippled too.
    const full = buildReplicaModels([AEG], 0x3d8bff, false, HIGH, { schemes: ['teal'], realistic: false });
    const grip = full.models.get('aeg')!.group.getObjectByName('grip:vertical')!;
    const bands = meshesNamed(grip, 'stipple');
    expect(bands).toHaveLength(1);
    expectColour(shown(bands[0]!), new THREE.Color(SCHEMES.teal.furniture).multiplyScalar(F.stippleShade).getHex(), 'vertical grip');
    full.dispose();
  });
});

describe('G2: Low stays plain and parts stay small, painted and bare as well', () => {
  it('draws every part of all three replicas with no uvs, vertex colours or maps on Low, whatever the paint and hands', () => {
    for (const hands of ['hands', 'bare'] as const) {
      for (const realistic of [false, true]) {
        const models = buildReplicaModels([AEG, GAS_PISTOL, CYBER_PISTOL], 0x3d8bff, true, LOW_DETAIL, { schemes: ['ghost', 'acid', 'coral'], realistic }, hands);
        for (const [id, { group }] of models.models) {
          const meshes = allMeshes(group);
          expect(meshes.length, id).toBeGreaterThan(5);
          for (const m of meshes) {
            const what = `${id} ${m.name} ${hands} ${realistic}`;
            expect(m.geometry.getAttribute('uv'), what).toBeUndefined();
            expect(m.geometry.getAttribute('color'), what).toBeUndefined();
            expect(std(m).vertexColors, what).toBeFalsy();
            expect(std(m).roughnessMap ?? null, what).toBeNull();
            expect(std(m).normalMap ?? null, what).toBeNull();
          }
        }
        models.dispose();
      }
    }
  });

  it('keeps every high part (the Cyber Pistol\'s table too) to at most four meshes and four materials, painted', () => {
    const models = buildReplicaModels([AEG, GAS_PISTOL, CYBER_PISTOL], 0x3d8bff, false, HIGH, { schemes: ['ghost', 'signal', 'hazard'], realistic: false }, 'bare');
    for (const [id, table] of Object.entries(REPLICA_PART_TABLES)) {
      const group = models.models.get(id)!.group;
      const names = [...Object.keys(table.parts), ...Object.keys(table.magazines).map((m) => `magazine:${m}`), ...Object.keys(table.muzzles).map((m) => `muzzle:${m}`)];
      expect(names.length, id).toBeGreaterThan(0);
      for (const name of names) {
        const meshes = allMeshes(group.getObjectByName(name)!);
        expect(meshes.length, `${id} ${name}`).toBeLessThanOrEqual(4);
        expect(new Set(meshes.map((m) => m.material)).size, `${id} ${name}`).toBeLessThanOrEqual(4);
      }
    }
    models.dispose();
  });
});

describe('G2: the red dot\'s window', () => {
  const O = RIFLE_OPTIC;
  /** Meshes a view along the bore sees as solid: everything but the glass and the dot bead on it. */
  const solid = (hits: THREE.Intersection[]): THREE.Intersection[] => hits.filter((h) => h.object.name !== 'lens' && h.object.name !== 'laserLens');

  for (const [level, detail] of Object.entries(BOTH)) {
    it(`leaves the hood's opening clear to RIFLE_OPTIC.inner on every side of the axis, along its whole length (${level})`, () => {
      const models = buildReplicaModels([AEG], 0x3d8bff, false, detail, { schemes: ['cobalt'], realistic: false });
      const group = models.models.get('aeg')!.group;
      const optic = group.getObjectByName('optic:redDot')!;
      for (const m of allMeshes(optic)) std(m).side = THREE.DoubleSide; // an inside wall counts as a hit, from either side
      group.updateMatrixWorld(true);
      const front = O.from + O.length;
      const ray = new THREE.Raycaster();
      // The ray starts at z = 1 behind the sight and runs forward (-z); `lo`..`hi` is the stretch of z it counts.
      const cast = (across: number, up: number, lo: number, hi: number): THREE.Intersection[] => {
        ray.set(new THREE.Vector3(across, O.axisUp + up, 1), new THREE.Vector3(0, 0, -1));
        ray.near = 1 - hi;
        ray.far = 1 - lo;
        return solid(ray.intersectObject(optic, true));
      };
      // z runs forward as -z: the hood spans -front..-from. Three casts: its whole length, then each end alone.
      const spans = [[-0.5, 0.5], [-O.from - 0.001, -O.from + 0.001], [-front - 0.001, -front + 0.001]] as const; // [lo, hi] in z
      // The opening is a square of side 2 * inner with 5 mm rounded corners: clear along both axes right out to `inner`, and
      // across the square inside its corners.
      const reach = O.inner * 0.97;
      const offsets: (readonly [number, number])[] = [];
      for (const k of [-1, -0.5, 0, 0.5, 1]) offsets.push([k * reach, 0], [0, k * reach]);
      const box = O.inner - 0.005;
      for (const a of [-box, 0, box]) for (const u of [-box, 0, box]) offsets.push([a, u]);
      for (const [lo, hi] of spans) {
        for (const [across, up] of offsets) {
          const hits = cast(across, up, lo, hi);
          expect(hits.map((h) => `${h.object.name}@${h.point.z.toFixed(3)}`), `across ${across.toFixed(4)} up ${up.toFixed(4)} z ${lo}..${hi}`).toEqual([]);
        }
      }
      // The check can see the hood: just outside the opening, between it and the outer wall, the same ray is blocked at both ends.
      const wall = (O.inner + O.outer) / 2;
      for (const [across, up] of [[wall, 0], [-wall, 0], [0, wall], [0, -wall]] as const) {
        const hits = cast(across, up, -0.5, 0.5);
        expect(hits.length, `wall at ${across.toFixed(4)},${up.toFixed(4)}`).toBeGreaterThan(0);
        expect(Math.min(...hits.map((h) => h.point.z))).toBeLessThanOrEqual(-front + 0.001);
        expect(Math.max(...hits.map((h) => h.point.z))).toBeGreaterThanOrEqual(-O.from - 0.001);
      }
      // And the glass really is across the window, so the view does go through it.
      ray.set(new THREE.Vector3(0, O.axisUp, 1), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(optic, true).some((h) => h.object.name === 'lens')).toBe(true);
      models.dispose();
    });
  }
});
