import { ALLOWED_STRONGER, MODEL_BUDGET, SOUND_LOUDNESS_SPREAD_DB } from '../config/contentRules';
import type { Asset } from '../pool/pool';
import type { ModelCensus, SoundCensus } from './census';
import { type CheckResult, itemName, num, result } from './checks';
import type { SpecSheet } from './specSheet';

/**
 * The spec test's verdicts (CT1, level 3), from the sheets and censuses the report runner works out: within the model
 * budget, a sound in line with the others, and not better than every other replica at everything. Pure.
 */

/** The sheet's numbers where more is better (+1) or less is better (−1), for the "better at everything" check. */
const COMPARED: readonly { label: string; value: (s: SpecSheet) => number; sign: 1 | -1 }[] = [
  { label: 'reach', value: (s) => s.onTarget, sign: 1 },
  { label: 'grouping', value: (s) => s.group[s.group.length - 1]!.cm, sign: -1 },
  { label: 'fire rate', value: (s) => s.fireRate, sign: 1 },
  { label: 'BBs carried', value: (s) => s.magSize * s.mags, sign: 1 },
  { label: 'reload', value: (s) => s.reload, sign: -1 },
  { label: 'draw', value: (s) => s.draw, sign: -1 },
  { label: 'kick', value: (s) => s.recoilDeg, sign: -1 },
];

/** The numbers `a` is better at than `b`, and those it is worse at. */
export function compareSheets(a: SpecSheet, b: SpecSheet): { better: string[]; worse: string[] } {
  const better: string[] = [];
  const worse: string[] = [];
  for (const c of COMPARED) {
    const d = (c.value(a) - c.value(b)) * c.sign;
    if (d > 1e-9) better.push(c.label);
    else if (d < -1e-9) worse.push(c.label);
  }
  return { better, worse };
}

/** A replica's spec verdicts against the other replicas' sheets and sounds. */
export function replicaSpecChecks(replica: Asset, siteClass: string, sheet: SpecSheet, others: readonly SpecSheet[], census: ModelCensus, sound: SoundCensus | undefined, otherSounds: readonly SoundCensus[]): CheckResult[] {
  const item = itemName(replica);
  const out: CheckResult[] = [];
  const budget = MODEL_BUDGET.highTriangles[siteClass];
  if (budget !== undefined && census.high.triangles > budget) out.push(result('spec', 'replica.modelCost', item, 'fail', `It draws ${census.high.triangles} triangles on High, over its ${budget} budget.`));
  else out.push(result('spec', 'replica.modelCost', item, 'pass', `It draws ${census.low.triangles} triangles in ${census.low.meshes} meshes on Low and ${census.high.triangles} in ${census.high.meshes} on High${budget !== undefined ? ` (budget ${budget})` : ''}${census.fromFile ? ', from its model file' : ''}.`));
  const heavy = census.parts.filter((p) => p.high.meshes > MODEL_BUDGET.partMeshes);
  if (heavy.length > 0) out.push(result('spec', 'replica.partCost', item, 'fail', `${heavy.map((p) => `${p.name} (${p.high.meshes})`).join(', ')} add more than ${MODEL_BUDGET.partMeshes} meshes each.`));
  else if (census.parts.length > 0) out.push(result('spec', 'replica.partCost', item, 'pass', `Each of its ${census.parts.length} parts adds at most ${MODEL_BUDGET.partMeshes} meshes.`));

  if (!sound || !Number.isFinite(sound.loudnessDb)) out.push(result('spec', 'replica.soundLevel', item, 'fail', 'Its shot makes no sound.'));
  else {
    const levels = otherSounds.filter((s) => s.profile !== sound.profile && Number.isFinite(s.loudnessDb)).map((s) => s.loudnessDb);
    const mean = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : sound.loudnessDb;
    const off = sound.loudnessDb - mean;
    const words = `Its shot is ${num(sound.loudnessDb, 1)} dB (the others ${num(mean, 1)} dB) and centres at ${Math.round(sound.centroidHz)} Hz.`;
    out.push(result('spec', 'replica.soundLevel', item, Math.abs(off) > SOUND_LOUDNESS_SPREAD_DB ? 'warn' : 'pass', Math.abs(off) > SOUND_LOUDNESS_SPREAD_DB ? `${words} That is ${num(Math.abs(off), 1)} dB ${off > 0 ? 'louder' : 'quieter'}: listen to it.` : words));
  }

  const beaten = others.filter((o) => {
    const c = compareSheets(sheet, o);
    return c.better.length > 0 && c.worse.length === 0;
  });
  if (others.length > 0 && beaten.length === others.length) {
    const why = ALLOWED_STRONGER[replica.id];
    out.push(result('spec', 'replica.sidegrade', item, why ? 'pass' : 'warn', why ? `Better than every other replica at everything, allowed: ${why}.` : `Better than every other replica (${others.map((o) => o.name).join(', ')}) at everything it is measured on: fine for a chase item, not for an ordinary one.`));
  } else {
    const trade = others.map((o) => {
      const c = compareSheets(sheet, o);
      return `against the ${o.name}: better at ${c.better.join(', ') || 'nothing'}, worse at ${c.worse.join(', ') || 'nothing'}`;
    });
    out.push(result('spec', 'replica.sidegrade', item, 'pass', others.length > 0 ? `${trade.join('; ')}.` : 'No other replica to compare with.'));
  }
  return out;
}

/** A part's spec verdicts: on each replica it fits, its draw cost (from that replica's census). */
export function partSpecChecks(part: Asset, drawName: string | null, onReplicas: readonly { replica: string; census: ModelCensus }[]): CheckResult[] {
  const item = itemName(part);
  if (!drawName) return [result('spec', `${part.category}.modelCost`, item, 'pass', 'It is not drawn on the replica.')];
  const costs = onReplicas.map(({ replica, census }) => ({ replica, part: census.parts.find((p) => p.name === drawName) }));
  const missing = costs.filter((c) => !c.part);
  const heavy = costs.filter((c) => c.part && c.part.high.meshes > MODEL_BUDGET.partMeshes);
  if (missing.length > 0) return [result('spec', `${part.category}.modelCost`, item, 'fail', `Not drawn on ${missing.map((c) => c.replica).join(', ')}.`)];
  if (heavy.length > 0) return [result('spec', `${part.category}.modelCost`, item, 'fail', `Adds more than ${MODEL_BUDGET.partMeshes} meshes on ${heavy.map((c) => c.replica).join(', ')}.`)];
  return [result('spec', `${part.category}.modelCost`, item, 'pass', costs.map((c) => `On the ${c.replica}: ${c.part!.low.triangles} triangles (Low) and ${c.part!.high.triangles} in ${c.part!.high.meshes} meshes (High)`).join('. ') + '.')];
}
