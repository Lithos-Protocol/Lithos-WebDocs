import React, { useMemo, useRef, useState } from 'react';
import s from './styles.module.css';
import { tipLeftFor, toViewX } from '../chartPointer';

/**
 * A multi-series time chart.
 *
 * Built for this page's central problem: network hashrate and one miner's hashrate belong on the
 * same axis but can sit six orders of magnitude apart, which makes a linear axis draw the smaller
 * series flat along the baseline. Hence the log option, and hence the shared crosshair — comparing
 * two series is the whole point, so hovering reads every visible one at that instant rather than
 * whichever line the pointer happens to be nearest.
 *
 * Plotted values go through Number, which is safe because a pixel does not need 21 exact digits.
 * Every value *shown* is formatted from the original wire string instead, so nothing displayed has
 * been through a float.
 */

const W = 760;
const PAD = { t: 14, r: 14, b: 26, l: 58 };
/** Width of one 9px mono glyph in viewBox units, for sizing the label gutter. */
const AXIS_CHAR_W = 5.6;
/** How long the draw-in sweep takes to cross the plot. */
const DRAW_SECONDS = 1.1;

/** Catmull-Rom through the points, emitted as cubic Beziers — the same smoothing the DEX uses. */
function smoothPath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d +=
      ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}` +
      ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}` +
      ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Splits a series into runs of consecutive drawable points.
 *
 * A null is a real answer from these endpoints — an interval that was not measured, or a window
 * with no processed blocks — so the line breaks there instead of interpolating across it and
 * inventing a measurement.
 */
function runs(points, usable) {
  const out = [];
  let run = [];
  points.forEach((p, i) => {
    if (usable(p)) run.push(i);
    else if (run.length) {
      out.push(run);
      run = [];
    }
  });
  if (run.length) out.push(run);
  return out;
}

export function SeriesChart({
  series,
  xs,
  xLabel,
  yFormat,
  log = false,
  height = 230,
  emptyLabel = 'Nothing to plot in this window yet.',
  tooltipTitle,
  animateKey = '',
  smooth = true,
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;

  const model = useMemo(() => {
    const visible = series.filter((line) => line.points.some((p) => p != null && p.y != null));
    if (visible.length === 0 || xs.length === 0) return null;

    // Log mode cannot place a zero, so it treats one as an unmeasured point rather than clamping
    // it to an arbitrary floor that would read as a real, very small value.
    const usable = (p) => p != null && p.y != null && Number.isFinite(p.y) && (!log || p.y > 0);
    const vals = visible.flatMap((line) => line.points.filter(usable).map((p) => p.y));
    if (vals.length === 0) return null;

    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    let toUnit;
    let fromUnit;
    if (log) {
      const l = Math.log10(lo);
      const h = Math.log10(hi);
      const padded = h === l ? [l - 0.5, h + 0.5] : [l - (h - l) * 0.08, h + (h - l) * 0.12];
      toUnit = (v) => (Math.log10(v) - padded[0]) / (padded[1] - padded[0]);
      fromUnit = (f) => 10 ** (padded[0] + f * (padded[1] - padded[0]));
    } else {
      if (hi === lo) {
        hi = hi === 0 ? 1 : hi * 1.05;
        lo = lo === 0 ? 0 : lo * 0.95;
      }
      const pad = (hi - lo) * 0.14;
      lo = Math.max(0, lo - pad);
      hi += pad;
      toUnit = (v) => (v - lo) / (hi - lo);
      fromUnit = (f) => lo + f * (hi - lo);
    }

    const fractions = [0, 0.25, 0.5, 0.75, 1];
    const tickLabels = fractions.map((f) => yFormat(fromUnit(f)));
    const padL = Math.max(
      PAD.l,
      Math.ceil(Math.max(...tickLabels.map((t) => t.length)) * AXIS_CHAR_W) + 12,
    );

    const innerW = W - padL - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const x = (i) => padL + (i / Math.max(1, xs.length - 1)) * innerW;
    const y = (v) => PAD.t + innerH - toUnit(v) * innerH;
    const baseline = PAD.t + innerH;

    const last = xs.length - 1;
    const lines = visible.map((line) => {
      const spans = runs(line.points, usable);
      const at = (i) => [x(i), y(line.points[i].y)];
      const segments = spans.map((run) => {
        const pts = run.map(at);
        // A running total only ever holds or rises; a smoothed curve would dip before each rise.
        const d = smooth
          ? smoothPath(pts)
          : pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        return {
          d,
          // Only a filled series closes its path; a bare stroke has no area to shade.
          area:
            line.area && pts.length > 1
              ? `${d} L${pts[pts.length - 1][0].toFixed(1)} ${baseline} L${pts[0][0].toFixed(1)} ${baseline} Z`
              : null,
          dot: pts.length === 1 ? pts[0] : null,
          x0: pts[0][0],
          x1: pts[pts.length - 1][0],
        };
      });

      /*
       * Where nothing was measured the line drops straight to the axis, runs along it and climbs
       * back where data resumes, dashed throughout. A break would read as the chart failing; a
       * solid drop would read as a real zero. Dashed says "no data" without claiming either.
       */
      const floor = (i) => [x(i), baseline];
      const gaps = [];
      if (spans.length) {
        const first = spans[0][0];
        const end = spans[spans.length - 1][spans[spans.length - 1].length - 1];
        if (first > 0) gaps.push([floor(0), floor(first), at(first)]);
        for (let k = 0; k + 1 < spans.length; k++) {
          const a = spans[k][spans[k].length - 1];
          const b = spans[k + 1][0];
          gaps.push([at(a), floor(a), floor(b), at(b)]);
        }
        if (end < last) gaps.push([at(end), floor(end), floor(last)]);
      }

      const lastIdx = [...line.points.keys()].reverse().find((i) => usable(line.points[i]));
      return {
        ...line,
        segments,
        gaps: gaps.map((g) => ({
          d: g.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
          x0: g[0][0],
        })),
        end: lastIdx == null ? null : at(lastIdx),
        // Only a series whose newest point is the interval in progress is live.
        live: lastIdx === last,
      };
    });

    const step = Math.max(1, Math.floor((xs.length - 1) / 5));
    const xTicks = xs
      .map((v, i) => ({ i, v }))
      // The last point always gets a label, so a regular tick just before it is dropped rather than overprinted.
      .filter(({ i }) => i === xs.length - 1 || (i % step === 0 && xs.length - 1 - i >= step * 0.6))
      .map(({ i, v }) => ({ x: x(i), label: xLabel(v, i) }));

    return {
      lines,
      yTicks: fractions.map((f, i) => ({ y: y(fromUnit(f)), label: tickLabels[i] })),
      xTicks,
      xAt: x,
      yAt: y,
      baseline,
      innerW,
      padL,
      usable,
    };
  }, [series, xs, log, yFormat, xLabel, H, smooth]);

  const onMove = (e) => {
    if (!model) return setHover(null);
    const mx = toViewX(svgRef.current, e.clientX);
    if (mx == null || mx < model.padL - 8 || mx > W - PAD.r + 8) return setHover(null);
    const i = Math.round(((mx - model.padL) / model.innerW) * (xs.length - 1));
    return setHover(Math.max(0, Math.min(xs.length - 1, i)));
  };

  if (!model) return <div className={s.empty}>{emptyLabel}</div>;

  const tipLeft = hover == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, model.xAt(hover), 190);
  /** Seconds into the draw-in sweep at which a viewBox x is reached. */
  const sweepAt = (vx) => (DRAW_SECONDS * Math.max(0, vx - model.padL)) / model.innerW;

  return (
    <div
      className={s.chartBox}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={s.chart} style={{ height: H }} role="img">
        <defs>
          {model.lines
            .filter((l) => l.area)
            .map((l) => (
              <linearGradient key={l.id} id={`mineArea-${l.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={l.color} stopOpacity={l.areaOpacity ?? 0.2} />
                <stop offset="1" stopColor={l.color} stopOpacity="0" />
              </linearGradient>
            ))}
        </defs>

        {model.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={model.padL}
              y1={t.y}
              x2={W - PAD.r}
              y2={t.y}
              stroke="rgba(56,189,248,0.08)"
              strokeWidth="1"
            />
            <text x={model.padL - 8} y={t.y + 3.2} className={s.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}

        {model.xTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x}
              y1={model.baseline}
              x2={t.x}
              y2={model.baseline + 4}
              stroke="rgba(125,211,252,0.25)"
              strokeWidth="1"
            />
            <text x={t.x} y={H - 8} className={s.axisText} textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}

        {/*
          Keyed on the selection, so a new view or range remounts the plot and draws it in again.
          Each piece starts when the sweep reaches its left edge, so the whole line reads as one
          stroke drawn left to right even where it breaks into runs and gaps.
        */}
        <g key={animateKey}>
          {model.lines.map((line) => (
            <g key={line.id}>
              {line.gaps.map((g, i) => (
                <path
                  key={`gap-${i}`}
                  d={g.d}
                  fill="none"
                  stroke={line.color}
                  strokeOpacity="0.5"
                  strokeWidth="1.4"
                  strokeDasharray="3 5"
                  strokeLinecap="round"
                  className={s.fadeIn}
                  style={{ animationDelay: `${sweepAt(g.x0)}s` }}
                />
              ))}
              {line.segments.map((seg, i) => (
                <g key={i}>
                  {seg.area && (
                    <path
                      d={seg.area}
                      fill={`url(#mineArea-${line.id})`}
                      className={s.fadeIn}
                      style={{ animationDelay: `${sweepAt(seg.x0) + 0.25}s` }}
                    />
                  )}
                  {seg.dot ? (
                    <circle
                      cx={seg.dot[0]}
                      cy={seg.dot[1]}
                      r="2.6"
                      fill={line.color}
                      className={s.fadeIn}
                      style={{ animationDelay: `${sweepAt(seg.x0)}s` }}
                    />
                  ) : (
                    <path
                      d={seg.d}
                      pathLength="1"
                      fill="none"
                      stroke={line.color}
                      strokeWidth={line.width ?? 2}
                      strokeLinecap="round"
                      className={s.drawIn}
                      style={{
                        animationDelay: `${sweepAt(seg.x0)}s`,
                        animationDuration: `${Math.max(0.08, sweepAt(seg.x1) - sweepAt(seg.x0))}s`,
                      }}
                    />
                  )}
                </g>
              ))}
              {line.end && (
                <>
                  {line.live && (
                    <circle cx={line.end[0]} cy={line.end[1]} r="3.4" fill="none" stroke={line.color} className={s.ping} />
                  )}
                  <circle
                    cx={line.end[0]}
                    cy={line.end[1]}
                    r="3.4"
                    fill={line.color}
                    className={s.fadeIn}
                    style={{ animationDelay: `${sweepAt(line.end[0])}s` }}
                  />
                </>
              )}
            </g>
          ))}
        </g>

        {hover != null && (
          <g pointerEvents="none">
            <line
              className={s.cursorLine}
              x1={model.xAt(hover)}
              y1={PAD.t}
              x2={model.xAt(hover)}
              y2={model.baseline}
            />
            {model.lines.map((line) =>
              model.usable(line.points[hover]) ? (
                <circle
                  key={`h-${line.id}`}
                  cx={model.xAt(hover)}
                  cy={model.yAt(line.points[hover].y)}
                  r="4.4"
                  fill={line.color}
                  stroke="#0a0f1e"
                  strokeWidth="1.5"
                />
              ) : null,
            )}
          </g>
        )}
      </svg>

      {hover != null && (
        <div className={s.hoverTip} style={{ left: `${tipLeft}px` }}>
          <div className={s.hoverTipLabel}>{tooltipTitle(xs[hover], hover)}</div>
          {model.lines.map((line) => (
            <div key={line.id} className={s.hoverTipRow}>
              <span className={s.hoverSwatch} style={{ background: line.color }} />
              <span className={s.hoverTipLabel}>{line.label}</span>
              <span className={s.hoverTipValue}>
                {model.usable(line.points[hover])
                  ? line.format(line.points[hover])
                  : 'not measured'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A step chart for the difficulty curve.
 *
 * Difficulty genuinely is a step function — it holds for a whole epoch and then jumps — so
 * smoothing it would draw a slope that never existed. Each bar is one epoch, which also makes the
 * epoch the thing you hover rather than a point in between two of them.
 *
 * Only the network belongs on this axis. The epoch table is header-derived and reaches back years,
 * while Lithos participation is only known for as long as block records are retained, so a Lithos
 * series here would cover a sliver of the window and read as a spike at one edge. It lives on the
 * hashrate chart instead, where both series share a range.
 */
export function EpochBars({ epochs, yFormat, height = 210, onHover, hovered, tooltip }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const H = height;

  const model = useMemo(() => {
    const usable = epochs.filter((e) => e && e.value > 0);
    if (usable.length === 0) return null;
    const hi = Math.max(...usable.map((e) => e.value));
    const lo = Math.min(...usable.map((e) => e.value));
    // Difficulty moves within a band, so a zero-based axis would squash every change into a few
    // pixels. The floor sits below the minimum instead, and the axis labels say what it is.
    const floor = Math.max(0, lo - (hi - lo) * 0.45 - hi * 0.02);
    const ceil = hi + (hi - floor) * 0.1;
    const fractions = [0, 0.5, 1];
    const tickLabels = fractions.map((f) => yFormat(floor + (ceil - floor) * f));
    const padL = Math.max(
      PAD.l,
      Math.ceil(Math.max(...tickLabels.map((t) => t.length)) * AXIS_CHAR_W) + 12,
    );
    const innerW = W - padL - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const bw = innerW / epochs.length;
    const y = (v) => PAD.t + innerH - ((v - floor) / (ceil - floor)) * innerH;

    return {
      bars: epochs.map((e, i) => ({
        i,
        epoch: e,
        x: padL + i * bw,
        w: Math.max(1, bw - Math.min(2, bw * 0.18)),
        slot: Math.max(1, bw),
        y: e && e.value > 0 ? y(e.value) : null,
      })),
      yTicks: fractions.map((f, i) => ({ y: y(floor + (ceil - floor) * f), label: tickLabels[i] })),
      baseline: PAD.t + innerH,
      padL,
      innerW,
    };
  }, [epochs, yFormat, H]);

  if (!model) return <div className={s.empty}>No difficulty epochs collected yet.</div>;

  const active = hovered == null ? null : model.bars[hovered];
  const tipLeft =
    active == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, active.x + active.w / 2, 200);

  return (
    <div className={s.chartBox} ref={wrapRef} onMouseLeave={() => onHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={s.chart} style={{ height: H }} role="img">
        <defs>
          <linearGradient id="mineEpochBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".95" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity=".28" />
          </linearGradient>
          <linearGradient id="mineEpochBarHot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a855f7" stopOpacity="1" />
            <stop offset="1" stopColor="#a855f7" stopOpacity=".38" />
          </linearGradient>
        </defs>

        {model.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={model.padL}
              y1={t.y}
              x2={W - PAD.r}
              y2={t.y}
              stroke="rgba(56,189,248,0.08)"
              strokeWidth="1"
            />
            <text x={model.padL - 8} y={t.y + 3.2} className={s.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}

        {model.bars.map((bar) =>
          bar.y == null ? null : (
            <rect
              key={bar.i}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={Math.max(1, model.baseline - bar.y)}
              rx={Math.min(2.5, bar.w / 2)}
              fill={hovered === bar.i ? 'url(#mineEpochBarHot)' : 'url(#mineEpochBar)'}
              onMouseEnter={() => onHover(bar.i)}
            />
          ),
        )}

        {/* One transparent strip per epoch, so the thin gap between bars still has a hover target. */}
        {model.bars.map((bar) => (
          <rect
            key={`hit-${bar.i}`}
            x={bar.x}
            y={PAD.t}
            width={bar.slot}
            height={model.baseline - PAD.t}
            fill="transparent"
            onMouseEnter={() => onHover(bar.i)}
          />
        ))}
      </svg>

      {active && active.epoch && (
        <div className={s.hoverTip} style={{ left: `${tipLeft}px` }}>
          {tooltip(active.epoch)}
        </div>
      )}
    </div>
  );
}


/**
 * Stacked bars for amounts earned per interval.
 *
 * Payouts are lumpy — most intervals have none and a few have one — so a line through them would
 * draw slopes between payouts that never happened. A bar per interval shows each one where it
 * landed, and the stack keeps the parts of a payout apart, which is the point of this chart: a
 * returned bond is the miner's own deposit, and summing it with the reward is what makes payouts
 * look larger than they earn.
 *
 * An interval that was never collected is marked with a dashed tick on the floor — the same "no
 * data" language as the line charts — rather than an empty slot, which would read as a real zero.
 */
export function StackedBars({
  xs,
  layers,
  missing = [],
  height = 240,
  xLabel,
  yFormat,
  tooltip,
  animateKey = '',
  emptyLabel = 'Nothing earned in this window yet.',
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;

  const model = useMemo(() => {
    const n = xs.length;
    if (n === 0) return null;
    const totals = xs.map((_, i) => layers.reduce((sum, l) => sum + (l.values[i] || 0), 0));
    const hi = Math.max(0, ...totals);
    if (hi <= 0) return null;

    const top = hi * 1.12;
    const fractions = [0, 0.25, 0.5, 0.75, 1];
    const tickLabels = fractions.map((f) => yFormat(top * f));
    const padL = Math.max(PAD.l, Math.ceil(Math.max(...tickLabels.map((t) => t.length)) * AXIS_CHAR_W) + 12);

    const innerW = W - padL - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const baseline = PAD.t + innerH;
    const slot = innerW / n;
    const barW = Math.max(1, Math.min(slot * 0.68, 26));
    const cx = (i) => padL + slot * (i + 0.5);
    const y = (v) => baseline - (v / top) * innerH;

    const bars = xs.map((_, i) => {
      let floor = baseline;
      const segs = layers
        .map((l) => {
          const v = l.values[i] || 0;
          if (v <= 0) return null;
          const h = Math.max(1, (v / top) * innerH);
          const seg = { id: l.id, color: l.color, y: floor - h, h };
          floor -= h;
          return seg;
        })
        .filter(Boolean);
      return { i, x: cx(i) - barW / 2, segs, missing: !!missing[i] };
    });

    const step = Math.max(1, Math.floor((n - 1) / 5));
    return {
      bars,
      slot,
      barW,
      padL,
      innerW,
      baseline,
      cx,
      yTicks: fractions.map((f, i) => ({ y: y(top * f), label: tickLabels[i] })),
      xTicks: xs
        .map((v, i) => ({ i, v }))
        .filter(({ i }) => i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.6))
        .map(({ i, v }) => ({ x: cx(i), label: xLabel(v, i) })),
    };
  }, [xs, layers, missing, yFormat, xLabel, H]);

  if (!model) return <div className={s.empty}>{emptyLabel}</div>;

  const onMove = (e) => {
    const mx = toViewX(svgRef.current, e.clientX);
    if (mx == null || mx < model.padL || mx > model.padL + model.innerW) return setHover(null);
    return setHover(Math.max(0, Math.min(xs.length - 1, Math.floor((mx - model.padL) / model.slot))));
  };
  const tipLeft = hover == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, model.cx(hover), 220);
  const n = xs.length;

  return (
    <div className={s.chartBox} ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={s.chart} style={{ height: H }} role="img">
        {model.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={model.padL} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="rgba(56,189,248,0.08)" strokeWidth="1" />
            <text x={model.padL - 8} y={t.y + 3.2} className={s.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        {model.xTicks.map((t, i) => (
          <text key={`x${i}`} x={t.x} y={H - 8} className={s.axisText} textAnchor="middle">
            {t.label}
          </text>
        ))}

        {hover != null && (
          <rect
            x={model.padL + model.slot * hover}
            y={PAD.t}
            width={model.slot}
            height={model.baseline - PAD.t}
            fill="rgba(125,211,252,0.05)"
          />
        )}

        <g key={animateKey}>
          {model.bars.map((bar) =>
            bar.missing ? (
              <line
                key={bar.i}
                x1={bar.x}
                x2={bar.x + model.barW}
                y1={model.baseline - 0.5}
                y2={model.baseline - 0.5}
                stroke="rgba(148,163,184,0.45)"
                strokeWidth="1.2"
                strokeDasharray="2 3"
              />
            ) : bar.segs.length ? (
              <g key={bar.i} className={s.barGrow} style={{ animationDelay: `${(bar.i / n) * 0.55}s` }}>
                {bar.segs.map((seg) => (
                  <rect
                    key={seg.id}
                    x={bar.x}
                    y={seg.y}
                    width={model.barW}
                    height={seg.h}
                    rx={Math.min(2, model.barW / 3)}
                    fill={seg.color}
                    fillOpacity={hover === bar.i ? 1 : 0.78}
                  />
                ))}
              </g>
            ) : null,
          )}
        </g>

        <line x1={model.padL} y1={model.baseline} x2={W - PAD.r} y2={model.baseline} stroke="rgba(125,211,252,0.18)" />
      </svg>

      {hover != null && (
        <div className={s.hoverTip} style={{ left: `${tipLeft}px` }}>
          {tooltip(hover)}
        </div>
      )}
    </div>
  );
}
