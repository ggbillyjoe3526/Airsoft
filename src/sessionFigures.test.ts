import { describe, expect, it } from 'vitest';

/**
 * The sessions build a WebGL renderer, which Vitest cannot, so who the figures are drawn as is pinned at the source (G7):
 * each session works out the crowd from its seed, its characters and the Look settings (render/figureMix.ts figureCrowd,
 * tested there), hands it to the figures and the player's own arms to the held replicas.
 */
const sources = import.meta.glob<string>(['./matchSession.ts', './rangeSession.ts', './render/matchPresentation.ts', './render/combatPresentation.ts'], { query: '?raw', import: 'default', eager: true });
const source = (file: string): string => sources[file]!;

describe('the sessions draw the Robots mix (G7)', () => {
  it('the match mixes from its seed, its characters and the Look settings, for the figures and the player\'s arms', () => {
    const match = source('./matchSession.ts');
    expect(match).toMatch(/const crowd = figureCrowd\(seed, this\.state\.characters, setup\.look\)/);
    expect(match).toMatch(/new MatchPresentation\([^;]*, crowd, renderer\.replicaFiles\)/);
    expect(match).toMatch(/new CombatPresentation\([^;]*playerArms\(crowd, this\.state\.characters\.indexOf\(this\.player\), this\.player\.team\)\)/);
  });

  it('the range gives the player their arms from the same mix', () => {
    const range = source('./rangeSession.ts');
    expect(range).toMatch(/const crowd = figureCrowd\(seed, this\.state\.characters, setup\.look\)/);
    expect(range).toMatch(/new CombatPresentation\([^;]*playerArms\(crowd, this\.state\.characters\.indexOf\(this\.player\), this\.player\.team\)\)/);
  });

  it('the presentations pass the crowd to the figures and the arms to the viewmodel', () => {
    expect(source('./render/matchPresentation.ts')).toMatch(/new CharacterRenderer\([^;]*, crowd, replicaFiles\)/);
    expect(source('./render/combatPresentation.ts')).toMatch(/new Viewmodel\([^;]*, arms, renderer\.replicaFiles\)/);
  });
});
