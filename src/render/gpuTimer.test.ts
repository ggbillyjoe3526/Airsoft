import { describe, expect, it } from 'vitest';
import { GpuTimer } from './gpuTimer';

/** A stand-in WebGL2 context with the timer extension: results become available when `ready` is set. */
function fakeGl(withExtension = true) {
  const state = { ready: false, disjoint: false, ns: 4_000_000, begun: 0, ended: 0 };
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    QUERY_RESULT_AVAILABLE: 10,
    QUERY_RESULT: 11,
    getExtension: (name: string) => (withExtension && name === 'EXT_disjoint_timer_query_webgl2' ? ext : null),
    createQuery: () => ({}),
    deleteQuery: () => undefined,
    beginQuery: () => void state.begun++,
    endQuery: () => void state.ended++,
    getQueryParameter: (_q: unknown, p: number) => (p === 10 ? state.ready : state.ns),
    getParameter: (p: number) => (p === 2 ? state.disjoint : 0),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, state };
}

describe('GpuTimer (REN-17)', () => {
  it('times a frame, keeps one query in flight, and reads the result once it is ready', () => {
    const { gl, state } = fakeGl();
    const timer = new GpuTimer(gl, 0.5);
    expect(timer.available).toBe(true);
    timer.begin();
    timer.end();
    expect(Number.isNaN(timer.ms)).toBe(true);
    // Not ready: no new query begun while one is pending.
    timer.begin();
    timer.end();
    expect([state.begun, state.ended]).toEqual([1, 1]);
    state.ready = true;
    timer.begin();
    timer.end();
    expect(timer.ms).toBe(4);
    expect(state.begun).toBe(2);
    // Smoothed.
    state.ns = 8_000_000;
    timer.begin();
    expect(timer.ms).toBe(6);
  });

  it('drops a result spoilt by a disjoint event', () => {
    const { gl, state } = fakeGl();
    const timer = new GpuTimer(gl, 0.5);
    timer.begin();
    timer.end();
    state.ready = true;
    state.disjoint = true;
    timer.begin();
    expect(Number.isNaN(timer.ms)).toBe(true);
  });

  it('does nothing without the extension (Firefox)', () => {
    const { gl, state } = fakeGl(false);
    const timer = new GpuTimer(gl, 0.5);
    timer.begin();
    timer.end();
    expect(timer.available).toBe(false);
    expect(state.begun).toBe(0);
    expect(Number.isNaN(timer.ms)).toBe(true);
  });
});
