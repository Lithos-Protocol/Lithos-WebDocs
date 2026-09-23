/*
 * Pointer and tooltip positions for SVG charts, mapped through the SVG's own screen transform.
 *
 * A chart with a fixed height keeps its viewBox's aspect, so on a wide card the drawing is centred
 * with blank margins either side. Dividing by the box width assumes the drawing fills the box, and
 * drifts off the cursor by the width of that margin. The screen transform is exact either way.
 */

/** A client x coordinate, in viewBox units. */
export function toViewX(svg, clientX) {
  const ctm = svg?.getScreenCTM();
  if (!ctm) return null;
  const p = svg.createSVGPoint();
  p.x = clientX;
  p.y = 0;
  return p.matrixTransform(ctm.inverse()).x;
}

/** A viewBox x coordinate, in pixels from the left edge of the chart's box. */
export function toBoxX(svg, box, viewX) {
  const ctm = svg?.getScreenCTM();
  if (!ctm || !box) return null;
  const p = svg.createSVGPoint();
  p.x = viewX;
  p.y = 0;
  return p.matrixTransform(ctm).x - box.getBoundingClientRect().left;
}

/** Tooltip left edge: just right of the point, kept inside the box. */
export function tipLeftFor(svg, box, viewX, tipWidth) {
  const px = toBoxX(svg, box, viewX);
  if (px == null) return 0;
  const width = box.getBoundingClientRect().width;
  return Math.min(Math.max(px + 14, 8), Math.max(8, width - tipWidth));
}
