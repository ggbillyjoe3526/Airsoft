import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { fitParts } from './armament';
import { type Character, createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { eliminate, isInPlay } from './elimination';
import type { CharacterMover } from './movement';
import { placeTeams } from './round';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState, type GameState } from './state';
import { OPEN_NAV, openFieldElimination } from './testSupport';
import { torchLit } from './torch';
import { vec3 } from './vec';

/**
 * M33h QA, acceptance 2, through the simulation's own round flow (the existing tests call respawnCharacter and
 * eliminate directly): a torch left on is off when the next round starts, and a hit player pressing T stays dark.
 */

const DT = 1 / 60;
const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]];
const SPAWNS = [[{ position: vec3(-10, 0, 0), yaw: 0 }], [{ position: vec3(10, 0, 0), yaw: 0 }]];
const floor: CharacterMover = {
  move(ch, d, out) {
    out.x = d.x;
    out.z = d.z;
    out.y = ch.position.y + d.y <= 0 ? -ch.position.y : d.y;
    return ch.position.y + d.y <= 0;
  },
  probeGround: (ch, maxDrop) => (ch.position.y <= maxDrop ? -ch.position.y : Number.NaN),
};
const ctx = createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, spawns: SPAWNS, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });

function torchBearer(id: number, team: number): Character {
  const c = createCharacter(id, vec3(), 0, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  return c;
}

/** A 1v1 ready for round 1, everyone with a torch on every replica. */
function duel(): { state: GameState; you: Character; them: Character } {
  const state = createGameState(1, 16, ROUNDS);
  const you = torchBearer(0, 0);
  const them = torchBearer(1, 1);
  state.characters.push(you, them);
  placeTeams(state.round, state.characters, ctx.round);
  return { state, you, them };
}

const toggle = (): PlayerCommand => ({ ...createCommand(), toggleTorch: true });
const step = (state: GameState, cmds: [number, PlayerCommand][]): void => stepSimulation(state, new Map(cmds), ctx, DT);

describe('the weapon torch across a round (M33h acceptance 2)', () => {
  it('is off when the next round starts, though left on through the round end', () => {
    const { state, you, them } = duel();
    step(state, [[0, toggle()], [1, toggle()]]);
    expect(you.torchOn && them.torchOn).toBe(true);
    eliminate(them, you.id, state.characters, openFieldElimination(DEAD_ZONES));
    let started = false;
    for (let i = 0; i < 60 * 60 && !started; i++) {
      step(state, [[0, createCommand()]]);
      started = state.events.some((e) => e.type === 'roundStart');
      // Through the round's end and the pause after it, your torch stays as you left it.
      if (!started) expect(you.torchOn).toBe(true);
    }
    expect(started).toBe(true);
    expect(state.round.number).toBe(2);
    expect(you.torchOn).toBe(false);
    expect(them.torchOn).toBe(false);
    // Off silently (no click), and T switches it on again in the new round.
    expect(state.events.some((e) => e.type === 'torch')).toBe(false);
    step(state, [[0, toggle()]]);
    expect(torchLit(you)).toBe(true);
  });

  it('stays dark while you are hit, however often T is pressed', () => {
    const { state, you, them } = duel();
    step(state, [[0, toggle()]]);
    expect(torchLit(you)).toBe(true);
    eliminate(you, them.id, state.characters, openFieldElimination(DEAD_ZONES));
    expect(you.torchOn).toBe(false);
    for (let i = 0; i < 120 && !isInPlay(you); i++) {
      step(state, [[0, toggle()]]);
      expect(you.torchOn).toBe(false);
      expect(state.events.some((e) => e.type === 'torch')).toBe(false);
    }
  });

  it('goes out with a switch to a replica without a light and stays out on switching back', () => {
    const { state, you } = duel();
    fitParts(you.armament, you.armament.parts.map((p, i) => (i === 0 ? p : { ...p, light: null })));
    step(state, [[0, toggle()]]);
    expect(torchLit(you)).toBe(true);
    step(state, [[0, { ...createCommand(), switchTo: 1 }]]);
    for (let i = 0; i < 90 && you.armament.active !== 1; i++) step(state, [[0, createCommand()]]);
    expect(you.armament.active).toBe(1);
    expect(you.torchOn).toBe(false);
    step(state, [[0, { ...createCommand(), switchTo: 0 }]]);
    for (let i = 0; i < 90 && you.armament.active !== 0; i++) step(state, [[0, createCommand()]]);
    expect(you.armament.active).toBe(0);
    expect(you.torchOn).toBe(false);
  });
});
