import React, { useMemo, useRef, useState } from 'react';
import s from './styles.module.css';
import { big, fmtErgAmount, fmtInt } from './format';
import { Alert, Spinner } from './ui';
import {
  BID,
  BID_DIM,
  BLOCK_REWARD_NANO,
  BREAK_EVEN_NANO,
  FEE,
  LEDGER_FIXED,
  LEDGER_VARIABLE,
  PRINCIPAL_FLOOR_NANO,
  affordableBid,
  bucketLabel,
  median,
  perBlock,
  sampledBuckets,
  sumKeys,
  totalOf,
  windowTotals,
} from './feeMarket';

/** Fixed legs and subtotals have no series colour of their own. */
const NEUTRAL_BAR = 'var(--cur-dim)';

const W = 760;
const H = 230;
const PAD = { t: 18, r: 18, b: 30, l: 66 };

/**
 * One per-block series over sampled days, with an optional reference line.
 *
 * Only buckets that actually contained a Lithos block are plotted. A day with no
 * block has no mean; drawing it at zero would assert the value WAS zero when
 * nothing was sampled at all, which is the difference the API's coverage fields
 * exist to preserve.
 *
 * The reference line shares the series' own axis rather than getting a second
 * one — two scales on one plot would invent a relationship between them.
 */
function SeriesChart({ points, reference, color, gradientId, ariaLabel, renderTip, flatNote }) {
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const peak = points.reduce((a, p) => (p.value > a ? p.value : a), reference?.value ?? 0n);
    if (peak === 0n) return null;
    const y = (v) => {
      const frac = Number((big(v) * 1_000_000n) / peak) / 1_000_000;
      return PAD.t + inner.h - frac * inner.h;
    };
    const x = (i) => PAD.l + (points.length === 1 ? inner.w / 2 : (i / (points.length - 1)) * inner.w);
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area =
      points.length === 1
        ? ''
        : `${line} L${x(points.length - 1).toFixed(1)},${PAD.t + inner.h} L${PAD.l},${PAD.t + inner.h} Z`;
    const step = Math.max(1, Math.floor(points.length / 5));
    return {
      y,
      x,
      line,
      area,
      ticks: [0, 0.5, 1].map((f) => ({
        y: PAD.t + inner.h - f * inner.h,
        label: fmtErgAmount((peak * BigInt(Math.round(f * 1000))) / 1000n, 4),
      })),
      xTicks: points
        .map((p, i) => ({ i, p }))
        .filter(({ i }) => i % step === 0 || i === points.length - 1)
        .map(({ i, p }) => ({ x: x(i), label: bucketLabel(p.start) })),
    };
  }, [points, reference, inner.w, inner.h]);

  // Every point is zero, so there is no axis to draw against. Saying that beats
  // returning nothing and leaving a gap where a chart plainly should be.
  if (!geom) return <div className={s.cmBookEmpty}>{flatNote}</div>;

  const onMove = (e) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    if (mx < PAD.l - 8 || mx > W - PAD.r + 8) return setHover(null);
    const span = Math.max(1, points.length - 1);
    const i = Math.round(((mx - PAD.l) / inner.w) * span);
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const refY = reference && reference.value > 0n ? geom.y(reference.value) : null;

  return (
    <div
      className={s.chartWrap}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      style={{ position: 'relative' }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {geom.ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="rgba(125,211,252,0.09)" strokeWidth="1" />
            <text x={PAD.l - 9} y={t.y + 3.5} className={s.axisText} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}

        {refY !== null && (
          <g>
            <line
              x1={PAD.l}
              y1={refY}
              x2={W - PAD.r}
              y2={refY}
              stroke={reference.color}
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.8"
            />
            <text
              x={W - PAD.r}
              y={refY - 5}
              className={s.cmThresholdText}
              style={{ fill: reference.color }}
              textAnchor="end"
            >
              {reference.label}
            </text>
          </g>
        )}

        {geom.area && <path d={geom.area} fill={`url(#${gradientId})`} />}
        <path d={geom.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={p.start}
            cx={geom.x(i)}
            cy={geom.y(p.value)}
            r={hover === i ? 5 : points.length > 40 ? 0 : 3}
            fill={color}
            stroke="#0a0f1e"
            strokeWidth="1.5"
          />
        ))}

        {geom.xTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 9} className={s.axisText} textAnchor="middle">
            {t.label}
          </text>
        ))}
      </svg>

      {hover !== null &&
        (() => {
          const p = points[hover];
          const rect = wrapRef.current?.getBoundingClientRect();
          const scale = rect ? rect.width / W : 1;
          const wrap = rect?.width ?? W;
          const at = geom.x(hover) * scale;
          /*
           * Past halfway the card flips to hang off the RIGHT of the cursor, so it
           * grows inward instead of past the plot. Clamping a left offset against a
           * guessed card width is what put a horizontal scrollbar on the wrapper:
           * the tip is `nowrap`, so its real width depends on the values in it.
           */
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
              {renderTip(p)}
            </div>
          );
        })()}
    </div>
  );
}

/**
 * One leg. A bar only where one is meaningful; the fixed legs are figures.
 *
 * The track is drawn ONLY on rows that have something to scale — it is a visible
 * pill, so an empty one reads as a bar at zero. A fixed leg gets bare grid space
 * instead, and a variable leg worth nothing keeps its track but says so, which is
 * how those two kinds of blank stay told apart.
 */
function Leg({ leg, width, muted }) {
  return (
    <div className={s.cmLedgerRow}>
      <span className={s.cmLedgerLabel}>
        {leg.color && (
          <span className={s.cmStackSwatch} style={{ background: leg.color }} aria-hidden="true" />
        )}
        {leg.label}
      </span>
      {/* The track is always in the DOM so switching scale grows a bar rather than
          inserting one. It is invisible until it has something to hold. */}
      <span className={`${s.cmLedgerTrack} ${muted && !width ? s.cmLedgerTrackGhost : ''}`}>
        {muted || width ? (
          <span
            className={s.cmLedgerFill}
            style={{ width: width ?? '0%', background: leg.color ?? NEUTRAL_BAR }}
          />
        ) : (
          <span className={s.cmLedgerNil}>none in this window</span>
        )}
      </span>
      <span
        className={`${s.cmLedgerValue} ${muted ? s.cmLedgerFixed : leg.sign < 0 ? s.cmLedgerOut : s.cmLedgerIn}`}
        title={`${leg.value} nanoERG`}
      >
        {/* No sign on a zero: "−0" reads as a rounded-away debit rather than nothing. */}
        {leg.value === 0n ? '' : leg.sign < 0 ? '−' : '+'}
        {fmtErgAmount(leg.value, 6)}
      </span>
    </div>
  );
}

/**
 * A summed row. It gets a bar only under true scale — off it, there is nothing to
 * compare a subtotal against, and an empty track reads as a bar that failed.
 */
function Subtotal({ label, value, hint, strong = false, width }) {
  const bar = value < 0n ? 'var(--cur-amber-light)' : 'var(--cur-green)';
  return (
    <div className={`${s.cmLedgerRow} ${s.cmLedgerNet} ${strong ? s.cmLedgerNetStrong : ''}`}>
      <span className={s.cmLedgerLabel}>
        {label}
        {hint && <span className={s.cmLedgerHint}>{hint}</span>}
      </span>
      <span className={`${s.cmLedgerTrack} ${width ? '' : s.cmLedgerTrackGhost}`}>
        <span className={s.cmLedgerFill} style={{ width: width ?? '0%', background: bar }} />
      </span>
      <span
        className={`${s.cmLedgerValue} ${value < 0n ? s.cmLedgerNeg : s.cmLedgerPos}`}
        title={`${value} nanoERG`}
      >
        {value < 0n ? '−' : '+'}
        {fmtErgAmount(value < 0n ? -value : value, 6)} ERG
      </span>
    </div>
  );
}

/**
 * A lender's position on one Lithos block.
 *
 * The fixed legs are stated and the variable pair gets the bars, scaled against
 * each other. Drawn on one shared scale the block reward would be 100% and the two
 * legs that decide whether a bid pays would be under 1% each — the chart would be
 * a picture of two constants a reader already knows.
 */
function LedgerBridge({ fixed, variable, fixedMargin, net, trueScale }) {
  /*
   * Two scales, because one cannot serve both readings.
   *
   * Off (the default), only the variable pair gets bars and they are scaled
   * against each other — the comparison a lender is actually making, and the one
   * that vanishes under a shared scale because the block reward is ~500x either
   * of them. On, every row including the subtotals is drawn against the largest
   * absolute value in the ledger, which is the honest proportional picture and
   * makes the two constants and the net visible as bars.
   */
  const abs = (v) => (v < 0n ? -v : v);
  const span = trueScale
    ? [...fixed, ...variable].reduce((a, l) => (abs(l.value) > a ? abs(l.value) : a),
        abs(fixedMargin) > abs(net) ? abs(fixedMargin) : abs(net))
    : variable.reduce((a, l) => (abs(l.value) > a ? abs(l.value) : a), 0n);
  /*
   * The 1.5% floor keeps a small-but-real bar visible against its neighbours. It is
   * dropped under true scale on purpose: clamping there would draw two legs that
   * differ by 20% at the same width and call it proportional.
   */
  const width = (v) => {
    if (span === 0n || abs(v) === 0n) return null;
    const pct = Number((abs(v) * 10_000n) / span) / 100;
    return `${trueScale ? pct : Math.max(pct, 1.5)}%`;
  };

  return (
    <>
      <div className={s.cmLedger}>
        {fixed.map((l) => (
          <Leg key={l.id} leg={l} muted width={trueScale ? width(l.value) : null} />
        ))}
        <Subtotal
          label="Fixed margin"
          hint="before anything variable"
          value={fixedMargin}
          width={trueScale ? width(fixedMargin) : null}
        />

        <div className={s.cmLedgerGroup}>
          {variable.map((l) => (
            <Leg key={l.id} leg={l} width={width(l.value)} />
          ))}
        </div>
        <Subtotal
          label="Net per block"
          value={net}
          strong
          width={trueScale ? width(net) : null}
        />
      </div>

      <div className={s.cmStackLegend}>
        {[...fixed, ...variable].map((l) => (
          <div className={s.cmStackItem} key={l.id}>
            <span
              className={s.cmStackSwatch}
              style={{ background: l.color ?? 'var(--cur-fainter)' }}
              aria-hidden="true"
            />
            <div className={s.cmStackText}>
              <div className={s.cmStackLabel}>{l.label}</div>
              <div className={s.cmStackNote}>{l.note}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function FeeRevenuePanel({ history, error, loading, spot, days }) {
  /** Whether the ledger draws every row against one scale. See [[LedgerBridge]]. */
  const [trueScale, setTrueScale] = useState(false);
  const { sampled, skipped } = useMemo(() => sampledBuckets(history), [history]);

  /** Both series come off the same sampled buckets, so their days always line up. */
  const { bidPoints, feePoints } = useMemo(() => {
    const rows = sampled.map((b) => {
      const blocks = totalOf(b.totals, 'lithos.blocks');
      return {
        start: b.start,
        blocks,
        withBid: totalOf(b.totals, 'lithos.blocksWithPriorityFee'),
        bid: totalOf(b.totals, 'lithos.priorityFeeNanoErg') / blocks,
        fees: totalOf(b.totals, 'lithos.transactionFeeNanoErg') / blocks,
      };
    });
    return {
      bidPoints: rows.map((r) => ({ ...r, value: r.bid })),
      feePoints: rows.map((r) => ({ ...r, value: r.fees })),
    };
  }, [sampled]);

  /**
   * What the fees actually support. The median is the reference rather than the
   * mean: one unusually busy block should not talk a lender into a bid the typical
   * block will not repay.
   */
  const feeStats = useMemo(() => {
    if (feePoints.length === 0) return null;
    const values = feePoints.map((p) => p.value);
    const med = median(values);
    return {
      median: med,
      // Mean over sampled days, so a single busy day pulls it where the median
      // would not. Both are shown precisely because they disagree.
      mean: values.reduce((a, v) => a + v, 0n) / BigInt(values.length),
      peak: values.reduce((a, v) => (v > a ? v : a), 0n),
      headroom: affordableBid(med),
      peakHeadroom: affordableBid(values.reduce((a, v) => (v > a ? v : a), 0n)),
    };
  }, [feePoints]);

  /**
   * The lender's four legs per block. The two measured ones come from the window;
   * the reward and the principal floor are protocol constants, and the fee is charged
   * one for one — the split between the finder and the pool never surfaces here.
   */
  /** Mean fee settled across the whole window — the line the basis is measured from. */
  const windowMean = useMemo(() => {
    const { totals, blocks: n } = windowTotals(sampled);
    return n === 0n ? 0n : perBlock(totalOf(totals, 'lithos.priorityFeeNanoErg'), n);
  }, [sampled]);

  const { fixed, variable, fixedMargin, net, blocks } = useMemo(() => {
    const { totals, blocks: n } = windowTotals(sampled);
    if (n === 0n) return { fixed: [], variable: [], fixedMargin: 0n, net: 0n, blocks: 0n };

    const meanBid = perBlock(totalOf(totals, 'lithos.priorityFeeNanoErg'), n);
    const valueFor = {
      coinbase: BLOCK_REWARD_NANO,
      principal: PRINCIPAL_FLOOR_NANO,
      txfees: perBlock(sumKeys(totals, ['lithos.transactionFeeNanoErg']), n),
      bid: meanBid,
    };
    const withValues = (legs) => legs.map((l) => ({ ...l, value: valueFor[l.id] }));
    const f = withValues(LEDGER_FIXED);
    const v = withValues(LEDGER_VARIABLE);
    const margin = f.reduce((a, l) => a + BigInt(l.sign) * l.value, 0n);
    return {
      fixed: f,
      variable: v,
      fixedMargin: margin,
      net: v.reduce((a, l) => a + BigInt(l.sign) * l.value, margin),
      blocks: n,
    };
  }, [sampled]);

  return (
    <>
      <div className={s.card}>
        <h3 className={s.cardTitle}>Average settlement value</h3>
        <p className={s.cardDesc}>
          The average priority bid paid out per Lithos block, collected once per day. 
          The dashed line is today&rsquo;s best live bid.
        </p>

        {error && (
          <Alert kind="error" title="Could not read settled history">
            {error}
          </Alert>
        )}

        {loading && !history ? (
          <div className={s.empty}>
            <Spinner /> Reading {days} days of history…
          </div>
        ) : bidPoints.length === 0 ? (
          <div className={s.cmBookEmpty}>
            No Lithos block in the last {days} days, so nothing has settled to average. The series
            starts as soon as one is mined.
          </div>
        ) : (
          <>
            <SeriesChart
              points={bidPoints}
              color={BID}
              gradientId="settle-grad"
              ariaLabel="Bid settled per Lithos block"
              flatNote={`No Lithos block in the last ${days} days carried a priority bid, so the settled series is flat at zero. It lifts off as soon as one does.`}
              reference={
                spot != null && spot > 0n
                  ? { value: spot, label: 'best live bid', color: BID_DIM }
                  : null
              }
              renderTip={(p) => (
                <>
                  <div className={s.cmTipBid}>{fmtErgAmount(p.value, 6)} ERG</div>
                  <div className={s.cmTipMeta}>{bucketLabel(p.start)} · per block</div>
                  <div className={s.cmTipMeta}>
                    {fmtInt(p.blocks)} block{p.blocks === 1n ? '' : 's'}
                    {p.withBid > 0n ? ` · ${fmtInt(p.withBid)} bidding` : ' · none bidding'}
                  </div>
                </>
              )}
            />
            <div className={s.cmChartFoot}>
              {fmtInt(blocks)} Lithos block{blocks === 1n ? '' : 's'} over {fmtInt(bidPoints.length)}{' '}
              sampled day{bidPoints.length === 1 ? '' : 's'}
              {/* The gap is the whole point of the dashed line, so it gets a number
                  rather than leaving the reader to measure it by eye. */}
              {spot != null && spot > 0n && windowMean > 0n && (
                <> · the book is asking {Number((spot * 10n) / windowMean) / 10}× what settles</>
              )}
              {/* Said out loud rather than drawn as zeroes: a day with no block has
                  no mean to plot, and pretending otherwise would flatten the series. */}
              {skipped > 0 && ` · ${fmtInt(skipped)} day${skipped === 1 ? '' : 's'} had no Lithos block and are not plotted`}
              {history?.partial && ' · history does not cover the whole range'}
            </div>
          </>
        )}
      </div>

       {/* Sits between the two on purpose: it is the input that decides how much of
          the bid above is affordable, and the ledger below is the conclusion. */}
      <div className={s.card} style={{ marginTop: '1.25rem' }}>
        <h3 className={s.cardTitle}>Daily Lithos block fees</h3>
        <p className={s.cardDesc}>
          Transaction fees per Lithos block, averaged over each day. 
          Block miners fill left over space with mempool transactions,
          which lenders gain as additional value.
        </p>


        {feePoints.length === 0 ? (
          <div className={s.cmBookEmpty}>
            No Lithos block in the last {days} days, so there are no fees to average yet.
          </div>
        ) : (
          <>
            <SeriesChart
              points={feePoints}
              color={FEE}
              gradientId="fees-grad"
              ariaLabel="Transaction fees per Lithos block"
              flatNote={`No Lithos block in the last ${days} days carried a transaction fee, so there is nothing to plot. Until that changes a bid is repaid by the block reward alone.`}
              reference={
                feeStats.median > 0n
                  ? { value: feeStats.median, label: 'median day', color: FEE }
                  : null
              }
              renderTip={(p) => (
                <>
                  <div className={s.cmTipFee}>{fmtErgAmount(p.value, 6)} ERG</div>
                  <div className={s.cmTipMeta}>{bucketLabel(p.start)} · fees per block</div>
                  <div className={s.cmTipMeta}>
                    supports a bid up to {fmtErgAmount(affordableBid(p.value), 4)} ERG
                  </div>
                </>
              )}
            />

            {/* The derived number, not a second axis: max bid is a fixed transform of
                the fees, so it belongs beside the chart rather than on it. */}
            <div className={s.cmFeeReadout}>
              <div className={s.cmFeeReadoutItem}>
                <span className={s.cmFeeReadoutLabel}>Median day</span>
                <span className={s.cmFeeReadoutValue}>
                  {fmtErgAmount(feeStats.median, 6)} <em>ERG</em>
                </span>
              </div>
              <div className={s.cmFeeReadoutItem}>
                <span className={s.cmFeeReadoutLabel}>Average day</span>
                <span className={s.cmFeeReadoutValue}>
                  {fmtErgAmount(feeStats.mean, 6)} <em>ERG</em>
                </span>
              </div>
              <div className={`${s.cmFeeReadoutItem} ${s.cmFeeReadoutKey}`}>
                <span className={s.cmFeeReadoutLabel}>Busiest day</span>
                <span className={s.cmFeeReadoutValue}>
                  {fmtErgAmount(feeStats.peak, 6)} <em>ERG</em>
                </span>
              </div>
            </div>

            <div className={s.cmChartFoot}>
              With no fees at all a bid only breaks even up to{' '}
              {fmtErgAmount(BREAK_EVEN_NANO, 4)} ERG. The median day here lifts that to{' '}
              {fmtErgAmount(feeStats.headroom, 4)} ERG, and the busiest to{' '}
              {fmtErgAmount(feeStats.peakHeadroom, 4)} ERG. Exact fee values depend
              on the block your collateral box is spent in.
            </div>
          </>
        )}
      </div>

      <div className={s.card} style={{ marginTop: '1.25rem' }}>
        <div className={s.cmCardHead}>
          <h3 className={s.cardTitle}>Average lender revenue</h3>
          {/* Off by default: under true scale the two legs a lender actually weighs
              are ~1/500th of the block reward and collapse to slivers. */}
          <label className={s.cmScaleToggle} title="Draw every row against the largest value in the ledger">
            <input
              type="checkbox"
              checked={trueScale}
              onChange={(e) => setTrueScale(e.target.checked)}
            />
            <span>True scale</span>
          </label>
        </div>
        <p className={s.cardDesc}>
          Averaged values of lender positions on Lithos blocks: lender's receive the block reward
          and additional transaction fees, while paying the principal and the bid.
        </p>

        {blocks === 0n ? (
          <div className={s.cmBookEmpty}>
            Nothing to settle until a Lithos block is mined in this window.
          </div>
        ) : (
          <>
            <LedgerBridge
              fixed={fixed}
              variable={variable}
              fixedMargin={fixedMargin}
              net={net}
              trueScale={trueScale}
            />
            <div className={s.cmChartFoot}>
              Averaged over {fmtInt(blocks)} Lithos block{blocks === 1n ? '' : 's'}. The coinbase
              and the principal floor are protocol constants; block fees and the bid are measured.
            </div>
          </>
        )}
      </div>
    </>
  );
}
