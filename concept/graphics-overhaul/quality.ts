/** The two presets this concept shows. Everything a preset changes is listed here. */
export type PresetId = 'low' | 'ultra';

export interface Preset {
  id: PresetId;
  /** Texture size for surfaces (texels square) and whether normal and roughness maps are made. */
  tex: number;
  bigTex: number;
  surfaceMaps: boolean;
  /** Lit with Lambert (cheap, no reflections) or physically based materials with an environment map. */
  pbr: boolean;
  /** Rounded bevels on boxes (segments) and curve segments on round parts. */
  bevelSegments: number;
  curveSegments: number;
  /** Small model parts (straps, pouches, rail teeth, screws, wire mesh) are built at all. */
  smallParts: boolean;
  shadowMap: number;
  softShadows: boolean;
  /** Post-processing passes. */
  ao: boolean;
  ssr: boolean;
  bloom: boolean;
  godRays: boolean;
  smaa: boolean;
  fxaa: boolean;
  /** Fresnel rim light on figures and replicas (a shader term). */
  rim: boolean;
  /** Emissive accents (they only glow with bloom). */
  emissive: boolean;
  /** Distant scenery: trees, hills, buildings around the yard. */
  scenery: 'low' | 'full';
  clouds: boolean;
  /** Render target multisampling. */
  msaa: number;
  /** Baked light probes (v3): solid-grid voxel size, probe spacing and rays per probe; null for none. */
  gi: { voxel: number; probe: number; rays: number } | null;
  /** v3 particles: sunlit dust, smoke and steam (a count scale; 0 for none). */
  particles: number;
  /** v3 lens finish on Ultra: film grain and a trace of chromatic fringing at the screen's edge. */
  lens: boolean;
}

const _q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const off = (k: string) => _q.get('no') ?.split(',').includes(k) ?? false;
export const PRESETS: Record<PresetId, Preset> = {
  low: {
    id: 'low',
    tex: 256,
    bigTex: 512,
    surfaceMaps: false,
    pbr: false,
    bevelSegments: 0,
    curveSegments: 8,
    smallParts: false,
    shadowMap: 2048,
    softShadows: false,
    ao: false,
    ssr: false,
    bloom: false,
    godRays: false,
    smaa: false,
    fxaa: true,
    rim: true,
    emissive: true,
    scenery: 'low',
    clouds: false,
    msaa: 0,
    gi: off('gi') ? null : { voxel: 0.25, probe: 0.6, rays: 24 },
    particles: off('particles') ? 0 : 0.35,
    lens: false,
  },
  ultra: {
    id: 'ultra',
    tex: 1024,
    bigTex: 2048,
    surfaceMaps: true,
    pbr: true,
    bevelSegments: 3,
    curveSegments: 32,
    smallParts: true,
    shadowMap: 4096,
    softShadows: true,
    ao: !off('ao'),
    ssr: !off('ssr'),
    bloom: !off('bloom'),
    godRays: !off('godrays'),
    smaa: true,
    fxaa: false,
    rim: true,
    emissive: true,
    scenery: 'full',
    clouds: true,
    msaa: 4,
    gi: off('gi') ? null : { voxel: 0.2, probe: 0.4, rays: 40 },
    particles: off('particles') ? 0 : 1,
    lens: !off('lens'),
  },
};
