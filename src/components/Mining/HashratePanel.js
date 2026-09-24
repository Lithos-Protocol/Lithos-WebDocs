import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useMining } from './MiningLayout';
import { SeriesChart, EpochBars } from './charts';
import { Spinner, PartialTag } from '../Dex/ui';
import {
  big,
  fmtDifficulty,
  fmtDuration,
  fmtHashrate,
  fmtInt,
  fmtIntCompact,
  fmtNum,
  fmtPct,
  fullTime,
  metric,
  rateFrom,
  shareOf,
  splitHashrate,
  timeLabel,
} from './format';
import { NISP_COEFFICIENT } from './trade';

/*
 * One colour per actor, fixed for the whole page: cyan is the Ergo network, purple is Lithos,
 * amber is this client's own workers. Every chart, rail and legend below reuses these, so a colour
 * means the same thing wherever it appears.
 */
const NETWORK = '#38bdf8';
const LITHOS = '#a855f7';
const LOCAL = '#fbbf24';

const EPOCH_WINDOWS = [
  { id: 48, label: '48' },
  { id: 128, label: '128' },
  { id: 256, label: '256' },
  { id: 512, label: '512' },
];

/** A radial gauge for the adoption share, swept from the left like a speedometer. */
function AdoptionDial({ share, blocks, chainBlocks }) {
  const R = 84;
  const CX = 100;
  const CY = 100;
  // 240 degrees of sweep starting bottom-left, which leaves the numbers room underneath.
  const START = 150;
  const SWEEP = 240;
  const pt = (deg, r) => [
    CX + r * Math.cos((deg * Math.PI) / 180),
    CY + r * Math.sin((deg * Math.PI) / 180),
  ];
  const arc = (fromDeg, toDeg, r) => {
    const [x1, y1] = pt(fromDeg, r);
    const [x2, y2] = pt(toDeg, r);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const clamped = share == null ? 0 : Math.max(0, Math.min(1, share));
  /*
   * A real share of Lithos blocks can be a fraction of a percent, which on a linear sweep is
   * indistinguishable from zero. The needle uses a square root so the low end has room to move,
   * and the tick marks below say where the linear values actually sit.
   */
  const swept = Math.sqrt(clamped) * SWEEP;

  return (
    <div className={s.dialWrap}>
      <svg viewBox="0 0 200 200" className={s.dialSvg} role="img" aria-label="Lithos adoption share">
        <defs>
          <linearGradient id="mineDial" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path
          d={arc(START, START + SWEEP, R)}
          fill="none"
          stroke="rgba(125,211,252,0.1)"
          strokeWidth="13"
          strokeLinecap="round"
        />
        {swept > 0.4 && (
          <path
            d={arc(START, START + swept, R)}
            fill="none"
            stroke="url(#mineDial)"
            strokeWidth="13"
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        )}
        {/* Quartile ticks, labelled with the share they stand for under the same curve. */}
        {[0.01, 0.1, 0.25, 0.5, 1].map((f) => {
          const deg = START + Math.sqrt(f) * SWEEP;
          const [x1, y1] = pt(deg, R - 10);
          const [x2, y2] = pt(deg, R + 10);
          return (
            <line
              key={f}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(6,9,19,0.85)"
              strokeWidth="1.6"
            />
          );
        })}
      </svg>
      <div className={s.dialCore}>
        <div className={s.dialValue}>
          <span className={s.flowNum}>
            {share == null ? '—' : fmtNum(clamped * 100, clamped < 0.01 ? 3 : 1)}
          </span>
          <span className={s.dialUnit}>%</span>
        </div>
        <div className={s.dialCaption}>of network work</div>
        <div className={s.dialCaption} style={{ marginTop: 2 }}>
          {fmtInt(blocks)} / {fmtInt(chainBlocks)} blocks
        </div>
      </div>
    </div>
  );
}

/**
 * The three hashrates as one stack.
 *
 * Bars are log-scaled on purpose. A solo miner and the Ergo network can be six orders of magnitude
 * apart, and on a linear bar the miner's own rate is a rounding error against the edge of the
 * card — which is true but useless. The note under the stack says the scale is logarithmic so
 * nobody reads bar length as a ratio.
 */
function Rails({ rows }) {
  const top = rows.reduce((m, r) => {
    const v = r.raw == null ? 0 : Number(big(r.raw));
    return v > m ? v : m;
  }, 0);
  const width = (raw) => {
    if (raw == null || top <= 0) return 0;
    const v = Number(big(raw));
    if (v <= 0) return 0;
    return Math.max(2, (Math.log10(v + 1) / Math.log10(top + 1)) * 100);
  };

  return (
    <div className={s.rails}>
      {rows.map((r) => {
        const { value, unit } = splitHashrate(r.raw);
        return (
          <div className={s.rail} key={r.id}>
            <div className={s.railTop}>
              <span className={s.swatch} style={{ background: r.color }} />
              <span className={s.railName}>{r.label}</span>
            </div>
            <div className={s.railValue}>
              {value ?? '—'}
              {value != null && <span className={s.railUnit}>{unit}</span>}
            </div>
            <div className={s.railTrack}>
              <div
                className={s.railFill}
                style={{
                  width: `${width(r.raw)}%`,
                  background: `linear-gradient(90deg, ${r.color}, ${r.color}55)`,
                }}
              />
            </div>
            <div className={s.railSub}>{r.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Milliseconds per block across the epoch in progress, or null before it has two blocks. Any
 * projection from it assumes the blocks still to come arrive the way the ones so far did.
 */
function blockPaceMs(current) {
  const done = current ? current.endHeight - current.startHeight + 1 : 0;
  const elapsed = current ? current.endTimestamp - current.startTimestamp : 0;
  return done > 1 && elapsed > 0 ? elapsed / (done - 1) : null;
}

/**
 * What reduced reporting means for the hashrate reading at the stratum's multiplier. A client that
 * does not report one always reduced by the full coefficient.
 */
function reductionNote(reported) {
  const multiplier = Number(reported ?? NISP_COEFFICIENT);
  const sent =
    multiplier >= NISP_COEFFICIENT
      ? 'your miners send only super shares'
      : `your miners send shares at ${fmtInt(multiplier)}× your diff, about ${fmtInt(NISP_COEFFICIENT / multiplier)} per super share`;
  return `Reduced share reporting is on: ${sent}, and each is credited that difficulty's work. Your hashrate display may be less accurate or more volatile.`;
}

/**
 * Whether the super shares found so far make a NISP, drawn as the ten it needs.
 *
 * Only the window counts, not the session: a NISP takes ten super shares from the blocks just
 * before a rollup starts, so older ones earn nothing however many there were.
 */
function NispMeter({ nisp, blockMs }) {
  if (!nisp) {
    return (
      <div className={s.nisp}>
        <div className={s.nispHead}>
          <span className={s.label}>NISP</span>
        </div>
        <p className={s.cardNote}>Waiting for a Stratum job to measure the window from.</p>
      </div>
    );
  }
  const have = Math.min(nisp.superSharesInWindow, nisp.required);
  const left = nisp.blocksRemaining ?? 0;
  const lasts =
    left === 0
      ? 'this block only'
      : `${fmtInt(left)} more block${left === 1 ? '' : 's'}${
          blockMs ? `, about ${fmtDuration(left * blockMs)}` : ''
        }`;

  return (
    <div className={`${s.nisp} ${nisp.held ? s.nispHeld : ''}`}>
      <div className={s.nispHead}>
        <span className={s.label}>NISP</span>
        <span className={`${s.nispBadge} ${nisp.held ? s.nispBadgeOn : ''}`}>
          {nisp.held ? 'ready' : `${have} / ${nisp.required}`}
        </span>
      </div>
      <div className={s.nispPips}>
        {Array.from({ length: nisp.required }).map((_, i) => (
          <span
            key={i}
            className={`${s.nispPip} ${i < have ? s.nispPipOn : ''}`}
            style={i < have ? { animationDelay: `${-i * 0.5}s` } : undefined}
          />
        ))}
      </div>
      <p className={s.nispLine}>
        {nisp.held ? (
          <>
            Covers rollups starting up to block{' '}
            <span className={s.nispNum}>{fmtInt(nisp.validThroughHeight)}</span> — {lasts}.
          </>
        ) : (
          <>
            {nisp.required - have} more super share{nisp.required - have === 1 ? '' : 's'} needed
            within the last {fmtInt(nisp.windowBlocks)} blocks.
          </>
        )}
      </p>
    </div>
  );
}

/** Progress through the epoch in progress, and what it means for the next retarget. */
function EpochRing({ current, epochLength }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const done = current ? current.endHeight - current.startHeight + 1 : 0;
  const frac = current && epochLength ? Math.max(0, Math.min(1, done / epochLength)) : 0;
  const remaining = current && epochLength ? Math.max(0, epochLength - done) : null;
  const perBlock = blockPaceMs(current);

  return (
    <>
      <div className={s.ringWrap}>
        <svg viewBox="0 0 132 132" className={s.dialSvg} role="img" aria-label="Epoch progress">
          <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(125,211,252,0.1)" strokeWidth="9" />
          <circle
            cx="66"
            cy="66"
            r={R}
            fill="none"
            stroke={NETWORK}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(C * frac).toFixed(2)} ${C.toFixed(2)}`}
            transform="rotate(-90 66 66)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className={s.ringCore}>
          <div className={s.ringValue}>{fmtPct(frac, 0)}</div>
          <div className={s.ringLabel}>epoch {current ? fmtInt(current.index) : '—'}</div>
        </div>
      </div>
      <div className={s.ringRows}>
        <div className={s.kv}>
          <span className={s.kvKey}>Blocks in</span>
          <span className={s.kvVal}>
            {fmtInt(done)} / {fmtInt(epochLength ?? 0)}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Retarget in</span>
          <span className={s.kvVal}>
            {remaining == null ? '—' : `${fmtInt(remaining)} blocks`}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Est. time</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {perBlock != null && remaining != null ? `~${fmtDuration(perBlock * remaining)}` : '—'}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Block pace</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {perBlock != null ? fmtDuration(perBlock) : '—'}
          </span>
        </div>
      </div>
    </>
  );
}

export default function HashratePanel() {
  const { stats, workers, tick } = useMining();

  const [rangeId, setRangeId] = useState('24H');
  // One series at a time now, so a linear axis no longer has to span six orders of magnitude.
  const [logScale, setLogScale] = useState(false);
  const [view, setView] = useState('lithos');
  const [epochLimit, setEpochLimit] = useState(128);
  const [hoveredEpoch, setHoveredEpoch] = useState(null);

  const [buckets, setBuckets] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [local, setLocal] = useState(null);
  const [epochs, setEpochs] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(null);

  // The range and epoch depth the data on screen belongs to.
  const shown = useRef(null);

  const load = useCallback(() => {
    const range = api.alignedRange(rangeId);
    const key = `${rangeId}:${epochLimit}`;
    const same = shown.current === key;
    setBusy(true);
    Promise.all([
      api.getBuckets(range).catch((failure) => ({ failure })),
      api.getHashrate(range).catch(() => null),
      api.getWorkerHistory(range).catch(() => null),
      api.getDifficultyEpochs({ limit: epochLimit }).catch(() => null),
    ])
      .then(([b, h, l, e]) => {
        /*
         * A series that fails one poll keeps its last reading instead of blanking. A new range or
         * depth starts clean, so nothing from the old selection is shown under the new label.
         */
        const pick = (next, set) => {
          if (next != null || !same) set(next);
        };
        if (!b.failure) {
          setBuckets({ ...b, range });
          setErr(null);
        } else if (!same) {
          setBuckets(null);
          setErr(b.failure.message);
        }
        pick(h, setEstimate);
        pick(l, setLocal);
        pick(e, setEpochs);
        shown.current = key;
      })
      .finally(() => setBusy(false));
  }, [rangeId, epochLimit]);

  useEffect(load, [load, tick]);

  /*
   * The bucket endpoints only return intervals that had retained activity, so the response is
   * sparse. A chart needs a dense axis or a quiet hour would shift every later point left, so the
   * range is rebuilt here in full and the response indexed onto it by bucket start. An interval
   * with no bucket becomes null, which the chart draws as a break rather than a zero.
   */
  const model = useMemo(() => {
    if (!buckets?.range) return null;
    const { from, until, widthMs, interval } = buckets.range;
    const seconds = widthMs / 1000;
    const starts = [];
    for (let t = from; t < until; t += widthMs) starts.push(t);

    const byStart = new Map((buckets.buckets ?? []).map((b) => [Number(b.start), b]));
    const localByStart = new Map((local?.points ?? []).map((p) => [Number(p.start), p]));

    let chainWork = 0n;
    let lithosWork = 0n;
    let lithosBlocks = 0n;
    let chainBlocks = 0n;

    const network = [];
    const lithos = [];
    const mine = [];
    const adoption = [];

    starts.forEach((t) => {
      const b = byStart.get(t);
      if (b) {
        chainWork += metric(b, 'chain.difficultySum');
        lithosWork += metric(b, 'lithos.difficultySum');
        chainBlocks += metric(b, 'chain.blocks');
        lithosBlocks += metric(b, 'lithos.blocks');
      }
      const chainRate = b ? rateFrom(metric(b, 'chain.difficultySum'), widthMs) : null;
      const lithosRate = b ? rateFrom(metric(b, 'lithos.difficultySum'), widthMs) : null;
      const share = b ? shareOf(metric(b, 'lithos.difficultySum'), metric(b, 'chain.difficultySum')) : null;
      const lp = localByStart.get(t);

      network.push(chainRate == null ? null : { y: Number(big(chainRate)), raw: chainRate });
      lithos.push(lithosRate == null ? null : { y: Number(big(lithosRate)), raw: lithosRate });
      adoption.push(share == null ? null : { y: share * 100, raw: share });
      mine.push(
        lp == null || big(lp.hashesPerSecond) <= 0n
          ? null
          : {
              y: Number(big(lp.hashesPerSecond)),
              raw: lp.hashesPerSecond,
              shares: lp.acceptedShares,
            },
      );
    });

    return {
      starts,
      interval,
      seconds,
      network,
      lithos,
      mine,
      adoption,
      // Window totals, which are what the hero reads — a per-bucket rate is far noisier than the
      // whole window, and the headline should be the steadier number.
      windowNetwork: rateFrom(chainWork, starts.length * widthMs),
      windowLithos: rateFrom(lithosWork, starts.length * widthMs),
      share: shareOf(lithosWork, chainWork),
      lithosBlocks,
      chainBlocks,
      measuredLocal: (local?.points ?? []).length,
    };
  }, [buckets, local]);

  const epochBars = useMemo(
    () =>
      (epochs?.epochs ?? []).map((e) => ({
        ...e,
        value: Number(big(e.difficulty)),
        networkRate: e.hashesPerSecond ?? null,
      })),
    [epochs],
  );

  /*
   * One series on the chart at a time. Stacked, the three fought over one axis: the network
   * flattened the other two against the floor, and their fills muddied each other.
   */
  const series = useMemo(() => {
    if (!model) return [];
    const all = [
      {
        id: 'network',
        label: 'Network',
        color: NETWORK,
        area: true,
        areaOpacity: 0.32,
        points: model.network,
        format: (p) => fmtHashrate(p.raw),
      },
      {
        id: 'lithos',
        label: 'Lithos',
        color: LITHOS,
        area: true,
        areaOpacity: 0.32,
        points: model.lithos,
        format: (p) => fmtHashrate(p.raw),
      },
      {
        id: 'mine',
        label: 'Your workers',
        color: LOCAL,
        area: true,
        areaOpacity: 0.32,
        points: model.mine,
        format: (p) => fmtHashrate(p.raw),
      },
    ];
    return all.filter((l) => l.id === view);
  }, [model, view]);

  const localRate = workers?.hashesPerSecond ?? null;
  const epochLength = epochs?.epochLength ?? 128;

  return (
    <>
      {/* ---- Hero ---- */}
      <div className={s.hero}>
        <div className={`${s.card} ${s.dialCard}`}>
          <div className={s.label}>Lithos adoption</div>
          <AdoptionDial
            share={model?.share}
            blocks={model?.lithosBlocks ?? 0}
            chainBlocks={model?.chainBlocks ?? 0}
          />
          <p className={s.cardNote} style={{ marginTop: 12 }}>
            How many Ergo blocks over the last {rangeId} that were mined by Lithos.
          </p>
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Hashrate now</h3>
            <span className={s.label}>{rangeId} window</span>
          </div>
          <Rails
            rows={[
              {
                id: 'network',
                label: 'Ergo network',
                color: NETWORK,
                raw: model?.windowNetwork,
                sub: `${fmtInt(model?.chainBlocks ?? 0)} blocks processed`,
              },
              {
                id: 'lithos',
                label: 'Lithos (estimated)',
                color: LITHOS,
                raw: estimate?.hashesPerSecond ?? model?.windowLithos,
                sub:
                  estimate == null
                    ? 'sampled from Lithos blocks'
                    : estimate.status === 'insufficient-data'
                      ? 'not enough blocks sampled yet'
                      : `${fmtInt(estimate.sampleCount)} blocks sampled${
                          estimate.relativeSamplingError
                            ? ` · ±${fmtNum(estimate.relativeSamplingError * 100, 0)}%`
                            : ''
                        }${estimate.status === 'sparse' ? ' · sparse' : ''}`,
              },
              {
                id: 'mine',
                label: 'Your workers',
                color: LOCAL,
                raw: localRate,
                sub:
                  workers == null
                    ? '—'
                    : localRate == null
                      ? 'no accepted shares yet this session'
                      : Number(workers.windowMs ?? 0) > 0
                        ? `${fmtIntCompact(workers.windowShares)} shares in the last ${fmtDuration(
                            Number(workers.windowMs),
                          )}`
                        : `${fmtIntCompact(workers.acceptedShares)} shares accepted`,
              },
            ]}
          />
          <p className={s.cardNote} style={{ marginTop: 14 }}>
            Bars are log-scaled and show expected hashes per second.
          </p>
        </div>

        <div className={`${s.card} ${s.ringCard}`}>
          <div className={s.label}>Difficulty epoch</div>
          <EpochRing current={epochs?.current} epochLength={epochLength} />
        </div>
      </div>

      {/* ---- Hashrate over time ---- */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>
            Hashrate over time {busy && <Spinner />}
          </h3>
          <div className={s.controls}>
            <div className={s.legend}>
              {[
                { id: 'network', label: 'Network', color: NETWORK },
                { id: 'lithos', label: 'Lithos', color: LITHOS },
                { id: 'mine', label: 'Yours', color: LOCAL },
              ].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`${s.legendBtn} ${view === l.id ? s.legendOn : s.legendOff}`}
                  style={view === l.id ? { '--legend-color': l.color } : undefined}
                  onClick={() => setView(l.id)}
                  aria-pressed={view === l.id}
                >
                  <span className={s.swatch} style={{ background: l.color }} />
                  {l.label}
                </button>
              ))}
            </div>
            <div className={s.seg}>
              {api.RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`${s.segBtn} ${rangeId === r.id ? s.segBtnOn : ''}`}
                  onClick={() => setRangeId(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className={s.seg}>
              {[
                { id: true, label: 'LOG' },
                { id: false, label: 'LIN' },
              ].map((o) => (
                <button
                  key={String(o.id)}
                  type="button"
                  className={`${s.segBtn} ${logScale === o.id ? s.segBtnOn : ''}`}
                  onClick={() => setLogScale(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {err ? (
          <div className={s.empty}>{err}</div>
        ) : (
          <SeriesChart
            series={series}
            xs={model?.starts ?? []}
            log={logScale}
            height={252}
            xLabel={(t) => timeLabel(t, model?.interval)}
            yFormat={(v) => fmtHashrate(Math.max(0, Math.round(v)), 1)}
            tooltipTitle={(t) => fullTime(t)}
            animateKey={`${view}:${rangeId}:${logScale}`}
            emptyLabel={
              busy
                ? 'Loading…'
                : view === 'mine'
                  ? 'No share work measured in this window yet.'
                  : 'No collected history in this window yet.'
            }
          />
        )}
        <p className={s.cardNote} style={{ marginTop: 10 }}>
          Dashed areas represent parts where hashrate was not tracked or could not be determined.
          {buckets?.partial && (
            <>
              {' '}
              <PartialTag />
            </>
          )}
        </p>
      </div>

      {/* ---- Difficulty by epoch ---- */}
      <div className={`${s.card} ${s.stackGap}`}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>Network difficulty by epoch</h3>
          <div className={s.controls}>
            <span className={s.label}>epochs</span>
            <div className={s.seg}>
              {EPOCH_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`${s.segBtn} ${epochLimit === w.id ? s.segBtnOn : ''}`}
                  onClick={() => setEpochLimit(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <EpochBars
          epochs={epochBars}
          yFormat={(v) => fmtDifficulty(Math.max(0, Math.round(v)), 1)}
          height={224}
          hovered={hoveredEpoch}
          onHover={setHoveredEpoch}
          tooltip={(e) => (
            <>
              <div className={s.hoverTipLabel}>
                Epoch {fmtInt(e.index)}
                {!e.complete && ' · in progress'}
              </div>
              <div className={s.hoverTipRow}>
                <span className={s.hoverTipLabel}>Difficulty</span>
                <span className={s.hoverTipValue}>{fmtDifficulty(e.difficulty)}</span>
              </div>
              <div className={s.hoverTipRow}>
                <span className={s.hoverSwatch} style={{ background: NETWORK }} />
                <span className={s.hoverTipLabel}>Network</span>
                <span className={s.hoverTipValue}>{fmtHashrate(e.networkRate)}</span>
              </div>
              <div className={s.hoverTipRow}>
                <span className={s.hoverTipLabel}>Heights</span>
                <span className={s.hoverTipValue}>
                  {fmtInt(e.startHeight)}–{fmtInt(e.endHeight)}
                </span>
              </div>
              <div className={s.hoverTipRow}>
                <span className={s.hoverTipLabel}>Started</span>
                <span className={s.hoverTipValue}>{fullTime(e.startTimestamp)}</span>
              </div>
            </>
          )}
        />
        <p className={s.cardNote} style={{ marginTop: 10 }}>
          One bar per difficulty epoch of {fmtInt(epochLength)} blocks. 
          
          {epochs && epochs.backfillComplete === false && (
            <> Older epochs are still being filled in.</>
          )}
        </p>
      </div>

      {/* ---- Super shares + workers ---- */}
      <div className={s.split}>
        <div className={`${s.card}`}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Super shares</h3>
            <span className={s.label}>this session</span>
          </div>
          <div className={s.bigStat}>
            <span className={`${s.bigStatValue} ${s.flowNum}`}>
              {fmtInt(workers?.superShares ?? 0)}
            </span>
            <span className={s.bigStatUnit}>
              found
              {workers?.superSharesPerHour != null &&
                ` · ${fmtNum(workers.superSharesPerHour, 2)}/h`}
            </span>
          </div>
          <NispMeter nisp={workers?.nisp} blockMs={blockPaceMs(epochs?.current)} />
          <p className={s.cardNote} style={{ marginTop: 12 }}>
            A super share is an accepted share that is rare and hard to find. These shares are collected to make NISPs,
            meaning that hitting at least 10 determines whether or not you get paid for a block.
          </p>
          <div className={s.chips}>
            <span className={s.chip}>
              block candidates <span className={s.chipNum}>{fmtInt(workers?.blockCandidates ?? 0)}</span>
            </span>
            <span className={s.chip}>
              solutions taken <span className={s.chipNum}>{fmtInt(workers?.solutionsAccepted ?? 0)}</span>
            </span>
            {Number(workers?.solutionsRejected ?? 0) > 0 && (
              <span className={`${s.chip} ${s.chipWarn}`}>
                rejected <span className={s.chipNum}>{fmtInt(workers.solutionsRejected)}</span>
              </span>
            )}
          </div>
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Your workers</h3>
            {/* Connections, not workers: one miner may hold several, and the client cannot tell. */}
            <span className={s.label}>
              {stats?.local?.stratum?.connectedConnections != null
                ? `${fmtInt(stats.local.stratum.connectedConnections)} connection${
                    Number(stats.local.stratum.connectedConnections) === 1 ? '' : 's'
                  }`
                : 'stratum'}
            </span>
          </div>
          <div className={s.rows}>
            <div className={s.kv}>
              <span className={s.kvKey}>Hashrate</span>
              <span className={s.kvVal}>{fmtHashrate(localRate)}</span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Accepted</span>
              <span className={s.kvVal}>{fmtInt(workers?.acceptedShares ?? 0)}</span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Rejected</span>
              <span className={s.kvVal}>{fmtInt(workers?.rejectedShares ?? 0)}</span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Reject rate</span>
              <span className={`${s.kvVal} ${s.kvValDim}`}>
                {(() => {
                  const a = Number(workers?.acceptedShares ?? 0);
                  const r = Number(workers?.rejectedShares ?? 0);
                  return a + r > 0 ? fmtPct(r / (a + r), 2) : '—';
                })()}
              </span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Session up</span>
              <span className={`${s.kvVal} ${s.kvValDim}`}>
                {workers?.sessionStartedAt && workers?.observedAt
                  ? fmtDuration(workers.observedAt - workers.sessionStartedAt)
                  : '—'}
              </span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Measured intervals</span>
              <span className={`${s.kvVal} ${s.kvValDim}`}>{fmtInt(model?.measuredLocal ?? 0)}</span>
            </div>
          </div>

          {Object.keys(workers?.rejections ?? {}).length > 0 && (
            <div className={s.chips}>
              {Object.entries(workers.rejections).map(([code, count]) => (
                <span key={code} className={`${s.chip} ${s.chipWarn}`}>
                  {code.replace(/^rejected/, 'code ')} <span className={s.chipNum}>{fmtInt(count)}</span>
                </span>
              ))}
            </div>
          )}

          {workers?.reducedReporting && (
            <p className={s.cardNote} style={{ marginTop: 12 }}>
              {reductionNote(stats?.local?.stratum?.difficulty?.reductionMultiplier)}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
