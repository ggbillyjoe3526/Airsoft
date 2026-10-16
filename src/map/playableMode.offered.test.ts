import { describe, expect, it } from 'vitest';
import { MATCH_MODES } from '../config/modes';
import { MAPS, mapData } from './maps';
import { mapHosts, modeOffered, playableMode } from './playableMode';

/** MR1 QA: a map shows only the modes that apply to it (owner, 2026-10-16). */
describe('modeOffered (MR1)', () => {
  it('offers exactly the modes the map hosts, Elimination everywhere', () => {
    for (const m of MAPS)
      for (const mode of MATCH_MODES) {
        const data = mapData(m.id);
        expect(modeOffered(data, mode.id), `${m.id} ${mode.id}`).toBe(mapHosts(data, mode.id));
        // What is offered plays as itself; what is not plays as Elimination.
        expect(playableMode(data, mode.id) === mode.id, `${m.id} ${mode.id}`).toBe(modeOffered(data, mode.id));
      }
    for (const m of MAPS) expect(modeOffered(mapData(m.id), 'elimination')).toBe(true);
  });

  it('does not offer Attack and Defend without a flagpole, nor Extraction without its data', () => {
    expect(modeOffered({}, 'attackDefend')).toBe(false);
    expect(modeOffered({}, 'extraction')).toBe(false);
    expect(modeOffered({}, 'elimination')).toBe(true);
  });
});
