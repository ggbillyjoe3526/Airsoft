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

// Extraction's respawn fade restarts through the Web Animations API, not the old remove / offsetWidth / add reflow
// (audit UI-08, as hitFeedback does since UI-23). Drawing classes are auto-mocked as in whatGotYouWiring.test.ts; the
// fade is a recording stand-in that counts any forced layout read.

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
vi.mock('../ui/squadBar');
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

/** A div that notes layout reads and the animations it was asked to restart. */
function fakeFade() {
  const classes = new Set<string>();
  const animation = { currentTime: 5 as number | null, plays: 0, play() { this.plays++; } };
  const fade = {
    className: '',
    layoutReads: 0,
    classList: { contains: (c: string) => classes.has(c), add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) },
    getAnimations: () => [animation],
    remove() {},
    get offsetWidth(): number {
      this.layoutReads++;
      return 0;
    },
  };
  return { fade, animation, classes };
}

describe('the respawn fade (audit UI-08)', () => {
  it('restarts its animation without a forced layout', () => {
    const { fade, animation, classes } = fakeFade();
    (globalThis as { document?: unknown }).document = { createElement: () => fade };
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
    const respawn = (): void => {
      state.events.length = 0;
      state.events.push({ type: 'respawned', characterId: player.id } as never);
      match.afterTick(0);
      state.events.length = 0;
    };
    respawn();
    expect(classes.has('on'), 'the first respawn turns the fade on').toBe(true);
    respawn();
    expect(animation.plays, 'the second restarts the running animation').toBe(1);
    expect(animation.currentTime).toBe(0);
    expect(fade.layoutReads, 'and forces no layout').toBe(0);
  });
});
