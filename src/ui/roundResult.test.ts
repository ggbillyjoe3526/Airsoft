import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUNDS } from '../config/hits';
import { HUD_TEXT } from '../config/hudText';
import { createRoundState, type RoundState } from '../sim/round';
import { RoundResult, roundResultWords } from './roundResult';
import { FakeElement, fakeDocument } from './testSupport';

/** Dev 6 playtest item 33: WON or LOST at a round's end. */
function round(patch: Partial<RoundState>): RoundState {
  return { ...createRoundState(ROUNDS, patch.mode ?? 'elimination'), ...patch };
}

describe('the words at a round\'s end', () => {
  it('says Won or Lost from your side, with the round under it, and Draw for a drawn round', () => {
    expect(roundResultWords(round({ phase: 'over', winner: 0, number: 3 }), 0)).toEqual({ word: 'Won', tone: 'won', caption: 'Round 3' });
    expect(roundResultWords(round({ phase: 'over', winner: 0, number: 3 }), 1)).toEqual({ word: 'Lost', tone: 'lost', caption: 'Round 3' });
    expect(roundResultWords(round({ phase: 'over', winner: -1, number: 2 }), 1)).toEqual({ word: 'Draw', tone: 'draw', caption: 'Round 2' });
  });

  it('says Won or Lost with "Match" once the match is decided', () => {
    expect(roundResultWords(round({ phase: 'matchOver', matchWinner: 1 }), 1)).toEqual({ word: 'Won', tone: 'won', caption: HUD_TEXT.result.match });
    expect(roundResultWords(round({ phase: 'matchOver', matchWinner: 1 }), 0)!.word).toBe('Lost');
  });

  it('says nothing while the round is live, nor in an Extraction run', () => {
    expect(roundResultWords(round({ phase: 'live' }), 0)).toBeNull();
    expect(roundResultWords(round({ phase: 'matchOver', mode: 'extraction' }), 0)).toBeNull();
  });
});

describe('the stamp', () => {
  let parent: FakeElement;
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    parent = new FakeElement('div');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the word and caption, its tone for the stylesheet, and the click line only when given; hidden from a screen reader', () => {
    const r = new RoundResult(parent as unknown as HTMLElement);
    const stamp = parent.children[0]!;
    expect(stamp.hidden).toBe(true);
    expect(stamp.getAttribute('aria-hidden')).toBe('true');
    r.setWords({ word: 'Won', tone: 'won', caption: 'Round 2' });
    expect(stamp.hidden).toBe(false);
    expect(stamp.getAttribute('data-tone')).toBe('won');
    expect(stamp.children.map((c) => c.text)).toEqual(['Won', 'Round 2', '']);
    expect(stamp.children[2]!.hidden).toBe(true);
    r.setHint(HUD_TEXT.result.nextRound);
    expect(stamp.children[2]!.hidden).toBe(false);
    r.setVisible(false);
    expect(stamp.hidden).toBe(true);
    r.setVisible(true);
    expect(stamp.hidden).toBe(false);
    r.clear();
    expect(stamp.hidden).toBe(true);
  });
});
