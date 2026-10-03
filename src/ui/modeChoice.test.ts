import { describe, expect, it } from 'vitest';
import { modeNote, modeTakesEffect, modeToDescribe } from './modeChoice';

describe('picking a match mode', () => {
  it('applies at once before the first match, and from the next match after that', () => {
    expect(modeTakesEffect(false)).toBe('now');
    expect(modeTakesEffect(true)).toBe('nextMatch');
  });

  it('notes a waiting mode only while a match in another mode is still on', () => {
    expect(modeNote('attackDefend', 'elimination', true, false)).toBe('Starts with the next match.');
    expect(modeNote('elimination', 'elimination', true, false)).toBe(''); // picked back: nothing waits
    expect(modeNote('attackDefend', 'elimination', true, true)).toBe(''); // result screen: Play again starts it
    expect(modeNote('attackDefend', 'elimination', false, false)).toBe(''); // title screen: already applied
  });
});

describe('the rules shown on New game', () => {
  it('describe the match in progress while it is on, and the picked mode otherwise', () => {
    expect(modeToDescribe('attackDefend', 'elimination', true, false)).toBe('elimination'); // paused mid-match
    expect(modeToDescribe('attackDefend', 'elimination', true, true)).toBe('attackDefend'); // result screen
    expect(modeToDescribe('attackDefend', 'elimination', false, false)).toBe('attackDefend'); // title screen
  });
});
