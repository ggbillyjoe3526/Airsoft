/**
 * The version the title screen shows (owner, 2026-10-04: always the build being played, never a label someone has to
 * remember to bump). vite.config.ts works it out when the game is built or served, from `git describe --tags`, or from
 * `.git_archival.txt` in a release download (GitHub fills it in as it makes the zip; see .gitattributes).
 */

/** Shown when neither git nor a release download says which build this is. */
export const UNKNOWN_BUILD = 'dev build';

/** The title screen's label and its tooltip for one `git describe --tags --always` output. */
export interface VersionLabel {
  label: string;
  title: string;
}

/**
 * "v0.1-alpha.3" on a release; "v0.1-alpha.3+12 · abc1234" twelve commits after it (commit abc1234); "build abc1234"
 * with no release tag in reach (a shallow clone); UNKNOWN_BUILD for anything else (empty, or an archive that wasn't
 * filled in).
 */
export function versionLabel(describe: string): VersionLabel {
  const d = describe.trim();
  const after = /^(v\d.*)-(\d+)-g([0-9a-f]{4,})$/.exec(d);
  if (after) {
    const [, tag, commits, hash] = after;
    return { label: `${tag}+${commits} · ${hash}`, title: `${commits} commit${commits === '1' ? '' : 's'} after ${tag} (commit ${hash})` };
  }
  if (/^v\d[\w.-]*$/.test(d)) return { label: d, title: `Release ${d}` };
  if (/^[0-9a-f]{4,}$/.test(d)) return { label: `build ${d}`, title: `Commit ${d}` };
  return { label: UNKNOWN_BUILD, title: 'Built outside git' };
}

/** The `describe:` line of a release download's `.git_archival.txt`, or '' if it wasn't filled in. */
export function archivalDescribe(text: string): string {
  const line = /^describe:\s*(.*)$/m.exec(text)?.[1]?.trim() ?? '';
  return line.includes('$Format') ? '' : line;
}
