import React, { useState, useEffect, useMemo, useRef } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErg, fmtToken, fmtInt, fmtUnits, big, shortId } from './format';
import { Alert, Spinner, Row } from './ui';

const W = 760;
const H = 260;
const PAD = { t: 16, r: 16, b: 30, l: 64 };

/** Cumulative-fee area chart. Values are BigInt raw units scaled by `decimals`. */
function Chart({ points, decimals, color, colorDim, label, unit }) {
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
  // Hooks run before the early return below, so their order stays stable while
  // the series is still loading.
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const { path, area, ticks, xTicks, max, xAt, yAt } = useMemo(() => {
    const none = { path: '', area: '', ticks: [], xTicks: [], max: 0n, xAt: () => 0, yAt: () => 0 };
    if (!points?.length) return none;

    const vals = points.map((p) => big(p.value));
    const maxV = vals.reduce((a, b) => (b > a ? b : a), 0n);
    if (maxV === 0n) return none;

    // Scale through a fixed-point ratio so BigInt never round-trips via Number.
    const y = (v) => {
      const frac = Number((big(v) * 1_000_000n) / maxV) / 1_000_000;
      return PAD.t + inner.h - frac * inner.h;
    };
    const x = (i) => PAD.l + (i / Math.max(1, points.length - 1)) * inner.w;

    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ');
    const a = `${d} L${x(points.length - 1).toFixed(1)},${PAD.t + inner.h} L${PAD.l},${
      PAD.t + inner.h
    } Z`;

    // Fee totals are often fractions of an ERG, where a fixed 2dp axis renders
    // every tick as "0". Scale the precision to the magnitude being plotted.
    const maxDisplay = Number(maxV) / 10 ** decimals;
    const tickDp = maxDisplay >= 100 ? 2 : maxDisplay >= 1 ? 4 : 6;

    const tk = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: PAD.t + inner.h - f * inner.h,
      label: fmtUnits((maxV * BigInt(Math.round(f * 1000))) / 1000n, decimals, tickDp),
    }));

    const step = Math.max(1, Math.floor(points.length / 5));
    const xt = points
      .map((p, i) => ({ i, p }))
      .filter(({ i }) => i % step === 0 || i === points.length - 1)
      .map(({ i, p }) => ({ x: x(i), label: fmtInt(p.height) }));

    return { path: d, area: a, ticks: tk, xTicks: xt, max: maxV, xAt: x, yAt: y };
  }, [points, decimals, inner.w, inner.h]);

  /** Nearest bucket to the pointer, in viewBox units. */
  const onMove = (e) => {
    if (!wrapRef.current || !points?.length || max === 0n) {
      setHoverIdx(null);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    if (mx < PAD.l - 6 || mx > W - PAD.r + 6) {
      setHoverIdx(null);
      return;
    }
    const span = Math.max(1, points.length - 1);
    const i = Math.round(((mx - PAD.l) / inner.w) * span);
    setHoverIdx(Math.max(0, Math.min(points.length - 1, i)));
  };

  if (!points?.length || max === 0n) {
    return <div className={s.empty}>No fee history in this range.</div>;
  }

  const gid = `grad-${label.replace(/\W/g, '')}`;
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div
      className={`${s.chartWrap} ${s.chartBox}`}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={s.chart}
        role="img"
        aria-label={`${label} over time`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              y1={t.y}
              x2={W - PAD.r}
              y2={t.y}
              stroke="rgba(56,189,248,0.08)"
              strokeWidth="1"
            />
            <text x={PAD.l - 10} y={t.y + 3.5} className={s.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}

        {xTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 10} className={s.axisText} textAnchor="middle">
            {t.label}
          </text>
        ))}

        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle
          cx={PAD.l + inner.w}
          cy={
            PAD.t +
            inner.h -
            (Number((big(points[points.length - 1].value) * 1_000_000n) / max) / 1_000_000) *
              inner.h
          }
          r="3.5"
          fill={colorDim}
          stroke={color}
          strokeWidth="1.5"
        />

        {hovered && (
          <g pointerEvents="none">
            <line
              className={s.cursorLine}
              x1={xAt(hoverIdx)}
              y1={PAD.t}
              x2={xAt(hoverIdx)}
              y2={PAD.t + inner.h}
            />
            <circle
              cx={xAt(hoverIdx)}
              cy={yAt(hovered.value)}
              r="5"
              fill={color}
              stroke="#0a0f1e"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>

      {hovered &&
        (() => {
          const rect = wrapRef.current?.getBoundingClientRect();
          const scale = rect ? rect.width / W : 1;
          // Keep the card inside the plot however close to the right edge the
          // pointer gets.
          const left = Math.min(
            Math.max(xAt(hoverIdx) * scale + 14, 8),
            Math.max(8, (rect?.width ?? 400) - 190),
          );
          return (
            <div className={s.hoverTip} style={{ left: `${left}px` }}>
              <div>block {fmtInt(hovered.height)}</div>
              <div>
                <span className={s.hoverTipLabel}>total </span>
                <span className={s.hoverTipCyan}>
                  {fmtUnits(hovered.value, decimals, decimals > 0 ? 4 : 0)} {unit}
                </span>
              </div>
              {hovered.period != null && (
                <div>
                  <span className={s.hoverTipLabel}>this period </span>
                  <span className={s.hoverTipPurple}>
                    {fmtUnits(hovered.period, decimals, decimals > 0 ? 4 : 0)} {unit}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}

export default function FeeHistoryPanel() {
  const { pool, tick } = useDex();
  const [scope, setScope] = useState('pool');
  const [asset, setAsset] = useState('erg');
  const [provisions, setProvisions] = useState([]);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [partial, setPartial] = useState(false);

  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  useEffect(() => {
    api
      .listProvisions()
      .then((r) => setProvisions(r.provisions ?? []))
      .catch(() => setProvisions([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    // `bucket` is a block count, not a number of buckets — 720 blocks ≈ a day.
    const p =
      scope === 'pool'
        ? api.getFeeHistory({ bucket: 720 })
        : api.getProvisionFeeHistory(scope, { bucket: 720 });
    p.then((r) => {
      if (!alive) return;
      setHistory(r.history ?? []);
      setPartial(!!r.partial);
    })
      .catch((e) => {
        if (alive) {
          setHistory([]);
          setError(e.message);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scope, tick]);

  const isErg = asset === 'erg';
  const points = (history ?? []).map((h) => ({
    height: h.height,
    value: isErg ? h.cumulativeX : h.cumulativeY,
    // Carried for the hover readout: the running total says where the curve
    // is, the per-bucket figure says what that step was worth.
    period: isErg ? h.periodX : h.periodY,
  }));

  const last = history?.length ? history[history.length - 1] : null;
  const first = history?.length ? history[0] : null;

  const bestPeriod = (history ?? []).reduce((a, h) => {
    const v = big(isErg ? h.periodX : h.periodY);
    return v > a ? v : a;
  }, 0n);

  const avgPeriod = history?.length
    ? (history ?? []).reduce((a, h) => a + big(isErg ? h.periodX : h.periodY), 0n) /
      BigInt(history.length)
    : 0n;

  const fmt = (v) => (isErg ? fmtErg(v, 4) : fmtToken(v, dec, 4));
  const unit = isErg ? 'ERG' : name;

  return (
    <>
      <div className={s.card}>
        <h3 className={s.cardTitle}>Accumulated permanent fees</h3>
        <p className={s.cardDesc}>
          Cumulative permanent fees earned over time. Pool scope shows the total taken by every
          provider combined; selecting a provision shows just that box's share.
        </p>

        <div className={s.chips} style={{ marginBottom: '0.6rem' }}>
          <span className={s.fieldLabel} style={{ alignSelf: 'center', marginRight: '0.35rem' }}>
            Scope
          </span>
          <button
            className={`${s.chip} ${scope === 'pool' ? s.chipActive : ''}`}
            onClick={() => setScope('pool')}
          >
            Whole pool
          </button>
          {provisions.map((p) => (
            <button
              key={p.boxId}
              className={`${s.chip} ${scope === p.boxId ? s.chipActive : ''}`}
              onClick={() => setScope(p.boxId)}
            >
              {shortId(p.boxId, 6, 4)}
            </button>
          ))}
        </div>

        <div className={s.chips} style={{ marginBottom: '1rem' }}>
          <span className={s.fieldLabel} style={{ alignSelf: 'center', marginRight: '0.35rem' }}>
            Asset
          </span>
          <button
            className={`${s.chip} ${isErg ? s.chipActive : ''}`}
            onClick={() => setAsset('erg')}
          >
            ERG
          </button>
          <button
            className={`${s.chip} ${!isErg ? s.chipActive : ''}`}
            onClick={() => setAsset('token')}
          >
            {name}
          </button>
        </div>

        {loading ? (
          <div className={s.empty}>
            <Spinner /> Loading history…
          </div>
        ) : error ? (
          <Alert kind="error" title="Could not load history">
            {error}
          </Alert>
        ) : (
          <Chart
            points={points}
            decimals={isErg ? 9 : dec}
            color={isErg ? '#38bdf8' : '#a855f7'}
            colorDim={isErg ? '#0a0f1e' : '#0a0f1e'}
            label={`cumulative ${unit}`}
            unit={unit}
          />
        )}
      </div>

      {!loading && !error && history?.length > 0 && (
        <div className={s.card} style={{ marginTop: '1.25rem' }}>
          <h3 className={s.cardTitle}>Summary</h3>
          <div className={s.summary} style={{ marginTop: 0 }}>
            <Row
              label={`Total accumulated (${unit})`}
              value={fmt(isErg ? last.cumulativeX : last.cumulativeY)}
              accent
            />
            <Row label={`Best period (${unit})`} value={fmt(bestPeriod)} />
            <Row label={`Average per period (${unit})`} value={fmt(avgPeriod)} />
            <Row label="Periods shown" value={fmtInt(history.length)} />
            <Row label="Range" value={`Block ${fmtInt(first.height)} → ${fmtInt(last.height)}`} />
            <Row label="Scope" value={scope === 'pool' ? 'Whole pool' : shortId(scope)} />
          </div>

          {partial && (
            <Alert kind="warn" title="Partial series">
              The index does not reach back to the pool's start, so this does not cover its whole
              life. The points shown are still exact.
            </Alert>
          )}

          <Alert kind="info">
            History is derived from the pool's accumulator series rather than estimated. A
            provision's curve is its share times the pool's movement since its entry.
          </Alert>
        </div>
      )}
    </>
  );
}
