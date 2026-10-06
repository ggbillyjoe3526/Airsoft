import type { Action } from '../config/controls';
import { HUD_TEXT } from '../config/hudText';
import type { SquadOrderKind } from '../config/squad';
import { teamCss } from '../config/teams';
import type { Character } from '../sim/character';
import { headIcon } from './headIcon';
import { type OrderNotice, SquadOrderLine } from './squadOrderLine';

/** A squad card's state: in play, carrying out the order in force (teammates only), or hit. */
type CardState = 'inPlay' | SquadOrderKind | 'hit';

/** The order keys under the cards, by the action that gives each. */
const ORDER_KEYS: readonly { action: Action; order: SquadOrderKind }[] = [
  { action: 'orderFollow', order: 'follow' },
  { action: 'orderHold', order: 'hold' },
  { action: 'orderRegroup', order: 'regroup' },
];

/**
 * The squad line (graphics overhaul G4), bottom left: a card per player on your side, you first, each with a head in
 * the team's colour, the name and what they are doing (In play, the order in force, Hit; greyed once hit); over the
 * cards the order line (ui/squadOrderLine.ts: the order in force and its notices, read out as they change), and under
 * them the order keys as the player bound them. Each card is written only when its state changes.
 */
export class SquadBar {
  private readonly root: HTMLDivElement;
  private readonly line: SquadOrderLine;
  private readonly cards: { character: Character; root: HTMLElement; state: HTMLElement; shown: CardState | '' }[];
  private readonly keys: { action: Action; item: HTMLElement; key: HTMLElement; shown: string }[];

  /**
   * `members`: your side, you first; `names`: each player's name by id ("You", "Blue 2"); `keyName`: the key bound to an
   * action now ('' when none), read again each time the line shows (keys may be rebound on the pause menu).
   */
  constructor(
    parent: HTMLElement,
    team: number,
    members: readonly Character[],
    names: ReadonlyMap<number, string>,
    private readonly keyName: (action: Action) => string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'squad-bar';
    this.root.style.setProperty('--team', teamCss(team));
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.line = new SquadOrderLine(this.root, team);
    const deck = document.createElement('div');
    deck.className = 'squad-cards';
    this.cards = members.map((character) => {
      const root = document.createElement('div');
      root.className = 'squad-card';
      const words = document.createElement('span');
      words.className = 'squad-card-words';
      const name = document.createElement('b');
      name.textContent = names.get(character.id) ?? HUD_TEXT.you;
      const state = document.createElement('span');
      state.className = 'squad-card-state';
      words.append(name, state);
      root.append(headIcon(), words);
      deck.append(root);
      return { character, root, state, shown: '' as const };
    });
    const strip = document.createElement('div');
    strip.className = 'squad-keys';
    this.keys = ORDER_KEYS.map(({ action, order }) => {
      const item = document.createElement('span');
      const key = document.createElement('kbd');
      item.append(key, document.createTextNode(` ${HUD_TEXT.orders[order]}`));
      strip.append(item);
      return { action, item, key, shown: '' };
    });
    // No teammates (a 1v1): no cards, no orders to give.
    deck.hidden = strip.hidden = members.length < 2;
    this.root.append(deck, strip);
  }

  /** You gave an order (see SquadOrderLine.ordered). */
  ordered(result: SquadOrderKind | 'none', why: OrderNotice): void {
    this.line.ordered(result, why);
  }

  /** False while a menu is up; shown again, the order keys are read afresh. */
  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.line.setVisible(visible);
    if (!visible) return;
    for (const k of this.keys) {
      const name = this.keyName(k.action);
      if (name === k.shown) continue;
      k.shown = name;
      k.key.textContent = name;
      k.item.hidden = name === ''; // an unbound order has no key to show
    }
  }

  /** Once per frame, with the order in force. */
  update(order: SquadOrderKind | 'none', dt: number): void {
    this.line.update(order, dt);
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!;
      const state: CardState = card.character.status !== 'alive' ? 'hit' : i > 0 && order !== 'none' ? order : 'inPlay';
      if (state === card.shown) continue;
      card.shown = state;
      card.state.textContent = state === 'hit' ? HUD_TEXT.hit : state === 'inPlay' ? HUD_TEXT.inPlay : HUD_TEXT.doing[state];
      card.root.classList.toggle('hit', state === 'hit');
    }
  }

  /** A new round: no order, no notice. */
  clear(): void {
    this.line.clear();
  }

  dispose(): void {
    this.line.dispose();
    this.root.remove();
  }
}
