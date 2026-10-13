import type { BodyConfig, MovementConfig } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { WorldQuery } from '../sim/armament';
import { createVaultState, planVault } from '../sim/vault';
import { type Vec3, vec3 } from '../sim/vec';
import { type NavGrid, nodeAt, nodeX, nodeZ, stepNode, type VaultLinks } from './navGrid';

/**
 * Vault links (M102): where a body can vault a low obstacle (sim/vault.ts planVault), a link from the node it stands on
 * to the node past the obstacle, so a bot's route search can go over it (NavSearch.vaults). Found from the grid alone
 * (a walkable node beside a blocked one) and the level's rays, along the grid's axes: the maps' blocks are all square
 * to them, so a vault straight across is the one a bot walks.
 */

/** Steps along the grid's four axes, as (di, dj). */
const DI = [1, -1, 0, 0];
const DJ = [0, 0, 1, -1];
/** How far past the vault's clear point the landing node is looked for, in cells (the first walkable one wins). */
const LAND_CELLS = [1, 2, 3];

/**
 * Every vault link of `g`: from each walkable node with a blocked node of the same floor next to it, straight on over
 * the obstacle there, if a body standing on the node could vault it (from a standstill, the shortest reach) and lands
 * on a walkable node. Each costs its length plus `price` metres, in cells: a vault is slower than its length on foot,
 * and loud (BOT_BEHAVIOUR.vaultPrice). Allocates the links once.
 */
export function buildVaultLinks(g: NavGrid, query: WorldQuery, body: BodyConfig, movement: MovementConfig, price: number): VaultLinks {
  const nodes = g.floorY.length;
  const start = new Int32Array(nodes + 1);
  const to: number[] = [];
  const cost: number[] = [];
  const plan = createVaultState();
  const feet = vec3();
  for (let k = 0; k < nodes; k++) {
    start[k] = to.length;
    if (g.walkable[k] !== 1) continue;
    const c = g.nodeCell[k]!;
    const ci = c % g.cols;
    const cj = (c - ci) / g.cols;
    for (let d = 0; d < 4; d++) {
      const ni = ci + DI[d]!;
      const nj = cj + DJ[d]!;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = stepNode(g, k, nj * g.cols + ni);
      if (n < 0 || g.walkable[n] === 1) continue;
      feet.x = nodeX(g, k);
      feet.y = g.floorY[k]! + PHYSICS.groundRestGap;
      feet.z = nodeZ(g, k);
      if (!planVault(feet, DI[d]!, DJ[d]!, 0, movement.vault, body, query, plan)) continue;
      for (const cells of LAND_CELLS) {
        const s = plan.far + cells * g.cell;
        const m = nodeAt(g, feet.x + DI[d]! * s, plan.topY, feet.z + DJ[d]! * s);
        if (m < 0 || g.walkable[m] !== 1) continue;
        to.push(m);
        cost.push((Math.hypot(nodeX(g, m) - feet.x, nodeZ(g, m) - feet.z) + price) / g.cell);
        break;
      }
    }
  }
  start[nodes] = to.length;
  return { start, to: Int32Array.from(to), cost: Float32Array.from(cost) };
}

/** Builds `g`'s vault links (buildVaultLinks) unless it has them already; returns them. */
export function vaultLinksOf(g: NavGrid, query: WorldQuery, body: BodyConfig, movement: MovementConfig, price: number): VaultLinks {
  return (g.vaults ??= buildVaultLinks(g, query, body, movement, price));
}

/** True if the route leg from `a` to `b` (waypoints on node centres) is a vault link of `g`. */
export function isVaultLeg(g: NavGrid, a: Readonly<Vec3>, b: Readonly<Vec3>): boolean {
  const links = g.vaults;
  if (!links || links.to.length === 0) return false;
  const from = nodeAt(g, a.x, a.y, a.z);
  if (from < 0) return false;
  const end = links.start[from + 1]!;
  if (links.start[from] === end) return false;
  const land = nodeAt(g, b.x, b.y, b.z);
  for (let l = links.start[from]!; l < end; l++) if (links.to[l] === land) return true;
  return false;
}
