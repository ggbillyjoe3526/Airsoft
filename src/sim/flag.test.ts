import { describe, expect, it } from 'vitest';
import { FLAG, type FlagRules } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { createFlagState, type FlagState, resetFlag, stepFlag } from './flag';
import { vec3 } from './vec';

const DT = 1 / 60;
const RULES: FlagRules = { ...FLAG, raiseTime: 6, lowerTime: 3, radius: 1.6, ropeStep: 0.25 };
const POLE = vec3(10, 0, 0);

/** Blue attacker and Orange defender, both well away from the pole. */
function setup(): { flag: FlagState; attacker: Character; defender: Character; cs: Character[]; events: GameEvent[] } {
  const flag = createFlagState();
  resetFlag(flag, POLE);
  const attacker = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const defender = createCharacter(1, vec3(20, 0, 0), 0, LOADOUT, 1);
  return { flag, attacker, defender, cs: [attacker, defender], events: [] };
}

function run(seconds: number, s: ReturnType<typeof setup>): boolean {
  let raised = false;
  for (let i = 0; i < Math.round(seconds / DT); i++) raised = stepFlag(s.flag, s.cs, 0, RULES, s.events, DT) || raised;
  return raised;
}

describe('the flag', () => {
  it('goes up while an attacker stands at the pole, and is raised after raiseTime', () => {
    const s = setup();
    s.attacker.position.x = POLE.x + 1.5; // within reach
    expect(run(RULES.raiseTime / 2, s)).toBe(false);
    expect(s.flag.status).toBe('raising');
    expect(s.flag.progress).toBeCloseTo(0.5, 2);
    expect(run(RULES.raiseTime / 2 + DT, s)).toBe(true);
    expect(s.flag.progress).toBe(1);
  });

  it('stays where it is with nobody at the pole, and an attacker just out of reach does nothing', () => {
    const s = setup();
    s.attacker.position.x = POLE.x;
    run(1.5, s);
    s.attacker.position.x = POLE.x + RULES.radius + 0.05;
    run(5, s);
    expect(s.flag.status).toBe('idle');
    expect(s.flag.progress).toBeCloseTo(0.25, 2);
  });

  it('comes down while a defender stands at the pole, quicker than it went up, and stops at the bottom', () => {
    const s = setup();
    s.flag.progress = 0.5;
    s.defender.position.x = POLE.x - 1;
    run(RULES.lowerTime / 4, s);
    expect(s.flag.status).toBe('lowering');
    expect(s.flag.progress).toBeCloseTo(0.25, 2);
    run(RULES.lowerTime, s);
    expect(s.flag.progress).toBe(0);
    expect(s.flag.status).toBe('idle'); // nothing left to pull down
  });

  it('holds still when both teams are at the pole', () => {
    const s = setup();
    s.flag.progress = 0.4;
    s.attacker.position.x = POLE.x + 1;
    s.defender.position.x = POLE.x - 1;
    run(2, s);
    expect(s.flag.status).toBe('contested');
    expect(s.flag.progress).toBeCloseTo(0.4, 6);
  });

  it('ignores players who are out of play (calling a hit, walking off)', () => {
    const s = setup();
    s.attacker.position.x = POLE.x;
    s.attacker.status = 'calling';
    s.flag.progress = 0.4;
    s.defender.position.x = POLE.x;
    run(1, s);
    expect(s.flag.status).toBe('lowering'); // the hit attacker no longer holds the rope
    s.defender.status = 'walkingOff';
    const p = s.flag.progress;
    run(1, s);
    expect(s.flag.status).toBe('idle');
    expect(s.flag.progress).toBe(p);
  });

  it('ratchets the rope once per rope step, up and down', () => {
    const s = setup();
    s.attacker.position.x = POLE.x;
    run(RULES.raiseTime * 0.6, s);
    const up = s.events.filter((e) => e.type === 'flagRope');
    expect(up.length).toBe(2); // passed 0.25 and 0.5
    expect(up.every((e) => e.type === 'flagRope' && e.raising)).toBe(true);
    s.events.length = 0;
    s.attacker.position.x = 0;
    s.defender.position.x = POLE.x;
    run(RULES.lowerTime, s);
    const down = s.events.filter((e) => e.type === 'flagRope');
    expect(down.length).toBe(2); // 0.6 → 0: passed 0.5 and 0.25
    expect(down.every((e) => e.type === 'flagRope' && !e.raising)).toBe(true);
  });
});
