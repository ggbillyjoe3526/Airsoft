import { type CheckResult, num, result } from './checks';
import { colourDistance } from './colour';
import { botTeams, hex, listWords, type SkinContext, type SkinEntry, skinItem } from './skinCheckSupport';
import { readableColours } from './skinSpec';

/**
 * Level 3 of a skin's checks against the maps (CT4): its colours that show at a distance beside each map's common
 * colours, so a skin a bot carries never vanishes into a field. The maps' colours are measured in the browser by
 * `pipeline/content-pictures.mjs` measureMapPalettes (each map's painted surfaces as they are drawn, texture and tint,
 * before light: what a surface is, not how a lamp catches it), as colour buckets with their share of the surface; here
 * they are merged into a palette and judged.
 */

/** A colour and its share of a surface. */
export interface ColourShare {
  colour: number;
  share: number;
}

/** A map's measured colours: its id, its name and its colour buckets. */
export interface MapColours {
  map: string;
  label: string;
  buckets: readonly ColourShare[];
}

/** Buckets this close (ΔE00) are one colour of the palette. */
const MERGE = 5;

/** A map's palette: its buckets merged into colours (largest first), keeping those that cover SKIN_RULES.mapShare or more. */
export function mapPalette(buckets: readonly ColourShare[], minShare: number): ColourShare[] {
  const clusters: ColourShare[] = [];
  for (const b of [...buckets].sort((x, y) => y.share - x.share)) {
    const near = clusters.find((c) => colourDistance(c.colour, b.colour) <= MERGE);
    if (near) near.share += b.share;
    else clusters.push({ ...b });
  }
  return clusters.filter((c) => c.share >= minShare).sort((x, y) => y.share - x.share);
}

/**
 * The skin on one map: each colour of it that shows at a distance against the map's common colours. It blends in when
 * every such colour is within SKIN_RULES.blend of one of them; that asks for a look when a bot carries it (it is seen
 * across the field), and is a figure when only a player's own hands do.
 */
export function skinOnMap(skin: SkinEntry, ctx: SkinContext, map: MapColours): CheckResult {
  const item = `${skinItem(skin)} on ${map.label}`;
  const palette = mapPalette(map.buckets, ctx.rules.mapShare);
  if (palette.length === 0) return result('spec', 'skin.map', item, 'warn', `${map.label}'s colours could not be measured; look at it in the game.`);
  const readable = readableColours(skin, ctx);
  const against = readable.map((c) => {
    const nearest = palette.reduce((best, p) => {
      const d = colourDistance(c.colour, p.colour);
      return d < best.d ? { d, p } : best;
    }, { d: Infinity, p: palette[0]! });
    return { ...c, ...nearest };
  });
  const standsOut = against.filter((a) => a.d >= ctx.rules.blend).sort((a, b) => b.d - a.d);
  const common = listWords(palette.slice(0, 4).map((p) => `${hex(p.colour)} ${num(100 * p.share, 0)} %`));
  if (standsOut.length > 0) {
    const best = standsOut[0]!;
    return result('spec', 'skin.map', item, 'pass', `Stands out: its ${hex(best.colour)} is ${num(best.d, 0)} apart in colour from the nearest of the map's common colours (under ${ctx.rules.blend} blends in; ${common}).`);
  }
  const closest = against.sort((a, b) => a.d - b.d)[0]!;
  const words = `Blends in: every colour of it that shows at a distance is within ${ctx.rules.blend} of the map's (its ${hex(closest.colour)} is ${num(closest.d, 0)} from ${hex(closest.p.colour)}; ${common})`;
  const carriers = botTeams(ctx, skin.id);
  if (carriers.length > 0) return result('spec', 'skin.map', item, 'warn', `${words}, and bots carry it: look at it there.`);
  return result('spec', 'skin.map', item, 'info', `${words}; only a player's own hands carry it, where it is seen close up.`);
}
