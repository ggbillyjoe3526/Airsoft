import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEAR_TEXT, MENU_TEXT } from '../../config/menus';
import { FAMILIES, FAMILY_IDS, SCHEME_IDS } from '../../config/schemes';
import { GAME_POOL } from '../../pool/gamePool';
import { LoadoutModel } from '../../pool/loadoutModel';
import { MemoryStorage } from '../../pool/testStorage';
import { CustomiseView } from './customiseView';
import { EventNode, stubMenuPage } from './menuTestSupport';

/** MR1 QA: Customise has a Back button and static crumbs, no Skins part, and a Colour tab of Bold schemes and Realistic plain colours. */
beforeEach(() => {
  stubMenuPage();
  vi.stubGlobal('localStorage', new MemoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const rifle = GAME_POOL.assets.find((a) => a.name === 'AEG Rifle')!;

function open(realistic = false) {
  const model = new LoadoutModel(GAME_POOL, { owns: () => true });
  const calls = { back: 0, change: 0 };
  const view = new CustomiseView(
    { model, context: { pictures: null, realistic: () => realistic }, onChange: () => calls.change++, onBack: () => calls.back++ },
    { asset: rifle.id, variant: 0 } as never,
  );
  return { model, calls, view, root: view.root as unknown as EventNode };
}
const tabs = (root: EventNode): string[] => root.querySelectorAll('.customise-part').map((t) => t.querySelector('.customise-part-name')!.text);
const tile = (root: EventNode, id: string): EventNode => root.querySelectorAll('.scheme-tile').find((t) => t.dataset.scheme === id)!;

describe('Customise: Back and the part list (MR1)', () => {
  it('has a Back button that goes back, and crumbs that are only words', () => {
    const { root, calls } = open();
    const bar = root.querySelector('.customise-bar')!;
    const back = bar.querySelector('.customise-back')!;
    expect(back.tag).toBe('button');
    expect(back.text).toContain(MENU_TEXT.hints.back);
    back.click();
    expect(calls.back).toBe(1);
    const crumbs = bar.querySelector('.customise-crumbs')!;
    expect(crumbs.all('button')).toHaveLength(0);
    expect(crumbs.text).toContain(`${GEAR_TEXT.breadcrumb} › ${rifle.name}`);
  });

  it('lists Colour first and no Skins part', () => {
    const { root } = open();
    const names = tabs(root);
    expect(names[0]).toBe(GEAR_TEXT.colour);
    expect(names.map((n) => n.toLowerCase())).not.toContain('skins');
    expect(names.at(-1)).toBe(GEAR_TEXT.ammo);
  });
});

describe('Customise: the Colour tab (MR1)', () => {
  it('shows a Bold group of the offered schemes and a Realistic group of the four families, in order', () => {
    const { root } = open();
    const groups = root.querySelectorAll('.colour-group');
    expect(groups.map((g) => g.querySelector('.colour-group-title')!.text)).toEqual([GEAR_TEXT.bold, GEAR_TEXT.realistic]);
    expect(groups[0]!.querySelectorAll('.scheme-tile').map((t) => t.dataset.scheme)).toEqual([...SCHEME_IDS]);
    expect(groups[1]!.querySelectorAll('.scheme-tile').map((t) => t.dataset.scheme)).toEqual([...FAMILY_IDS]);
    expect(groups[1]!.querySelectorAll('.option-name').map((n) => n.text)).toEqual(FAMILY_IDS.map((f) => FAMILIES[f].name));
  });

  it('marks the default scheme pressed, and saves a family pick through the model, telling the Loadout', () => {
    const { root, model, calls } = open();
    expect(tile(root, 'cobalt').getAttribute('aria-pressed')).toBe('true');
    tile(root, 'ranger').click();
    expect(model.scheme(rifle.id)).toBe('ranger');
    expect(calls.change).toBe(1);
    expect(tile(root, 'ranger').getAttribute('aria-pressed')).toBe('true');
    expect(tile(root, 'cobalt').getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('.customise-part-value')!.text).toBe(FAMILIES.ranger.name);
    expect(root.querySelector('.customise-line')!.text).toContain(FAMILIES.ranger.name);
    expect(root.querySelector('.colour-applies')!.text).toBe(FAMILIES.ranger.name);
  });

  it('does not save or report a pick of the colour already worn', () => {
    const { root, calls } = open();
    tile(root, 'cobalt').click();
    expect(calls.change).toBe(0);
  });

  it('can go from a family back to a bold scheme', () => {
    const { root, model } = open();
    tile(root, 'tan').click();
    tile(root, 'acid').click();
    expect(model.scheme(rifle.id)).toBe('acid');
    expect(model.kit().schemes[0]).toBe('acid');
  });

  it('under Realistic colours shows what each bold scheme turns into, and none on the family tiles', () => {
    const { root } = open(true);
    const lines = (id: string): string[] => tile(root, id).querySelectorAll('.option-line').map((l) => l.text);
    expect(lines('cobalt')).toEqual([GEAR_TEXT.showsAs(FAMILIES.black.name)]);
    expect(lines('ranger')).toEqual([]);
    expect(open(false).root.querySelectorAll('.scheme-tile').flatMap((t) => t.querySelectorAll('.option-line'))).toEqual([]);
  });

  it('keeps a family saved from an earlier visit selected when it opens', () => {
    const model = new LoadoutModel(GAME_POOL, { owns: () => true });
    model.setScheme(rifle.id, 'grey');
    const view = new CustomiseView({ model, context: { pictures: null, realistic: () => false }, onChange: () => {}, onBack: () => {} }, { asset: rifle.id } as never);
    const root = view.root as unknown as EventNode;
    expect(tile(root, 'grey').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the other carried replica and its colour on the colour aside, following that replica own pick', () => {
    const { root, model } = open();
    const other = model.equipped().find((r) => r && r.asset !== rifle.id)!;
    expect(other).toBeDefined();
    const name = GAME_POOL.byId.get(other.asset)!.name;
    const aside = root.querySelector('.colour-aside')!;
    expect(aside.hidden).toBe(false);
    expect(root.querySelector('.customise-perf')!.hidden).toBe(true);
    expect(aside.querySelector('.colour-other-card')!.text).toContain(name);
    expect(aside.querySelector('.colour-other-card')!.text).toContain('Ghost');
    model.setScheme(other.asset, 'tan');
    tile(root, 'acid').click();
    expect(aside.querySelector('.colour-other-card')!.text).toContain(FAMILIES.tan.name);
  });
});
