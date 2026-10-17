import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { HUD } from '../config/render';
import { SKIP_ROUND } from '../config/sim';
import { skipTickCap } from '../matchFlow';
import { createCharacter } from './character';
import { createCommand } from './commands';
import { eliminate } from './elimination';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV, openFieldElimination } from './testSupport';
import type { RoundRules } from './round';
import { vec3 } from './vec';

const DT = 1 / 60;
const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 1.2 }]];
const floor: CharacterMover = {
  move(c, d, out) {
    out.x = d.x;
    out.z = d.z;
    const y = c.position.y + d.y;
    out.y = y <= 0 ? -c.position.y : d.y;
    return y <= 0;
  },
  probeGround: (c, maxDrop) => (c.position.y <= maxDrop ? -c.position.y : Number.NaN),
};

describe('the pause after a round (RE1)', () => {
  it('is a cease-fire for the whole of the longer wait, and the next round starts only after ROUNDS.resetDelay', () => {
    const state = createGameState(1, 16, ROUNDS);
    state.characters.push(createCharacter(0, vec3(), 0, LOADOUT, 0), createCharacter(1, vec3(40, 0, 0), 0, LOADOUT, 1));
    const ctx = createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
    eliminate(state.characters[1]!, 0, state.characters, openFieldElimination(DEAD_ZONES));
    stepSimulation(state, new Map(), ctx, DT);
    expect(state.round.phase).toBe('over');
    const fire = createCommand();
    fire.fire = true;
    let shots = 0;
    let startedAt = -1;
    for (let i = 1; i < (ROUNDS.resetDelay + 1) / DT && startedAt < 0; i++) {
      stepSimulation(state, new Map([[0, fire]]), ctx, DT);
      shots += state.events.filter((e) => e.type === 'shot').length;
      if (state.events.some((e) => e.type === 'roundStart')) startedAt = i * DT;
    }
    expect(shots).toBe(0);
    expect(startedAt).toBeGreaterThan(ROUNDS.resetDelay - 0.2);
    expect(startedAt).toBeLessThan(ROUNDS.resetDelay + 0.2);
  });

  it('leaves room for the stamp, the table and your own hit call inside the wait, and a skip cap that outlasts it', () => {
    // Your hit call (HITS.callTime) can delay the stamp; the table must still get a real hold afterwards.
    expect(HITS.callTime + HUD.roundResultTime).toBeLessThan(ROUNDS.resetDelay - 2);
    expect(skipTickCap(ROUNDS as unknown as RoundRules) * DT).toBeGreaterThan(ROUNDS.roundTime + ROUNDS.resetDelay + SKIP_ROUND.spareSeconds - 1);
  });
});
