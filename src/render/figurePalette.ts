import * as THREE from 'three';
import { FIGURE, type Hsl } from '../config/characters';

/**
 * A figure's colours (G7), all derived from its team colour (FIGURE.palette), so the standard and the colour-blind
 * team colours dress their teams alike: `main` is the team colour exactly (the carrier, knee pads, armbands, helmets);
 * `dark` its darker partner; `camo` and `shirt` its clothes; `lens` the goggles' and visor's tint; `glow` a robot's
 * eyes; `shell` a robot's shell; `camoSeed` where its camo's pattern starts (FigureLook.camo, a seed offset).
 */
export interface FigurePalette {
  main: number;
  dark: number;
  camo: number;
  shirt: number;
  lens: number;
  glow: number;
  shell: number;
  camoSeed: number;
}

const hsl = { h: 0, s: 0, l: 0 };
const colour = new THREE.Color();

/** The colour `spec` describes, its hue the team's where it says -1, its lightness times `tone`. */
function fromSpec(spec: Hsl, teamHue: number, tone = 1): number {
  const [h, s, l] = spec;
  return colour.setHSL(h < 0 ? teamHue : h, s, Math.min(1, l * tone), THREE.SRGBColorSpace).getHex(THREE.SRGBColorSpace);
}

/** True for a team colour of hue `h` (0..1) that dresses its team in tan. */
export function warmTeam(h: number): boolean {
  const P = FIGURE.palette;
  return h < P.warmBelow || h > P.warmAbove;
}

/**
 * The palette of a figure in `teamColor`. `tone` lightens or darkens the camo and shirt (FigureLook.tone); `shell` is
 * the robot shell its team wears (FIGURE.robot.shells); `camoSeed` where its camo's pattern starts (FigureLook.camo).
 */
export function figurePalette(teamColor: number, tone = 1, shell: number = FIGURE.robot.shells[0]!, camoSeed = 0): FigurePalette {
  const P = FIGURE.palette;
  colour.setHex(teamColor, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
  const { h, s, l } = hsl;
  const kind = warmTeam(h) ? 'warm' : 'cool';
  const dark = colour.setHSL(h, s * P.dark.sat, l * P.dark.light, THREE.SRGBColorSpace).getHex(THREE.SRGBColorSpace);
  return {
    main: teamColor,
    dark,
    camo: fromSpec(P.camo[kind], h, tone),
    shirt: fromSpec(P.shirt[kind], h, tone),
    lens: fromSpec(P.lens, h),
    glow: fromSpec(P.glow, h),
    shell,
    camoSeed,
  };
}

/** The robot shell team `team` wears: light for the first, dark for the second (FIGURE.robot.shells). */
export function robotShell(team: number): number {
  const shells = FIGURE.robot.shells;
  return shells[team % shells.length]!;
}
