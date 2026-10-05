import { PERFORMANCE_SHEET } from '../../config/menus';
import type { SheetRow } from '../performanceSheet';
import { el } from './menuParts';

/**
 * The Performance sheet's rows (M29) as the G3 look draws them: the stat's name, its value with the change against the
 * replica as it comes (green better, red worse, read out too), and a bar for reading it at a glance. Shared by the
 * Loadout's Selected panel and Customise.
 */
export function perfRows(rows: readonly SheetRow[]): HTMLElement[] {
  return rows.flatMap((r) => {
    const value = el('dd', 'perf-value', r.value);
    if (r.delta) {
      const delta = el('span', `perf-delta${r.change ? ` perf-${r.change}` : ''}`, r.delta);
      if (r.change) delta.title = PERFORMANCE_SHEET[r.change];
      value.append(' ', delta);
      if (r.change) value.append(el('span', 'sr-only', ` (${PERFORMANCE_SHEET[r.change]})`));
    }
    if (r.share !== null) {
      const bar = el('span', `perf-bar${r.change ? ` perf-${r.change}` : ''}`);
      bar.setAttribute('aria-hidden', 'true');
      const fill = el('i');
      fill.style.setProperty('--share', String(Math.round(r.share * 1000) / 1000));
      bar.append(fill);
      value.append(bar);
    }
    return [el('dt', 'perf-label', r.label), value];
  });
}

/** A Performance sheet: its heading, the line on what the changes are against, and the rows (`perfRows`). */
export function perfSheet(className = ''): { root: HTMLElement; rows: HTMLDListElement } {
  const root = el('aside', `perf-sheet${className ? ` ${className}` : ''}`);
  root.setAttribute('aria-label', PERFORMANCE_SHEET.title);
  const rows = el('dl', 'perf-rows');
  root.append(el('h3', 'perf-title', PERFORMANCE_SHEET.title), el('p', 'perf-note', PERFORMANCE_SHEET.against(PERFORMANCE_SHEET.chronoGrams)), rows);
  return { root, rows };
}
