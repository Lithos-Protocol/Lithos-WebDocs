import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import { big, fmtErgAmount, fmtInt, shortId } from './format';
import { Alert, Spinner } from './ui';
import { BID, BID_DIM, BREAK_EVEN_NANO } from './feeMarket';

const W = 520;
const H = 230;
const PAD = { t: 18, r: 14, b: 28, l: 58 };

/**
 * One side of the book.
 *
 * Both sides share a y-scale supplied by the caller, so a glance across them
 * compares like with like — a queued bid twice the height of a live one really is
 * twice the bid. Bars are a single series (every column is a bid), so they take one
 * colour; shading them by height would burn the only free channel restating the
 * height the reader can already see.
 */
function BidBars({ rows, maxBid, title, subtitle, xLabel, emptyNote }) {
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const geom = useMemo(() => {
    if (!rows.length || maxBid === 0n) return null;
    const slot = inner.w / rows.length;
    // Thin marks with a real gap, and never thinner than a hairline however many
    // boxes are in the set.
    const barW = Math.max(1.5, Math.min(18, slot - 2));
    const y = (v) => {
      const frac = Number((big(v) * 1_000_000n) / maxBid) / 1_000_000;
      return PAD.t + inner.h - frac * inner.h;
    };
    return {
      slot,
      barW,
      y,
      xAt: (i) => PAD.l + i * slot + slot / 2,
      ticks: [0, 0.5, 1].map((f) => ({
        y: PAD.t + inner.h - f * inner.h,
        label: fmtErgAmount((maxBid * BigInt(Math.round(f * 1000))) / 1000n, 4),
      })),
    };
  }, [rows, maxBid, inner.w, inner.h]);

  const onMove = (e) => {
    if (!geom || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((mx - PAD.l) / geom.slot);
    setHover(i >= 0 && i < rows.length ? i : null);
  };

  const breakEvenY = geom && maxBid >= BREAK_EVEN_NANO ? geom.y(BREAK_EVEN_NANO) : null;

  /*
   * This side is entirely at the floor while the other side is bidding, so the
   * shared scale flattens it onto the baseline. That is the correct picture and a
   * useful one — but an axis over an empty plot reads as a chart that failed, so
   * it gets said in words on top of it.
   */
  const allFloor = geom !== null && rows.every((r) => r.bid === 0n);

  return (
    <div className={s.cmBookSide}>
      <div className={s.cmBookHead}>
        <span className={s.cmBookTitle}>{title}</span>
        <span className={s.cmBookCount}>{subtitle}</span>
      </div>

      {!geom ? (
        <div className={s.cmBookEmpty}>{emptyNote}</div>
      ) : (
        <div
          className={s.chartWrap}
          ref={wrapRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ position: 'relative' }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label={title}>
            {geom.ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={PAD.l}
                  y1={t.y}
                  x2={W - PAD.r}
                  y2={t.y}
                  stroke="rgba(125,211,252,0.09)"
                  strokeWidth="1"
                />
                <text x={PAD.l - 8} y={t.y + 3.5} className={s.axisText} textAnchor="end">
                  {t.label}
                </text>
              </g>
            ))}

            {/* Dashed ONLY here: this is a threshold, not a gridline. Above it the
                coinbase stops covering the lender's principal. */}
            {breakEvenY !== null && (
              <g>
                <line
                  x1={PAD.l}
                  y1={breakEvenY}
                  x2={W - PAD.r}
                  y2={breakEvenY}
                  stroke="#d97706"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  opacity="0.75"
                />
                <text x={W - PAD.r} y={breakEvenY - 5} className={s.cmThresholdText} textAnchor="end">
                  break-even
                </text>
              </g>
            )}

            {rows.map((r, i) => {
              const top = geom.y(r.bid);
              const h = PAD.t + inner.h - top;
              return (
                <rect
                  key={r.boxId ?? i}
                  x={geom.xAt(i) - geom.barW / 2}
                  y={h < 1.5 ? PAD.t + inner.h - 1.5 : top}
                  width={geom.barW}
                  height={Math.max(1.5, h)}
                  rx={geom.barW > 5 ? 2 : 0.75}
                  fill={hover === i ? BID_DIM : BID}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              );
            })}

            <line
              x1={PAD.l}
              y1={PAD.t + inner.h}
              x2={W - PAD.r}
              y2={PAD.t + inner.h}
              stroke="rgba(125,211,252,0.18)"
              strokeWidth="1"
            />
            <text x={PAD.l + inner.w / 2} y={H - 8} className={s.axisText} textAnchor="middle">
              {xLabel}
            </text>

            {allFloor && (
              <text
                x={PAD.l + inner.w / 2}
                y={PAD.t + inner.h / 2}
                className={s.cmPlotNote}
                textAnchor="middle"
              >
                all {rows.length} at the floor: none bidding
              </text>
            )}
          </svg>

          {hover !== null &&
            (() => {
              const r = rows[hover];
              const rect = wrapRef.current?.getBoundingClientRect();
              const scale = rect ? rect.width / W : 1;
              const wrap = rect?.width ?? W;
              const at = geom.xAt(hover) * scale;
              // Flips to the left of the cursor past halfway, so a wide card never
              // reaches past the plot and scrolls the wrapper.
              const anchorRight = at > wrap / 2;
              return (
                <div
                  className={s.hoverTip}
                  style={
                    anchorRight
                      ? { right: `${Math.max(4, wrap - at + 12)}px` }
                      : { left: `${Math.max(4, at + 12)}px` }
                  }
                >
                  <div className={s.cmTipBid}>{fmtErgAmount(r.bid, 6)} ERG</div>
                  <div className={s.cmTipMeta}>{r.caption}</div>
                  <div className={s.cmTipMeta} title={r.boxId}>
                    {shortId(r.boxId, 8, 6)}
                  </div>
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}

/** A headline figure with its own supporting line. */
function Kpi({ label, value, unit, sub, accent = false, muted = false }) {
  return (
    <div className={s.stat}>
      <div className={s.statLabel}>{label}</div>
      <div
        className={`${s.statValue} ${accent ? s.statValueCyan : ''} ${muted ? s.statValueSoft : ''}`}
      >
        {value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      <div className={s.statSub}>{sub}</div>
    </div>
  );
}

export default function FeeBookPanel({ stats, statsError, loading, settled }) {
  const { tick } = useCollateral();
  const [active, setActive] = useState(null);
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, q] = await Promise.all([
        api.getActive({ limit: 100 }),
        api.getQueue({ limit: 100 }),
      ]);
      setActive(a ?? []);
      setQueue(q ?? []);
      setError(null);
    } catch (e) {
      setActive(null);
      setQueue(null);
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, tick]);

  const fees = stats?.fees;

  // Live boxes rank by what they pay, because that is the order a miner takes
  // them in. Queued boxes keep their queue position: the protocol activates them
  // strictly first-in-first-out, so position IS the forward axis and no drain-rate
  // estimate is needed to draw it.
  const liveRows = useMemo(
    () =>
      (active ?? [])
        .map((b) => ({
          boxId: b.boxId,
          bid: big(b.priorityFeeNanoErgs ?? '0'),
          caption: `${fmtErgAmount(b.valueNanoErgs, 3)} ERG box`,
        }))
        .sort((x, y) => (y.bid > x.bid ? 1 : y.bid < x.bid ? -1 : 0)),
    [active],
  );

  const queuedRows = useMemo(
    () =>
      (queue ?? [])
        .map((b) => ({
          boxId: b.boxId,
          bid: big(b.priorityFeeNanoErgs ?? '0'),
          caption: `position #${fmtInt(b.position)}`,
        }))
        .sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0)),
    [queue],
  );

  const maxBid = useMemo(() => {
    const all = [...liveRows, ...queuedRows].map((r) => r.bid);
    return all.reduce((a, b) => (b > a ? b : a), 0n);
  }, [liveRows, queuedRows]);

  const bidding = fees ? Number(fees.bidding ?? 0) : 0;
  const observed = fees ? bidding + Number(fees.atFloor ?? 0) : 0;
  const best = fees ? big(fees.bestNanoErg ?? '0') : 0n;
  const basis = settled != null && fees ? best - settled : null;

  return (
    <>
      <div className={s.stats}>
        <Kpi
          label="Best live bid"
          value={loading && !fees ? '—' : fmtErgAmount(best, 4)}
          unit="ERG"
          accent
          sub={
            fees
              ? `${fmtInt(bidding)} of ${fmtInt(observed)} live boxes bidding`
              : 'waiting for the client…'
          }
        />
        <Kpi
          label="Median bid"
          value={fees ? fmtErgAmount(fees.medianNanoErg, 4) : '—'}
          unit="ERG"
          muted
          sub={fees ? `90th percentile ${fmtErgAmount(fees.p90NanoErg, 4)} ERG` : 'across every live box'}
        />
        <Kpi
          label="Settled per block"
          value={settled == null ? '—' : fmtErgAmount(settled, 4)}
          unit="ERG"
          sub={settled == null ? 'no Lithos blocks sampled yet' : 'average bid paid out'}
        />
        <Kpi
          label="Basis"
          value={basis == null ? '—' : `${basis > 0n ? '+' : ''}${fmtErgAmount(basis, 4)}`}
          unit={basis == null ? '' : 'ERG'}
          sub={
            basis == null
              ? 'needs a settled block to compare'
              : basis > 0n
                ? 'Above average settlement'
                : basis < 0n
                  ? 'Below average settlement'
                  : 'At average settlement'
          }
        />
      </div>

      <div className={s.card}>
        <h3 className={s.cardTitle}>The book</h3>
        <p className={s.cardDesc}>
          A miner spends whichever collateral box pays it most, so these bids are an order book.
          On the left is what a miner can take right now; on the right is what the queue will
          release, in the order the protocol activates it. Boxes past a certain age may be
          prioritized in order to ensure proper clearance.
        </p>

        {statsError && (
          <Alert kind="error" title="Could not read the bid book">
            {statsError}
          </Alert>
        )}
        {error && (
          <Alert kind="error" title="Could not list the boxes behind it">
            {error}
          </Alert>
        )}

        {!active && !error ? (
          <div className={s.empty}>
            <Spinner /> Reading the book…
          </div>
        ) : (
          <div className={s.cmBook}>
            <BidBars
              rows={liveRows}
              maxBid={maxBid}
              title="Live"
              subtitle={`${fmtInt(liveRows.length)} spendable now`}
              xLabel="boxes, best bid first"
              emptyNote={
                liveRows.length === 0
                  ? 'No live collateral boxes.'
                  : `None of the ${fmtInt(liveRows.length)} live boxes have posted a bid.`
              }
            />
            <BidBars
              rows={queuedRows}
              maxBid={maxBid}
              title="Queued"
              subtitle={`${fmtInt(queuedRows.length)} waiting`}
              xLabel="queue position, head first"
              emptyNote={
                queuedRows.length === 0
                  ? 'Nothing waiting in the queue.'
                  : `None of the ${fmtInt(queuedRows.length)} queued positions have posted a bid yet.`
              }
            />
          </div>
        )}

        {fees && Number(fees.unreadable ?? 0) > 0 && (
          <Alert kind="warn" title="Some boxes are missing from the distribution">
            {fmtInt(fees.unreadable)} live box
            {Number(fees.unreadable) === 1 ? '' : 'es'} carries a fee channel this client could not
            read, so the inventory counts more boxes than the bids below do.
          </Alert>
        )}

        {/* The a11y counterpart to the bars: exact counts, and the bands the client
            reports rather than ones re-derived here. */}
        {fees?.buckets?.length > 0 && (
          <div className={s.cmBandTable}>
            {/* The count column is right-aligned in the body, so its heading has to
                be too or the two sit at opposite ends of a 58px column. */}
            <div className={`${s.cmBandRow} ${s.cmBandHead}`}>
              <span>Bid</span>
              <span className={s.cmBandHeadCount}>Boxes</span>
              <span>Share</span>
            </div>
            {fees.buckets.map((b, i) => {
              const n = Number(b.boxes ?? 0);
              const pct = observed > 0 ? (n / observed) * 100 : 0;
              const from = big(b.fromNanoErg);
              // The lowest bidding band starts at a single nanoERG, which formats as
              // "< 0.0001" and reads as a bound rather than a floor. Only its top
              // edge is worth showing.
              const label =
                from === 0n
                  ? 'Floor — no bid'
                  : !b.toNanoErg
                    ? `above ${fmtErgAmount(from, 4)}`
                    : from <= 1n
                      ? `up to ${fmtErgAmount(b.toNanoErg, 4)}`
                      : `${fmtErgAmount(from, 4)} – ${fmtErgAmount(b.toNanoErg, 4)}`;
              return (
                <div className={s.cmBandRow} key={i}>
                  <span className={s.cmBandLabel}>
                    {label}
                    {!b.toNanoErg && <span className={s.cmBandNote}>past break-even</span>}
                  </span>
                  <span className={s.cmBandCount}>{fmtInt(n)}</span>
                  <span className={s.cmBandBarCell}>
                    <span className={s.cmBandTrack}>
                      <span
                        className={s.cmBandBar}
                        style={{ width: `${Math.max(pct, n > 0 ? 2 : 0)}%` }}
                      />
                    </span>
                    <span className={s.cmBandPct}>{pct.toFixed(0)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
