// Arms and hands check for a bot figure glb: wrist bend and twist, elbow angle, skin thinning at the wrist and elbow,
// frame-to-frame snaps and finger movement, per clip. Run from the repo root (needs three from node_modules):
//   node tools/blender/bot-figure/check/arms-check.mjs path/to/bot_human_v5.glb
globalThis.self = globalThis;
globalThis.URL.createObjectURL = () => 'x';
class FakeImg { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } addEventListener(e, f) { if (e === 'load') setTimeout(f, 0); } removeEventListener() {} }
globalThis.Image = FakeImg;
globalThis.document = { createElementNS: () => new FakeImg() };
const fs = await import('node:fs');
const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');

// Limits a natural arm stays inside (degrees, and the share of the rest thickness the skin keeps). wristTwist is the
// turn left at the wrist joint itself (hand against the last forearm bone that deforms the skin); forearmTurn is the
// whole turn of the palm against the elbow, which a real forearm does up to about 90 degrees each way.
const LIMIT = { wristBend: 75, wristTwist: 60, forearmTurn: 95, skinKeep: 0.85, snap: 40 };
const D = 180 / Math.PI;
const file = process.argv[2];
const buf = fs.readFileSync(file);

function twistAboutY(q) {
  const t = new THREE.Quaternion(0, q.y, 0, q.w).normalize();
  const a = 2 * Math.atan2(t.y, t.w) * D;
  return ((a + 540) % 360) - 180;
}

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (g) => {
  const scene = g.scene;
  const bones = {};
  scene.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const skins = [];
  scene.traverse((o) => { if (o.isSkinnedMesh && /^Body(_\d)?$/.test(o.name)) skins.push(o); });
  const rest = {};
  for (const n in bones) rest[n] = bones[n].quaternion.clone();
  scene.updateMatrixWorld(true);

  // Vertices shared between two bone groups form the ring whose thickness shows pinching. The forearm group is the
  // Forearm bone plus its twist bones (ForearmTwist1-4) when the figure has them. An elbow helper bone (half-way
  // between the two) carries the crease, so it counts on both sides of the elbow ring.
  const forearm = (s) => ['Forearm_' + s, 1, 2, 3, 4].map((k) => (typeof k === 'number' ? `ForearmTwist${k}_${s}` : k));
  function ring(as, bs) {
    const out = [];
    for (const skin of skins) {
      const { skinIndex: si, skinWeight: sw } = skin.geometry.attributes;
      const ia = new Set(as.map((a) => skin.skeleton.bones.findIndex((x) => x.name === a)).filter((i) => i >= 0));
      const ib = new Set(bs.map((b) => skin.skeleton.bones.findIndex((x) => x.name === b)).filter((i) => i >= 0));
      for (let v = 0; v < si.count; v++) {
        let wa = 0, wb = 0;
        for (let k = 0; k < 4; k++) { const j = si.getComponent(v, k), w = sw.getComponent(v, k); if (ia.has(j)) wa += w; if (ib.has(j)) wb += w; }
        if (wa > 0.25 && wb > 0.25 && wa + wb > 0.9) out.push([skin, v]);
      }
    }
    return out;
  }
  const rings = {};
  for (const s of ['L', 'R']) { rings['wrist_' + s] = ring(forearm(s), ['Hand_' + s]); rings['elbow_' + s] = ring(['UpperArm_' + s, 'ElbowHelper_' + s], [...forearm(s), 'ElbowHelper_' + s]); }
  // the last bone that carries the forearm's skin before the hand
  const lastForearm = (s) => (bones[`ForearmTwist4_${s}`] ? `ForearmTwist4_${s}` : `Forearm_${s}`);
  const v3 = new THREE.Vector3();
  function ringSize(name) {
    const vs = rings[name];
    if (!vs.length) return null;
    const pts = vs.map(([skin, v]) => { v3.fromBufferAttribute(skin.geometry.attributes.position, v); skin.applyBoneTransform(v, v3); return v3.clone().applyMatrix4(skin.matrixWorld); });
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    return pts.reduce((a, p) => a + p.distanceTo(c), 0) / pts.length;
  }
  const restRing = {};
  for (const n in rings) restRing[n] = ringSize(n);

  const axis = (n) => new THREE.Vector3(0, 1, 0).transformDirection(bones[n].matrixWorld);
  const pos = (n) => new THREE.Vector3().setFromMatrixPosition(bones[n].matrixWorld);
  const arm = ['UpperArm_L', 'Forearm_L', 'Hand_L', 'UpperArm_R', 'Forearm_R', 'Hand_R'];
  const fingers = Object.keys(bones).filter((n) => /^(Index|Middle|Ring|Pinky|Thumb)\d_[LR]$/.test(n));
  const restRel = {};
  for (const s of ['L', 'R']) {
    const hw = bones['Hand_' + s].getWorldQuaternion(new THREE.Quaternion());
    restRel[s] = { l: bones[lastForearm(s)].getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hw),
                   f: bones['Forearm_' + s].getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hw.clone()) };
  }
  const mixer = new THREE.AnimationMixer(scene);
  const fails = [];
  console.log(file.split('/').pop());
  console.log('clip            wristBend L/R  wristTwist L/R  forearmTurn L/R   elbow L/R      skinKeep wrist L/R elbow L/R  snap deg/frame        fingers moving L/R');
  for (const clip of g.animations) {
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.reset().play();
    const frames = Math.max(2, Math.round(clip.duration * 30));
    const m = { bend: { L: 0, R: 0 }, tw: { L: 0, R: 0 }, ftw: { L: 0, R: 0 }, elbow: { L: [999, 0], R: [999, 0] }, keep: {}, snap: [0, '', 0], fing: { L: [{}, 0], R: [{}, 0] } };
    for (const n in rings) m.keep[n] = 9;
    let prev = null;
    for (let i = 0; i <= frames; i++) {
      const t = Math.min(clip.duration - 1e-4, (clip.duration * i) / frames);
      mixer.setTime(0); act.time = t; mixer.update(0);
      scene.updateMatrixWorld(true);
      const cur = {};
      for (const s of ['L', 'R']) {
        const fh = pos('Hand_' + s).sub(pos('Forearm_' + s));
        const hm = pos('Middle1_' + s).sub(pos('Hand_' + s));
        m.bend[s] = Math.max(m.bend[s], fh.angleTo(hm) * D);
        const hw = bones['Hand_' + s].getWorldQuaternion(new THREE.Quaternion());
        const lw = bones[lastForearm(s)].getWorldQuaternion(new THREE.Quaternion());
        const fw = bones['Forearm_' + s].getWorldQuaternion(new THREE.Quaternion());
        // turn about the hand's own length, against the rest relation of the two bones
        const relRest = restRel[s];
        m.tw[s] = Math.max(m.tw[s], Math.abs(twistAboutY(relRest.l.clone().invert().multiply(lw.clone().invert().multiply(hw)))));
        m.ftw[s] = Math.max(m.ftw[s], Math.abs(twistAboutY(relRest.f.clone().invert().multiply(fw.clone().invert().multiply(hw)))));
        const el = 180 - axis('UpperArm_' + s).angleTo(axis('Forearm_' + s)) * D;
        m.elbow[s] = [Math.min(m.elbow[s][0], el), Math.max(m.elbow[s][1], el)];
        for (const f of fingers.filter((n) => n.endsWith('_' + s))) {
          const q = bones[f].quaternion;
          const r = m.fing[s][0];
          if (r[f]) m.fing[s][1] = Math.max(m.fing[s][1], 2 * Math.acos(Math.min(1, Math.abs(r[f].dot(q)))) * D);
          else r[f] = q.clone();
        }
      }
      for (const n of arm) {
        cur[n] = bones[n].getWorldQuaternion(new THREE.Quaternion());
        if (prev) { const d = 2 * Math.acos(Math.min(1, Math.abs(prev[n].dot(cur[n])))) * D; if (d > m.snap[0]) m.snap = [d, n, t]; }
      }
      for (const n in rings) if (restRing[n]) m.keep[n] = Math.min(m.keep[n], ringSize(n) / restRing[n]);
      prev = cur;
    }
    act.stop();
    const f0 = (x) => x.toFixed(0).padStart(4);
    const k = (n) => (restRing[n] ? m.keep[n].toFixed(2) : ' -- ');
    console.log(
      clip.name.padEnd(15),
      `${f0(m.bend.L)} ${f0(m.bend.R)}     ${f0(m.tw.L)} ${f0(m.tw.R)}       ${f0(m.ftw.L)} ${f0(m.ftw.R)}        ${f0(m.elbow.L[0])}-${f0(m.elbow.L[1]).trim()} ${f0(m.elbow.R[0])}-${f0(m.elbow.R[1]).trim()}`.padEnd(70),
      `${k('wrist_L')} ${k('wrist_R')} ${k('elbow_L')} ${k('elbow_R')}`.padEnd(22),
      `${f0(m.snap[0])} ${m.snap[1]}@${m.snap[2].toFixed(2)}`.padEnd(22),
      `${f0(m.fing.L[1])} ${f0(m.fing.R[1])}`,
    );
    for (const s of ['L', 'R']) {
      if (m.bend[s] > LIMIT.wristBend) fails.push(`${clip.name}: ${s} wrist bent ${m.bend[s].toFixed(0)} deg (limit ${LIMIT.wristBend})`);
      if (m.tw[s] > LIMIT.wristTwist) fails.push(`${clip.name}: ${s} wrist twisted ${m.tw[s].toFixed(0)} deg at the wrist joint (limit ${LIMIT.wristTwist})`);
      if (m.ftw[s] > LIMIT.forearmTurn) fails.push(`${clip.name}: ${s} forearm turned ${m.ftw[s].toFixed(0)} deg (limit ${LIMIT.forearmTurn})`);
      for (const part of ['wrist', 'elbow']) { const n = `${part}_${s}`; if (restRing[n] && m.keep[n] < LIMIT.skinKeep) fails.push(`${clip.name}: ${s} ${part} skin thins to ${(m.keep[n] * 100).toFixed(0)} % (limit ${LIMIT.skinKeep * 100} %)`); }
    }
    if (m.snap[0] > LIMIT.snap) fails.push(`${clip.name}: ${m.snap[1]} snaps ${m.snap[0].toFixed(0)} deg in one frame at ${m.snap[2].toFixed(2)} s (limit ${LIMIT.snap})`);
  }
  console.log(`\n${fails.length} over the limits`);
  for (const f of fails) console.log('  ' + f);
});
