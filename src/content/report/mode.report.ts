import { beforeAll, describe, expect, it } from 'vitest';
import budget from '../../../pipeline/perf-budget.json';
import { DIFFICULTIES } from '../../config/bots';
import { MATCH_MODES } from '../../config/modes';
import { lightingChoices } from '../../map/lightingChoice';
import { perfMapName } from '../mapChecks';
import { botsCheck, playsCheck } from '../modePlayChecks';
import { checkMode, COMPILED_PLACES, gameModeContext, hostMaps, modePairings, pinnedModes, rowWords } from '../modeChecks';
import { initPhysics } from '../../physics/physicsWorld';
import { contentModes, ENV, reportMeta } from './reportSupport';

/**
 * The content report's first runner for a mode (CT3): levels 1 and 2 and the fast part of level 3 for the mode
 * AIRSOFT_CONTENT_ITEM names ("mode:<id>", every mode for "mode:all"): its rules, its fit with the rulesets and rows,
 * a short headless match of every pairing of its compatibility grid and the bots' check on every map that hosts it (on
 * the first public one for "mode:all"), and the perf gate check. Then every mode side by side, the places that answer
 * for a mode, and the plans for the rest: the browser match, the perf runs and the balance run. Everything goes into the
 * test's meta as `content`; `pipeline/content-check.mjs` reads it.
 */

describe('content report: a mode’s rules, fit and spec test', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('checks the mode', { timeout: 1_800_000 }, (ctx) => {
    const targets = contentModes();
    expect(targets.length, `no mode is called "${ENV.AIRSOFT_CONTENT_ITEM}" (modes: ${MATCH_MODES.map((m) => m.id).join(', ')})`).toBeGreaterThan(0);
    const checks = gameModeContext();
    const one = targets.length === 1;
    const results = [pinnedModes(checks)];
    for (const mode of targets) {
      results.push(...checkMode(mode, budget, checks));
      const hosts = hostMaps(checks, mode.id);
      const played = one ? hosts : hosts.filter((m) => m.entry.tag === 'public').slice(0, 1);
      for (const host of played.length > 0 ? played : hosts.slice(0, 1)) {
        const fit = checks.fit[mode.id];
        if (!fit) continue;
        results.push(playsCheck(mode, host.entry, host.data, modePairings(mode.id, host.entry, checks.defaultRuleset, fit.rulesets)));
        results.push(botsCheck(mode, host.entry, host.data));
      }
    }

    // Every mode side by side: the report's table.
    const label = (id: string) => checks.rulesets.find((r) => r.id === id)?.label ?? id;
    const modes = checks.modes.map((m) => {
      const shape = checks.shapes[m.id];
      const fit = checks.fit[m.id];
      return {
        id: m.id,
        label: m.label,
        tag: m.tag,
        play: shape?.play ?? null,
        needs: shape?.needs ?? null,
        maps: hostMaps(checks, m.id).map((h) => h.entry.label),
        rulesets: (fit?.rulesets ?? []).map(label),
        hides: (fit?.ignores ?? []).map(rowWords),
      };
    });
    const places = [...checks.probes.map((p) => `${p.place} (${p.where})`), ...COMPILED_PLACES];

    // The plans for one mode: a browser match on its first public host, a perf run on each host on the budget preset,
    // and the balance run on each host and lighting (a round mode other than Elimination also plays Elimination there:
    // its pay is set beside Elimination's).
    const target = targets[0]!;
    const hosts = hostMaps(checks, target.id);
    const first = hosts.find((m) => m.entry.tag === 'public') ?? hosts[0];
    const shape = checks.shapes[target.id];
    const browser = one && first ? { mode: target.id, label: target.label, map: first.entry.id, mapLabel: first.entry.label, play: shape?.play ?? 'rounds' } : null;
    const perf = one ? hosts.map((m) => ({ map: perfMapName(budget, m.entry.id), label: m.entry.label, mode: target.id, preset: budget.budgetPreset })) : [];
    const plan = one
      ? {
          mode: target.id,
          label: target.label,
          tag: target.tag,
          maps: hosts.map((m) => ({ id: m.entry.id, label: m.entry.label, tag: m.entry.tag, lightings: lightingChoices(m.data) })),
          levels: DIFFICULTIES.map((d) => d.id),
          reference: shape?.play === 'rounds' && target.id !== 'elimination' ? 'elimination' : null,
        }
      : null;

    reportMeta(ctx, 'content', {
      kind: 'mode',
      items: targets.map((m) => ({ id: `mode-${m.id}`, name: m.label, category: 'mode', tag: m.tag, key: m.id })),
      results,
      modes,
      places,
      browser,
      perf,
      plan,
    });
  });
});
