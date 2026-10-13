import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, fakeDocument } from './testSupport';
import { TeammateMarkers } from './teammateMarkers';

describe('teammate markers take the bots\' roster names (BN1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('relabels a marker once the match has drawn the names, and leaves the others', () => {
    vi.stubGlobal('document', fakeDocument());
    const parent = new FakeElement('div');
    const markers = new TeammateMarkers(parent as unknown as HTMLElement, ['Alpha 2', 'Alpha 3'], '#3b82f6');
    const label = (i: number) => parent.children[i]!.children[0]!.textContent;
    expect([label(0), label(1)]).toEqual(['Alpha 2', 'Alpha 3']);
    markers.rename(0, 'Rook');
    expect([label(0), label(1)]).toEqual(['Rook', 'Alpha 3']);
    // A marker it doesn't have is no error.
    markers.rename(5, 'Dash');
    expect(parent.children).toHaveLength(2);
  });
});
