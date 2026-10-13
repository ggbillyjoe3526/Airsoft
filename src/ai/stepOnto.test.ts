import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR } from '../config/bots';
import { MOVEMENT } from '../config/movement';
import { createCommand } from '../sim/commands';
import { OPEN_NAV } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import type { Bot, BotWorld } from './bot';
import { stepOnto } from './routes';

/**
 * M102: the last centimetres onto a lean spot or a guard post. A bot lets go short of the spot and coasts onto it
 * (BOT_BEHAVIOUR.leanSpotReach, 0.03 m), and counts as there only once it is slower than stuckSpeed.
 */

const cfg = BOT_BEHAVIOUR;
const w = { cfg, nav: OPEN_NAV } as unknown as BotWorld;
const SPOT = vec3(0, 0, 0);
const DT = 1 / 60;

/** A bot `back` metres short of the spot on the x axis (so it walks +x), moving at `speed` along +x. */
function botAt(back: number, speed: number): Bot {
  return { character: { position: vec3(-back, 0, 0), velocity: vec3(speed, 0, 0) }, moveDir: { x: 0, z: 0 }, stuckFor: 0 } as unknown as Bot;
}

describe('stepOnto (the last centimetres onto a spot)', () => {
  it('uses the tight reach the task set: 3 cm, not the old 10', () => {
    expect(cfg.leanSpotReach).toBe(0.03);
  });

  it('coasts onto the spot at walking speed: no push once its rest point is within reach, and still counts as stepping', () => {
    const speed = MOVEMENT.walkSpeed;
    const coast = speed / (2 * MOVEMENT.groundDecel);
    const b = botAt(coast + 0.01, speed);
    const cmd = createCommand();
    expect(stepOnto(b, w, SPOT, cmd, DT)).toBe(true);
    expect(b.moveDir.x).toBe(0);
    expect(b.moveDir.z).toBe(0);
    expect(cmd.walk).toBe(true);
  });

  it('is there (false) once at rest within reach, so the lean is chosen from where it stands', () => {
    const b = botAt(0.02, 0);
    expect(stepOnto(b, w, SPOT, createCommand(), DT)).toBe(false);
  });

  it('still steps at a spot 5 cm off when at rest (more than the 3 cm reach), straight at it', () => {
    const b = botAt(0.05, 0);
    const cmd = createCommand();
    expect(stepOnto(b, w, SPOT, cmd, DT)).toBe(true);
    expect(b.moveDir.x).toBeCloseTo(1, 6);
    expect(b.moveDir.z).toBeCloseTo(0, 6);
    expect(cmd.walk).toBe(true);
  });

  it('steps towards a spot further off, even while moving towards it', () => {
    const b = botAt(0.5, MOVEMENT.walkSpeed);
    expect(stepOnto(b, w, SPOT, createCommand(), DT)).toBe(true);
    expect(b.moveDir.x).toBeCloseTo(1, 6);
  });

  it('does not count a spot beyond leanSpotApproachMax', () => {
    const b = botAt(cfg.leanSpotApproachMax + 0.2, 0);
    expect(stepOnto(b, w, SPOT, createCommand(), DT)).toBe(false);
    expect(b.moveDir.x).toBe(0);
  });

  it('gives up once blocked for stuckTime (at rest, not reaching the spot)', () => {
    const b = botAt(0.3, 0);
    let steps = 0;
    for (let t = 0; t < cfg.stuckTime + 0.5 && stepOnto(b, w, SPOT, createCommand(), DT); t += DT) steps++;
    expect(steps).toBeGreaterThan(0);
    expect(stepOnto(b, w, SPOT, createCommand(), DT)).toBe(false);
  });
});
