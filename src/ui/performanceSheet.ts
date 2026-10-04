import { handlingOf } from '../config/attachments';
import { BALLISTICS } from '../config/ballistics';
import { BOT_BEHAVIOUR } from '../config/bots';
import { PERFORMANCE_SHEET } from '../config/menus';
import { AIMING, OPTICS } from '../config/optics';
import { BB_WEIGHT, muzzleEnergy, muzzleVelocity } from '../config/replicas';
import type { ScaledStat } from '../config/statsFile';
import type { ItemRef } from '../pool/collection';
import { bonusOf, type KitSlot, scaledCategory } from '../pool/kit';
import type { Pool } from '../pool/pool';
import { flightTime, hopUpReach } from '../sim/hopUp';

/**
 * The Loadout's Performance sheet (M29): a replica's numbers as carried (its tier, power source and parts, the BB weight
 * and hop-up picked), each against the same replica as it comes. Pure: the Customise screen draws the rows.
 */

/** Feet in a metre: sites quote a chrono reading in feet per second. */
const FEET_PER_METRE = 3.28084;

export interface Performance {
  /** Muzzle energy (J) with the picked BB weight. */
  energy: number;
  /** The site limit stopped the energy (stats.md's Site limits). */
  capped: boolean;
  /** Muzzle speed (m/s) with the picked BB weight. */
  velocity: number;
  /** Muzzle speed (feet per second) on PERFORMANCE_SHEET.chronoGrams BBs, as a site's chrono reads it. */
  chronoFps: number;
  grams: number;
  /** BBs a second at most (auto), or the fastest a semi-only replica can be clicked. */
  fireRate: number;
  semiOnly: boolean;
  /** Metres a level shot stays on target with the picked hop-up (sim/hopUp.ts). */
  onTargetTo: number;
  /** Seconds a BB takes to BB_WEIGHT.timeReadoutDistance with the picked hop-up. */
  timeTo: number;
  spread: number;
  recoil: number;
  magSize: number;
  mags: number;
  reload: number;
  draw: number;
  /** Seconds to raise the fitted optic, or null with iron sights. */
  raise: number | null;
  /** Metres away bots hear its shots (BOT_BEHAVIOUR.hearingDistance, shorter with a silencer, M29b). */
  heardFrom: number;
}

/** A replica's numbers as carried in `slot`, shooting `grams` BBs with its hop-up dial at `dial`. */
export function performanceOf(slot: KitSlot, grams: number, dial: number, capped = false): Performance {
  const r = slot.replica;
  const h = handlingOf(r, slot.parts);
  return {
    energy: muzzleEnergy(r, grams),
    capped,
    velocity: muzzleVelocity(r, grams),
    chronoFps: muzzleVelocity(r, PERFORMANCE_SHEET.chronoGrams) * FEET_PER_METRE,
    grams,
    fireRate: r.fireRate,
    semiOnly: r.fireModes.every((m) => m === 'semi'),
    onTargetTo: hopUpReach(r, dial, BALLISTICS, grams).onTargetTo,
    timeTo: flightTime(r, dial, BB_WEIGHT.timeReadoutDistance, BALLISTICS, grams),
    spread: r.spreadDeg,
    recoil: r.recoilDeg,
    magSize: h.magSize,
    mags: h.mags,
    reload: h.reloadTime,
    draw: h.drawTime,
    raise: slot.optic === null ? null : AIMING.raiseTime * OPTICS[slot.optic].raiseScale * h.raiseScale,
    heardFrom: BOT_BEHAVIOUR.hearingDistance * h.heardScale,
  };
}

/** Which way a change goes for the player: better, worse, or neither (a trade-off like magazine size, or no change). */
export type Change = 'better' | 'worse' | null;

export interface SheetRow {
  label: string;
  value: string;
  /** The change against the replica as it comes, e.g. "+7%"; '' when there is none worth showing. */
  delta: string;
  change: Change;
}

/** How a stat compares: higher is better, lower is better, or it is a trade-off shown without a colour. */
type Better = 'higher' | 'lower' | 'neither';

function row(label: string, value: string, now: number | null, then: number | null, better: Better): SheetRow {
  if (now === null || then === null || !Number.isFinite(now) || !Number.isFinite(then) || then === 0) return { label, value, delta: '', change: null };
  const pct = (now / then - 1) * 100;
  if (Math.abs(pct) < PERFORMANCE_SHEET.minChangePercent) return { label, value, delta: '', change: null };
  const shown = Math.abs(pct) < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  const delta = `${shown > 0 ? '+' : '−'}${Math.abs(shown)}%`;
  if (better === 'neither') return { label, value, delta, change: null };
  return { label, value, delta, change: (pct > 0) === (better === 'higher') ? 'better' : 'worse' };
}

function rate(r: number): string {
  return Number.isInteger(Math.round(r * 10) / 10) ? String(Math.round(r)) : r.toFixed(1);
}

/** "to about 38 m", or "past 60 m" when it is still on target where the readout stops following it. */
function reach(m: number, readoutRange: number): string {
  return m >= readoutRange ? `past ${readoutRange} m` : `${Math.round(m)} m`;
}

/** The sheet's rows: `now` (as carried) against `factory` (the replica as it comes, with its factory BB and hop-up). */
export function sheetRows(now: Performance, factory: Performance, readoutRange: number): SheetRow[] {
  const t = PERFORMANCE_SHEET.labels;
  return [
    row(t.energy, `${now.energy.toFixed(2)} J${now.capped ? ` (${t.siteLimit})` : ''}`, now.energy, factory.energy, 'higher'),
    row(t.speed, `${Math.round(now.velocity)} m/s (${Math.round(now.chronoFps)} fps)`, now.velocity, factory.velocity, 'higher'),
    row(t.bbWeight, `${now.grams.toFixed(2)} g`, now.grams, factory.grams, 'neither'),
    row(t.fireRate, `${now.semiOnly ? `${t.upTo} ` : ''}${rate(now.fireRate)} BBs/s`, now.fireRate, factory.fireRate, 'higher'),
    row(t.onTarget, reach(now.onTargetTo, readoutRange), now.onTargetTo, factory.onTargetTo, 'higher'),
    row(t.timeTo(BB_WEIGHT.timeReadoutDistance), Number.isFinite(now.timeTo) ? `${now.timeTo.toFixed(2)} s` : t.neverGets, now.timeTo, factory.timeTo, 'lower'),
    row(t.spread, `${now.spread.toFixed(2)}°`, now.spread, factory.spread, 'lower'),
    row(t.recoil, `${now.recoil.toFixed(2)}°`, now.recoil, factory.recoil, 'lower'),
    row(t.magazines, `${now.magSize} × ${now.mags} (${now.magSize * now.mags})`, now.magSize * now.mags, factory.magSize * factory.mags, 'neither'),
    row(t.reload, `${now.reload.toFixed(2)} s`, now.reload, factory.reload, 'lower'),
    row(t.draw, `${now.draw.toFixed(2)} s`, now.draw, factory.draw, 'lower'),
    row(t.raise, now.raise === null ? t.noOptic : `${now.raise.toFixed(2)} s`, now.raise, factory.raise, 'lower'),
    row(t.heardFrom, `${Math.round(now.heardFrom)} m`, now.heardFrom, factory.heardFrom, 'lower'),
  ];
}

/** The short line on a gear slot, e.g. "1.04 J · 14 BBs/s · 60 BBs". */
export function gearLine(slot: KitSlot, grams: number): string {
  const r = slot.replica;
  return `${muzzleEnergy(r, grams).toFixed(2)} J · ${rate(r.fireRate)} BBs/s · ${handlingOf(r, slot.parts).magSize} BBs`;
}

/** How the Armory names what a tier improves, in the order it lists them, and which way each goes. */
const TIER_WORDS: readonly { stat: ScaledStat; word: string; sign: '+' | '−' }[] = [
  { stat: 'energy', word: 'energy', sign: '+' },
  { stat: 'fireRate', word: 'rate of fire', sign: '+' },
  { stat: 'spread', word: 'spread', sign: '−' },
  { stat: 'reload', word: 'reload', sign: '−' },
  { stat: 'draw', word: 'draw', sign: '−' },
  { stat: 'raise', word: 'aim raise', sign: '−' },
  { stat: 'shake', word: 'sprint shake', sign: '−' },
];

/**
 * What an item's tier adds (stats.md's Tier scaling times its tier's Bonus), for the Armory, e.g. "+7.5% energy ·
 * +7.5% rate of fire · −15% spread · −15% reload · −15% draw"; '' for a tier that adds nothing (Common).
 */
/**
 * What an item's tier means, in a line for the Loadout (audit POOL-10): "Legendary: −15% spread · …", or
 * "Common: no tier bonus".
 */
export function tierBlurb(pool: Pool, ref: ItemRef): string {
  const label = pool.tiers.find((t) => t.id === ref.tier)?.label ?? ref.tier;
  return `${label}: ${tierLine(pool, ref) || 'no tier bonus'}`;
}

export function tierLine(pool: Pool, ref: ItemRef): string {
  const asset = pool.byId.get(ref.asset);
  if (!asset || !scaledCategory(asset)) return '';
  return TIER_WORDS.flatMap(({ stat, word, sign }) => {
    const pct = Math.round(bonusOf(pool, ref, stat) * 1000) / 10;
    return pct > 0 ? [`${sign}${pct}% ${word}`] : [];
  }).join(' · ');
}
