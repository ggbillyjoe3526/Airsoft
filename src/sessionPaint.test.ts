import { describe, expect, it } from 'vitest';

/**
 * The match and range sessions build a WebGL renderer, which Vitest cannot, so what they hand the held replicas is
 * pinned at the source (G1 acceptance 3 and 4): each passes `kitPaint(kit, look)` to CombatPresentation, which gives it
 * to the Viewmodel (viewmodel.test.ts checks the paint reaches the colours), and the play flow passes the Look settings to
 * both (DX8: the setup, playSetup.ts, holds them).
 */
const sources = import.meta.glob<string>(['./matchSession.ts', './rangeSession.ts', './playSetup.ts', './playFlow.ts', './render/match/combatPresentation.ts'], { query: '?raw', import: 'default', eager: true });
const source = (file: string): string => sources[file]!;

describe('the sessions pass the paint through (G1)', () => {
  it('the match builds its combat presentation with the kit painted by the Look settings', () => {
    expect(source('./matchSession.ts')).toMatch(/new CombatPresentation\([^;]*kitPaint\(this\.kit, setup\.look\)[,)]/); // G7: the player's arms follow the paint
  });

  it('the range does too, and its setup type carries the Look settings', () => {
    expect(source('./rangeSession.ts')).toMatch(/new CombatPresentation\([^;]*kitPaint\(setup\.kit, setup\.look\)[,)]/); // G7: the player's arms follow the paint
    expect(source('./rangeSession.ts')).toMatch(/RangeSetup = Pick<MatchSetup, [^>]*'look'/);
  });

  it('the combat presentation gives its paint to the viewmodel', () => {
    expect(source('./render/match/combatPresentation.ts')).toMatch(/new Viewmodel\([^;]*\bpaint[,)]/); // G7: the arms follow the paint
  });

  it('the play flow hands the Look settings the setup loaded to both the match and the range', () => {
    expect(source('./playSetup.ts')).toMatch(/\blook: LookSettings = loadLook\(\)/);
    expect(source('./playFlow.ts').match(/^\s*look: setup\.look,$/gm)).toHaveLength(2);
  });
});
