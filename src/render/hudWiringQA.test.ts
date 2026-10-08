import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { createCharacter } from '../sim/character';
import type { ExtractionContext } from '../sim/extraction';
import type { RoundRules } from '../sim/round';
import { createGameState, type GameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { MatchStats } from '../stats/matchStats';
import type { HitFeed as HitFeedClass } from '../ui/hitFeed';
import type { Minimap as MinimapClass } from '../ui/minimap';
import type { Scoreboard as ScoreboardClass } from '../ui/scoreboard';
import type { MatchPresentation as MatchPresentationClass } from './matchPresentation';

// G4 QA: how MatchPresentation drives the new HUD parts. Every drawing class is auto-mocked (no DOM or GPU under Vitest),
// so what is asserted is the presentation's own wiring: what the score bar is told is the match's aim, what the minimap's
// caption says and when it changes, and what the hit feed is handed for a friendly or ricochet hit.

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
// Kept while the squad line exists; drop both with it (the other wiring tests mock them too).
vi.mock('../ui/squadOrderLine');
vi.mock('../ui/squadBar');
vi.mock('../ui/teammateMarkers');
vi.mock('../ui/whatGotYou');
vi.mock('./characterRenderer');
vi.mock('./caseRenderer');
vi.mock('./exitRenderer');
vi.mock('./flagRenderer', () => ({ FlagRenderer: class { object = { visible: false }; update() {} dispose() {} setReceiveShadows() {} setDetail() {} setEnvironmentLit() {} } }));
vi.mock('./spectatorCamera', () => ({
  SpectatorCamera: class {
    constructor(_c: unknown, private readonly player: unknown) {}
    ensureTarget() {
      return this.player;
    }
    place() {}
    reset() {}
    next() {}
  },
}));

let MatchPresentation: typeof MatchPresentationClass;
let Scoreboard: typeof ScoreboardClass;
let Minimap: typeof MinimapClass;
let HitFeed: typeof HitFeedClass;
beforeAll(async () => {
  vi.resetModules();
  ({ MatchPresentation } = await import('./matchPresentation'));
  ({ Scoreboard } = await import('../ui/scoreboard'));
  ({ Minimap } = await import('../ui/minimap'));
  ({ HitFeed } = await import('../ui/hitFeed'));
});
afterAll(() => {
  vi.resetModules();
});
beforeEach(() => {
  vi.clearAllMocks();
  // Extraction adds a respawn fade of its own (a plain element here).
  vi.stubGlobal('document', { createElement: () => ({ className: '', classList: { add() {}, remove() {} }, remove() {} }) });
});
afterEach(() => void vi.unstubAllGlobals());

const PLAYER = 0;
const ENEMY = 1;
const MATE = 2;
const ENEMY2 = 3;

interface Options {
  rules?: RoundRules;
  extraction?: boolean;
  /** The player's team (0 = Blue). */
  team?: number;
  name?: string;
}

function rig(o: Options = {}) {
  const team = o.team ?? 0;
  const rules = o.rules ?? ROUNDS;
  const state: GameState = createGameState(1, 8, rules);
  const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, team);
  state.characters.push(
    player,
    createCharacter(ENEMY, vec3(0, 0, -12), 0, LOADOUT, 1 - team),
    createCharacter(MATE, vec3(4, 0, 0), 0, LOADOUT, team),
    createCharacter(ENEMY2, vec3(8, 0, -12), 0, LOADOUT, 1 - team),
  );
  const container = { appendChild() {}, append() {} } as unknown as HTMLElement;
  const keyName = (action: string): string => `key:${action}`;
  const match = new MatchPresentation(
    { add() {} } as unknown as THREE.Scene,
    container,
    { width: 800, height: 600 },
    state,
    player,
    BODY,
    HITS,
    { raycastStatic: () => -1 },
    [2, 2],
    rules,
    new MatchStats(state.characters),
    keyName,
    TEAM_COLOUR_SETS.standard,
    { blocks: [], name: o.name ?? 'Depot' },
    null,
    'low',
    o.extraction ? ({ rules: {} } as unknown as ExtractionContext) : undefined,
  );
  const event = (e: GameState['events'][number]): void => {
    state.events.length = 0;
    state.events.push(e);
    match.afterTick(0);
    state.events.length = 0;
  };
  return { state, match, player, event, keyName };
}

const aim = (): unknown[] => vi.mocked(Scoreboard.prototype.setAim).mock.calls.map((c) => c[0]);
const captions = (): unknown[] => vi.mocked(Minimap.prototype.setCaption).mock.calls.map((c) => c[0]);

describe('the score bar is told what wins the match (G4 criterion 1)', () => {
  it('says "First to N" for the match\'s rounds to win', () => {
    rig();
    expect(aim()).toEqual([`First to ${ROUNDS.winsNeeded}`]);
  });

  it('adds the lead needed under Win by two', () => {
    rig({ rules: { ...ROUNDS, winsNeeded: 7, winBy: 2 } });
    expect(aim()).toEqual(['First to 7, by 2']);
  });

  it('says the run\'s line in Extraction, not a round count', () => {
    rig({ extraction: true });
    expect(aim()).toHaveLength(1);
    expect(aim()[0]).toBe('Extraction');
    expect(String(aim()[0])).not.toMatch(/first to/i);
  });
});

describe('the minimap names the map and the round (G4 criterion 2)', () => {
  it('starts with the map and the round now, and follows each round that starts', () => {
    const r = rig();
    expect(captions()).toEqual([`Depot · Round ${r.state.round.number}`]);
    r.event({ type: 'roundStart', round: 2 } as never);
    r.event({ type: 'roundStart', round: 3 } as never);
    expect(captions().slice(1)).toEqual(['Depot · Round 2', 'Depot · Round 3']);
  });

  it('names only the map in Extraction, which is one long round', () => {
    const r = rig({ extraction: true });
    r.event({ type: 'roundStart', round: 1 } as never);
    expect(captions()).toEqual(['Depot', 'Depot']);
  });
});

describe('the hit feed is handed who, which team, friendly, yours and ricochet (G4 criterion 3)', () => {
  const hit = (r: ReturnType<typeof rig>, victimId: number, shooterId: number, ricochet = false): void =>
    r.event({ type: 'characterHit', victimId, shooterId, position: vec3(), direction: vec3(0, 0, 1), ricochet } as never);
  const added = (): unknown[][] => vi.mocked(HitFeed.prototype.add).mock.calls.map((c) => [c[0], c[1], c[2], c[3], c[5]]);

  it('names the one who called the hit and whose BB it was, in their teams', () => {
    const r = rig();
    hit(r, MATE, ENEMY);
    expect(added()).toEqual([[{ name: 'Blue 2', team: 0 }, { name: 'Orange 1', team: 1 }, false, false, false]]);
  });

  it('marks a hit on a teammate by your side friendly, and yours when it is you who fired', () => {
    const r = rig();
    hit(r, MATE, PLAYER);
    expect(added()).toEqual([[{ name: 'Blue 2', team: 0 }, { name: 'You', team: 0 }, true, true, false]]);
  });

  it('marks a hit on you yours, and carries the ricochet tag', () => {
    const r = rig();
    hit(r, PLAYER, ENEMY, true);
    expect(added()).toEqual([[{ name: 'You', team: 0 }, { name: 'Orange 1', team: 1 }, false, true, true]]);
  });

  it('does not call your own ricochet a friendly hit (the row names you twice)', () => {
    const r = rig();
    hit(r, PLAYER, PLAYER, true);
    expect(added()).toEqual([[{ name: 'You', team: 0 }, { name: 'You', team: 0 }, false, true, true]]);
  });

  it('marks a hit between two others neither friendly nor yours', () => {
    const r = rig();
    hit(r, ENEMY2, ENEMY);
    expect(added()).toEqual([[{ name: 'Orange 2', team: 1 }, { name: 'Orange 1', team: 1 }, true, false, false]]);
  });
});
