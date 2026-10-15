// Turns a packed figure glb (pack.mjs) back into a plain export, so a clip can be spliced into a figure whose Blender
// export isn't kept (BP4: the robot was built in a cloud container, and a rebuild moves a few vertices):
//   node tools/blender/bot-figure/unpack.mjs src/assets/models/characters/robot.glb robot_plain.glb
// Every meshopt-encoded view is decoded into one plain buffer, in place; accessors, nodes, clips and the re-deflated
// textures stay as they are. pack.mjs then packs it again to the same bytes, with any spliced clips added.
// Run from the repo root: it uses the meshoptimizer decoder npm installs with three's types (node_modules).
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: node tools/blender/bot-figure/unpack.mjs packed.glb plain.glb');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const EXT = 'EXT_meshopt_compression';
const align4 = (n) => (n + 3) & ~3;

const file = readFileSync(inFile);
const head = new DataView(file.buffer, file.byteOffset, file.byteLength);
if (head.getUint32(0, true) !== GLB_MAGIC) throw new Error(`${inFile} is not a binary glTF`);
const jsonLength = head.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(file.subarray(20, 20 + jsonLength)));
const bin = file.subarray(28 + jsonLength, 28 + jsonLength + head.getUint32(20 + jsonLength, true));
if (!json.extensionsUsed?.includes(EXT)) throw new Error(`${inFile} is not packed`);
if (json.buffers.length !== 2 || !json.buffers[1].extensions?.[EXT]?.fallback) throw new Error(`${inFile} was not packed by pack.mjs`);

await MeshoptDecoder.ready;
const chunks = [];
let binLength = 0;
json.bufferViews = json.bufferViews.map((view) => {
  const m = view.extensions?.[EXT];
  let bytes;
  if (m) {
    bytes = new Uint8Array(m.count * m.byteStride);
    MeshoptDecoder.decodeGltfBuffer(bytes, m.count, m.byteStride, bin.subarray(m.byteOffset, m.byteOffset + m.byteLength), m.mode, m.filter);
  } else bytes = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
  const out = { buffer: 0, byteOffset: binLength, byteLength: bytes.byteLength };
  if (view.target !== undefined) out.target = view.target;
  chunks.push({ at: binLength, bytes });
  binLength = align4(binLength + bytes.byteLength);
  return out;
});
json.buffers = [{ byteLength: binLength }];
json.extensionsUsed = json.extensionsUsed.filter((e) => e !== EXT);
json.extensionsRequired = (json.extensionsRequired ?? []).filter((e) => e !== EXT);
if (json.extensionsUsed.length === 0) delete json.extensionsUsed;
if (json.extensionsRequired.length === 0) delete json.extensionsRequired;

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
console.log(`${inFile} ${Math.round(file.byteLength / 1000)} kB -> ${outFile} ${Math.round(out.byteLength / 1000)} kB`);
