/**
 * Test support: how well a rendered loop closes on itself (audit AUD-06, M79). Not part of the game; the loop tests
 * (woodlandSound.test.ts, citySound.test.ts) bound the wrap through `seamFailures`, so a click in a noise bed is caught
 * by the same fixed thresholds in every loop.
 *
 * The seam is measured against the loop's own interior, not against its biggest step (a click passes that):
 * - the jump from the last sample to the first (|first difference|) and the second difference across the wrap (the larger
 *   of the two that straddle it), each as a percentile of the same quantity at every interior sample;
 * - a short-window log-spectral distance from the last window to the first, as a percentile of the distances between
 *   every pair of adjacent windows inside the loop (a hop of half a window).
 */

/** How far up its own distribution a loop's seam may sit, in percent (audit AUD-06's fix), per measure. */
export const SEAM_LIMITS = {
  /** |first difference| and |second difference| at the wrap: under the 99.5th percentile of the loop's own. */
  difference: 99.5,
  /** Spectral distance, last window to first: under the 99th percentile of adjacent-window distances. */
  spectral: 99,
} as const;

/** Samples in a spectral window (a power of two): about 21 ms at the 48 kHz render rate. */
export const SEAM_WINDOW = 1024;

export interface SeamReport {
  /** |first sample - last sample|, and the percent of the loop's interior steps that are no bigger. */
  jump: number;
  jumpPercentile: number;
  /** The larger |second difference| of the two straddling the wrap, and its percentile among the interior's. */
  curve: number;
  curvePercentile: number;
  /** RMS of the dB difference between the spectra of the last window and the first, and its percentile among adjacent windows'. */
  spectral: number;
  spectralPercentile: number;
}

/** Percent of `sorted` (ascending) that is no bigger than `x`. */
export function percentileOf(sorted: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return (100 * lo) / sorted.length;
}

/** Magnitude spectrum (bins 0..n/2) of one Hann-windowed block of `n` samples (a power of two) starting at `from`. */
function spectrum(v: ArrayLike<number>, from: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = v[from + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len / 2;
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(re[i]!, im[i]!);
  return out;
}

/** RMS over the bins (not the DC bin) of the dB difference between two spectra. */
function spectralDistance(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 1; i < a.length; i++) {
    const dB = 10 * Math.log10((a[i]! ** 2 + 1e-12) / (b[i]! ** 2 + 1e-12));
    sum += dB * dB;
  }
  return Math.sqrt(sum / (a.length - 1));
}

/** Measures how `v` (a loop's samples, at least four windows long) closes where it wraps from its last sample to its first. */
export function measureSeam(v: Float32Array, window = SEAM_WINDOW): SeamReport {
  const n = v.length;
  if (n < 4 * window) throw new Error(`a loop of ${n} samples is too short to measure its seam (needs ${4 * window})`);
  const steps = new Float64Array(n - 1);
  const curves = new Float64Array(n - 2);
  for (let i = 1; i < n; i++) steps[i - 1] = Math.abs(v[i]! - v[i - 1]!);
  for (let i = 2; i < n; i++) curves[i - 2] = Math.abs(v[i]! - 2 * v[i - 1]! + v[i - 2]!);
  steps.sort();
  curves.sort();
  const jump = Math.abs(v[0]! - v[n - 1]!);
  const curve = Math.max(Math.abs(v[0]! - 2 * v[n - 1]! + v[n - 2]!), Math.abs(v[1]! - 2 * v[0]! + v[n - 1]!));
  // Spectral: each interior window's spectrum is taken once; adjacent windows overlap by half.
  const hop = window / 2;
  const spectra: Float64Array[] = [];
  for (let from = 0; from + window <= n; from += hop) spectra.push(spectrum(v, from, window));
  const distances = new Float64Array(spectra.length - 2);
  // Pairs of windows that touch end to end (the tail of one is the head of the next): every second one, from 0.
  for (let k = 0; k < distances.length; k++) distances[k] = spectralDistance(spectra[k]!, spectra[k + 2]!);
  distances.sort();
  const spectral = spectralDistance(spectrum(v, n - window, window), spectra[0]!);
  return {
    jump,
    jumpPercentile: percentileOf(steps, jump),
    curve,
    curvePercentile: percentileOf(curves, curve),
    spectral,
    spectralPercentile: percentileOf(distances, spectral),
  };
}

/** What is wrong with the seam of `v` against `SEAM_LIMITS`: one line per measure over its limit (empty: it closes cleanly). */
export function seamFailures(report: SeamReport): string[] {
  const out: string[] = [];
  if (report.jumpPercentile > SEAM_LIMITS.difference) out.push(`the wrap jumps ${report.jump.toExponential(2)}, p${report.jumpPercentile.toFixed(2)} of its own steps (limit p${SEAM_LIMITS.difference})`);
  if (report.curvePercentile > SEAM_LIMITS.difference) out.push(`the wrap bends ${report.curve.toExponential(2)}, p${report.curvePercentile.toFixed(2)} of its own second differences (limit p${SEAM_LIMITS.difference})`);
  if (report.spectralPercentile > SEAM_LIMITS.spectral) out.push(`the wrap's spectrum moves ${report.spectral.toFixed(2)} dB, p${report.spectralPercentile.toFixed(1)} of its adjacent windows (limit p${SEAM_LIMITS.spectral})`);
  return out;
}

/** One line of the figures, for a failure message and for recording a baseline. */
export function seamLine(report: SeamReport): string {
  return `jump p${report.jumpPercentile.toFixed(2)}, bend p${report.curvePercentile.toFixed(2)}, spectrum ${report.spectral.toFixed(2)} dB p${report.spectralPercentile.toFixed(1)}`;
}
