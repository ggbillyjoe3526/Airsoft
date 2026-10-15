// Swaps some clips of a figure glb as Blender exports it for the same clips from another export of the same figure (IM8),
// leaving everything else in the file as it is: a clip re-made by a later layer goes into the approved figure without
// a full rebuild, which would re-make the meshes too (pip bpy's builds don't reproduce v10's meshes to the bit).
//   node tools/blender/bot-figure/splice.mjs base.glb donor.glb out.glb CrouchIdle,CrouchWalk
// Both files are unpacked Blender exports (pack.mjs runs after this). Each named clip of the donor replaces the base's
// clip of that name in place (same slot in the file's clip order), or is added after the base's clips when it has none
// (a new clip, such as the figure redesign's Rest clips and Vault: add its entry to the sidecar too), its tracks
// retargeted to the base's bones by name.
// The base's old key data stays in the binary chunk unused: pack.mjs keeps only what the file uses.
import { readFileSync, writeFileSync } from 'node:fs';

const [baseFile, donorFile, outFile, names] = process.argv.slice(2);
if (!baseFile || !donorFile || !outFile || !names) {
  console.error('usage: node tools/blender/bot-figure/splice.mjs base.glb donor.glb out.glb Clip1,Clip2');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const align4 = (n) => (n + 3) & ~3;

function readGlb(path) {
  const file = readFileSync(path);
  const head = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (head.getUint32(0, true) !== GLB_MAGIC) throw new Error(`${path} is not a binary glTF`);
  const jsonLength = head.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(file.subarray(20, 20 + jsonLength)));
  const bin = file.subarray(28 + jsonLength, 28 + jsonLength + head.getUint32(20 + jsonLength, true));
  if (json.extensionsUsed?.includes('EXT_meshopt_compression')) throw new Error(`${path} is packed: splice the Blender export`);
  if (json.buffers.length !== 1 || json.bufferViews.some((v) => v.byteStride)) throw new Error(`${path} is not a Blender figure export`);
  return { json, bin };
}

const base = readGlb(baseFile);
const donor = readGlb(donorFile);
const nodeOf = new Map(base.json.nodes.map((n, i) => [n.name, i]));
const pieces = [base.bin];
let binLength = align4(base.bin.byteLength);

/** Copies a donor accessor's data into the base's binary chunk (one view each) and returns the new accessor's index. */
function copyAccessor(index) {
  const a = donor.json.accessors[index];
  const view = donor.json.bufferViews[a.bufferView];
  const start = view.byteOffset + (a.byteOffset ?? 0);
  const size = a.count * { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type] * 4;
  if (a.componentType !== 5126 || !size) throw new Error(`clip data of an unexpected kind (${a.type}, ${a.componentType})`);
  const bytes = donor.bin.subarray(start, start + size);
  pieces.push({ at: binLength, bytes });
  base.json.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: size });
  binLength = align4(binLength + size);
  base.json.accessors.push({ ...a, bufferView: base.json.bufferViews.length - 1, byteOffset: undefined });
  return base.json.accessors.length - 1;
}

for (const name of names.split(',')) {
  const at = base.json.animations.findIndex((a) => a.name === name);
  const from = donor.json.animations.find((a) => a.name === name);
  if (!from) throw new Error(`no clip "${name}" in ${donorFile}`);
  const inputs = new Map();
  const samplers = [];
  const channels = from.channels.map((c) => {
    const s = from.samplers[c.sampler];
    const bone = donor.json.nodes[c.target.node].name;
    const node = nodeOf.get(bone);
    if (node === undefined) throw new Error(`the base has no "${bone}" for ${name}`);
    if (!inputs.has(s.input)) inputs.set(s.input, copyAccessor(s.input));
    samplers.push({ input: inputs.get(s.input), output: copyAccessor(s.output), interpolation: s.interpolation });
    return { sampler: samplers.length - 1, target: { node, path: c.target.path } };
  });
  if (at < 0) {
    base.json.animations.push({ name, channels, samplers });
    console.log(`${name}: added, ${channels.length} tracks`);
    continue;
  }
  const old = base.json.animations[at];
  base.json.animations[at] = { ...old, channels, samplers };
  console.log(`${name}: ${old.channels.length} tracks -> ${channels.length}`);
}

const bin = new Uint8Array(binLength);
bin.set(base.bin, 0);
for (const p of pieces.slice(1)) bin.set(p.bytes, p.at);
base.json.buffers[0].byteLength = binLength;
const text = new TextEncoder().encode(JSON.stringify(base.json));
const jsonChunk = new Uint8Array(align4(text.byteLength)).fill(0x20);
jsonChunk.set(text);
const out = new Uint8Array(12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength);
const o = new DataView(out.buffer);
o.setUint32(0, GLB_MAGIC, true);
o.setUint32(4, 2, true);
o.setUint32(8, out.byteLength, true);
o.setUint32(12, jsonChunk.byteLength, true);
o.setUint32(16, CHUNK_JSON, true);
out.set(jsonChunk, 20);
o.setUint32(20 + jsonChunk.byteLength, bin.byteLength, true);
o.setUint32(24 + jsonChunk.byteLength, CHUNK_BIN, true);
out.set(bin, 28 + jsonChunk.byteLength);
writeFileSync(outFile, out);
console.log(`${baseFile} + ${names} from ${donorFile} -> ${outFile} ${(out.byteLength / 1e3).toFixed(0)} kB`);
