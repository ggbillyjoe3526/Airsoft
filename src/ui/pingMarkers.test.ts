import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PING_MARKERS, PING_MARKER_CHOICES, PINGS } from '../config/pings';
import { DEFAULT_HIT_FEED_MODE, DEFAULT_WHAT_GOT_YOU_MODE } from '../config/matchInfo';
import { MemoryStorage } from '../pool/testStorage';
import { flushSettings, SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { hudSettings } from './hudSettings';
import { loadPingMarkers } from '../settings/hudPrefs';
import { pingAlpha, PingMarkers } from './pingMarkers';
import { FakeElement, fakeDocument, findAll } from './testSupport';

/** PG1: the ping markers over the field, and Settings › HUD › Ping markers. */
beforeEach(() => vi.stubGlobal('document', fakeDocument()));
afterEach(() => vi.unstubAllGlobals());

const YOU = 0;
const MATE = 2;

function markers() {
  const parent = new FakeElement('div');
  const m = new PingMarkers(parent as unknown as HTMLElement, [YOU, MATE], 'blue', 'orange');
  const node = (i: number) => parent.children[i]!;
  const label = (i: number) => node(i).children[1]!.textContent;
  return { parent, m, node, label };
}

describe('PG1: a ping fades', () => {
  it('shows whole until its last PINGS.fadeTime, then fades to nothing at PINGS.lifetime', () => {
    expect(pingAlpha(0)).toBe(1);
    expect(pingAlpha(PINGS.lifetime - PINGS.fadeTime)).toBe(1);
    expect(pingAlpha(PINGS.lifetime - PINGS.fadeTime / 2)).toBeCloseTo(0.5, 6);
    expect(pingAlpha(PINGS.lifetime)).toBe(0);
    expect(pingAlpha(Number.NaN)).toBe(0);
    expect(pingAlpha(-1)).toBe(0);
  });
});

describe('PG1: the ping markers', () => {
  it('keeps one ping per player: a new one takes the old one\'s place, and pops in again', () => {
    const { m, node } = markers();
    expect(m.pings.map((p) => p.owner)).toEqual([YOU, MATE]);
    expect(m.pings.every((p) => Number.isNaN(p.at))).toBe(true);
    m.place(YOU, 'spot', { x: 1, y: 0, z: 2 }, 3);
    m.place(YOU, 'enemy', { x: 5, y: 1.2, z: 6 }, 4);
    expect(m.pings[0]).toMatchObject({ owner: YOU, kind: 'enemy', x: 5, y: 1.2, z: 6, at: 4 });
    expect(Number.isNaN(m.pings[1]!.at)).toBe(true);
    expect(node(0).children[0]!.classList.contains('pop')).toBe(true);
    // Someone not on your team (or not a player): nothing.
    m.place(7, 'spot', { x: 0, y: 0, z: 0 }, 5);
    expect(m.pings.map((p) => p.owner)).toEqual([YOU, MATE]);
  });

  it('says what it marks and how far, a contact as a diamond in the other team\'s colour, faint on the edge', () => {
    const { m, node, label } = markers();
    expect(node(0).hidden).toBe(true);
    m.place(YOU, 'spot', { x: 1, y: 0, z: 2 }, 3);
    m.show(0, 100.4, 200.6, 23.6, false, 1);
    expect(node(0).hidden).toBe(false);
    expect(label(0)).toBe('Ping · 24 m');
    expect(node(0).style.transform).toBe('translate(100px, 201px)');
    expect(node(0).classList.contains('enemy')).toBe(false);
    m.place(MATE, 'enemy', { x: 1, y: 1, z: 2 }, 3);
    m.show(1, 10, 10, 41, true, 0.62);
    expect(label(1)).toBe('Contact · 41 m');
    expect(node(1).classList.contains('enemy')).toBe(true);
    expect(node(1).classList.contains('edge')).toBe(true);
    expect(node(1).style['--ping-alpha']).toBe('0.6');
    expect(node(1).style['--ping-mine']).toBe('blue');
    expect(node(1).style['--ping-theirs']).toBe('orange');
  });

  it('hides a gone ping, all of them with the setting off (the pings stay), and clears them for a new round', () => {
    const { m, node } = markers();
    m.place(YOU, 'spot', { x: 1, y: 0, z: 2 }, 3);
    m.show(0, 1, 1, 5, false, 0);
    expect(node(0).hidden).toBe(true);
    m.show(0, 1, 1, 5, false, 1);
    m.setShown(false);
    expect(m.markersShown).toBe(false);
    expect(node(0).hidden).toBe(true);
    m.show(0, 1, 1, 5, false, 1);
    expect(node(0).hidden).toBe(true);
    expect(m.pings[0]!.at).toBe(3);
    m.setShown(true);
    m.clear();
    expect(Number.isNaN(m.pings[0]!.at)).toBe(true);
    m.dispose();
  });
});

describe('Settings › HUD › Ping markers (PG1)', () => {
  const noop = () => {};
  const rows = (pingMarkers?: { initial: 'on' | 'off'; onChange: (m: 'on' | 'off') => void }) =>
    hudSettings({
      hudSize: { initial: 1, onChange: noop },
      scoreboardSize: { initial: 1, onChange: noop },
      hudOpacity: { initial: 0.9, onChange: noop },
      hitFeed: { initial: DEFAULT_HIT_FEED_MODE, onChange: noop },
      whatGotYou: { initial: DEFAULT_WHAT_GOT_YOU_MODE, onChange: noop },
      callouts: { initial: 'on', onChange: noop },
      ...(pingMarkers ? { pingMarkers } : {}),
    }) as unknown as FakeElement[];
  const labels = (all: FakeElement[]) => all.map((r) => findAll(r, 'menu-row-label')[0]?.textContent);

  it('is On by default, offers Off then On, and sits after Callouts', () => {
    expect(DEFAULT_PING_MARKERS).toBe('on');
    expect(PING_MARKER_CHOICES.map((c) => c.label)).toEqual(['Off', 'On']);
    expect(loadPingMarkers(new MemoryStorage())).toBe('on');
    expect(labels(rows())).not.toContain('Ping markers');
    const all = labels(rows({ initial: 'on', onChange: noop }));
    expect(all.indexOf('Ping markers')).toBe(all.indexOf('Callouts') + 1);
  });

  it('tells the match on a click and saves under "pingMarkers"; reads a saved choice, an unreadable one as On', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const seen: string[] = [];
    const row = rows({ initial: 'on', onChange: (m) => seen.push(m) }).find((r) => findAll(r, 'menu-row-label')[0]?.textContent === 'Ping markers')!;
    findAll(row, 'picker-button')[0]!.click();
    flushSettings(storage);
    expect(seen).toEqual(['off']);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).pingMarkers).toBe('off');
    expect(loadPingMarkers(storage)).toBe('off');
    const s = new MemoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, pingMarkers: 'loud' }));
    expect(loadPingMarkers(s)).toBe('on');
  });
});
