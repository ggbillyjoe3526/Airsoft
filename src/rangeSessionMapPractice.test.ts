import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RANGE_CHALLENGE } from './config/range';
import { LOADOUT } from './config/replicas';
import { QUALITY } from './config/render';
import { DEPOT } from './map/depot';
import type { MapData } from './map/mapTypes';
import { RANGE_MAP } from './map/range';
import { OPEN_FIELD } from './sim/testSupport';
import { vec3 } from './sim/vec';

/**
 * QA for M94 (Practice on any map): the real RangeSession on a map and on the range, with the presentation, the
 * lighting, the torches, the minimap and the readout as stand-ins (the physics, the map, the layout and the session are
 * real). Test files share a worker's modules (isolate: false), so the session loads fresh copies with the stand-ins and
 * the registry is reset when the file ends.
 */
let RangeSession: typeof import('./rangeSession').RangeSession;
let minimaps = 0;
let minimapCaptions: string[] = [];

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('./render/match/combatPresentation', () => ({
    CombatPresentation: class {
      setLighting(): void {}
      skipStartWhistle(): void {}
      warmShaders(): void {}
      setMapGroup(): void {}
      dispose(): void {}
    },
  }));
  vi.doMock('./render/match/rangeTargetsRenderer', () => ({
    RangeTargetsRenderer: class {
      object = new THREE.Group();
      setReceiveShadows(): void {}
      setDetail(): void {}
      dispose(): void {}
    },
  }));
  vi.doMock('./render/light/torchBeams', () => ({
    TorchBeams: class {
      object = new THREE.Group();
      reserved = 0;
      update(): void {}
      setQuality(): void {}
      contextRestored(): void {}
      dispose(): void {}
    },
  }));
  vi.doMock('./ui/minimap', () => ({
    Minimap: class {
      constructor() {
        minimaps++;
      }
      setCaption(c: string): void {
        minimapCaptions.push(c);
      }
      setRotating(): void {}
      setVisible(): void {}
      update(): void {}
      dispose(): void {}
    },
  }));
  vi.doMock('./ui/rangeReadout', () => ({
    RangeReadout: class { set(): void {} setVisible(): void {} dispose(): void {} },
    ChallengeBanner: class { cue(): void {} frame(): void {} dispose(): void {} },
    lastShotText: () => '',
    challengeText: () => '',
  }));
  vi.doMock('./render/light/lighting', () => ({ addLighting: () => ({ reserveLights() {}, dispose() {} }) }));
  vi.doMock('./render/figures/figureMix', () => ({ figureCrowd: () => [], playerArms: () => undefined }));
  vi.doMock('./pool/loadoutModel', () => ({ bbGlowFor: () => ({ player: [], others: false }), kitPaint: () => ({}) }));
  await (await import('./physics/physicsWorld')).initPhysics();
  ({ RangeSession } = await import('./rangeSession'));
});
afterAll(() => {
  for (const m of ['./render/match/combatPresentation', './render/match/rangeTargetsRenderer', './render/light/torchBeams', './ui/minimap', './ui/rangeReadout', './render/light/lighting', './render/figures/figureMix', './pool/loadoutModel']) vi.doUnmock(m);
  vi.resetModules();
});

function build(extra: { map?: MapData; course?: string; challenge?: boolean; best?: number }, pose?: { x: number; y?: number; z: number; yaw: number; pitch: number }) {
  const group = new THREE.Group();
  const renderer = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    clusteredLights: false,
    mapMeshes: { take: () => group, restyle: () => group, release() {} },
    surfaceTexturesFor: () => ({}),
    setLighting() {},
    setZoom() {},
  };
  const view = { yaw: NaN };
  const input = {
    resetView(y: number) { view.yaw = y; },
    ordersEnabled: true,
    pitch: 0,
    yaw: 0,
    keyName: () => '',
    update() {},
    takeInspect: () => false,
    fillCommand() {},
  };
  const kit = {
    slots: LOADOUT.map((replica) => ({ replica, optic: null, parts: [] })),
    hopUps: LOADOUT.map(() => 0),
    bbWeights: LOADOUT.map((r) => r.bbWeight),
    glowBBs: LOADOUT.map(() => 'off'),
    schemes: LOADOUT.map(() => 'default'),
  };
  const setup = { kit, teamColours: { figures: ['#fff', '#000'], hud: [0xff0000, 0x0000ff] }, look: undefined, challenge: extra.challenge ?? true, challengeBest: extra.best, ...(extra.map ? { map: extra.map } : {}), ...(extra.course ? { course: extra.course } : {}) };
  const s = new RangeSession(renderer as never, document_stub(), input as never, setup as never, 1, QUALITY.low as never, {} as never, {} as never, pose);
  return { s, view };
}
const document_stub = (): never => ({}) as never;

/** A field where you start boxed in by four walls: no room for the START plate. */
const BOXED: MapData = {
  ...OPEN_FIELD,
  spawns: [[{ position: vec3(0, 0, 20), yaw: 0 }], [{ position: vec3(0, 0, -30), yaw: Math.PI }]],
  lanes: [[vec3(10, 0, 0)]],
  blocks: [
    ...OPEN_FIELD.blocks,
    ...[[0, 18, 4, 0.4], [0, 22, 4, 0.4], [-2, 20, 0.4, 4], [2, 20, 0.4, 4]].map(([x, z, w, d]) => ({ kind: 'wall' as const, center: vec3(x!, 1.5, z!), size: vec3(w!, 3, d!) })),
  ],
};

describe('Practice on a map (M94): the session', () => {
  it('offers the timed challenge and starts it on a map with a START plate; no bots, only you', () => {
    const { s } = build({ map: DEPOT, course: 'depot' });
    expect(s.challengeOffer).toBe(true);
    expect(s.practiceMap).toBe(DEPOT);
    expect((s as unknown as { state: { characters: unknown[] } }).state.characters).toHaveLength(1);
    expect((s as unknown as { state: { targets: { start?: boolean }[] } }).state.targets.some((t) => t.start)).toBe(true);
    s.dispose();
  });

  it('has no challenge to offer where no START plate fits, and setChallenge does nothing there', () => {
    const { s } = build({ map: BOXED, course: 'boxed' });
    const targets = (s as unknown as { state: { targets: { start?: boolean }[] } }).state.targets;
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((t) => t.start)).toBe(false);
    expect(s.challengeOffer).toBeNull();
    s.setChallenge(true);
    expect(s.challengeOffer).toBeNull();
    expect((s as unknown as { challenge: { phase: string } }).challenge.phase).toBe('off');
    s.dispose();
  });

  it('faces the START plate on a map, while the range keeps the spawn’s way', () => {
    const map = build({ map: DEPOT, course: 'depot' });
    const plate = (map.s as unknown as { state: { targets: { start?: boolean; yaw: number }[] } }).state.targets.find((t) => t.start)!;
    // A character and the plate facing each other differ by half a turn (the session's comment); the session turns you to the plate's yaw.
    expect(map.view.yaw).toBeCloseTo((map.s as unknown as { player: { yaw: number } }).player.yaw, 9);
    expect(map.view.yaw).toBeCloseTo(plate.yaw, 9);
    map.s.dispose();
    const range = build({});
    expect(range.view.yaw).toBeCloseTo(RANGE_MAP.spawns[0][0]!.yaw, 9);
    range.s.dispose();
  });

  it('keeps the course it was given, and the range’s course when none is given', () => {
    const a = build({ map: DEPOT, course: 'depot' });
    expect(a.s.course).toBe('depot');
    a.s.dispose();
    const r = build({});
    expect(r.s.course).toBe(RANGE_CHALLENGE.course);
    r.s.dispose();
  });

  it('carries the best on its course into the challenge line, and names the map in the title', () => {
    const { s } = build({ map: DEPOT, course: 'depot', best: 7 });
    expect(s.practiceMap.name).toBe(DEPOT.name);
    expect((s as unknown as { challenge: { best: number } }).challenge.best).toBe(7);
    expect(s.status).toContain(`Practice · ${DEPOT.name}`);
    expect(s.status).toContain('best 7');
    s.dispose();
  });

  it('marks a challenge run played with Dev settings that change play, and only then (BP5)', async () => {
    const { DEV_DEFAULTS } = await import('./config/dev');
    for (const [cheats, helped] of [[DEV_DEFAULTS, false], [{ ...DEV_DEFAULTS, bottomlessMags: true }, true], [{ ...DEV_DEFAULTS, gameSpeed: 0.25 }, true]] as const) {
      const { s } = build({ map: DEPOT, course: 'depot' });
      s.setDevCheats(cheats);
      // Only the simulation and the challenge: the presentation's tick is not what this is about.
      vi.spyOn(s as unknown as { afterTick: () => void }, 'afterTick').mockImplementation(() => {});
      const c = (s as unknown as { challenge: { phase: string; clock: number; helped: boolean } }).challenge;
      c.phase = 'countdown';
      c.clock = RANGE_CHALLENGE.countdown;
      s.advance(0.05);
      expect(c.helped, JSON.stringify(cheats)).toBe(helped);
      s.dispose();
    }
  });

  it('shows a minimap captioned with the map on a map, and none on the range', () => {
    minimaps = 0;
    minimapCaptions = [];
    build({}).s.dispose();
    expect(minimaps).toBe(0);
    build({ map: DEPOT, course: 'depot' }).s.dispose();
    expect(minimaps).toBe(1);
    expect(minimapCaptions).toEqual([DEPOT.name]);
  });

  it('rebuilds where you stood: the pose carries the floor you stood over', () => {
    const first = build({ map: DEPOT, course: 'depot' });
    const pose = { ...first.s.pose, y: first.s.pose.y! };
    first.s.dispose();
    const again = build({ map: DEPOT, course: 'depot' }, pose);
    expect(again.s.pose.x).toBeCloseTo(pose.x, 6);
    expect(again.s.pose.y).toBeCloseTo(pose.y, 6);
    expect(again.s.pose.z).toBeCloseTo(pose.z, 6);
    again.s.dispose();
    // A raised pose is kept, not put back on the spawn's floor.
    const up = build({ map: DEPOT, course: 'depot' }, { x: pose.x, y: pose.y + 3, z: pose.z, yaw: 1, pitch: 0 });
    expect(up.s.pose.y).toBeCloseTo(pose.y + 3, 6);
    up.s.dispose();
  });
});
