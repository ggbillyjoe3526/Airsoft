import { describe, expect, it } from 'vitest';

/**
 * BP4: a rigged figure's BB leaves its own replica's muzzle. The session builds a WebGL renderer, which Vitest cannot, so
 * the chain is pinned at the source as src/sessionFigures.test.ts pins the crowd's.
 */
const sources = import.meta.glob<string>(['./matchSession.ts', './render/match/matchPresentation.ts', './render/figures/characterRenderer.ts', './render/match/combatPresentation.ts'], { query: '?raw', import: 'default', eager: true });
const source = (file: string): string => sources[file]!;

describe('the rigged figure\'s drawn muzzle reaches the BB (BP4)', () => {
  it('the session hands the match\'s riggedMuzzle to the combat presentation', () => {
    expect(source('./matchSession.ts')).toMatch(/this\.combat\.setRiggedMuzzle\(\(c, out\) => this\.match\.riggedMuzzle\(c, out\)\)/);
  });

  it('the match presentation passes it on to the character renderer, which asks the figure with the replica in hand', () => {
    expect(source('./render/match/matchPresentation.ts')).toMatch(/riggedMuzzle\(c: Character, out: THREE\.Vector3\): boolean \{\s*return this\.characters\.riggedMuzzle\(c, out\);/);
    const characters = source('./render/figures/characterRenderer.ts');
    expect(characters).toMatch(/riggedMuzzle\(c: Character, out: THREE\.Vector3\): boolean \{/);
    expect(characters).toMatch(/\.rigged\?\.muzzleWorld\(holdsPistol\(c\), out\)/);
  });

  it('a shooter\'s muzzle is the rigged one before the built-in figure\'s, and the player\'s is the viewmodel\'s', () => {
    const combat = source('./render/match/combatPresentation.ts');
    const body = /private shooterMuzzle\([^)]*\): boolean \{([\s\S]*?)\n  \}/.exec(combat)![1]!;
    const view = body.indexOf('this.viewmodel.muzzleWorld');
    const rigged = body.indexOf('this.riggedMuzzle?.(shooter, out)');
    const built = body.indexOf('figureMuzzle(shooter, out');
    expect(view).toBeGreaterThanOrEqual(0);
    expect(view).toBeLessThan(rigged);
    expect(rigged).toBeLessThan(built);
    expect(combat).toMatch(/setRiggedMuzzle\(muzzle: \(\(c: Character, out: THREE\.Vector3\) => boolean\) \| null\): void \{\s*this\.riggedMuzzle = muzzle;/);
  });
});
