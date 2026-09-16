import React, { useMemo, useId } from 'react';
import s from './styles.module.css';

/**
 * Lithos "flow field" — the signature background of the Currents design.
 *
 * Ported from the handoff's `flow-field.js`. Horizontal streamlines deform around
 * isometric cubes; the important property is that displacement is a CONTINUOUS
 * FIELD rather than a per-line effect — it peaks on a cube's centreline and decays
 * outward, so neighbouring lines inherit a diluted echo and the family stays
 * parallel. Hand-drawn curves do not match this.
 *
 *   displacement(a, x) = sign * core * exp(-(a / (2.1*core))^2)
 *                              * exp(-((x - cx) / W)^2)
 *
 * Paths are static. Only the cubes float, and light dots ride the paths via SMIL
 * <animateMotion mpath>.
 */
export function flowField({ width, height, lines, cubes = [], sample = 20 }) {
  const round = (n) => Math.round(n * 10) / 10;

  // Resolve any `{cx, size, between:[a,b]}` entries into concrete {x,y,size}
  // before the field is built. See resolveBetween().
  cubes = resolveBetween(cubes);

  // Isometric projection used throughout: depth 36%, rise 28% of the face size.
  const geom = ({ x: X, y: Y, size: S }) => {
    const D = Math.round(0.36 * S);
    const E = Math.round(0.28 * S);
    return {
      size: S,
      centreX: X + (S + D) / 2,
      centreY: (Y - E + Y + S) / 2,
      halfHeight: (S + E) / 2,
      front: `${X},${Y} ${X + S},${Y} ${X + S},${Y + S} ${X},${Y + S}`,
      top: `${X},${Y} ${X + D},${Y - E} ${X + S + D},${Y - E} ${X + S},${Y}`,
      side: `${X + S},${Y} ${X + S + D},${Y - E} ${X + S + D},${Y + S - E} ${X + S},${Y + S}`,
      originX: X + (S + D) / 2,
      originY: (Y - E + Y + S) / 2,
    };
  };

  const solids = cubes.map(geom);

  // Gentle ambient waviness so the field is never dead straight.
  const baseY = (y0, x) => y0 + 6 * Math.sin(x / 220 + y0 / 70);

  const displace = (y0, x) => {
    let d = 0;
    for (const c of solids) {
      const core = c.halfHeight + 6;
      const offset = baseY(y0, c.centreX) - c.centreY;
      const a = Math.abs(offset);
      const dir = offset < 0 ? -1 : 1;
      const amp = core * Math.exp(-Math.pow(a / (2.1 * core), 2));
      const W = x < c.centreX ? 0.95 * c.size * 2.4 : 1.2 * c.size * 2.4;
      d += dir * amp * Math.exp(-Math.pow((x - c.centreX) / W, 2));
    }
    return d;
  };

  // Catmull-Rom through the samples, emitted as cubic Beziers — smooth, no kinks.
  const toPath = (y0) => {
    const pts = [];
    for (let x = -40; x <= width + 40; x += sample) pts.push([x, baseY(y0, x) + displace(y0, x)]);
    const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    let d = `M${round(pts[0][0])} ${round(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      d +=
        ` C${round(p1[0] + (p2[0] - p0[0]) / 6)} ${round(p1[1] + (p2[1] - p0[1]) / 6)}` +
        ` ${round(p2[0] - (p3[0] - p1[0]) / 6)} ${round(p2[1] - (p3[1] - p1[1]) / 6)}` +
        ` ${round(p2[0])} ${round(p2[1])}`;
    }
    return d;
  };

  return {
    width,
    height,
    paths: lines.map((y0, i) => ({
      d: toPath(y0),
      gradient: i % 3 === 1 ? 'soft' : 'faint',
      width: i % 2 ? 1.1 : 1.5,
    })),
    cubes: solids,
  };
}

/** Same ambient waviness the generator applies, so placement agrees with it. */
const baseYAt = (y0, x) => y0 + 6 * Math.sin(x / 220 + y0 / 70);

/** Breathing room a cube keeps from the streamline hugging it, in user units. */
const CUBE_CLEARANCE = 7;

/** Geometry of a cube, matching geom() inside flowField(). */
function metrics({ x: X, y: Y, size: S }) {
  const D = Math.round(0.36 * S);
  const E = Math.round(0.28 * S);
  return {
    size: S,
    centreX: X + (S + D) / 2,
    centreY: Y + (S - E) / 2,
    halfHeight: (S + E) / 2,
  };
}

/** Displacement contributed by one cube to line y0 at x — mirrors displace(). */
function pushFrom(c, y0, x) {
  const core = c.halfHeight + 6;
  const offset = baseYAt(y0, c.centreX) - c.centreY;
  const a = Math.abs(offset);
  const dir = offset < 0 ? -1 : 1;
  const amp = core * Math.exp(-Math.pow(a / (2.1 * core), 2));
  const W = x < c.centreX ? 0.95 * c.size * 2.4 : 1.2 * c.size * 2.4;
  return dir * amp * Math.exp(-Math.pow((x - c.centreX) / W, 2));
}

/**
 * Declare a cube as "centred between these two streamlines" and let the field
 * resolve where that actually is.
 *
 * @param cx      centre x of the cube (not the front-face left edge)
 * @param size    front-face size
 * @param between [lineAbove, lineBelow] — undeflected y of its two neighbours
 */
export function cubeBetween({ cx, size, lineA, lineB, between }) {
  const pair = between ?? [lineA, lineB];
  return { cx, size, between: pair };
}

/**
 * Resolve `between` cubes to concrete positions.
 *
 * Centring against the UNDEFLECTED lines is not enough: a large neighbour
 * deforms the field so strongly that the line a small cube is meant to sit under
 * has already moved tens of pixels by the time it reaches that x — enough to run
 * straight through the cube. So each cube is centred against the lines as they
 * actually fall, counting every OTHER cube's contribution.
 *
 * A cube's own push is deliberately excluded: it displaces its two neighbours
 * away by equal and opposite amounts, so it cannot shift their midpoint, and
 * including it would just make the solve circular. Two passes settle the
 * remaining cube-to-cube interaction.
 */
function resolveBetween(cubes) {
  if (!cubes.some((c) => c.between)) return cubes;

  let resolved = cubes.map((c) =>
    c.between
      ? { ...c, x: Math.round(c.cx - (c.size + Math.round(0.36 * c.size)) / 2), y: 0 }
      : c,
  );

  for (let pass = 0; pass < 3; pass++) {
    resolved = resolved.map((c, i) => {
      if (!c.between) return c;
      const others = resolved.filter((_, j) => j !== i).map(metrics);
      const at = (y0) => baseYAt(y0, c.cx) + others.reduce((s, o) => s + pushFrom(o, y0, c.cx), 0);
      const [a, b] = c.between;

      // Solve for the centre that lands midway between the lines AS DRAWN.
      // A cube's own push is computed from the undeflected line position, so it
      // is not quite symmetric about the deflected midpoint — centring on the
      // others-only midpoint therefore still leaves the gaps uneven. Iterate
      // until the cube sits at the midpoint of the final, self-inclusive result.
      let centreY = (at(a) + at(b)) / 2;
      for (let solve = 0; solve < 6; solve += 1) {
        const E0 = Math.round(0.28 * c.size);
        const self = metrics({
          x: c.cx - (c.size + Math.round(0.36 * c.size)) / 2,
          y: centreY - (c.size - E0) / 2,
          size: c.size,
        });
        const mid = (at(a) + pushFrom(self, a, c.cx) + at(b) + pushFrom(self, b, c.cx)) / 2;
        if (Math.abs(mid - centreY) < 0.25) break;
        centreY += (mid - centreY) * 0.6; // damped, so it settles rather than oscillates
      }

      // Fit to the lane. A big neighbour's gradient can SQUEEZE two lines
      // together — near the hero block the 46px spacing closes to ~33px — and a
      // cube authored for the nominal spacing then straddles both. Shrink until
      // it sits inside its own lane with clearance, counting the cube's own
      // outward push (which widens the lane as it grows).
      let size = c.size;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const E = Math.round(0.28 * size);
        const self = metrics({ x: c.cx - (size + Math.round(0.36 * size)) / 2, y: centreY - (size - E) / 2, size });
        const lineAbove = at(a) + pushFrom(self, a, c.cx);
        const lineBelow = at(b) + pushFrom(self, b, c.cx);
        const halfLane = (lineBelow - lineAbove) / 2;
        const needed = (size + E) / 2 + CUBE_CLEARANCE;
        // Floor at 22: below that a cube stops reading as a solid and the fit is
        // better solved by choosing a wider lane than by shrinking further.
        if (halfLane >= needed || size <= 22) break;
        size = Math.max(22, Math.round(size * 0.92));
      }

      const E = Math.round(0.28 * size);
      // Invert metrics(): centreY = Y + (S - E)/2.
      return {
        ...c,
        size,
        x: Math.round(c.cx - (size + Math.round(0.36 * size)) / 2),
        y: Math.round(centreY - (size - E) / 2),
      };
    });
  }

  return resolved.map(({ cx, between, ...rest }) => rest);
}

/**
 * Decorative streamline band.
 *
 * PLACEMENT RULE from the handoff, learned the hard way: a cube must float in open
 * space. Never let an opaque card or body text overlap one — a half-covered cube
 * reads as a rendering artifact rather than a solid. This is why sub-pages carry
 * 66–88px of top padding: it opens a band under the nav where the cubes live.
 *
 * @param lines     undeflected y positions of the streamlines
 * @param cubes     [{x, y, size}] — x,y is the FRONT FACE top-left
 * @param particles [{line, dur, begin}] — light dots riding a path by index
 */
export default function FlowField({
  width = 1280,
  height = 320,
  lines = [46, 89, 130, 169, 206, 243, 280],
  cubes = [{ x: 1092, y: 68, size: 44 }],
  particles = [
    { line: 1, dur: 7, begin: 0.2, color: '#7dd3fc' },
    { line: 4, dur: 8, begin: 1.8, color: '#c084fc' },
    { line: 5, dur: 9, begin: 3.4, color: '#7dd3fc' },
  ],
  className = '',
  style,
}) {
  // useId keeps gradient/path ids unique when several fields share a page.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const field = useMemo(
    () => flowField({ width, height, lines, cubes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height, JSON.stringify(lines), JSON.stringify(cubes)],
  );

  const g = (n) => `${uid}-${n}`;

  return (
    <div
      className={`${s.wrap} ${className}`}
      style={{ height, ...style }}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${width} ${height}`} className={s.svg} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={g('soft')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset=".25" stopColor="#38bdf8" stopOpacity=".62" />
            <stop offset=".62" stopColor="#818cf8" stopOpacity=".56" />
            <stop offset=".9" stopColor="#a855f7" stopOpacity=".38" />
            <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={g('faint')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0" />
            <stop offset=".3" stopColor="#7dd3fc" stopOpacity=".34" />
            <stop offset=".75" stopColor="#c084fc" stopOpacity=".3" />
            <stop offset="1" stopColor="#c084fc" stopOpacity="0" />
          </linearGradient>
          {/* Cube faces are OPAQUE on purpose — translucent faces let streamlines
              through and the cubes stop reading as solid. */}
          <linearGradient id={g('front')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f1629" />
            <stop offset="1" stopColor="#141d33" />
          </linearGradient>
          <linearGradient id={g('top')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1f4568" />
            <stop offset="1" stopColor="#321b4e" />
          </linearGradient>
          <linearGradient id={g('side')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#351d52" />
            <stop offset="1" stopColor="#0b0f1f" />
          </linearGradient>
        </defs>

        <g fill="none" strokeLinecap="round">
          {field.paths.map((p, i) => (
            <path
              key={i}
              id={`${uid}-l${i}`}
              d={p.d}
              stroke={`url(#${g(p.gradient)})`}
              strokeWidth={p.width}
            />
          ))}
        </g>

        {field.cubes.map((c, i) => {
          const duration = 9 + i * 2;
          return (
          <g
            key={i}
            className={s.cube}
            style={{
              transformOrigin: `${c.originX}px ${c.originY}px`,
              animationDuration: `${duration}s`,
              /* NEGATIVE delay starts the float already in progress.
                 The keyframes rest at both extremes and `ease-in-out` leaves
                 from a standstill, so a cube entering at 0% covers well under a
                 pixel in its first second and reads as frozen on load. Entering
                 at a quarter or three-quarter cycle puts it at peak velocity
                 instead, and alternating between the two keeps neighbouring
                 cubes travelling in opposite directions. Every index lands on
                 one or the other, so no cube ever enters at a rest point; the
                 differing durations do the rest of the de-phasing over time. */
              animationDelay: `${-duration * (0.25 + i * 0.5)}s`,
            }}
          >
            <polygon points={c.front} fill={`url(#${g('front')})`} stroke="#38bdf8" strokeOpacity=".45" strokeWidth="1" />
            <polygon points={c.top} fill={`url(#${g('top')})`} stroke="#7dd3fc" strokeOpacity=".5" strokeWidth="1" />
            <polygon points={c.side} fill={`url(#${g('side')})`} stroke="#a855f7" strokeOpacity=".4" strokeWidth="1" />
          </g>
          );
        })}

        {particles.map((p, i) =>
          field.paths[p.line] ? (
            <circle key={i} r="2.2" fill={p.color ?? '#7dd3fc'} opacity=".85">
              <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite">
                <mpath href={`#${uid}-l${p.line}`} />
              </animateMotion>
            </circle>
          ) : null,
        )}
      </svg>
    </div>
  );
}
