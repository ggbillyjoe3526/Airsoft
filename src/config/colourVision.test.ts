import { describe, expect, it } from 'vitest';
import { TEAM_COLOUR_SETS, type TeamColourSetId } from './teams';

/**
 * The team colour sets seen with the common kinds of colour blindness, simulated with Machado, Oliveira and Fernandes
 * (2009) at full severity (the matrices act on linear RGB), and compared in CIE Lab (ΔE 1976). A ΔE over ~50 is two
 * plainly different colours; under ~10 they can be mistaken for each other.
 */
const VISION = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

type Vision = keyof typeof VISION;

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** `hex` as CIE Lab (D65) as someone with `vision` sees it. */
function labSeenWith(hex: number, vision: Vision): [number, number, number] {
  const rgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => toLinear(v / 255));
  const [r, g, b] = VISION[vision].map((row) => Math.min(1, Math.max(0, row[0] * rgb[0]! + row[1] * rgb[1]! + row[2] * rgb[2]!))) as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a: number, b: number, vision: Vision): number {
  const la = labSeenWith(a, vision);
  const lb = labSeenWith(b, vision);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

function lightnessGap(a: number, b: number, vision: Vision): number {
  return Math.abs(labSeenWith(a, vision)[0] - labSeenWith(b, vision)[0]);
}

const SETS = Object.entries(TEAM_COLOUR_SETS) as [TeamColourSetId, (typeof TEAM_COLOUR_SETS)[TeamColourSetId]][];
const VISIONS = Object.keys(VISION) as Vision[];

describe('team colour sets (M18b)', () => {
  it('reproduces the published standard-set numbers (guards the simulation itself)', () => {
    // Blue #3d8bff vs Orange #ff8a2a: ΔE about 122 / 138 / 95 under protanopia / deuteranopia / tritanopia.
    const [blue, orange] = TEAM_COLOUR_SETS.standard.figures as [number, number];
    expect(deltaE(blue, orange, 'protanopia')).toBeCloseTo(122, -1);
    expect(deltaE(blue, orange, 'deuteranopia')).toBeCloseTo(138, -1);
    expect(deltaE(blue, orange, 'tritanopia')).toBeCloseTo(94, -1);
  });

  for (const [id, set] of SETS) {
    for (const part of ['figures', 'hud'] as const) {
      it(`keeps ${id} ${part} far apart for every kind of colour vision`, () => {
        const [a, b] = set[part] as [number, number];
        for (const vision of VISIONS) expect(deltaE(a, b, vision), `${id} ${part}, ${vision}`).toBeGreaterThan(60);
      });
    }
  }

  it('sets High contrast apart in lightness too, so it reads with little colour vision at all', () => {
    const { figures, hud } = TEAM_COLOUR_SETS.highContrast;
    for (const vision of VISIONS) {
      expect(lightnessGap(figures[0]!, figures[1]!, vision), `figures, ${vision}`).toBeGreaterThan(25);
      // The HUD's orange is lifted to stay readable on its grey panels, so it keeps less (the HUD names the teams in
      // text as well).
      expect(lightnessGap(hud[0]!, hud[1]!, vision), `hud, ${vision}`).toBeGreaterThan(15);
    }
    // More than the standard set, which differs little in lightness.
    const std = TEAM_COLOUR_SETS.standard.figures;
    expect(lightnessGap(figures[0]!, figures[1]!, 'normal')).toBeGreaterThan(3 * lightnessGap(std[0]!, std[1]!, 'normal'));
  });
});
