import React, { useEffect, useState } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import * as api from './api';
import { useMining } from './MiningLayout';
import { fmtDuration, fmtInt, fmtNum, fmtPct } from './format';
import {
  NETWORKS,
  NISP_COEFFICIENT,
  NISP_SHARES,
  WINDOW_BLOCKS,
  diffFor,
  fmtConfigDiff,
  meanFor,
  miningSeconds,
  parseConfigDiff,
  parseHashrate,
  tradeRows,
  windowSeconds,
} from './trade';

/*
 * Score, chance and expected earnings depend only on the average, so the rows are fixed. The
 * hashrate and the rebuild time only move the diff column.
 */
const ROWS = tradeRows(5, 20);
const PEAK = ROWS.find((r) => r.peak);
const TOP = PEAK.earnings;
/** The guide's ideal range: steady enough to pool for, close enough to the peak to cost little. */
const IDEAL = { from: 10, to: 15 };
const isIdeal = (mean) => mean >= IDEAL.from && mean <= IDEAL.to;

/** The three averages worth reading first: the floor of the range, its peak, and its safe end. */
const PICKS = [
  { mean: IDEAL.from, label: 'Floor', note: 'biggest cut, paid about half the time' },
  { mean: PEAK.mean, label: 'Peak', note: 'highest expected earnings' },
  { mean: IDEAL.to, label: 'Steady', note: 'paid almost every window' },
];

/** A whole number of milliseconds from what was typed, or null when it is not one. */
function parseMs(text) {
  const t = String(text ?? '').trim().replace(/\s*ms$/i, '');
  if (t === '') return 0;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** A score as a config-style diff, or a dash when there is none. */
const asDiff = (score) => (score == null ? '—' : fmtConfigDiff(Number(score)));

function DiffTile({ label, value, raw, children, tone }) {
  return (
    <div className={`${s.diffTile} ${tone ? s[tone] : ''}`}>
      <span className={s.label}>{label}</span>
      <span className={s.diffValue}>{value}</span>
      {raw && <span className={s.calcDim}>score {raw}</span>}
      <p className={s.diffNote}>{children}</p>
    </div>
  );
}

/**
 * The four difficulties a miner meets, side by side.
 *
 * They differ for real reasons — the chain only honours a commitment after a delay, and reduced
 * reporting hands miners a harder number than the one they are paid on — and a miner who sees two
 * of them disagree needs to know which one is doing what.
 */
function DifficultiesPanel({ configDiff, difficulty }) {
  const config = parseConfigDiff(configDiff);
  const d = difficulty;
  // The config is written to three figures, so a round trip through it is not exact.
  const near = (score) => score != null && config != null && Math.abs(config - Number(score)) / Number(score) <= 0.005;
  // A pending commitment matching the config is the change already under way, not a mismatch.
  const differs = config != null && d?.committed != null && !near(d.committed) && !near(d.pending);
  // A client that does not report the multiplier always reduced by the full coefficient.
  const multiplier = Number(d?.reductionMultiplier ?? NISP_COEFFICIENT);
  const onlySuper = multiplier >= NISP_COEFFICIENT;
  const base = d?.forcedConfig ? 'config' : 'committed';

  return (
    <div className={`${s.card} ${s.stackGap}`}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Your difficulties</h3>
        <span className={s.label}>
          {d?.checkedHeight ? `commitment read at block ${fmtInt(d.checkedHeight)}` : 'from the stratum'}
        </span>
      </div>

      <div className={s.diffGrid}>
        <DiffTile label="Config diff" value={asDiff(config)} raw={config != null ? fmtInt(config) : null}>
          The <code>diff</code> set in your config file{configDiff ? <>, written there as <code>{configDiff}</code></> : ''}.
        </DiffTile>

        <DiffTile
          label="Committed diff"
          value={asDiff(d?.committed)}
          raw={d?.committed ? fmtInt(d.committed) : null}
          tone={d?.committed ? 'diffTileKey' : undefined}
        >
          On chain, and what your NISPs are judged against. This is your score, your share of every
          payout.
          {d?.pending && (
            <span className={s.diffPending}>
              Changing to {asDiff(d.pending)} at block {fmtInt(d.pendingFromHeight)}.
            </span>
          )}
          {d && !d.committed && !d.pending && ' None is in force yet.'}
        </DiffTile>

        <DiffTile
          label="Stratum diff"
          value={asDiff(d?.advertised)}
          raw={d?.advertised ? fmtInt(d.advertised) : null}
          tone={d?.forcedConfig ? 'diffTileWarn' : undefined}
        >
          What the stratum sends your mining software, and the difficulty it shows.
          {d?.reducedReporting ? (
            <span className={s.diffAside}>
              Reduced share reporting is on, so this is {fmtInt(multiplier)}× your {base} diff.{' '}
              {onlySuper
                ? 'This means that your miner only reports super shares.'
                : `Your miner reports about ${fmtInt(NISP_COEFFICIENT / multiplier)} shares for every super share.`}
            </span>
          ) : (
            d && ` It is your ${base} diff.`
          )}
        </DiffTile>

        <DiffTile label="Super-share diff" value={asDiff(d?.superShare)} raw={d?.superShare ? fmtInt(d.superShare) : null}>
          {fmtInt(NISP_COEFFICIENT)} × your {base} diff. A share this hard to find counts toward a NISP.
          {d?.reducedReporting &&
            (onlySuper
              ? ' Equal to the stratum diff while reduced share reporting is on.'
              : ` ${fmtInt(NISP_COEFFICIENT / multiplier)}× the stratum diff at a reduction multiplier of ${fmtInt(multiplier)}.`)}
        </DiffTile>
      </div>

      {(differs || d?.forcedConfig) && (
        <div className={s.warnNote}>
          {d?.forcedConfig
            ? 'forceConfigDiff is on: jobs use your config diff rather than your commitment, and NISPs built on a diff you have not committed can be judged fraudulent.'
            : 'Your config diff differs from your commitment. Jobs and payouts follow the commitment.'}
        </div>
      )}
      {!d && (
        <p className={s.cardNote} style={{ marginTop: 12 }}>
          The stratum has not reported yet: its difficulties appear once it is running.
        </p>
      )}
    </div>
  );
}

export default function DifficultyPanel() {
  const { stats } = useMining();
  const [text, setText] = useState('');
  const [genText, setGenText] = useState('');
  const [picked, setPicked] = useState(null);
  const [clientNetwork, setClientNetwork] = useState(null);
  const [configDiff, setConfigDiff] = useState(null);

  useEffect(() => {
    api.getInfo().then((i) => setClientNetwork(i?.network ?? null)).catch(() => {});
    api.getStratumInfo().then((m) => setConfigDiff(m?.diff ?? null)).catch(() => {});
  }, []);

  // The client's own network until the miner chooses otherwise; mainnet if the client is silent.
  const network = picked ?? (NETWORKS[clientNetwork] ? clientNetwork : 'MAINNET');
  const windowSecs = windowSeconds(network);
  const genMs = parseMs(genText);
  const seconds = miningSeconds(network, genMs ?? 0);
  const lost = windowSecs - seconds;
  const hashrate = parseHashrate(text);
  const typed = text.trim() !== '';

  const current = parseConfigDiff(configDiff);
  const currentMean = hashrate && current ? meanFor(hashrate, seconds, current) : null;
  // Marked only when it lands inside the table; the line above says where it is otherwise.
  const youRow =
    currentMean != null && currentMean >= ROWS[0].mean - 0.5 && currentMean <= ROWS[ROWS.length - 1].mean + 0.5
      ? Math.round(currentMean)
      : null;

  const diffAt = (mean) => (hashrate && seconds > 0 ? fmtConfigDiff(diffFor(hashrate, seconds, mean)) : '—');

  return (
    <>
      <div className={s.card}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>Difficulty calculator</h3>
          <div className={s.seg}>
            {Object.entries(NETWORKS).map(([id, n]) => (
              <button
                key={id}
                type="button"
                className={`${s.segBtn} ${network === id ? s.segBtnOn : ''}`}
                onClick={() => setPicked(id)}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        <p className={s.blurb}>
          On a regular pool, <code>diff</code> only sets how often your rig reports in, and you are
          paid by the number of shares submitted. Lithos does not count shares. To be paid for a block, you prove
          your hashrate by finding a NISP: <b>{NISP_SHARES} super shares</b>, with each super share being {fmtInt(NISP_COEFFICIENT)}×
          harder than your <code>diff</code> and found within a window of {WINDOW_BLOCKS} blocks.
          
          <br/><br/>Your{' '} <code>diff</code> becomes your score, which is the percentage cut of every block reward you get for providing hashrate to the pool. 
          However diff doesn't just effect the amount you get paid, it also sets how often you find a NISP, and in turn, how <i>often</i> you get paid.
          Enter your hashrate and this works out the <code>diff</code>{' '} that balances a bigger cut of rewards against payment frequency.
        </p>

        <div className={s.calcRow}>
          <label className={s.calcField}>
            <span className={s.label}>Your hashrate</span>
            <input
              className={`${s.calcInput} ${typed && !hashrate ? s.calcInputBad : ''}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 150 MH/s"
              spellCheck={false}
              autoComplete="off"
              inputMode="decimal"
            />
            <span className={s.calcEcho}>
              {hashrate
                ? `${fmtInt(Math.round(hashrate))} H/s`
                : typed
                  ? 'Needs a unit letter — try 150 MH/s, 150M or 1.2 GH/s'
                  : 'Needs a unit: K, M, G, T or P. H/s is optional.'}
            </span>
          </label>

          <label className={s.calcField}>
            <span className={s.label}>Table generation time (Optional)</span>
            <div className={s.calcUnitWrap}>
              <input
                className={`${s.calcInput} ${s.calcInputSmall} ${genMs == null ? s.calcInputBad : ''}`}
                value={genText}
                onChange={(e) => setGenText(e.target.value)}
                placeholder="0"
                spellCheck={false}
                autoComplete="off"
                inputMode="decimal"
              />
              <span className={s.calcUnit}>ms</span>
            </div>
            <span className={s.calcEcho}>
              {genMs == null
                ? 'Milliseconds, e.g. 850'
                : lost > 0
                  ? `Hashing ${fmtInt(Math.round(seconds))} s of every ${fmtInt(windowSecs)} s window (−${fmtPct(lost / windowSecs, 1)})`
                  : `Window: ${WINDOW_BLOCKS} blocks ≈ ${fmtDuration(windowSecs * 1000)} on ${NETWORKS[network].label.toLowerCase()}`}
            </span>
          </label>
        </div>

        <div className={s.calcHelp}>
          <p className={s.cardNote}>
            <b>Hashrate:</b> the rate your miner reports while it is hashing. <b>Table generation:</b>{' '}
            Autolykos 2 rebuilds its lookup table every time the block height changes, and your rig
            stops hashing while it does. Over a {WINDOW_BLOCKS}-block window those pauses add up, so
            enter the average rebuild time your miner reports and the diffs below shrink to match.
          </p>
        </div>

        <div className={s.picks}>
          {PICKS.map((p) => (
            <div key={p.label} className={`${s.pick} ${p.mean === PEAK.mean ? s.pickPeak : ''}`}>
              <span className={s.label}>
                {p.label} · averaging {p.mean}
              </span>
              <span className={s.pickDiff}>{diffAt(p.mean)}</span>
              <span className={s.calcDim}>{p.note}</span>
            </div>
          ))}
        </div>

        {configDiff && (
          <p className={s.cardNote} style={{ marginTop: 12 }}>
            Your config <code>diff</code> is <span className={s.nispNum}>{configDiff}</span>:
            {currentMean != null && (
              <>
                {' '}
                at this hashrate it averages about{' '}
                <span className={s.nispNum}>{fmtNum(currentMean, 1)}</span> super shares per window
                {isIdeal(Math.round(currentMean))
                  ? ', inside the ideal range.'
                  : currentMean < IDEAL.from
                    ? ', below the range: most windows will not pay.'
                    : ', above the range: dependable, but a higher diff would earn more.'}
              </>
            )}
          </p>
        )}
      </div>

      <div className={`${s.card} ${s.stackGap}`}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>Optimal difficulty</h3>
          <span className={s.label}>
            ideal {IDEAL.from}–{IDEAL.to} · peak {PEAK.mean}
          </span>
        </div>

        <p className={s.blurb}>
          Each row is a <code>diff</code> you could set, named by how many super shares it averages
          per window. Payment is dependent on finding a NISP, which is exactly 10 super-shares. A higher{' '}
          <code>diff</code> gives a bigger score but fewer average super shares, so you are less likely to mine a NISP; a lower
          one pays makes it easier to mine a NISP, but each payout is smaller.
          
          <br/><br/> <b>Expected earnings</b> multiplies
          the two. It peaks at {PEAK.mean} and stays within about 6% of that from 11 to 15, which is why
          10–15 is the ideal range. Going toward 10 leads to bigger, less frequent payouts, while going toward 15 allows for
          smaller, steadier ones. Below 10, earnings fall off fast.
        </p>

        <div className={s.tradeTable} role="table" aria-label="Diff for each average super-share count">
          <div className={`${s.tradeTr} ${s.tradeTh}`} role="row">
            <span role="columnheader">Average # of super shares</span>
            <span role="columnheader">Set diff</span>
            <span role="columnheader">Chance to mine a NISP (10 super shares)</span>
            <span role="columnheader">Score (how much work you will be paid for)</span>
            <span role="columnheader">Expected earnings</span>
          </div>
          {ROWS.map((r) => {
            const cls = [
              s.tradeTr,
              isIdeal(r.mean) && s.tradeIdeal,
              r.mean === IDEAL.from && s.tradeIdealFirst,
              r.mean === IDEAL.to && s.tradeIdealLast,
              r.peak && s.tradePeak,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={r.mean} className={cls} role="row">
                <span className={s.tradeMean} role="cell">
                  {r.mean}
                  {r.peak && <span className={s.peakTag}>peak</span>}
                  {r.mean === youRow && <span className={s.youTag}>your diff</span>}
                </span>
                <span className={s.tradeDiff} role="cell">
                  {diffAt(r.mean)}
                </span>
                <span role="cell">{fmtPct(r.chance, 1)}</span>
                <span role="cell">{fmtPct(r.score, 0)}</span>
                <span className={s.tradeEe} role="cell">
                  <span className={s.eeBar}>
                    <span className={s.eeFill} style={{ width: `${(r.earnings / TOP) * 100}%` }} />
                  </span>
                  {fmtPct(r.earnings, 0)}
                </span>
              </div>
            );
          })}
        </div>

        <p className={s.cardNote} style={{ marginTop: 12 }}>
          Score and expected earnings are relative to averaging ten, and expected earnings assumes your
          score is a small part of each block's total. Super shares per window follow a Poisson spread
          around your average. A new <code>diff</code> takes {WINDOW_BLOCKS} blocks to take effect. The{' '}
          <Link to="/docs/tutorial-basics/mining-on-lithos#the-trade">mining guide</Link> covers the
          trade in full.
        </p>
      </div>

      <DifficultiesPanel configDiff={configDiff} difficulty={stats?.local?.stratum?.difficulty} />
    </>
  );
}
