import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, HOLSTER, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { fitParts } from './armament';
import { createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { fillEliminatedCommand } from './elimination';
import type { GameEvent } from './events';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV } from './testSupport';
import { lightInHand, torchLit } from './torch';
import { vec3 } from './vec';

/**
 * M92 (acceptance 2): the holster in the simulation. Driven through stepSimulation, the same path a player and a bot take.
 */

const DT = 1 / 60;
const RIFLE = 0;
const PISTOL = 1;

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

const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]];

/** One character on an open floor in a live round. `act` fills this tick's command (a fresh one each tick). */
function world() {
  const ctx = createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
  const state = createGameState(3, BALLISTICS.maxBBs, ROUNDS);
  state.round.phase = 'live';
  const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
  state.characters.push(c);
  const events: GameEvent[] = [];
  const tick = (act: (cmd: PlayerCommand) => void = () => {}): GameEvent[] => {
    const cmd = createCommand();
    act(cmd);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    events.push(...state.events);
    return state.events;
  };
  const run = (n: number, act?: (cmd: PlayerCommand) => void): void => {
    for (let i = 0; i < n; i++) tick(act);
  };
  const shots = (): number => events.filter((e) => e.type === 'shot').length;
  return { state, c, a: c.armament, tick, run, events, shots };
}

const horizontal = (c: { velocity: { x: number; z: number } }): number => Math.hypot(c.velocity.x, c.velocity.z);
const handling = (slot: number) => createCharacter(0, vec3(), 0, LOADOUT, 0).armament.handling[slot]!;

describe('the holster command (acceptance 2: no shot and no aim while it is away)', () => {
  it('puts the replica away at once: nothing fires with the trigger held, nothing is aimed', () => {
    const w = world();
    w.run(30);
    w.tick((k) => {
      k.holster = true;
      k.fire = true;
      k.aim = true;
    });
    expect(w.a.holstered).toBe(true);
    const before = w.shots();
    w.run(60, (k) => {
      k.fire = true;
      k.aim = true;
    });
    expect(w.shots()).toBe(before);
    expect(w.c.aiming).toBe(false);
    expect(w.a.holstered).toBe(true); // a trigger and aim held as it went away do not draw it
    expect(w.a.draw).toBe(0);
  });

  it('a trigger held as the replica went away does not draw it: it must be let go and pulled again', () => {
    const w = world();
    w.run(5);
    w.tick((k) => {
      k.holster = true;
      k.fire = true;
    });
    w.run(30, (k) => (k.fire = true));
    expect(w.a.holstered).toBe(true);
    expect(w.shots()).toBe(0);
    w.tick(); // let go
    expect(w.a.holstered).toBe(true);
    w.tick((k) => (k.fire = true)); // pulled again
    expect(w.a.holstered).toBe(false);
    expect(w.a.draw).toBeGreaterThan(0);
  });

  it('an aim button held as the replica went away does not draw it, a fresh aim press does and the sight stays down during the draw', () => {
    const w = world();
    w.tick((k) => {
      k.holster = true;
      k.aim = true;
    });
    w.run(20, (k) => (k.aim = true));
    expect(w.a.holstered).toBe(true);
    expect(w.c.aiming).toBe(false);
    w.tick();
    w.tick((k) => (k.aim = true));
    expect(w.a.holstered).toBe(false);
    for (let i = 0; i < 10; i++) {
      w.tick((k) => (k.aim = true));
      expect(w.c.aiming, 'during the draw').toBe(false);
    }
    w.run(Math.ceil(w.a.drawTotal / DT) + 5, (k) => (k.aim = true));
    expect(w.c.aiming).toBe(true);
  });

  it('a reload press draws it too, and the reload starts once it is up', () => {
    const w = world();
    w.a.ammo[RIFLE]!.mag = 10;
    w.tick((k) => (k.holster = true));
    w.tick((k) => (k.reload = true));
    expect(w.a.holstered).toBe(false);
    expect(w.a.draw).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'reloadStart')).toBe(false);
    w.run(Math.ceil(w.a.drawTotal / DT) + 10);
    expect(w.events.some((e) => e.type === 'reloadStart')).toBe(true);
  });

  it('putting it away cancels a reload under way', () => {
    const w = world();
    w.a.ammo[RIFLE]!.mag = 10;
    w.tick((k) => (k.reload = true));
    w.run(5);
    expect(w.a.reload).toBeGreaterThan(0);
    w.tick((k) => (k.holster = true));
    expect(w.a.reload).toBe(0);
    w.run(Math.ceil(handling(RIFLE).reloadTime / DT) + 10);
    expect(w.events.some((e) => e.type === 'reloadEnd')).toBe(false);
    expect(w.a.ammo[RIFLE]!.mag).toBe(10);
  });

  it('putting it away cancels a draw under way', () => {
    const w = world();
    w.tick((k) => (k.switchTo = PISTOL));
    expect(w.a.draw).toBeGreaterThan(0);
    w.tick((k) => (k.holster = true));
    expect(w.a.draw).toBe(0);
    expect(w.a.holstered).toBe(true);
  });
});

describe('the draw from the holster (acceptance 2: it takes longer, with a draw animation)', () => {
  for (const slot of [RIFLE, PISTOL]) {
    it(`${LOADOUT[slot]!.id}: a fresh trigger pull draws for drawTime x HOLSTER.drawScale (drawTotal), longer than a switch`, () => {
      const w = world();
      if (slot !== RIFLE) {
        w.tick((k) => (k.switchTo = slot));
        w.run(Math.ceil(handling(slot).drawTime / DT) + 2);
      }
      w.tick((k) => (k.holster = true));
      w.tick();
      w.tick((k) => (k.fire = true));
      const want = handling(slot).drawTime * HOLSTER.drawScale;
      expect(w.a.drawTotal).toBeCloseTo(want, 9);
      expect(w.a.draw).toBeGreaterThan(want - 2 * DT);
      expect(w.a.draw).toBeLessThanOrEqual(want);
      expect(want).toBeGreaterThan(handling(slot).drawTime);
      // No shot until the draw is over, then the held trigger fires.
      let before = -1;
      while (w.a.draw > 0 && before < 200) {
        before++;
        expect(w.shots()).toBe(0);
        w.tick((k) => (k.fire = true));
      }
      w.run(20, (k) => (k.fire = true));
      w.tick(); // a semi-auto pistol needs a new pull once the press buffer has run out
      w.run(20, (k) => (k.fire = true));
      expect(w.shots()).toBeGreaterThan(0);
    });
  }

  it('a slot in the command while holstered draws that slot: slot 0 after the pistol was put away draws the rifle', () => {
    const w = world();
    w.tick((k) => (k.switchTo = PISTOL));
    w.run(60);
    expect(w.a.active).toBe(PISTOL);
    w.tick((k) => (k.holster = true));
    expect(w.a.active).toBe(PISTOL);
    w.tick((k) => (k.switchTo = RIFLE));
    expect(w.a.holstered).toBe(false);
    expect(w.a.active).toBe(RIFLE);
    expect(w.a.drawTotal).toBeCloseTo(handling(RIFLE).drawTime * HOLSTER.drawScale, 9);
  });

  it('the slot put away draws it too, and the other slot draws the other replica', () => {
    const w = world();
    w.tick((k) => (k.holster = true));
    w.tick((k) => (k.switchTo = RIFLE));
    expect(w.a.holstered).toBe(false);
    expect(w.a.active).toBe(RIFLE);
    w.tick((k) => (k.holster = true));
    w.tick((k) => (k.switchTo = PISTOL));
    expect(w.a.active).toBe(PISTOL);
    expect(w.a.drawTotal).toBeCloseTo(handling(PISTOL).drawTime * HOLSTER.drawScale, 9);
  });

  it('a plain switch still takes the replica\'s own draw time', () => {
    const w = world();
    w.tick((k) => (k.switchTo = PISTOL));
    expect(w.a.drawTotal).toBeCloseTo(handling(PISTOL).drawTime, 9);
  });

  for (const slot of [RIFLE, PISTOL]) {
    it(`${LOADOUT[slot]!.id}: the first shot after holstered sprinting comes later than after a ready sprint`, () => {
      /** Ticks from the end of a sprint (sprint key let go, trigger down) to the first shot. */
      const firstShot = (holster: boolean): number => {
        const w = world();
        if (slot !== RIFLE) {
          w.tick((k) => (k.switchTo = slot));
          w.run(60);
        }
        if (holster) w.tick((k) => (k.holster = true));
        w.run(40, (k) => {
          k.forward = 1;
          k.sprint = true;
        });
        expect(w.c.sprinting).toBe(true);
        // The trigger is let go while sprinting, pulled as the sprint ends.
        for (let n = 1; n < 400; n++) {
          w.tick((k) => (k.fire = true));
          if (w.shots() > 0) return n;
        }
        return Infinity;
      };
      const ready = firstShot(false);
      const holstered = firstShot(true);
      // Ready, it fires at once (there is no lockout after a sprint since the owner's 0.1 Dev 5 note 9).
      expect(ready).toBeLessThanOrEqual(2);
      expect(holstered).toBeGreaterThan(ready);
      expect(holstered * DT).toBeGreaterThanOrEqual(handling(slot).drawTime * HOLSTER.drawScale - 2 * DT);
    });
  }
});

describe('moving holstered (Dev 6 note 27: faster than armed, never past the sprint)', () => {
  it('the holstered run sits between the armed run and the sprint', () => {
    expect(MOVEMENT.holsterRunSpeed).toBeGreaterThan(MOVEMENT.runSpeed);
    expect(MOVEMENT.holsterRunSpeed).toBeLessThan(MOVEMENT.sprintSpeed);
  });

  it('a character runs at holsterRunSpeed only while the replica is away, and back at runSpeed once drawn', () => {
    const w = world();
    w.run(60, (k) => (k.forward = 1));
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.runSpeed, 3);
    w.tick((k) => {
      k.forward = 1;
      k.holster = true;
    });
    w.run(60, (k) => (k.forward = 1));
    expect(w.c.sprinting).toBe(false);
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.holsterRunSpeed, 3);
    w.tick((k) => {
      k.forward = 1;
      k.switchTo = RIFLE;
    });
    w.run(60, (k) => (k.forward = 1));
    expect(w.a.holstered).toBe(false);
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.runSpeed, 3);
  });

  it('a holstered sprint is the same sprint: holstering never stacks on it', () => {
    const w = world();
    w.run(60, (k) => {
      k.forward = 1;
      k.sprint = true;
    });
    expect(w.c.sprinting).toBe(true);
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
    w.tick((k) => {
      k.forward = 1;
      k.sprint = true;
      k.holster = true;
    });
    w.run(60, (k) => {
      k.forward = 1;
      k.sprint = true;
    });
    expect(w.a.holstered).toBe(true);
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
  });

  it('walking and crouching are not faster for being holstered', () => {
    const w = world();
    w.tick((k) => (k.holster = true));
    w.run(60, (k) => {
      k.forward = 1;
      k.walk = true;
    });
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
    w.run(60, (k) => {
      k.forward = 1;
      k.crouch = true;
    });
    expect(horizontal(w.c)).toBeCloseTo(MOVEMENT.crouchSpeed, 3);
  });
});

describe('what else the holster touches', () => {
  it('the weapon torch goes out of hand while holstered, and comes back with the draw', () => {
    const w = world();
    fitParts(w.a, w.a.parts.map((p, i) => (i === RIFLE ? { ...p, light: 'weaponTorch' as const } : p)));
    w.tick((k) => (k.toggleTorch = true));
    expect(torchLit(w.c)).toBe(true);
    expect(lightInHand(w.c)).toBe('weaponTorch');
    w.tick((k) => (k.holster = true));
    expect(lightInHand(w.c)).toBeNull();
    expect(torchLit(w.c)).toBe(false);
    w.tick((k) => (k.switchTo = RIFLE));
    expect(lightInHand(w.c)).toBe('weaponTorch');
  });

  it('someone who is out is given no holster command', () => {
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const cmd = createCommand();
    cmd.holster = true;
    fillEliminatedCommand(c, HITS, cmd);
    expect(cmd.holster).toBe(false);
  });
});
