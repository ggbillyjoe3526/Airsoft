import { BRAND_WORDS, PUBLIC_ITEMS } from '../config/contentRules';
import type { Asset } from '../pool/pool';
import { type CheckResult, itemName, result } from './checks';

/**
 * The rules every pooled asset keeps, whatever its kind (CT1; docs/content/README.md): a Title Case name that is no
 * real brand, and a `public` tag only once it has been through the public gate.
 */

/** `name` with every word starting with a capital or a digit ("11.1 V LiPo Battery", "2x Scope"). */
export function isTitleCase(name: string): boolean {
  return name.split(/\s+/).every((w) => w === '' || !/[a-z]/.test(w[0]!));
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The brand words `name` uses (whole words, any case). */
export function brandsIn(name: string, words: readonly string[] = BRAND_WORDS): string[] {
  return words.filter((w) => new RegExp(`(^|[^A-Za-z0-9])${escape(w)}($|[^A-Za-z0-9])`, 'i').test(name));
}

/** The name and access rules for `asset`, with `register` the items made public (contentRules.ts PUBLIC_ITEMS). */
export function assetRules(asset: Asset, kind: string, register: Readonly<Record<string, string>> = PUBLIC_ITEMS): CheckResult[] {
  const item = itemName(asset);
  const out: CheckResult[] = [];
  const brands = brandsIn(asset.name);
  if (brands.length > 0) out.push(result('rules', `${kind}.name`, item, 'fail', `Its name uses a real brand or model (${brands.join(', ')}). Give it a made-up name.`));
  else if (!isTitleCase(asset.name)) out.push(result('rules', `${kind}.name`, item, 'fail', 'Its name is not in Title Case (each word starts with a capital).'));
  else out.push(result('rules', `${kind}.name`, item, 'pass', 'Its name is in Title Case and is no real brand.'));
  if (asset.tag === 'dev') out.push(result('rules', `${kind}.access`, item, 'pass', 'Tagged dev: only you see it, with Dev content on.'));
  else if (register[asset.id]) out.push(result('rules', `${kind}.access`, item, 'pass', `Public (${register[asset.id]}).`));
  else out.push(result('rules', `${kind}.access`, item, 'fail', 'Tagged public without going through the public gate. Tag it dev until it passes.'));
  return out;
}
