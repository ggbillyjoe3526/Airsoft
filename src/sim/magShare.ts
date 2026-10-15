import type { HitConfig } from '../config/hits';
import { MAG_SHARE } from '../config/magShare';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import { type Armament, spareBBs, type WorldQuery } from './armament';
import type { Character } from './character';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';
import { leanedEye } from './lean';
import { length3, type Vec3, vec3 } from './vec';

/**
 * Tossing a teammate a magazine (MG1, the owner's Dev 6 item 43). A character's `PlayerCommand.tossMag` names the
 * teammate; the simulation checks it may (canTossTo), takes the BBs out of the thrower's spare and puts the magazine in
 * the air (GameState.magTosses). It lands after its flight: its BBs go into the catcher's emptiest spares for the
 * replica it was tossed for, or it is lost if the catcher is out of play by then, or the round is decided meanwhile.
 * Nothing is made out of nothing: the BBs move. A toss takes only what the catcher's emptiest spare has room for (the
 * rest stays in the thrower's), and any that no longer fit when it lands go with it. Who asks whom, and when, is the
 * bots' and the player's business (ai/magShare.ts, src/magHandoff.ts), not the rules'.
 */

/** A magazine in the air (one slot of GameState.magTosses, made once and reused). */
export interface MagToss {
  active: boolean;
  fromId: number;
  toId: number;
  /** The catcher's loadout slot its BBs go to: the replica the catcher had in hand when it was tossed. */
  slot: number;
  bbs: number;
  /** The replica of the thrower's it came from (its look: a rifle's or a pistol's magazine). */
  replicaId: string;
  /** Seconds in the air so far, and its whole flight. */
  age: number;
  flight: number;
  /** Where it left the thrower's hand (world). Presentation draws it on to the catcher's chest wherever they are now. */
  from: Vec3;
}

/** The spare a toss would take: the thrower's loadout slot and its index in that pouch, and the BBs that would move. */
export interface SparePick {
  slot: number;
  index: number;
  bbs: number;
}

/** What canTossTo needs of the world: the level's rays, and the body to find eyes by. */
export interface MagShareWorld {
  query: WorldQuery;
  body: BodyConfig;
  hits: HitConfig;
}

export function createMagTosses(count: number = MAG_SHARE.maxTosses): MagToss[] {
  return Array.from({ length: count }, () => ({ active: false, fromId: -1, toId: -1, slot: 0, bbs: 0, replicaId: '', age: 0, flight: 0, from: vec3() }));
}

export function createSparePick(): SparePick {
  return { slot: -1, index: -1, bbs: 0 };
}

/** A magazine of `need`'s class fits `replica`: a rifle's a rifle, a pistol's a pistol (stats.md's Class). */
export function magFits(replica: ReplicaConfig, need: ReplicaConfig): boolean {
  return replica.siteClass === need.siteClass;
}

/** Low on BBs (MAG_SHARE.lowMags): the pouch for `slot`'s replica holds less than that many full magazines of it. */
export function lowOnMags(a: Armament, slot: number = a.active): boolean {
  const ammo = a.ammo[slot];
  const h = a.handling[slot];
  return ammo !== undefined && h !== undefined && spareBBs(ammo) < h.magSize * MAG_SHARE.lowMags;
}

/** BBs the emptiest spare for `slot` still has room for (0 with no spare to put them in, or every one full). */
export function pouchRoom(a: Armament, slot: number): number {
  const ammo = a.ammo[slot];
  const h = a.handling[slot];
  if (!ammo || !h || ammo.pouch.length === 0) return 0;
  let least = h.magSize;
  for (const m of ammo.pouch) if (m < least) least = m;
  return h.magSize - least;
}

/**
 * The spare `giver` would toss for a replica like `need` with `room` to fill, into `out` (true), or false when none
 * fits with BBs in it. A spare of a replica it isn't holding goes first (the one in hand is the one it fights with),
 * then the fullest; `out.bbs` is what moves, at most `room`.
 */
export function chooseSpare(giver: Armament, need: ReplicaConfig, room: number, out: SparePick): boolean {
  out.slot = -1;
  out.index = -1;
  out.bbs = 0;
  if (room <= 0) return false;
  let bestHeld = true;
  let best = 0;
  for (let s = 0; s < giver.replicas.length; s++) {
    if (!magFits(giver.replicas[s]!, need)) continue;
    const pouch = giver.ammo[s]!.pouch;
    const held = s === giver.active;
    for (let i = 0; i < pouch.length; i++) {
      const n = pouch[i]!;
      if (n <= 0) continue;
      const better = out.slot < 0 || (bestHeld && !held) || (held === bestHeld && n > best);
      if (!better) continue;
      out.slot = s;
      out.index = i;
      best = n;
      bestHeld = held;
    }
  }
  if (out.slot < 0) return false;
  out.bbs = Math.min(best, room);
  return true;
}

/**
 * Whether tossing `pick` leaves `giver` low (MAG_SHARE.keepMags): only a spare of the replica in hand, the one it fights
 * with, counts against it. The bots' rule for what they give and whom they ask (ai/magShare.ts); the simulation tosses
 * whatever a command asks.
 */
export function leavesLow(giver: Armament, pick: SparePick): boolean {
  if (pick.slot !== giver.active) return false;
  return spareBBs(giver.ammo[pick.slot]!) - pick.bbs < giver.handling[pick.slot]!.magSize * MAG_SHARE.keepMags;
}

const from = vec3();
const to = vec3();
const dir = vec3();

/** Where a toss leaves `c`'s hand: a little under its eyes, wherever a lean puts them. */
export function throwPoint(c: Character, w: MagShareWorld, out: Vec3): Vec3 {
  leanedEye(c, w.body, w.hits, out);
  out.y -= MAG_SHARE.throwDrop;
  return out;
}

/** Where a toss to `c` is caught: about its chest. */
export function catchPoint(c: Character, w: MagShareWorld, out: Vec3): Vec3 {
  leanedEye(c, w.body, w.hits, out);
  out.y -= MAG_SHARE.catchDrop;
  return out;
}

/** How far a toss from `giver` to `receiver` flies (m): hand to chest. */
export function tossDistance(giver: Character, receiver: Character, w: MagShareWorld): number {
  throwPoint(giver, w, from);
  catchPoint(receiver, w, to);
  return length3(to.x - from.x, to.y - from.y, to.z - from.z);
}

/**
 * Whether `giver` can toss `receiver` a magazine now, with the spare it would take in `out`: teammates both in play,
 * the thrower not vaulting, the catcher's replica in hand with room in a spare, a spare that fits, within
 * MAG_SHARE.tossRange and nothing of the level in between (a static ray, hand to chest).
 */
export function canTossTo(giver: Character, receiver: Character, w: MagShareWorld, out: SparePick): boolean {
  if (giver === receiver || giver.team !== receiver.team || !isInPlay(giver) || !isInPlay(receiver) || giver.vault.active) return false;
  const slot = receiver.armament.active;
  const need = receiver.armament.replicas[slot];
  if (!need || !chooseSpare(giver.armament, need, pouchRoom(receiver.armament, slot), out)) return false;
  const d = tossDistance(giver, receiver, w);
  if (d > MAG_SHARE.tossRange) return false;
  if (d < 1e-3) return true;
  dir.x = (to.x - from.x) / d;
  dir.y = (to.y - from.y) / d;
  dir.z = (to.z - from.z) / d;
  return w.query.raycastStatic(from, dir, d) < 0;
}

/** The character with id `id` (ids are indices; the loop keeps a mismatch harmless). */
function characterOf(chars: readonly Character[], id: number): Character | undefined {
  if (chars[id]?.id === id) return chars[id];
  for (const c of chars) if (c.id === id) return c;
  return undefined;
}

const pick = createSparePick();

/**
 * `giver`'s command names `receiverId` (PlayerCommand.tossMag): the magazine leaves its hand if canTossTo allows and
 * none of its tosses is still in the air, its BBs taken out of the spare there and then (a `magToss` event). Only while
 * the round is live, as the caller checks.
 */
export function tossMag(giver: Character, receiverId: number, characters: readonly Character[], tosses: MagToss[], w: MagShareWorld, events: GameEvent[]): void {
  const receiver = characterOf(characters, receiverId);
  if (!receiver || !canTossTo(giver, receiver, w, pick)) return;
  let free: MagToss | undefined;
  for (const t of tosses) {
    if (t.active && t.fromId === giver.id) return;
    if (!t.active) free ??= t;
  }
  if (!free) return;
  const d = tossDistance(giver, receiver, w);
  giver.armament.ammo[pick.slot]!.pouch[pick.index]! -= pick.bbs;
  free.active = true;
  free.fromId = giver.id;
  free.toId = receiver.id;
  free.slot = receiver.armament.active;
  free.bbs = pick.bbs;
  free.replicaId = giver.armament.replicas[pick.slot]!.id;
  free.age = 0;
  free.flight = MAG_SHARE.flightBase + MAG_SHARE.flightPerMetre * d;
  throwPoint(giver, w, free.from);
  events.push({ type: 'magToss', fromId: giver.id, toId: receiver.id, bbs: pick.bbs, replicaId: free.replicaId });
}

/** Puts `bbs` into `slot`'s spares, emptiest first, each up to a full magazine; returns how many went in. */
export function fillSpares(a: Armament, slot: number, bbs: number): number {
  const ammo = a.ammo[slot];
  const h = a.handling[slot];
  if (!ammo || !h) return 0;
  let left = bbs;
  while (left > 0) {
    let least = -1;
    for (let i = 0; i < ammo.pouch.length; i++) if (ammo.pouch[i]! < h.magSize && (least < 0 || ammo.pouch[i]! < ammo.pouch[least]!)) least = i;
    if (least < 0) break;
    const add = Math.min(left, h.magSize - ammo.pouch[least]!);
    ammo.pouch[least]! += add;
    left -= add;
  }
  return bbs - left;
}

/**
 * One tick of the magazines in the air: each lands once its flight is over, in the catcher's spares (`magCaught`) or,
 * with the catcher out of play, on the ground (`magLost`). Once the round is decided (`live` false) every one still in
 * the air is lost: nothing changes hands after the whistle.
 */
export function stepMagTosses(tosses: MagToss[], characters: readonly Character[], live: boolean, events: GameEvent[], dt: number): void {
  for (const t of tosses) {
    if (!t.active) continue;
    t.age += dt;
    if (live && t.age < t.flight) continue;
    t.active = false;
    const r = characterOf(characters, t.toId);
    if (!live || !r || !isInPlay(r)) {
      events.push({ type: 'magLost', fromId: t.fromId, toId: t.toId });
      continue;
    }
    events.push({ type: 'magCaught', fromId: t.fromId, toId: t.toId, bbs: fillSpares(r.armament, t.slot, t.bbs), replicaId: r.armament.replicas[t.slot]?.id ?? '' });
  }
}
