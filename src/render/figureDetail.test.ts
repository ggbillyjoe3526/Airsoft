import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { fitParts } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { BARE_KIT, buildFigure, disposeFigure, type Figure, type FigureDetail, type FigureKit, figureLooks, HUMAN_DRESS } from './characterModels';
import { CharacterRenderer, rifleSilenced } from './characterRenderer';
import { FINISH_ATTRIBUTE, hasVertexFinish, useVertexFinish } from './figureFinish';

const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};
/** Triangles the camera sees: the part's draw range (its shadow stand-ins after it are drawn in the shadow map only, M75). */
const tris = (o: THREE.Object3D): number => {
  const g = (o as THREE.Mesh).geometry;
  return Math.min(g.drawRange.count, g.getAttribute('position').count) / 3;
};
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
      // More detail where it shows, but six figures stay cheap: under 7,500 at once. (G7 cut Low to about half its old
      // triangles, so the old cap of twice Low no longer bounds High; the 7,500 cap stays.)
      expect(drawn(high)).toBeGreaterThan(drawn(low) * 1.3);
      expect(drawn(high)).toBeLessThan(7500);
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
        // The carrier (G7): a quarter-metre and more of exact team colour on the torso, all the way round (no shade or
        // edge light on it).
        const body = figure.upper.children[0] as THREE.Mesh;
        const pos = body.geometry.getAttribute('position');
        const col = body.geometry.getAttribute('color');
        const box = new THREE.Box3();
        const p = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (Math.abs(col.getX(i) - want.r) + Math.abs(col.getY(i) - want.g) + Math.abs(col.getZ(i) - want.b) > 1e-6) continue;
          p.fromBufferAttribute(pos, i);
          if (p.y + FIGURE.hipHeight < FIGURE.shoulderHeight + 0.1) box.expandByPoint(p);
        }
        expect(box.getSize(p).y).toBeGreaterThanOrEqual(0.24);
        expect(box.getSize(p).x).toBeGreaterThan(FIGURE.torso.width);
        expect(box.getSize(p).z).toBeGreaterThan(FIGURE.torso.depth);
        disposeFigure(figure);
      }
    }
  });

  // G7: the helmets are a team-coloured shell now (no tape round a grey one), and the hem shade went with the shirts.
  it('makes every detailed helmet a glossy team-coloured shell over the head, and the balaclava a hood in the team\'s dark', () => {
    const want = new THREE.Color(0x3d8bff);
    for (const id of [0, 1, 2, 3, 4, 5]) {
      const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, FIGURE.detail.high);
      const body = figure.upper.children[0] as THREE.Mesh;
      const pos = body.geometry.getAttribute('position');
      const col = body.geometry.getAttribute('color');
      const fin = body.geometry.getAttribute(FINISH_ATTRIBUTE);
      // The highest glossy team-coloured point over the head's centre (its crown).
      let crown = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(col.getX(i) - want.r) + Math.abs(col.getY(i) - want.g) + Math.abs(col.getZ(i) - want.b) > 1e-6) continue;
        if (Math.abs(fin.getX(i) - FIGURE.finish.shell[0]) > 1e-3 || Math.hypot(pos.getX(i), pos.getZ(i)) > 0.06) continue;
        crown = Math.max(crown, pos.getY(i) + FIGURE.hipHeight);
      }
      if (figureLooks(id).headgear === 'balaclava') expect(crown, 'no helmet on a balaclava').toBe(-Infinity);
      else expect(crown, `look ${id}'s helmet covers the crown`).toBeGreaterThan(FIGURE.headHeight + FIGURE.headRadius * 0.9);
      disposeFigure(figure);
    }
  });

  it('lights bevels on the detailed figure, never above full colour', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.high);
    const body = figure.upper.children[0] as THREE.Mesh;
    const col = body.geometry.getAttribute('color');
    for (let i = 0; i < col.count; i++) expect(Math.max(col.getX(i), col.getY(i), col.getZ(i))).toBeLessThanOrEqual(1);
    const gear = new THREE.Color(FIGURE.colors.gear);
    let lit = 0;
    for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) / gear.r - FIGURE.edgeLight) < 0.01 && Math.abs(col.getZ(i) / gear.b - FIGURE.edgeLight) < 0.01) lit++;
    expect(lit).toBeGreaterThan(0);
    disposeFigure(figure);
  });
});

/** Triangles a part draws into the shadow map: its draw range while a shadow pass runs (render/shadowProxy.ts). */
const shadowTris = (m: THREE.Mesh): number => {
  const g = m.geometry;
  m.onBeforeShadow({} as never, {} as never, {} as never, {} as never, g, {} as never, null as never);
  const n = Math.min(g.drawRange.count, g.getAttribute('position').count - g.drawRange.start) / 3;
  m.onAfterShadow({} as never, {} as never, {} as never, {} as never, g, {} as never, null as never);
  return n;
};

describe('figure shadows (M75, audit REN-03 step 1)', () => {
  const kits: FigureKit[] = [BARE_KIT, { rifleSilencer: true, rifleTorch: true, pistolTorch: true }];
  const dresses = [HUMAN_DRESS, { ...HUMAN_DRESS, robot: true }];
  const build = (detail: FigureDetail, id: number, kit: FigureKit, robot: boolean): Figure =>
    buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, detail, kit, robot ? dresses[1] : HUMAN_DRESS);

  it('casts each detailed part\'s shadow from plain stand-ins, a fraction of its triangles, the camera\'s view unchanged', () => {
    for (const robot of [false, true]) {
      for (const kit of kits) {
        for (const id of [0, 1, 2, 3, 4, 5]) {
          const figure = build(FIGURE.detail.high, id, kit, robot);
          let seenAll = 0;
          let castAll = 0;
          for (const m of meshesOf(figure.root)) {
            const label = `${robot ? 'robot' : 'human'} look ${id}`;
            const seen = tris(m);
            const cast = shadowTris(m);
            expect(m.castShadow).toBe(true);
            expect(cast, label).toBeGreaterThan(0);
            expect(cast, label).toBeLessThan(seen / 2);
            // After the shadow pass the camera draws the part from its first vertex, as before.
            expect(m.geometry.drawRange.start).toBe(0);
            expect(tris(m)).toBe(seen);
            seenAll += seen;
            castAll += cast;
          }
          // About a quarter of the detailed figure's triangles in the shadow pass (it was all of them).
          expect(castAll, `${robot ? 'robot' : 'human'} look ${id}`).toBeLessThan(seenAll * 0.35);
          disposeFigure(figure);
        }
      }
    }
  });

  it('keeps the Low figure as it was: no stand-ins (Low draws no shadows and its parts are plain)', () => {
    for (const robot of [false, true]) {
      const figure = build(FIGURE.detail.low, 0, BARE_KIT, robot);
      for (const m of meshesOf(figure.root)) {
        expect(m.geometry.drawRange.count).toBe(Infinity);
        expect(shadowTris(m)).toBe(tris(m));
      }
      disposeFigure(figure);
    }
  });

  // About a shadow texel: 1.9 cm on High, 3.9 cm on Medium at night (LIGHTING.shadowView), before the filter's blur.
  const TEXEL = 0.035;
  const ANTENNA = 0.07;

  /** The figure's outline as `pose` shows it (legs, body and that arm pose): what the camera sees, and what casts. */
  const outline = (f: Figure, pose: THREE.Object3D): { seen: THREE.Box3; cast: THREE.Box3 } => {
    const seen = new THREE.Box3();
    const cast = new THREE.Box3();
    f.root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    for (const o of [f.legL, f.legR, f.upper.children[0]!, pose]) {
      const m = o as THREE.Mesh;
      const pos = m.geometry.getAttribute('position');
      const drawn = m.geometry.drawRange.count;
      for (let i = 0; i < pos.count; i++) (i < drawn ? seen : cast).expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    }
    return { seen, cast };
  };

  it('keeps the figure\'s silhouette: in every pose the stand-ins span it to within a shadow texel on every side', () => {
    for (const robot of [false, true]) {
      for (const kit of kits) {
        for (const id of [0, 1, 2, 3, 4, 5]) {
          const figure = build(FIGURE.detail.high, id, kit, robot);
          for (const [name, pose] of [['rifle', figure.aimRifle], ['pistol', figure.aimPistol], ['hit', figure.hitPose]] as const) {
            const { seen, cast } = outline(figure, pose);
            for (const axis of ['x', 'y', 'z'] as const) {
              const label = `${robot ? 'robot' : 'human'} ${id} ${name} ${axis}`;
              expect(Math.abs(cast.min[axis] - seen.min[axis]), label).toBeLessThan(TEXEL);
              // The robot's antenna, 8 mm across, stands 7 cm over its head and casts nothing a texel would show.
              expect(Math.abs(cast.max[axis] - seen.max[axis]), label).toBeLessThan(robot && axis === 'y' ? ANTENNA : TEXEL);
            }
          }
          disposeFigure(figure);
        }
      }
    }
  });
});

/** The widest the aiming rifle gets across (from its bore) in the last `from`..`to` metres behind its muzzle. */
const widthNearMuzzle = (f: Figure, from: number, to: number): number => {
  const pos = (f.aimRifle as THREE.Mesh).geometry.getAttribute('position');
  const muzzle = FIGURE.rifle.butt - FIGURE.rifle.length;
  let widest = 0;
  for (let i = 0; i < pos.count; i++) {
    const back = pos.getZ(i) - muzzle;
    if (back >= from && back <= to && Math.abs(pos.getY(i) - FIGURE.rifle.y) < 0.04) widest = Math.max(widest, Math.abs(pos.getX(i) - FIGURE.rifle.x));
  }
  return widest;
};

describe('fitted parts on the figures (FA8 with M29b)', () => {
  it('shows a fitted silencer in place of the detailed rifle\'s flash hider, its front at the muzzle; Low is unchanged', () => {
    const silenced = { rifleSilencer: true };
    const bare = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.high, BARE_KIT);
    const fitted = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.high, silenced);
    // The bare rifle's flash hider is at the muzzle and nothing ends 10–12.5 cm behind it; the silencer is wider than
    // the hider and its back end is there.
    // (A cylinder's sides reach a little short of its radius across.)
    const across = (f: Figure, from: number, to: number): number => widthNearMuzzle(f, from, to) / FIGURE.silencer.radius;
    expect(across(bare, -0.001, 0.05)).toBeLessThan(0.8);
    expect(across(bare, 0.1, 0.125)).toBe(0);
    expect(across(fitted, -0.001, 0.05)).toBeGreaterThan(0.9);
    expect(across(fitted, 0.1, 0.125)).toBeGreaterThan(0.9);
    const box = new THREE.Box3().setFromBufferAttribute((fitted.aimRifle as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.z).toBeCloseTo(FIGURE.rifle.butt - FIGURE.rifle.length, 6);
    const low = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.low, silenced);
    const lowBare = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), 0, null, FIGURE.detail.low);
    expect(drawn(low)).toBe(drawn(lowBare));
    for (const f of [bare, fitted, low, lowBare]) disposeFigure(f);
  });

  it('rebuilds a detailed figure whose rifle gains a silencer between rounds, and only then', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const characters = [createCharacter(0, vec3(), 0), createCharacter(1, vec3(2, 0, 0), 1)];
    const r = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS, null, 'high');
    r.setReceiveShadows(true);
    r.update(1, 0.016, -1);
    const before = meshesOf(r.object);
    expect(rifleSilenced(characters[0]!)).toBe(false);
    const rifle = characters[0]!.armament.replicas.findIndex((c) => c.look.model !== 'pistol');
    const parts = characters[0]!.armament.parts.map((p, i) => (i === rifle ? { ...p, muzzle: 'silencer' as const } : p));
    fitParts(characters[0]!.armament, parts);
    expect(rifleSilenced(characters[0]!)).toBe(true);
    r.update(1, 0.016, -1);
    const after = meshesOf(r.object);
    expect(after).toHaveLength(before.length);
    const changed = after.filter((m) => !before.includes(m));
    expect(changed.length).toBeGreaterThan(0);
    for (const m of changed) expect(m.receiveShadow).toBe(true);
    // The other figure is untouched, and nothing more is rebuilt while the kit stays.
    r.update(1, 0.016, -1);
    expect(meshesOf(r.object)).toEqual(after);
    r.dispose();
    vi.unstubAllGlobals();
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
