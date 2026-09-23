import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useMining } from './MiningLayout';
import { SeriesChart, StackedBars } from './charts';
import { Spinner, PartialTag } from '../Dex/ui';
import { fmtBlocks, fmtTokenMin } from '../Dex/format';
import {
  big,
  fmtAge,
  fmtDuration,
  fmtErg,
  fmtErgMin,
  fmtInt,
  fmtNum,
  fmtPct,
  fullTime,
  metric,
  shareOf,
  shortId,
  timeLabel,
} from './format';

/*
 * One colour per part of a payout, fixed for the whole page. Green is what was earned; indigo is
 * the miner's own bond coming back, deliberately cooler so it never reads as income; amber is
 * fraud-proof bounties; purple is LIT; sky blue is a running total. The two DEX colours match the
 * block package's batch kinds.
 */
const REWARD = '#6ee7b7';
const SURPLUS = '#7dd3fc';
const BOND = '#818cf8';
const BOUNTY = '#fbbf24';
const LIT = '#a855f7';
const RUNNING = '#38bdf8';
const LITHOSDEX = '#2dd4bf';
const ERGODEX = '#f472b6';
/** Executor fees this client kept outside the pool. Teal like LithosDex, since that is most of it. */
const BATCHING = '#2dd4bf';

const LIT_DECIMALS = 9;
/** Payouts the profile and share figures are computed over, so they hold still while paging. */
const SAMPLE = 300;
const PAGE_SIZES = [10, 25, 50, 100, 200, 300];
const CLAIMS_PER_PAGE = 5;
const BOUNTIES_PER_PAGE = 10;

const fmtLit = (raw, dp = 4) => fmtTokenMin(raw, LIT_DECIMALS, dp);
const sum = (values) => values.reduce((a, b) => a + b, 0n);

/**
 * What was earned, in nanoERG: payout rewards and surplus, fraud-proof bounties, and executor fees
 * this client kept directly. Pooled executor fees are not added — they already arrive inside the
 * payout reward — and a returned bond is the miner's own deposit.
 */
const earnedErg = (r) => r.reward + r.surplus + r.bounty + r.batching;

/** Axis labels for base-unit amounts (nanoERG or LIT base units), with enough places to tell ticks apart. */
function axisAmount(v) {
  const x = v / 1e9;
  if (x === 0) return '0';
  if (x >= 1000) return `${fmtNum(x / 1000, 1)}k`;
  if (x >= 10) return fmtNum(x, 1);
  if (x >= 1) return fmtNum(x, 2);
  if (x >= 0.01) return fmtNum(x, 3);
  return x.toPrecision(2);
}

/** An exact decimal with no separators, for CSV — a spreadsheet must get the real digits. */
function plain(raw, decimals = 9) {
  let v = big(raw);
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${v / base}${frac ? `.${frac}` : ''}`;
}

function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function medianBig(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2n;
}

/** Payout rows are identified by their output, newest first. */
function mergeRows(rows) {
  const byOutput = new Map();
  rows.forEach((p) => byOutput.set(p.outputId, p));
  return [...byOutput.values()].sort((a, b) => b.height - a.height || (a.outputId < b.outputId ? -1 : 1));
}

/**
 * Milliseconds per block over the newest complete epochs. A whole epoch is steadier than the one
 * in progress, which can be a handful of blocks old; any ETA built on it is still an estimate.
 */
function blockPace(epochs) {
  const done = (epochs?.epochs ?? []).filter((e) => e.complete && e.endHeight > e.startHeight);
  const blocks = done.reduce((n, e) => n + (e.endHeight - e.startHeight), 0);
  const ms = done.reduce((n, e) => n + (Number(e.endTimestamp) - Number(e.startTimestamp)), 0);
  return blocks > 0 && ms > 0 ? ms / blocks : null;
}

const aboutBlocks = (blocks, pace) =>
  `${fmtBlocks(blocks)}${pace && blocks > 0 ? ` · ~${fmtDuration(blocks * pace)}` : ''}`;

function payoutDelay(p) {
  const blocks = p.height - p.minedHeight;
  const ms = Number(p.timestamp) - Number(p.minedTimestamp);
  return { blocks, ms: Number.isFinite(ms) && ms > 0 ? ms : null };
}

/* ============================================================
   Hero
   ============================================================ */

function EarnedCard({ totals, rangeId, perDay, busy }) {
  const earned = earnedErg(totals);
  const gross = earned + totals.bond;
  const parts = [
    { id: 'reward', label: 'Reward', color: REWARD, v: totals.reward },
    { id: 'batching', label: 'Batching', color: BATCHING, v: totals.batching },
    { id: 'bounty', label: 'Bounties', color: BOUNTY, v: totals.bounty },
    { id: 'surplus', label: 'Surplus', color: SURPLUS, v: totals.surplus },
    { id: 'bond', label: 'Bond returned', color: BOND, v: totals.bond, dim: true },
  ];
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Earned {busy && <Spinner />}</h3>
        <span className={s.label}>last {rangeId}</span>
      </div>
      <div className={s.payBig}>
        <span className={`${s.payBigValue} ${earned > 0n ? s.flowNum : ''}`}>{fmtErg(earned, 4)}</span>
        <span className={s.payBigUnit}>ERG</span>
      </div>
      <div className={s.payRate}>
        {perDay != null ? (
          <>
            ≈ <b>{fmtErgMin(perDay, 4)}</b> ERG / day
          </>
        ) : (
          'no covered time yet'
        )}
        {totals.litReceived > 0n && (
          <>
            {' · '}
            <b style={{ color: '#c084fc' }}>{fmtLit(totals.litReceived)}</b> LIT
          </>
        )}
      </div>

      {gross > 0n && (
        <div className={`${s.compBar} ${s.compBarTall}`} title="Share of everything received">
          {parts.map((p) =>
            p.v > 0n ? (
              <div
                key={p.id}
                className={s.compSeg}
                style={{ width: `${shareOf(p.v, gross) * 100}%`, background: p.color }}
              />
            ) : null,
          )}
        </div>
      )}

      <div className={s.payParts}>
        {parts.map((p) => (
          <div key={p.id} className={s.payPart}>
            <span className={s.swatch} style={{ background: p.color }} />
            <span className={s.payPartName}>{p.label}</span>
            <span className={`${s.payPartVal} ${p.dim ? s.payPartDim : ''}`}>{fmtErgMin(p.v, 4)}</span>
          </div>
        ))}
        <div className={s.payPart}>
          <span className={s.payPartName}>Payouts</span>
          <span className={s.payPartVal}>{fmtInt(totals.outputs)}</span>
        </div>
        {totals.slashedCount > 0n ? (
          <div className={s.payPart}>
            <span className={s.payPartName} style={{ color: '#f87171' }}>
              Bonds slashed ({fmtInt(totals.slashedCount)})
            </span>
            <span className={s.payPartVal} style={{ color: '#f87171' }}>
              −{fmtErgMin(totals.slashedBond, 4)}
            </span>
          </div>
        ) : (
          <div className={s.payPart}>
            <span className={s.payPartName}>Bond posted</span>
            <span className={`${s.payPartVal} ${s.payPartDim}`}>{fmtErgMin(totals.bondPosted, 4)}</span>
          </div>
        )}
      </div>
      <p className={s.cardNote} style={{ marginTop: 12 }}>
        <b>Earned</b> is payout reward, surplus, executor fees you kept directly, and fraud-proof bounties.
        A returned bond is your own deposit coming back, so it's shown but isn't counted.
      </p>
    </div>
  );
}

function UnpaidCard({ claims, height, pace }) {
  const open = claims.filter((c) => c.phase !== 'slashed');
  const ready = open.filter((c) => c.phase === 'payout');
  const evaluating = open.filter((c) => c.phase === 'evaluation');
  const holding = open.filter((c) => c.phase === 'holding');
  const slashed = claims.filter((c) => c.phase === 'slashed');

  const readyErg = sum(ready.map((c) => big(c.rewardNanoErg)));
  const readyLit = sum(ready.map((c) => big(c.rewardLit)));
  const projected = sum(evaluating.map((c) => big(c.rewardNanoErg)));
  const locked = sum(open.map((c) => big(c.bondNanoErg)));
  const next = open
    .map((c) => c.payoutReadyFrom)
    .filter((h) => h != null)
    .sort((a, b) => a - b)[0];

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Unpaid</h3>
        <span className={s.label}>
          {fmtInt(open.length)} open claim{open.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className={s.unpaidGrid}>
        <div className={`${s.unpaidTile} ${ready.length ? s.unpaidTileReady : ''}`}>
          <div className={s.label}>Ready to pay</div>
          <div className={s.unpaidValue} style={ready.length ? { color: REWARD } : undefined}>
            {fmtErgMin(readyErg, 4)}
          </div>
          <div className={s.unpaidSub}>
            {ready.length ? `exact · ${fmtInt(ready.length)} rollup${ready.length === 1 ? '' : 's'}` : 'nothing waiting'}
            {readyLit > 0n && ` · ${fmtLit(readyLit)} LIT`}
          </div>
        </div>
        <div className={s.unpaidTile}>
          <div className={s.label}>Projected</div>
          <div className={s.unpaidValue} style={evaluating.length ? { color: SURPLUS } : undefined}>
            {fmtErgMin(projected, 4)}
          </div>
          <div className={s.unpaidSub}>
            {evaluating.length
              ? `in evaluation · ${fmtInt(evaluating.length)} rollup${evaluating.length === 1 ? '' : 's'}`
              : 'none in evaluation'}
          </div>
        </div>
      </div>
      <div className={s.rows} style={{ marginTop: 12 }}>
        <div className={s.kv}>
          <span className={s.kvKey}>Bond locked</span>
          <span className={s.kvVal}>{fmtErgMin(locked, 4)} ERG</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Next ready</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {ready.length
              ? 'now'
              : next != null && height != null
                ? next <= height
                  ? 'due now'
                  : `in ${aboutBlocks(next - height, pace)}`
                : '—'}
          </span>
        </div>
      </div>
      <div className={s.phaseStrip}>
        <span className={s.chip}>
          holding <span className={s.chipNum}>{fmtInt(holding.length)}</span>
        </span>
        <span className={s.chip}>
          evaluation <span className={s.chipNum}>{fmtInt(evaluating.length)}</span>
        </span>
        <span className={s.chip}>
          payout <span className={s.chipNum}>{fmtInt(ready.length)}</span>
        </span>
        {slashed.length > 0 && (
          <span className={`${s.chip} ${s.chipWarn}`}>
            slashed <span className={s.chipNum}>{fmtInt(slashed.length)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Your reward as a share of every reward the protocol paid in the window. */
function ShareCard({ totals, payments }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const frac = shareOf(totals.reward, totals.networkReward);
  const shares = payments.map((p) => shareOf(p.score, p.rollupScore)).filter((v) => v != null);
  const miners = payments.map((p) => Number(p.rollupMiners)).filter((v) => v > 0);
  const avgShare = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null;

  return (
    <div className={`${s.card} ${s.ringCard}`}>
      <div className={s.label}>Share of Lithos payouts</div>
      <div className={s.ringWrap}>
        <svg viewBox="0 0 132 132" className={s.dialSvg} role="img" aria-label="Share of Lithos payouts">
          <defs>
            <linearGradient id="payShareRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6ee7b7" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(125,211,252,0.1)" strokeWidth="9" />
          {frac != null && frac > 0 && (
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke="url(#payShareRing)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(C * Math.max(0.004, Math.min(1, frac))).toFixed(2)} ${C.toFixed(2)}`}
              transform="rotate(-90 66 66)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          )}
        </svg>
        <div className={s.ringCore}>
          <div className={s.ringValue}>{frac == null ? '—' : fmtPct(frac, frac < 0.1 ? 2 : 1)}</div>
          <div className={s.ringLabel}>of ERG rewards</div>
        </div>
      </div>
      <div className={s.ringRows}>
        <div className={s.kv}>
          <span className={s.kvKey}>Your payouts</span>
          <span className={s.kvVal}>
            {fmtInt(totals.outputs)} / {fmtInt(totals.networkOutputs)}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Avg block share</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>{avgShare == null ? '—' : fmtPct(avgShare, 2)}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Miners / rollup</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {miners.length ? fmtNum(median(miners), 1) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Claims
   ============================================================ */

const STEPS = [
  { id: 'holding', label: 'Submitted' },
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'payout', label: 'Payout ready' },
  { id: 'paid', label: 'Paid' },
];

function Claim({ claim, height, pace }) {
  const slashed = claim.phase === 'slashed';
  const at = STEPS.findIndex((st) => st.id === claim.phase);
  const share = shareOf(claim.score, claim.rollupScore);
  const age = height != null ? height - claim.submittedHeight : null;
  const left = claim.payoutReadyFrom != null && height != null ? claim.payoutReadyFrom - height : null;

  return (
    <div className={`${s.claim} ${slashed ? s.claimSlashed : claim.phase === 'payout' ? s.claimReady : ''}`}>
      <div className={s.claimTop}>
        <div className={s.claimTitle}>
          Block #{fmtInt(claim.minedHeight)}
          <span>{shortId(claim.rollupNft, 6, 4)}</span>
        </div>
        {slashed ? (
          <span className={`${s.claimReward} ${s.claimRewardLost}`}>−{fmtErgMin(claim.bondNanoErg, 4)} ERG bond</span>
        ) : claim.rewardNanoErg != null ? (
          <span className={`${s.claimReward} ${claim.rewardBasis === 'projected' ? s.claimRewardProjected : ''}`}>
            {claim.rewardBasis === 'projected' ? '≈ ' : ''}
            {fmtErgMin(claim.rewardNanoErg, 4)} ERG
            {claim.rewardLit != null && big(claim.rewardLit) > 0n && ` + ${fmtLit(claim.rewardLit)} LIT`}
            <span className={s.basisTag}>{claim.rewardBasis}</span>
          </span>
        ) : (
          <span className={`${s.claimReward} ${s.claimRewardNone}`}>processing submissions</span>
        )}
      </div>

      <div className={s.steps}>
        {STEPS.map((st, i) => {
          const cls = slashed
            ? i === 0
              ? s.stepDone
              : i === 1
                ? s.stepBad
                : ''
            : i < at
              ? s.stepDone
              : i === at
                ? s.stepNow
                : '';
          return (
            <div key={st.id} className={`${s.step} ${cls}`}>
              <span className={s.stepBar} />
              <span className={s.stepName}>{slashed && i === 1 ? 'Slashed' : st.label}</span>
            </div>
          );
        })}
      </div>

      <div className={s.claimMeta}>
        <span>
          score <b>{fmtInt(claim.score)}</b>
          {share != null && (
            <>
              {' '}
              · <b>{fmtPct(share, 2)}</b> of {fmtInt(claim.rollupMiners ?? 0)} miners
            </>
          )}
        </span>
        <span>
          bond <b>{fmtErgMin(claim.bondNanoErg, 4)}</b>
        </span>
        {age != null && (
          <span>
            submitted {age <= 0 ? <b>this block</b> : <><b>{fmtBlocks(age)}</b> ago</>}
          </span>
        )}
        {!slashed && claim.phase !== 'payout' && left != null && (
          <span>
            ready {left <= 0 ? <b>any block now</b> : <>in <b>{aboutBlocks(left, pace)}</b></>}
            {claim.phase === 'holding' && ' at the earliest'}
          </span>
        )}
        {claim.phase === 'payout' && height != null && (
          <span>
            {height - claim.phaseHeight <= 0 ? (
              <b>ready this block</b>
            ) : (
              <>
                ready for <b>{fmtBlocks(height - claim.phaseHeight)}</b>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** First / previous / "Page x of y" / next / last. */
function Pager({ page, pages, onPage }) {
  const go = (p) => onPage(Math.max(0, Math.min(pages - 1, p)));
  return (
    <div className={s.stackPager}>
      <button type="button" className={s.pageBtn} disabled={page === 0} onClick={() => go(0)} aria-label="First page">
        «
      </button>
      <button type="button" className={s.pageBtn} disabled={page === 0} onClick={() => go(page - 1)} aria-label="Previous page">
        ‹
      </button>
      <span className={s.pageLabel}>
        {fmtInt(page + 1)} / {fmtInt(pages)}
      </span>
      <button type="button" className={s.pageBtn} disabled={page >= pages - 1} onClick={() => go(page + 1)} aria-label="Next page">
        ›
      </button>
      <button type="button" className={s.pageBtn} disabled={page >= pages - 1} onClick={() => go(pages - 1)} aria-label="Last page">
        »
      </button>
    </div>
  );
}

function ClaimsCard({ claims, height, pace, holdingBlocks, evaluationBlocks }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(claims.length / CLAIMS_PER_PAGE));
  // A claim that pays drops out of the list, which can leave the current page past the end.
  const at = Math.min(page, pages - 1);
  const shown = claims.slice(at * CLAIMS_PER_PAGE, (at + 1) * CLAIMS_PER_PAGE);
  return (
    <div className={`${s.card} ${s.fillCard}`}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Open claims</h3>
        <span className={s.label}>rollups not yet paid</span>
      </div>
      {claims.length === 0 ? (
        <div className={s.empty} style={{ padding: '1.6rem 1rem' }}>
          No unpaid claims. Every rollup you submitted to has paid out.
        </div>
      ) : (
        <div className={s.claimList}>
          {shown.map((c) => (
            <Claim key={c.rollupNft} claim={c} height={height} pace={pace} />
          ))}
        </div>
      )}
      <div className={s.fillFoot}>
        {claims.length > CLAIMS_PER_PAGE && (
          <div className={s.payFoot} style={{ marginTop: 0, marginBottom: 12 }}>
            <span className={s.cardNote}>
              {fmtInt(at * CLAIMS_PER_PAGE + 1)}–{fmtInt(at * CLAIMS_PER_PAGE + shown.length)} of{' '}
              {fmtInt(claims.length)}, newest submission first
            </span>
            <Pager page={at} pages={pages} onPage={setPage} />
          </div>
        )}
        <p className={s.cardNote}>
          A rollup takes submissions for {fmtInt(holdingBlocks)} blocks after it is mined, then stays open
          to fraud proofs for {fmtInt(evaluationBlocks)} more. The reward is projected at the start of evaluation
          and exact once the evaluation has completed.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Profile + calendar
   ============================================================ */

const WEEKDAYS = ['M', '', 'W', '', 'F', '', 'S'];

/** Thirty days as a week-column heatmap of what each UTC day earned. */
function EarningsCalendar({ days }) {
  const [hovered, setHovered] = useState(null);
  const top = days.reduce((m, d) => (d.earned > m ? d.earned : m), 0n);
  const pad = days.length ? (new Date(days[0].start).getUTCDay() + 6) % 7 : 0;
  const paid = days.filter((d) => d.outputs > 0n);
  const best = paid.reduce((b, d) => (b == null || d.earned > b.earned ? d : b), null);
  let run = 0;
  let longest = 0;
  days.forEach((d) => {
    run = d.outputs > 0n ? run + 1 : 0;
    longest = Math.max(longest, run);
  });
  const active = hovered == null ? null : days[hovered];

  const fill = (d) => {
    if (d.missing) return undefined;
    if (d.earned <= 0n || top <= 0n) return undefined;
    const f = Math.sqrt(shareOf(d.earned, top) ?? 0);
    return `rgba(110, 231, 183, ${(0.2 + f * 0.8).toFixed(3)})`;
  };

  return (
    <div className={s.calWrap}>
      <div className={s.calHead}>
        <span className={s.label}>Last 30 days</span>
        <span className={s.calScale}>
          less
          {[0, 0.25, 0.55, 1].map((f) => (
            <span
              key={f}
              className={s.calCell}
              style={f ? { background: `rgba(110, 231, 183, ${(0.2 + Math.sqrt(f) * 0.8).toFixed(3)})` } : undefined}
            />
          ))}
          more
        </span>
      </div>
      <div className={s.calRow}>
        <div className={s.calDays}>
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className={s.cal} onMouseLeave={() => setHovered(null)}>
          {Array.from({ length: pad }).map((_, i) => (
            <span key={`pad-${i}`} className={`${s.calCell} ${s.calCellPad}`} />
          ))}
          {days.map((d, i) => (
            <span
              key={d.start}
              className={`${s.calCell} ${d.missing ? s.calCellNone : ''} ${hovered === i ? s.calCellOn : ''}`}
              style={{ background: fill(d) }}
              onMouseEnter={() => setHovered(i)}
            />
          ))}
        </div>
      </div>
      <div className={s.calInfo}>
        {active ? (
          <>
            {new Date(active.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            {' · '}
            {active.missing
              ? 'not collected'
              : active.outputs > 0n
                ? `${fmtErgMin(active.earned, 4)} ERG · ${fmtInt(active.outputs)} payout${active.outputs === 1n ? '' : 's'}`
                : 'no payouts'}
          </>
        ) : (
          <>
            paid on {paid.length} of {days.filter((d) => !d.missing).length} days
            {best && ` · best ${new Date(best.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} (${fmtErgMin(best.earned, 3)})`}
            {longest > 1 && ` · longest run ${longest} days`}
          </>
        )}
      </div>
    </div>
  );
}

function ProfileCard({ payments, days }) {
  const rewards = payments.map((p) => big(p.rewardNanoErg));
  const largest = payments.reduce((b, p) => (b == null || big(p.rewardNanoErg) > big(b.rewardNanoErg) ? p : b), null);
  const delays = payments.map(payoutDelay);
  const delayBlocks = delays.map((d) => d.blocks).filter((b) => b >= 0);
  const delayMs = delays.map((d) => d.ms).filter((ms) => ms != null);
  const owed = sum(payments.map((p) => big(p.rewardLit)));
  const received = sum(payments.map((p) => big(p.receivedLit)));
  const reward = sum(rewards);
  const bond = sum(payments.map((p) => big(p.bondNanoErg)));

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Payout profile</h3>
        <span className={s.label}>
          {payments.length ? `latest ${fmtInt(payments.length)} payouts` : 'no payouts yet'}
        </span>
      </div>
      <div className={s.profileGrid}>
        <div className={s.kv}>
          <span className={s.kvKey}>Average reward</span>
          <span className={s.kvVal}>{payments.length ? fmtErgMin(reward / BigInt(payments.length), 4) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Median reward</span>
          <span className={s.kvVal}>{rewards.length ? fmtErgMin(medianBig(rewards), 4) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Largest</span>
          <span className={s.kvVal}>{largest ? fmtErgMin(largest.rewardNanoErg, 4) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Largest paid</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>{largest ? fullTime(largest.timestamp) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Mined → paid</span>
          <span className={s.kvVal}>{delayBlocks.length ? fmtBlocks(Math.round(median(delayBlocks))) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Typical wait</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>{delayMs.length ? fmtDuration(median(delayMs)) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Fastest</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {delayBlocks.length ? fmtBlocks(Math.min(...delayBlocks)) : '—'}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Slowest</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {delayBlocks.length ? fmtBlocks(Math.max(...delayBlocks)) : '—'}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>LIT owed</span>
          <span className={s.kvVal}>{fmtLit(owed)}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>LIT received</span>
          <span className={s.kvVal} style={received > owed ? { color: '#c084fc' } : undefined}>
            {fmtLit(received)}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Bond per reward</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>{reward > 0n ? fmtPct(shareOf(bond, reward), 1) : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Paid by</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {payments.length ? `${fmtInt(new Set(payments.map((p) => p.transactionId)).size)} txs` : '—'}
          </span>
        </div>
      </div>
      {days && <EarningsCalendar days={days} />}
    </div>
  );
}

/* ============================================================
   Batching
   ============================================================ */

const PROTOCOLS = [
  { id: 'lithosdex', label: 'LithosDex', color: LITHOSDEX },
  { id: 'ergodex', label: 'ErgoDEX', color: ERGODEX },
];

function ProtocolCell({ row }) {
  return (
    <span className={s.payPart}>
      <span className={s.swatch} style={{ background: row.color }} />
      {row.label}
    </span>
  );
}

/**
 * Executor fees, split by where they went.
 *
 * Into the pool: a Lithos block's own executions pay no transaction fee, and their takings top up
 * its rollup, so they reach a miner through payouts in proportion to its share — already inside
 * Earned. Direct: executions this client broadcast, or put in a block it mined without Lithos, keep
 * their takings in its wallet after paying their own fee. Other executors' fills are neither.
 */
function BatchingCard({ batching, rangeId }) {
  const rows = PROTOCOLS.map((p) => ({ ...p, ...batching[p.id] }));
  const pooled = sum(rows.map((r) => r.poolGross));
  const direct = sum(rows.map((r) => r.directNet));
  const all = sum(rows.map((r) => r.allGross));
  const capture = shareOf(pooled, all);

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Batching revenue</h3>
        <span className={s.label}>last {rangeId}</span>
      </div>

      <div className={s.batchHead}>
        <div>
          <div className={s.label}>Into the pool</div>
          <div className={s.batchSub}>Lithos blocks, no fee · reaches you through payouts</div>
        </div>
        <div className={s.batchTotal} style={{ color: 'var(--cur-muted)' }}>
          {fmtErgMin(pooled, 4)} <span>ERG</span>
        </div>
      </div>
      <div className={s.batchTable}>
        <div className={`${s.batchTr} ${s.batchTrPool} ${s.payTh}`}>
          <span>Protocol</span>
          <span className={s.num}>Orders</span>
          <span className={s.num}>Gross</span>
          <span className={s.num}>Per order</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className={`${s.batchTr} ${s.batchTrPool}`}>
            <ProtocolCell row={r} />
            <span className={s.num}>{fmtInt(r.poolOrders)}</span>
            <span className={s.num}>{fmtErgMin(r.poolGross, 4)}</span>
            <span className={`${s.num} ${s.kvValDim}`}>
              {r.poolOrders > 0n ? fmtErgMin(r.poolGross / r.poolOrders, 5) : '—'}
            </span>
          </div>
        ))}
      </div>

      <div className={s.batchHead} style={{ marginTop: 16 }}>
        <div>
          <div className={s.label}>Direct to you</div>
          <div className={s.batchSub}>your own executions outside the pool · paid to your wallet</div>
        </div>
        <div className={s.batchTotal} style={{ color: BATCHING }}>
          {fmtErgMin(direct, 4)} <span>ERG net</span>
        </div>
      </div>
      <div className={s.batchTable}>
        <div className={`${s.batchTr} ${s.payTh}`}>
          <span>Protocol</span>
          <span className={s.num}>Orders</span>
          <span className={s.num}>Gross</span>
          <span className={s.num}>Tx fees</span>
          <span className={s.num}>Net</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className={s.batchTr}>
            <ProtocolCell row={r} />
            <span className={s.num}>{fmtInt(r.directOrders)}</span>
            <span className={s.num}>{fmtErgMin(r.directGross, 4)}</span>
            <span className={s.num} style={{ color: 'var(--cur-dim)' }}>
              {r.directFee > 0n ? `−${fmtErgMin(r.directFee, 4)}` : '0'}
            </span>
            <span className={`${s.num} ${s.good}`}>{fmtErgMin(r.directNet, 4)}</span>
          </div>
        ))}
      </div>

      <div className={s.rows} style={{ marginTop: 14 }}>
        <div className={s.kv}>
          <span className={s.kvKey}>Pooled share of Ergo</span>
          <span className={s.kvVal}>
            {capture == null ? '—' : fmtPct(capture, 1)}
            <span className={s.kvValDim}> of {fmtErgMin(all, 4)} ERG in executor fees</span>
          </span>
        </div>
      </div>
      <p className={s.cardNote} style={{ marginTop: 10 }}>
        Pooled fees reach Earned inside your payout rewards. Direct fees are counted in Earned as
        Batching, when they land.
      </p>
    </div>
  );
}

/* ============================================================
   History
   ============================================================ */

function exportCsv(rows) {
  const head = [
    'paid_at_utc', 'paid_height', 'mined_height', 'mined_at_utc', 'delay_blocks', 'score', 'rollup_score',
    'share', 'rollup_miners', 'reward_erg', 'bond_erg', 'surplus_erg', 'gross_erg', 'lit_owed', 'lit_received',
    'transaction_id', 'output_id', 'rollup_nft',
  ];
  const iso = (ts) => new Date(Number(ts)).toISOString();
  const lines = rows.map((p) => [
    iso(p.timestamp), p.height, p.minedHeight, iso(p.minedTimestamp), p.height - p.minedHeight, p.score,
    p.rollupScore, shareOf(p.score, p.rollupScore) ?? '', p.rollupMiners, plain(p.rewardNanoErg),
    plain(p.bondNanoErg), plain(p.surplusNanoErg), plain(p.grossNanoErg), plain(p.rewardLit, LIT_DECIMALS),
    plain(p.receivedLit, LIT_DECIMALS), p.transactionId, p.outputId, p.rollupNft,
  ].join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lithos-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Detail({ label, children }) {
  return (
    <div>
      <div className={s.kvKey} style={{ marginBottom: 3 }}>
        {label}
      </div>
      <div className={s.payId}>{children}</div>
    </div>
  );
}

function PaymentRow({ p, open, onToggle }) {
  const share = shareOf(p.score, p.rollupScore);
  const delay = payoutDelay(p);
  return (
    <>
      <button
        type="button"
        className={`${s.payTr} ${s.payRow} ${open ? s.payRowOpen : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={s.payWhen}>
          <span className={s.payWhenMain}>{fullTime(p.timestamp)}</span>
          <span className={s.paySub}>{fmtAge(p.timestamp)} ago</span>
        </span>
        <span className={s.num}>{fmtInt(p.height)}</span>
        <span className={s.payWhen}>
          <span>block #{fmtInt(p.minedHeight)}</span>
          <span className={s.paySub}>
            +{fmtInt(delay.blocks)} blocks{delay.ms ? ` · ${fmtDuration(delay.ms)}` : ''}
          </span>
        </span>
        <span className={s.shareCell}>
          <span>
            {share == null ? '—' : fmtPct(share, 2)}
            <span className={s.paySub}> of {fmtInt(p.rollupMiners)}</span>
          </span>
          <span className={s.shareTrack}>
            <span className={s.shareFill} style={{ display: 'block', width: `${Math.max(2, (share ?? 0) * 100)}%` }} />
          </span>
        </span>
        <span className={`${s.num} ${s.good}`}>{fmtErgMin(p.rewardNanoErg, 4)}</span>
        <span className={s.num} style={{ color: BOND }}>
          {fmtErgMin(p.bondNanoErg, 4)}
        </span>
        <span className={s.num}>{big(p.surplusNanoErg) > 0n ? fmtErgMin(p.surplusNanoErg, 6) : '—'}</span>
        <span className={s.num} style={{ color: 'var(--cur-text)' }}>
          {fmtErgMin(p.grossNanoErg, 4)}
        </span>
        <span className={s.num} style={{ color: '#c084fc' }}>
          {big(p.receivedLit) > 0n ? fmtLit(p.receivedLit, 2) : '—'}
        </span>
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className={s.payDetail}>
          <Detail label="Payout transaction">{p.transactionId}</Detail>
          <Detail label="Your output">{p.outputId}</Detail>
          <Detail label="Rollup NFT">{p.rollupNft}</Detail>
          <Detail label="Payout box spent">{p.payoutBoxId}</Detail>
          <Detail label="Mined in block">
            {p.minedBlockId} · {fullTime(p.minedTimestamp)}
          </Detail>
          <Detail label="Paid in block">{p.blockId}</Detail>
          <Detail label="Your score">
            {fmtInt(p.score)} of {fmtInt(p.rollupScore)}
          </Detail>
          <Detail label="Whole rollup paid">
            {fmtErg(p.rollupRewardNanoErg, 6)} ERG · {fmtLit(p.rollupRewardLit)} LIT
          </Detail>
          <Detail label="LIT owed → received">
            {fmtLit(p.rewardLit)} → {fmtLit(p.receivedLit)}
          </Detail>
          <Detail label="Gross, exact">{plain(p.grossNanoErg)} ERG</Detail>
        </div>
      )}
    </>
  );
}

/** Every retained payout, a request of the largest size at a time. */
async function fetchAllPayments(total) {
  const rows = [];
  for (let offset = 0; offset < total; offset += api.MAX_PAYMENTS_PAGE) {
    const page = await api.getPayments({ offset, limit: api.MAX_PAYMENTS_PAGE });
    rows.push(...(page.payments ?? []));
    if ((page.payments ?? []).length < api.MAX_PAYMENTS_PAGE) break;
  }
  // A payout confirmed mid-export shifts later pages by one, so the same row can arrive twice.
  return mergeRows(rows);
}

/** A column heading that sorts the table, showing which way it runs when active. */
function SortTh({ column, label, active, ascending, onSort, align }) {
  const on = active === column;
  return (
    <button
      type="button"
      className={`${s.sortTh} ${on ? s.sortThOn : ''} ${align === 'right' ? s.num : ''}`}
      onClick={() => onSort(column)}
      aria-sort={on ? (ascending ? 'ascending' : 'descending') : 'none'}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <span className={s.sortArrow}>{on ? (ascending ? '▴' : '▾') : '▾'}</span>
    </button>
  );
}

function HistoryCard({ payments, page, pages, pageSize, total, onPage, onPageSize, loading, retainedFromHeight, error,
                       sortColumn, ascending, onSort }) {
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const first = page * pageSize;

  const onExport = () => {
    setExporting(true);
    fetchAllPayments(total)
      .then(exportCsv)
      .catch(() => {})
      .finally(() => setExporting(false));
  };

  return (
    <div className={`${s.card} ${s.stackGap}`}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Payment history {loading && <Spinner />}</h3>
        <div className={s.controls}>
          <span className={s.label}>rows</span>
          <select
            className={s.pageSelect}
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Payouts per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" className={s.textBtn} disabled={total === 0 || exporting} onClick={onExport}>
            {exporting ? 'Exporting…' : `Export CSV${total ? ` (${fmtInt(total)})` : ''}`}
          </button>
        </div>
      </div>
      {error && payments.length === 0 ? (
        <div className={s.empty}>{error}</div>
      ) : payments.length === 0 ? (
        <div className={s.empty}>{loading ? 'Loading…' : 'No payouts to this client in retained history yet.'}</div>
      ) : (
        <div className={s.payTable}>
          <div className={`${s.payTr} ${s.payTh}`}>
            <SortTh column="paid" label="Paid" active={sortColumn} ascending={ascending} onSort={onSort} />
            <SortTh column="height" label="Height" active={sortColumn} ascending={ascending} onSort={onSort} align="right" />
            <SortTh column="rollup" label="Rollup" active={sortColumn} ascending={ascending} onSort={onSort} />
            <span>Share</span>
            <span className={s.num}>Reward</span>
            <span className={s.num}>Bond</span>
            <span className={s.num}>Surplus</span>
            <span className={s.num}>Gross ERG</span>
            <span className={s.num}>LIT</span>
            <span />
          </div>
          {payments.map((p) => (
            <PaymentRow
              key={p.outputId}
              p={p}
              open={openId === p.outputId}
              onToggle={() => setOpenId((id) => (id === p.outputId ? null : p.outputId))}
            />
          ))}
        </div>
      )}
      <div className={s.payFoot}>
        <span className={s.cardNote}>
          {total > 0
            ? `${fmtInt(first + 1)}–${fmtInt(first + payments.length)} of ${fmtInt(total)} payouts, by ${
                sortColumn === 'rollup' ? 'rollup height' : sortColumn === 'height' ? 'block height' : 'paid time'
              }, ${ascending ? 'oldest' : 'newest'} first`
            : 'No payouts yet'}
          {retainedFromHeight != null && ` · history kept from block ${fmtInt(retainedFromHeight)}`}
        </span>
        {pages > 1 && <Pager page={page} pages={pages} onPage={onPage} />}
      </div>
    </div>
  );
}

function BountiesCard({ bounties }) {
  const [page, setPage] = useState(0);
  const total = sum(bounties.map((b) => big(b.bondNanoErg)));
  const pages = Math.max(1, Math.ceil(bounties.length / BOUNTIES_PER_PAGE));
  const at = Math.min(page, pages - 1);
  const shown = bounties.slice(at * BOUNTIES_PER_PAGE, (at + 1) * BOUNTIES_PER_PAGE);
  return (
    <div className={`${s.card} ${s.stackGap}`}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Fraud-proof bounties</h3>
        <span className={s.label} style={{ color: BOUNTY }}>
          {fmtErgMin(total, 4)} ERG earned
        </span>
      </div>
      <div className={s.payTable}>
        <div className={`${s.payTr} ${s.bountyTr} ${s.payTh}`}>
          <span>When</span>
          <span className={s.num}>Height</span>
          <span>Rollup</span>
          <span className={s.num}>Bond won</span>
          <span>Slashed entry</span>
        </div>
        {shown.map((b) => (
          <div key={b.transactionId} className={`${s.payTr} ${s.bountyTr}`}>
            <span className={s.payWhen}>
              <span className={s.payWhenMain}>{fullTime(b.timestamp)}</span>
              <span className={s.paySub}>{fmtAge(b.timestamp)} ago</span>
            </span>
            <span className={s.num}>{fmtInt(b.height)}</span>
            <span>block #{fmtInt(b.minedHeight)}</span>
            <span className={s.num} style={{ color: BOUNTY }}>
              {fmtErgMin(b.bondNanoErg, 4)}
            </span>
            <span className={s.paySub}>
              {shortId(b.minerHash, 10, 6)} · score {fmtInt(b.claimedScore)}
            </span>
          </div>
        ))}
      </div>
      <div className={s.payFoot}>
        <span className={s.cardNote}>
          {bounties.length > BOUNTIES_PER_PAGE &&
            `${fmtInt(at * BOUNTIES_PER_PAGE + 1)}–${fmtInt(at * BOUNTIES_PER_PAGE + shown.length)} of ${fmtInt(bounties.length)} · `}
          Each proof removed a miner whose NISP did not hold up, and paid you the bond they had posted.
          Bounties count toward Earned above.
        </span>
        {pages > 1 && <Pager page={at} pages={pages} onPage={setPage} />}
      </div>
    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */

/** Window totals and the dense per-interval series behind the chart. */
function bucketModel(buckets) {
  if (!buckets?.range) return null;
  const { from, until, widthMs, interval } = buckets.range;
  const byStart = new Map((buckets.buckets ?? []).map((b) => [Number(b.start), b]));
  const rows = [];
  for (let t = from; t < until; t += widthMs) {
    const b = byStart.get(t);
    rows.push({
      start: t,
      // Every interval on Ergo holds blocks, so a missing bucket was not collected — not a quiet hour.
      missing: !b,
      reward: metric(b, 'local.payout.rewardNanoErg'),
      surplus: metric(b, 'local.payout.surplusNanoErg'),
      bond: metric(b, 'local.payout.bondNanoErg'),
      bounty: metric(b, 'rollup.fraudProof.localValueNanoErg'),
      batching: sum(PROTOCOLS.map(({ id }) => metric(b, `local.batching.${id}.afterTransactionFeesNanoErg`))),
      litOwed: metric(b, 'local.payout.rewardLit'),
      litReceived: metric(b, 'local.payout.receivedLit'),
      outputs: metric(b, 'local.payout.outputs'),
      networkReward: metric(b, 'network.payout.rewardNanoErg'),
      networkOutputs: metric(b, 'network.payout.outputs'),
      bondPosted: metric(b, 'rollup.submission.localBondNanoErg'),
      slashedCount: metric(b, 'local.slashed.count'),
      slashedBond: metric(b, 'local.slashed.bondNanoErg'),
    });
  }
  const batching = {};
  PROTOCOLS.forEach(({ id }) => {
    const total = (key) => sum((buckets.buckets ?? []).map((b) => metric(b, key)));
    batching[id] = {
      poolOrders: total(`pool.batching.${id}.orders`),
      poolGross: total(`pool.batching.${id}.grossNanoErg`),
      directOrders: total(`local.batching.${id}.orders`),
      directGross: total(`local.batching.${id}.grossNanoErg`),
      directFee: total(`local.batching.${id}.transactionFeeNanoErg`),
      directNet: total(`local.batching.${id}.afterTransactionFeesNanoErg`),
      allGross: total(`batching.${id}.grossNanoErg`),
    };
  });
  const totals = {};
  ['reward', 'surplus', 'bond', 'bounty', 'batching', 'litOwed', 'litReceived', 'outputs', 'networkReward', 'networkOutputs',
    'bondPosted', 'slashedCount', 'slashedBond'].forEach((k) => {
    totals[k] = sum(rows.map((r) => r[k]));
  });
  const retained = buckets.retainedFrom != null ? Number(buckets.retainedFrom) : until;
  const tip = Math.min(until, Number(buckets.source?.timestamp ?? until));
  const coveredMs = Math.max(0, tip - Math.max(from, retained));
  return { rows, totals, batching, interval, coveredMs, partial: !!buckets.partial };
}

export default function PaymentsPanel() {
  const { stats, tick } = useMining();
  const [rangeId, setRangeId] = useState('7D');
  const [unit, setUnit] = useState('erg');
  // One dataset at a time, the way the hashrate chart does it: the bars and the running total
  // differ by an order of magnitude, and a second axis to reconcile them read as one scale.
  const [view, setView] = useState('bars');

  const [buckets, setBuckets] = useState(null);
  const [month, setMonth] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [epochs, setEpochs] = useState(null);
  const [busy, setBusy] = useState(true);
  const [chartErr, setChartErr] = useState(null);
  const [ledgerErr, setLedgerErr] = useState(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [pageRows, setPageRows] = useState(null);
  const [pageBusy, setPageBusy] = useState(false);
  // The column clicked, and its direction. Paid and Height share an ordering on the server.
  const [sortColumn, setSortColumn] = useState('paid');
  const [ascending, setAscending] = useState(false);

  const shown = useRef(null);
  const pageKey = useRef(null);

  const load = useCallback(() => {
    const range = api.alignedRange(rangeId);
    const monthRange = api.alignedRange('30D');
    const same = shown.current === rangeId;
    setBusy(true);
    Promise.all([
      api.getBuckets(range).catch((failure) => ({ failure })),
      rangeId === '30D' ? Promise.resolve(null) : api.getBuckets(monthRange).catch(() => null),
      api.getPayments({ limit: SAMPLE }).catch((failure) => ({ failure })),
      api.getDifficultyEpochs({ limit: 4 }).catch(() => null),
    ])
      .then(([b, m, l, e]) => {
        // A series that fails one poll keeps its last reading; a new range starts clean.
        if (!b.failure) {
          setBuckets({ ...b, range });
          setChartErr(null);
          if (rangeId === '30D') setMonth({ ...b, range });
        } else if (!same) {
          setBuckets(null);
          setChartErr(b.failure.message);
        }
        if (m) setMonth({ ...m, range: monthRange });
        if (!l.failure) {
          setLedger(l);
          setLedgerErr(null);
        } else {
          setLedgerErr(l.failure.message);
        }
        if (e) setEpochs(e);
        shown.current = rangeId;
      })
      .finally(() => setBusy(false));
  }, [rangeId]);

  useEffect(load, [load, tick]);

  /*
   * The newest SAMPLE payouts arrive with every poll, so any page inside them is sliced from that
   * rather than fetched. Only a page reaching past it costs a request of its own.
   */
  const total = ledger?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const at = Math.min(page, pages - 1);
  const offset = at * pageSize;
  const sortBy = sortColumn === 'rollup' ? 'mined' : 'paid';
  // The sample arrives newest-paid first, so it only stands in for pages in that order.
  const inSample = sortBy === 'paid' && !ascending && offset + pageSize <= SAMPLE;

  useEffect(() => {
    if (inSample) {
      setPageRows(null);
      pageKey.current = null;
      return undefined;
    }
    // A new page or order blanks the table rather than showing the old rows under the new heading;
    // a poll of the same page keeps them until the fresh copy lands.
    const key = `${offset}:${pageSize}:${sortBy}:${ascending}`;
    if (pageKey.current !== key) setPageRows(null);
    pageKey.current = key;
    let live = true;
    setPageBusy(true);
    api
      .getPayments({ offset, limit: pageSize, sort: sortBy, order: ascending ? 'asc' : 'desc' })
      .then((p) => live && setPageRows(p.payments ?? []))
      .catch(() => {})
      .finally(() => live && setPageBusy(false));
    return () => {
      live = false;
    };
  }, [offset, pageSize, sortBy, ascending, inSample, tick]);

  // Clicking the active column flips its direction; a new column starts from the highest.
  const onSort = (column) => {
    if (column === sortColumn) setAscending((a) => !a);
    else {
      setSortColumn(column);
      setAscending(false);
    }
    setPage(0);
  };

  const sample = ledger?.payments ?? [];
  const rows = inSample ? sample.slice(offset, offset + pageSize) : pageRows ?? [];

  // Keeps the first row on screen in view when the page size changes.
  const onPageSize = (size) => {
    setPage(Math.floor(offset / size));
    setPageSize(size);
  };

  const model = useMemo(() => bucketModel(buckets), [buckets]);
  const monthModel = useMemo(() => bucketModel(month), [month]);
  const days = useMemo(
    () =>
      monthModel?.rows.map((r) => ({
        start: r.start,
        missing: r.missing,
        earned: earnedErg(r),
        outputs: r.outputs,
      })) ?? null,
    [monthModel],
  );

  const pace = useMemo(() => blockPace(epochs), [epochs]);
  const height = ledger?.source?.height ?? stats?.mining?.sourceHeight ?? null;
  const claims = ledger?.claims ?? [];

  const perDay =
    model && model.coveredMs > 0
      ? (earnedErg(model.totals) * 86400000n) / BigInt(model.coveredMs)
      : null;

  const earnedOf = (r) => (unit === 'erg' ? earnedErg(r) : r.litReceived);
  const fmtUnit = (v, dp) => (unit === 'erg' ? fmtErgMin(v, dp) : fmtLit(v, dp));

  const bars = useMemo(() => {
    if (!model) return null;
    const n = (v) => Number(v);
    return {
      xs: model.rows.map((r) => r.start),
      missing: model.rows.map((r) => r.missing),
      layers:
        unit === 'erg'
          ? [
              { id: 'reward', color: REWARD, values: model.rows.map((r) => n(r.reward)) },
              { id: 'batching', color: BATCHING, values: model.rows.map((r) => n(r.batching)) },
              { id: 'bounty', color: BOUNTY, values: model.rows.map((r) => n(r.bounty)) },
              { id: 'surplus', color: SURPLUS, values: model.rows.map((r) => n(r.surplus)) },
              { id: 'bond', color: BOND, values: model.rows.map((r) => n(r.bond)) },
            ]
          : [{ id: 'lit', color: LIT, values: model.rows.map((r) => n(r.litReceived)) }],
    };
  }, [model, unit]);

  /*
   * The running total holds across an interval that was not collected — nothing was taken back —
   * but has no value before the first collected one, where the chart draws its "no data" dash.
   */
  const running = useMemo(() => {
    if (!model) return [];
    const first = model.rows.findIndex((r) => !r.missing);
    let acc = 0n;
    const points = model.rows.map((r, i) => {
      acc += unit === 'erg' ? earnedErg(r) : r.litReceived;
      return first < 0 || i < first ? null : { y: Number(acc), raw: acc, interval: earnedOf(r), missing: r.missing };
    });
    return [
      {
        id: 'running',
        label: unit === 'erg' ? 'Earned, running' : 'LIT, running',
        color: RUNNING,
        area: true,
        areaOpacity: 0.28,
        points,
        format: (p) => `${fmtUnit(p.raw, 4)}${p.interval > 0n ? `  (+${fmtUnit(p.interval, 4)})` : ''}`,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, unit]);

  const barLegend =
    unit === 'erg'
      ? [
          { label: 'Reward', color: REWARD },
          { label: 'Batching', color: BATCHING },
          { label: 'Bounties', color: BOUNTY },
          { label: 'Surplus', color: SURPLUS },
          { label: 'Bond returned', color: BOND },
        ]
      : [{ label: 'LIT received', color: LIT }];

  const barTooltip = (i) => {
    const r = model.rows[i];
    const row = (color, label, value) => (
      <div className={s.hoverTipRow} key={label}>
        {color && <span className={s.hoverSwatch} style={{ background: color }} />}
        <span className={s.hoverTipLabel}>{label}</span>
        <span className={s.hoverTipValue}>{value}</span>
      </div>
    );
    return (
      <>
        <div className={s.hoverTipLabel}>
          {fullTime(r.start)} · {model.interval === 'day' ? 'day' : 'hour'}
        </div>
        {r.missing ? (
          row(null, 'not collected', '—')
        ) : unit === 'erg' ? (
          <>
            {row(REWARD, 'Reward', fmtErgMin(r.reward, 6))}
            {r.batching > 0n && row(BATCHING, 'Batching', fmtErgMin(r.batching, 6))}
            {r.bounty > 0n && row(BOUNTY, 'Bounties', fmtErgMin(r.bounty, 6))}
            {r.surplus > 0n && row(SURPLUS, 'Surplus', fmtErgMin(r.surplus, 9))}
            {row(BOND, 'Bond returned', fmtErgMin(r.bond, 6))}
            {row(null, 'Payouts', fmtInt(r.outputs))}
          </>
        ) : (
          <>
            {row(LIT, 'LIT received', fmtLit(r.litReceived))}
            {row(null, 'LIT owed', fmtLit(r.litOwed))}
            {row(null, 'Payouts', fmtInt(r.outputs))}
          </>
        )}
      </>
    );
  };

  const emptyTotals = {
    reward: 0n, surplus: 0n, bond: 0n, bounty: 0n, batching: 0n, litOwed: 0n, litReceived: 0n, outputs: 0n,
    networkReward: 0n, networkOutputs: 0n, bondPosted: 0n, slashedCount: 0n, slashedBond: 0n,
  };
  const totals = model?.totals ?? emptyTotals;
  const emptyBatching = Object.fromEntries(
    PROTOCOLS.map(({ id }) => [
      id,
      { poolOrders: 0n, poolGross: 0n, directOrders: 0n, directGross: 0n, directFee: 0n, directNet: 0n, allGross: 0n },
    ]),
  );
  const collecting = ledger && ledger.status !== 'ready';
  // A week of hours labelled by clock time alone would not say which day a tick is.
  const xLabel = (t) => timeLabel(t, rangeId === '24H' ? 'hour' : 'day');
  const emptyLabel =
    busy && !model
      ? 'Loading…'
      : unit === 'erg'
        ? `No payouts in the last ${rangeId}.`
        : `No LIT received in the last ${rangeId}.`;

  return (
    <>
      {collecting && (
        <div className={s.warnNote} style={{ marginTop: 0, marginBottom: 14 }}>
          History is {ledger.status}. Payouts and claims below reach block {fmtInt(ledger.source?.height ?? 0)} and
          may be missing anything newer.
        </div>
      )}

      {/* ---- Hero ---- */}
      <div className={s.payHero}>
        <EarnedCard totals={totals} rangeId={rangeId} perDay={perDay} busy={busy} />
        <UnpaidCard claims={claims} height={height} pace={pace} />
        <ShareCard totals={totals} payments={sample} />
      </div>

      {/* ---- Earnings over time ---- */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>Earnings over time {busy && <Spinner />}</h3>
          <div className={s.controls}>
            <div className={s.legend}>
              {[
                { id: 'bars', label: unit === 'erg' ? 'Per interval' : 'LIT per interval', color: unit === 'erg' ? REWARD : LIT },
                { id: 'running', label: 'Running total', color: RUNNING },
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
                { id: 'erg', label: 'ERG' },
                { id: 'lit', label: 'LIT' },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`${s.segBtn} ${unit === o.id ? s.segBtnOn : ''}`}
                  onClick={() => setUnit(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartErr ? (
          <div className={s.empty}>{chartErr}</div>
        ) : view === 'bars' ? (
          <StackedBars
            xs={bars?.xs ?? []}
            layers={bars?.layers ?? []}
            missing={bars?.missing ?? []}
            height={250}
            xLabel={xLabel}
            yFormat={axisAmount}
            tooltip={barTooltip}
            animateKey={`${rangeId}:${unit}`}
            emptyLabel={emptyLabel}
          />
        ) : (
          <SeriesChart
            series={running.some((l) => l.points.some((p) => p && p.y > 0)) ? running : []}
            xs={model?.rows.map((r) => r.start) ?? []}
            height={250}
            smooth={false}
            xLabel={xLabel}
            yFormat={(v) => axisAmount(Math.max(0, v))}
            tooltipTitle={(t) => fullTime(t)}
            animateKey={`running:${rangeId}:${unit}`}
            emptyLabel={emptyLabel}
          />
        )}

        <div className={s.chartFoot}>
          {view === 'bars' && (
            <div className={s.legend}>
              {barLegend.map((l) => (
                <span key={l.label} className={s.legendStatic}>
                  <span className={s.swatch} style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          <p className={s.cardNote}>
            {view === 'bars'
              ? `Each bar is one ${model?.interval === 'day' ? 'UTC day' : 'hour'}, stacked by where the ERG came from.`
              : `What was earned since the start of the window, ${unit === 'erg' ? 'bond excluded' : 'in LIT'}.`}
            {model?.partial && (
              <>
                {' '}
                <PartialTag />
              </>
            )}
          </p>
        </div>
      </div>

      {/* ---- Claims | profile + batching ---- */}
      <div className={s.split}>
        <ClaimsCard
          claims={claims}
          height={height}
          pace={pace}
          holdingBlocks={ledger?.holdingBlocks ?? 0}
          evaluationBlocks={ledger?.evaluationBlocks ?? 0}
        />
        <div className={s.stackCol}>
          <ProfileCard payments={sample} days={days} />
          <BatchingCard batching={model?.batching ?? emptyBatching} rangeId={rangeId} />
        </div>
      </div>

      {/* ---- History ---- */}
      <HistoryCard
        payments={rows}
        page={at}
        pages={pages}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={onPageSize}
        sortColumn={sortColumn}
        ascending={ascending}
        onSort={onSort}
        loading={pageBusy || (busy && !ledger)}
        retainedFromHeight={ledger?.retainedFromHeight ?? null}
        error={ledgerErr}
      />

      {(ledger?.bounties?.length ?? 0) > 0 && <BountiesCard bounties={ledger.bounties} />}
    </>
  );
}
