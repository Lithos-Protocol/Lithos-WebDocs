import React, { useState, useEffect, useMemo, useRef } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import {
  fmtErg,
  fmtToken,
  fmtErgAmount,
  fmtTokenAmount,
  fmtNum,
  fmtPct,
  fmtInt,
  fmtAge,
  big,
  ratio,
} from './format';
import { Spinner, PartialTag, GearIcon } from './ui';

const RANGES = ['1H', '24H', '7D', '30D'];

const W = 620;
const H = 178;
/* Room for a labelled y-axis on the left and a row of x labels underneath. */
const PAD = { t: 12, r: 12, b: 26, l: 52 };

/** Short clock label for an x tick — the range decides how much detail earns its place. */
function timeLabel(ts, range) {
  const d = new Date(Number(ts));
  if (!Number.isFinite(d.getTime())) return '';
  if (range === '1H' || range === '24H') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Smoothed area chart: cyan stroke over a fading fill, with a rippling end dot. */
function PriceChart({ points, range, tokenName }) {
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const model = useMemo(() => {
    if (!points || points.length === 0) return null;
    /*
     * The pool price only moves when something trades against it, so a quiet
     * range legitimately returns a single observation. Drawing that as a flat
     * line across the range is what actually happened; refusing to draw it left
     * the card saying "no price history" on a day with a perfectly good price.
     */
    const series = points.length === 1 ? [points[0], points[0]] : points;
    const flat = points.length === 1;
    const vals = series.map((p) => p.price);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi === lo) {
      hi = lo * 1.001 + 1e-9;
      lo = lo * 0.999;
    }
    const pad = (hi - lo) * 0.18;
    // Headroom below the low point, but never past zero: a price cannot be
    // negative, so a negative axis tick is just wrong.
    lo = Math.max(0, lo - pad);
    hi += pad;

    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const x = (i) => PAD.l + (i / Math.max(1, series.length - 1)) * innerW;
    const y = (v) => PAD.t + innerH - ((v - lo) / (hi - lo)) * innerH;

    const pts = series.map((p, i) => [x(i), y(p.price)]);
    const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];

    // Catmull-Rom -> cubic Bezier, matching the flow-field smoothing.
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
    const last = pts[pts.length - 1];
    const baseline = PAD.t + innerH;

    // Five gridlines across the padded range; the price series rarely spans an
    // order of magnitude, so precision follows the magnitude on screen.
    const dp = hi >= 1000 ? 0 : hi >= 100 ? 1 : hi >= 1 ? 2 : 5;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: baseline - f * innerH,
      label: fmtNum(lo + (hi - lo) * f, dp),
    }));

    const step = Math.max(1, Math.floor((series.length - 1) / 4));
    const xTicks = (flat ? [series[0]] : series)
      .map((p, i) => ({ i, p }))
      .filter(({ i }) => i % step === 0 || i === series.length - 1)
      .map(({ i, p }) => ({
        x: x(i),
        label: p.timestamp != null ? timeLabel(p.timestamp, range) : fmtInt(p.height),
      }));

    return {
      line: d,
      area: `${d} L${last[0].toFixed(1)} ${baseline} L${pts[0][0].toFixed(1)} ${baseline} Z`,
      endX: last[0],
      endY: last[1],
      xAt: x,
      yAt: y,
      yTicks,
      xTicks,
      baseline,
      innerW,
      series,
      flat,
    };
  }, [points, range]);

  const onMove = (e) => {
    if (!wrapRef.current || !model) {
      setHoverIdx(null);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    if (mx < PAD.l - 6 || mx > W - PAD.r + 6) {
      setHoverIdx(null);
      return;
    }
    // Index into the drawn series, not the raw points: a flat range pads to two
    // entries so it has a line to draw, and the cursor has to agree with it.
    const n = model.series.length;
    const i = Math.round(((mx - PAD.l) / model.innerW) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  };

  if (!model) return <div className={s.empty}>No price history in this range yet.</div>;

  const hovered = hoverIdx != null ? model.series[hoverIdx] : null;

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
        style={{ height: H }}
        role="img"
        aria-label="Price history"
      >
        <defs>
          <linearGradient id="dexPriceArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".28" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {model.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              y1={t.y}
              x2={W - PAD.r}
              y2={t.y}
              stroke="rgba(56,189,248,0.08)"
              strokeWidth="1"
            />
            <text x={PAD.l - 8} y={t.y + 3.2} className={s.axisText} textAnchor="end">
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

        <path d={model.area} fill="url(#dexPriceArea)" />
        <path d={model.line} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        <circle cx={model.endX} cy={model.endY} r="4" fill="#e0f2fe" />
        <circle
          className={s.endDot}
          cx={model.endX}
          cy={model.endY}
          r="8"
          fill="none"
          stroke="#7dd3fc"
          strokeWidth="1.2"
          opacity=".7"
          style={{ transformOrigin: `${model.endX}px ${model.endY}px` }}
        />

        {hovered && (
          <g pointerEvents="none">
            <line
              className={s.cursorLine}
              x1={model.xAt(hoverIdx)}
              y1={PAD.t}
              x2={model.xAt(hoverIdx)}
              y2={model.baseline}
            />
            <circle
              cx={model.xAt(hoverIdx)}
              cy={model.yAt(hovered.price)}
              r="5"
              fill="#38bdf8"
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
          const left = Math.min(
            Math.max(model.xAt(hoverIdx) * scale + 14, 8),
            Math.max(8, (rect?.width ?? 400) - 170),
          );
          return (
            <div className={s.hoverTip} style={{ left: `${left}px` }}>
              <div>
                <span className={s.hoverTipCyan}>{fmtNum(hovered.price, 4)}</span>{' '}
                <span className={s.hoverTipLabel}>{tokenName} / ERG</span>
              </div>
              <div className={s.hoverTipLabel}>
                {hovered.timestamp != null
                  ? new Date(Number(hovered.timestamp)).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: false,
                    })
                  : `block ${fmtInt(hovered.height)}`}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function PriceCard() {
  const { pool, tick } = useDex();
  const [range, setRange] = useState('24H');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  // Spot straight off the reserves. The server already ends the series at the
  // current price, so this only has to agree with it — it is never used to
  // adjust the chart.
  const spot = pool
    ? ratio(big(pool.reservesY) * 10n ** 9n, big(pool.reservesX) * 10n ** BigInt(dec))
    : 0;

  // Re-read when the pool box moves: a new box id means a swap landed, so the
  // series has a new point on the end.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getPriceHistory({ range })
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range, pool?.utxoId, tick]);

  const up = (data?.changePct ?? 0) >= 0;

  return (
    <div className={s.priceCard}>
      <div className={s.priceHead}>
        <div>
          <div className={s.sectionLabel}>
            Price · {name} / ERG {data?.partial && <PartialTag />}
          </div>
          <div className={s.priceValue}>
            {spot ? fmtNum(spot, 4) : '—'}{' '}
            {data && (
              <span className={`${s.priceDelta} ${up ? s.priceDeltaUp : s.priceDeltaDown}`}>
                {up ? '+' : ''}
                {fmtPct(data.changePct, 1)}
              </span>
            )}
          </div>
        </div>
        <div className={s.rangePills}>
          {RANGES.map((r) => (
            <button
              key={r}
              className={`${s.rangePill} ${range === r ? s.rangePillActive : ''}`}
              onClick={() => setRange(r)}
              type="button"
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className={s.empty}>
          <Spinner /> Loading price…
        </div>
      ) : error ? (
        <div className={s.empty}>{error}</div>
      ) : (
        <PriceChart points={data?.history} range={range} tokenName={name} />
      )}
    </div>
  );
}

export function PoolCompositionCard() {
  const { pool, tick } = useDex();
  const [share, setShare] = useState(null);

  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  // "Your share" is real — sum of this wallet's provisions over supply.
  useEffect(() => {
    api
      .listProvisions()
      .then((r) =>
        setShare((r.provisions ?? []).reduce((a, p) => a + (Number(p.shareOfSupply) || 0), 0)),
      )
      .catch(() => setShare(null));
  }, [pool?.utxoId, tick]);

  if (!pool) return null;

  // Split the bar by each side's value at the current spot price, which makes a
  // balanced pool read as roughly 50/50 rather than by raw unit counts.
  const ergHuman = Number(big(pool.reservesX)) / 1e9;
  const spot = ratio(big(pool.reservesY) * 10n ** 9n, big(pool.reservesX) * 10n ** BigInt(dec));
  const tokHuman = Number(big(pool.reservesY)) / 10 ** dec;
  const tokInErg = spot > 0 ? tokHuman / spot : 0;
  const total = ergHuman + tokInErg;
  const ergPct = total > 0 ? (ergHuman / total) * 100 : 50;

  return (
    <div className={s.card}>
      <div className={s.sectionLabel} style={{ marginBottom: 14 }}>
        Pool composition
      </div>

      <div className={s.compRow}>
        <div className={s.compHead}>
          <span>ERG</span>
          <span className={s.compAmount}>{fmtErg(pool.reservesX, 2)}</span>
        </div>
        <div className={s.compTrack}>
          <div className={`${s.compFill} ${s.compFillErg}`} style={{ width: `${ergPct}%` }} />
        </div>
      </div>

      <div className={s.compRow}>
        <div className={s.compHead}>
          <span>{name}</span>
          <span className={s.compAmount}>{fmtToken(pool.reservesY, dec, 2)}</span>
        </div>
        <div className={s.compTrack}>
          <div className={`${s.compFill} ${s.compFillTok}`} style={{ width: `${100 - ergPct}%` }} />
        </div>
      </div>

      <div className={s.compFoot}>
        <span>Your share</span>
        <span className={s.compFootValue}>{share === null ? '—' : fmtPct(share, 2)}</span>
      </div>
    </div>
  );
}

/** How often the list re-reads. The mempool moves, and so do the ages shown. */
const ACTIVITY_POLL_MS = 30_000;

const KIND_LABEL = {
  SWAP: 'Swap',
  DEPOSIT: 'Deposit',
  REDEEM: 'Redeem',
  RESIZE: 'Resize',
  FLUSH: 'Flush',
};

/**
 * One activity entry's amounts, as a short line plus the full figures for its
 * tooltip. Swaps carry `amountIn`/`amountOut`; everything else `amountX`/`amountY`,
 * whose direction depends on the kind — added by a deposit, returned by a redeem,
 * either way by a resize (sign of `shares`), and moved to the vault by a flush.
 */
function describeActivity(a, dec, name) {
  const erg = (v) => fmtErgAmount(v, 4);
  const tok = (v) => fmtTokenAmount(v, dec, 4);
  if (a.type === 'SWAP') {
    const line = a.ergIn ? `${erg(a.amountIn)} ERG → ${name}` : `${tok(a.amountIn)} ${name} → ERG`;
    const full = a.ergIn
      ? `${fmtErg(a.amountIn, 9)} ERG in → ${fmtToken(a.amountOut, dec, dec)} ${name} out`
      : `${fmtToken(a.amountIn, dec, dec)} ${name} in → ${fmtErg(a.amountOut, 9)} ERG out`;
    return { line, full, tone: a.ergIn ? 'erg' : 'tok' };
  }
  const fullPair = `${fmtErg(a.amountX, 9)} ERG · ${fmtToken(a.amountY, dec, dec)} ${name}`;
  if (a.type === 'FLUSH') {
    return { line: `${erg(a.amountX)} ERG · ${tok(a.amountY)} ${name} → vault`, full: `${fullPair} moved to the vault` };
  }
  const shrinking = a.type === 'REDEEM' || (a.type === 'RESIZE' && big(a.shares) < 0n);
  const sign = shrinking ? '−' : '+';
  const sharesAbs = big(a.shares) < 0n ? -big(a.shares) : big(a.shares);
  return {
    // Signed on both sides: the pool always moves by a pair.
    line: `${sign}${erg(a.amountX)} ERG · ${sign}${tok(a.amountY)} ${name}`,
    full: `${shrinking ? 'Returned' : 'Added'} ${fullPair}${
      a.shares != null ? `, ${sign}${fmtInt(sharesAbs)} shares` : ''
    }`,
  };
}

function RecentActivityCard() {
  const { pool, tick, orders, ownOrderIds } = useDex();
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);
  // With auto-flush on, most blocks that carry orders end in a flush, which
  // would crowd out the trades. Hidden until asked for.
  const [showFlushes, setShowFlushes] = useState(false);
  // Ages are derived at render, so they need a clock to move them along.
  const [now, setNow] = useState(() => Date.now());
  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .getRecentActivity({ limit: 12 })
        .then((r) => {
          if (!alive) return;
          setActivity(r.activity ?? []);
          setError(null);
        })
        .catch((e) => {
          if (!alive) return;
          setActivity([]);
          setError(e.message);
        })
        .finally(() => alive && setNow(Date.now()));
    };
    load();
    // Unconfirmed entries appear and confirm without anything on this page
    // changing, so the card polls rather than waiting for a pool refresh.
    const id = setInterval(load, ACTIVITY_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pool?.utxoId, tick]);

  /*
   * Your own fills. While a fill is unconfirmed its order is FILLING and names the
   * spending transaction; once it confirms the order has left the list, so the
   * order box ids seen this session carry the match from there.
   */
  const fillingTxIds = new Set(
    (orders ?? []).filter((o) => o.status === 'FILLING' && o.spendingTxId).map((o) => o.spendingTxId),
  );
  const isOwn = (a) =>
    fillingTxIds.has(a.txId) || (a.orderBoxId != null && ownOrderIds?.has(a.orderBoxId));

  const flushCount = (activity ?? []).filter((a) => a.type === 'FLUSH').length;
  const rows = (activity ?? []).filter((a) => showFlushes || a.type !== 'FLUSH');

  return (
    <div className={s.card} style={{ paddingBottom: 10 }}>
      <div className={s.activityHead}>
        <div className={s.sectionLabel}>Recent activity</div>
        {flushCount > 0 && (
          <button
            type="button"
            className={`${s.chip} ${showFlushes ? s.chipActive : ''}`}
            style={{ marginTop: 0 }}
            onClick={() => setShowFlushes((v) => !v)}
          >
            {showFlushes ? 'Hide flushes' : `Show ${flushCount} flush${flushCount === 1 ? '' : 'es'}`}
          </button>
        )}
      </div>
      {activity === null ? (
        <div className={s.empty}>
          <Spinner />
        </div>
      ) : error ? (
        <div className={s.empty}>{error}</div>
      ) : rows.length === 0 ? (
        <div className={s.empty}>
          {activity.length ? 'Only flushes in this window.' : 'No recent activity.'}
        </div>
      ) : (
        <div className={s.swapList}>
          {rows.map((a, i) => {
            const d = describeActivity(a, dec, name);
            const own = isOwn(a);
            const mempool = a.status === 'MEMPOOL';
            return (
              <div
                key={a.txId ?? i}
                className={`${s.swapRow} ${s.activityRow} ${own ? s.activityRowOwn : ''}`}
                title={own ? 'Fills one of your orders' : undefined}
              >
                <span className={s.swapTx} title={a.txId}>
                  {a.txId ? a.txId.slice(0, 8) : '—'}
                </span>
                <span className={s.activityKind}>
                  <span className={`${s.activityType} ${s[`activityType${a.type}`] ?? ''}`}>
                    {KIND_LABEL[a.type] ?? a.type}
                  </span>
                  <span
                    className={`${s.viaBadge} ${a.via === 'ORDER' ? s.viaOrder : s.viaDirect}`}
                    title={
                      a.via === 'ORDER'
                        ? `Filled order ${a.orderBoxId ?? ''}`.trim()
                        : 'Spent the pool directly'
                    }
                  >
                    {a.via === 'ORDER' ? 'Order' : 'Direct'}
                  </span>
                </span>
                <span
                  className={`${s.swapAmount} ${
                    d.tone === 'erg' ? s.swapDirErg : d.tone === 'tok' ? s.swapDirTok : ''
                  }`}
                  title={d.full}
                >
                  {d.line}
                </span>
                {/* MEMPOOL entries can still be dropped or replaced — mark them
                    rather than leaving a blank where the height goes. */}
                {mempool ? (
                  <span
                    className={s.swapPending}
                    title="In the mempool: can still be dropped or replaced"
                  >
                    Unconfirmed
                  </span>
                ) : (
                  <span className={s.swapHeight}>{a.height != null ? fmtInt(a.height) : '—'}</span>
                )}
                {/* No timestamp on mempool entries — a dash is honest, "0s" is not. */}
                <span className={s.swapAge}>{mempool ? '—' : fmtAge(a.timestamp, now) ?? '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SwapAside() {
  const { toggleSettings, showSettings } = useDex();
  return (
    <div className={s.rightCol}>
      <div className={s.rightColHead}>
        <button
          className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
          onClick={toggleSettings}
          type="button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <GearIcon />
          {showSettings ? 'Close settings' : 'Settings'}
        </button>
      </div>
      <PriceCard />
      <RecentActivityCard />
    </div>
  );
}
