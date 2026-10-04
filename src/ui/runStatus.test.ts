import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { createRunState, type RunExit, type RunState } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { respawnNote, runLine } from './runStatus';

const RULES = EXTRACTION;

function exit(name: string, patch: Partial<RunExit> = {}): RunExit {
  return { name, position: vec3(), radius: 2, late: false, closed: false, open: true, ...patch };
}

function run(patch: Partial<RunState>): RunState {
  return Object.assign(createRunState(), patch);
}

describe('the Extraction strip (M43 acceptance 5)', () => {
  it('counts you out by the whole seconds left, rounding up, never showing 0 while the count runs', () => {
    const at = (count: number) => runLine(run({ exits: [exit('East gate')], countStatus: 'counting', count }), 200, RULES);
    expect(at(0)).toEqual({ text: 'Counting you out · 10', progress: 0, urgent: false });
    expect(at(0.5).text).toBe('Counting you out · 10');
    expect(at(3.2).text).toBe('Counting you out · 7');
    expect(at(5)).toEqual({ text: 'Counting you out · 5', progress: 0.5, urgent: false });
    expect(at(RULES.extractTime - 0.01).text).toBe('Counting you out · 1');
  });

  it('says why the count stopped when an opponent is in the exit, and warns', () => {
    const line = runLine(run({ exits: [exit('East gate')], countStatus: 'paused', count: 4 }), 200, RULES);
    expect(line.text).toBe('Count paused · someone from the home team is in the exit');
    expect(line.progress).toBeCloseTo(0.4);
    expect(line.urgent).toBe(true);
  });

  it('lists the open exits (singular or plural) and leaves out the closed and the late shut ones', () => {
    const one = runLine(run({ exits: [exit('West gate', { closed: true, open: false }), exit('East gate')] }), 200, RULES);
    expect(one).toEqual({ text: 'Exit: East gate', progress: 0, urgent: false });
    const two = runLine(run({ exits: [exit('East gate'), exit('North gate')] }), 200, RULES);
    expect(two.text).toBe('Exits: East gate, North gate');
  });

  it('notes the late exit and when it opens, until it does (or when it is closed for the run)', () => {
    const exits = [exit('East gate'), exit('Dock', { late: true, open: false })];
    expect(runLine(run({ exits }), 200, RULES).text).toBe('Exit: East gate · Dock opens at 3:00');
    // Open now: listed as an exit, no note.
    expect(runLine(run({ exits: [exit('East gate'), exit('Dock', { late: true, open: true })] }), 170, RULES).text).toBe('Exits: East gate, Dock');
    // Closed for this run (too near the insertion): never promised.
    expect(runLine(run({ exits: [exit('East gate'), exit('Dock', { late: true, closed: true, open: false })] }), 200, RULES).text).toBe('Exit: East gate');
  });

  it('says no exit is open yet, with the late note and no warning before the last minute', () => {
    const exits = [exit('West gate', { closed: true, open: false }), exit('Dock', { late: true, open: false })];
    expect(runLine(run({ exits }), 240, RULES)).toEqual({ text: 'No exit open yet · Dock opens at 3:00', progress: 0, urgent: false });
    expect(runLine(run({ exits: [exit('West gate', { closed: true, open: false })] }), 240, RULES).text).toBe('No exit open yet');
  });

  it('says "Under a minute" with the exits and warns from the one-minute mark', () => {
    const exits = [exit('East gate')];
    expect(runLine(run({ exits }), RULES.warnAt + 1, RULES)).toEqual({ text: 'Exit: East gate', progress: 0, urgent: false });
    expect(runLine(run({ exits }), RULES.warnAt, RULES)).toEqual({ text: 'Under a minute · Exit: East gate', progress: 0, urgent: true });
    expect(runLine(run({ exits: [exit('East gate'), exit('North gate')] }), 20, RULES).text).toBe('Under a minute · Exits: East gate, North gate');
    expect(runLine(run({ exits: [exit('West gate', { closed: true, open: false })] }), 30, RULES)).toEqual({ text: 'No exit open yet', progress: 0, urgent: true });
  });

  it('a counting or paused strip beats the minute warning wording', () => {
    expect(runLine(run({ exits: [exit('East gate')], countStatus: 'counting', count: 2 }), 30, RULES).text).toBe('Counting you out · 8');
  });

  it('is full once extracted and empty once the run ended another way', () => {
    expect(runLine(run({ outcome: 'extracted', exits: [exit('East gate')] }), 100, RULES)).toEqual({ text: 'Counted out · you made it', progress: 1, urgent: false });
    for (const outcome of ['out', 'time'] as const) {
      expect(runLine(run({ outcome, exits: [exit('East gate')] }), 0, RULES)).toEqual({ text: '', progress: 0, urgent: false });
    }
  });
});

describe('the respawn note', () => {
  it('says whether your one respawn is still there', () => {
    expect(respawnNote(EXTRACTION.respawns)).toBe('Respawn ready');
    expect(respawnNote(1)).toBe('Respawn ready');
    expect(respawnNote(0)).toBe('No respawn left');
  });
});
