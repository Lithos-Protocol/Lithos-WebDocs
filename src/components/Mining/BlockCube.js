import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import s from './styles.module.css';

/**
 * The candidate block drawn as an orbitable axonometric stack.
 *
 * A block is bounded on two independent axes — bytes and validation cost — and a transaction takes
 * a different share of each. Rather than invent one combined number, the cube is measured against
 * whichever axis is selected and the slabs resize when it changes: the same package, weighed twice.
 * A slab that grows when you switch to cost is cost-dense, and that is the thing worth seeing.
 *
 * The container is the limit being measured against, so unfilled volume is real unfilled space.
 * Whatever the client does not claim is not empty in the mined block — the node fills it from its
 * own mempool, which this client cannot enumerate, so that region is hatched rather than blank.
 *
 * **Zoom is optical, not a rescale.** A thin slab is made readable by moving the viewBox closer,
 * the way a magnifying glass would, rather than by exaggerating that slab's height. Stretching the
 * small ones is what a chart does when it would rather look informative than be correct, and this
 * drawing's whole job is that a slab's size is its size.
 *
 * **The projection stays orthographic at every angle.** Dragging orbits the camera, but parallel
 * edges stay parallel and nothing shrinks with distance, so two slabs of equal thickness are drawn
 * equal wherever they sit in the stack. Perspective would make the far ones smaller, which is the
 * one thing this drawing must not do. Lowering the pitch toward side-on is the useful end of that:
 * it removes the foreshortening on the top faces and makes thin slabs easiest to compare.
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 40;
const MIN_PITCH = 4;
const MAX_PITCH = 86;
const DEFAULT_YAW = -45;
const DEFAULT_PITCH = 30;
/** Near side-on, where slab thickness is the whole of the vertical and nothing is foreshortened. */
const FOCUS_PITCH = 7;
const RAD = Math.PI / 180;

/**
 * Orthographic projection of a box corner, yawed about the vertical axis then pitched.
 *
 * Returns `[screenX, screenY, toViewer]`. The third value is the camera-space z after both
 * rotations, and **larger means nearer the viewer**: the frame is right-handed with screen-right
 * at +x and screen-up at +y, which leaves +z pointing out of the screen. Everything that sorts by
 * it therefore draws in ascending order to get far-to-near, and anything cueing depth treats the
 * maximum as closest.
 */
function makeProjection(yaw, pitch) {
  const cy = Math.cos(yaw * RAD);
  const sy = Math.sin(yaw * RAD);
  const cp = Math.cos(pitch * RAD);
  const sp = Math.sin(pitch * RAD);
  return (x, y, z) => {
    const px = x * cy + z * sy;
    const rotatedZ = -x * sy + z * cy;
    return [px, rotatedZ * sp - y * cp, rotatedZ * cp + y * sp];
  };
}

const poly = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

const FOOTPRINT = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** Outward horizontal normal of the wall starting at each footprint corner, as (x, z). */
const WALL_NORMALS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * A fixed light, in camera space: up and to the left, a little in front of the viewer.
 *
 * Shading has to come from the face's actual orientation, not from which corner of the footprint
 * it happens to start at. Keyed to the index, a wall kept its brightness as the box turned, so the
 * light appeared to rotate with the box and two faces that were mirror images of each other across
 * the view came out different — the uneven floors.
 */
const LIGHT = (() => {
  const v = [-0.42, 0.56, 0.72];
  const len = Math.hypot(...v);
  return v.map((c) => c / len);
})();

const AMBIENT = 0.34;
const DIFFUSE = 0.56;

/**
 * Lambert shading for a surface, from its normal in the box's own frame, under the same rotations
 * the geometry gets. `ny` is the vertical component: 0 for a wall, 1 for the lid.
 */
function makeShader(yaw, pitch) {
  const cy = Math.cos(yaw * RAD);
  const sy = Math.sin(yaw * RAD);
  const cp = Math.cos(pitch * RAD);
  const sp = Math.sin(pitch * RAD);
  return (nx, nz, ny = 0) => {
    const a = nx * cy + nz * sy;
    const b = -nx * sy + nz * cy;
    // Same yaw-then-pitch the points take, applied to the normal.
    const camera = [a, ny * cp - b * sp, ny * sp + b * cp];
    const lambert = camera[0] * LIGHT[0] + camera[1] * LIGHT[1] + camera[2] * LIGHT[2];
    return AMBIENT + DIFFUSE * Math.max(0, lambert);
  };
}

/**
 * The five faces of a slab spanning [y0, y1] of a W x D column, centred on its own axis so a yaw
 * turns the box rather than swinging it around the origin.
 *
 * `verticals` are the four corner posts, and every face carries its depth so the caller can paint
 * far-to-near: at an arbitrary yaw any of the four walls can be the one facing the camera.
 */
function slabFaces(W, D, y0, y1, project, shadeOf) {
  const p = (fx, y, fz) => project(fx * W - W / 2, y, fz * D - D / 2);
  const sides = FOOTPRINT.map((a, i) => {
    const b = FOOTPRINT[(i + 1) % 4];
    const pts = [p(a[0], y0, a[1]), p(b[0], y0, b[1]), p(b[0], y1, b[1]), p(a[0], y1, a[1])];
    // Outward normal of this wall, in the box's own frame: walls are vertical, so it is horizontal.
    const normal = WALL_NORMALS[i];
    return {
      points: poly(pts),
      toViewer: pts.reduce((sum, q) => sum + q[2], 0) / 4,
      shade: shadeOf(normal[0], normal[1]),
    };
  });
  const topPts = FOOTPRINT.map(([x, z]) => p(x, y1, z));
  const bottomPts = FOOTPRINT.map(([x, z]) => p(x, y0, z));
  return {
    // Ascending: the furthest wall is painted first and the nearest last.
    sides: sides.sort((a, b) => a.toViewer - b.toViewer),
    top: poly(topPts),
    bottom: poly(bottomPts),
    verticals: FOOTPRINT.map(([x, z]) => {
      const a = p(x, y0, z);
      const b = p(x, y1, z);
      return { x1: a[0], y1: a[1], x2: b[0], y2: b[1], toViewer: (a[2] + b[2]) / 2 };
    }),
  };
}

/**
 * The unclaimed volume, as a lattice of dots rather than a hatched fill.
 *
 * A screen-space hatch is painted flat across whatever it covers, so it stays put while the box
 * turns and reads as a sticker rather than as space. Points placed in the volume itself move with
 * the box, and the parallax between near and far ones is what makes it read as depth.
 *
 * Unlike the slabs, these encode no quantity — the node's own mempool is precisely what this
 * client cannot enumerate — so shading them by distance is a depth cue and not a distortion of
 * anything measured.
 */
function mempoolMotes(W, D, y0, y1, project, budget = 520) {
  const span = y1 - y0;
  if (span <= 0.5) return [];
  /*
   * One cubic lattice, so the spacing between motes is the same in all three directions and the
   * volume reads as evenly filled rather than as stacked sheets. Layer count follows the span
   * instead of being fixed, which keeps that spacing constant however shallow the empty region is.
   */
  const perSide = 6;
  const spacing = (W + D) / 2 / perSide;
  const layers = Math.max(1, Math.min(18, Math.round(span / spacing)));
  const motes = [];
  for (let iy = 0; iy < layers && motes.length < budget; iy++) {
    // Alternate layers are offset by half a cell, so the lattice never lines up into columns that
    // would collapse into a few dots when the box is turned side-on.
    const stagger = iy % 2 === 0 ? 0 : 0.5 / perSide;
    const y = y0 + (span * (iy + 0.5)) / layers;
    for (let ix = 0; ix < perSide; ix++) {
      for (let iz = 0; iz < perSide; iz++) {
        const fx = (ix + 0.5) / perSide + stagger;
        const fz = (iz + 0.5) / perSide + stagger;
        if (fx >= 1 || fz >= 1) continue;
        const [px, py, toViewer] = project(fx * W - W / 2, y, fz * D - D / 2);
        motes.push({ x: px, y: py, toViewer });
      }
    }
  }
  if (motes.length === 0) return motes;
  const values = motes.map((m) => m.toViewer);
  const furthest = Math.min(...values);
  const nearest = Math.max(...values);
  const range = nearest - furthest || 1;
  return motes
    .map((m) => {
      const closeness = (m.toViewer - furthest) / range; // 1 nearest, 0 furthest
      return { ...m, r: 0.5 + closeness * 1.0, o: 0.16 + closeness * 0.4 };
    })
    .sort((a, b) => a.toViewer - b.toViewer); // far first, so nearer motes paint over
}


export default function BlockCube({
  slabs,
  capacity,
  limitLabel,
  markers = [],
  hovered,
  onHover,
  focused,
  onFocus,
  height = 360,
}) {
  const W = 120;
  const D = 120;
  const H = 158;
  /*
   * A callback ref, not useRef. This component returns early before the <svg> exists when there is
   * nothing to draw, so a ref object is still null the first time any effect runs — and since the
   * wheel effect's other dependencies never change, it would never re-run to attach the listener.
   * Holding the node in state re-runs the effect the moment it mounts.
   */
  const [svgNode, setSvgNode] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState(null); // null follows the container's own centre
  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const drag = useRef(null);

  const project = useMemo(() => makeProjection(yaw, pitch), [yaw, pitch]);
  const shadeOf = useMemo(() => makeShader(yaw, pitch), [yaw, pitch]);
  // The lid faces straight up, so its brightness follows the pitch like any other surface.
  const topShade = useMemo(() => shadeOf(0, 0, 1), [shadeOf]);

  const model = useMemo(() => {
    if (!(capacity > 0)) return null;
    const unit = H / capacity;
    let cursor = 0;
    const placed = slabs.map((slab) => {
      const raw = Math.max(0, slab.value) * unit;
      // A transaction can be a thousandth of a block. Below a hairline it would vanish entirely,
      // which reads as "not included" rather than "very small", so it keeps a visible floor.
      // Those floors can then add up past the container, so the stack is clamped to it: better a
      // full cube than slabs floating above their own limit.
      const thickness = slab.value > 0 ? Math.max(raw, 1.1) : 0;
      const y0 = Math.min(cursor, H);
      cursor = Math.min(cursor + thickness, H);
      return { ...slab, y0, y1: cursor, faces: slabFaces(W, D, y0, cursor, project, shadeOf), exact: raw };
    });
    const filled = Math.min(cursor, H);
    return {
      placed,
      filled,
      empty: filled < H ? slabFaces(W, D, filled, H, project, shadeOf) : null,
      motes: filled < H ? mempoolMotes(W, D, filled, H, project) : [],
      outline: slabFaces(W, D, 0, H, project, shadeOf),
      markers: markers
        .filter((m) => m.at > 0 && m.at <= capacity)
        .map((m) => ({ ...m, faces: slabFaces(W, D, m.at * unit, m.at * unit, project, shadeOf) })),
      unit,
    };
  }, [slabs, capacity, markers, project, shadeOf]);

  /*
   * The drawing's own extent, recomputed per angle. A fixed box would clip at some yaws, since the
   * silhouette is widest on the diagonal and shortest side-on.
   */
  const base = useMemo(() => {
    const corners = [];
    [0, W].forEach((x) =>
      [0, D].forEach((z) => [0, H].forEach((y) => corners.push(project(x - W / 2, y, z - D / 2)))),
    );
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const pad = 10;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
  }, [project, W, D, H]);

  /** Screen-space vertical extent of a y-range of the box under a given projection. */
  const bandOf = useCallback(
    (proj, y0, y1) => {
      const ys = [];
      [0, W].forEach((x) =>
        [0, D].forEach((z) => [y0, y1].forEach((y) => ys.push(proj(x - W / 2, y, z - D / 2)[1]))),
      );
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      return { lo, hi, size: hi - lo };
    },
    [W, D],
  );

  /*
   * Framing a slab flattens the view before zooming.
   *
   * Seen from above, a slab's own faces span the box's whole depth on screen — about 85 units —
   * while its thickness might be one. Zooming in on that just puts the camera inside a single face,
   * where every slab looks alike. Dropping the pitch toward side-on collapses the depth axis, and
   * then thickness is the only thing left on the vertical, which is exactly what needs comparing.
   *
   * It fires on a *change of selection* and nothing else. Keyed on the model it re-framed on every
   * orbit frame and on every background refresh, so a view you had just turned by hand snapped
   * back to the last slab you picked.
   */
  const framed = useRef(null);
  useEffect(() => {
    if (focused === framed.current) return;
    framed.current = focused;
    if (focused == null) return;
    const slab = model?.placed?.[focused];
    if (!slab) return;
    const proj = makeProjection(yaw, FOCUS_PITCH);
    const slabBand = bandOf(proj, slab.y0, slab.y1);
    const whole = bandOf(proj, 0, H);
    setPitch(FOCUS_PITCH);
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, whole.size / Math.max(slabBand.size * 2.6, 0.5))));
    setCenter({ x: 0, y: (slabBand.lo + slabBand.hi) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, model, bandOf, H]);

  const reset = () => {
    setZoom(1);
    setCenter(null);
    setYaw(DEFAULT_YAW);
    setPitch(DEFAULT_PITCH);
    onFocus?.(null);
  };

  const view = useMemo(() => {
    const w = base.w / zoom;
    const h = base.h / zoom;
    const cx = center?.x ?? base.x + base.w / 2;
    const cy = center?.y ?? base.y + base.h / 2;
    const x = Math.min(Math.max(cx - w / 2, base.x - base.w), base.x + base.w * 2 - w);
    const y = Math.min(Math.max(cy - h / 2, base.y - base.h), base.y + base.h * 2 - h);
    return { x, y, w, h };
  }, [base, zoom, center]);

  const zoomBy = useCallback(
    (factor) => {
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
        if (next === 1) setCenter(null);
        else if (center == null) setCenter({ x: base.x + base.w / 2, y: base.y + base.h / 2 });
        return next;
      });
    },
    [base, center],
  );

  /*
   * Wheel is bound by hand rather than through onWheel.
   *
   * React registers wheel at the root as a passive listener, where preventDefault() is ignored — so
   * the JSX handler zoomed the cube AND scrolled the page underneath it. A non-passive listener on
   * the element itself is the only way to keep the gesture to the cube.
   */
  useEffect(() => {
    if (!svgNode) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18);
    };
    svgNode.addEventListener('wheel', onWheel, { passive: false });
    return () => svgNode.removeEventListener('wheel', onWheel);
  }, [svgNode, zoomBy]);

  const onPointerDown = (e) => {
    // Taking hold of the box hands the view back: the framing was a suggestion, and keeping the
    // selection alive under a manual orbit is what made it feel like the camera was fighting back.
    if (focused != null) {
      framed.current = null;
      onFocus?.(null);
    }
    // Shift pans, plain drag orbits. Panning only means anything once zoomed past the full view.
    const panning = e.shiftKey || e.button === 1;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      panning,
      from: center,
      yaw,
      pitch,
    };
    // Capture keeps the gesture once the pointer leaves the box, but a pointer id the browser does
    // not consider active throws — which must not take the drag down with it.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* the drag still tracks through the move handler */
    }
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !svgNode) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.panning) {
      const rect = svgNode.getBoundingClientRect();
      const scale = view.w / rect.width;
      setCenter({
        x: (d.from?.x ?? base.x + base.w / 2) - dx * scale,
        y: (d.from?.y ?? base.y + base.h / 2) - dy * scale,
      });
    } else {
      setYaw(d.yaw - dx * 0.5);
      setPitch(Math.min(MAX_PITCH, Math.max(MIN_PITCH, d.pitch - dy * 0.4)));
    }
  };

  const endDrag = (e) => {
    drag.current = null;
    try {
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* nothing was captured */
    }
  };

  if (!model) {
    return <div className={s.empty}>{limitLabel ?? 'No block limits reported by the node.'}</div>;
  }

  const zoomed = zoom > 1;

  /*
   * The container's corner posts, split by depth so the box encloses its contents.
   *
   * The two furthest are drawn before the stack and dashed, as an edge seen through the volume;
   * the two nearest are drawn after it and solid. Without that split the wireframe either floats
   * in front of the slabs or vanishes behind them, and either way stops reading as a container.
   */
  const posts = [...model.outline.verticals].sort((a, b) => a.toViewer - b.toViewer);
  const backPosts = posts.slice(0, 2);
  const frontPosts = posts.slice(2);

  return (
  <>
  <div className={s.cubeWrap}>
      <svg
        ref={setSvgNode}
        viewBox={`${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`}
        className={`${s.cube} ${s.cubeGrab}`}
        style={{ height }}
        role="img"
        aria-label="Candidate block package"
        onMouseLeave={() => onHover(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/*
          The container's back half first — its far posts and floor sit behind everything, so the
          stack and the motes paint over them and the box reads as something they are inside.
        */}
        {backPosts.map((post, i) => (
          <line
            key={`back-${i}`}
            x1={post.x1}
            y1={post.y1}
            x2={post.x2}
            y2={post.y2}
            stroke="rgba(125,211,252,0.16)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon
          points={model.outline.bottom}
          fill="none"
          stroke="rgba(125,211,252,0.2)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {model.placed.map((slab, i) => {
          const dim = hovered != null && hovered !== i;
          return ( <>
            {/*
              Hover only. Clicking a slab used to frame it, but the box is also the drag surface —
              so every orbit that ended on a slab zoomed into it. Framing belongs to the list,
              where a click is unambiguous.
            */}
            <g
              key={slab.id}
              className={s.cubeSlab}
              opacity={dim ? 0.32 : 1}
              onMouseEnter={() => onHover(i)}
            >
              {slab.faces.sides.map((face, f) => (
                <polygon
                  key={f}
                  points={face.points}
                  fill={slab.color}
                  fillOpacity={face.shade}
                />
              ))}
              <polygon
                points={slab.faces.top}
                fill={slab.color}
                fillOpacity={hovered === i ? Math.min(1, topShade + 0.18) : topShade}
                stroke="rgba(6,9,19,0.55)"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
              {/* An unproven leaf is outlined rather than recoloured: the colour already means kind. */}
              {slab.ghost && (
                <polygon
                  points={slab.faces.top}
                  fill="none"
                  stroke="rgba(226,232,240,0.85)"
                  strokeWidth="0.9"
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          </>);
        })}

        {/*
          The unclaimed volume, after the stack rather than before it.

          Every mote sits above the fill line, so nothing in the stack is ever between one and the
          camera. Drawn first, the top slab's face — a full-footprint diamond that reaches well up
          the screen — painted over the motes directly above it and they vanished at steeper
          angles. Drawn last they cannot be wrongly occluded: a mote further away than a slab is
          also higher on screen than it, so the two never overlap.
        */}
        {model.motes.length > 0 && (
          <g className={s.cubeEmpty}>
            {model.motes.map((m, i) => (
              <circle key={i} cx={m.x} cy={m.y} r={m.r} fill="#7dd3fc" fillOpacity={m.o} />
            ))}
          </g>
        )}

        {model.markers.map((m) => (
          <polygon
            key={m.id}
            points={m.faces.top}
            fill="none"
            stroke={m.color}
            strokeWidth="1.4"
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* The near posts and the lid last, so the container closes over everything inside it. */}
        {frontPosts.map((post, i) => (
          <line
            key={`front-${i}`}
            x1={post.x1}
            y1={post.y1}
            x2={post.x2}
            y2={post.y2}
            stroke="rgba(125,211,252,0.34)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon
          points={model.outline.top}
          fill="none"
          stroke="rgba(125,211,252,0.32)"
          strokeWidth="1"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className={s.zoomBar}>
        <button
          type="button"
          className={s.zoomBtn}
          onClick={() => zoomBy(1 / 1.6)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className={s.zoomLevel}>{zoom < 1.05 ? '1×' : `${zoom.toFixed(1)}×`}</span>
        <button
          type="button"
          className={s.zoomBtn}
          onClick={() => zoomBy(1.6)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className={s.zoomReset}
          onClick={reset}
          disabled={!zoomed && center == null && yaw === DEFAULT_YAW && pitch === DEFAULT_PITCH}
        >
          reset
        </button>
      </div>

      <div className={s.zoomHint}>
        drag to orbit · {zoomed ? 'shift-drag to pan · ' : ''}scroll to zoom · pick from the list to
        frame
      </div>
    </div>
    </>
  )
}
