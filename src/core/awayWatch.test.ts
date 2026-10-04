import { describe, expect, it, vi } from 'vitest';
import { awayWatch } from './awayWatch';

/** A document stand-in: an event target with a settable `hidden`. */
function fakeDoc(): EventTarget & { hidden: boolean } {
  return Object.assign(new EventTarget(), { hidden: false });
}

describe('pausing when the player looks away (M18b, audit CORE-20)', () => {
  it('stops play when the tab is hidden, not when it comes back', () => {
    const doc = fakeDoc();
    const away = vi.fn();
    awayWatch({ doc, win: new EventTarget() }, away);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(away).not.toHaveBeenCalled();
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(away).toHaveBeenCalledTimes(1);
  });

  it('stops play when the window loses the focus with the tab still showing (an overlay, a second monitor)', () => {
    const win = new EventTarget();
    const away = vi.fn();
    awayWatch({ doc: fakeDoc(), win }, away);
    win.dispatchEvent(new Event('blur'));
    expect(away).toHaveBeenCalledTimes(1);
  });

  it('stops listening once disposed', () => {
    const doc = fakeDoc();
    const win = new EventTarget();
    const away = vi.fn();
    const stop = awayWatch({ doc, win }, away);
    stop();
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('blur'));
    expect(away).not.toHaveBeenCalled();
  });
});
