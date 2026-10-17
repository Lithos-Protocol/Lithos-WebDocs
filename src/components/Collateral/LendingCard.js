import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import { BLOCK_INTERVAL_MS, big, fmtErgAmount, fmtInt, fmtPct, shortId } from './format';
import { Alert, Spinner } from './ui';

const ROWS = 10;
const NET = '#34d399';
const LOSS = '#f87171';

const W = 1000;
const H = 210;
const PAD = { t: 16, r: 16, b: 30, l: 74 };

const days = (blocks) => (blocks * BLOCK_INTERVAL_MS) / 86_400_000;
const fmtDays = (blocks) => {
  const d = days(blocks);
  return d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${d.toFixed(d < 10 ? 1 : 0)} d`;
};
const signed = (nano, dp = 4) => `${big(nano) > 0n ? '+' : ''}${fmtErgAmount(nano, dp)}`;
const ratioOf = (a, b) => (big(b) === 0n ? null : Number((big(a) * 1_000_000n) / big(b)) / 1_000_000);
const dateOf = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * What this wallet's collateral earned once a Lithos block spent it, over the statistics' retained window. Each
 * block pays the lender's key its block reward and every transaction fee in it; the lender posted the principal
 * and any priority fee bid on top.
 */
export default function LendingCard() {
  const { tick } = useCollateral();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .getLendingEarnings({ limit: api.MAX_LENDING_PAGE })
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [tick]);

  const positions = data?.positions ?? [];
  const lock = data?.rewardLockBlocks ?? 720;

  // Oldest first, each point the running net after that position paid
  const steps = useMemo(() => {
    let total = 0n;
    return [...positions].reverse().map((p) => {
      total += big(p.netNanoErg);
      return { t: Number(p.timestamp), total, p };
    });
  }, [positions]);

  const timed = positions.filter((p) => p.joinedHeight != null);
  const avgBlocks = timed.length
    ? timed.reduce((a, p) => a + (Number(p.height) - Number(p.joinedHeight) + lock), 0) / timed.length
    : null;
  const perUse = data ? ratioOf(data.totals.netNanoErg, data.totals.postedNanoErg) : null;
  const yearly = perUse != null && avgBlocks ? (perUse * 365) / days(avgBlocks) : null;
  const received = data ? big(data.totals.coinbaseNanoErg) + big(data.totals.feesNanoErg) : 0n;

  const geom = useMemo(() => {
    if (steps.length === 0) return null;
    const t0 = data?.retainedFromTimestamp ?? steps[0].t;
    const t1 = Math.max(Date.now(), steps[steps.length - 1].t);
    const values = [0n, ...steps.map((x) => x.total)];
    const lo = values.reduce((a, v) => (v < a ? v : a), 0n);
    const hi = values.reduce((a, v) => (v > a ? v : a), 0n);
    const span = hi - lo === 0n ? 1_000_000_000n : hi - lo;
    const top = hi + span / 10n;
    const bottom = lo < 0n ? lo - span / 10n : 0n;
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const x = (t) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * innerW;
    const y = (v) => PAD.t + innerH - (Number(((v - bottom) * 1_000_000n) / (top - bottom)) / 1_000_000) * innerH;
    return {
      x,
      y,
      t0,
      t1,
      innerH,
      ticks: [0, 1, 2, 3, 4].map((i) => bottom + ((top - bottom) * BigInt(i)) / 4n),
    };
  }, [steps, data?.retainedFromTimestamp]);

  const path = useMemo(() => {
    if (!geom) return '';
    let d = `M${geom.x(geom.t0).toFixed(1)} ${geom.y(0n).toFixed(1)}`;
    steps.forEach((p) => {
      d += ` H${geom.x(p.t).toFixed(1)} V${geom.y(p.total).toFixed(1)}`;
    });
    return `${d} H${geom.x(geom.t1).toFixed(1)}`;
  }, [geom, steps]);

  const pages = Math.max(1, Math.ceil(positions.length / ROWS));
  const at = Math.min(page, pages - 1);
  const rows = positions.slice(at * ROWS, (at + 1) * ROWS);
  const hovered = hover == null ? null : steps[hover];
  const net = data ? big(data.totals.netNanoErg) : 0n;

  return (
    <div className={s.card} style={{ marginTop: '1.25rem' }}>
      <h3 className={s.cardTitle}>Lending earnings</h3>
      <p className={s.cardDesc}>
        What your collateral earned once a Lithos block spent it. That block pays your key its block reward and every
        transaction fee it holds. You put in the box: the fixed principal plus any priority fee you bid. Net is what
        came back less what you put in, before the small network fee each join paid. Your LIT permit comes back in full
        and is left out. The client keeps this for <code>stats.mining.historyDays</code> days; raise it to keep more.
      </p>

      {error && !data && (
        <Alert kind="error" title="Could not load lending earnings">
          {error.message ?? String(error)}
        </Alert>
      )}
      {!error && !data && (
        <div className={s.empty}>
          <Spinner /> Reading lending history…
        </div>
      )}

      {data && (
        <>
          <div className={s.clStats}>
            <div className={s.clStat}>
              <span className={s.clStatLabel}>Net earned</span>
              <span className={s.clStatValue} style={{ color: net > 0n ? NET : net < 0n ? LOSS : undefined }}>
                {signed(data.totals.netNanoErg)} ERG
              </span>
              <span className={s.clStatSub}>
                {fmtInt(data.totals.positions)} position{Number(data.totals.positions) === 1 ? '' : 's'} paid
                {data.retainedFromTimestamp != null ? ` since ${dateOf(data.retainedFromTimestamp)}` : ''}
              </span>
            </div>
            <div className={s.clStat}>
              <span className={s.clStatLabel}>Return per use</span>
              <span className={s.clStatValue}>{perUse == null ? '—' : fmtPct(perUse, 2)}</span>
              <span className={s.clStatSub}>net over what you put in</span>
            </div>
            <div className={s.clStat}>
              <span className={s.clStatLabel}>Yearly rate</span>
              <span className={s.clStatValue}>{yearly == null ? '—' : fmtPct(yearly, 1)}</span>
              <span className={s.clStatSub}>
                {avgBlocks == null
                  ? 'needs join heights'
                  : `ERG tied up ${fmtDays(avgBlocks)} per use, join to unlock`}
              </span>
            </div>
            <div className={s.clStat}>
              <span className={s.clStatLabel}>Block fees earned</span>
              <span className={s.clStatValue}>{fmtErgAmount(data.totals.feesNanoErg, 4)} ERG</span>
              <span className={s.clStatSub}>of {fmtErgAmount(received, 3)} ERG received</span>
            </div>
          </div>

          {!geom ? (
            <div className={s.empty}>
              None of your collateral has been spent by a Lithos block yet. Once one is, its earnings show here.
            </div>
          ) : (
            <div
              className={s.chartWrap}
              ref={wrapRef}
              style={{ position: 'relative' }}
              onMouseLeave={() => setHover(null)}
            >
              <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label="Running net lending earnings">
                {geom.ticks.map((v) => (
                  <g key={String(v)}>
                    <line x1={PAD.l} y1={geom.y(v)} x2={W - PAD.r} y2={geom.y(v)} stroke="rgba(125,211,252,0.08)" />
                    <text x={PAD.l - 8} y={geom.y(v) + 3.5} className={s.axisText} textAnchor="end">
                      {fmtErgAmount(v, 3)}
                    </text>
                  </g>
                ))}
                <line x1={PAD.l} y1={geom.y(0n)} x2={W - PAD.r} y2={geom.y(0n)} stroke="rgba(125,211,252,0.22)" />
                <path d={`${path} V${geom.y(0n).toFixed(1)} Z`} fill={NET} opacity="0.1" />
                <path d={path} fill="none" stroke={NET} strokeWidth="2" />
                {steps.map((p, i) => (
                  <circle
                    key={p.p.collateralBoxId}
                    cx={geom.x(p.t)}
                    cy={geom.y(p.total)}
                    r={hover === i ? 5 : 3}
                    fill={big(p.p.netNanoErg) < 0n ? LOSS : NET}
                    onMouseEnter={() => setHover(i)}
                  />
                ))}
                {[geom.t0, (geom.t0 + geom.t1) / 2, geom.t1].map((t, i) => (
                  <text
                    key={i}
                    x={geom.x(t)}
                    y={H - 10}
                    className={s.axisText}
                    textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                  >
                    {i === 2 ? 'now' : dateOf(t)}
                  </text>
                ))}
              </svg>
              {hovered &&
                (() => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  const scale = rect ? rect.width / W : 1;
                  const x = geom.x(hovered.t) * scale;
                  const right = x > (rect?.width ?? W) / 2;
                  return (
                    <div
                      className={s.hoverTip}
                      style={right ? { right: `${Math.max(4, (rect?.width ?? W) - x + 12)}px` } : { left: `${x + 12}px` }}
                    >
                      <div className={s.cmTipBid}>{signed(hovered.total)} ERG so far</div>
                      <div className={s.cmTipMeta}>
                        block {fmtInt(hovered.p.height)} · {signed(hovered.p.netNanoErg, 5)} ERG
                      </div>
                      <div className={s.cmTipMeta}>{new Date(hovered.t).toLocaleString()}</div>
                    </div>
                  );
                })()}
            </div>
          )}

          {positions.length > 0 && (
            <div className={s.clTable}>
              <div className={`${s.lnTr} ${s.clTh}`}>
                <span>Spent in block</span>
                <span className={s.clNum}>Put in</span>
                <span className={s.clNum}>Block reward</span>
                <span className={s.clNum}>Fees</span>
                <span className={s.clNum}>Net</span>
                <span className={s.clNum}>Return</span>
                <span className={s.clNum}>Waited</span>
                <span>Lender key</span>
              </div>
              {rows.map((p) => {
                const n = big(p.netNanoErg);
                const ret = ratioOf(p.netNanoErg, p.postedNanoErg);
                return (
                  <div key={p.collateralBoxId} className={s.lnTr}>
                    <span title={new Date(Number(p.timestamp)).toLocaleString()}>
                      {fmtInt(p.height)} <span className={s.clId}>· {dateOf(Number(p.timestamp))}</span>
                    </span>
                    <span
                      className={s.clNum}
                      title={big(p.priorityFeeNanoErg) > 0n ? `includes a ${fmtErgAmount(p.priorityFeeNanoErg, 6)} ERG priority fee` : 'no priority fee'}
                    >
                      {fmtErgAmount(p.postedNanoErg, 4)}
                    </span>
                    <span className={s.clNum}>{fmtErgAmount(p.coinbaseNanoErg, 4)}</span>
                    <span className={s.clNum}>{fmtErgAmount(p.feesNanoErg, 4)}</span>
                    <span className={s.clNum} style={{ color: n > 0n ? NET : n < 0n ? LOSS : undefined }}>
                      {signed(p.netNanoErg)}
                    </span>
                    <span className={s.clNum}>{ret == null ? '—' : fmtPct(ret, 2)}</span>
                    <span
                      className={s.clNum}
                      title={p.joinedHeight != null ? `joined at block ${fmtInt(p.joinedHeight)}` : 'join height unknown'}
                    >
                      {p.joinedHeight != null ? fmtDays(Number(p.height) - Number(p.joinedHeight)) : '—'}
                    </span>
                    <span className={s.clId} title={p.lenderAddress}>
                      {shortId(p.lenderAddress, 6, 4)}
                    </span>
                  </div>
                );
              })}
              <div className={s.clFoot}>
                <span>
                  All amounts in ERG, newest first. Waited is join to block; the reward then unlocks after{' '}
                  {fmtInt(lock)} blocks (~{fmtDays(lock)}).
                  {Number(data.total) > positions.length ? ` Showing the newest ${fmtInt(positions.length)} of ${fmtInt(data.total)}.` : ''}
                </span>
                {pages > 1 && (
                  <span className={s.clPager}>
                    <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} aria-label="Previous page">
                      ‹
                    </button>
                    {fmtInt(at + 1)} / {fmtInt(pages)}
                    <button
                      type="button"
                      disabled={at >= pages - 1}
                      onClick={() => setPage(at + 1)}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
