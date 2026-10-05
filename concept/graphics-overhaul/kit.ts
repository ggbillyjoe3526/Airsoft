import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Preset } from './quality';
import * as T from './textures';

/**
 * The building kit: materials for both presets, and a batcher that bakes each piece's colour (and a darkening towards
 * the ground it stands on) into vertex colours, gives it world-scale UVs, and merges everything that shares a material
 * into one mesh. Few draw calls is what keeps Low at 60 fps.
 */

export interface MatDef {
  tex?: (size: number, full: boolean) => T.TexSet;
  texKey?: string;
  big?: boolean;
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  clearcoat?: number;
  /** Figures and replicas get the fresnel rim light. */
  rim?: boolean;
  /** No lighting at all (sky things, glows). */
  unlit?: boolean;
  side?: THREE.Side;
  envIntensity?: number;
  normalScale?: number;
  /** Weathering in the shader (world-space dirt patches, grime up from the ground, rain streaks), 0..1. */
  grime?: number;
  /** Rust patches and streaks on painted steel, 0..1. */
  rust?: number;
  /** A canvas texture with its own UVs (decals): cut out by alpha. */
  canvas?: () => THREE.Texture;
  alphaTest?: number;
}

export const MATS: Record<string, MatDef> = {
  concrete: { tex: T.concrete, texKey: 'concrete', big: true, rough: 0.92, grime: 0.8, envIntensity: 0.45 },
  precast: { tex: T.precast, texKey: 'precast', rough: 0.92, grime: 1, envIntensity: 0.5 },
  blocks: { tex: T.blocks, texKey: 'blocks', rough: 0.85, grime: 0.8 },
  plaster: { tex: T.plaster, texKey: 'plaster', rough: 0.9, grime: 0.8 },
  paint: { tex: T.plaster, texKey: 'plaster', rough: 0.6, grime: 0.7 },
  paintSteel: { tex: T.metal, texKey: 'metal', rough: 0.5, metal: 0.3, grime: 0.7, rust: 0.7 },
  corrugated: { tex: T.corrugated, texKey: 'corrugated', rough: 0.5, metal: 0.25, grime: 0.8, rust: 1 },
  cladding: { tex: T.cladding, texKey: 'cladding', rough: 0.5, metal: 0.2, grime: 0.6, rust: 0.3 },
  steel: { tex: T.metal, texKey: 'metal', rough: 0.4, metal: 0.7, grime: 0.6, rust: 0.5 },
  galv: { tex: T.metal, texKey: 'metal', rough: 0.35, metal: 0.85, grime: 0.3 },
  planks: { tex: T.planks, texKey: 'planks', rough: 0.8, grime: 0.7 },
  timber: { tex: T.timber, texKey: 'timber', rough: 0.85, grime: 0.7 },
  plywood: { tex: T.plywood, texKey: 'plywood', rough: 0.85, grime: 0.8 },
  carton: { tex: T.carton, texKey: 'carton', rough: 0.95, grime: 0.4 },
  fabric: { tex: T.fabric, texKey: 'fabric', rough: 0.95, grime: 0.8 },
  stones: { tex: T.stones, texKey: 'stones', rough: 0.9, grime: 0.5 },
  rock: { tex: T.concrete, texKey: 'concrete', rough: 0.85, grime: 0.6 },
  tread: { tex: T.tread, texKey: 'tread', rough: 0.4, metal: 0.6, grime: 0.7, rust: 0.4 },
  louvre: { tex: T.louvre, texKey: 'louvre', rough: 0.5, metal: 0.3, grime: 0.6 },
  grass: { tex: T.grass, texKey: 'grass', big: true, rough: 0.95 },
  plastic: { tex: T.polymer, texKey: 'polymer', rough: 0.45, grime: 0.6 },
  film: { rough: 0.15, opacity: 0.55, clearcoat: 1 },
  tank: { rough: 0.35, opacity: 0.82 },
  foliage: { rough: 0.8 },
  bark: { tex: T.planks, texKey: 'planks', rough: 0.95 },
  rubber: { rough: 0.9, grime: 0.5 },
  dark: { rough: 0.7 },
  glow: { unlit: true },
  hazard: { tex: T.hazard, texKey: 'hazard', rough: 0.6, grime: 0.8 },
  puddle: { rough: 0.04, envIntensity: 1.4 },
  decal: { canvas: () => decalAtlas(), rough: 0.7, alphaTest: 0.45, grime: 0.6 },
  // Figures
  cloth: { tex: T.weave, texKey: 'weave', rough: 0.95, rim: true, grime: 0.45 },
  camo: { tex: T.camo, texKey: 'camo', rough: 0.95, rim: true, grime: 0.45 },
  gear: { tex: T.weave, texKey: 'weave', rough: 0.8, rim: true, grime: 0.35 },
  armour: { tex: T.polymer, texKey: 'polymer', rough: 0.55, rim: true, clearcoat: 0.15, grime: 0.25 },
  skin: { rough: 0.55, rim: true, clearcoat: 0.08 },
  hair: { tex: T.weave, texKey: 'weave', rough: 0.7, rim: true },
  visor: { rough: 0.05, metal: 0.4, rim: true, clearcoat: 1, envIntensity: 1.6 },
  mirror: { rough: 0.06, metal: 0.75, rim: true, clearcoat: 1, envIntensity: 2.2 },
  meshMask: { tex: T.perforated, texKey: 'perforated', rough: 0.5, metal: 0.6, rim: true },
  figGlow: { unlit: true, rim: false },
  figRubber: { rough: 0.85, rim: true, grime: 0.5 },
  glove: { tex: T.weave, texKey: 'weave', rough: 0.7, rim: true, normalScale: 0.4 },
  // Robots
  shell: { tex: T.panel, texKey: 'panel', rough: 0.45, metal: 0.3, rim: true, clearcoat: 0.4, grime: 0.3 },
  joint: { tex: T.metal, texKey: 'metal', rough: 0.4, metal: 0.85, rim: true },
  chrome: { rough: 0.12, metal: 1, rim: true, envIntensity: 1.4 },
  // Replicas
  gunPolymer: { tex: T.polymer, texKey: 'polymer', rough: 0.5, rim: true },
  gunMetal: { tex: T.metal, texKey: 'metal', rough: 0.45, metal: 0.8, rim: true },
  gunFurniture: { tex: T.polymer, texKey: 'polymer', rough: 0.55, rim: true },
  gunRubber: { tex: T.weave, texKey: 'weave', rough: 0.9, rim: true, normalScale: 2 },
  lens: { rough: 0.02, metal: 0.2, clearcoat: 1, envIntensity: 2, rim: true, opacity: 0.55, side: THREE.DoubleSide },
};

/** One atlas of stencils, signs and markings; decals pick a cell with `DECAL_CELLS`. */
export const DECAL_CELLS: Record<string, [number, number, number, number]> = {};
let atlas: THREE.Texture | null = null;
export function decalAtlas(): THREE.Texture {
  if (atlas) return atlas;
  // 2048 square, cells named here. Paint is white or full colour (tinted per decal through vertex colour); worn edges
  // are punched out of the alpha, so the cut-out shows chipped paint.
  const S = 2048;
  const cells: [string, number, number, number, number, (g: CanvasRenderingContext2D, w: number, h: number) => void][] = [
    ['containerCode', 0, 0, 1024, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 120px Arial, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('VNTU 304221 7', 20, h * 0.36);
      g.font = 'bold 70px Arial, sans-serif';
      g.fillText('22G1   MAX GROSS 30,480 KG', 22, h * 0.8);
      void w;
    }],
    ['containerLogo', 1024, 0, 1024, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(30, h - 30);
      g.lineTo(140, 30);
      g.lineTo(200, 30);
      g.lineTo(90, h - 30);
      g.fill();
      g.beginPath();
      g.moveTo(130, h - 30);
      g.lineTo(240, 30);
      g.lineTo(300, 30);
      g.lineTo(190, h - 30);
      g.fill();
      g.font = 'bold 150px Arial Black, Arial, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('VANTEX', 330, h / 2 + 6);
      void w;
    }],
    ['warning', 0, 256, 256, 256, (g, w, h) => {
      g.fillStyle = '#f5c32b';
      g.strokeStyle = '#111';
      g.lineWidth = 14;
      g.beginPath();
      g.moveTo(w / 2, 18);
      g.lineTo(w - 14, h - 22);
      g.lineTo(14, h - 22);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#111';
      g.fillRect(w / 2 - 10, 80, 20, 90);
      g.fillRect(w / 2 - 10, 186, 20, 20);
    }],
    ['upArrows', 256, 256, 256, 256, (g, w) => {
      g.fillStyle = '#fff';
      for (const x of [60, 160]) {
        g.fillRect(x - 10, 110, 20, 110);
        g.beginPath();
        g.moveTo(x - 40, 120);
        g.lineTo(x, 50);
        g.lineTo(x + 40, 120);
        g.fill();
      }
      g.fillRect(30, 228, w - 60, 14);
    }],
    ['fragile', 512, 256, 512, 256, (g, w, h) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 16;
      g.strokeRect(20, 30, w - 40, h - 60);
      g.fillStyle = '#fff';
      g.font = 'bold 120px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('FRAGILE', w / 2, h / 2 + 4);
    }],
    ['depot', 1024, 256, 1024, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d5fbf';
      g.fillRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#fff';
      g.font = 'bold 110px Arial Black, Arial, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('DEPOT 03', 50, h * 0.42);
      g.font = 'bold 44px Arial, sans-serif';
      g.fillText('AUTHORISED PERSONNEL ONLY', 54, h * 0.8);
    }],
    ['crateStamp', 512, 1024, 512, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 72px Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('DEPOT 03', w / 2, 100);
      g.font = 'bold 54px Arial, sans-serif';
      g.fillText('LOT 117 · 340 KG', w / 2, 190);
    }],
    ['sprayArrow', 0, 512, 512, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(30, h / 2 - 34);
      g.lineTo(w - 180, h / 2 - 40);
      g.lineTo(w - 190, 30);
      g.lineTo(w - 24, h / 2);
      g.lineTo(w - 190, h - 30);
      g.lineTo(w - 180, h / 2 + 40);
      g.lineTo(30, h / 2 + 34);
      g.fill();
      g.filter = 'blur(6px)';
      g.globalAlpha = 0.5;
      g.fill();
      g.filter = 'none';
      g.globalAlpha = 1;
    }],
    ['sprayA', 512, 512, 256, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 220px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('A', w / 2, h / 2 + 10);
    }],
    ['sprayB', 768, 512, 256, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 220px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('B', w / 2, h / 2 + 10);
    }],
    ['crack', 1024, 512, 512, 512, (g, w, h) => {
      g.strokeStyle = '#fff';
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const walk = (x: number, y: number, a: number, len: number, lw: number) => {
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x, y);
        for (let i = 0; i < len; i++) {
          a += (r() - 0.5) * 0.9;
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          g.lineTo(x, y);
          if (r() > 0.93 && lw > 2) walk(x, y, a + (r() - 0.5) * 2, len / 3, lw * 0.6);
        }
        g.stroke();
      };
      walk(20, h * 0.5, 0, 55, 5);
      void w;
    }],
    ['tyre', 1536, 512, 512, 512, (g, w, h) => {
      g.fillStyle = '#fff';
      for (const x of [140, 360]) {
        for (let y = 0; y < h; y += 22) {
          g.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(y * 0.01));
          g.fillRect(x - 40, y, 80, 12);
        }
      }
      g.globalAlpha = 1;
      void w;
    }],
    ['csc', 0, 768, 256, 256, (g, w, h) => {
      g.fillStyle = '#c9ccd0';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#333';
      g.font = 'bold 26px Arial, sans-serif';
      g.fillText('CSC SAFETY APPROVAL', 14, 40);
      for (let i = 0; i < 6; i++) g.fillRect(14, 70 + i * 28, 140 + (i * 37) % 80, 8);
    }],
    ['hazardBand', 256, 768, 512, 128, (g, w, h) => {
      for (let i = -2; i < 12; i++) {
        g.fillStyle = i % 2 ? '#111' : '#f5c32b';
        g.beginPath();
        g.moveTo(i * 60, h);
        g.lineTo(i * 60 + 60, h);
        g.lineTo(i * 60 + 120, 0);
        g.lineTo(i * 60 + 60, 0);
        g.fill();
      }
      void w;
    }],
    ['number03', 1024, 1024, 512, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 230px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('03', w / 2, h / 2 + 10);
    }],
    ['bay', 1024, 1280, 768, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 200px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('BAY', w / 2, h / 2 + 10);
    }],
    ['oil', 0, 1024, 512, 512, (g, w, h) => {
      for (let i = 0; i < 40; i++) {
        const x = w / 2 + (Math.sin(i * 7.1) * 0.5) * w * 0.5;
        const y = h / 2 + (Math.cos(i * 3.3) * 0.5) * h * 0.5;
        const grd = g.createRadialGradient(x, y, 2, x, y, 60 + (i % 5) * 20);
        grd.addColorStop(0, 'rgba(255,255,255,0.5)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      }
    }],
  ];
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  for (const [name, x, y, w, h, draw] of cells) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    draw(g, w, h);
    // Wear: punch holes in the paint.
    g.globalCompositeOperation = 'destination-out';
    let seed = x * 7 + y * 13 + 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (w * h) / 220; i++) {
      g.globalAlpha = r() * 0.9;
      g.beginPath();
      g.arc(r() * w, r() * h, r() * 5 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    DECAL_CELLS[name] = [x / S, 1 - (y + h) / S, w / S, h / S];
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.flipY = true;
  atlas = t;
  return t;
}

/** Shared uniforms for the rim light: its colour and the key light's direction in view space (set per shot). */
export const RIM = {
  color: { value: new THREE.Color(0xfff1e0) },
  strength: { value: 0.35 },
  dir: { value: new THREE.Vector3(0, 0, 1) },
};

const GRIME_GLSL = `
float gH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gN(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH(i), gH(i + vec3(1,0,0)), f.x), mix(gH(i + vec3(0,1,0)), gH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gH(i + vec3(0,0,1)), gH(i + vec3(1,0,1)), f.x), mix(gH(i + vec3(0,1,1)), gH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gF(vec3 p){ return gN(p) * 0.5 + gN(p * 2.03) * 0.25 + gN(p * 4.01) * 0.125 + gN(p * 8.02) * 0.0625; }
`;

/**
 * Shader additions, composed per material: the fresnel rim light (figures, replicas) and weathering (props, maps).
 * Weathering works in world space, so it never repeats with the texture: dirt patches, grime splashed up the lowest
 * half metre of every wall, streaks running down from the tops, rust on painted steel.
 */
function patch(m: THREE.Material, rim: boolean, grime: number, rust: number): void {
  if (!rim && grime <= 0) return;
  m.customProgramCacheKey = () => `p:${rim}:${grime}:${rust}`;
  m.onBeforeCompile = (s) => {
    if (rim) {
      s.uniforms.rimColor = RIM.color;
      s.uniforms.rimStrength = RIM.strength;
      s.uniforms.rimDir = RIM.dir;
    }
    if (grime > 0) {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW; varying vec3 vGrimeN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGrimeW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGrimeN = normalize(mat3(modelMatrix) * objectNormal);');
    }
    let head = '#include <common>\n';
    if (rim) head += 'uniform vec3 rimColor; uniform float rimStrength; uniform vec3 rimDir;\n';
    if (grime > 0) head += 'varying vec3 vGrimeW; varying vec3 vGrimeN;\n' + GRIME_GLSL;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', head);
    if (grime > 0) {
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float grimeG = 0.0;
          {
            vec3 wp = vGrimeW;
            vec3 wn = normalize(vGrimeN);
            float vert = 1.0 - abs(wn.y);
            float big = gF(wp * 0.33);
            float fine = gN(wp * 3.7);
            float patchy = smoothstep(0.5, 0.82, big * 0.85 + fine * 0.2);
            float creep = (1.0 - smoothstep(0.0, 0.45 + fine * 0.5, wp.y)) * vert;
            float streak = smoothstep(0.58, 0.95, gN(vec3((wp.x + wp.z) * 9.0, wp.y * 0.22, (wp.z - wp.x) * 9.0))) * vert * (0.4 + 0.6 * big);
            grimeG = clamp(patchy * 0.38 + creep * 0.6 + streak * 0.32, 0.0, 1.0) * ${grime.toFixed(2)};
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            vec3 dirt = mix(diffuseColor.rgb, vec3(lum), 0.45) * vec3(0.6, 0.55, 0.48);
            diffuseColor.rgb = mix(diffuseColor.rgb, dirt, grimeG);
            ${rust > 0 ? `float rs = smoothstep(0.6, 0.78, gF(wp * 1.1 + 7.3) + fine * 0.08) * (0.35 + creep * 0.6 + streak * 0.9);
            rs = clamp(rs, 0.0, 1.0) * ${rust.toFixed(2)};
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.17, 0.07) * (0.7 + fine * 0.6), rs * 0.85);
            grimeG = max(grimeG, rs);` : ''}
          }`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, grimeG * 0.6);');
    }
    if (rim) {
      s.fragmentShader = s.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float fres = pow(1.0 - saturate(dot(normal, vdir)), 2.6);
          float side = 0.35 + 0.65 * saturate(dot(normal, rimDir) * 0.5 + 0.5);
          outgoingLight += rimColor * fres * side * rimStrength * (0.6 + 0.4 * diffuseColor.rgb);
        }
        #include <opaque_fragment>`,
      );
    }
  };
}

export class Kit {
  private readonly mats = new Map<string, THREE.Material>();
  private readonly geos = new Map<string, THREE.BufferGeometry[]>();
  envMap: THREE.Texture | null = null;

  constructor(readonly p: Preset) {}

  mat(key: string): THREE.Material {
    const hit = this.mats.get(key);
    if (hit) return hit;
    const d = MATS[key];
    if (!d) throw new Error(`no material ${key}`);
    let m: THREE.Material;
    const set = d.tex ? d.tex(d.big ? this.p.bigTex : this.p.tex, this.p.surfaceMaps) : d.canvas ? { map: d.canvas() } : undefined;
    if (d.unlit) {
      m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, fog: true });
    } else if (!this.p.pbr) {
      m = new THREE.MeshLambertMaterial({ vertexColors: true, map: set?.map ?? null });
    } else {
      const physical = d.clearcoat !== undefined;
      const params: THREE.MeshPhysicalMaterialParameters = {
        vertexColors: true,
        map: set?.map ?? null,
        normalMap: set?.normalMap ?? null,
        roughnessMap: set?.roughnessMap ?? null,
        roughness: d.rough ?? 0.8,
        metalness: d.metal ?? 0,
        envMap: this.envMap,
        envMapIntensity: d.envIntensity ?? 0.9,
      };
      if (set?.normalMap) params.normalScale = new THREE.Vector2(d.normalScale ?? 1, d.normalScale ?? 1);
      if (physical) {
        params.clearcoat = d.clearcoat;
        params.clearcoatRoughness = 0.15;
      }
      m = physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
    }
    if (d.opacity !== undefined) {
      m.transparent = true;
      m.opacity = d.opacity;
      (m as THREE.MeshStandardMaterial).depthWrite = false;
    }
    if (d.side !== undefined) m.side = d.side;
    if (d.alphaTest !== undefined) {
      m.alphaTest = d.alphaTest;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
    }
    patch(m, !!(d.rim && this.p.rim), d.grime ?? 0, d.rust ?? 0);
    this.mats.set(key, m);
    return m;
  }

  /** A box, rounded on presets with bevels; centred at the origin. */
  boxGeo(w: number, h: number, d: number, radius = 0.02): THREE.BufferGeometry {
    const segs = this.p.bevelSegments;
    const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
    if (segs > 0 && r > 0.001) return new RoundedBoxGeometry(w, h, d, segs, r);
    return new THREE.BoxGeometry(w, h, d);
  }

  /**
   * Adds a piece. `geo` is placed by `m` (a matrix) and coloured `tint`; `ground` is the height it stands on (it darkens
   * towards it), `uvMetres` overrides the material's texture scale.
   */
  add(key: string, geo: THREE.BufferGeometry, m: THREE.Matrix4 | null, tint: number | THREE.Color, opts: { ground?: number; groundRange?: number; uvMetres?: number; uvRot?: boolean; worldUv?: boolean; colorFn?: (x: number, y: number, z: number) => number } = {}): void {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const c = tint instanceof THREE.Color ? tint : new THREE.Color(tint);
    const metres = opts.uvMetres ?? T.TEX_METRES[MATS[key]?.texKey ?? ''] ?? 1;
    const uv = new Float32Array(n * 2);
    const oldUv = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let k = 1;
      if (opts.ground !== undefined) {
        const above = y - opts.ground;
        k = THREE.MathUtils.lerp(this.p.ao ? 0.7 : 0.55, 1, THREE.MathUtils.smoothstep(above, 0, opts.groundRange ?? 0.6));
      }
      if (opts.colorFn) {
        k *= opts.colorFn(x, y, z);
      }
      col[i * 3] = c.r * k;
      col[i * 3 + 1] = c.g * k;
      col[i * 3 + 2] = c.b * k;
      if (opts.worldUv === false && oldUv) {
        uv[i * 2] = oldUv.getX(i);
        uv[i * 2 + 1] = oldUv.getY(i);
        continue;
      }
      const ax = Math.abs(nrm.getX(i));
      const ay = Math.abs(nrm.getY(i));
      const az = Math.abs(nrm.getZ(i));
      let u: number;
      let v: number;
      if (ay >= ax && ay >= az) {
        u = x;
        v = z;
      } else if (ax >= az) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      if (opts.uvRot) [u, v] = [v, u];
      uv[i * 2] = u / metres;
      uv[i * 2 + 1] = v / metres;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    let list = this.geos.get(key);
    if (!list) this.geos.set(key, (list = []));
    list.push(g);
  }

  /** Shorthand: a box of size (w, h, d) centred at (x, y, z), rotated `ry` about Y. */
  box(key: string, x: number, y: number, z: number, w: number, h: number, d: number, tint: number | THREE.Color, opts: { ground?: number; radius?: number; ry?: number; uvMetres?: number; uvRot?: boolean } = {}): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.ry ?? 0), new THREE.Vector3(1, 1, 1));
    this.add(key, this.boxGeo(w, h, d, opts.radius ?? 0.02), m, tint, opts);
  }

  /** Merges what was added into one mesh per material. */
  build(shadows = true): THREE.Group {
    const group = new THREE.Group();
    for (const [key, list] of this.geos) {
      const merged = mergeGeometries(list, false);
      if (!merged) throw new Error(`merge failed: ${key}`);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mat(key));
      mesh.name = key;
      const d = MATS[key]!;
      mesh.castShadow = shadows && !d.unlit && d.opacity === undefined && !d.canvas;
      mesh.receiveShadow = shadows && !d.unlit;
      if (d.opacity !== undefined) mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.geos.clear();
    return group;
  }
}
