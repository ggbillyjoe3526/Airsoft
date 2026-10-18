import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LOADOUT } from './config/replicas';
import { QUALITY } from './config/render';

/**
 * BP3b QA: Practice hands its map group to the combat presentation (the dressing effects' neon flicker is a uniform on
 * the group's junk mesh, and only a session that hands it over flickers). The presentation, the targets, the lighting and
 * the readout are stand-ins; the physics, the map and the session are real. Test files share a worker's modules
 * (isolate: false), so the session loads fresh copies with the stand-ins and the registry is reset when the file ends.
 */
const handed: unknown[] = [];
let RangeSession: typeof import('./rangeSession').RangeSession;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('./render/match/combatPresentation', () => ({
    CombatPresentation: class {
      setLighting(): void {}
      skipStartWhistle(): void {}
      warmShaders(): void {}
      setMapGroup(group: unknown): void {
        handed.push(group);
      }
    },
  }));
  vi.doMock('./render/match/rangeTargetsRenderer', () => ({
    RangeTargetsRenderer: class {
      object = new THREE.Group();
      setReceiveShadows(): void {}
      setDetail(): void {}
    },
  }));
  vi.doMock('./ui/rangeReadout', () => ({
    RangeReadout: class { set(): void {} setVisible(): void {} },
    ChallengeBanner: class { cue(): void {} frame(): void {} dispose(): void {} },
    lastShotText: () => '',
    challengeText: () => '',
  }));
  vi.doMock('./render/light/lighting', () => ({ addLighting: () => ({ reserveLights() {} }) }));
  vi.doMock('./render/figures/figureMix', () => ({ figureCrowd: () => [], playerArms: () => undefined }));
  vi.doMock('./pool/loadoutModel', () => ({ bbGlowFor: () => ({ player: [], others: false }), kitPaint: () => ({}) }));
  // The session's physics module is this fresh copy, so its Rapier is started here, after the reset.
  await (await import('./physics/physicsWorld')).initPhysics();
  ({ RangeSession } = await import('./rangeSession'));
});
afterAll(() => {
  for (const m of ['./render/match/combatPresentation', './render/match/rangeTargetsRenderer', './ui/rangeReadout', './render/light/lighting', './render/figures/figureMix', './pool/loadoutModel']) vi.doUnmock(m);
  vi.resetModules();
});

describe('Practice hands over its map group', () => {
  it('gives the combat presentation the group the renderer took for the range, once built', () => {
    const group = new THREE.Group();
    const renderer = {
      scene: new THREE.Scene(),
      clusteredLights: false,
      mapMeshes: { take: () => group, restyle: () => group, release() {} },
      surfaceTexturesFor: () => ({}),
      setLighting() {},
    };
    const input = { resetView() {}, ordersEnabled: true, pitch: 0, keyName: () => '' };
    const kit = {
      slots: LOADOUT.map((replica) => ({ replica, optic: null, parts: [] })),
      hopUps: LOADOUT.map(() => 0),
      bbWeights: LOADOUT.map((r) => r.bbWeight),
      glowBBs: LOADOUT.map(() => 'off'),
      schemes: LOADOUT.map(() => 'default'),
    };
    const setup = { kit, teamColours: { figures: ['#fff', '#000'] }, look: undefined };
    new RangeSession(renderer as never, {} as never, input as never, setup as never, 1, QUALITY.low as never, {} as never, {} as never);
    expect(handed).toEqual([group]);
  });
});
