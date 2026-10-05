import { describe, expect, it } from 'vitest';
import { haulLine } from './summaryScreen';

const found = { fc: 145, items: [{ asset: '000004', tier: 'rare' }] };
const none = { fc: 0, items: [] };

describe("the summary's haul line (M44)", () => {
  it('says what you got out with, and whether it went into your collection', () => {
    expect(haulLine({ extracted: true, found, out: found, kept: [] })).toBe('+145 FC and 1 part, now in your collection.');
    expect(haulLine({ extracted: true, found, out: found, kept: null })).toBe('145 FC and 1 part. Not kept: nothing from this run goes into your collection.');
  });

  it('says what you lost when you didn’t get out, and when there was nothing', () => {
    expect(haulLine({ extracted: false, found, out: none, kept: null })).toBe('Lost: 145 FC and 1 part. Only what you get out with is yours.');
    expect(haulLine({ extracted: false, found: none, out: none, kept: null })).toBe('You found nothing on this run.');
    expect(haulLine({ extracted: true, found, out: none, kept: null })).toBe('You got out, but what you dropped stayed where you fell.');
    expect(haulLine({ extracted: true, found: none, out: none, kept: null })).toBe('You got out with nothing.');
  });
});
