// PreToolUse hook on Read (token-efficiency plan, item 24): a whole-file read of a text file over 40 KB is stopped and
// the agent is told to grep first and read a range. Fails open: any problem lets the read through.
import { readFileSync, statSync } from 'node:fs';

const LIMIT_BYTES = 40 * 1024;
const TEXT = /\.(md|ts|mjs|js|json|txt|log|csv|html|css|yml|yaml)$/i;

try {
  const { tool_input: input } = JSON.parse(readFileSync(0, 'utf8'));
  const path = input?.file_path;
  const ranged = input?.offset !== undefined || input?.limit !== undefined;
  if (path && !ranged && TEXT.test(path)) {
    const bytes = statSync(path).size;
    if (bytes > LIMIT_BYTES) {
      process.stderr.write(
        `${path} is ${Math.round(bytes / 1024)} KB. Grep for the heading or lines you need, then Read with offset and ` +
          'limit (CLAUDE.md §8, token and context hygiene).\n',
      );
      process.exit(2);
    }
  }
} catch {
  // Unreadable input or a missing file: let the Read tool report it.
}
