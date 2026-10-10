import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { buildFigure, disposeFigure, HUMAN_DRESS } from './characterModels';
import { CharacterRenderer } from './characterRenderer';
import { CAMO_ATTRIBUTE, camoGlsl, camoTone, hasSleeveCamo } from './figureCamo';
import { hasVertexFinish, useVertexFinish } from './figureFinish';
import { robotShell } from './figurePalette';
import { buildForearm } from './handModels';
import type { ArmStyle } from './replicaArms';
import { buildReplicaModels } from './replicaModels';
import type { ReplicaDetail } from './replicaBuilder';
import { Viewmodel } from './viewmodel';

/**
 * G11 QA: what Low must never carry (acceptance 4), the sleeves following Hand detail and the left arm dressed as the
 * right (acceptance 2), and the new values being data (config/characters.ts camo, config/replicaFinish.ts armband).
 */

beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

const BLUE = 0x3d8bff;
const TEAMS = [BLUE, 0xff8a2a];
const patched = (m: THREE.Material): boolean => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
}
const materialsOf = (root: THREE.Object3D): THREE.Material[] => [...new Set(meshesOf(root).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])))];

const characters = () => [0, 1, 2, 3].map((i) => createCharacter(i, vec3(i * 2, 0, -2 * i), 0, LOADOUT, i % 2));
const camoVertices = (root: THREE.Object3D): number => {
  let n = 0;
  for (const mesh of meshesOf(root)) {
    const a = mesh.geometry.getAttribute(CAMO_ATTRIBUTE);
    if (a) for (let i = 0; i < a.count; i++) if (a.getX(i) >= 1) n++;
  }
  return n;
};

describe('Low pays nothing for the camo on the figures (G11 acceptance 4)', { timeout: 60_000 }, () => {
  it('a Low figure has no camo attribute and no patched material; a High one does, and a switch back to Low drops them', () => {
    const cs = characters();
    const renderer = new CharacterRenderer(cs, TEAMS, HITS, null, 'low');
    expect(meshesOf(renderer.object).length).toBeGreaterThan(0);
    for (const mesh of meshesOf(renderer.object)) expect(mesh.geometry.getAttribute(CAMO_ATTRIBUTE), mesh.name).toBeUndefined();
    for (const m of materialsOf(renderer.object)) {
      expect(hasVertexFinish(m)).toBe(false);
      expect(patched(m), m.type).toBe(false);
    }

    renderer.setDetail('high');
    expect(camoVertices(renderer.object)).toBeGreaterThan(100);
    expect(materialsOf(renderer.object).filter(hasVertexFinish).length).toBeGreaterThan(0);

    renderer.setDetail('low');
    expect(camoVertices(renderer.object)).toBe(0);
    for (const mesh of meshesOf(renderer.object)) expect(mesh.geometry.getAttribute(CAMO_ATTRIBUTE), mesh.name).toBeUndefined();
    for (const m of materialsOf(renderer.object)) expect(patched(m), m.type).toBe(false);
  });

  it('a Low figure has no more vertex attributes than before: position, normal and colour only', () => {
    const renderer = new CharacterRenderer(characters(), TEAMS, HITS, null, 'low');
    for (const mesh of meshesOf(renderer.object)) {
      for (const name of Object.keys(mesh.geometry.attributes)) expect(['position', 'normal', 'color', 'uv'], `${mesh.name} ${name}`).toContain(name);
    }
  });
});

describe('the two teams still read apart in camo (G11 acceptance 1)', { timeout: 60_000 }, () => {
  /** The mean hue and saturation of the vertex colours that wear the camo on a High figure of `team`. */
  function camoHue(team: number): { hue: number; sat: number } {
    const f = buildFigure(team, useVertexFinish(new THREE.MeshStandardMaterial({ vertexColors: true })), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.high, undefined, { ...HUMAN_DRESS, robot: false });
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const mesh of meshesOf(f.root)) {
      const camo = mesh.geometry.getAttribute(CAMO_ATTRIBUTE);
      const col = mesh.geometry.getAttribute('color');
      for (let i = 0; i < camo.count; i++)
        if (camo.getX(i) >= 1) {
          r += col.getX(i);
          g += col.getY(i);
          b += col.getZ(i);
          n++;
        }
    }
    disposeFigure(f);
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(r / n, g / n, b / n).getHSL(hsl);
    return { hue: hsl.h, sat: hsl.s };
  }

  it('the camo multiplies the clothes’ colour (it never shifts its hue), and those colours differ in hue between Alpha blue and Beta orange', () => {
    const blue = camoHue(TEAMS[0]!);
    const orange = camoHue(TEAMS[1]!);
    const apart = Math.abs(blue.hue - orange.hue);
    expect(Math.min(apart, 1 - apart)).toBeGreaterThan(0.15);
    // Tones are plain multipliers of one colour: a grey one (no tint) would lose the team on the very parts that carry the camo.
    expect(blue.sat).toBeGreaterThan(0.02);
    expect(orange.sat).toBeGreaterThan(0.02);
    expect(FIGURE.camo.dark).toBeGreaterThan(0);
    expect(FIGURE.camo.dark).toBeLessThan(1);
    expect(FIGURE.camo.light).toBeGreaterThan(1);
  });
});

describe('the first-person sleeves wear the camo with Hand detail only (G11 acceptance 2 and 4)', { timeout: 60_000 }, () => {
  const COMBOS: readonly ReplicaDetail[] = [
    { replica: 'low', hands: 'low' },
    { replica: 'high', hands: 'low' },
    { replica: 'low', hands: 'high' },
    { replica: 'high', hands: 'high' },
  ];
  const sleevesOf = (scene: THREE.Object3D): THREE.Material[] => {
    const out = new Set<THREE.Material>();
    scene.traverse((o) => o.name === 'sleeve' && out.add((o as THREE.Mesh).material as THREE.Material));
    return [...out];
  };

  it.each(COMBOS)('Replica detail $replica, Hand detail $hands: the sleeves print it only when the hands are High', (detail) => {
    const models = buildReplicaModels(LOADOUT, BLUE, true, detail);
    const sleeves = new Set<THREE.Material>();
    for (const m of models.models.values()) sleevesOf(m.group).forEach((s) => sleeves.add(s));
    sleevesOf(models.raisedHand).forEach((s) => sleeves.add(s));
    expect(sleeves.size).toBeGreaterThan(0);
    for (const s of sleeves) {
      expect(hasSleeveCamo(s)).toBe(detail.hands === 'high');
      expect(patched(s)).toBe(detail.hands === 'high');
    }
    models.dispose();
  });

  it('switching the viewmodel from High to Low takes the camo off the sleeves, and back puts it on', () => {
    const view = new Viewmodel(16 / 9, BLUE, LOADOUT, { replica: 'high', hands: 'high' });
    expect(sleevesOf(view.scene).length).toBeGreaterThan(0);
    for (const s of sleevesOf(view.scene)) expect(hasSleeveCamo(s)).toBe(true);
    view.setDetail({ replica: 'low', hands: 'low' });
    for (const s of sleevesOf(view.scene)) expect(hasSleeveCamo(s)).toBe(false);
    view.setDetail({ replica: 'low', hands: 'high' });
    for (const s of sleevesOf(view.scene)) expect(hasSleeveCamo(s)).toBe(true);
  });

  it('a robot’s arms (Settings › Look › Robots) stay in their plain shell, whatever the Hand detail', () => {
    const robot: ArmStyle = { robot: true, shell: robotShell(0) };
    const models = buildReplicaModels(LOADOUT, BLUE, true, { replica: 'high', hands: 'high' }, null, 'hands', robot);
    const sleeves = new Set<THREE.Material>();
    for (const m of models.models.values()) sleevesOf(m.group).forEach((s) => sleeves.add(s));
    expect(sleeves.size).toBeGreaterThan(0);
    for (const s of sleeves) expect(hasSleeveCamo(s)).toBe(false);
    models.dispose();
  });

  it.each(['low', 'high'] as const)('Hand detail %s: the left (support) arm wears the right’s sleeve, glove and armband, and shows the band near the hand', (hands) => {
    const models = buildReplicaModels(LOADOUT, BLUE, true, { replica: hands, hands });
    for (const [id, model] of models.models) {
      const support = model.supportHand.group;
      const own = (name: string, inside: boolean): THREE.Mesh[] =>
        meshesOf(model.group).filter((m) => m.name === name && (support.getObjectById(m.id) !== undefined) === inside);
      for (const name of ['sleeve', 'glove', 'armband']) {
        const left = own(name, true);
        const right = own(name, false);
        expect(left.length, `${id} left ${name}`).toBeGreaterThan(0);
        expect(right.length, `${id} right ${name}`).toBeGreaterThan(0);
        // One material each: the very same sleeve, glove and team tape.
        expect(new Set([...left, ...right].map((m) => m.material)).size, `${id} ${name}`).toBe(1);
      }
      // The band sits nearer the hand than the middle of the sleeve, so it is in view where the arm is.
      model.group.updateMatrixWorld(true);
      const centre = (m: THREE.Mesh): THREE.Vector3 => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      const hand = centre(own('glove', true)[0]!);
      const band = centre(own('armband', true)[0]!);
      const sleeve = centre(own('sleeve', true)[0]!);
      expect(band.distanceTo(hand), id).toBeLessThan(sleeve.distanceTo(hand));
    }
    models.dispose();
  });
});

describe('the camo and armband values are data (G11)', () => {
  const camo = FIGURE.camo as unknown as Record<string, number>;
  const armband = REPLICA_FINISH.armband as unknown as Record<string, number>;

  it('the camo’s tones, thresholds and size come from FIGURE.camo: change it and the GLSL and the tones follow', () => {
    const before = { ...camo };
    const tones = (): Set<number> => {
      const out = new Set<number>();
      for (let x = -0.4; x <= 0.4; x += 0.05) for (let y = 0; y <= 1.8; y += 0.05) out.add(camoTone(x, y, 0.1, 3));
      return out;
    };
    try {
      expect([...tones()].sort()).toEqual([before.dark, 1, before.light].sort());
      Object.assign(camo, { dark: 0.41, light: 1.93, darkAt: 0.45, lightAt: -0.35, scale: 0.09 });
      expect([...tones()].sort()).toEqual([0.41, 1, 1.93].sort());
      const glsl = camoGlsl();
      for (const v of ['0.41', '1.93', '0.45', '-0.35']) expect(glsl).toContain(v);
      expect(glsl).toContain(String(1 / 0.09));
    } finally {
      Object.assign(camo, before);
    }
  });

  it('the armband’s place, width and fit come from REPLICA_FINISH.armband: change it and the band moves', () => {
    const before = { ...armband };
    const band = (): { mid: number; height: number; reach: number } => {
      const parts: Partial<Record<string, THREE.BufferGeometry>> = {};
      buildForearm({ addGeometry: (key, geo) => void (parts[key] ??= geo) }, [0, 0, 0], [0, -0.4, 0], 0.046, 'high');
      const g = parts.armband!;
      g.computeBoundingBox();
      const box = g.boundingBox!;
      return { mid: -(box.min.y + box.max.y) / 2 / 0.4, height: box.max.y - box.min.y, reach: box.max.x };
    };
    try {
      const was = band();
      expect(was.mid).toBeCloseTo(before.at!, 1);
      expect(was.height).toBeCloseTo(before.width!, 3);
      Object.assign(armband, { at: 0.5, width: 0.08, proud: 1.2 });
      const now = band();
      expect(now.mid).toBeGreaterThan(was.mid + 0.1);
      expect(now.mid).toBeLessThan(0.6);
      expect(now.height).toBeCloseTo(0.08, 3);
      expect(now.reach).toBeGreaterThan(was.reach * 1.1);
    } finally {
      Object.assign(armband, before);
    }
  });
});
