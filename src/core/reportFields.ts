import type { QualityChoice, QualitySettings } from '../config/render';
import type { RunState } from '../sim/extraction';

/**
 * The render quality as the debug overlay and the crash report give it (audit CORE-02): the choice, whether the game
 * picked it, and the render scale, shadow map and textures in force. Pure.
 */
export function qualityLine(choice: QualityChoice, automatic: boolean, q: QualitySettings): string {
  return `${choice}${automatic ? ' (auto)' : ''} · scale ${q.renderScale} · shadow map ${q.shadows ? q.shadowMapSize : 'off'} · textures ${q.textureSize}`;
}

/**
 * An Extraction run's state for a crash report (audit CORE-02): its outcome so far, the exits open, the cases opened,
 * what the runner carries and the home team's waves. Pure.
 */
export function runReportLine(run: RunState): string {
  const exits = run.exits.filter((e) => !e.closed);
  const placed = run.cases.filter((c) => !c.dropped);
  return [
    run.outcome === 'none' ? 'running' : run.outcome,
    `exits open ${exits.filter((e) => e.open).length}/${exits.length}${run.lateOpened ? ' (late open)' : ''}`,
    `cases opened ${placed.filter((c) => c.open).length}/${placed.length}`,
    `carrying ${run.carried.length}`,
    `waves ${run.waves}`,
  ].join(', ');
}
