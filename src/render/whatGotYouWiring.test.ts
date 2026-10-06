import * as THREE from 'three';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUNDS } from '../config/hits';
import { HITS } from '../config/hits';
import { HUD } from '../config/render';
import { BODY } from '../config/movement';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { PRO_TIPS, proTip } from '../config/tutorial';
import { createCharacter } from '../sim/character';
import { createHitFacts, type HitFacts } from '../sim/hitFacts';
import { createGameState, type GameState } from '../sim/state';
import { LOADOUT } from '../config/replicas';
import { vec3 } from '../sim/vec';
import { MatchStats } from '../stats/matchStats';
import type { HitFeedback as HitFeedbackClass } from '../ui/hitFeedback';
import type { MatchBoard as MatchBoardClass } from '../ui/matchBoard';
import type { MatchPresentation as MatchPresentationClass } from './matchPresentation';

// How MatchPresentation drives the "what got you" card and the Pro tips (M41), and says the run's news (M53). Every drawing class is auto-mocked (this
// project has no DOM or GPU under Vitest); the card is a recording stand-in, so what is asserted is the presentation's own
// logic: when the card is worded, cleared and allowed to show, and what tip the board is told.

const { cards, SpyCard } = vi.hoisted(() => {
  const cards: InstanceType<typeof SpyCard>[] = [];
  class SpyCard {
    has = false;
    visible = false;
    words: string[] = [];
    constructor() {
      cards.push(this);
    }
    set(text: { where: string }): void {
      this.has = true;
      this.words.push(text.where);
    }
    clear(): void {
      this.has = false;
    }
    setShown(shown: boolean): void {
      this.visible = shown;
    }
    dispose(): void {}
    get showing(): boolean {
      return this.has && this.visible;
    }
  }
  return { cards, SpyCard };
});
type SpyCard = InstanceType<typeof SpyCard>;

vi.mock('../ui/whatGotYou', async (orig) => ({ ...(await orig<typeof import('../ui/whatGotYou')>()), WhatGotYouCard: SpyCard }));
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

// Vitest runs files without isolation here, so an earlier file may already hold the real presentation module, wired to the
// real drawing classes; the mocks above only reach a fresh copy, so this file loads its own.
let MatchPresentation: typeof MatchPresentationClass;
let MatchBoard: typeof MatchBoardClass;
let HitFeedback: typeof HitFeedbackClass;
let banners: typeof import('../ui/roundBanner');
beforeAll(async () => {
  vi.resetModules();
  ({ MatchPresentation } = await import('./matchPresentation'));
  ({ MatchBoard } = await import('../ui/matchBoard'));
  ({ HitFeedback } = await import('../ui/hitFeedback'));
  banners = await import('../ui/roundBanner');
});
// And resets again when it ends (vite.config.ts's rule, audit CORE-06), so later files in this worker don't load a second
// copy of the modules beside the first.
afterAll(() => {
  vi.resetModules();
});

const PLAYER = 0;
const ENEMY = 1;
const MATE = 2;

interface Rig {
  state: GameState;
  facts: HitFacts;
  match: MatchPresentationClass;
  card: SpyCard;
  board: MatchBoardClass;
  player: ReturnType<typeof createCharacter>;
  hit: (victimId: number, shooterId?: number) => void;
  frame: (o?: { held?: boolean }) => void;
}

function rig(): Rig {
  cards.length = 0;
  const state = createGameState(1, 8, ROUNDS);
  const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
  state.characters.push(player, createCharacter(ENEMY, vec3(0, 0, -12), 0, LOADOUT, 1), createCharacter(MATE, vec3(4, 0, 0), 0, LOADOUT, 0));
  const container = { appendChild() {}, append() {} } as unknown as HTMLElement;
  const scene = { add() {} } as unknown as THREE.Scene;
  const match = new MatchPresentation(
    scene,
    container,
    { width: 800, height: 600 },
    state,
    player,
    BODY,
    HITS,
    { raycastStatic: () => -1 },
    [2, 1],
    ROUNDS,
    new MatchStats(state.characters),
    () => 'K',
    TEAM_COLOUR_SETS.standard,
    { blocks: [] },
  );
  const facts = createHitFacts();
  match.setHitFacts(facts);
  match.setWhatGotYou(true);
  match.setPlaying(true);
  const camera = new THREE.PerspectiveCamera();
  const hit = (victimId: number, shooterId = ENEMY): void => {
    state.events.length = 0;
    state.events.push({ type: 'characterHit', victimId, shooterId, position: vec3(), direction: vec3(0, 0, 1), ricochet: false });
    match.afterTick(0);
    state.events.length = 0;
  };
  return {
    state,
    facts,
    match,
    card: cards[0]!,
    board: vi.mocked(MatchBoard).mock.instances[0]!,
    player,
    hit,
    frame: (o = {}) => void match.frame(camera, 1, 1 / 60, 0, o.held ?? false),
  };
}

/** What the bots' controller would have written for a hit on `victimId` this tick. */
function recorded(r: Rig, victimId: number): void {
  r.facts.time = r.state.time;
  r.facts.victimId = victimId;
  r.facts.shooterId = ENEMY;
  r.facts.distance = 12;
  r.facts.held = true;
  r.facts.inView = 0.4;
}

function event(r: Rig, e: GameState['events'][number]): void {
  r.state.events.length = 0;
  r.state.events.push(e);
  r.match.afterTick(0);
  r.state.events.length = 0;
}

beforeEach(() => vi.clearAllMocks());

describe('the card is worded for the local player\'s own hit only', () => {
  it('words the hit that put you out, naming who fired', () => {
    const r = rig();
    recorded(r, PLAYER);
    r.hit(PLAYER);
    expect(r.card.words).toHaveLength(1);
    expect(r.card.words[0]).toMatch(/^Orange 1 · from /);
  });

  it('says nothing when a teammate is hit, even with your last hit still on the record for that tick', () => {
    const r = rig();
    recorded(r, PLAYER);
    r.hit(MATE);
    expect(r.card.words).toEqual([]);
    // And an enemy that is hit (by you) is not the card's business either.
    r.hit(ENEMY, PLAYER);
    expect(r.card.words).toEqual([]);
  });

  it('says nothing when the record is not from this tick or not about you', () => {
    const r = rig();
    recorded(r, PLAYER);
    r.state.time += 1;
    r.hit(PLAYER);
    expect(r.card.words, 'a stale record').toEqual([]);
    recorded(r, ENEMY);
    r.hit(PLAYER);
    expect(r.card.words, 'a record about someone else').toEqual([]);
  });

  it('is never worded while the setting is off, and switching it off takes the card away', () => {
    const r = rig();
    r.match.setWhatGotYou(false);
    recorded(r, PLAYER);
    r.hit(PLAYER);
    expect(r.card.words).toEqual([]);
    r.match.setWhatGotYou(true);
    r.hit(PLAYER);
    expect(r.card.words).toHaveLength(1);
    r.match.setWhatGotYou(false);
    expect(r.card.has).toBe(false);
  });
});

describe('the card clears when its words are old', () => {
  it('clears at the start of the next round', () => {
    const r = rig();
    recorded(r, PLAYER);
    r.hit(PLAYER);
    expect(r.card.has).toBe(true);
    event(r, { type: 'roundStart', round: 2 });
    expect(r.card.has).toBe(false);
  });

  it('clears when you respawn (Extraction), but not when a teammate does', () => {
    const r = rig();
    recorded(r, PLAYER);
    r.hit(PLAYER);
    event(r, { type: 'respawned', characterId: MATE, respawnsLeft: 0 });
    expect(r.card.has, 'a teammate\'s respawn').toBe(true);
    event(r, { type: 'respawned', characterId: PLAYER, respawnsLeft: 0 });
    expect(r.card.has, 'your respawn').toBe(false);
  });
});

describe('the card shows only while you are out and watching', () => {
  it('shows after you walk off, not while you are still in play, and hides under the scoreboard or a menu', () => {
    const r = rig();
    recorded(r, PLAYER);
    r.hit(PLAYER);
    r.player.status = 'alive';
    r.frame();
    expect(r.card.showing, 'in play').toBe(false);
    r.player.status = 'calling';
    r.frame();
    expect(r.card.showing, 'calling the hit').toBe(false);
    for (const status of ['walkingOff', 'leaving', 'out'] as const) {
      r.player.status = status;
      r.frame();
      expect(r.card.showing, status).toBe(true);
    }
    r.frame({ held: true });
    expect(r.card.showing, 'scoreboard key held').toBe(false);
    r.frame();
    expect(r.card.showing).toBe(true);
    r.match.setPlaying(false);
    expect(r.card.showing, 'paused').toBe(false);
  });
});

describe('Pro briefing tips on the board', () => {
  it('tells the board a tip only against Pro, the one for the round, cycling through the list', () => {
    const r = rig();
    r.match.setProTips(true);
    r.state.round.phase = 'over';
    for (const n of [1, 2, 3, PRO_TIPS.length, PRO_TIPS.length + 1, PRO_TIPS.length + 2]) {
      // A live round between, as in play (the board is redrawn when it comes up again).
      r.state.round.phase = 'live';
      r.frame();
      r.state.round.number = n;
      r.state.round.phase = 'over';
      r.frame();
      expect(r.board.setTip, `round ${n}`).toHaveBeenLastCalledWith(proTip(n));
      expect(proTip(n)).toBe(PRO_TIPS[(n - 1) % PRO_TIPS.length]);
    }
    expect(proTip(1)).not.toBe(proTip(2));
  });

  it('tells it nothing against any other difficulty', () => {
    const r = rig();
    r.match.setProTips(false);
    r.state.round.phase = 'over';
    r.frame();
    expect(r.board.setTip).toHaveBeenCalled();
    for (const call of vi.mocked(r.board.setTip).mock.calls) expect(call[0]).toBe('');
  });
});

describe("the run's news is said and shown, not only written into the strip (M53, audit UI-02)", () => {
  const exit = (name: string, late: boolean) => ({ name, position: vec3(), radius: 2.5, late, closed: false, open: !late });

  function runRig(): Rig & { feedback: HitFeedbackClass } {
    const r = rig();
    r.state.round.run.exits.push(exit('Car park gate', false), exit('Staging yard gate', true), exit('North Gate road', true));
    return { ...r, feedback: vi.mocked(HitFeedback).mock.instances[0]! };
  }

  it('says a late exit opening once, through the polite region, and shows it on the banner for a moment', () => {
    const r = runRig();
    r.frame();
    event(r, { type: 'exitOpened', exit: 1 });
    expect(r.feedback.announce).toHaveBeenCalledTimes(1);
    expect(r.feedback.announce).toHaveBeenCalledWith('Staging yard gate is open');
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('Staging yard gate is open');
    // Ticks with no news say nothing more, and the banner lets it go after HUD.runNewsTime.
    r.match.afterTick(0);
    r.state.time += HUD.runNewsTime;
    r.frame();
    expect(r.feedback.announce).toHaveBeenCalledTimes(1);
    expect(r.feedback.setRoundMessage).not.toHaveBeenLastCalledWith('Staging yard gate is open');
  });

  it('names every exit that opened in the tick in one line, and says the minute left', () => {
    const r = runRig();
    r.state.events.push({ type: 'exitOpened', exit: 1 }, { type: 'exitOpened', exit: 2 });
    r.match.afterTick(0);
    r.state.events.length = 0;
    expect(r.feedback.announce).toHaveBeenCalledExactlyOnceWith('Staging yard gate and North Gate road are open');
    event(r, { type: 'runWarning', secondsLeft: 60 });
    expect(r.feedback.announce).toHaveBeenLastCalledWith('Under a minute left');
    expect(r.feedback.announce).toHaveBeenCalledTimes(2);
  });

  it('gives the banner to the respawn first: back in at the insertion is the news that is yours', () => {
    const r = runRig();
    event(r, { type: 'respawned', characterId: PLAYER, respawnsLeft: 0 });
    event(r, { type: 'runWarning', secondsLeft: 60 });
    r.frame();
    expect(r.feedback.announce).toHaveBeenCalledWith('Under a minute left');
    expect(r.feedback.setRoundMessage).not.toHaveBeenLastCalledWith('Under a minute left');
  });

  it('shows the news right up to HUD.runNewsTime and not past it (M53 QA)', () => {
    const r = runRig();
    r.frame();
    event(r, { type: 'exitOpened', exit: 1 });
    r.state.time += HUD.runNewsTime - 0.01;
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('Staging yard gate is open');
    r.state.time += 0.02;
    r.frame();
    expect(r.feedback.setRoundMessage).not.toHaveBeenLastCalledWith('Staging yard gate is open');
  });

  it('puts the later news on the banner when a second item comes inside the first one\'s moment, and says each once (M53 QA)', () => {
    const r = runRig();
    r.frame();
    event(r, { type: 'exitOpened', exit: 1 });
    r.state.time += 1;
    event(r, { type: 'runWarning', secondsLeft: 60 });
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('Under a minute left');
    // The new news holds for its own full moment from when it came.
    r.state.time += HUD.runNewsTime - 0.5;
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('Under a minute left');
    expect(r.feedback.announce).toHaveBeenCalledTimes(2);
  });

  it('puts an exit opening and the minute warning of one tick in one line and one announcement (M53 QA)', () => {
    const r = runRig();
    r.state.events.push({ type: 'runWarning', secondsLeft: 60 }, { type: 'exitOpened', exit: 2 });
    r.match.afterTick(0);
    r.state.events.length = 0;
    expect(r.feedback.announce).toHaveBeenCalledExactlyOnceWith('North Gate road is open · Under a minute left');
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('North Gate road is open · Under a minute left');
  });

  it('says nothing and shows nothing for an exit the run does not have, nor for a tick with no news (M53 QA)', () => {
    const r = runRig();
    r.frame();
    const shown = vi.mocked(r.feedback.setRoundMessage).mock.calls.length;
    event(r, { type: 'exitOpened', exit: 9 });
    r.match.afterTick(0);
    r.frame();
    expect(r.feedback.announce).not.toHaveBeenCalled();
    expect(vi.mocked(r.feedback.setRoundMessage).mock.calls.length).toBe(shown);
  });

  it('does not put the news over the round-over banner: it is said, but the result owns the banner (M53 QA)', () => {
    const r = runRig();
    r.frame();
    r.state.round.phase = 'over';
    event(r, { type: 'runWarning', secondsLeft: 60 });
    r.frame();
    expect(r.feedback.announce).toHaveBeenCalledWith('Under a minute left');
    expect(r.feedback.setRoundMessage).not.toHaveBeenLastCalledWith('Under a minute left');
  });

  it('lets a respawn that comes after the news take the banner, and hands it to the round banner once both lapse (M53 QA)', () => {
    // roundBanner is auto-mocked here: give each banner words of its own so which one is up can be told.
    vi.mocked(banners.respawnBanner).mockReturnValue('BACK IN');
    vi.mocked(banners.roundBanner).mockReturnValue('ROUND');
    const r = runRig();
    r.frame();
    event(r, { type: 'runWarning', secondsLeft: 60 });
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('Under a minute left');
    r.state.time += 1;
    event(r, { type: 'respawned', characterId: PLAYER, respawnsLeft: 0 });
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('BACK IN');
    r.state.time += HUD.respawnMessageTime + 0.1;
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('ROUND');
  });

  it('keeps the respawn banner over news that comes while it is up, and shows the news after it if the news still has time (M53 QA)', () => {
    vi.mocked(banners.respawnBanner).mockReturnValue('BACK IN');
    vi.mocked(banners.roundBanner).mockReturnValue('ROUND');
    const r = runRig();
    r.frame();
    event(r, { type: 'respawned', characterId: PLAYER, respawnsLeft: 0 });
    r.state.time += 1;
    event(r, { type: 'exitOpened', exit: 1 });
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('BACK IN');
    // The respawn lapses first (it came first); the news, 1 s younger, still has its time.
    r.state.time += HUD.respawnMessageTime - 1 + 0.05;
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('Staging yard gate is open');
    r.state.time += 1;
    r.frame();
    expect(r.feedback.setRoundMessage).toHaveBeenLastCalledWith('ROUND');
  });
});
