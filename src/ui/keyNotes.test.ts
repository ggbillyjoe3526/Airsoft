import { describe, expect, it } from 'vitest';
import { essentialNote, refusedNote, strandNote, swapNote } from './keyNotes';

describe('key binding notes (audit UI-05, UI-07)', () => {
  it('says which action lost the key and what it has now', () => {
    expect(swapNote('Space', 'Reload', 'R')).toBe('Space was Reload: Reload is now R.');
    expect(swapNote('C', 'Crouch', '')).toBe('C was Crouch: Crouch has no key now.');
  });

  it('explains a refusal', () => {
    expect(refusedNote('F5', 'browser')).toBe("F5 can't be bound (the browser uses it).");
    expect(refusedNote('`', 'debug')).toBe("` can't be bound (it shows debug info).");
    expect(refusedNote('That key', '')).toBe("That key can't be bound.");
    expect(strandNote('Left mouse', 'Fire')).toContain("Fire's only key");
    expect(essentialNote('Move forward')).toBe('Move forward needs a key.');
  });
});
