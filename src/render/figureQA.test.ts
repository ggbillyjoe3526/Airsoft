import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { DEFAULT_LOOK } from '../config/look';
import { LOADOUT } from '../config/replicas';
import { buildFigure, disposeFigure, HUMAN_DRESS, type Figure } from './characterModels';
import { figureCrowd, robotFigures } from './figureMix';
import { buildReplicaModels, HUMAN_ARMS, LOW_DETAIL } from './replicaModels';
import { Viewmodel } from './viewmodel';

const ROBOT_ARMS = { robot: true, shell: FIGURE.robot.shells[0]! };
const HIGH = { replica: 'high', hands: 'high' } as const;

/** Every geometry and material under `root`, to watch for their dispose events. */
function resourcesOf(root: THREE.Object3D, into = new Set<THREE.BufferGeometry | THREE.Material>()): Set<THREE.BufferGeometry | THREE.Material> {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      into.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) into.add(m);
    }
  });
  return into;
}
function watch(set: Iterable<{ addEventListener(t: 'dispose', f: () => void): void }>): Set<unknown> {
  const freed = new Set<unknown>();
  for (const r of set) r.addEventListener('dispose', () => freed.add(r));
  return freed;
}

describe('G7 QA: robots are mixed from the seed alone (criterion 1)', { timeout: 60_000 }, () => {
  const teams = [0, 0, 0, 0, 1, 1, 1, 2];

  it('is a pure function of seed, teams and the setting: same answer however often asked, no shared stream', () => {
    const first = robotFigures(1234, teams, true);
    for (let i = 0; i < 5; i++) expect(robotFigures(1234, teams, true)).toEqual(first);
    // A different seed gives a different mix at least once in a few tries (the seed is used, not a constant).
    const mixes = new Set(Array.from({ length: 20 }, (_, s) => robotFigures(s, teams, true).join()));
    expect(mixes.size).toBeGreaterThan(3);
  });

  it('has every figure human with Robots off, whatever the seed or team shape, and mixes odd teams within one of half', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(robotFigures(seed, teams, false)).toEqual(teams.map(() => false));
      expect(figureCrowd(seed, teams.map((team) => ({ team })), { ...DEFAULT_LOOK, robots: false }).robots.some(Boolean)).toBe(false);
      const on = robotFigures(seed, teams, true);
      const count = (t: number): number => on.filter((r, i) => r && teams[i] === t).length;
      expect([2]).toContain(count(0)); // four members: exactly half
      expect([1, 2]).toContain(count(1)); // three: floor or ceil of 1.5
    }
  });

  it('survives an empty crowd and a single-figure team', () => {
    expect(robotFigures(1, [], true)).toEqual([]);
    expect(robotFigures(1, [0], true)).toHaveLength(1);
  });
});

describe('G7 QA: Low draws no more per figure than before (criterion 4)', { timeout: 60_000 }, () => {
  const drawnMeshes = (f: Figure): number => {
    let n = 0;
    f.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
      n++;
    });
    return n;
  };

  it('draws four meshes at once in every pose (legs, body, one aim group), human or robot, on Low and High', () => {
    for (const robot of [false, true]) {
      for (const detail of ['low', 'high'] as const) {
        for (const id of [0, 3, 5]) {
          const f = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, FIGURE.detail[detail], undefined, { ...HUMAN_DRESS, robot });
          for (const pose of [f.aimRifle, f.aimPistol, f.hitPose]) {
            for (const p of [f.aimRifle, f.aimPistol, f.hitPose]) p.visible = p === pose;
            expect(drawnMeshes(f), `${robot ? 'robot' : 'human'} ${detail} ${id}`).toBeLessThanOrEqual(4);
          }
          disposeFigure(f);
        }
      }
    }
  });
});

describe('G7 QA: everything made is freed (criterion 6)', { timeout: 60_000 }, () => {
  it('frees every geometry and every material a figure owns, human or robot, Low or High, fitted or bare', () => {
    for (const robot of [false, true]) {
      for (const detail of ['low', 'high'] as const) {
        const shared = new THREE.MeshStandardMaterial();
        const callout = new THREE.SpriteMaterial();
        const kit = { rifleSilencer: true, rifleTorch: true, pistolTorch: true };
        const f = buildFigure(0x3d8bff, shared, callout, 2, null, FIGURE.detail[detail], kit, { ...HUMAN_DRESS, robot });
        const own = [...resourcesOf(f.root)].filter((r) => r !== shared && r !== callout);
        const freed = watch(own);
        disposeFigure(f);
        expect(own.filter((r) => !freed.has(r)), `${robot ? 'robot' : 'human'} ${detail}`).toHaveLength(0);
      }
    }
  });

  it('frees all the first-person arms, gloved and robot, models and raised hand, on every detail', () => {
    for (const arms of [HUMAN_ARMS, ROBOT_ARMS]) {
      for (const detail of [LOW_DETAIL, HIGH]) {
        const m = buildReplicaModels(LOADOUT, 0x3d8bff, false, detail, null, 'hands', arms);
        const all = resourcesOf(m.raisedHand);
        for (const { group } of m.models.values()) resourcesOf(group, all);
        const freed = watch(all);
        m.dispose();
        expect([...all].filter((r) => !freed.has(r)), `${arms.robot ? 'robot' : 'human'} arms ${detail.hands}`).toHaveLength(0);
      }
    }
  });

  it('frees the arms a viewmodel replaces on every rebuild, human or robot, not only the last ones', () => {
    for (const arms of [HUMAN_ARMS, ROBOT_ARMS]) {
      const vm = new Viewmodel(16 / 9, 0x3d8bff, LOADOUT, LOW_DETAIL, null, arms);
      const old = resourcesOf(vm.scene);
      const freed = watch(old);
      vm.setDetail(HIGH);
      expect([...old].filter((r) => !freed.has(r)), `${arms.robot ? 'robot' : 'human'} replaced arms`).toHaveLength(0);
      const now = resourcesOf(vm.scene);
      const freedNow = watch(now);
      vm.dispose();
      expect([...now].filter((r) => !freedNow.has(r)), 'match end').toHaveLength(0);
    }
  });
});
