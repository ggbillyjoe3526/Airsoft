import { describe, expect, it } from 'vitest';
import { chunkInfo, prefetchWithProgress, readWithProgress } from './loadingProgress';

/** A <meta> stand-in with these attributes. */
function meta(attrs: Record<string, string>): { getAttribute(name: string): string | null } {
  return { getAttribute: (name) => attrs[name] ?? null };
}

/** A stream handing over `sizes` bytes, a piece at a time. */
function stream(sizes: number[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < sizes.length) controller.enqueue(new Uint8Array(sizes[i++]!));
      else controller.close();
    },
  });
}

describe('chunkInfo (the build names the physics chunk)', () => {
  it('reads the URL and the size', () => {
    expect(chunkInfo(meta({ content: './assets/rapier-x.js', 'data-bytes': '4335380' }))).toEqual({ url: './assets/rapier-x.js', bytes: 4335380 });
  });

  it('is null without the meta (the dev server) or with a size it cannot use', () => {
    expect(chunkInfo(null)).toBeNull();
    expect(chunkInfo(meta({ content: './a.js' }))).toBeNull();
    expect(chunkInfo(meta({ content: './a.js', 'data-bytes': 'lots' }))).toBeNull();
    expect(chunkInfo(meta({ content: './a.js', 'data-bytes': '0' }))).toBeNull();
    expect(chunkInfo(meta({ content: '', 'data-bytes': '10' }))).toBeNull();
  });
});

describe('readWithProgress (the loading bar follows the bytes)', () => {
  it('reports a rising share of the total, ending at 1, and returns the bytes read', async () => {
    const shares: number[] = [];
    const read = await readWithProgress(stream([250, 250, 500]), 1000, (s) => shares.push(s));
    expect(read).toBe(1000);
    expect(shares).toEqual([0.25, 0.5, 1, 1]);
  });

  it('never reports more than all of it (a server that compresses still hands over the full bytes)', async () => {
    const shares: number[] = [];
    await readWithProgress(stream([800, 800]), 1000, (s) => shares.push(s));
    expect(Math.max(...shares)).toBe(1);
  });

  it('reaches 1 even when the chunk turns out smaller than the build said', async () => {
    const shares: number[] = [];
    await readWithProgress(stream([300]), 1000, (s) => shares.push(s));
    expect(shares.at(-1)).toBe(1);
  });
});

describe('prefetchWithProgress (never in the way of the game starting)', () => {
  const chunk = { url: './assets/rapier-x.js', bytes: 100 };

  it('downloads the chunk with the progress, asking as the module import will (same-origin credentials)', async () => {
    const shares: number[] = [];
    let init: RequestInit | undefined;
    const load = (async (_url: string, i?: RequestInit) => ((init = i), new Response(stream([40, 60])))) as typeof fetch;
    await prefetchWithProgress(chunk, (s) => shares.push(s), load);
    expect(shares).toEqual([0.4, 1, 1]);
    expect(init?.credentials).toBe('same-origin');
  });

  it('gives up quietly on a failed request or a refused one, leaving the import to load it', async () => {
    const shares: number[] = [];
    const missing = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(prefetchWithProgress(chunk, (s) => shares.push(s), missing)).resolves.toBeUndefined();
    await expect(prefetchWithProgress(chunk, (s) => shares.push(s), offline)).resolves.toBeUndefined();
    expect(shares).toEqual([]);
  });
});
