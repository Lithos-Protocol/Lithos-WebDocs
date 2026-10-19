import React, { useMemo, useRef, useState } from 'react';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import { tipLeftFor, toViewX } from '../chartPointer';
import { big, COLORS, epochEnd, epochStart, fmtDifficulty, fmtInt, fmtLit, fmtLitSigned, fmtMove, moveOf, payoutAt } from './format';

/*
 * The forwards charts. Plotted values go through Number, which is safe because a pixel does not need 21
 * exact digits; every value shown is formatted from the original wire string or BigInt instead.
 */

const W = 760;
const PAD = { t: 16, r: 14, b: 28, l: 60 };
/** Width of one 9px mono glyph in viewBox units, for sizing the label gutter. */
const AXIS_CHAR_W = 5.6;
/** Five gridlines, at 0, a quarter, a half, three quarters and the top. */
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function gutter(labels) {
  return Math.max(PAD.l, Math.ceil(Math.max(...labels.map((t) => t.length)) * AXIS_CHAR_W) + 12);
}

function Gridlines({ ticks, left, right }) {
  return ticks.map((t, i) => (
    <g key={i}>
      <line x1={left} y1={t.y} x2={right} y2={t.y} stroke="rgba(56,189,248,0.08)" strokeWidth="1" />
      <text x={left - 8} y={t.y + 3.2} className={m.axisText} textAnchor="end">
        {t.label}
      </text>
    </g>
  ));
}

/**
 * Difficulty by epoch, with the next epoch's computed difficulty as a ghost bar and the epochs a window can
 * start in shaded after it.
 *
 * Difficulty holds for a whole epoch and then jumps, so each epoch is one bar. The next epoch sits between
 * the past and the tradable future: its difficulty is already computable, which is why no window can include
 * it, and the shading shows where windows begin.
 *
 * @param epochs past epochs, oldest first: `{ epoch, difficulty }`
 * @param next   `{ epoch, difficulty, exact, fromHeight }`, or null while it cannot be computed
 * @param lead   epochs after the current one before a window can start
 * @param future empty slots drawn after the next epoch
 * @param heights label each epoch by its first block rather than its number
 */
export function EpochStrip({ epochs, next, current, lead = 2, future = 5, height = 236, width = 760, onPick, heights = false }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;
  const W = width;

  const model = useMemo(() => {
    const values = [...epochs.map((e) => Number(big(e.difficulty))), next ? Number(big(next.difficulty)) : null].filter(
      (v) => v != null && v > 0,
    );
    if (values.length === 0) return null;
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    // Difficulty moves within a band, so the floor sits below the minimum rather than at zero
    const floor = Math.max(0, lo - (hi - lo) * 0.45 - hi * 0.02);
    const ceil = hi + (hi - floor) * 0.12;
    const labels = FRACTIONS.map((f) => fmtDifficulty(BigInt(Math.round(floor + (ceil - floor) * f)), 1));
    const padL = gutter(labels);
    const innerW = W - padL - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const slots = epochs.length + 1 + future;
    const bw = innerW / slots;
    const y = (v) => PAD.t + innerH - ((v - floor) / (ceil - floor)) * innerH;
    const firstEpoch = epochs.length ? epochs[0].epoch : (next?.epoch ?? 0) - 1;
    const xOf = (epoch) => padL + (epoch - firstEpoch) * bw;
    const nextEpoch = next?.epoch ?? (current != null ? current + 1 : firstEpoch + epochs.length);
    return {
      bars: epochs.map((e, i) => ({ i, e, x: xOf(e.epoch), y: y(Number(big(e.difficulty))) })),
      next: next ? { x: xOf(next.epoch), y: y(Number(big(next.difficulty))) } : null,
      nextEpoch,
      bandX: xOf(nextEpoch - 1 + lead),
      bandEnd: padL + innerW,
      bw,
      w: Math.max(1, bw - Math.min(2.5, bw * 0.2)),
      ticks: FRACTIONS.map((f, i) => ({ y: y(floor + (ceil - floor) * f), label: labels[i] })),
      baseline: PAD.t + innerH,
      padL,
      innerW,
      firstEpoch,
      slots,
    };
  }, [epochs, next, current, lead, future, H, W]);

  if (!model) return <div className={m.empty}>No difficulty epochs collected yet.</div>;

  const onMove = (ev) => {
    const vx = toViewX(svgRef.current, ev.clientX);
    if (vx == null) return;
    const i = Math.floor((vx - model.padL) / model.bw);
    setHover(i >= 0 && i < model.slots ? model.firstEpoch + i : null);
  };

  const hovered = hover == null ? null : epochs.find((e) => e.epoch === hover);
  const hoverNext = hover != null && next && hover === next.epoch;
  const tipX = hover == null ? 0 : model.padL + (hover - model.firstEpoch + 0.5) * model.bw;
  const tipLeft = hover == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, tipX, 220);
  const prev = (epoch) => epochs.find((e) => e.epoch === epoch - 1);
  const labelEvery = Math.max(1, Math.ceil(model.slots / 8));

  return (
    <div className={m.chartBox} ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={m.chart}
        style={{ height: 'auto' }}
        role="img"
        aria-label="Difficulty by epoch, with the next epoch's computed difficulty"
        onMouseMove={onMove}
        onClick={() => hover != null && onPick?.(hover)}
      >
        <defs>
          <linearGradient id="extEpochBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={COLORS.difficulty} stopOpacity=".95" />
            <stop offset="1" stopColor={COLORS.difficulty} stopOpacity=".24" />
          </linearGradient>
          <linearGradient id="extNextBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={COLORS.next} stopOpacity=".55" />
            <stop offset="1" stopColor={COLORS.next} stopOpacity=".08" />
          </linearGradient>
          <pattern id="extBand" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(110,231,183,0.16)" strokeWidth="2" />
          </pattern>
        </defs>

        <Gridlines ticks={model.ticks} left={model.padL} right={W - PAD.r} />

        {/* Where windows can start: two epochs after the current one, onwards */}
        {model.bandX < model.bandEnd && (
          <g>
            <rect
              x={model.bandX}
              y={PAD.t}
              width={model.bandEnd - model.bandX}
              height={model.baseline - PAD.t}
              fill="url(#extBand)"
            />
            <line
              x1={model.bandX}
              y1={PAD.t}
              x2={model.bandX}
              y2={model.baseline}
              stroke={COLORS.long}
              strokeOpacity="0.5"
              strokeDasharray="3 3"
            />
            <text x={model.bandX + 5} y={PAD.t + 11} className={s.bandText}>
              <tspan x={model.bandX + 5}>windows</tspan>
              <tspan x={model.bandX + 5} dy="11">start here</tspan>
            </text>
          </g>
        )}

        {model.bars.map((b) => (
          <rect
            key={b.e.epoch}
            x={b.x}
            y={b.y}
            width={model.w}
            height={Math.max(1, model.baseline - b.y)}
            rx={Math.min(2.5, model.w / 2)}
            fill="url(#extEpochBar)"
            opacity={hover == null || hover === b.e.epoch ? 1 : 0.55}
          />
        ))}

        {model.next && (
          <rect
            x={model.next.x}
            y={model.next.y}
            width={model.w}
            height={Math.max(1, model.baseline - model.next.y)}
            rx={Math.min(2.5, model.w / 2)}
            fill="url(#extNextBar)"
            stroke={COLORS.next}
            strokeWidth="1.2"
            strokeDasharray={next.exact ? undefined : '3 2'}
          />
        )}
        {model.next && (
          <text x={model.next.x + model.w / 2} y={model.next.y - 6} className={s.nextText} textAnchor="middle">
            next
          </text>
        )}

        <line x1={model.padL} y1={model.baseline} x2={W - PAD.r} y2={model.baseline} stroke="rgba(125,211,252,0.18)" />
        {Array.from({ length: model.slots }, (_, i) => model.firstEpoch + i)
          .filter((e, i) => (model.slots - 1 - i) % labelEvery === 0)
          .map((e) => (
            <text
              key={e}
              x={model.padL + (e - model.firstEpoch + 0.5) * model.bw}
              y={H - 9}
              className={m.axisText}
              textAnchor="middle"
            >
              {heights ? fmtInt(epochStart(e)) : fmtInt(e)}
            </text>
          ))}
      </svg>

      {hover != null && (hovered || hoverNext || hover > model.nextEpoch - 1) && (
        <div className={m.hoverTip} style={{ left: `${tipLeft}px` }}>
          <div className={m.hoverTipLabel}>
            {heights ? `Blocks ${fmtInt(epochStart(hover))}–${fmtInt(epochEnd(hover))}` : `Epoch ${fmtInt(hover)}`}
            {hoverNext && (next.exact ? ' · next, final' : ' · next, projected')}
            {hover === current && ' · now'}
          </div>
          {(hovered || hoverNext) && (
            <div className={m.hoverTipRow}>
              <span className={m.hoverSwatch} style={{ background: hoverNext ? COLORS.next : COLORS.difficulty }} />
              <span className={m.hoverTipLabel}>Difficulty</span>
              <span className={m.hoverTipValue}>{fmtDifficulty(hoverNext ? next.difficulty : hovered.difficulty)}</span>
            </div>
          )}
          {(hovered || hoverNext) && prev(hover) && (
            <div className={m.hoverTipRow}>
              <span className={m.hoverTipLabel}>Move</span>
              <span className={m.hoverTipValue}>
                {fmtMove(moveOf(hoverNext ? next.difficulty : hovered.difficulty, prev(hover).difficulty))}
              </span>
            </div>
          )}
          {!hovered && !hoverNext && (
            <div className={m.hoverTipRow}>
              <span className={m.hoverTipLabel}>
                {hover >= model.nextEpoch - 1 + lead ? 'A window can start here' : 'Too soon for a window'}
              </span>
            </div>
          )}
          {onPick && hover >= model.nextEpoch - 1 + lead && (
            <div className={m.hoverTipRow}>
              <span className={m.hoverTipLabel}>Click to use as the window start</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The book as a ladder: margin on offer by where its strike sits against the next epoch's difficulty. Above
 * the axis are offers you take the long side of, below it those you take short.
 *
 * Both halves are LIT of margin on one scale, so a bar twice as tall is twice the size. Clicking a column
 * filters the book to it.
 */
export function StrikeLadder({ bins, show, selected, onSelect, height = 200, width = 760 }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;
  const W = width;

  const model = useMemo(() => {
    const top = bins.reduce((a, b) => {
      const l = show.long ? b.long : 0n;
      const sh = show.short ? b.short : 0n;
      return [l, sh, a].reduce((x, y) => (y > x ? y : x), 0n);
    }, 0n);
    if (top === 0n) return null;
    const labels = [fmtLit(top, 0), '0', fmtLit(top, 0)];
    const padL = gutter(labels);
    const innerW = W - padL - PAD.r;
    const mid = PAD.t + (H - PAD.t - PAD.b) / 2;
    const half = (H - PAD.t - PAD.b) / 2 - 4;
    const bw = innerW / bins.length;
    const scale = (v) => (Number((v * 1_000_000n) / top) / 1_000_000) * half;
    return { padL, innerW, mid, half, bw, scale, top };
  }, [bins, show, H, W]);

  if (!model) return <div className={m.empty}>No open offers match.</div>;

  const onMove = (ev) => {
    const vx = toViewX(svgRef.current, ev.clientX);
    if (vx == null) return;
    const i = Math.floor((vx - model.padL) / model.bw);
    setHover(i >= 0 && i < bins.length ? i : null);
  };
  const tipLeft = hover == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, model.padL + (hover + 0.5) * model.bw, 210);
  const zeroIndex = bins.findIndex((b) => b.from <= 0 && b.to > 0);

  return (
    <div className={m.chartBox} ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={m.chart}
        style={{ height: 'auto', cursor: 'pointer' }}
        role="img"
        aria-label="Margin on offer by strike against the next epoch's difficulty"
        onMouseMove={onMove}
        onClick={() => hover != null && onSelect(selected === hover ? null : hover)}
      >
        {[
          { y: model.mid - model.half, label: fmtLit(model.top, 0) },
          { y: model.mid, label: '0' },
          { y: model.mid + model.half, label: fmtLit(model.top, 0) },
        ].map((t, i) => (
          <g key={i}>
            <line
              x1={model.padL}
              y1={t.y}
              x2={W - PAD.r}
              y2={t.y}
              stroke={i === 1 ? 'rgba(125,211,252,0.22)' : 'rgba(56,189,248,0.08)'}
            />
            <text x={model.padL - 8} y={t.y + 3.2} className={m.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        <text x={model.padL + 4} y={PAD.t + 9} className={s.ladderSideText} style={{ fill: COLORS.long }}>
          you go long
        </text>
        <text x={model.padL + 4} y={H - PAD.b - 3} className={s.ladderSideText} style={{ fill: COLORS.short }}>
          you go short
        </text>

        {zeroIndex >= 0 && (
          <line
            x1={model.padL + (zeroIndex + 0.5) * model.bw}
            y1={PAD.t}
            x2={model.padL + (zeroIndex + 0.5) * model.bw}
            y2={H - PAD.b}
            stroke={COLORS.next}
            strokeOpacity="0.55"
            strokeDasharray="3 3"
          />
        )}

        {bins.map((b, i) => {
          const x = model.padL + i * model.bw + 1;
          const w = Math.max(1, model.bw - 2);
          const dim = selected != null && selected !== i;
          const up = show.long ? model.scale(b.long) : 0;
          const down = show.short ? model.scale(b.short) : 0;
          return (
            <g key={i} opacity={dim ? 0.3 : hover == null || hover === i ? 1 : 0.7}>
              {up > 0 && <rect x={x} y={model.mid - up} width={w} height={up} rx="2" fill={COLORS.long} fillOpacity="0.8" />}
              {down > 0 && <rect x={x} y={model.mid} width={w} height={down} rx="2" fill={COLORS.short} fillOpacity="0.8" />}
              {selected === i && (
                <rect
                  x={x - 1}
                  y={PAD.t}
                  width={w + 2}
                  height={H - PAD.t - PAD.b}
                  fill="none"
                  stroke="rgba(125,211,252,0.5)"
                  rx="3"
                />
              )}
            </g>
          );
        })}

        {bins.map((b, i) =>
          i % 2 === 0 ? (
            <text key={i} x={model.padL + (i + 0.5) * model.bw} y={H - 9} className={m.axisText} textAnchor="middle">
              {b.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover != null && (
        <div className={m.hoverTip} style={{ left: `${tipLeft}px` }}>
          <div className={m.hoverTipLabel}>Strike {bins[hover].range} vs next epoch</div>
          <div className={m.hoverTipRow}>
            <span className={m.hoverSwatch} style={{ background: COLORS.long }} />
            <span className={m.hoverTipLabel}>You go long</span>
            <span className={m.hoverTipValue}>
              {fmtLit(bins[hover].long, 0)} LIT · {bins[hover].longCount}
            </span>
          </div>
          <div className={m.hoverTipRow}>
            <span className={m.hoverSwatch} style={{ background: COLORS.short }} />
            <span className={m.hoverTipLabel}>You go short</span>
            <span className={m.hoverTipValue}>
              {fmtLit(bins[hover].short, 0)} LIT · {bins[hover].shortCount}
            </span>
          </div>
          <div className={m.hoverTipRow}>
            <span className={m.hoverTipLabel}>{selected === hover ? 'Click to clear the filter' : 'Click to filter the book'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What one side gains or pays against where the window's mean lands, before the rewards each side
 * puts in. The payout is linear in the move and stops at the margin, a 20% move either way.
 *
 * @param marks vertical markers, `{ move, label, color }`, where `move` is a mean against the strike
 */
export function PayoutCurve({ long, strike, notional, marks = [], height = 210, span = 0.3 }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;
  const k = big(strike);
  const n = big(notional);

  const model = useMemo(() => {
    if (k <= 0n || n <= 0n) return null;
    const cap = n / 5n;
    const top = Number(cap) * 1.15;
    const capLabel = fmtLit(cap, 0);
    const padL = gutter([`+${capLabel}`, `-${capLabel}`]);
    const innerW = W - padL - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const x = (mv) => padL + ((mv + span) / (2 * span)) * innerW;
    const y = (v) => PAD.t + innerH / 2 - (v / top) * (innerH / 2);
    const steps = 120;
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const mv = -span + (2 * span * i) / steps;
      const mean = (k * BigInt(Math.round((1 + mv) * 1e9))) / 1_000_000_000n;
      const p = payoutAt(mean, k, n);
      return { mv, v: Number(long ? p : -p) };
    });
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.mv).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const zeroY = y(0);
    const area = `${line} L${x(span).toFixed(1)},${zeroY} L${x(-span).toFixed(1)},${zeroY} Z`;
    return { padL, innerW, innerH, x, y, line, area, zeroY, cap, capLabel };
  }, [k, n, long, span, H]);

  if (!model) return <div className={m.empty}>Enter a strike and a margin to see the payout.</div>;

  const onMove = (ev) => {
    const vx = toViewX(svgRef.current, ev.clientX);
    if (vx == null) return;
    const mv = ((vx - model.padL) / model.innerW) * 2 * span - span;
    setHover(mv >= -span && mv <= span ? mv : null);
  };
  const hoverPayout =
    hover == null ? null : (long ? 1n : -1n) * payoutAt((k * BigInt(Math.round((1 + hover) * 1e9))) / 1_000_000_000n, k, n);
  const tipLeft = hover == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, model.x(hover), 200);
  const clipId = `extPayClip${long ? 'L' : 'S'}`;

  return (
    <div className={m.chartBox} ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={m.chart}
        style={{ height: H }}
        role="img"
        aria-label={`Payout to the ${long ? 'long' : 'short'} side against the window's mean`}
        onMouseMove={onMove}
      >
        <defs>
          <clipPath id={`${clipId}Up`}>
            <rect x="0" y="0" width={W} height={model.zeroY} />
          </clipPath>
          <clipPath id={`${clipId}Down`}>
            <rect x="0" y={model.zeroY} width={W} height={H - model.zeroY} />
          </clipPath>
        </defs>
        {[
          { y: model.y(Number(model.cap)), label: `+${model.capLabel}` },
          { y: model.zeroY, label: '0' },
          { y: model.y(-Number(model.cap)), label: `-${model.capLabel}` },
        ].map((t, i) => (
          <g key={i}>
            <line
              x1={model.padL}
              y1={t.y}
              x2={W - PAD.r}
              y2={t.y}
              stroke={i === 1 ? 'rgba(125,211,252,0.22)' : 'rgba(56,189,248,0.08)'}
              strokeDasharray={i === 1 ? undefined : '4 3'}
            />
            <text x={model.padL - 8} y={t.y + 3.2} className={m.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        <path d={model.area} fill={COLORS.gain} fillOpacity="0.16" clipPath={`url(#${clipId}Up)`} />
        <path d={model.area} fill={COLORS.loss} fillOpacity="0.14" clipPath={`url(#${clipId}Down)`} />
        <path d={model.line} fill="none" stroke={long ? COLORS.long : COLORS.short} strokeWidth="2" />

        {marks
          .filter((mk) => mk.move != null && Math.abs(mk.move) <= span)
          .map((mk, i) => (
            <g key={i}>
              <line
                x1={model.x(mk.move)}
                y1={PAD.t}
                x2={model.x(mk.move)}
                y2={H - PAD.b}
                stroke={mk.color}
                strokeOpacity="0.7"
                strokeDasharray="3 3"
              />
              <text x={model.x(mk.move) + 4} y={PAD.t + 10 + i * 12} className={s.bandText} style={{ fill: mk.color }}>
                {mk.label}
              </text>
            </g>
          ))}

        {[-span, -0.2, -0.1, 0, 0.1, 0.2, span].map((mv) => (
          <text key={mv} x={model.x(mv)} y={H - 9} className={m.axisText} textAnchor="middle">
            {mv === 0 ? 'strike' : fmtMove(mv, 0)}
          </text>
        ))}
        {hover != null && <line x1={model.x(hover)} y1={PAD.t} x2={model.x(hover)} y2={H - PAD.b} className={m.cursorLine} />}
      </svg>
      {hover != null && (
        <div className={m.hoverTip} style={{ left: `${tipLeft}px` }}>
          <div className={m.hoverTipLabel}>Window mean {fmtMove(hover, 1)} vs strike</div>
          <div className={m.hoverTipRow}>
            <span className={m.hoverSwatch} style={{ background: hoverPayout >= 0n ? COLORS.gain : COLORS.loss }} />
            <span className={m.hoverTipLabel}>{long ? 'Long' : 'Short'} receives</span>
            <span className={m.hoverTipValue}>{fmtLitSigned(hoverPayout)} LIT</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Realized net over time, one step per settlement. */
export function CumulativeLine({ points, height = 170, width = 760 }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;
  const W = width;

  const model = useMemo(() => {
    if (points.length === 0) return null;
    let run = 0n;
    const steps = points.map((p) => {
      run += big(p.net);
      return { ...p, total: run };
    });
    const vals = steps.map((p) => Number(p.total));
    const hi = Math.max(0, ...vals);
    const lo = Math.min(0, ...vals);
    const span = hi - lo || 1;
    const top = hi + span * 0.12;
    const bottom = lo - span * 0.12;
    const labels = FRACTIONS.map((f) => fmtLitSigned(BigInt(Math.round(bottom + (top - bottom) * f)), 0));
    const padL = gutter(labels);
    const innerW = W - padL - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const t0 = Number(steps[0].t);
    const t1 = Math.max(t0 + 1, Number(steps[steps.length - 1].t));
    const x = (t) => padL + ((Number(t) - t0) / (t1 - t0)) * innerW;
    const y = (v) => PAD.t + innerH - ((v - bottom) / (top - bottom)) * innerH;
    let d = `M${padL},${y(0)}`;
    steps.forEach((p) => {
      d += ` H${x(p.t).toFixed(1)} V${y(Number(p.total)).toFixed(1)}`;
    });
    d += ` H${W - PAD.r}`;
    return {
      steps,
      d,
      x,
      y,
      padL,
      ticks: FRACTIONS.map((f, i) => ({ y: y(bottom + (top - bottom) * f), label: labels[i] })),
      zeroY: y(0),
    };
  }, [points, H, W]);

  if (!model) return <div className={m.empty}>Nothing settled yet.</div>;

  const onMove = (ev) => {
    const vx = toViewX(svgRef.current, ev.clientX);
    if (vx == null) return;
    let best = null;
    model.steps.forEach((p, i) => {
      if (best == null || Math.abs(model.x(p.t) - vx) < Math.abs(model.x(model.steps[best].t) - vx)) best = i;
    });
    setHover(best);
  };
  const last = model.steps[model.steps.length - 1].total;
  const active = hover == null ? null : model.steps[hover];
  const tipLeft = active == null ? 0 : tipLeftFor(svgRef.current, wrapRef.current, model.x(active.t), 220);

  return (
    <div className={m.chartBox} ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={m.chart} style={{ height: 'auto' }} role="img"
        aria-label="Realized net over time" onMouseMove={onMove}>
        <Gridlines ticks={model.ticks} left={model.padL} right={W - PAD.r} />
        <line x1={model.padL} y1={model.zeroY} x2={W - PAD.r} y2={model.zeroY} stroke="rgba(125,211,252,0.22)" />
        <path d={model.d} fill="none" stroke={last >= 0n ? COLORS.gain : COLORS.loss} strokeWidth="2" />
        {model.steps.map((p, i) => (
          <circle key={i} cx={model.x(p.t)} cy={model.y(Number(p.total))} r={hover === i ? 4 : 2.5}
            fill={big(p.net) >= 0n ? COLORS.gain : COLORS.loss} />
        ))}
      </svg>
      {active && (
        <div className={m.hoverTip} style={{ left: `${tipLeft}px` }}>
          <div className={m.hoverTipLabel}>{new Date(Number(active.t)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {active.label}</div>
          <div className={m.hoverTipRow}>
            <span className={m.hoverTipLabel}>This settlement</span>
            <span className={m.hoverTipValue}>{fmtLitSigned(active.net)} LIT</span>
          </div>
          <div className={m.hoverTipRow}>
            <span className={m.hoverTipLabel}>Running total</span>
            <span className={m.hoverTipValue}>{fmtLitSigned(active.total)} LIT</span>
          </div>
        </div>
      )}
    </div>
  );
}
