import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { LOADOUT } from '../config/replicas';
import { buildFigure, disposeFigure, type Figure, HUMAN_DRESS } from './characterModels';
import { CAMO_ATTRIBUTE, camoGlsl, camoTone, hasSleeveCamo, SLEEVE_CAMO_SEED, useSleeveCamo } from './figureCamo';
import { useVertexFinish } from './figureFinish';
import { buildReplicaModels } from './replicaModels';

/**
 * G11, acceptance 1 and 2: the team camo is printed per pixel (not smeared across a coarse mesh's vertices) on the
 * detailed figure's clothes and the first-person sleeves, strong enough to read, on Medium and up only.
 */

const BLUE = 0x3d8bff;
const build = (id: number, detail: 'low' | 'high', robot = false): Figure =>
  buildFigure(BLUE, useVertexFinish(new THREE.MeshStandardMaterial({ vertexColors: true })), new THREE.SpriteMaterial(), id, null, FIGURE.detail[detail], undefined, { ...HUMAN_DRESS, robot });

const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
};

/** Each tone's share of a cube of part positions (metres, a figure's size) for `seed`. */
function shares(seed: number): Map<number, number> {
  const count = new Map<number, number>();
  let n = 0;
  for (let x = -0.4; x <= 0.4; x += 0.02)
    for (let y = 0; y <= 1.8; y += 0.03)
      for (let z = -0.2; z <= 0.2; z += 0.04) {
        const t = camoTone(x, y, z, seed);
        count.set(t, (count.get(t) ?? 0) + 1);
        n++;
      }
  for (const [k, v] of count) count.set(k, v / n);
  return count;
}

/** A patched material's shaders, as Three hands them to onBeforeCompile. */
function compiled(material: THREE.Material): { vertexShader: string; fragmentShader: string } {
  const lib = THREE.ShaderLib.physical;
  const shader = { uniforms: {}, defines: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

describe('the team camo (G11)', { timeout: 60_000 }, () => {
  it('prints three tones in clear blotches: each of the dark and light covers a fifth to two fifths, with real contrast', () => {
    const C = FIGURE.camo;
    // The tones are far enough apart to read (the per-vertex print it replaces was 0.74 and 1.14, and smeared).
    expect(C.light / C.dark).toBeGreaterThanOrEqual(2.5);
    for (const seed of [1, 4, 9, 30]) {
      const s = shares(seed);
      expect(s.get(C.dark) ?? 0, `dark, seed ${seed}`).toBeGreaterThanOrEqual(0.2);
      expect(s.get(C.dark) ?? 0).toBeLessThanOrEqual(0.4);
      expect(s.get(C.light) ?? 0, `light, seed ${seed}`).toBeGreaterThanOrEqual(0.2);
      expect(s.get(C.light) ?? 0).toBeLessThanOrEqual(0.4);
    }
  });

  it('changes tone within a limb: blotches a hand or two across, not a shade over a whole part', () => {
    // Along a line down a shin, the tone changes several times in its 0.45 m.
    let changes = 0;
    let last = camoTone(0.05, 0, 0.05, 1);
    for (let y = 0; y <= 0.45; y += 0.005) {
      const t = camoTone(0.05, y, 0.05, 1);
      if (t !== last) changes++;
      last = t;
    }
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(changes).toBeLessThanOrEqual(10);
  });

  it('the figure patch prints it per pixel where the vertex names a pattern, blending its edges over a pixel', () => {
    const { vertexShader, fragmentShader } = compiled(useVertexFinish(new THREE.MeshStandardMaterial()));
    expect(vertexShader).toContain(`attribute float ${CAMO_ATTRIBUTE};`);
    expect(vertexShader).toContain(`vCamo = vec4(position, ${CAMO_ATTRIBUTE});`);
    expect(fragmentShader).toContain('float camoTone(vec3 p,float s)');
    expect(fragmentShader).toContain('fwidth(n)');
    expect(fragmentShader).toContain('diffuseColor.rgb*=mix(1.,camoTone(vCamo.xyz,vCamo.w),step(.5,vCamo.w));');
    // After the vertex colours, so it multiplies them.
    expect(fragmentShader.indexOf('camoTone(vCamo.xyz')).toBeGreaterThan(fragmentShader.indexOf('#include <color_fragment>'));
    expect(camoGlsl()).toContain(String(FIGURE.camo.darkAt));
    expect(camoGlsl()).toContain(String(FIGURE.camo.dark));
  });

  it('the detailed human wears it on its trousers, shirt and sleeves, a pattern of its own per look; not on gear', () => {
    const seedsOf = (f: Figure): Set<number> => {
      const seeds = new Set<number>();
      for (const mesh of meshesOf(f.root)) {
        const a = mesh.geometry.getAttribute(CAMO_ATTRIBUTE);
        expect(a, mesh.name).toBeDefined();
        for (let i = 0; i < a.count; i++) seeds.add(a.getX(i));
      }
      return seeds;
    };
    const first = build(0, 'high');
    const second = build(1, 'high');
    const a = seedsOf(first);
    const b = seedsOf(second);
    // Plain parts (carrier, boots, helmet) and both legs, the body and both arms in camo.
    expect(a.has(0)).toBe(true);
    expect([...a].filter((s) => s >= 1).length).toBeGreaterThanOrEqual(5);
    expect([...a].filter((s) => s >= 1 && b.has(s))).toEqual([]);
    // A good share of a leg's vertices are camo (the boot, pad and laces take many), all of one pattern.
    const leg = (first.legL as THREE.Mesh).geometry;
    const legSeeds = leg.getAttribute(CAMO_ATTRIBUTE);
    const drawn = Math.min(leg.drawRange.count, legSeeds.count);
    let camo = 0;
    for (let i = 0; i < drawn; i++) if (legSeeds.getX(i) >= 1) camo++;
    expect(camo / drawn).toBeGreaterThan(0.2);
    expect(new Set(Array.from({ length: drawn }, (_, i) => legSeeds.getX(i)).filter((x) => x >= 1)).size).toBe(1);
    for (const f of [first, second]) disposeFigure(f);
  });

  it('Low keeps its plain figure: no camo attribute, and robots wear none', () => {
    const low = build(0, 'low');
    for (const mesh of meshesOf(low.root)) expect(mesh.geometry.getAttribute(CAMO_ATTRIBUTE)).toBeUndefined();
    const robot = build(0, 'high', true);
    for (const mesh of meshesOf(robot.root)) {
      const a = mesh.geometry.getAttribute(CAMO_ATTRIBUTE);
      for (let i = 0; i < a.count; i++) expect(a.getX(i)).toBe(0);
    }
    for (const f of [low, robot]) disposeFigure(f);
  });

  it('your sleeves print it all over on Hand detail High, smaller than the figures’; Low keeps them plain', () => {
    const sleeves = (hands: 'low' | 'high'): THREE.Material[] => {
      const models = buildReplicaModels(LOADOUT, BLUE, true, { replica: hands, hands });
      const out = new Set<THREE.Material>();
      for (const m of models.models.values()) m.group.traverse((o) => o.name === 'sleeve' && out.add((o as THREE.Mesh).material as THREE.Material));
      models.dispose();
      return [...out];
    };
    const high = sleeves('high');
    expect(high.length).toBeGreaterThan(0);
    for (const m of high) expect(hasSleeveCamo(m)).toBe(true);
    for (const m of sleeves('low')) expect(hasSleeveCamo(m)).toBe(false);
    const { fragmentShader } = compiled(useSleeveCamo(new THREE.MeshStandardMaterial()));
    expect(FIGURE.camo.sleeve).toBeLessThan(1);
    expect(fragmentShader).toContain(`camoTone(vCamoPos*${1 / FIGURE.camo.sleeve},${SLEEVE_CAMO_SEED.toFixed(1)})`);
  });
});
