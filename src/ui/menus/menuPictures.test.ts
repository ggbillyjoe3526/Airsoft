import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLICA_KEYS } from '../../pool/pool';
import type { ItemSubject, PictureSubject } from '../../render/itemPictures';
import { fakeDocument } from '../testSupport';
import { type PictureSource, PictureSlot } from './menuPictures';

// Read from disk, as styleSheet.test.ts does (the module name is built at run time; the project's types lack Node's).
const nodeFs = 'node:' + 'fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };

const replica = REPLICA_KEYS.aeg!;
const subject = (scheme: PictureSubject['scheme']): PictureSubject => ({ replica, scheme, realistic: false });

/** A source whose pictures arrive when the test says so. */
function lateSource(): { source: PictureSource; asked: ItemSubject[]; arrive: (i: number, url: string) => void } {
  const asked: ItemSubject[] = [];
  const resolvers: ((url: string) => void)[] = [];
  const source: PictureSource = {
    picture: (s) => {
      asked.push(s);
      return new Promise<string>((resolve) => resolvers.push(resolve));
    },
  };
  return { source, asked, arrive: (i, url) => resolvers[i]!(url) };
}

describe('pictures never hold a screen up (G3, criterion 9)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('returns at once with the drawing showing while the picture is still being made, then swaps it in on arrival', async () => {
    const { source, arrive } = lateSource();
    const slot = new PictureSlot();
    slot.show(source, subject('cobalt'), '<svg id="line"></svg>');
    // show() did not wait: the placeholder is up, no picture yet.
    expect(slot.root.classList.contains('has-picture')).toBe(false);
    expect(slot.root.children[0]!.innerHTML).toBe('<svg id="line"></svg>');
    arrive(0, 'blob:one');
    await Promise.resolve();
    await Promise.resolve();
    expect(slot.root.classList.contains('has-picture')).toBe(true);
    expect((slot.root.children[1] as HTMLImageElement).src).toBe('blob:one');
  });

  it('asks once for a subject shown again, and ignores a picture that comes after another was asked for', async () => {
    const { source, asked, arrive } = lateSource();
    const slot = new PictureSlot();
    slot.show(source, subject('cobalt'), '');
    slot.show(source, subject('cobalt'), '');
    expect(asked).toHaveLength(1);
    slot.show(source, subject('onyx'), '');
    expect(asked).toHaveLength(2);
    arrive(0, 'blob:stale');
    await Promise.resolve();
    await Promise.resolve();
    expect(slot.root.classList.contains('has-picture')).toBe(false);
    arrive(1, 'blob:fresh');
    await Promise.resolve();
    await Promise.resolve();
    expect((slot.root.children[1] as HTMLImageElement).src).toBe('blob:fresh');
  });

  it('keeps the drawing when a picture cannot be made (a lost context), without an unhandled rejection', async () => {
    const slot = new PictureSlot();
    slot.show({ picture: () => Promise.reject(new Error('context lost')) }, subject('cobalt'), '<svg></svg>');
    await Promise.resolve();
    await Promise.resolve();
    expect(slot.root.classList.contains('has-picture')).toBe(false);
  });
});

describe('no backdrop-filter anywhere (G3, criterion 9)', () => {
  it('is in neither the page shell nor its inline styles', () => {
    for (const file of ['../../../index.html', '../../style.css']) expect(readFileSync(new URL(file, import.meta.url), 'utf8'), file).not.toMatch(/backdrop-filter/i);
  });
});
