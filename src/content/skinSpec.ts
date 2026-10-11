import { type CheckResult, num, result } from './checks';
import { readsAsTeam } from './mapRules';
import { botTeams, claimedReplicas, hex, listWords, type SkinContext, type SkinEntry, skinItem, teamName } from './skinCheckSupport';
import { DETAILS, type FigureRole, surveyFigure } from './skinDraw';
import { drawn } from './skinFit';

/**
 * Level 3 of a skin's checks (CT4; docs/content/skins.md), the parts that need no browser: the teams stay readable
 * (no colour that shows at a distance reads as a team's, but a bot's own team's), and its texture memory. Its colours
 * against each map's are skinMaps.ts (the report measures the maps in the browser); level 4 is none (looks only).
 */

/** A skin's colours as a figure carries it (what is seen at a distance): each colour that shows, and its share, the larger of Low's and High's. */
export function figureColours(skin: SkinEntry, ctx: SkinContext): { colour: number; share: number }[] {
  const colours = Object.fromEntries((['body', 'furniture', 'detail', 'accent', 'steel'] as FigureRole[]).map((r) => [r, skin.scheme[r]])) as Record<FigureRole, number>;
  const by = new Map<number, number>();
  for (const r of claimedReplicas(ctx)) {
    for (const high of [false, true]) {
      for (const c of surveyFigure(r.config, colours, high, ctx.files)) by.set(c.colour, Math.max(by.get(c.colour) ?? 0, c.share));
    }
  }
  return [...by.entries()].map(([colour, share]) => ({ colour, share })).sort((a, b) => b.share - a.share);
}

/** The colours of `skin` that show at a distance (SKIN_RULES.readableShare of a figure's replica or more). */
export const readableColours = (skin: SkinEntry, ctx: SkinContext): { colour: number; share: number }[] => figureColours(skin, ctx).filter((c) => c.share >= ctx.rules.readableShare);

/**
 * Readable teams: a colour that shows at a distance never reads as another team's on a bot (any colour set, by the map
 * checks' team-colour rule); a player's own pick may read as a team's only with a reason written down (TEAM_COLOUR_SKINS).
 */
export function skinTeams(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const readable = readableColours(skin, ctx);
  const reads = readable.map((c) => ({ ...c, teams: [...new Set(ctx.teamColours.filter((t) => readsAsTeam(c.colour, [t.colour])).map((t) => t.team))] }));
  const teamy = reads.filter((r) => r.teams.length > 0);
  const carriers = botTeams(ctx, skin.id);
  const words = (r: (typeof reads)[number]): string => `Its ${hex(r.colour)} (${num(100 * r.share, 0)} % of a replica) reads as ${listWords(r.teams.map((t) => teamName(ctx, t)))}'s`;
  for (const team of carriers) {
    const other = teamy.find((r) => r.teams.some((t) => t !== team));
    if (other) return result('spec', 'skin.teams', item, 'fail', `${words(other)}, and ${teamName(ctx, team)}'s bots carry it: who is who gets confused at a distance.`);
  }
  if (teamy.length === 0) return result('spec', 'skin.teams', item, 'pass', `No colour of it that shows at a distance (${listWords(readable.map((r) => hex(r.colour)))}) reads as a team's, in either team colour set.`);
  const reason = ctx.teamColourSkins[skin.id];
  if (!reason) return result('spec', 'skin.teams', item, 'fail', `${words(teamy[0]!)}, in a player's hands. Pick colours away from both teams', or write down why it may (config/contentRules.ts TEAM_COLOUR_SKINS).`);
  const own = carriers.length > 0 ? `; only ${listWords(carriers.map((t) => teamName(ctx, t)))}'s bots carry it, their own colour` : '; no bot carries it';
  return result('spec', 'skin.teams', item, 'pass', `${words(teamy[0]!)}${own}, and a player may pick it (${reason}).`);
}

/** The texture memory it adds to one replica (High, where the textures are), within SKIN_RULES.textureMB. */
export function skinTexture(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const high = DETAILS[DETAILS.length - 1]!;
  let most = 0;
  for (const r of claimedReplicas(ctx)) {
    const own = drawn(ctx, r, skin.id, false, high);
    const plain = drawn(ctx, r, null, false, high);
    if (own instanceof Error || plain instanceof Error) continue; // skin.drawn says why
    most = Math.max(most, own.textureBytes - plain.textureBytes);
  }
  const mb = most / 1e6;
  if (mb > ctx.rules.textureMB) return result('spec', 'skin.texture', item, 'fail', `It adds ${num(mb, 1)} MB of texture memory to a replica, over the ${ctx.rules.textureMB} MB a skin may.`);
  return result('spec', 'skin.texture', item, 'pass', mb > 0 ? `It adds ${num(mb, 2)} MB of texture memory to a replica (a skin may add ${ctx.rules.textureMB} MB).` : `Flat colours: it adds no texture memory (a skin may add ${ctx.rules.textureMB} MB).`);
}

/** Level 4: none. */
export function skinBalance(skin: SkinEntry): CheckResult {
  return result('balance', 'skin.balance', skinItem(skin), 'info', 'Looks only: a skin never changes a number (its compatibility check proves it), so it has no balance run.');
}
