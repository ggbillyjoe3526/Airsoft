import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEAR_TEXT } from '../../config/menus';
import { GAME_POOL } from '../../pool/gamePool';
import { LoadoutModel } from '../../pool/loadoutModel';
import { LoadoutScreen } from './loadoutScreen';
import { type EventNode, stubMenuPage } from './menuTestSupport';

/** The text of every leaf under a node (a node's `text` joins its children's). */
const texts = (n: EventNode): string[] => (n.children.length === 0 ? [n.text] : n.children.flatMap((c) => texts(c as EventNode)));
/** The element(s) whose own text is this line, and whether each (or an ancestor) is hidden. */
function lineShown(root: EventNode, line: string): boolean | null {
  const walk = (n: EventNode, hiddenAbove: boolean): boolean[] => {
    const hidden = hiddenAbove || (n !== root && n.hidden); // the screen's own root is hidden until it is opened
    return [...(n.text === line ? [!hidden] : []), ...n.children.flatMap((c) => walk(c as EventNode, hidden))];
  };
  const found = walk(root, false);
  return found.length === 0 ? null : found.some(Boolean);
}

describe('the Armory gone from the menus (M83): the Loadout', () => {
  beforeEach(() => stubMenuPage());
  afterEach(() => vi.unstubAllGlobals());

  const model = (): LoadoutModel => new LoadoutModel(GAME_POOL, { owns: () => true });
  const screen = (armoryShown?: () => boolean): LoadoutScreen =>
    new LoadoutScreen({ model: model(), context: { pictures: null, realistic: () => false, ...(armoryShown ? { armoryShown } : {}) }, onChange: () => {} });

  it('sends the player to the Armory in its note while the Armory is on, or when nothing says either way', () => {
    for (const s of [screen(), screen(() => true)]) {
      s.refresh();
      expect(lineShown(s.root as unknown as EventNode, GEAR_TEXT.unlockMore)).toBe(true);
    }
  });

  it('hides that note with the Armory off, and shows it again when it is back on', () => {
    let on = false;
    const s = screen(() => on);
    s.refresh();
    expect(lineShown(s.root as unknown as EventNode, GEAR_TEXT.unlockMore)).toBe(false);
    on = true;
    s.refresh();
    expect(lineShown(s.root as unknown as EventNode, GEAR_TEXT.unlockMore)).toBe(true);
  });

  it('names the Armory nowhere visible on the Loadout with it off', () => {
    const s = screen(() => false);
    s.refresh();
    const root = s.root as unknown as EventNode;
    const visible = (n: EventNode): string[] => (n !== root && n.hidden ? [] : n.children.length === 0 ? [n.text] : n.children.flatMap((c) => visible(c as EventNode)));
    expect(visible(root).filter((t) => /armory/i.test(t))).toEqual([]);
    expect(texts(root).some((t) => /armory/i.test(t))).toBe(true); // it is only hidden, so turning the Armory on needs no rebuild
  });
});
