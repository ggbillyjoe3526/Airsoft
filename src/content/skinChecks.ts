import type { CheckResult } from './checks';
import { gameSkinContext, type SkinContext, type SkinEntry } from './skinCheckSupport';
import { playReadsNoSkin, skinDrawn, skinNumbers, skinOrangeTip, skinRealistic } from './skinFit';
import { defaultSkins, pinnedSkins, skinRules } from './skinRules';
import { skinBalance, skinTeams, skinTexture } from './skinSpec';

/**
 * A skin's checks (CT4; the rulebook is docs/content/skins.md): levels 1 to 3 of the content toolkit for every replica
 * colour scheme in config/schemes.ts SCHEMES, pure over the skin and the context (the game's own, or one with a fault in
 * it in the checks' tests). Level 1 is skinRules.ts, level 2 skinFit.ts, level 3 skinSpec.ts and, against each map's
 * colours measured in the browser, skinMaps.ts (the report's runners, src/content/report/skin.report.ts and
 * skinMaps.report.ts). Level 4 is none: looks only.
 */

export * from './skinCheckSupport';
export * from './skinFit';
export * from './skinMaps';
export * from './skinRules';
export * from './skinSpec';

/** Levels 1 to 3 (all but the maps) and level 4's note for one skin. */
export function checkSkin(skin: SkinEntry, ctx: SkinContext): CheckResult[] {
  return [...skinRules(skin, ctx), skinDrawn(skin, ctx), skinOrangeTip(skin, ctx), skinRealistic(skin, ctx), skinNumbers(skin, ctx), skinTeams(skin, ctx), skinTexture(skin, ctx), skinBalance(skin)];
}

/** The checks over every skin together: the pinned ids, the defaults and bots' skins, and that play reads no skin. */
export function checkSkinList(ctx: SkinContext): CheckResult[] {
  return [pinnedSkins(ctx), defaultSkins(ctx), playReadsNoSkin(ctx)];
}

/** Every skin's checks and the ones over the list. */
export function checkSkins(ctx: SkinContext): CheckResult[] {
  return [...checkSkinList(ctx), ...ctx.skins.flatMap((s) => checkSkin(s, ctx))];
}

export { gameSkinContext };
