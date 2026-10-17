import { describe, expect, it } from 'vitest';

/**
 * The sessions build a WebGL renderer, which Vitest cannot, so who the figures are drawn as is pinned at the source (G7):
 * each session works out the crowd from its seed, its characters and the Look settings (render/figures/figureMix.ts figureCrowd,
 * tested there), hands it to the figures and the player's own arms to the held replicas.
 */
const sources = import.meta.glob<string>(['./matchSession.ts', './rangeSession.ts', './render/match/matchPresentation.ts', './render/match/combatPresentation.ts'], { query: '?raw', import: 'default', eager: true });
const source = (file: string): string => sources[file]!;

describe('the sessions draw the Robots mix (G7)', () => {
  it('the match mixes from its seed, its characters and the Look settings, for the figures and the player\'s arms', () => {
    const match = source('./matchSession.ts');
    expect(match).toMatch(/const crowd = figureCrowd\(seed, this\.state\.characters, setup\.look\)/);
    expect(match).toMatch(/new MatchPresentation\([^;]*, crowd, renderer\.replicaFiles, renderer\.figureRigs\)/);
    expect(match).toMatch(/new CombatPresentation\([^;]*playerArms\(crowd, this\.state\.characters\.indexOf\(this\.player\), this\.player\.team\)\)/);
  });

  it('the range gives the player their arms from the same mix', () => {
    const range = source('./rangeSession.ts');
    expect(range).toMatch(/const crowd = figureCrowd\(seed, this\.state\.characters, setup\.look\)/);
    expect(range).toMatch(/new CombatPresentation\([^;]*playerArms\(crowd, this\.state\.characters\.indexOf\(this\.player\), this\.player\.team\)\)/);
  });

  it('the presentations pass the crowd to the figures and the arms to the viewmodel', () => {
    expect(source('./render/match/matchPresentation.ts')).toMatch(/new CharacterRenderer\([^;]*, crowd, replicaFiles, figureRigs, teamColours\.paintGlow\)/);
    expect(source('./render/match/combatPresentation.ts')).toMatch(/new Viewmodel\([^;]*, arms, renderer\.replicaFiles\)/);
  });

  it('the match gives the hit rules the figures\' legs and upper bodies only when the rigs are drawn (IM8, HV1)', () => {
    const match = source('./matchSession.ts');
    // The human's legs, any clip its file lacks taken from the robot's (FigureRigs.legs); each figure's upper body.
    expect(match).toMatch(/const rigs = renderer\.figureRigs;/);
    expect(match).toMatch(/this\.hits = rigs \? \{ \.\.\.hitRulesFor\(setup\.rules\), figureLegs: rigs\.legs, figureBodies: rigs\.bodies \} : hitRulesFor\(setup\.rules\);/);
    // Each character's volume takes the shape of the figure it is drawn as (0 human, 1 robot).
    expect(match).toMatch(/c\.figure = crowd\.robots\[i\] \? 1 : 0/);
  });
});
