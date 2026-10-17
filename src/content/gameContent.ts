import { BARRELS, type BarrelId, GRIPS, type GripId, MAGAZINES, type MagazineId, MUZZLES, type MuzzleId } from '../config/attachments';
import { GAME_STATS } from '../config/gameStats';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import { SOUNDS } from '../config/sounds';
import { GAME_BOT_KITS } from '../pool/gameBotKits';
import { GAME_POOL } from '../pool/gamePool';
import { GAME_LEVELS } from '../progress/gameLevels';
import { loadLevels } from '../progress/levels';
import levelsText from '../../data/levels.md?raw';
import { BARREL_KEYS, GRIP_KEYS, LASER_KEYS, LIGHT_KEYS, MAGAZINE_KEYS, MUZZLE_KEYS, OPTIC_KEYS, REPLICA_KEYS } from '../pool/pool';
import type { Asset, Pool } from '../pool/pool';
import { REPLICA_PART_TABLES } from '../render/replicas/replicaParts';
import { type CheckResult } from './checks';
import { type ContentInputs, type DrawTable, effect, flagEffect, type PartEffect, shareEffect } from './contentInputs';
import { partCompatibility, partRules } from './partChecks';
import { levelCheck } from './levelChecks';
import { replicaBotChecks, replicaCompatibility, replicaRules, replicaSaveCheck } from './replicaChecks';

/**
 * The game's own content, as the checks read it (CT1): the pool, stats.md, the replica configs, the model tables, the
 * sound cues and what each part's numbers change. Tooling: nothing in the game imports src/content.
 */

/** What a part changes, from the game's configs (stats.md laid over the built-in numbers). */
export function gameEffects(part: Asset): PartEffect[] {
  switch (part.category) {
    case 'optic': {
      const o = OPTICS[part.key as OpticId];
      return o ? [effect('raise time', o.raiseScale, 1, true), ...(o.zoom > 1 ? [{ says: `zoom ×${o.zoom}`, change: 'better' as const }] : [])] : [];
    }
    case 'grip': {
      const g = GRIPS[part.key as GripId];
      return g ? [effect('handling', g.handlingScale, 1, true), effect('sprint shake', g.shakeScale, 1, true)] : [];
    }
    case 'laser': {
      const l = LASERS[part.key as LaserId];
      return l ? [effect('spread', l.spreadScale, 1, true)] : [];
    }
    case 'magazine': {
      const m = MAGAZINES[part.key as MagazineId];
      if (!m) return [];
      return [
        effect('capacity', m.capacity, 1, false),
        { says: `magazines carried ${m.carried >= 0 ? '+' : ''}${m.carried}`, change: m.carried === 0 ? 'same' : m.carried > 0 ? 'better' : 'worse' },
        effect('reload', m.reloadScale, 1, true),
        effect('draw', m.drawScale, 1, true),
        flagEffect('rattles', m.rattles),
      ];
    }
    case 'barrel': {
      const b = BARRELS[part.key as BarrelId];
      return b ? [shareEffect('energy', b.energy), effect('spread', b.spreadScale, 1, true), effect('handling', b.handlingScale, 1, true)] : [];
    }
    case 'muzzle': {
      const m = MUZZLES[part.key as MuzzleId];
      return m ? [shareEffect('energy', m.energy), effect('handling', m.handlingScale, 1, true), effect('heard from', m.heardScale, 1, true)] : [];
    }
    case 'light':
      // A torch lights the bots' targets at night: its gain; its cost (it gives you away) is its category's.
      return [{ says: 'lights what you aim at, at night', change: 'better' }];
    case 'power': {
      const p = GAME_STATS.power[part.id];
      return p ? [shareEffect('energy', p.energy), shareEffect('fire rate', p.fireRate), shareEffect('kick', p.recoil, true)] : [];
    }
    default:
      return [];
  }
}

/** The model tables' names (render/replicas/replicaParts.ts), by table. */
export function gameDrawTables(): Record<string, DrawTable> {
  const out: Record<string, DrawTable> = {};
  for (const [name, t] of Object.entries(REPLICA_PART_TABLES)) out[name] = { parts: Object.keys(t.parts), magazines: Object.keys(t.magazines), muzzles: Object.keys(t.muzzles) };
  return out;
}

/** The checks' inputs for `pool` (the game's by default) with the game's configs and tables, bot-kits.md's among them. */
export function gameInputs(pool: Pool = GAME_POOL): ContentInputs {
  return {
    pool,
    stats: GAME_STATS,
    // Another pool (a check's test) reads levels.md against itself, so the levels name its own items.
    levels: pool === GAME_POOL ? GAME_LEVELS : loadLevels(levelsText, pool),
    replicas: REPLICA_KEYS,
    drawTables: gameDrawTables(),
    soundCues: new Set(Object.keys(SOUNDS)),
    partKeys: { optic: OPTIC_KEYS, grip: GRIP_KEYS, laser: LASER_KEYS, magazine: MAGAZINE_KEYS, barrel: BARREL_KEYS, muzzle: MUZZLE_KEYS, light: LIGHT_KEYS, power: [] },
    effects: gameEffects,
    botKits: GAME_BOT_KITS,
  };
}

/**
 * Levels 1 and 2 for one asset (a replica or a part). The save check needs an empty localStorage installed by the
 * caller (the tests and the report runner stub one).
 */
export function checkAsset(inputs: ContentInputs, asset: Asset): CheckResult[] {
  if (asset.category === 'replica') return [...replicaRules(inputs, asset), ...levelCheck(inputs, asset), ...replicaCompatibility(inputs, asset), ...replicaBotChecks(inputs, asset), ...replicaSaveCheck(inputs, asset)];
  if (asset.category === 'grenade') return levelCheck(inputs, asset);
  return [...partRules(inputs, asset), ...levelCheck(inputs, asset), ...partCompatibility(inputs, asset)];
}

/** Levels 1 and 2 for every asset in the pool. */
export function checkAllAssets(inputs: ContentInputs = gameInputs()): CheckResult[] {
  return inputs.pool.assets.flatMap((a) => checkAsset(inputs, a));
}
