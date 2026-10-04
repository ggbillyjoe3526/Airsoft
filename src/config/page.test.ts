import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from './page';

/** The policy as directive → sources. */
function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...sources]) => [name!, sources]));
}

describe('the built page\'s Content-Security-Policy (audit CORE-19)', () => {
  const csp = directives(CONTENT_SECURITY_POLICY);

  it('runs only the game\'s own scripts, and lets them compile WebAssembly (Rapier, the meshopt decoder)', () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(csp.get('object-src')).toEqual(["'none'"]);
  });

  it('allows what the game uses: inline styles, data: and blob: images, blob: workers, its own fetches', () => {
    expect(csp.get('style-src')).toContain("'unsafe-inline'");
    expect(csp.get('img-src')).toEqual(expect.arrayContaining(['data:', 'blob:']));
    expect(csp.get('worker-src')).toContain('blob:');
    // blob: and data: too: GLTFLoader turns a .glb's embedded textures into blob: URLs that ImageBitmapLoader fetch()es,
    // so a drop-in figure.glb (M25a) would load untextured under connect-src 'self' alone (FA9 critic).
    expect(csp.get('connect-src')).toEqual(["'self'", 'blob:', 'data:']);
  });

  it('holds nothing a <meta> policy cannot carry (the browser would log an error for it)', () => {
    for (const name of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']) expect(csp.has(name)).toBe(false);
  });
});
