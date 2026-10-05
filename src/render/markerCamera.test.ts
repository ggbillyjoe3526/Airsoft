import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import type { ExtractionContext } from '../sim/extraction';
import { createGameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { MatchStats } from '../stats/matchStats';
import type { MatchPresentation as MatchPresentationClass } from './matchPresentation';

// The camera's world matrix is made once a frame for all the markers (audit UI-13), by MatchPresentation.frame, not by
// each projectMarker. Drawing classes are auto-mocked as in respawnFade.test.ts.

vi.mock('../ui/whatGotYou');
vi.mock('../ui/casePrompt');
vi.mock('../ui/flagMarker');
vi.mock('../ui/hitFeed');
vi.mock('../ui/hitFeedback');
vi.mock('../ui/holdMarker');
vi.mock('../ui/matchBoard');
vi.mock('../ui/minimap');
vi.mock('../ui/minimapView');
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
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

describe('the markers\' camera (audit UI-13)', () => {
  it('has its world matrix made once in a frame, after it is placed', () => {
    const element = { className: '', classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, appendChild() {}, style: {} };
    (globalThis as { document?: unknown }).document = { createElement: () => element };
    const state = createGameState(1, 8, ROUNDS);
    const player = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    state.characters.push(player);
    const container = { appendChild() {}, append() {} } as unknown as HTMLElement;
    const match = new MatchPresentation(
      { add() {} } as unknown as THREE.Scene,
      container,
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
    const camera = new THREE.PerspectiveCamera(70, 800 / 600, 0.05, 200);
    const update = vi.spyOn(camera, 'updateMatrixWorld');
    match.frame(camera, 0.5, 1 / 60, 0, false);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
