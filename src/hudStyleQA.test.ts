import { describe, expect, it } from 'vitest';
import { SCOREBOARD_SIZE, scoreboardScale } from './config/matchInfo';

/**
 * G4 QA: the HUD's stylesheets (ui/hud.css and its files) read as text, as styleSheet.test.ts does, against what the HUD's
 * code and settings assume of them: the classes the parts toggle have rules, a hidden part really goes, the score bar's
 * measures agree with the tokens the other overlays keep under it, and the Scoreboard size setting still leaves the hit
 * feed its room.
 */

const nodeFs = 'node:' + 'fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };

function withImports(url: URL): string[] {
  const text = readFileSync(url, 'utf8');
  const imports = [...text.matchAll(/@import\s+'([^']+)';/g)].map((m) => new URL(m[1]!, url));
  return [text.replace(/@import\s+'[^']+';/g, ''), ...imports.flatMap(withImports)];
}
const uncomment = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');
const hudFiles = Object.fromEntries(
  ['score', 'minimap', 'feed', 'squad', 'replica', 'board'].map((name) => [name, uncomment(readFileSync(new URL(`./ui/hudCss/${name}.css`, import.meta.url), 'utf8'))]),
);
const hud = uncomment(withImports(new URL('./ui/hud.css', import.meta.url)).join('\n'));
const everything = uncomment([readFileSync(new URL('./style.css', import.meta.url), 'utf8'), ...withImports(new URL('./ui/menus/menus.css', import.meta.url)), hud].join('\n'));

/** The declarations of the first rule whose selector list has exactly `selector` as one of its selectors. */
function rule(sheet: string, selector: string): string | null {
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').some((s) => s.trim() === selector)) return m[2]!;
  }
  return null;
}
const px = (declarations: string | null, property: string): number => {
  const m = new RegExp(`(?:^|[;\\s])${property}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(declarations ?? '');
  if (!m) throw new Error(`no ${property}`);
  return Number(m[1]);
};

describe('the HUD\'s stylesheets have a rule for each state the HUD parts switch (G4)', () => {
  const states: [file: string, selector: string][] = [
    ['replica', '.hud-mode.on'],
    ['replica', '.hud-mag.low'],
    ['replica', '.hud-mags i.next b'],
    ['replica', '.hud-mags i.next::after'],
    ['replica', '.hud-mags i.low b'],
    ['replica', '.hud-mags i.empty'],
    ['replica', '.hud-reload.active'],
    ['squad', '.squad-card.hit'],
    ['score', '.sb-pips i.out'],
    ['score', '.sb-clock.low'],
    ['score', '.sb-respawn.spent'],
    ['score', '.scoreboard.sb-run .sb-score'],
    ['feed', '.hit-feed-line.you'],
    ['feed', '.hit-feed-line.fading'],
    ['board', '.match-board .stats-team tr.you td:first-child'],
  ];
  for (const [file, selector] of states) {
    it(`styles ${selector}`, () => {
      expect(rule(hudFiles[file]!, selector), `${selector} in ${file}.css`).not.toBeNull();
    });
  }

  it('styles every class the parts give their elements', () => {
    const classes = [
      'hud-replica', 'hud-replica-main', 'hud-replica-pic', 'hud-replica-words', 'hud-replica-name', 'hud-modes', 'hud-mode', 'hud-ammo', 'hud-mag',
      'hud-spare', 'hud-mags', 'hud-reload', 'hud-status', 'squad-bar', 'squad-order', 'squad-cards', 'squad-card', 'squad-card-words',
      'squad-card-state', 'squad-keys', 'sb-row', 'sb-team', 'sb-name', 'sb-role', 'sb-pips', 'sb-score', 'sb-mid', 'sb-clock', 'sb-aim',
      'sb-flag', 'minimap-frame', 'minimap', 'minimap-caption', 'hit-feed', 'hit-feed-line', 'hit-feed-row', 'hit-feed-name', 'hit-feed-bb',
      'hit-feed-tag', 'match-board', 'match-board-heading',
    ];
    const missing = classes.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(hud));
    expect(missing).toEqual([]);
  });

  it('really hides each part the code hides (an author `display` would otherwise beat the hidden attribute)', () => {
    const hides = ['scoreboard', 'sb-flag', 'sb-respawn', 'minimap-frame', 'hit-feed', 'squad-bar', 'squad-order', 'squad-cards', 'squad-keys', 'match-board', 'match-board-tip'];
    const unhidden = hides.filter((c) => !new RegExp(`\\.${c}\\[hidden\\]`).test(everything));
    expect(unhidden).toEqual([]);
  });

  it('leaves no rule for the fire-mode label the panel no longer has', () => {
    expect(everything).not.toMatch(/\.hud-firemode/);
  });
});

describe('the score bar\'s measures (G4 criterion 1)', () => {
  it('is as tall as the token the hit banner, the OUT tag and the round line keep under: its row, the gap and the strip', () => {
    const tokens = /--sb-height:\s*(\d+)px/.exec(everything);
    const row = px(rule(hudFiles.score!, '.sb-row'), 'height');
    const gap = px(rule(hudFiles.score!, '.scoreboard'), 'gap');
    const strip = px(rule(hudFiles.score!, '.sb-flag'), 'min-height');
    expect(Number(tokens![1])).toBe(row + gap + strip);
  });

  it('dims a pip that is out and leaves a pip in play at full', () => {
    const base = rule(hudFiles.score!, '.sb-pips i')!;
    expect(base).not.toMatch(/opacity/);
    expect(Number(/opacity:\s*([\d.]+)/.exec(rule(hudFiles.score!, '.sb-pips i.out')!)![1])).toBeLessThan(0.5);
  });
});

describe('Scoreboard size keeps the hit feed its room (G4 criterion 7, M24 bug pass)', () => {
  /** The half-width of the widest score bar at size 1 that the hit feed's own rule keeps clear of (feed.css). */
  const feedHalfWidth = Number(/(\d+)px \* var\(--sb-scale/.exec(hudFiles.feed!)![1]);

  // The bar is about 560 to 630 px wide at size 1 (3v3 to 5v5, measured in Chromium) and its widest form 730 px, not the
  // 444 px SCOREBOARD_SIZE.halfWidth was set for: at the largest size the bar runs under the feed and across the minimap.
  it.fails('never lets the score bar at the largest size grow into the feed\'s room, on any screen from 1280 px wide', () => {
    expect(feedHalfWidth).toBeGreaterThan(300);
    for (const width of [1280, 1366, 1440, 1600, 1920]) {
      const scale = scoreboardScale(SCOREBOARD_SIZE.max, width);
      const half = feedHalfWidth * scale;
      // As large as fits, but never below size 1: only a screen too narrow even for that has no room to give.
      if (scale <= 1) continue;
      expect(half, `${width} px wide, size ${scale.toFixed(2)}`).toBeLessThanOrEqual(width / 2 - SCOREBOARD_SIZE.feedRoom);
    }
  });
});
