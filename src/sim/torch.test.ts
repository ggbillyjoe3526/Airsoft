import { describe, expect, it } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { fitParts } from './armament';
import { type Character, createCharacter, respawnCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { eliminate } from './elimination';
import type { GameEvent } from './events';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV, openFieldElimination } from './testSupport';
import { lightInHand, stepTorch, torchLit } from './torch';
import { vec3 } from './vec';

const DT = 1 / 60;
const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]];

/** A rifleman with a torch on the rifle only (slot 0), or on nothing. */
function rifleman(torch = true): Character {
  const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
  if (torch) fitParts(c.armament, c.armament.parts.map((p, i) => (i === 0 ? { ...p, light: 'weaponTorch' as const } : p)));
  return c;
}

const toggle = (): PlayerCommand => ({ ...createCommand(), toggleTorch: true });

describe('the weapon torch in the simulation (M33h)', () => {
  it('is off at spawn, and the toggle switches it with a click event each way', () => {
    const c = rifleman();
    const events: GameEvent[] = [];
    expect(c.torchOn).toBe(false);
    expect(lightInHand(c)).toBe('weaponTorch');
    stepTorch(c, toggle(), events, DT);
    expect(c.torchOn).toBe(true);
    expect(torchLit(c)).toBe(true);
    expect(events).toEqual([{ type: 'torch', characterId: 0, on: true }]);
    stepTorch(c, createCommand(), events, DT); // no toggle: no change, no event
    expect(c.torchOn).toBe(true);
    stepTorch(c, toggle(), events, DT);
    expect(c.torchOn).toBe(false);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'torch', characterId: 0, on: false });
  });

  it('does nothing without a light on the replica in hand (Dev content off: nobody has one)', () => {
    const c = rifleman(false);
    const events: GameEvent[] = [];
    stepTorch(c, toggle(), events, DT);
    expect(c.torchOn).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('times how long a state is held, from the last switch', () => {
    const c = rifleman();
    const events: GameEvent[] = [];
    for (let i = 0; i < 30; i++) stepTorch(c, createCommand(), events, DT);
    expect(c.torchTime).toBeCloseTo(0.5, 9);
    stepTorch(c, toggle(), events, DT);
    expect(c.torchTime).toBe(0);
  });

  it('goes out on switching to a replica without a light, and when hit; respawn leaves it off', () => {
    const c = rifleman();
    const events: GameEvent[] = [];
    stepTorch(c, toggle(), events, DT);
    c.armament.active = 1; // the pistol: no light
    expect(torchLit(c)).toBe(false);
    stepTorch(c, createCommand(), events, DT);
    expect(c.torchOn).toBe(false);

    c.armament.active = 0;
    stepTorch(c, toggle(), events, DT);
    expect(c.torchOn).toBe(true);
    const other = createCharacter(1, vec3(5, 0, 0), 0, LOADOUT, 1);
    eliminate(c, 1, [c, other], openFieldElimination(DEAD_ZONES));
    expect(c.torchOn).toBe(false);
    expect(torchLit(c)).toBe(false);

    c.torchOn = true;
    c.torchTime = 9;
    respawnCharacter(c);
    expect(c.torchOn).toBe(false);
    expect(c.torchTime).toBe(0);
  });

  it('is switched by the command in a simulation tick, like any other control', () => {
    const floor: CharacterMover = {
      move(ch, d, out) {
        out.x = d.x;
        out.z = d.z;
        out.y = ch.position.y + d.y <= 0 ? -ch.position.y : d.y;
        return ch.position.y + d.y <= 0;
      },
      probeGround: (ch, maxDrop) => (ch.position.y <= maxDrop ? -ch.position.y : Number.NaN),
    };
    const ctx = createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
    const state = createGameState(1, 16, ROUNDS);
    const c = rifleman();
    state.characters.push(c);
    stepSimulation(state, new Map([[0, toggle()]]), ctx, DT);
    expect(c.torchOn).toBe(true);
    expect(state.events).toContainEqual({ type: 'torch', characterId: 0, on: true });
    stepSimulation(state, new Map([[0, createCommand()]]), ctx, DT);
    expect(c.torchOn).toBe(true);
    expect(state.events.some((e) => e.type === 'torch')).toBe(false);
  });
});
