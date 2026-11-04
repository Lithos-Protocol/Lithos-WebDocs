/** Ink for stripes: the card's dark, so a striped kind still reads as its own hue. */
const INK = 'rgba(6, 9, 19, 0.6)';

/**
 * A CSS background of diagonal stripes in `color`, for a kind that shares its hue with another and is told apart
 * by pattern. Drawn as one 6px tile repeated, so every stripe keeps the same width at any element size; a repeating
 * gradient rounds each stripe on its own and some come out double. The block cube draws the same stripes as lines.
 */
export const stripes = (color) =>
  `linear-gradient(135deg, ${INK} 25%, transparent 25%, transparent 50%, ${INK} 50%, ${INK} 75%, ` +
  `transparent 75%, transparent) 0 0 / 6px 6px, ${color}`;

/** Arb: storage rent's orange, since both are this client's own takings for the pot, striped to tell them apart. */
export const ARB = '#fb923c';
