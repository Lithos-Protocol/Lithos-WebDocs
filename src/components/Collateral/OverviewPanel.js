import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import { big, fmtErgAmount, fmtTokenAmount, fmtInt } from './format';
import { Alert, Row, Spinner, PartialTag, CubeGlyph } from './ui';

/* ============================================================
   Emission card
   ============================================================ */

const PHASE_CLASS = {
  DECAYING: 'cmPhaseDecaying',
  STEPPED: 'cmPhaseStepped',
  FLAT_50: 'cmPhaseFlat',
  ENDED: 'cmPhaseEnded',
};

function EmissionCard({ market }) {
  const phase = String(market.emissionPhase ?? '');
  const badgeCls = s[PHASE_CLASS[phase] ?? ''] ?? '';

  // The schedule counts LITHOS BLOCKS FUNDED, not Ergo chain height — those two
  // are wildly different numbers. R4 of the emission contract (activationCounter)
  // is what actually drives rates, so it is what "now" means here.
  const counter = Number(market.activationCounter ?? 0);
  const next = market.nextPhaseChangeHeight != null ? Number(market.nextPhaseChangeHeight) : null;
  const end = market.scheduleEndsAtHeight != null ? Number(market.scheduleEndsAtHeight) : null;

  const pct = (v) =>
    end && end > 0 && v != null ? Math.max(0, Math.min(100, (v / end) * 100)) : null;

  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>Emission</h3>
      <p className={s.cardDesc}>
        LIT leaves the emission contract every time a Lithos block is funded. Miners earn most of
        it; lenders see its pace in how fast their positions turn over.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: '0.9rem',
        }}
      >
        <span className={`${s.cmPhaseBadge} ${badgeCls}`}>{phase.toLowerCase() || 'unknown'}</span>
        {market.foundersActive && (
          <span
            className={`${s.cmPhaseBadge} ${s.cmPhaseStepped}`}
            title="A founder share is still being emitted alongside the public rate"
          >
            founders active
          </span>
        )}
      </div>

      <div className={s.summary} style={{ marginTop: 0 }}>
        <Row
          label="Miner rate"
          value={`${fmtTokenAmount(market.emissionRatePublicLit, 9, 3)} LIT / block`}
          accent
        />
        <Row
          label="Founder rate"
          value={`${fmtTokenAmount(market.emissionRatePrivateLit, 9, 3)} LIT / block`}
        />
        <Row
          label="Combined"
          value={`${fmtTokenAmount(market.emissionRateTotalLit, 9, 3)} LIT / block`}
        />
        <Row label="Epoch" value={fmtInt(market.currentEpoch)} />
        {/* Same activation-counter space as the track below — Lithos blocks
            funded, not Ergo chain height. */}
        <Row
          label="Next phase change"
          value={next != null ? `Lithos block ${fmtInt(next)}` : 'none scheduled'}
        />
      </div>

      {end != null && (
        <>
          <div className={s.cmTrackWrap}>
            <div className={s.cmTrack}>
              <div className={s.cmFill} style={{ width: `${pct(counter) ?? 0}%` }} />
            </div>
            {pct(end) != null && (
              <div
                className={`${s.cmMarker} ${s.cmMarkerEnd}`}
                style={{ left: `calc(${pct(end)}% - 2px)` }}
                title={`Schedule ends at activation ${fmtInt(end)}`}
              />
            )}
          </div>
          <div className={s.cmTrackLabels}>
            <span>now · {fmtInt(counter)} Lithos blocks funded</span>
            <span>ends at {fmtInt(end)}</span>
          </div>
        </>
      )}

      {end != null && (
        <div className={s.cmFootnote}>
          Progress follows the emission contract&rsquo;s activation counter, which shows how many
          Lithos blocks have been funded and mined.
        </div>
      )}

      {market.foundersActive && (
        <Alert kind="info">
          Founder emission runs alongside the public mining rate. Both are released only
          when blocks are mined by the pool.
        </Alert>
      )}
    </div>
  );
}

/* ============================================================
   Permit curve card
   ============================================================ */

const W = 760;
const H = 260;
const PAD = { t: 18, r: 18, b: 32, l: 70 };
const MAX_POINTS_DRAWN = 400;

/** Even-step sampling so a >500-position series stays one smooth polyline. */
function sample(points, cap) {
  if (points.length <= cap) return points;
  const step = Math.ceil(points.length / cap);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function PermitChart({ points, market }) {
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const model = useMemo(() => {
    if (!points?.length) return null;

    const floor = big(market?.permitFloorLit);
    const slope = big(market?.permitSlopeLitPerBox);
    const ceiling = big(market?.permitCeilingLit);
    const head = big(market?.queueHead);
    const hasCurve = ceiling > 0n;

    // Theoretical price at a queue position under today's anchors.
    const theo = (pos) =>
      hasCurve
        ? (() => {
            const raw = floor + slope * (big(pos) - head);
            return raw < 0n ? 0n : raw > ceiling ? ceiling : raw;
          })()
        : null;

    const drawn = sample(
      points.map((p) => ({ pos: big(p.position), v: big(p.permitLit) })),
      MAX_POINTS_DRAWN,
    );

    const minPos = drawn[0].pos;
    const maxPos = drawn[drawn.length - 1].pos;

    let maxY = drawn.reduce((a, p) => (p.v > a ? p.v : a), 0n);
    if (hasCurve) {
      for (let i = 0; i <= 24; i++) {
        const t = theo(minPos + ((maxPos - minPos) * BigInt(i)) / 24n);
        if (t > maxY) maxY = t;
      }
    }
    if (maxY === 0n) return null;

    const x = (pos) => {
      if (maxPos === minPos) return PAD.l + innerW / 2;
      const f = Number(((pos - minPos) * 1_000_000n) / (maxPos - minPos)) / 1_000_000;
      return PAD.l + f * innerW;
    };
    const y = (v) => {
      const f = Number((big(v) * 1_000_000n) / maxY) / 1_000_000;
      return PAD.t + innerH - f * innerH;
    };

    const line = drawn
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.pos).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(' ');

    const curvePts = [];
    if (hasCurve) {
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const pos = minPos + ((maxPos - minPos) * BigInt(i)) / BigInt(steps);
        curvePts.push([x(pos), y(theo(pos))]);
      }
    }
    const curve = curvePts.length
      ? curvePts
          .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`)
          .join(' ')
      : '';

    // Y ticks scaled to the magnitude plotted, like every other chart here.
    const maxDisplay = Number(maxY) / 1e9;
    const dp = maxDisplay >= 100 ? 0 : maxDisplay >= 1 ? 1 : 3;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: PAD.t + innerH - f * innerH,
      label: fmtTokenAmount((maxY * BigInt(Math.round(f * 1000))) / 1000n, 9, dp),
    }));

    const stepN = Math.max(1, Math.floor(drawn.length / 5));
    const xTicks = drawn
      .filter((_, i) => i % stepN === 0 || i === drawn.length - 1)
      .map((p) => ({ x: x(p.pos), label: `#${fmtInt(p.pos)}` }));

    return {
      line,
      curve,
      ticks,
      xTicks,
      last: drawn[drawn.length - 1],
      maxY,
      xLast: x(drawn[drawn.length - 1].pos),
      yLast: y(drawn[drawn.length - 1].v),
      showDots: points.length <= 60,
      drawn,
      xAt: x,
      yAt: y,
    };
  }, [points, market]);

  // Hover crosshair state and helpers live BEFORE any early return — hook order
  // must be identical across renders even while data is still loading.
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const theoAt = useCallback(
    (pos) => {
      const floor = big(market?.permitFloorLit);
      const slope = big(market?.permitSlopeLitPerBox);
      const ceiling = big(market?.permitCeilingLit);
      if (!(ceiling > 0n)) return null;
      const raw = floor + slope * (big(pos) - big(market?.queueHead));
      return raw < 0n ? 0n : raw > ceiling ? ceiling : raw;
    },
    [market],
  );

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
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < model.drawn.length; i++) {
      const d = Math.abs(model.xAt(model.drawn[i].pos) - mx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  if (!model) {
    return (
      <div className={s.empty}>No permits paid yet — the first joins will draw this curve.</div>
    );
  }

  const gid = 'cm-permit-fill';

  return (
    <div
      className={s.chartWrap}
      style={{ position: 'relative', cursor: 'crosshair' }}
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={s.chart}
        role="img"
        aria-label="Permit price across the waiting queue"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {model.ticks.map((t, i) => (
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

        {model.xTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 10} className={s.axisText} textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* Dashed: what the current anchors would charge at each position. */}
        {model.curve && (
          <path
            d={model.curve}
            fill="none"
            stroke="#a855f7"
            strokeWidth="1.6"
            strokeDasharray="5 5"
            opacity="0.85"
          />
        )}

        <path d={model.line} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />

        {model.showDots &&
          model.drawn.map((p, i) => (
            <circle
              key={i}
              cx={model.xAt(p.pos).toFixed(1)}
              cy={model.yAt(p.v).toFixed(1)}
              r="2.6"
              fill="#38bdf8"
              fillOpacity="0.8"
            />
          ))}

        {/* Last point = today's price; it should visibly agree with the pill above. */}
        <circle
          className={s.endDot}
          cx={model.xLast}
          cy={model.yLast}
          r="4"
          fill="#0a0f1e"
          stroke="#38bdf8"
          strokeWidth="2"
        />

        {hoverIdx != null &&
          model.drawn[hoverIdx] &&
          (() => {
            const p = model.drawn[hoverIdx];
            const px = model.xAt(p.pos);
            const tv = theoAt(p.pos);
            return (
              <g pointerEvents="none">
                <line className={s.cmCursorLine} x1={px} y1={PAD.t} x2={px} y2={H - PAD.b} />
                <circle
                  cx={px}
                  cy={model.yAt(p.v)}
                  r="5"
                  fill="#38bdf8"
                  stroke="#0a0f1e"
                  strokeWidth="1.5"
                />
                {tv != null && (
                  <circle
                    cx={px}
                    cy={model.yAt(tv)}
                    r="4.5"
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })()}
      </svg>

      {hoverIdx != null &&
        model.drawn[hoverIdx] &&
        (() => {
          const p = model.drawn[hoverIdx];
          const rect = wrapRef.current?.getBoundingClientRect();
          const scale = rect ? rect.width / W : 1;
          const leftPx = Math.min(
            Math.max(model.xAt(p.pos) * scale + 14, 8),
            Math.max(8, (rect?.width ?? 400) - 185),
          );
          const tv = theoAt(p.pos);
          return (
            <div className={s.cmHoverTip} style={{ left: `${leftPx}px` }}>
              <div>position #{fmtInt(p.pos)}</div>
              <div>
                <span className={s.cmHoverTipLabel}>paid </span>
                <span className={s.cmTipPaid}>{fmtTokenAmount(p.v, 9, 2)} LIT</span>
              </div>
              {tv != null && (
                <div>
                  <span className={s.cmHoverTipLabel}>today </span>
                  <span className={s.cmTipToday}>{fmtTokenAmount(tv, 9, 2)} LIT</span>
                </div>
              )}
            </div>
          );
        })()}

      <div className={s.cmLegend}>
        <span>
          <span className={s.cmLegendSwatch} style={{ background: '#38bdf8' }} />
          actually paid by waiting joins
        </span>
        {model.curve && (
          <span>
            <span
              className={`${s.cmLegendSwatch} ${s.cmSwatchDashed}`}
              style={{ color: '#a855f7' }}
            />
            today&rsquo;s curve (floor → ceiling)
          </span>
        )}
      </div>
    </div>
  );
}

function PermitCurveCard({ market }) {
  // Read from context rather than taking a prop: `market` already arrives that
  // way from the panel, and the auto-refresh tick belongs with it.
  const { tick } = useCollateral();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const head = market?.queueHead;

  // Re-pull when the queue advances so the overlay's anchor point tracks reality.
  useEffect(() => {
    if (head == null) return undefined;
    let alive = true;
    setLoading(true);
    api
      .getPermitHistory({ limit: 2000 })
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [head, tick]);

  return (
    <div className={s.card}>
      <div className={s.priceHead}>
        <div>
          <h3 className={s.cardTitle}>
            Permit curve{' '}
            {data?.truncated && (
              <PartialTag title="Series may not span the whole waiting queue; points shown are exact" />
            )}
          </h3>
          <p className={s.cardDesc}>
            What lenders actually paid to wait, position by position. The dashed line is what
            today&rsquo;s anchors would charge.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className={s.empty}>
          <Spinner /> Loading permit history…
        </div>
      ) : error ? (
        <Alert kind="error" title="Could not load permit history">
          {error}
        </Alert>
      ) : (
        <>
          <PermitChart points={data?.points ?? []} market={market} />
          {data?.truncated && (
            <div className={s.cmFootnote}>
              Series may not span the whole waiting queue; points shown are exact.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   Blocks-found cadence
   ============================================================ */

const DAY_MS = 86_400_000;
const DAYS_SHOWN = 7;

/**
 * Lithos blocks per day, from collected statistics rather than the sync cache.
 *
 * `/blocks/byHeight` answers from tracked rollups, which leave tracking once they
 * pay out — so an older day quietly undercounts and the week reads as a downward
 * trend that never happened. `/stats/mining/buckets` counts canonical genesis
 * transactions and keeps them for the whole retention window, so every day in the
 * chart is measured the same way.
 */
function BlocksFoundCard() {
  const { tick } = useCollateral();
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    // Buckets are UTC days and `until` is exclusive, so this asks for the last
    // six complete days plus today.
    const until = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS;
    const from = until - DAYS_SHOWN * DAY_MS;

    api
      .getMiningBuckets({ from, until, interval: 'day' })
      .then((h) => {
        if (!alive) return;
        // Buckets with nothing retained are omitted entirely, so the series is
        // rebuilt across every day in the range — a missing bucket is a day with
        // no Lithos block, which is a real zero and belongs on the chart.
        const byStart = new Map(
          (h?.buckets ?? []).map((b) => [Number(b.start), Number(b.totals?.['lithos.blocks'] ?? 0)]),
        );
        setDays(
          Array.from({ length: DAYS_SHOWN }, (_, i) => {
            const start = from + i * DAY_MS;
            return { start, blocks: byStart.get(start) ?? 0 };
          }),
        );
        setError(h?.partial ? 'partial' : null);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setDays(null);
        setError(e?.status === 503 ? 'loading' : (e.message ?? 'unavailable'));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [tick]);

  const max = days ? Math.max(1, ...days.map((d) => d.blocks)) : 1;
  const total = days ? days.reduce((a, d) => a + d.blocks, 0) : 0;

  return (
    <div className={`${s.card} ${s.cmCardFill}`}>
      <h3 className={s.cardTitle}>Blocks found</h3>
      <p className={s.cardDesc}>
        Lithos blocks mined per day over the last week. Each one consumes a collateral box and
        starts a lender&rsquo;s clock.
      </p>

      {loading ? (
        <div className={s.empty}>
          <Spinner /> Counting blocks…
        </div>
      ) : !days ? (
        <div className={s.empty}>
          {error === 'loading'
            ? 'Statistics are still catching up on the client. The week appears once collection is ready.'
            : `Could not read block history: ${error}`}
        </div>
      ) : (
        <>
          <div className={`${s.cmBars} ${s.cmBarsFill}`}>
            {days.map((d, i) => {
              const label = new Date(d.start).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              });
              return (
                <div key={d.start} className={s.cmBarCol}>
                  <span className={s.cmBarValue}>{d.blocks}</span>
                  <div
                    className={s.cmBar}
                    style={{ height: `${Math.max(2, (d.blocks / max) * 100)}%` }}
                    title={`${d.blocks} blocks · ${label}`}
                  />
                  <span className={s.cmBarLabel}>{i === DAYS_SHOWN - 1 ? 'today' : label}</span>
                </div>
              );
            })}
          </div>
          <div className={s.cmFootnote}>
            {total} blocks in {DAYS_SHOWN} days, counted from canonical chain history — every day
            is measured the same way, however long ago it was.
            {error === 'partial' && ' Retained history does not cover the whole week.'}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Explainer cards
   ============================================================ */

function ExplainCard({ title, children }) {
  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>{title}</h3>
      <p className={s.cardDesc} style={{ marginBottom: 0 }}>
        {children}
      </p>
    </div>
  );
}

function Explainers() {
  return (
    <div className={s.cmExplainers}>
      <ExplainCard title="What collateral does">
        Every Lithos block is funded in advance. A lender locks roughly one block reward of ERG into
        a collateral box; when a miner finds a block, that box is spent inside it and its ERG
        becomes the payout shared by miners.
      </ExplainCard>
      <ExplainCard title="What you post">
        Two things: a fixed <strong style={{ color: 'var(--cur-cyan-light)' }}>2.915 ERG</strong>{' '}
        principal, and a <strong style={{ color: 'var(--cur-purple-light)' }}>LIT permit</strong>{' '}
        sized by how long the queue already is. Your permit is returned immediately when a Lithos block mines it.
        Your ERG is returned as the full block reward and fees.
      </ExplainCard>
      <ExplainCard title="When you're paid">
        The block itself pays you: 3 ERG plus its transaction fees, addressed to your key by the
        protocol. Rewards unlock after 720 blocks (~a day), and the client sweeps them for you.
        That&rsquo;s about a 3.09% spread per use, before fees.
      </ExplainCard>
    </div>
  );
}

/* ============================================================
   Panel
   ============================================================ */

export default function OverviewPanel() {
  const { market, tick } = useCollateral();

  return (
    <>
      {market ? (
        <div className={s.cols}>
          <EmissionCard market={market} />
          <BlocksFoundCard />
        </div>
      ) : (
        <div className={s.card}>
          <h3 className={s.cardTitle}>Market state</h3>
          <div className={s.empty}>
            <CubeGlyph /> Waiting for the client…
          </div>
        </div>
      )}

      {market && (
        <div style={{ marginTop: '1.25rem' }}>
          <PermitCurveCard market={market} />
        </div>
      )}

      <Explainers />

      {market && (
        <div className={s.card} style={{ marginTop: '1.25rem' }}>
          <h3 className={s.cardTitle}>Where the money sits</h3>
          <div className={s.summary} style={{ marginTop: 0 }}>
            <Row
              label="Queued principal"
              value={`${fmtErgAmount(market.queuedNanoErgs, 3)} ERG`}
              accent
            />
            <Row label="Live collateral" value={`${fmtErgAmount(market.activeNanoErgs, 3)} ERG`} />
            <Row
              label="LIT locked as permits"
              value={`${fmtTokenAmount(market.permitLitLocked, 9, 3)} LIT`}
            />
            <Row
              label="Retirements ready"
              value={
                market.proofsOfSpendAvailable != null ? fmtInt(market.proofsOfSpendAvailable) : '—'
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
