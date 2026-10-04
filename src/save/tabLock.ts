import { TAB_LOCK } from '../config/save';

/**
 * One tab plays at a time (M31), so two tabs never write over each other's FC: tabs of the game talk on a
 * BroadcastChannel. A tab starting up asks whether another is playing; one is, so it waits behind a notice (Play here).
 * Play here asks the playing tab to let go: that tab writes what it holds, stops saving and shows the notice in turn,
 * and the new one reloads so it reads the save as just written.
 *
 * Where the browser has Web Locks (every supported browser), the save is an exclusive lock: whoever holds it plays, and a
 * tab that can't get it waits, however busy the playing tab is. Without them, a tab starting up asks on the channel and
 * plays if nobody answers in time; two tabs starting at the same instant both hear nobody, each then says it is
 * playing, and the one with the lower id keeps the save while the other lets go.
 */

/** The channel, as far as the lock uses it (BroadcastChannel in the browser, a stand-in in tests). */
export interface LockChannel {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

/** The browser's Web Locks, as far as the lock uses them (navigator.locks in the browser, a stand-in in tests). */
export interface SaveLocks {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void> | undefined): Promise<unknown>;
}

type Message = { t: 'hello'; id: string } | { t: 'here'; id: string } | { t: 'take'; id: string } | { t: 'released'; id: string };

export interface TabLockOptions {
  /** Makes the channel; null where the browser has no BroadcastChannel (the lock then always plays). */
  channel: (() => LockChannel) | null;
  /**
   * Web Locks; null or absent where the browser has none (the channel's question and answer decide then). A playing
   * tab that is busy can be slow to answer on the channel, so the lock is what decides when there is one.
   */
  locks?: SaveLocks | null;
  /** Called when another tab takes the save: write what's pending, then stop saving. */
  onLost: () => void;
  id?: string;
  wait?: (ms: number) => Promise<void>;
}

export class TabLock {
  private readonly id: string;
  private readonly channel: LockChannel | null;
  private playing = false;
  private heardPlaying = false;
  private released: (() => void) | null = null;
  /** Lets go of the Web Lock (while this tab holds it). */
  private unlock: (() => void) | null = null;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(private readonly opts: TabLockOptions) {
    this.id = opts.id ?? Math.random().toString(36).slice(2);
    this.wait = opts.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.channel = opts.channel?.() ?? null;
    if (this.channel) this.channel.onmessage = (e) => this.hear(e.data as Message);
  }

  /** This tab has the save. */
  get owns(): boolean {
    return this.playing;
  }

  /** Asks whether another tab is playing; true if this one may play (nobody answered). */
  async claim(): Promise<boolean> {
    if (this.opts.locks) return this.claimLock(this.opts.locks);
    if (!this.channel) return (this.playing = true);
    this.heardPlaying = false;
    this.send({ t: 'hello', id: this.id });
    await this.wait(TAB_LOCK.answerWaitMs);
    if (this.heardPlaying) return false;
    this.playing = true;
    this.send({ t: 'here', id: this.id });
    return true;
  }

  /** Play here: asks the playing tab to let go, and resolves once it has (or after a wait, if it has gone quiet). */
  async take(): Promise<void> {
    if (!this.channel) return;
    const released = new Promise<void>((resolve) => (this.released = resolve));
    this.send({ t: 'take', id: this.id });
    await Promise.race([released, this.wait(TAB_LOCK.releaseWaitMs)]);
    this.released = null;
  }

  /** Holds the save's Web Lock until this tab lets go; false at once if another tab holds it. */
  private claimLock(locks: SaveLocks): Promise<boolean> {
    return new Promise((resolve) => {
      void locks.request(TAB_LOCK.lockName, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        this.playing = true;
        resolve(true);
        return new Promise<void>((release) => (this.unlock = release));
      });
    });
  }

  dispose(): void {
    this.channel?.close();
  }

  private hear(m: Message): void {
    if (!m || typeof m !== 'object' || m.id === this.id) return;
    if (m.t === 'hello' && this.playing) this.send({ t: 'here', id: this.id });
    else if (m.t === 'here') {
      this.heardPlaying = true;
      // Two tabs that started together: the lower id keeps the save.
      if (this.playing && m.id < this.id) this.lose();
    } else if (m.t === 'take' && this.playing) {
      this.lose();
      this.send({ t: 'released', id: this.id });
    } else if (m.t === 'released') this.released?.();
  }

  private lose(): void {
    this.playing = false;
    this.opts.onLost();
    this.unlock?.();
    this.unlock = null;
  }

  private send(m: Message): void {
    try {
      this.channel?.postMessage(m);
    } catch {
      // A closed channel: nothing to tell.
    }
  }
}

/** The browser's Web Locks, or null where there are none (an older browser, or a page that isn't a secure context). */
export function browserSaveLocks(): SaveLocks | null {
  return typeof navigator !== 'undefined' && navigator.locks ? (navigator.locks as unknown as SaveLocks) : null;
}

/** The browser's channel for the lock, or null where there is none. */
export function browserLockChannel(): (() => LockChannel) | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return () => new BroadcastChannel(TAB_LOCK.channel) as unknown as LockChannel;
}
