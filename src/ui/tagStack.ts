/**
 * Name tags laid out together (BP5; KNOWN_ISSUES from BP3: two teammates standing close showed their tags over each
 * other). Each tag is a box `w` wide and `h` tall whose bottom centre sits at its anchor (x, y) in screen pixels; a tag
 * that would overlap one lower on the screen (the nearer teammate, usually) moves straight up until it sits `gap`
 * pixels over it. x never changes, so each tag stays over its own teammate. Pure and allocation-free: the caller owns
 * the arrays (`order` is scratch of the same length).
 */
export function stackTags(
  n: number,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  w: ArrayLike<number>,
  h: ArrayLike<number>,
  shown: ArrayLike<boolean>,
  gap: number,
  order: Int32Array,
  out: Float64Array,
): void {
  // The shown tags, lowest on screen first (an insertion sort: a team has a handful at most).
  let count = 0;
  for (let i = 0; i < n; i++) {
    out[i] = y[i]!;
    if (!shown[i]) continue;
    let k = count++;
    while (k > 0 && y[order[k - 1]!]! < y[i]!) {
      order[k] = order[k - 1]!;
      k--;
    }
    order[k] = i;
  }
  // Each in turn moves up past every tag already placed that it overlaps, and checks again from the start after a move
  // (a move can land it on another): at most one move per placed tag, so this ends.
  for (let a = 1; a < count; a++) {
    const i = order[a]!;
    for (let b = 0; b < a; b++) {
      const j = order[b]!;
      const apart = Math.abs(x[i]! - x[j]!) >= (w[i]! + w[j]!) / 2;
      // Box i is [out[i] - h[i], out[i]], box j [out[j] - h[j], out[j]].
      if (apart || out[i]! - h[i]! >= out[j]! || out[j]! - h[j]! >= out[i]!) continue;
      out[i] = out[j]! - h[j]! - gap;
      b = -1;
    }
  }
}
