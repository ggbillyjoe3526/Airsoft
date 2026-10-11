import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { createCharacter, eyeHeight } from './character';
import { createCommand } from './commands';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV } from './testSupport';
import { vec3 } from './vec';

/**
 * M85 (the owner's Dev 4 playtest note 17): "when I hit one nearest me and keep shooting, if there is another bot behind
 * them, the BB seems to go through the first bot's body". The reproduction: two bots in a line, full auto at the nearer.
 */
const DT = 1 / 60;
const DEAD_ZONES = [[{ position: vec3(-30, 0, 30), yaw: 0 }], [{ position: vec3(30, 0, 30), yaw: 0 }]];
const floor: CharacterMover = {
  move(c, d, out) {
    out.x = d.x;
    out.z = d.z;
    const y = c.position.y + d.y;
    out.y = y <= 0 ? -c.position.y : d.y;
    return y <= 0;
  },
  probeGround(c, maxDrop) {
    return c.position.y <= maxDrop ? -c.position.y : Number.NaN;
  },
};

/** You (team 0) at the origin, full auto at chest height on a bot 6 m out, with a second bot 6 m behind it on the line. */
function twoInALine(seed: number, near = 6, far = 12) {
  const state = createGameState(seed, 64, ROUNDS);
  const you = createCharacter(0, vec3(), 0, LOADOUT, 0);
  const nearer = createCharacter(1, vec3(0, 0, -near), 0, LOADOUT, 1);
  const behind = createCharacter(2, vec3(0, 0, -far), 0, LOADOUT, 1);
  // Keeps the round live whoever is hit (the round's end is a cease-fire: BBs in flight then hit nobody).
  const spare = createCharacter(3, vec3(50, 0, -50), 0, LOADOUT, 1);
  state.characters.push(you, nearer, behind, spare);
  const ctx = createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
  const fire = createCommand();
  fire.fire = true;
  // Aimed at the nearer bot's chest (1.2 m up), from the eye.
  fire.pitch = -Math.atan2(eyeHeight(0, BODY) - 1.2, near);
  return { state, ctx, you, nearer, behind, commands: new Map([[0, fire]]) };
}

describe('BBs stop at the first body they hit (M85)', () => {
  it('a stream of full-auto BBs at the nearer of two bots in a line never reaches the one behind', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, ctx, nearer, behind, commands } = twoInALine(seed);
      let shots = 0;
      let hits = 0;
      for (let i = 0; i < 90; i++) {
        stepSimulation(state, commands, ctx, DT);
        for (const e of state.events) {
          if (e.type === 'shot') shots++;
          else if (e.type === 'characterHit') hits++;
        }
      }
      // A second of fire: the first BB knocks the nearer bot out, the rest hit its body as it calls the hit.
      expect(shots, `seed ${seed}`).toBeGreaterThan(10);
      expect(nearer.status, `seed ${seed}`).not.toBe('alive');
      expect(behind.status, `seed ${seed}: the bot behind was hit through the first`).toBe('alive');
      expect(hits, `seed ${seed}`).toBe(1);
    }
  });
});
