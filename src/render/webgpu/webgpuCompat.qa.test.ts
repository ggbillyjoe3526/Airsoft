import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * W3 QA: the browser fits (webgpuCompat.ts) attacked from the device checks outward. The build worker's tests pin each
 * helper on its own; these run `fitBrowser` as the node backend does, on stand-in devices and the page's global
 * `GPUTexture`/`GPUDevice` prototypes, with the module made fresh for each test (the fits are once per page).
 */

type Compat = typeof import('./webgpuCompat');

interface View {
  swizzle?: unknown;
}
interface Desc {
  size?: unknown;
  format?: string;
  usage: number;
  dimension?: string;
}

/** A texture whose createView throws the TypeError Chromium 141 throws for the string swizzle, when `rejects`. */
function texture(rejects: boolean, log: string[] = []) {
  return {
    createView(this: unknown, d?: View) {
      log.push(`view ${String(d?.swizzle)}`);
      if (rejects && typeof d?.swizzle === 'string') throw new TypeError('not a GPUTextureComponentSwizzle');
      return { view: d };
    },
    destroy: () => void log.push('destroy'),
  };
}

/** A device: textures from `make`; a layer write into a drawable 3D texture raises `error` (null: none). */
function device(opts: { rejectsSwizzle?: boolean; error?: unknown; scopes?: boolean }) {
  const log: string[] = [];
  const writes: { z: number | undefined; usage: number }[] = [];
  let last: Desc = { usage: 0 };
  const d = {
    log,
    writes,
    createTexture: (descriptor: Desc) => {
      last = descriptor;
      log.push(`create ${descriptor.dimension ?? '2d'}`);
      return texture(opts.rejectsSwizzle ?? false, log);
    },
    queue: { writeTexture: (dest: { origin?: { z?: number } }) => void (log.push('write'), writes.push({ z: dest.origin?.z, usage: last.usage })) },
    pushErrorScope: (filter: string) => void log.push(`push ${filter}`),
    popErrorScope: async () => (log.push('pop'), opts.error ?? null),
  };
  if (opts.scopes === false) {
    delete (d as Partial<typeof d>).pushErrorScope;
    delete (d as Partial<typeof d>).popErrorScope;
  }
  return d;
}

let compat: Compat;
beforeEach(async () => {
  vi.unstubAllGlobals();
  vi.resetModules();
  compat = await import('./webgpuCompat');
});

describe('rejectsStringSwizzle (W3: Chrome 141 compatibility)', () => {
  it('says no for any error that is not a TypeError, and still frees the test texture', () => {
    const t = texture(false);
    t.createView = () => {
      throw new RangeError('something else');
    };
    const destroy = vi.spyOn(t, 'destroy');
    expect(compat.rejectsStringSwizzle({ createTexture: () => t })).toBe(false);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('asks with the very string Three 0.186 gives every view, on a texture a shader can bind', () => {
    const log: string[] = [];
    let usage = 0;
    const d = {
      createTexture: (descriptor: Desc) => ((usage = descriptor.usage), texture(false, log)),
    };
    compat.rejectsStringSwizzle(d);
    expect(log).toEqual(['view rgba', 'destroy']);
    expect(usage & 0x04).toBe(0x04);
  });
});

describe('rejects3DLayerWrite (W3)', () => {
  it('writes one layer (not the first) of a 3D texture that may be drawn into, inside a validation error scope, then frees it', async () => {
    const d = device({ error: { message: 'invalid view dimension' } });
    expect(await compat.rejects3DLayerWrite(d)).toBe(true);
    // The scope opens before the texture exists and closes after the write; the texture goes after the verdict.
    expect(d.log).toEqual(['push validation', 'create 3d', 'write', 'pop', 'destroy']);
    expect(d.writes).toEqual([{ z: 1, usage: 0x04 | 0x02 | 0x10 }]);
  });

  it('is false on a device that takes the write, and on one with a queue but no error scopes', async () => {
    expect(await compat.rejects3DLayerWrite(device({ error: null }))).toBe(false);
    const noScopes = device({ error: { message: 'x' }, scopes: false });
    expect(await compat.rejects3DLayerWrite(noScopes)).toBe(false);
    expect(noScopes.log).toEqual([]);
  });
});

describe('fitBrowser on the page’s own prototypes (W3)', () => {
  function stubPrototypes() {
    const view = vi.fn((_d?: View) => 'view');
    const texturePrototype = { createView: view, destroy: () => undefined };
    const made: Desc[] = [];
    const devicePrototype = { createTexture: (d: Desc) => (made.push({ ...d }), texture(false)) };
    vi.stubGlobal('GPUTexture', { prototype: texturePrototype });
    vi.stubGlobal('GPUDevice', { prototype: devicePrototype });
    return { view, texturePrototype, devicePrototype, made };
  }

  it('fits both differences where the device shows them: swizzle cleared in views, no drawing use on 3D textures', async () => {
    const { view, texturePrototype, devicePrototype, made } = stubPrototypes();
    const fits = await compat.fitBrowser(device({ rejectsSwizzle: true, error: { message: 'x' } }));
    expect(fits).toEqual(['swizzle', '3d-attachment']);
    // A view Three asks for with the string reaches the browser without it; a dictionary swizzle is left as it is.
    const asked: View = { swizzle: 'rgba' };
    texturePrototype.createView(asked);
    expect(view).toHaveBeenLastCalledWith({ swizzle: undefined });
    const dictionary: View = { swizzle: { r: 'r', g: 'g', b: 'b', a: 'a' } };
    texturePrototype.createView(dictionary);
    expect(dictionary.swizzle).toEqual({ r: 'r', g: 'g', b: 'b', a: 'a' });
    expect(() => texturePrototype.createView()).not.toThrow();
    // A 3D texture loses RENDER_ATTACHMENT; a 2D one keeps all its uses.
    devicePrototype.createTexture({ usage: 0x16, dimension: '3d' });
    devicePrototype.createTexture({ usage: 0x16 });
    devicePrototype.createTexture({ usage: 0x16, dimension: '2d' });
    expect(made.map((m) => m.usage)).toEqual([0x06, 0x16, 0x16]);
  });

  it('fits nothing on a device that shows neither difference, leaving the prototypes as they were', async () => {
    const { texturePrototype, devicePrototype } = stubPrototypes();
    const ownView = texturePrototype.createView;
    const ownCreate = devicePrototype.createTexture;
    expect(await compat.fitBrowser(device({ error: null }))).toEqual([]);
    expect(texturePrototype.createView).toBe(ownView);
    expect(devicePrototype.createTexture).toBe(ownCreate);
  });

  it('fits only the difference found: swizzle without the 3D fit, and the 3D fit without swizzle', async () => {
    const a = stubPrototypes();
    const ownCreate = a.devicePrototype.createTexture;
    expect(await compat.fitBrowser(device({ rejectsSwizzle: true, error: null }))).toEqual(['swizzle']);
    expect(a.devicePrototype.createTexture).toBe(ownCreate);
    vi.resetModules();
    compat = await import('./webgpuCompat');
    const b = stubPrototypes();
    const ownView = b.texturePrototype.createView;
    expect(await compat.fitBrowser(device({ rejectsSwizzle: false, error: { message: 'x' } }))).toEqual(['3d-attachment']);
    expect(b.texturePrototype.createView).toBe(ownView);
  });

  it('wraps once per page: a second renderer on a second device reports the fits without wrapping again', async () => {
    const { view, texturePrototype, devicePrototype, made } = stubPrototypes();
    const sick = () => device({ rejectsSwizzle: true, error: { message: 'x' } });
    expect(await compat.fitBrowser(sick())).toEqual(['swizzle', '3d-attachment']);
    expect(await compat.fitBrowser(sick())).toEqual(['swizzle', '3d-attachment']);
    texturePrototype.createView({ swizzle: 'rgba' });
    // One wrap: the browser's own createView ran once for that call, not twice through a nested wrap.
    expect(view).toHaveBeenCalledTimes(1);
    devicePrototype.createTexture({ usage: 0x10, dimension: '3d' });
    expect(made).toHaveLength(1);
  });

  it('does nothing, and does not throw, when the page has no GPUTexture or GPUDevice to wrap', async () => {
    expect(await compat.fitBrowser(device({ rejectsSwizzle: true, error: { message: 'x' } }))).toEqual([]);
  });

  it('wraps with the texture as `this`, so the browser’s own method still sees its object', async () => {
    const seen: unknown[] = [];
    const proto = {
      createView(this: unknown) {
        seen.push(this);
        return 1;
      },
      destroy: () => undefined,
    };
    vi.stubGlobal('GPUTexture', { prototype: proto });
    await compat.fitBrowser(device({ rejectsSwizzle: true, error: null }));
    const instance = Object.create(proto) as typeof proto;
    instance.createView();
    expect(seen).toEqual([instance]);
  });
});
