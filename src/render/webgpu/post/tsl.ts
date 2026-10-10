import { Break, Discard, Fn, If, Loop, PI, abs, acos, clamp, cos, cross, depth, dot, float, floor, fract, int, ivec2, length, mat3, max, min, mix, mod, normalView, normalize, perspectiveDepthToViewZ, pow, reflect, screenCoordinate, screenSize, screenUV, sin, smoothstep, sqrt, texture, textureSize, toneMapping, toneMappingExposure, uniform, vec2, vec3, vec4, workingToColorSpace } from 'three/tsl';

/**
 * The TSL functions the post passes use (W4), loosely typed (TSL's node types don't follow its own swizzles and
 * helpers). Named imports in a plain object, not `import * as`: a namespace used as a value makes the bundler share its
 * helper in a chunk of its own, which the physics chunk's import then waits on (and preloads).
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above */
export const tsl: any = { Break, Discard, Fn, If, Loop, PI, abs, acos, clamp, cos, cross, depth, dot, float, floor, fract, int, ivec2, length, mat3, max, min, mix, mod, normalView, normalize, perspectiveDepthToViewZ, pow, reflect, screenCoordinate, screenSize, screenUV, sin, smoothstep, sqrt, texture, textureSize, toneMapping, toneMappingExposure, uniform, vec2, vec3, vec4, workingToColorSpace };
