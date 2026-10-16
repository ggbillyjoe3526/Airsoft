import type { NoiseConfig, PropNoise } from '../config/noise';
import type { BlockKind, MapBlock } from '../map/mapTypes';
import type { Character } from './character';
import type { GameEvent } from './events';
import { type Vec3, vec3 } from './vec';
import { clamp } from '../core/math';

/**
 * Noisy props (NP1, Dev 6 item 41): someone who runs into one, or a BB that rings off one, makes a noise there (a
 * `propNoise` event) that bots hear and you hear. Pure rules on plain data; which props are noisy and how far each
 * carries is config/noise.ts. A prop makes at most one noise per NoiseConfig.quiet, kept in GameState.propQuiet.
 */

/** A noisy prop as the simulation reads it (WorldQuery.noisyProps): its box and its noise. */
export interface NoisyProp {
  readonly kind: BlockKind;
  readonly center: Readonly<Vec3>;
  /** Half its size along each axis. */
  readonly half: Readonly<Vec3>;
  readonly noise: PropNoise;
}

/** The noisy props among `blocks` (those with a row in `props`), in block order: their index is GameState.propQuiet's. */
export function noisyPropsOf(blocks: readonly MapBlock[], props: NoiseConfig['props']): NoisyProp[] {
  const out: NoisyProp[] = [];
  for (const b of blocks) {
    const noise = props[b.kind];
    if (noise) out.push({ kind: b.kind, center: b.center, half: vec3(b.size.x / 2, b.size.y / 2, b.size.z / 2), noise });
  }
  return out;
}

/** What the noisy-prop rules read and write in a tick (SimContext.propNoise, filled by stepSimulation; reused). */
export interface PropNoiseContext {
  cfg: NoiseConfig;
  props: readonly NoisyProp[];
  /** GameState.propQuiet: the time (s) until which each prop, by index, makes no noise. */
  quiet: number[];
  /** The tick's simulation time (GameState.time). */
  time: number;
  events: GameEvent[];
}

/** A context for `props` under `cfg`, at time 0 with every prop ready to sound; stepSimulation points it at the state. */
export function createPropNoiseContext(cfg: NoiseConfig, props: readonly NoisyProp[] = []): PropNoiseContext {
  const quiet: number[] = [];
  readyQuiet(quiet, props.length);
  return { cfg, props, quiet, time: 0, events: [] };
}

/** Grows `quiet` to one entry per prop, each quiet until never (once per match: it allocates only the first time). */
export function readyQuiet(quiet: number[], props: number): void {
  while (quiet.length < props) quiet.push(Number.NEGATIVE_INFINITY);
}

/** Prop `index` makes its noise at (x, y, z), caused by `characterId`, unless it made one less than `quiet` ago. */
function sound(ctx: PropNoiseContext, index: number, characterId: number, x: number, y: number, z: number, range: number, shot: boolean): void {
  if (ctx.time < (ctx.quiet[index] ?? Number.NEGATIVE_INFINITY)) return;
  ctx.quiet[index] = ctx.time + ctx.cfg.quiet;
  const prop = ctx.props[index]!;
  ctx.events.push({ type: 'propNoise', characterId, prop: index, kind: prop.kind, position: vec3(x, y, z), range, shot });
}


/**
 * After character `c`'s move this tick (`desired` the move it wanted, `corrected` the one it made, over `dt` seconds): a
 * run into a noisy prop sounds it. The move counts as one when it lost at least `blockedMin` against something, the speed
 * it had into that (the wanted move along the way it was stopped) was `bumpSpeed` or more, and the nearest noisy prop
 * whose face is within `touch` of the body (`radius` round, `height` tall) lies that way (`facing`). The noise comes from
 * that face, `noiseHeight` above the feet. Allocation-free unless it sounds.
 */
export function stepPropBump(c: Character, desired: Readonly<Vec3>, corrected: Readonly<Vec3>, dt: number, radius: number, height: number, ctx: PropNoiseContext): void {
  const cfg = ctx.cfg;
  const bx = desired.x - corrected.x;
  const bz = desired.z - corrected.z;
  const blocked = Math.sqrt(bx * bx + bz * bz);
  if (blocked < cfg.blockedMin) return;
  const nx = bx / blocked;
  const nz = bz / blocked;
  if ((desired.x * nx + desired.z * nz) / dt < cfg.bumpSpeed) return;
  const p = c.position;
  const reach = radius + cfg.touch;
  let best = -1;
  let bestDistance = reach;
  let bestX = 0;
  let bestZ = 0;
  const props = ctx.props;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]!;
    const top = prop.center.y + prop.half.y;
    if (top <= p.y + cfg.underfoot || prop.center.y - prop.half.y >= p.y + height) continue;
    const qx = clamp(p.x, prop.center.x - prop.half.x, prop.center.x + prop.half.x);
    const qz = clamp(p.z, prop.center.z - prop.half.z, prop.center.z + prop.half.z);
    const dx = qx - p.x;
    const dz = qz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > bestDistance || (d > 1e-6 && (dx * nx + dz * nz) / d < cfg.facing)) continue;
    best = i;
    bestDistance = d;
    bestX = qx;
    bestZ = qz;
  }
  if (best < 0) return;
  const prop = props[best]!;
  const y = clamp(p.y + cfg.noiseHeight, prop.center.y - prop.half.y, prop.center.y + prop.half.y);
  sound(ctx, best, c.id, bestX, y, bestZ, prop.noise.bumped, false);
}

/**
 * A BB fired by `ownerId` stopped on the level at `at`, landing at `speed` m/s: if that is on a prop that rings
 * (PropNoise.shot above 0) and the BB came in at `shotMinSpeed` or faster, the prop rings. Allocation-free unless it does.
 */
export function ringProp(at: Readonly<Vec3>, speed: number, ownerId: number, ctx: PropNoiseContext): void {
  const cfg = ctx.cfg;
  if (speed < cfg.shotMinSpeed) return;
  const m = cfg.shotMargin;
  const props = ctx.props;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]!;
    if (prop.noise.shot <= 0) continue;
    const c = prop.center;
    const h = prop.half;
    if (Math.abs(at.x - c.x) > h.x + m || Math.abs(at.y - c.y) > h.y + m || Math.abs(at.z - c.z) > h.z + m) continue;
    sound(ctx, i, ownerId, at.x, at.y, at.z, prop.noise.shot, true);
    return;
  }
}
