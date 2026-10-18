/**
 * The third-party licences file every build writes beside the page (LC1): Vite's `build.license` lists each npm package
 * the bundle holds, with its licence text, and vite.config.ts appends what ships from inside another package or from the
 * repo, which Vite can't see. The title screen links it (ui/menus/titleScreen.ts). Only `fileName` reaches the game; the
 * rest is build-time.
 */
export const THIRD_PARTY_LICENCES = {
  /**
   * A `.txt` file (Vite writes Markdown into it), so every browser shows it as text: a static host serves `.md` as
   * `text/markdown`, which some browsers download instead.
   */
  fileName: 'third-party-licences.txt',
} as const;

/** Code or a font the game ships that Vite's list misses: it sits inside another package, or in the repo. */
export interface VendoredNotice {
  /** The heading, as Vite writes each package's: name and licence. */
  name: string;
  licence: string;
  /** What ships and where it comes from, one line. */
  ships: string;
  /** The file the build reads the notice from, relative to the project root. */
  source: string;
  /** The whole file is the notice, or the file is code whose header holds the MIT copyright line. */
  read: 'file' | 'mitHeader';
}

export const VENDORED_NOTICES: readonly VendoredNotice[] = [
  {
    name: 'meshoptimizer',
    licence: 'MIT',
    ships: "The packed models' decoder, bundled from three's package (`three/examples/jsm/libs/meshopt_decoder.module.js`).",
    source: 'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js',
    read: 'mitHeader',
  },
  {
    name: 'Inter',
    licence: 'OFL-1.1',
    ships: "The menus' and HUD's typeface, four weights served with the game (`src/assets/fonts/`).",
    source: 'src/assets/fonts/OFL.txt',
    read: 'file',
  },
];

/** The MIT licence's terms, which follow the copyright line. */
export const MIT_TERMS = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/**
 * One notice's text from its source file. For `mitHeader`, the copyright line from the file's leading comments and the
 * MIT terms; it throws when the header has none, so a three.js update that moves the line fails the build rather than
 * shipping the decoder without its notice. Pure.
 */
export function noticeText(notice: VendoredNotice, source: string): string {
  if (notice.read === 'file') return source.trim();
  const header = source.match(/^(?:\s*\/\/.*\r?\n)+/)?.[0] ?? '';
  const copyright = header.match(/Copyright[^\n]*/)?.[0];
  if (!copyright) throw new Error(`${notice.source}: no copyright line in its header for the ${notice.name} notice`);
  return `${copyright.trim()}\n\n${MIT_TERMS}`;
}

/** Vite's licences Markdown with the vendored notices after its packages, each under a heading in Vite's form. Pure. */
export function withVendoredNotices(markdown: string, notices: readonly { notice: VendoredNotice; text: string }[]): string {
  const sections = notices.map(({ notice, text }) => `\n## ${notice.name} (${notice.licence})\n\n${notice.ships}\n\n${text}\n`);
  return `${markdown.trimEnd()}\n${sections.join('')}`;
}
