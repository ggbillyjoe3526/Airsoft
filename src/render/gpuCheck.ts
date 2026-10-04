import type { GpuTier } from '../config/render';

/**
 * Is the browser drawing without hardware acceleration (M18b)? Then the game runs at a few frames a second, the most
 * common problem with browser games, and the title screen says how to fix it. Two signs: the renderer's name is a
 * software rasteriser, or the browser refuses a context that asks it to fail on a "major performance caveat".
 * Asked once at startup, before the game's own renderer is made, so a browser drawing in software can start on Low
 * (audit M-02).
 */

/** Software rasterisers by the names browsers report (Chrome's SwiftShader, Mesa's llvmpipe, Windows' fallback). */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|software rasterizer/i;

export function isSoftwareRenderer(name: string): boolean {
  return SOFTWARE_RENDERER.test(name);
}

/** The GPU name the browser gives for `gl` ('' if it hides it). */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof name === 'string' ? name : '';
  } catch {
    return '';
  }
}

/** A throwaway WebGL2 context on a canvas of its own (null if the browser refuses one). */
function probeContext(attributes?: WebGLContextAttributes): WebGL2RenderingContext | null {
  return document.createElement('canvas').getContext('webgl2', attributes);
}

/** Gives a probe's context back at once (browsers cap how many can be live). */
function release(gl: WebGL2RenderingContext): void {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/** What the startup probe found: whether the browser draws in software, and the GPU's name ('' if hidden or none). */
export interface GpuProbe {
  software: boolean;
  name: string;
}

/**
 * Asks the browser once, before the game's own renderer is made (audit REN-18: one throwaway context in the usual case,
 * two at most, where it used to make up to three). The first probe asks to fail on a major performance caveat: given,
 * its renderer name says whether it is a software rasteriser anyway. Refused, a plain probe tells a caveat (the browser
 * would draw in software) from no WebGL2 at all (blocked, or too many contexts live: not a speed problem, and the
 * renderer's own failure says so; KNOWN_ISSUES row 138). Every probe's context is given back at once.
 */
export function probeGpu(): GpuProbe {
  try {
    const flagged = probeContext({ failIfMajorPerformanceCaveat: true });
    if (flagged) {
      const name = rendererName(flagged);
      release(flagged);
      return { software: isSoftwareRenderer(name), name };
    }
    const plain = probeContext();
    if (!plain) return { software: false, name: '' };
    const name = rendererName(plain);
    release(plain);
    return { software: true, name };
  } catch {
    return { software: false, name: '' };
  }
}

/** True if the browser draws WebGL2 without hardware acceleration (probeGpu). */
export function lacksHardwareAcceleration(): boolean {
  return probeGpu().software;
}

/**
 * Discrete cards by name: NVIDIA's (but not the MX laptop parts, which perform like integrated graphics), AMD's RX and
 * Pro cards, Intel's Arc A and B cards.
 */
const DISCRETE = /nvidia|geforce|quadro|\brtx\b|radeon\s*(\(tm\)\s*)?(rx|pro|r9|vii)|intel\(r\)\s*arc\(tm\)\s*[ab]\d|\barc\s+[ab]\d/i;
/** NVIDIA's MX laptop parts: integrated-class performance. */
const ENTRY_DISCRETE = /geforce\s*mx\s*\d/i;
/**
 * AMD's laptop and desktop APUs that the driver names like a card: "Radeon(TM) RX Vega 10 Graphics" (Ryzen 2000 and
 * 3000 U), "Radeon Vega 8 Graphics", "Radeon 680M" / "780M" (the RX 7xxM cards are discrete and keep their "RX"). The
 * Vega cards (RX Vega 56 and 64, and the Radeon Pro Vega 16, 20 and 48 in Macs) are discrete; Mesa may name an APU only by
 * its code name ("AMD RAVEN").
 */
const APU = /radeon\b(?!\s*pro\b).*\bvega\s+(?!56\b|64\b)\d{1,2}\b|radeon(\s*\(tm\))?\s*\d{3}m\b|\bamd\s+(raven2?|picasso|renoir|lucienne|cezanne|barcelo|rembrandt|mendocino|phoenix|vangogh)\b/i;
/**
 * Integrated graphics by name: Intel's UHD, Iris, HD Graphics and the Arc in Core Ultra chips, AMD's APUs (Vega,
 * "Radeon Graphics", the 600M and 700M parts), Apple silicon, and the Arm laptops' Adreno, Mali and PowerVR.
 */
const INTEGRATED = /intel|radeon.*(vega|graphics|\d{3}m\b)|apple|adreno|mali|powervr/i;

/**
 * What the graphics card is, by the name the browser reports (REN-03): picks the preset a first visit starts on
 * (config/render.ts TIER_QUALITY). A hidden or unfamiliar name is 'unknown' (Firefox with fingerprinting protection
 * reports a generic one), which starts on Medium like integrated graphics.
 */
export function gpuTier(name: string, software = false): GpuTier {
  if (software || isSoftwareRenderer(name)) return 'software';
  if (ENTRY_DISCRETE.test(name) || APU.test(name)) return 'integrated';
  if (DISCRETE.test(name)) return 'discrete';
  if (INTEGRATED.test(name)) return 'integrated';
  return 'unknown';
}
