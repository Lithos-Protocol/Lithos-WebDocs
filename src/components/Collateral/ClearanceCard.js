import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './styles.module.css';
import { useCollateral } from './CollarLayout';
import { getCandidateSettings } from '../Mining/api';
import { big, fmtErgAmount, fmtInt, shortId } from './format';
import { BID } from './feeMarket';

/** The shipped `clearanceAge` and the largest any client accepts, until `/mining/candidate` answers. */
const DEFAULT_CLEARANCE = 7200;
const MAX_CLEARANCE = 14400;

/** Default clearance reads indigo and the every-client limit red; neither colour means anything else here. */
const DEFAULT_COLOR = '#818cf8';
const MAX_COLOR = '#f87171';

const BLOCK_MS = 120_000;
const ROWS = 10;

const days = (blocks) => (blocks * BLOCK_MS) / 86_400_000;
const fmtDays = (blocks) => {
  const d = days(blocks);
  return d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${d.toFixed(d < 10 ? 1 : 0)} days`;
};

const W = 1000;
const H = 230;
const PAD = { t: 18, r: 16, b: 30, l: 64 };

/**
 * Where a live box stands against clearance: past the every-client limit, past the default, or how long until
 * the default reaches it.
 */
function standing(age, clearance) {
  if (age == null) return { key: 'pending', label: 'Unconfirmed', color: 'var(--cur-dim)' };
  if (age >= clearance.max) return { key: 'max', label: 'Drawn first by every client', color: MAX_COLOR };
  if (age >= clearance.default) return { key: 'default', label: 'Drawn first by default clients', color: DEFAULT_COLOR };
  return { key: 'young', label: `Default clearance in ${fmtDays(clearance.default - age)}`, color: 'var(--cur-muted)' };
}

/**
 * Live boxes by age against their bid, with the two clearance thresholds drawn across. A miner using the
 * `highestFee` strategy spends the best bid, until a box is `clearanceAge` blocks old: from then the oldest
 * such box goes first, whatever it bids.
 */
export default function ClearanceCard({ active }) {
  const { market, tick } = useCollateral();
  const [settings, setSettings] = useState(null);
  const [hover, setHover] = useState(null);
  const [page, setPage] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    getCandidateSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [tick]);

  const clearance = {
    default: settings?.defaultClearanceAge ?? DEFAULT_CLEARANCE,
    max: settings?.maxClearanceAge ?? MAX_CLEARANCE,
    own: settings?.collateralStrategy === 'highestFee' ? settings?.clearanceAge : null,
  };

  // Ages are counted to the block being mined, which is what a miner's selection compares against
  const next = market?.syncHeight != null ? market.syncHeight + 1 : null;
  const boxes = useMemo(
    () =>
      (active ?? [])
        .map((b) => {
          const age = next != null && b.inclusionHeight != null ? Math.max(0, next - b.inclusionHeight) : null;
          return { ...b, age, bid: big(b.priorityFeeNanoErgs ?? '0') };
        })
        .sort((a, b) => (b.age ?? -1) - (a.age ?? -1)),
    [active, next],
  );

  const aged = boxes.filter((b) => b.age != null);
  const pastDefault = aged.filter((b) => b.age >= clearance.default);
  const pastMax = aged.filter((b) => b.age >= clearance.max);
  const oldest = aged[0];
  const nextUp = pastDefault[0];

  const geom = useMemo(() => {
    if (aged.length === 0) return null;
    const xMax = Math.max(clearance.max * 1.08, (oldest?.age ?? 0) * 1.05);
    const maxBid = aged.reduce((a, b) => (b.bid > a ? b.bid : a), 0n);
    const yTop = maxBid > 0n ? maxBid + maxBid / 8n : 1_000_000n;
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const x = (age) => PAD.l + (age / xMax) * innerW;
    const y = (bid) => PAD.t + innerH - (Number((bid * 1_000_000n) / yTop) / 1_000_000) * innerH;
    return {
      x,
      y,
      innerH,
      xMax,
      yTicks: [0, 0.5, 1].map((f) => ({
        y: PAD.t + innerH - f * innerH,
        label: fmtErgAmount((yTop * BigInt(Math.round(f * 1000))) / 1000n, 3),
      })),
      xTicks: [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((xMax * f) / 100) * 100),
    };
  }, [aged.length, oldest?.age, clearance.max, active]);

  const pages = Math.max(1, Math.ceil(boxes.length / ROWS));
  const at = Math.min(page, pages - 1);
  const rows = boxes.slice(at * ROWS, (at + 1) * ROWS);
  const hovered = hover == null ? null : aged[hover];

  return (
    <div className={s.card} style={{ marginTop: '1.25rem' }}>
      <h3 className={s.cardTitle}>Box ages and clearance</h3>
      <p className={s.cardDesc}>
        A miner spends the live box with the best bid, but no box can wait forever. Once a box is old enough, miners
        using the <code>highestFee</code> strategy take the oldest such box first, whatever it bids. That age is each
        client's <code>clearanceAge</code>: {fmtInt(clearance.default)} blocks (about {fmtDays(clearance.default)}) by
        default, and at most {fmtInt(clearance.max)} blocks (about {fmtDays(clearance.max)}), past which every client
        using <code>highestFee</code> takes it first.
        {clearance.own != null && clearance.own !== clearance.default && (
          <> This client is set to {fmtInt(clearance.own)} blocks.</>
        )}
      </p>

      <div className={s.clStats}>
        <div className={s.clStat}>
          <span className={s.clStatLabel}>Oldest live box</span>
          <span className={s.clStatValue}>{oldest ? `${fmtInt(oldest.age)} blocks` : '—'}</span>
          <span className={s.clStatSub}>{oldest ? `about ${fmtDays(oldest.age)}` : 'no confirmed boxes'}</span>
        </div>
        <div className={s.clStat}>
          <span className={s.clStatLabel}>Past default clearance</span>
          <span className={s.clStatValue} style={{ color: pastDefault.length ? DEFAULT_COLOR : undefined }}>
            {fmtInt(pastDefault.length)}
          </span>
          <span className={s.clStatSub}>older than {fmtInt(clearance.default)} blocks</span>
        </div>
        <div className={s.clStat}>
          <span className={s.clStatLabel}>Past the maximum</span>
          <span className={s.clStatValue} style={{ color: pastMax.length ? MAX_COLOR : undefined }}>
            {fmtInt(pastMax.length)}
          </span>
          <span className={s.clStatSub}>older than {fmtInt(clearance.max)} blocks</span>
        </div>
        <div className={s.clStat}>
          <span className={s.clStatLabel}>Next swept</span>
          <span className={s.clStatValue} title={nextUp?.boxId}>
            {nextUp ? shortId(nextUp.boxId, 6, 4) : 'none due'}
          </span>
          <span className={s.clStatSub}>
            {nextUp
              ? `${fmtInt(nextUp.age)} blocks old, bids ${fmtErgAmount(nextUp.bid, 4)} ERG`
              : oldest
                ? `the oldest reaches ${fmtInt(clearance.default)} in ${fmtDays(clearance.default - oldest.age)}`
                : ''}
          </span>
        </div>
      </div>

      {!geom ? (
        <div className={s.empty}>{active ? 'No confirmed live boxes to age.' : 'Reading the live boxes…'}</div>
      ) : (
        <div className={s.chartWrap} ref={wrapRef} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label="Live collateral boxes by age and bid">
            {geom.yTicks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="rgba(125,211,252,0.08)" />
                <text x={PAD.l - 8} y={t.y + 3.5} className={s.axisText} textAnchor="end">
                  {t.label}
                </text>
              </g>
            ))}
            {/* Past each threshold, shaded in its own colour */}
            <rect
              x={geom.x(clearance.default)}
              y={PAD.t}
              width={Math.max(0, geom.x(clearance.max) - geom.x(clearance.default))}
              height={geom.innerH}
              fill={DEFAULT_COLOR}
              opacity="0.06"
            />
            <rect
              x={geom.x(clearance.max)}
              y={PAD.t}
              width={Math.max(0, W - PAD.r - geom.x(clearance.max))}
              height={geom.innerH}
              fill={MAX_COLOR}
              opacity="0.07"
            />
            {[
              { age: clearance.default, color: DEFAULT_COLOR, label: `default ${fmtInt(clearance.default)}` },
              { age: clearance.max, color: MAX_COLOR, label: `maximum ${fmtInt(clearance.max)}` },
              ...(clearance.own != null && clearance.own !== clearance.default
                ? [{ age: clearance.own, color: 'var(--cur-muted)', label: `this client ${fmtInt(clearance.own)}` }]
                : []),
            ].map((l) => (
              <g key={l.label}>
                <line
                  x1={geom.x(l.age)}
                  y1={PAD.t}
                  x2={geom.x(l.age)}
                  y2={PAD.t + geom.innerH}
                  stroke={l.color}
                  strokeDasharray="4 3"
                  opacity="0.85"
                />
                {/* Past the middle, the label sits left of its line so it never runs off the plot */}
                <text
                  x={geom.x(l.age) > W / 2 ? geom.x(l.age) - 5 : geom.x(l.age) + 5}
                  y={PAD.t + 10}
                  className={s.clLineText}
                  style={{ fill: l.color }}
                  textAnchor={geom.x(l.age) > W / 2 ? 'end' : 'start'}
                >
                  {l.label}
                </text>
              </g>
            ))}
            {aged.map((b, i) => {
              const st = standing(b.age, clearance);
              return (
                <circle
                  key={b.boxId}
                  cx={geom.x(b.age)}
                  cy={geom.y(b.bid)}
                  r={hover === i ? 6 : 4.5}
                  fill={BID}
                  fillOpacity={st.key === 'young' ? 0.55 : 0.9}
                  stroke={st.key === 'young' ? 'none' : st.color}
                  strokeWidth="2"
                  onMouseEnter={() => setHover(i)}
                />
              );
            })}
            <line x1={PAD.l} y1={PAD.t + geom.innerH} x2={W - PAD.r} y2={PAD.t + geom.innerH} stroke="rgba(125,211,252,0.18)" />
            {geom.xTicks.map((t, i) => (
              <text
                key={t}
                x={geom.x(t)}
                y={H - 12}
                className={s.axisText}
                textAnchor={i === geom.xTicks.length - 1 ? 'end' : 'middle'}
              >
                {i === geom.xTicks.length - 1 ? `${fmtInt(t)} blocks old` : fmtInt(t)}
              </text>
            ))}
          </svg>
          {hovered &&
            (() => {
              const rect = wrapRef.current?.getBoundingClientRect();
              const scale = rect ? rect.width / W : 1;
              const at = geom.x(hovered.age) * scale;
              const right = at > (rect?.width ?? W) / 2;
              const st = standing(hovered.age, clearance);
              return (
                <div
                  className={s.hoverTip}
                  style={right ? { right: `${Math.max(4, (rect?.width ?? W) - at + 12)}px` } : { left: `${at + 12}px` }}
                >
                  <div className={s.cmTipBid}>{fmtErgAmount(hovered.bid, 6)} ERG bid</div>
                  <div className={s.cmTipMeta}>
                    {fmtInt(hovered.age)} blocks old · about {fmtDays(hovered.age)}
                  </div>
                  <div className={s.cmTipMeta} style={{ color: st.color }}>
                    {st.label}
                  </div>
                  <div className={s.cmTipMeta}>{shortId(hovered.boxId, 8, 6)}</div>
                </div>
              );
            })()}
        </div>
      )}

      {boxes.length > 0 && (
        <div className={s.clTable}>
          <div className={`${s.clTr} ${s.clTh}`}>
            <span>Box</span>
            <span className={s.clNum}>Age</span>
            <span className={s.clNum}>Bid</span>
            <span>Clearance</span>
          </div>
          {rows.map((b) => {
            const st = standing(b.age, clearance);
            return (
              <div key={b.boxId} className={s.clTr}>
                <span className={s.clId} title={b.boxId}>
                  {shortId(b.boxId, 8, 6)}
                </span>
                <span className={s.clNum}>
                  {b.age == null ? '—' : `${fmtInt(b.age)} · ${fmtDays(b.age)}`}
                </span>
                <span className={s.clNum}>{fmtErgAmount(b.bid, 4)} ERG</span>
                <span style={{ color: st.color }}>
                  {b === nextUp ? 'Next swept · ' : ''}
                  {st.label}
                </span>
              </div>
            );
          })}
          <div className={s.clFoot}>
            <span>
              Oldest first. {fmtInt(at * ROWS + 1)}–{fmtInt(at * ROWS + rows.length)} of {fmtInt(boxes.length)} live boxes
            </span>
            {pages > 1 && (
              <span className={s.clPager}>
                <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} aria-label="Previous page">
                  ‹
                </button>
                {fmtInt(at + 1)} / {fmtInt(pages)}
                <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label="Next page">
                  ›
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
