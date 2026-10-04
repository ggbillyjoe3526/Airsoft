/**
 * Is the browser drawing without hardware acceleration (M18b)? Then the game runs at a few frames a second, the most
 * common problem with browser games, and the title screen says how to fix it. Two signs: the renderer's name is a
 * software rasteriser, or the browser refuses a context that asks it to fail on a "major performance caveat".
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

/**
 * True if a throwaway context asking to fail on a major performance caveat is refused (the browser would draw in
 * software). The probe's context is given back at once.
 */
function performanceCaveat(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return true;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  } catch {
    return false;
  }
}

/** True if the game's own context `gl` (already created) is drawn without hardware acceleration. */
export function lacksHardwareAcceleration(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  return isSoftwareRenderer(rendererName(gl)) || performanceCaveat();
}
