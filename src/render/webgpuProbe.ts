import { RENDER_BACKEND } from '../config/renderBackend';

/**
 * The WebGPU adapter probe (WebGPU overhaul W1), run at load by render/rendererStart.ts when the Renderer row is on Auto
 * or WebGPU, before anything of `three/webgpu` is downloaded. A visit picked to WebGL never touches `navigator.gpu`.
 */

/** The few members of the WebGPU API the probe reads (the project doesn't load @webgpu/types). */
interface AdapterLike {
  readonly features: { has(name: string): boolean };
  readonly info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean };
}
interface GpuLike {
  requestAdapter(options?: { powerPreference?: string }): Promise<AdapterLike | null>;
}

/** What the probe found. */
export interface WebGpuProbe {
  /** An adapter was given. */
  available: boolean;
  /** Its vendor, architecture and description ('' when hidden or none). */
  name: string;
  /** It offers timestamp queries (the GPU timer). */
  timestamps: boolean;
  /** It is the browser's software adapter. */
  software: boolean;
}

/** Nothing found (or nothing asked). */
export function noWebGpu(): WebGpuProbe {
  return { available: false, name: '', timestamps: false, software: false };
}

/**
 * Asks the browser for a WebGPU adapter. Unavailable, quietly (no console output, no throw), when there is no
 * `navigator.gpu` (Firefox on Linux, an insecure page), when the adapter comes back null (no usable GPU; headless
 * Chromium in a container), when asking throws, or when no answer comes within `RENDER_BACKEND.probeTimeoutMs`.
 */
export async function probeWebGpu(nav: { gpu?: GpuLike } | undefined = globalThis.navigator as { gpu?: GpuLike } | undefined, timeoutMs: number = RENDER_BACKEND.probeTimeoutMs): Promise<WebGpuProbe> {
  const gpu = nav?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return noWebGpu();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)));
    const adapter = await Promise.race([gpu.requestAdapter({ powerPreference: 'high-performance' }), timeout]);
    if (!adapter) return noWebGpu();
    const info = adapter.info ?? {};
    return {
      available: true,
      name: [info.vendor, info.architecture, info.description].filter((part) => part).join(' '),
      timestamps: adapter.features.has('timestamp-query'),
      software: info.isFallbackAdapter === true,
    };
  } catch {
    return noWebGpu();
  } finally {
    clearTimeout(timer);
  }
}
