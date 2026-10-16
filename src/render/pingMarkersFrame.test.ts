import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { PINGS } from '../config/pings';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import type { ExtractionContext } from '../sim/extraction';
import { createGameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { MatchStats } from '../stats/matchStats';
import { Minimap } from '../ui/minimap';
import type { MatchPresentation as MatchPresentationClass } from './matchPresentation';

// PG1 QA: MatchPresentation.updatePingMarkers decides, per ping and frame, what the marker element is told. Drawing
// classes are auto-mocked as in markerCamera.test.ts; the ping markers are spies.

const markers = vi.hoisted(() => ({
  pings: [] as { kind: string; x: number; y: number; z: number; at: number }[],
  shown: true,
  show: undefined as unknown as (...a: unknown[]) => void,
  hide: undefined as unknown as (...a: unknown[]) => void,
}));
vi.mock('../ui/whatGotYou');
vi.mock('../ui/casePrompt');
vi.mock('../ui/flagMarker');
vi.mock('../ui/calloutFeed');
vi.mock('../ui/hitFeed');
vi.mock('../ui/hitFeedback');
vi.mock('../ui/holdMarker');
vi.mock('../ui/pingMarkers', async (orig) => ({
  ...(await orig<typeof import('../ui/pingMarkers')>()),
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
vi.mock('../ui/matchBoard');
vi.mock('../ui/minimap');
vi.mock('../ui/minimapView');
vi.mock('../ui/magPrompt');
vi.mock('../ui/orderWheel');
vi.mock('../ui/roundBanner');
vi.mock('../ui/scoreboard');
vi.mock('../ui/soundCues');
vi.mock('../ui/squadOrderLine');
vi.mock('../ui/teammateMarkers');
vi.mock('./characterRenderer');
vi.mock('./caseRenderer');
vi.mock('./exitRenderer');
vi.mock('./flagRenderer', () => ({ FlagRenderer: class { object = { visible: false }; update() {} dispose() {} setReceiveShadows() {} setDetail() {} setEnvironmentLit() {} } }));
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
const ahead = (at: number, kind = 'spot') => ({ kind, x: 0, y: 0, z: -10, at });

describe('PG1: ping markers over the field (acceptance 2, 6)', () => {
  it('shows a ping ahead with its distance, on screen, at full strength', () => {
    const f = setup();
    markers.pings = [ahead(0)];
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    expect(hide).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledTimes(1);
    const [i, , , metres, edge, alpha] = show.mock.calls[0]!;
    expect(i).toBe(0);
    expect(metres as number).toBeCloseTo(Math.hypot(10, PINGS.markerHeight), 3);
    expect(edge).toBe(false);
    expect(alpha).toBe(1);
  });

  it('pins a ping behind you to the screen edge', () => {
    const f = setup();
    markers.pings = [{ kind: 'spot', x: 0, y: 0, z: 10, at: 0 }];
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    expect(show.mock.calls[0]![4]).toBe(true);
  });

  it('fades over the last fadeTime and is gone at PINGS.lifetime', () => {
    const f = setup();
    markers.pings = [ahead(0)];
    f.state.time = PINGS.lifetime - PINGS.fadeTime / 2;
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    expect(show.mock.calls[0]![5]).toBeCloseTo(0.5, 6);
    show.mockClear();
    f.state.time = PINGS.lifetime;
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    expect(show).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledWith(0);
  });

  it('hides a ping that was never placed (no time)', () => {
    const f = setup();
    markers.pings = [ahead(Number.NaN)];
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    expect(show).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledWith(0);
  });

  it('lifts a spot ping above the floor but puts an enemy ping at its point', () => {
    const f = setup();
    markers.pings = [ahead(0, 'spot'), ahead(0, 'enemy')];
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    const spot = show.mock.calls[0]![3] as number;
    const enemy = show.mock.calls[1]![3] as number;
    expect(spot).toBeGreaterThan(enemy);
  });

  it.each([
    ['the scoreboard is held', (f: ReturnType<typeof setup>) => f.match.frame(f.camera, 1, 1 / 60, 0, true)],
    ['not playing (a menu is up)', (f: ReturnType<typeof setup>) => (f.match.setPlaying(false), f.match.frame(f.camera, 1, 1 / 60, 0, false))],
    ['you are spectating', (f: ReturnType<typeof setup>) => (f.player.status = 'out', f.match.frame(f.camera, 1, 1 / 60, 0, false))],
    ['the minimap covers it', (f: ReturnType<typeof setup>) => (f.covers.mockReturnValue(true), f.match.frame(f.camera, 1, 1 / 60, 0, false))],
  ])('hides the marker while %s', (_name, act) => {
    const f = setup();
    markers.pings = [ahead(0)];
    act(f);
    expect(show).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledWith(0);
  });

  it('touches no marker at all with Ping markers off', () => {
    const f = setup();
    markers.shown = false;
    markers.pings = [ahead(0)];
    f.match.frame(f.camera, 1, 1 / 60, 0, false);
    expect(show).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });
});
