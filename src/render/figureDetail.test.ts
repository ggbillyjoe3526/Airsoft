import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { buildFigure, disposeFigure, type Figure } from './characterModels';
import { CharacterRenderer } from './characterRenderer';
import { FINISH_ATTRIBUTE, hasVertexFinish, useVertexFinish } from './figureFinish';

const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};
const tris = (o: THREE.Object3D): number => (o as THREE.Mesh).geometry.getAttribute('position').count / 3;
/** Triangles drawn at once: both legs, the body and the largest of the three arm poses. */
const drawn = (f: Figure): number => tris(f.legL) + tris(f.legR) + tris(f.upper.children[0]!) + Math.max(tris(f.aimRifle), tris(f.aimPistol), tris(f.hitPose));

describe('Player detail (FA8, QualitySettings.figureDetail)', () => {
  it('keeps the Low figure exactly as it was: no finish attribute, the same triangles', () => {
    for (const id of [0, 1, 2, 3, 4, 5]) {
      const low = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id);
      const asBefore = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, FIGURE.detail.low);
      expect(drawn(low)).toBe(drawn(asBefore));
      for (const m of meshesOf(low.root)) expect(m.geometry.getAttribute(FINISH_ATTRIBUTE)).toBeUndefined();
      disposeFigure(low);
      disposeFigure(asBefore);
    }
  });

  it('builds the detailed figure in the same six meshes (no extra draw call), every vertex with a finish, within budget', () => {
    for (const id of [0, 1, 2, 3, 4, 5]) {
      const material = new THREE.MeshStandardMaterial();
      const low = buildFigure(0x3d8bff, material, new THREE.SpriteMaterial(), id);
      const high = buildFigure(0x3d8bff, material, new THREE.SpriteMaterial(), id, null, FIGURE.detail.high);
      const meshes = meshesOf(high.root);
      expect(meshes).toHaveLength(6);
      for (const m of meshes) {
        expect(m.material).toBe(material);
        const finish = m.geometry.getAttribute(FINISH_ATTRIBUTE);
        expect(finish.count).toBe(m.geometry.getAttribute('position').count);
        expect(m.geometry.getAttribute('uv')).toBeUndefined();
      }
      // More detail where it shows, but six figures stay cheap: at most twice Low's triangles, under 7,500 at once.
      expect(drawn(high)).toBeGreaterThan(drawn(low) * 1.3);
      expect(drawn(high)).toBeLessThan(Math.min(7500, drawn(low) * 2));
      disposeFigure(low);
      disposeFigure(high);
    }
  });

  it('gives the goggle lens a glossy finish and keeps fabric matte', () => {
    const high = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 1, null, FIGURE.detail.high);
    const body = high.upper.children[0] as THREE.Mesh;
    const finish = body.geometry.getAttribute(FINISH_ATTRIBUTE);
    const roughness = new Set<number>();
    for (let i = 0; i < finish.count; i++) roughness.add(Math.round(finish.getX(i) * 100) / 100);
    expect(roughness.has(FIGURE.finish.lens[0])).toBe(true); // lens
    expect(roughness.has(FIGURE.finish.shell[0])).toBe(true); // look 1 wears a helmet
    expect(roughness.has(FIGURE.finish.fabric[0])).toBe(true);
    disposeFigure(high);
  });

  it('keeps the team colour exact and readable on every part of the detailed figure, colour-blind sets included', () => {
    for (const set of Object.values(TEAM_COLOUR_SETS)) {
      for (const team of set.figures) {
        const want = new THREE.Color(team);
        const figure = buildFigure(team, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 2, null, FIGURE.detail.high);
        for (const m of meshesOf(figure.root)) {
          const c = m.geometry.getAttribute('color');
          let found = 0;
          for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b) < 1e-6) found++;
          expect(found, 'team colour on every part').toBeGreaterThan(0);
        }
        // The torso band: the full quarter-metre of exact team colour, all the way round (no shade or edge light on it).
        const body = figure.upper.children[0] as THREE.Mesh;
        const pos = body.geometry.getAttribute('position');
        const col = body.geometry.getAttribute('color');
        const box = new THREE.Box3();
        const p = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (Math.abs(col.getX(i) - want.r) + Math.abs(col.getY(i) - want.g) + Math.abs(col.getZ(i) - want.b) > 1e-6) continue;
          p.fromBufferAttribute(pos, i);
          if (p.y + FIGURE.hipHeight < FIGURE.shoulderHeight - 0.05) box.expandByPoint(p);
        }
        expect(box.getSize(p).y).toBeGreaterThanOrEqual(0.24);
        disposeFigure(figure);
      }
    }
  });

  it('shades the torso darker towards its hem (baked occlusion) and lights bevels, never above full colour', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.high);
    const body = figure.upper.children[0] as THREE.Mesh;
    const col = body.geometry.getAttribute('color');
    for (let i = 0; i < col.count; i++) expect(Math.max(col.getX(i), col.getY(i), col.getZ(i))).toBeLessThanOrEqual(1);
    const top = new THREE.Color(FIGURE.looks[0]!.top);
    let darker = 0;
    for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) / top.r - FIGURE.hemShade) < 0.02 && Math.abs(col.getY(i) / top.g - FIGURE.hemShade) < 0.02) darker++;
    expect(darker).toBeGreaterThan(0);
    disposeFigure(figure);
  });
});

describe('the per-vertex finish material (FA8)', () => {
  // The HIT! sign's canvas is stood in for (it draws nothing here).
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('reads roughness and metalness from the vertex in place of the uniforms, in one shared program', () => {
    const a = useVertexFinish(new THREE.MeshStandardMaterial());
    const b = useVertexFinish(new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    expect(hasVertexFinish(a)).toBe(true);
    expect(hasVertexFinish(new THREE.MeshStandardMaterial())).toBe(false);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
    a.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain(`attribute vec2 ${FINISH_ATTRIBUTE};`);
    expect(shader.vertexShader).toContain('vFinish = finish;');
    expect(shader.fragmentShader).toContain('float roughnessFactor = vFinish.x;');
    expect(shader.fragmentShader).toContain('float metalnessFactor = vFinish.y;');
    expect(shader.fragmentShader).not.toContain('#include <roughnessmap_fragment>');
    expect(shader.fragmentShader).not.toContain('#include <metalnessmap_fragment>');
  });

  it('switches every figure to the new detail and back, freeing the old ones', () => {
    const characters = [createCharacter(0, vec3(), 0), createCharacter(1, vec3(2, 0, 0), 1)];
    const r = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS);
    r.setReceiveShadows(true);
    const before = meshesOf(r.object);
    const disposed: THREE.BufferGeometry[] = [];
    for (const m of before) m.geometry.addEventListener('dispose', () => disposed.push(m.geometry));
    r.setDetail('high');
    const after = meshesOf(r.object);
    expect(after).toHaveLength(before.length);
    expect(disposed).toHaveLength(before.length);
    for (const m of after) {
      expect(m.receiveShadow).toBe(true);
      expect(m.geometry.getAttribute(FINISH_ATTRIBUTE)).toBeDefined();
      expect(hasVertexFinish(m.material as THREE.Material)).toBe(true);
    }
    r.setDetail('high'); // unchanged: nothing rebuilt
    expect(meshesOf(r.object)[0]).toBe(after[0]);
    r.setDetail('low');
    for (const m of meshesOf(r.object)) expect(m.geometry.getAttribute(FINISH_ATTRIBUTE)).toBeUndefined();
    r.dispose();
  });
});
