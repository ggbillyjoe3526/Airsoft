/**
 * Colour difference for the skin checks (CT4): CIEDE2000 (ΔE00) between two sRGB colours, the standard measure of how
 * far apart two colours look to a person. About 1 is the smallest difference anyone sees side by side; under about 10
 * two colours read as the same colour at a glance, and at a distance (small on screen, in shade) more still do.
 * Pure: hex in, number out (Sharma, Wu and Dalal's formulation, tested against their published pairs).
 */

/** CIE L*a*b* (D65). */
export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** An sRGB channel (0 to 1) as linear light. */
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** The D65 white point. */
const WHITE = { x: 0.95047, y: 1, z: 1.08883 };

const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** An sRGB hex colour (0xrrggbb) in CIE L*a*b*. */
export function labOf(hex: number): Lab {
  const r = linear(((hex >> 16) & 255) / 255);
  const g = linear(((hex >> 8) & 255) / 255);
  const bl = linear((hex & 255) / 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * bl) / WHITE.x;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * bl) / WHITE.y;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * bl) / WHITE.z;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const DEG = Math.PI / 180;

/** CIEDE2000 between two Lab colours. */
export function deltaE00(p: Lab, q: Lab): number {
  const c1 = Math.hypot(p.a, p.b);
  const c2 = Math.hypot(q.a, q.b);
  const cMean7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cMean7 / (cMean7 + 25 ** 7)));
  const a1 = p.a * (1 + g);
  const a2 = q.a * (1 + g);
  const C1 = Math.hypot(a1, p.b);
  const C2 = Math.hypot(a2, q.b);
  const hue = (b: number, a: number): number => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / DEG + 360) % 360);
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);
  const dL = q.L - p.L;
  const dC = C2 - C1;
  let dh = 0;
  if (C1 * C2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * DEG);
  const Lm = (p.L + q.L) / 2;
  const Cm = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hm = (h1 + h2) / 2;
    else hm = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t = 1 - 0.17 * Math.cos((hm - 30) * DEG) + 0.24 * Math.cos(2 * hm * DEG) + 0.32 * Math.cos((3 * hm + 6) * DEG) - 0.2 * Math.cos((4 * hm - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Cm7 = Cm ** 7;
  const rc = 2 * Math.sqrt(Cm7 / (Cm7 + 25 ** 7));
  const sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const sc = 1 + 0.045 * Cm;
  const sh = 1 + 0.015 * Cm * t;
  const rt = -Math.sin(2 * dTheta * DEG) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** CIEDE2000 between two sRGB hex colours. */
export const colourDistance = (a: number, b: number): number => deltaE00(labOf(a), labOf(b));
