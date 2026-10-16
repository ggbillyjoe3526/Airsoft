import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotIntentLabels, pxText } from './botIntentLabels';

/** A stand-in element (vitest has no DOM): what the labels set on it. */
function fakeElement() {
  const props = new Map<string, string>();
  return {
    hidden: false,
    className: '',
    textContent: '',
    props,
    style: { setProperty: (k: string, v: string) => void props.set(k, v), transform: '' },
    setAttribute: () => undefined,
    append: () => undefined,
    appendChild: () => undefined,
    remove: () => undefined,
  };
}

describe('Dev › Bot intentions labels move without making strings (KI1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pxText says a pixel offset in CSS, the same kept text each time, off-range values too', () => {
    expect(pxText(12)).toBe('12px');
    expect(pxText(-7)).toBe('-7px');
    expect(pxText(12)).toBe(pxText(12));
    expect(pxText(100000)).toBe('100000px');
  });

  it('places a label through --x and --y (rounded), touching them only when it moves', () => {
    const made: ReturnType<typeof fakeElement>[] = [];
    vi.stubGlobal('document', { createElement: () => made[made.push(fakeElement()) - 1] });
    const labels = new BotIntentLabels(fakeElement() as unknown as HTMLElement);
    labels.show(0, 101.4, 52.6, '', 'Holding');
    const root = made[0]!;
    expect([root.props.get('--x'), root.props.get('--y')]).toEqual(['101px', '53px']);
    expect(root.style.transform).toBe('');
    const set = vi.spyOn(root.style, 'setProperty');
    labels.show(0, 101.2, 53.1, '', 'Holding');
    expect(set).not.toHaveBeenCalled();
    labels.show(0, 140, 53, '', 'Holding');
    expect(root.props.get('--x')).toBe('140px');
  });
});
