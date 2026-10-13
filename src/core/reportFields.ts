import { REPORT_LOG } from '../config/crash';
import type { QualityChoice, QualitySettings } from '../config/render';
import type { RunState } from '../sim/extraction';
import type { FrameSummary } from './frameWindow';

/**
 * The render quality as the debug overlay and the crash report give it (audit CORE-02): the choice, whether the game
 * picked it, and the render scale, shadow map and textures in force. Pure.
 */
export function qualityLine(choice: QualityChoice, automatic: boolean, q: QualitySettings): string {
  return `${choice}${automatic ? ' (auto)' : ''} · scale ${q.renderScale} · shadow map ${q.shadows ? q.shadowMapSize : 'off'} · textures ${q.textureSize}`;
}

/**
 * An Extraction run's state for a crash report (audit CORE-02): its outcome so far, the exits open, the cases opened,
 * what the runner carries and the home team's waves. Pure.
 */
export function runReportLine(run: RunState): string {
  const exits = run.exits.filter((e) => !e.closed);
  const placed = run.cases.filter((c) => !c.dropped);
  return [
    run.outcome === 'none' ? 'running' : run.outcome,
    `exits open ${exits.filter((e) => e.open).length}/${exits.length}${run.lateOpened ? ' (late open)' : ''}`,
    `cases opened ${placed.filter((c) => c.open).length}/${placed.length}`,
    `carrying ${run.carried.length}`,
    `waves ${run.waves}`,
  ].join(', ');
}

/** The player as a report gives them (IM7): enough of a character to say where it stands, looks and what it's doing. */
export interface ReportedPlayer {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
  readonly pitch: number;
  readonly status: string;
  readonly crouchAmount: number;
  readonly sprinting: boolean;
  readonly aiming: boolean;
  readonly airborne: boolean;
  readonly armament: {
    readonly active: number;
    readonly reload: number;
    readonly draw: number;
    readonly holstered: boolean;
    readonly replicas: readonly { readonly id: string }[];
    readonly ammo: readonly { readonly mag: number; readonly pouch: readonly number[] }[];
  };
}

const DEG = 180 / Math.PI;

/**
 * Where the player stands (metres, the map's own axes) and looks (degrees), and what they're doing: their life status,
 * stance and actions, the replica in hand with its magazine and spare magazines (IM7). Pure.
 */
export function playerLine(p: ReportedPlayer): string {
  const { x, y, z } = p.position;
  const a = p.armament;
  const doing = [
    p.status,
    p.crouchAmount > REPORT_LOG.crouchedAt ? 'crouched' : 'standing',
    ...(p.airborne ? ['in the air'] : []),
    ...(p.sprinting ? ['sprinting'] : []),
    ...(p.aiming ? ['aiming'] : []),
    ...(a.reload > 0 ? ['reloading'] : []),
    ...(a.draw > 0 ? ['drawing'] : []),
    ...(a.holstered ? ['holstered'] : []),
  ];
  const ammo = a.ammo[a.active];
  const held = `${a.replicas[a.active]?.id ?? '-'}${ammo ? ` ${ammo.mag} in the magazine, ${ammo.pouch.filter((m) => m > 0).length} spare` : ''}`;
  const yaw = (((p.yaw * DEG) % 360) + 360) % 360;
  return `at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)} · looking ${yaw.toFixed(0)}° yaw, ${(p.pitch * DEG).toFixed(0)}° pitch · ${doing.join(', ')} · ${held}`;
}

/** Seconds as "m:ss" (or "h:mm:ss"). Pure. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(hours ? 2 : 1, '0');
  return `${hours ? `${hours}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The last seconds of play's frame times (core/frameWindow.ts), and the smoothed simulation and draw costs a frame
 * (IM7). Pure.
 */
export function framesLine(f: FrameSummary, simMs: number, drawMs: number): string {
  if (f.frames === 0) return 'no frames in play yet';
  return `last ${f.seconds.toFixed(0)} s of play: ${f.frames} frames, avg ${f.avgMs.toFixed(1)} ms (${(1000 / f.avgMs).toFixed(0)} fps), worst ${f.worstMs.toFixed(1)} ms, ${f.hitches} over ${REPORT_LOG.hitchMs} ms · sim ${simMs.toFixed(2)} ms, draw ${drawMs.toFixed(2)} ms a frame`;
}

/** What the renderer holds (three.js's counts) and, where the browser tells (Chrome, Edge), the JavaScript heap (IM7). Pure. */
export function memoryLine(heap: { usedJSHeapSize: number; jsHeapSizeLimit: number } | undefined, held: { textures: number; geometries: number; programs: number }): string {
  const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(0)} MB`;
  const js = heap ? `JS heap ${mb(heap.usedJSHeapSize)} of ${mb(heap.jsHeapSizeLimit)}` : 'JS heap not given by this browser';
  return `${js} · ${held.textures} textures, ${held.geometries} geometries, ${held.programs} shader programs`;
}

/** A file the page loaded, as the Resource Timing API gives it (PerformanceResourceTiming). */
export interface LoadedFile {
  readonly name: string;
  readonly transferSize: number;
  readonly encodedBodySize: number;
  readonly responseEnd: number;
}

/** The kinds of file a load line counts, by extension. */
const LOADED_KINDS = [
  { label: 'code', test: /\.(?:m?js|wasm)(?:\?|$)/ },
  { label: 'models', test: /\.(?:glb|gltf|bin)(?:\?|$)/ },
  { label: 'pictures', test: /\.(?:png|jpe?g|webp|avif|ktx2)(?:\?|$)/ },
] as const;

/** A file came from the network rather than the browser's cache (a cache hit sends nothing; a revalidation only headers). */
const fresh = (f: LoadedFile): boolean => f.transferSize > 0 && f.transferSize >= f.encodedBodySize;

/**
 * How the game loaded (IM7): when the page and the game were ready (seconds after the page opened), whether the main
 * file (`mainUrl`, the page's own script) came from the cache, then per kind of file how many, how many cached and what
 * came fresh. Pure.
 */
export function loadLine(files: readonly LoadedFile[], mainUrl: string, pageReadyMs: number, gameReadyMs: number): string {
  const s = (ms: number): string => (ms > 0 ? `${(ms / 1000).toFixed(1)} s` : '-');
  const kb = (of: readonly LoadedFile[]): string => `${(of.reduce((t, f) => t + f.transferSize, 0) / 1000).toFixed(0)} kB`;
  const main = files.find((f) => f.name === mainUrl);
  const kinds = LOADED_KINDS.map(({ label, test }) => {
    const of = files.filter((f) => test.test(f.name));
    if (!of.length) return `${label}: none`;
    const got = of.filter(fresh);
    const last = Math.max(...of.map((f) => f.responseEnd));
    return `${label}: ${of.length} files, ${of.length - got.length} cached${got.length ? `, ${got.length} fresh (${kb(got)})` : ''}, last at ${s(last)}`;
  });
  const mainText = main ? (fresh(main) ? `fresh (${kb([main])})` : 'cached') : '-';
  return `page ${s(pageReadyMs)}, game ${s(gameReadyMs)} · main file ${mainText} · ${kinds.join(' · ')}`;
}
