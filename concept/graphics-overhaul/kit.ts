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
}

export const MATS: Record<string, MatDef> = {
  concrete: { tex: T.concrete, texKey: 'concrete', big: true, rough: 0.9 },
  blocks: { tex: T.blocks, texKey: 'blocks', rough: 0.85 },
  plaster: { tex: T.plaster, texKey: 'plaster', rough: 0.9 },
  paint: { tex: T.plaster, texKey: 'plaster', rough: 0.6 },
  corrugated: { tex: T.corrugated, texKey: 'corrugated', rough: 0.5, metal: 0.25 },
  cladding: { tex: T.cladding, texKey: 'cladding', rough: 0.5, metal: 0.2 },
  steel: { tex: T.metal, texKey: 'metal', rough: 0.4, metal: 0.7 },
  planks: { tex: T.planks, texKey: 'planks', rough: 0.8 },
  plywood: { tex: T.plywood, texKey: 'plywood', rough: 0.85 },
  fabric: { tex: T.fabric, texKey: 'fabric', rough: 0.95 },
  stones: { tex: T.stones, texKey: 'stones', rough: 0.9 },
  tread: { tex: T.tread, texKey: 'tread', rough: 0.4, metal: 0.6 },
  grass: { tex: T.grass, texKey: 'grass', big: true, rough: 0.95 },
  plastic: { tex: T.polymer, texKey: 'polymer', rough: 0.45 },
  film: { rough: 0.15, opacity: 0.55, clearcoat: 1 },
  tank: { rough: 0.35, opacity: 0.82 },
  foliage: { rough: 0.8 },
  rubber: { rough: 0.9 },
  dark: { rough: 0.7 },
  glow: { unlit: true },
  hazard: { tex: T.hazard, texKey: 'hazard', rough: 0.6 },
  puddle: { rough: 0.04, envIntensity: 1.4 },
  // Figures
  cloth: { tex: T.weave, texKey: 'weave', rough: 0.95, rim: true },
  gear: { tex: T.weave, texKey: 'weave', rough: 0.8, rim: true },
  armour: { tex: T.polymer, texKey: 'polymer', rough: 0.4, rim: true, clearcoat: 0.3 },
  skin: { rough: 0.6, rim: true },
  visor: { rough: 0.05, metal: 0.4, rim: true, clearcoat: 1, envIntensity: 1.6 },
  figGlow: { unlit: true, rim: false },
  figRubber: { rough: 0.85, rim: true },
  // Replicas
  gunPolymer: { tex: T.polymer, texKey: 'polymer', rough: 0.5, rim: true },
  gunMetal: { tex: T.metal, texKey: 'metal', rough: 0.45, metal: 0.8, rim: true },
  gunFurniture: { tex: T.polymer, texKey: 'polymer', rough: 0.55, rim: true },
  gunRubber: { tex: T.weave, texKey: 'weave', rough: 0.9, rim: true, normalScale: 2 },
  lens: { rough: 0.02, metal: 0.2, clearcoat: 1, envIntensity: 2, rim: true },
};

/** Shared uniforms for the rim light: its colour and the key light's direction in view space (set per shot). */
export const RIM = {
  color: { value: new THREE.Color(0xfff1e0) },
  strength: { value: 0.55 },
  dir: { value: new THREE.Vector3(0, 0, 1) },
};

function addRim(m: THREE.Material): void {
  m.onBeforeCompile = (s) => {
    s.uniforms.rimColor = RIM.color;
    s.uniforms.rimStrength = RIM.strength;
    s.uniforms.rimDir = RIM.dir;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimStrength; uniform vec3 rimDir;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float fres = pow(1.0 - saturate(dot(normal, vdir)), 2.6);
          float side = 0.35 + 0.65 * saturate(dot(normal, rimDir) * 0.5 + 0.5);
          outgoingLight += rimColor * fres * side * rimStrength * (0.6 + 0.4 * diffuseColor.rgb);
        }
        #include <opaque_fragment>`,
      );
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
    const set = d.tex ? d.tex(d.big ? this.p.bigTex : this.p.tex, this.p.surfaceMaps) : undefined;
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
    if (d.rim && this.p.rim) addRim(m);
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
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) { console.error('NaN in', key, JSON.stringify(geo.parameters ?? {}), new Error().stack?.split('\n').slice(2,4).join(' ')); break; }
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
      mesh.castShadow = shadows && !d.unlit && d.opacity === undefined;
      mesh.receiveShadow = shadows && !d.unlit;
      if (d.opacity !== undefined) mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.geos.clear();
    return group;
  }
}
