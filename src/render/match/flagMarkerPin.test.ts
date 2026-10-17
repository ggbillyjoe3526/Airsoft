import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HITS, ROUNDS } from '../../config/hits';
import { BODY } from '../../config/movement';
import { PINGS } from '../../config/pings';
import { TEAM_COLOUR_SETS } from '../../config/teams';
import { LOADOUT } from '../../config/replicas';
import { createCharacter } from '../../sim/character';
import type { ExtractionContext } from '../../sim/extraction';
import { createGameState } from '../../sim/state';
import { vec3 } from '../../sim/vec';
import { MatchStats } from '../../stats/matchStats';
import { FlagMarker } from '../../ui/flagMarker';
import { Minimap } from '../../ui/minimap';
import type { MatchPresentation as MatchPresentationClass } from './matchPresentation';

// DX6 QA: the flag marker through placeMarker: projected, pinned, and the way to turn read from the pinned point.
// (Setup copied from pingMarkersFrame.test.ts.)
// PG1 QA: MatchPresentation.updatePingMarkers decides, per ping and frame, what the marker element is told. Drawing
// classes are auto-mocked as in markerCamera.test.ts; the ping markers are spies.

const flagAt = vi.hoisted(() => ({ anchor: { x: 0, y: 0, z: 0, isVector3: true } as unknown as import('three').Vector3 }));
const markers = vi.hoisted(() => ({
  pings: [] as { kind: string; x: number; y: number; z: number; at: number }[],
  shown: true,
  show: undefined as unknown as (...a: unknown[]) => void,
  hide: undefined as unknown as (...a: unknown[]) => void,
}));
vi.mock('../../ui/whatGotYou');
vi.mock('../../ui/casePrompt');
vi.mock('../../ui/flagMarker');
vi.mock('../../ui/roundResult');
vi.mock('../../ui/hitFeed');
vi.mock('../../ui/hitFeedback');
vi.mock('../../ui/holdMarker');
vi.mock('../../ui/pingMarkers', async (orig) => ({
  ...(await orig<typeof import('../../ui/pingMarkers')>()),
  PingMarkers: class {
    get pings() { return markers.pings; }
    get markersShown() { return markers.shown; }
    place = vi.fn();
    setShown = vi.fn();
    show = (...a: unknown[]) => markers.show(...a);
    hide = (...a: unknown[]) => markers.hide(...a);
    hideAll() {}
    clear() {}
    dispose() {}
  },
}));
vi.mock('../../ui/matchBoard');
vi.mock('../../ui/minimap');
vi.mock('../../ui/minimapView');
vi.mock('../../ui/magPrompt');
vi.mock('../../ui/orderWheel');
vi.mock('../../ui/roundBanner');
vi.mock('../../ui/scoreboard');
vi.mock('../../ui/soundCues');
vi.mock('../../ui/squadOrderLine');
vi.mock('../../ui/teammateMarkers');
vi.mock('../figures/characterRenderer');
vi.mock('./caseRenderer');
vi.mock('./exitRenderer');
vi.mock('./flagRenderer', () => ({ FlagRenderer: class { object = { visible: true }; get markerAnchor() { return flagAt.anchor; } update() {} dispose() {} setReceiveShadows() {} setDetail() {} setEnvironmentLit() {} } }));
vi.mock('./spectatorCamera', () => ({ SpectatorCamera: class { constructor(_c: unknown, private readonly player: unknown) {} ensureTarget() { return this.player; } place() {} reset() {} next() {} } }));

let MatchPresentation: typeof MatchPresentationClass;
beforeAll(async () => {
  vi.resetModules();
  ({ MatchPresentation } = await import('./matchPresentation'));
});

const realDocument = globalThis.document;
let show: ReturnType<typeof vi.fn<(...a: unknown[]) => void>>;
let hide: ReturnType<typeof vi.fn<(...a: unknown[]) => void>>;
beforeEach(() => {
  show = vi.fn<(...a: unknown[]) => void>();
  hide = vi.fn<(...a: unknown[]) => void>();
  markers.show = show;
  markers.hide = hide;
  markers.shown = true;
  markers.pings = [];
});
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

function setup() {
  const element = { className: '', classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, appendChild() {}, style: {} };
  (globalThis as { document?: unknown }).document = { createElement: () => element };
  const state = createGameState(1, 8, ROUNDS);
  const player = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  state.characters.push(player);
  const match = new MatchPresentation(
    { add() {} } as unknown as THREE.Scene,
    { appendChild() {}, append() {} } as unknown as HTMLElement,
    { width: 800, height: 600 },
    state,
    player,
    BODY,
    HITS,
    { raycastStatic: () => -1 },
    [1, 1],
    ROUNDS,
    new MatchStats(state.characters),
    () => 'K',
    TEAM_COLOUR_SETS.standard,
    { blocks: [] },
    null,
    'low',
    { rules: {} } as unknown as ExtractionContext,
  );
  match.setPlaying(true);
  // A camera at the origin facing -Z (three.js default).
  const camera = new THREE.PerspectiveCamera(70, 800 / 600, 0.05, 200);
  const minimap = vi.mocked(Minimap).mock.instances.at(-1)!;
  const covers = minimap.covers as unknown as ReturnType<typeof vi.fn>;
  covers.mockReturnValue(false);
  // A marker pinned to the edge keeps where projectMarker put it (BP5: clearPinned moves it only off the minimap's panel).
  vi.mocked(minimap.clearPinned).mockImplementation((m) => m);
  return { match, state, player, camera, covers };
}

describe('DX6: the flag marker through the shared project-and-pin step', () => {
  function flagFrame(anchor: THREE.Vector3) {
    const f = setup();
    flagAt.anchor = anchor;
    f.state.round.phase = 'live';
    f.state.round.flag.position = { x: 500, y: 0, z: 500 };
    f.state.round.overtimeFlag.position = { x: 500, y: 0, z: 500 }; // far from the player, so the near-hide stays off
    const marker = vi.mocked(FlagMarker).mock.instances.at(-1)!;
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    return vi.mocked(marker.show);
  }

  it('shows a flag ahead on screen, with no edge arrow', () => {
    const show = flagFrame(new THREE.Vector3(0, 0, -20));
    expect(show).toHaveBeenCalledTimes(1);
    const [x, y, , , edge] = show.mock.calls[0]!;
    expect(edge).toBe(false);
    expect(x).toBeCloseTo(400, 0);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(600);
  });

  it('pins a flag behind the camera on the screen edge, pointing the way to turn', () => {
    const show = flagFrame(new THREE.Vector3(30, 0, 20));
    const [x, y, , , edge, towards] = show.mock.calls[0]!;
    expect(edge).toBe(true);
    expect(Number.isFinite(x as number) && Number.isFinite(y as number)).toBe(true);
    expect(x as number).toBeGreaterThanOrEqual(0);
    expect(x as number).toBeLessThanOrEqual(800);
    expect(y as number).toBeGreaterThanOrEqual(0);
    expect(y as number).toBeLessThanOrEqual(600);
    // Right of and behind the camera: the arrow points right (angle within a quarter turn of +x).
    expect(Math.abs(towards as number)).toBeLessThan(90);
  });

  it('points left for a flag behind and to the left, so the arrow is read per frame, not kept from the last', () => {
    const f = setup();
    f.state.round.phase = 'live';
    f.state.round.flag.position = { x: 500, y: 0, z: 500 };
    f.state.round.overtimeFlag.position = { x: 500, y: 0, z: 500 };
    const marker = vi.mocked(FlagMarker).mock.instances.at(-1)!;
    flagAt.anchor = new THREE.Vector3(30, 0, 20);
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    flagAt.anchor = new THREE.Vector3(-30, 0, 20);
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    const calls = vi.mocked(marker.show).mock.calls;
    expect(Math.abs(calls[0]![5] as number)).toBeLessThan(90);
    expect(Math.abs(calls[1]![5] as number)).toBeGreaterThan(90);
  });
});
