import type { MatchMode } from '../../config/modes';
import type { BalanceTally } from '../depotMatchSupport';

/**
 * Test-only (like depotMatchSupport.ts): what a balance measure (`*.balance.ts`, project `balance`) hands the balance
 * report (token plan item 22). A measure records figures; it never fails on them. `node pipeline/balance.mjs` runs the
 * measures and judges each figure against its band and standard error (pipeline/balanceReport.mjs).
 */

/** The band a figure should sit in, both ends inclusive; either end may be open. */
export interface Band {
  min?: number;
  max?: number;
}

/** One balance figure, as the report reads it from vitest's JSON report (each test's `meta.balance`). */
export interface BalanceMeasure {
  /** What is measured, in plain words, with its map, level and mode. */
  label: string;
  /** The figure: a share from 0 to 1 when `of` is set, else a number in `unit`. NaN when there was nothing to count. */
  value: number;
  /** A share's count: the rounds or runs it is a share of (its standard error comes from it). */
  of?: number;
  band: Band;
  /** One standard error, for a figure that is not a plain share (a difference of two shares). */
  se?: number;
  /** `points` for a difference of two shares; `FC a minute` or `×` for a plain number; a share's is `%`. */
  unit?: string;
  /** The counts behind the figure, for the report's reader: "108 of 218 decided, 1 on time". */
  detail?: string;
}

/** Vitest's test context, as far as a measure needs it: the task whose meta carries the figures to the report. */
export interface MeasureContext {
  task: { meta: object };
}

/** Hands `measure` to the report (vitest serialises a task's meta into its JSON report). */
export function reportMeasure(ctx: MeasureContext, measure: BalanceMeasure): void {
  const meta = ctx.task.meta as { balance?: BalanceMeasure[] };
  (meta.balance ??= []).push(measure);
}

/** `count` over `of`, NaN for a share of nothing (the report marks it as not run). */
export const share = (count: number, of: number): number => (of > 0 ? count / of : Number.NaN);

/** The Esports plan's Pro band (M40, owner 2026-10-04): the attackers' or each end's share of rounds. */
export const PRO_BAND: Required<Band> = { min: 0.4, max: 0.6 };
/** Below Pro (Audit 2, owner decision 3): 35–65 % at 8 seeds. */
export const LEVELS_BAND: Required<Band> = { min: 0.35, max: 0.65 };
/** Rounds that run out the clock: under 1 in 10 (M40's plan, every level). */
export const ON_TIME_BAND: Band = { max: 0.1 };

/**
 * A balance tally's two figures (M40's guard, now a report): in Attack / Defend the attackers' share of rounds, in
 * Elimination end 0's share of the decided rounds (`end0` names it: "the west end", "the downhill end"), and the share
 * of rounds that ran out the clock.
 */
export function reportTally(ctx: MeasureContext, label: string, t: BalanceTally, mode: MatchMode, band: Band = PRO_BAND, end0 = 'the west end'): void {
  const onTime = `${t.onTime} of ${t.rounds} on time`;
  if (mode === 'attackDefend') {
    reportMeasure(ctx, { label: `${label}: the attackers' share of rounds`, value: share(t.attackerWins, t.rounds), of: t.rounds, band, detail: `${t.attackerWins} of ${t.rounds}, ${onTime}` });
  } else {
    reportMeasure(ctx, { label: `${label}: ${end0}'s share of the decided rounds`, value: share(t.end0Wins, t.decided), of: t.decided, band, detail: `${t.end0Wins} of ${t.decided} decided, ${onTime}` });
  }
  reportMeasure(ctx, { label: `${label}: rounds that run out the clock`, value: share(t.onTime, t.rounds), of: t.rounds, band: ON_TIME_BAND, detail: onTime });
}

/** One standard error of a share `p` of `n`, for a figure built from two shares. */
export const shareError = (p: number, n: number): number => (n > 0 ? Math.sqrt((p * (1 - p)) / n) : Number.NaN);
