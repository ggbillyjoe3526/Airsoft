// Packs a figure glb as Blender exports it into the file the game ships (IM5), with nothing the game draws changed:
//   1. drops the animation tracks that hold a bone at its rest value, by the rule render/figures/figureRig.ts drops them with
//      at load (the mixer leaves an undriven bone at rest), keeping at least one track per clip so its length stays;
//   2. stores the vertex, index, skin and animation data with meshopt's lossless codec (EXT_meshopt_compression, which
//      the game decodes with three's MeshoptDecoder, render/figures/externalModels.ts). No quantisation, no filters and no
//      reordering: every value the game reads decodes to the same bits, so the figures draw pixel for pixel the same;
//   3. re-deflates the PNG textures harder (Blender saves them fast): the same pixels and the same colour chunks.
// Node, mesh, material, bone and clip names, every kept key and everything else in the file stay as they are.
//   node tools/blender/bot-figure/pack.mjs in.glb out.glb
// Run from the repo root: it uses the meshoptimizer encoder npm installs with three's types (node_modules).
import { readFileSync, writeFileSync } from 'node:fs';
import { constants, crc32, deflateSync, inflateSync } from 'node:zlib';
import { MeshoptEncoder } from 'meshoptimizer/encoder';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: node tools/blender/bot-figure/pack.mjs in.glb out.glb');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const EXT = 'EXT_meshopt_compression';
/** The game's tolerance for "at rest" (render/figures/figureRig.ts stillAt). */
const REST_EPS = 1e-5;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const REST = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

// ---- Read the GLB ----
const file = readFileSync(inFile);
const head = new DataView(file.buffer, file.byteOffset, file.byteLength);
if (head.getUint32(0, true) !== GLB_MAGIC) throw new Error(`${inFile} is not a binary glTF`);
const jsonLength = head.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(file.subarray(20, 20 + jsonLength)));
const bin = file.subarray(28 + jsonLength, 28 + jsonLength + head.getUint32(20 + jsonLength, true));
if (json.extensionsUsed?.includes(EXT)) throw new Error(`${inFile} is already packed`);
if (json.buffers.length !== 1 || json.accessors.some((a) => a.sparse) || json.bufferViews.some((v) => v.byteStride)) {
  throw new Error(`${inFile} has more than one buffer, a sparse accessor or interleaved data: not a Blender figure export`);
}

const elementBytes = (a) => COMPONENTS[a.type] * ARRAYS[a.componentType].BYTES_PER_ELEMENT;
/** An accessor's bytes, copied out of the binary chunk. */
function accessorBytes(index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const start = view.byteOffset + (a.byteOffset ?? 0);
  return bin.slice(start, start + a.count * elementBytes(a));
}
const floats = (index) => {
  const bytes = accessorBytes(index);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

// ---- 1: the tracks the game plays ----
/** Track values that never leave `rest` (a quaternion's sign aside): render/figures/figureRig.ts stillAt. */
function stillAt(v, rest) {
  const n = rest.length;
  for (let k = 0; k < v.length; k += n) {
    let same = true;
    let flipped = n === 4;
    for (let j = 0; j < n; j++) {
      if (Math.abs(v[k + j] - rest[j]) > REST_EPS) same = false;
      if (flipped && Math.abs(-v[k + j] - rest[j]) > REST_EPS) flipped = false;
    }
    if (!same && !flipped) return false;
  }
  return true;
}

const joints = new Set(json.skins.flatMap((s) => s.joints));
const animationData = []; // per new accessor of an animation: { bytes, type, min, max }
const inputOf = new Map(); // identical key times share one accessor
const stats = { tracks: 0, keptTracks: 0 };
for (const animation of json.animations) {
  const lastTime = (c) => {
    const t = floats(animation.samplers[c.sampler].input);
    return t[t.length - 1];
  };
  const length = Math.max(...animation.channels.map(lastTime));
  const kept = animation.channels.filter((c) => {
    const rest = json.nodes[c.target.node][c.target.path] ?? REST[c.target.path];
    return !(joints.has(c.target.node) && rest && stillAt(floats(animation.samplers[c.sampler].output), rest));
  });
  // A clip keeps its length: an all-still clip keeps one full-length track, and the kept tracks must reach the end.
  if (kept.length === 0 || Math.max(...kept.map(lastTime)) !== length) kept.push(animation.channels.find((c) => lastTime(c) === length));
  stats.tracks += animation.channels.length;
  stats.keptTracks += kept.length;

  const samplers = [];
  animation.channels = kept.map((channel) => {
    const sampler = animation.samplers[channel.sampler];
    if (sampler.interpolation === 'CUBICSPLINE') throw new Error('cubic spline tracks are not handled');
    const times = accessorBytes(sampler.input);
    const key = Buffer.from(times).toString('base64');
    if (!inputOf.has(key)) {
      const t = floats(sampler.input);
      inputOf.set(key, animationData.length);
      animationData.push({ bytes: times, type: 'SCALAR', min: [t[0]], max: [t[t.length - 1]] });
    }
    const output = animationData.length;
    animationData.push({ bytes: accessorBytes(sampler.output), type: json.accessors[sampler.output].type });
    samplers.push({ input: inputOf.get(key), output, interpolation: sampler.interpolation });
    return { sampler: samplers.length - 1, target: channel.target };
  });
  animation.samplers = samplers; // accessor numbers into animationData for now; renumbered below
}

// ---- 2: the binary chunk, every accessor's data meshopt-encoded ----
await MeshoptEncoder.ready;
const accessors = [];
const bufferViews = [];
const chunks = []; // the binary chunk's pieces, each 4-aligned
let binLength = 0;
let fallbackLength = 0;
const align4 = (n) => (n + 3) & ~3;
const put = (bytes) => {
  const at = binLength;
  chunks.push({ at, bytes });
  binLength = align4(binLength + bytes.byteLength);
  return at;
};
/** A bufferView of `count` elements of `stride` bytes, stored meshopt-encoded in `mode`. */
function packedView(raw, count, stride, mode, target) {
  const encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode);
  const view = { buffer: 1, byteOffset: fallbackLength, byteLength: raw.byteLength };
  if (target !== undefined) view.target = target;
  view.extensions = { [EXT]: { buffer: 0, byteOffset: put(encoded), byteLength: encoded.byteLength, byteStride: stride, count, mode } };
  fallbackLength = align4(fallbackLength + raw.byteLength);
  bufferViews.push(view);
  return bufferViews.length - 1;
}

// The meshes' and skins' accessors keep their order and fields (min, max, normalised colours); one view each.
const indexAccessors = new Set(json.meshes.flatMap((m) => m.primitives.map((p) => p.indices)).filter((i) => i !== undefined));
const renumbered = new Map();
const used = [...new Set([...json.meshes.flatMap((m) => m.primitives.flatMap((p) => [...Object.values(p.attributes), p.indices])), ...json.skins.map((s) => s.inverseBindMatrices)])]
  .filter((i) => i !== undefined)
  .sort((a, b) => a - b);
for (const index of used) {
  const a = json.accessors[index];
  const raw = accessorBytes(index);
  const target = json.bufferViews[a.bufferView].target;
  // Indices as a plain sequence: the TRIANGLES mode may start a triangle at another corner, which moves a few edge
  // pixels where parts meet, and here it saves nothing.
  const view = packedView(raw, a.count, elementBytes(a), indexAccessors.has(index) ? 'INDICES' : 'ATTRIBUTES', target);
  renumbered.set(index, accessors.length);
  accessors.push({ ...a, bufferView: view, byteOffset: undefined });
}
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    if (p.mode !== undefined && p.mode !== 4) throw new Error('only triangle lists are handled');
    for (const k of Object.keys(p.attributes)) p.attributes[k] = renumbered.get(p.attributes[k]);
    if (p.indices !== undefined) p.indices = renumbered.get(p.indices);
  }
}
for (const skin of json.skins) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = renumbered.get(skin.inverseBindMatrices);

// The animations' accessors: one view per element size (key times, vec3 translations and scales, vec4 rotations).
const firstAnimationAccessor = accessors.length;
for (const type of ['SCALAR', 'VEC3', 'VEC4']) {
  const items = animationData.map((d, i) => ({ ...d, i })).filter((d) => d.type === type);
  if (items.length === 0) continue;
  const stride = COMPONENTS[type] * 4;
  const raw = new Uint8Array(items.reduce((s, d) => s + d.bytes.byteLength, 0));
  let offset = 0;
  const offsets = items.map((d) => {
    raw.set(d.bytes, offset);
    offset += d.bytes.byteLength;
    return offset - d.bytes.byteLength;
  });
  const view = packedView(raw, raw.byteLength / stride, stride, 'ATTRIBUTES');
  items.forEach((d, k) => {
    animationData[d.i].accessor = { bufferView: view, byteOffset: offsets[k] || undefined, componentType: 5126, count: d.bytes.byteLength / stride, type, min: d.min, max: d.max };
  });
}
animationData.forEach((d) => accessors.push(d.accessor));
for (const animation of json.animations) {
  for (const s of animation.samplers) {
    s.input += firstAnimationAccessor;
    s.output += firstAnimationAccessor;
  }
}

// ---- 3: the PNG textures, re-deflated, in plain views ----
/** The PNG predictor of filter `f` for byte `x` of row `y` (`bpp` bytes a pixel, rows `stride` bytes apart). */
function predict(px, f, y, x, stride, bpp) {
  const a = x >= bpp ? px[y * stride + x - bpp] : 0;
  const b = y > 0 ? px[(y - 1) * stride + x] : 0;
  const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
  if (f === 1) return a;
  if (f === 2) return b;
  if (f === 3) return (a + b) >> 1;
  if (f === 4) {
    const pa = Math.abs(b - c);
    const pb = Math.abs(a - c);
    const pc = Math.abs(a + b - 2 * c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }
  return 0;
}
/** The rows filtered with `filter` (0-4), or per row with the smallest sum of differences ('adaptive'). */
function filterRows(px, height, stride, bpp, filter) {
  const out = new Uint8Array(height * (stride + 1));
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let best = Infinity;
    for (const f of filter === 'adaptive' ? [0, 1, 2, 3, 4] : [filter]) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        row[x] = (px[y * stride + x] - predict(px, f, y, x, stride, bpp)) & 255;
        sum += row[x] < 128 ? row[x] : 256 - row[x];
      }
      if (sum < best) {
        best = sum;
        out[y * (stride + 1)] = f;
        out.set(row, y * (stride + 1) + 1);
      }
    }
  }
  return out;
}
/** `png` with its pixels deflated again, trying each filter and two zlib strategies; returns `png` when no smaller. */
function repackPng(png) {
  const chunks = [];
  for (let o = 8; o < png.byteLength; ) {
    const n = png.readUInt32BE(o);
    chunks.push({ type: png.toString('latin1', o + 4, o + 8), data: png.subarray(o + 8, o + 8 + n) });
    o += 12 + n;
  }
  const ihdr = chunks[0].data;
  const [width, height, depth, colour, interlace] = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9], ihdr[12]];
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  if (depth !== 8 || interlace !== 0 || !bpp) return png; // only what Blender writes: 8-bit, not interlaced, no palette
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) px[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predict(px, f, y, x, stride, bpp)) & 255;
  }
  let idat = null;
  for (const filter of ['adaptive', 0, 1, 2, 3, 4]) {
    const rows = filterRows(px, height, stride, bpp, filter);
    for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
      const d = deflateSync(rows, { level: 9, memLevel: 9, strategy });
      if (!idat || d.byteLength < idat.byteLength) idat = d;
    }
  }
  // The other chunks (the colour ones among them) stay as they were, in order; one IDAT where the first was.
  const parts = [png.subarray(0, 8)];
  let wrote = false;
  for (const c of chunks) {
    if (c.type === 'IDAT' && wrote) continue;
    const data = c.type === 'IDAT' ? idat : c.data;
    wrote ||= c.type === 'IDAT';
    const chunk = Buffer.alloc(12 + data.byteLength);
    chunk.writeUInt32BE(data.byteLength, 0);
    chunk.write(c.type, 4, 'latin1');
    chunk.set(data, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.byteLength)), 8 + data.byteLength);
    parts.push(chunk);
  }
  const out = Buffer.concat(parts);
  return out.byteLength < png.byteLength ? out : png;
}
let pngBefore = 0;
let pngAfter = 0;
for (const image of json.images ?? []) {
  const old = json.bufferViews[image.bufferView];
  let bytes = bin.subarray(old.byteOffset, old.byteOffset + old.byteLength);
  pngBefore += bytes.byteLength;
  if (image.mimeType === 'image/png') bytes = repackPng(Buffer.from(bytes));
  pngAfter += bytes.byteLength;
  bufferViews.push({ buffer: 0, byteOffset: put(bytes), byteLength: bytes.byteLength });
  image.bufferView = bufferViews.length - 1;
}

json.accessors = accessors;
json.bufferViews = bufferViews;
json.buffers = [{ byteLength: binLength }, { byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } }];
json.extensionsUsed = [...(json.extensionsUsed ?? []), EXT];
json.extensionsRequired = [...(json.extensionsRequired ?? []), EXT];

// ---- Write the GLB ----
const text = new TextEncoder().encode(JSON.stringify(json));
const jsonChunk = new Uint8Array(align4(text.byteLength)).fill(0x20);
jsonChunk.set(text);
const binChunk = new Uint8Array(binLength);
for (const c of chunks) binChunk.set(c.bytes, c.at);
const out = new Uint8Array(12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength);
const o = new DataView(out.buffer);
o.setUint32(0, GLB_MAGIC, true);
o.setUint32(4, 2, true);
o.setUint32(8, out.byteLength, true);
o.setUint32(12, jsonChunk.byteLength, true);
o.setUint32(16, CHUNK_JSON, true);
out.set(jsonChunk, 20);
o.setUint32(20 + jsonChunk.byteLength, binChunk.byteLength, true);
o.setUint32(24 + jsonChunk.byteLength, CHUNK_BIN, true);
out.set(binChunk, 28 + jsonChunk.byteLength);
writeFileSync(outFile, out);
console.log(
  `${inFile} ${(file.byteLength / 1e3).toFixed(0)} kB -> ${outFile} ${(out.byteLength / 1e3).toFixed(0)} kB ` +
    `(JSON ${(jsonLength / 1e3).toFixed(0)} -> ${(jsonChunk.byteLength / 1e3).toFixed(0)} kB; textures ${(pngBefore / 1e3).toFixed(0)} -> ${(pngAfter / 1e3).toFixed(0)} kB; ` +
    `tracks ${stats.tracks} -> ${stats.keptTracks})`,
);
