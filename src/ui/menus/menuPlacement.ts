/** A box in window coordinates (a getBoundingClientRect, or the part of one that matters). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a pop-up menu of `w` × `h` goes for a pointer at (`x`, `y`) in a window `winW` × `winH` (M100). The corner
 * starts at the pointer, below and to the right of it. It flips to the left of the pointer when there is no room on the
 * right, and above it when there is none below. It never covers a box in `avoid` (the card's name, say): it drops under
 * the boxes, or goes above them, rather than sit on them. Failing every free place it is pushed back inside the window,
 * and last of all simply kept inside it. Pure.
 */
export function placeMenu(x: number, y: number, w: number, h: number, winW: number, winH: number, avoid: readonly Box[] = [], edge = 8, gap = 4): { left: number; top: number } {
  const clampX = (l: number): number => Math.max(edge, Math.min(l, winW - w - edge));
  const clampY = (t: number): number => Math.max(edge, Math.min(t, winH - h - edge));
  const clear = (l: number, t: number): boolean => avoid.every((a) => l + w <= a.left || l >= a.right || t + h <= a.top || t >= a.bottom);
  const underAvoided = avoid.length > 0 ? Math.max(...avoid.map((a) => a.bottom)) + gap : y;
  const aboveAvoided = avoid.length > 0 ? Math.min(...avoid.map((a) => a.top)) - gap - h : y - h;
  // Below the pointer, below the boxes, above the pointer, above the boxes; each to the right of the pointer, then left.
  const spots: [number, number][] = [];
  for (const t of [y, underAvoided, y - h, aboveAvoided]) for (const l of [x, x - w]) spots.push([l, t]);
  for (const [l, t] of spots) if (l >= edge && t >= edge && l + w <= winW - edge && t + h <= winH - edge && clear(l, t)) return { left: l, top: t };
  for (const [l, t] of spots) if (clear(clampX(l), clampY(t))) return { left: clampX(l), top: clampY(t) };
  return { left: clampX(x), top: clampY(y) };
}
