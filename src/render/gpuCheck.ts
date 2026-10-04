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

/**
 * True if a throwaway context asking to fail on a major performance caveat is refused while a plain one is given (the
 * browser would draw in software). False if the plain one is refused too: WebGL2 is unavailable or blocked, or too many
 * contexts are live, which is not a caveat (audit M-02, KNOWN_ISSUES row 138). The probes' contexts are given back at once.
 */
export function performanceCaveat(): boolean {
  try {
    const flagged = probeContext({ failIfMajorPerformanceCaveat: true });
    if (flagged) {
      release(flagged);
      return false;
    }
    const plain = probeContext();
    if (!plain) return false;
    release(plain);
    return true;
  } catch {
    return false;
  }
}

/** True if the browser draws WebGL2 without hardware acceleration. Probes throwaway contexts; asked once, at startup. */
export function lacksHardwareAcceleration(): boolean {
  try {
    const gl = probeContext();
    // No WebGL2 at all: not a speed problem (the renderer fails and the loading screen says so).
    if (!gl) return false;
    const software = isSoftwareRenderer(rendererName(gl));
    release(gl);
    return software || performanceCaveat();
  } catch {
    return false;
  }
}
