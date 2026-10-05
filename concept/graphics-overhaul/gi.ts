import * as THREE from 'three';

/**
 * Baked global illumination: a grid of light probes over the playable area, baked once when the map loads.
 *
 * The map's own meshes are turned into a voxel grid (solid or empty, with an average colour). Each probe then casts
 * rays: rays that reach the sky keep the sky and ground fill, rays that hit a prop block it and bring back that prop's
 * colour, brighter when the prop is in sunlight. Every lit material reads the probe grid by world position, so:
 *
 * - alleys, gaps between containers and the undersides of things get darker fill light (large-scale occlusion that
 *   screen-space AO cannot see), and their reflections dim too;
 * - colour bleeds: an orange container warms the ground and the wall beside it, a sunlit wall lights the shaded side
 *   of a figure standing next to it.
 *
 * Moving figures read the same grid, which is how games light dynamic objects from baked lighting. In the real game
 * the bake would run offline and ship with the map, so its runtime cost is one texture read per pixel on any preset.
 */

/** Shared uniforms: every patched material references these, so one bake lights the whole scene. */
export const GI = {
  tex: { value: null as THREE.Data3DTexture | null },
  min: { value: new THREE.Vector3() },
  size: { value: new THREE.Vector3(1, 1, 1) },
  on: { value: 0 },
  bounce: { value: 1.6 },
  occlusion: { value: 1.0 },
  /** 1 shows indirect light only (the page's gi=debug switch), for checking the bake. */
  debug: { value: 0 },
};

export const GI_GLSL_HEAD = 'uniform highp sampler3D giTex; uniform vec3 giMin; uniform vec3 giSize; uniform float giOn; uniform float giBounce; uniform float giOcclusion; uniform float giDebug;\nvarying vec3 vGiW; varying vec3 vGiN;\n';

/** Runs after three's light accumulation: scales the fill light by the probe's sky visibility and adds the bounce. */
export const GI_GLSL_APPLY = `
  if (giOn > 0.5) {
    vec3 giP = (vGiW + normalize(vGiN) * 0.28 - giMin) / giSize;
    float giIn = step(0.0, min(min(giP.x, giP.y), giP.z)) * step(max(max(giP.x, giP.y), giP.z), 1.0);
    vec4 gi = texture(giTex, giP);
    float giVis = mix(1.0, mix(1.0, gi.a, giOcclusion), giIn);
    reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * giVis + material.diffuseColor * RECIPROCAL_PI * gi.rgb * giBounce * giIn;
    reflectedLight.indirectSpecular *= mix(1.0, giVis, 0.8);
  }
  if (giDebug > 0.5) { reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); }
`;

export function giUniforms(u: Record<string, THREE.IUniform>): void {
  u.giTex = GI.tex;
  u.giMin = GI.min;
  u.giSize = GI.size;
  u.giOn = GI.on;
  u.giBounce = GI.bounce;
  u.giOcclusion = GI.occlusion;
  u.giDebug = GI.debug;
}

export interface BakeOpts {
  /** Voxel size for the solid grid, metres. */
  voxel: number;
  /** Probe spacing, metres. */
  probe: number;
  rays: number;
  /** How far a ray looks for a blocker, metres. */
  maxDist: number;
  sunDir: THREE.Vector3;
  /** Sun and sky strength used for the bounce (the scene's own light intensities). */
  sun: number;
  sky: THREE.Color;
  /** Below this height, a hit counts as open ground (the hemisphere light already gives the ground's fill). */
  groundY?: number;
}

export interface BakeStats {
  ms: number;
  probes: number;
  voxels: number;
  solid: number;
}

const SKIP = new Set(['decal', 'film', 'tank', 'lens', 'glow', 'figGlow', 'puddle']);

/** Bakes the probe grid for `root` inside `box` and switches it on. */
export function bakeGI(root: THREE.Object3D, box: THREE.Box3, o: BakeOpts): BakeStats {
  const t0 = performance.now();
  const v = o.voxel;
  const nx = Math.ceil((box.max.x - box.min.x) / v);
  const ny = Math.ceil((box.max.y - box.min.y) / v);
  const nz = Math.ceil((box.max.z - box.min.z) / v);
  const nVox = nx * ny * nz;
  const solid = new Uint8Array(nVox);
  const col = new Float32Array(nVox * 3);
  const cnt = new Uint16Array(nVox);
  const vi = (x: number, y: number, z: number) => x + nx * (y + ny * z);

  // 1. Voxelise: scatter points over every triangle of every opaque mesh and mark the voxels they land in.
  root.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const tint = new THREE.Color();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const im = new THREE.Matrix4();
  const wm = new THREE.Matrix4();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || SKIP.has(mesh.name)) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (Array.isArray(mat) || mat.transparent || (mat as THREE.Material).type === 'MeshBasicMaterial' || mat.type === 'ShaderMaterial') return;
    const g = mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const vc = g.attributes.color as THREE.BufferAttribute | undefined;
    const idx = g.index;
    const tris = (idx ? idx.count : pos.count) / 3;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const copies = inst ? inst.count : 1;
    // Big instanced sets (grass) never block light enough to matter; skip them.
    if (tris * copies > 3e6) return;
    const base = mat.color ?? new THREE.Color(1, 1, 1);
    for (let ci = 0; ci < copies; ci++) {
      wm.copy(mesh.matrixWorld);
      if (inst) wm.multiply((inst.getMatrixAt(ci, im), im));
      for (let t = 0; t < tris; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(wm);
        b.fromBufferAttribute(pos, i1).applyMatrix4(wm);
        c.fromBufferAttribute(pos, i2).applyMatrix4(wm);
        if (Math.max(a.x, b.x, c.x) < box.min.x || Math.min(a.x, b.x, c.x) > box.max.x || Math.max(a.y, b.y, c.y) < box.min.y || Math.min(a.y, b.y, c.y) > box.max.y || Math.max(a.z, b.z, c.z) < box.min.z || Math.min(a.z, b.z, c.z) > box.max.z) continue;
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        const area = ab.clone().cross(ac).length() * 0.5;
        const n = Math.min(60000, Math.ceil((area / (v * v)) * 3) + 1);
        if (vc) tint.setRGB(vc.getX(i0), vc.getY(i0), vc.getZ(i0));
        else tint.setRGB(1, 1, 1);
        tint.multiply(base);
        for (let s = 0; s < n; s++) {
          let u = rnd();
          let w = rnd();
          if (u + w > 1) {
            u = 1 - u;
            w = 1 - w;
          }
          p.copy(a).addScaledVector(ab, u).addScaledVector(ac, w);
          const x = Math.floor((p.x - box.min.x) / v);
          const y = Math.floor((p.y - box.min.y) / v);
          const z = Math.floor((p.z - box.min.z) / v);
          if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
          const k = vi(x, y, z);
          solid[k] = 1;
          if (cnt[k] < 60000) {
            col[k * 3] += tint.r;
            col[k * 3 + 1] += tint.g;
            col[k * 3 + 2] += tint.b;
            cnt[k]++;
          }
        }
      }
    }
  });
  // The scatter only marks surfaces, so props are hollow shells. Flood the empty space in from the volume's sides and
  // top; whatever the flood cannot reach is the inside of a prop and counts as solid (colour from a neighbour).
  {
    const seen = new Uint8Array(nVox);
    const queue = new Int32Array(nVox);
    let head = 0;
    let tail = 0;
    const push = (k: number) => {
      if (!solid[k] && !seen[k]) {
        seen[k] = 1;
        queue[tail++] = k;
      }
    };
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++) {
        push(vi(0, y, z));
        push(vi(nx - 1, y, z));
      }
    for (let x = 0; x < nx; x++)
      for (let y = 0; y < ny; y++) {
        push(vi(x, y, 0));
        push(vi(x, y, nz - 1));
      }
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) push(vi(x, ny - 1, z));
    while (head < tail) {
      const k = queue[head++]!;
      const x = k % nx;
      const y = Math.floor(k / nx) % ny;
      const z = Math.floor(k / (nx * ny));
      if (x > 0) push(k - 1);
      if (x < nx - 1) push(k + 1);
      if (y > 0) push(k - nx);
      if (y < ny - 1) push(k + nx);
      if (z > 0) push(k - nx * ny);
      if (z < nz - 1) push(k + nx * ny);
    }
    for (let k = 0; k < nVox; k++) {
      if (solid[k] || seen[k]) continue;
      solid[k] = 1;
      // Take the colour of the shell voxel below or beside it.
      const src = [k - nx, k - 1, k + 1, k - nx * ny, k + nx * ny].find((j) => j >= 0 && j < nVox && cnt[j]);
      if (src !== undefined) {
        col[k * 3] = col[src * 3]!;
        col[k * 3 + 1] = col[src * 3 + 1]!;
        col[k * 3 + 2] = col[src * 3 + 2]!;
        cnt[k] = cnt[src]!;
      } else {
        col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0.5;
        cnt[k] = 1;
      }
    }
  }
  let nSolid = 0;
  for (let k = 0; k < nVox; k++) {
    if (!solid[k]) continue;
    nSolid++;
    const m = 1 / cnt[k]!;
    // Textures average a little darker than their tint.
    col[k * 3] *= m * 0.8;
    col[k * 3 + 1] *= m * 0.8;
    col[k * 3 + 2] *= m * 0.8;
  }

  // Voxels hit by the sun (cached as they are asked for): 0 unknown, 1 shade, 2 sunlit.
  const lit = new Uint8Array(nVox);
  const sd = o.sunDir.clone().normalize();
  const sunLit = (x: number, y: number, z: number): boolean => {
    const k = vi(x, y, z);
    if (lit[k]) return lit[k] === 2;
    // Start just outside the voxel's sunward face and walk towards the sun.
    let px = box.min.x + (x + 0.5) * v + sd.x * v * 1.2;
    let py = box.min.y + (y + 0.5) * v + sd.y * v * 1.2;
    let pz = box.min.z + (z + 0.5) * v + sd.z * v * 1.2;
    let r = 2;
    for (let s = 0; s < 400; s++) {
      const ix = Math.floor((px - box.min.x) / v);
      const iy = Math.floor((py - box.min.y) / v);
      const iz = Math.floor((pz - box.min.z) / v);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) break;
      if (solid[vi(ix, iy, iz)] && !(ix === x && iy === y && iz === z)) {
        r = 1;
        break;
      }
      px += sd.x * v;
      py += sd.y * v;
      pz += sd.z * v;
    }
    lit[k] = r;
    return r === 2;
  };

  // 2. Probes: rays spread evenly over the sphere (a Fibonacci set).
  const R = o.rays;
  const dirs: THREE.Vector3[] = [];
  for (let i = 0; i < R; i++) {
    const y = 1 - ((i + 0.5) / R) * 2;
    const r = Math.sqrt(1 - y * y);
    const ph = i * 2.399963;
    dirs.push(new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r));
  }
  const pv = o.probe;
  const px = Math.ceil((box.max.x - box.min.x) / pv) + 1;
  const py = Math.ceil((box.max.y - box.min.y) / pv) + 1;
  const pz = Math.ceil((box.max.z - box.min.z) / pv) + 1;
  const nP = px * py * pz;
  const out = new Float32Array(nP * 4);
  const done = new Uint8Array(nP);
  const groundY = o.groundY ?? 0.06;
  const steps = Math.ceil(o.maxDist / (v * 0.9));
  const sunRad = o.sun * 0.5; // average cosine on the lit face
  const skyRad = (o.sky.r + o.sky.g + o.sky.b) / 3;
  for (let iz = 0; iz < pz; iz++)
    for (let iy = 0; iy < py; iy++)
      for (let ix = 0; ix < px; ix++) {
        const wx = box.min.x + ix * pv;
        const wy = box.min.y + iy * pv;
        const wz = box.min.z + iz * pv;
        const q = ix + px * (iy + py * iz);
        const cx = Math.floor((wx - box.min.x) / v);
        const cy = Math.floor((wy - box.min.y) / v);
        const cz = Math.floor((wz - box.min.z) / v);
        if (cx >= 0 && cy >= 0 && cz >= 0 && cx < nx && cy < ny && cz < nz && solid[vi(cx, cy, cz)]) continue; // filled in below
        let open = 0;
        let br = 0;
        let bg = 0;
        let bb = 0;
        for (const d of dirs) {
          let hit = -1;
          let hx = 0;
          let hy = 0;
          let hz = 0;
          for (let s = 1; s <= steps; s++) {
            const t = s * v * 0.9;
            const sx = Math.floor((wx + d.x * t - box.min.x) / v);
            const sy = Math.floor((wy + d.y * t - box.min.y) / v);
            const sz = Math.floor((wz + d.z * t - box.min.z) / v);
            if (sx < 0 || sy < 0 || sz < 0 || sx >= nx || sy >= ny || sz >= nz) break;
            const k = vi(sx, sy, sz);
            if (solid[k]) {
              hit = k;
              hx = sx;
              hy = sy;
              hz = sz;
              break;
            }
          }
          if (hit < 0 || box.min.y + (hy + 1) * v <= groundY) {
            open++;
            continue;
          }
          // A blocker: its colour, lit by the sun if the sun reaches it, else by the sky alone.
          const e = (sunLit(hx, hy, hz) ? sunRad : 0) + skyRad * 0.5;
          br += col[hit * 3]! * e;
          bg += col[hit * 3 + 1]! * e;
          bb += col[hit * 3 + 2]! * e;
        }
        out[q * 4] = (br / R) * 2;
        out[q * 4 + 1] = (bg / R) * 2;
        out[q * 4 + 2] = (bb / R) * 2;
        // Fill light is mostly from above: weigh openness towards 1 as a probe sees half its sphere (open yard).
        out[q * 4 + 3] = Math.min(1, (open / R) * 1.15 + 0.05);
        done[q] = 1;
      }
  // Probes inside solid voxels take the average of their open neighbours (repeated to reach thick blocks).
  for (let pass = 0; pass < 6; pass++) {
    const add: [number, number, number, number, number][] = [];
    for (let iz = 0; iz < pz; iz++)
      for (let iy = 0; iy < py; iy++)
        for (let ix = 0; ix < px; ix++) {
          const q = ix + px * (iy + py * iz);
          if (done[q]) continue;
          let n = 0;
          const s = [0, 0, 0, 0];
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
            const jx = ix + dx;
            const jy = iy + dy;
            const jz = iz + dz;
            if (jx < 0 || jy < 0 || jz < 0 || jx >= px || jy >= py || jz >= pz) continue;
            const j = jx + px * (jy + py * jz);
            if (!done[j]) continue;
            for (let c4 = 0; c4 < 4; c4++) s[c4] += out[j * 4 + c4]!;
            n++;
          }
          if (n) add.push([q, s[0]! / n, s[1]! / n, s[2]! / n, s[3]! / n]);
        }
    for (const [q, r, g, bl, al] of add) {
      out[q * 4] = r;
      out[q * 4 + 1] = g;
      out[q * 4 + 2] = bl;
      out[q * 4 + 3] = al;
      done[q] = 1;
    }
  }
  for (let q = 0; q < nP; q++) if (!done[q]) out[q * 4 + 3] = 1;

  const half = new Uint16Array(nP * 4);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(out[i]!);
  const tex = new THREE.Data3DTexture(half, px, py, pz);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  GI.tex.value = tex;
  // Texel centres sit on the probes: the volume spans half a probe beyond the first and last.
  GI.min.value.set(box.min.x - pv / 2, box.min.y - pv / 2, box.min.z - pv / 2);
  GI.size.value.set(px * pv, py * pv, pz * pv);
  GI.on.value = 1;
  return { ms: Math.round(performance.now() - t0), probes: nP, voxels: nVox, solid: nSolid };
}
