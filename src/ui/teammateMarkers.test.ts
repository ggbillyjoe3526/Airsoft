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

describe('close teammates\' name tags stack rather than overlap (BP5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Markers for three teammates whose tags measure 60 × 20 px at HUD size 1 (90 × 30 at 1.5). */
  function threeMarkers() {
    vi.stubGlobal('document', fakeDocument());
    const parent = new FakeElement('div');
    parent.style['--hud-scale'] = '1';
    const markers = new TeammateMarkers(parent as unknown as HTMLElement, ['Kit', 'Rook', 'Dash'], '#3b82f6');
    const reads = { count: 0 };
    for (const tag of parent.children) {
      Object.defineProperty(tag, 'offsetWidth', { get: () => (reads.count++, 60 * Number(parent.style['--hud-scale'])) });
      Object.defineProperty(tag, 'offsetHeight', { get: () => 20 * Number(parent.style['--hud-scale']) });
    }
    const placed = (i: number) => parent.children[i]!.style.transform;
    return { parent, markers, reads, placed };
  }

  it('lifts the higher of two overlapping tags over the lower one and leaves a tag apart where it is', () => {
    const { markers, placed } = threeMarkers();
    markers.show(0, 400, 300, false);
    markers.show(1, 430, 296, false);
    markers.show(2, 800, 296, false);
    markers.commit();
    expect(placed(0)).toBe('translate(400px, 300px)');
    expect(placed(1)).toBe('translate(430px, 278px)');
    expect(placed(2)).toBe('translate(800px, 296px)');
  });

  it('reads each size once until its words, its visibility or the HUD size change', () => {
    const { parent, markers, reads, placed } = threeMarkers();
    const frame = () => {
      markers.show(0, 400, 300, false);
      markers.show(1, 430, 296, false);
      markers.hide(2);
      markers.commit();
    };
    frame();
    frame();
    frame();
    expect(reads.count).toBe(2);
    // Called a hit: its tag reads " · hit" now, so it is measured again.
    markers.show(1, 430, 296, true);
    markers.commit();
    expect(reads.count).toBe(3);
    // A bigger HUD measures them all again and stacks by the new size.
    parent.style['--hud-scale'] = '1.5';
    frame();
    expect(reads.count).toBe(5);
    expect(placed(1)).toBe('translate(430px, 268px)');
  });

  it('puts a tag back over its own teammate once the other walks away', () => {
    const { markers, placed } = threeMarkers();
    markers.show(0, 400, 300, false);
    markers.show(1, 430, 296, false);
    markers.commit();
    markers.show(0, 600, 300, false);
    markers.show(1, 430, 296, false);
    markers.commit();
    expect(placed(1)).toBe('translate(430px, 296px)');
  });
});
