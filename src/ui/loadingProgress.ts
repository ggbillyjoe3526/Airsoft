/**
 * The loading bar's real progress (audit CORE-10). The build names the physics chunk and its size in a <meta>
 * (vite.config.ts); before the game imports that chunk, main.ts downloads it here, counting the bytes as they arrive.
 * The import that follows is then answered by the browser's cache (a fresh copy, or a 304 for a host that says
 * `no-cache`), so nothing is downloaded twice. On the dev server there is no such <meta> and the bar skips the step.
 */

/** The chunk to fetch: its URL (as written in the page) and its size in bytes, uncompressed. */
export interface ChunkInfo {
  url: string;
  bytes: number;
}

/** Reads the build's <meta> (null when there is none, or it can't be read). */
export function chunkInfo(meta: Pick<Element, 'getAttribute'> | null): ChunkInfo | null {
  const url = meta?.getAttribute('content') ?? '';
  const bytes = Number(meta?.getAttribute('data-bytes'));
  if (url === '' || !Number.isFinite(bytes) || bytes <= 0) return null;
  return { url, bytes };
}

/**
 * Reads `body` to its end, reporting the share of `total` read so far (0–1, never more: a server that compresses on
 * the fly still hands over the uncompressed bytes counted here). Returns the bytes read.
 */
export async function readWithProgress(body: ReadableStream<Uint8Array>, total: number, onProgress: (share: number) => void): Promise<number> {
  const reader = body.getReader();
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    onProgress(Math.min(1, read / total));
  }
  onProgress(1);
  return read;
}

/**
 * Downloads `chunk` with progress. Never throws: if the fetch fails or has no body the game's own import loads the
 * chunk as it always did, just without the bar moving.
 */
export async function prefetchWithProgress(chunk: ChunkInfo, onProgress: (share: number) => void, load: typeof fetch = fetch): Promise<void> {
  try {
    // Same mode and credentials as the module import that follows, so the browser's cache answers it.
    const response = await load(chunk.url, { credentials: 'same-origin' });
    if (!response.ok || !response.body) return;
    await readWithProgress(response.body, chunk.bytes, onProgress);
  } catch {
    // The import reports a real failure.
  }
}
