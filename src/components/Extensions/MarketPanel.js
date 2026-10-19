import React, { useEffect, useMemo, useState } from 'react';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from './ExtensionsLayout';
import { EpochStrip } from './charts';
import { StatusChip } from './ui';
import { Spinner } from '../Dex/ui';
import {
  big,
  COLORS,
  EPOCH_LENGTH,
  epochStart,
  fmtDifficulty,
  fmtEpochAt,
  fmtEpochs,
  fmtInt,
  fmtLit,
  fmtMove,
  fmtSpan,
  marginOf,
  moveOf,
  trailingMeans,
} from './format';

const DEPTHS = [32, 64, 128];
/** Moving-average lengths, in epochs. */
const SPANS = [4, 8, 16, 40, 80, 120];
const VIEWS = [
  { id: 'epoch', label: 'Per epoch', color: COLORS.difficulty },
  { id: 'mean', label: 'Moving average', color: COLORS.average },
];

/** The current epoch as a ring, with when the earliest window opens. */
function EpochRing({ acc, heights }) {
  const done = acc ? EPOCH_LENGTH - acc.blocksLeftInEpoch : 0;
  const frac = Math.max(0, Math.min(1, done / EPOCH_LENGTH));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={m.ringWrap}>
      <svg viewBox="0 0 132 132" className={m.dialSvg} role="img" aria-label="Progress through the current epoch">
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(125,211,252,0.1)" strokeWidth="9" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={COLORS.difficulty}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div className={m.ringCore}>
        <div className={m.ringValue}>{acc ? `${Math.round(frac * 100)}%` : '—'}</div>
        <div className={m.ringLabel}>
          {acc ? (heights ? `to block ${fmtInt(epochStart(acc.currentEpoch + 1))}` : `epoch ${fmtInt(acc.currentEpoch)}`) : '—'}
        </div>
      </div>
    </div>
  );
}

/**
 * The book's margin by the side a taker gets, as one divided bar. A maker going short leaves the long
 * side for the taker, and the other way round.
 */
function BookBar({ longs, shorts }) {
  const goLong = marginOf(shorts?.notional ?? 0);
  const goShort = marginOf(longs?.notional ?? 0);
  const total = goLong + goShort;
  const lp = total > 0n ? Number((goLong * 1000n) / total) / 10 : 50;
  return (
    <div className={s.bookBar}>
      <div className={s.bookBarTrack}>
        <span style={{ width: `${lp}%`, background: COLORS.long }} />
        <span style={{ width: `${100 - lp}%`, background: COLORS.short }} />
      </div>
      <div className={s.bookBarLegend}>
        <span>
          <i style={{ background: COLORS.long }} /> to go long: {fmtLit(goLong, 0)} LIT of margin in{' '}
          {fmtInt(shorts?.offers ?? 0)} offers
        </span>
        <span>
          <i style={{ background: COLORS.short }} /> to go short: {fmtLit(goShort, 0)} LIT of margin in{' '}
          {fmtInt(longs?.offers ?? 0)} offers
        </span>
      </div>
    </div>
  );
}

export default function MarketPanel() {
  const { acc, market, tick, heights } = useExtensions();
  const [depth, setDepth] = useState(64);
  const [view, setView] = useState('epoch');
  const [span, setSpan] = useState(8);
  const [table, setTable] = useState(null);
  const [busy, setBusy] = useState(false);

  const ring = acc?.deployed && acc.recent?.length ? acc.recent : null;
  // A mean over the first bar needs the span - 1 epochs before it as well
  const need = depth + (view === 'mean' ? span - 1 : 0);
  // The client's difficulty table serves what the ring does not: everything before genesis, and older epochs
  const tableLimit = !acc ? 0 : !ring ? Math.max(128, need) : need > ring.length ? need : 0;

  useEffect(() => {
    if (!tableLimit) return;
    setBusy(true);
    api
      .getDifficultyEpochs({ limit: tableLimit })
      .then(setTable)
      .catch(() => setTable(null))
      .finally(() => setBusy(false));
  }, [tableLimit, tick]);

  const history = useMemo(() => {
    if (!acc) return [];
    const at = new Map([...(table?.epochs ?? []), table?.previous].filter(Boolean).map((e) => [e.index, e.difficulty]));
    // Recorded difficulties are what settlements read, so they win wherever the ring holds one
    for (const e of ring ?? []) at.set(e.epoch, e.difficulty);
    // The current epoch's difficulty is known from its first block, recorded or not
    if (!at.has(acc.currentEpoch)) at.set(acc.currentEpoch, acc.currentDifficulty);
    return [...at]
      .filter(([epoch]) => epoch <= acc.currentEpoch)
      .map(([epoch, difficulty]) => ({ epoch, difficulty }))
      .sort((a, b) => a.epoch - b.epoch);
  }, [acc, ring, table]);

  const epochs = useMemo(() => history.slice(-depth), [history, depth]);
  const means = useMemo(() => (view === 'mean' ? trailingMeans(epochs, history, span) : null), [view, epochs, history, span]);

  const next = acc?.nextDifficulty;
  const blocksIn = acc ? EPOCH_LENGTH - acc.blocksLeftInEpoch : 0;
  const statuses = ['waiting', 'in_window', 'settleable', 'refundable'];
  const counts = market ? [market.waiting, market.inWindow, market.settleable, market.refundable] : null;

  return (
    <>
      <div className={m.hero}>
        <div className={m.card}>
          <div className={m.label}>Difficulty now</div>
          <div className={s.bigDiff}>{acc ? fmtDifficulty(acc.currentDifficulty, 2) : '—'}</div>
          <div className={s.nextRow}>
            <span className={m.label} style={{ color: COLORS.next }}>
              {next ? (heights ? `From block ${fmtInt(epochStart(next.epoch))}` : `Next epoch ${fmtInt(next.epoch)}`) : 'Next epoch'}
            </span>
            {next ? (
              <span className={s.nextValue}>
                {fmtDifficulty(next.difficulty, 2)}
                <span className={s.movePill} style={{ '--pill-color': next.change >= 0 ? COLORS.long : COLORS.short }}>
                  {fmtMove(next.change, 1)}
                </span>
              </span>
            ) : (
              <span className={m.kvValDim}>—</span>
            )}
          </div>
          <p className={m.cardNote} style={{ marginTop: 10 }}>
            Ergo resets its difficulty every {fmtInt(EPOCH_LENGTH)} blocks, about {fmtSpan(EPOCH_LENGTH)}, based on block times from the last epoch.
             Every bet here is on the average of those difficulties over a window.{' '}
            {next
              ? next.exact
                ? 'Final: the current epoch has ended, so this is the difficulty the next blocks carry.'
                : `Projected with Ergo's retarget rule from ${fmtInt(blocksIn)} of ${EPOCH_LENGTH} blocks. It is close only late in the epoch.`
              : acc?.nextDifficultyUnavailable ?? 'Waiting for the client.'}
          </p>
        </div>

        <div className={m.card}>
          <div className={m.cardHead}>
            <h3 className={m.cardTitle}>The market</h3>
            {market?.truncated && <span className={m.label}>partial count</span>}
          </div>
          <div className={s.oiRow}>
            <div>
              <div className={m.label} title="Each open position's margin: the most that can change hands across all of them">
                At stake
              </div>
              <div className={s.oiValue}>
                {market ? fmtLit(marginOf(market.openInterest), 0) : '—'}
                <span className={s.kpiUnit}>LIT</span>
              </div>
              <div className={s.kpiSub}>margin across {market ? fmtInt(market.positions) : '—'} open positions</div>
            </div>
            <div className={s.statusCounts}>
              {statuses.map((st, i) => (
                <span key={st} className={s.statusCount}>
                  <StatusChip status={st} />
                  <b>{counts ? fmtInt(counts[i]) : '—'}</b>
                </span>
              ))}
            </div>
          </div>
          <div className={m.label} style={{ marginTop: 14 }}>
            Waiting for a taker
          </div>
          <BookBar longs={market?.longs} shorts={market?.shorts} />
        </div>

        <div className={`${m.card} ${m.ringCard}`}>
          <div className={m.label}>{heights ? 'Until difficulty changes' : 'Current epoch'}</div>
          <EpochRing acc={acc} heights={heights} />
          <div className={m.ringRows}>
            <div className={m.kv}>
              <span className={m.kvKey}>Ends in</span>
              <span className={m.kvVal}>{acc ? `${fmtInt(acc.blocksLeftInEpoch)} blocks` : '—'}</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>First window</span>
              <span className={m.kvVal}>{acc ? fmtEpochAt(acc.limits.minWindowStart, heights) : '—'}</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Recorded to</span>
              <span className={m.kvVal}>
                {acc?.lastEpoch != null ? (heights ? `block ${fmtInt((acc.lastEpoch + 1) * EPOCH_LENGTH)}` : `epoch ${fmtInt(acc.lastEpoch)}`) : '—'}
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Recording funded</span>
              <span className={m.kvVal}>
                {market?.epochsFunded != null ? fmtEpochs(market.epochsFunded, heights) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={m.card}>
        <div className={m.cardHead}>
          <h3 className={m.cardTitle}>
            Difficulty by {heights ? 'block range' : 'epoch'} {busy && <Spinner />}
          </h3>
          <div className={m.controls}>
            <div className={m.legend}>
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`${m.legendBtn} ${view === v.id ? m.legendOn : m.legendOff}`}
                  style={view === v.id ? { '--legend-color': v.color } : undefined}
                  onClick={() => setView(v.id)}
                  aria-pressed={view === v.id}
                >
                  <span className={m.swatch} style={{ background: v.color }} />
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'mean' && (
              <div className={m.controls} style={{ flexWrap: 'nowrap' }}>
                <span className={m.label}>window</span>
                <div className={m.seg}>
                  {SPANS.map((l) => (
                    <button key={l} type="button" className={`${m.segBtn} ${span === l ? m.segBtnOn : ''}`} onClick={() => setSpan(l)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={m.controls} style={{ flexWrap: 'nowrap' }}>
              <span className={m.label}>{heights ? 'epochs of 128 blocks' : 'epochs'}</span>
              <div className={m.seg}>
                {DEPTHS.map((d) => (
                  <button key={d} type="button" className={`${m.segBtn} ${depth === d ? m.segBtnOn : ''}`} onClick={() => setDepth(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <EpochStrip
          epochs={epochs}
          next={next}
          current={acc?.currentEpoch}
          future={Math.max(4, Math.round(depth / 10))}
          width={1120}
          heights={heights}
          means={means}
          span={span}
        />
        <p className={m.cardNote} style={{ marginTop: 10 }}>
          {view === 'mean'
            ? `Each point is the mean of its epoch and the ${span - 1} before it: what a ${span}-epoch window ending there settles on. `
            : acc?.deployed
              ? 'Bars are the difficulties the accumulator recorded, which every settlement reads. '
              : 'Bars are Ergo difficulty by epoch. '}
          The outlined bar is the next epoch, computed from block timestamps; dashed while projected. No window can
          include it, so windows start {acc ? fmtEpochs(acc.limits.minWindowStart - acc.currentEpoch, heights) : '2 epochs'} out
          (about {fmtSpan(acc ? acc.blocksLeftInEpoch + EPOCH_LENGTH : EPOCH_LENGTH * 2)} from now), in the hatched
          area. Each epoch is {fmtInt(EPOCH_LENGTH)} blocks, about {fmtSpan(EPOCH_LENGTH)}.
        </p>
      </div>
    </>
  );
}

/** The move a strike implies against the next epoch's difficulty, or against the current one before it is known. */
export function impliedAgainst(acc) {
  const base = acc?.nextDifficulty?.difficulty ?? acc?.currentDifficulty;
  return (strike) => moveOf(strike, base);
}
