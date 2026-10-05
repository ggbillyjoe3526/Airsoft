import type { ExtractionRules } from '../config/extraction';
import type { RunState } from '../sim/extraction';
import { formatRoundTime } from '../config/matchRules';

/** What the strip under the scoreboard says in Extraction: the line, how far the count is (0..1), and whether it warns. */
export interface RunLine {
  text: string;
  progress: number;
  urgent: boolean;
}

/**
 * The Extraction strip's line (M43), from the run and the seconds left: the count while you stand in an exit (or why it
 * has stopped), otherwise where you can get out, and when the late exit opens. Under a minute left it says so.
 */
export function runLine(run: RunState, clock: number, rules: ExtractionRules): RunLine {
  if (run.outcome === 'extracted') return { text: 'Counted out · you made it', progress: 1, urgent: false };
  if (run.outcome !== 'none') return { text: '', progress: 0, urgent: false };
  const progress = run.count / rules.extractTime;
  if (run.countStatus === 'paused') return { text: 'Count paused · someone from the home team is in the exit', progress, urgent: true };
  if (run.countStatus === 'counting') {
    const left = Math.max(1, Math.ceil(rules.extractTime - run.count - 1e-9));
    return { text: `Counting you out · ${left}`, progress, urgent: false };
  }
  const open = run.exits.filter((e) => e.open).map((e) => e.name);
  const late = run.exits.find((e) => e.late && !e.closed && !e.open);
  const lateNote = late ? ` · ${late.name} opens at ${formatRoundTime(rules.lateExitAt)}` : '';
  const hurry = clock <= rules.warnAt;
  if (open.length === 0) return { text: `No exit open yet${lateNote}`, progress: 0, urgent: hurry };
  const where = `${open.length === 1 ? 'Exit' : 'Exits'}: ${open.join(', ')}`;
  return { text: hurry ? `Under a minute · ${where}` : `${where}${lateNote}`, progress: 0, urgent: hurry };
}

/** The respawn note beside the strip: your one respawn is still there, or spent. */
export function respawnNote(left: number): string {
  return left > 0 ? `Respawn ready` : 'No respawn left';
}
