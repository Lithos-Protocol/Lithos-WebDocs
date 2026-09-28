import React from 'react';
import s from './styles.module.css';
import { fmtDuration, fmtErgAmount, fmtInt, fmtIntCompact, fmtPct, shortId } from './format';

/** Plainer names for the `stratum.candidate.sources` keys. */
const SOURCE_LABELS = {
  rollups: 'Rollups',
  emissions: 'Emissions',
  rent: 'Storage rent',
  lithosdex: 'LithosDex',
  ergodex: 'ErgoDEX',
};

const STRATEGY_LABELS = { highestFee: 'highest fee', random: 'random' };

/** A millisecond setting in seconds, keeping the fraction a setting like 1500 has. */
const secs = (ms) => `${Number((Number(ms) / 1000).toFixed(2))}s`;

/**
 * Why a source is or is not asked, in the order the client decides it. Anything enabled but not
 * asked is a setting that does not do what it looks like, so it reads as a warning.
 */
function sourceState(source, blockTransactions) {
  if (source.active) return { text: 'asked', tone: s.srcOn };
  if (!source.enabled) return { text: 'off', tone: s.srcOff };
  if (!blockTransactions) return { text: 'not asked', tone: s.srcWarn, why: 'blockTransactions is off' };
  if (!(source.maxTxs > 0)) return { text: 'no slots', tone: s.srcWarn, why: 'maxTxs is 0' };
  return { text: 'batcher off', tone: s.srcWarn, why: `batching.${source.name}.enabled is false` };
}

function Kv({ k, v, title, dim, tone }) {
  return (
    <div className={s.kv}>
      <span className={s.kvKey}>{k}</span>
      <span className={`${s.kvVal} ${dim ? s.kvValDim : ''} ${tone ?? ''}`} title={title}>
        {v}
      </span>
    </div>
  );
}

/** What the settings card shows while the client has not answered. */
function Unread({ error }) {
  return (
    <p className={s.cardNote}>
      {error?.status === 404
        ? 'This client does not report its candidate settings. Update it to see them here.'
        : error
          ? `Could not read the candidate settings: ${error.message}`
          : 'Reading the candidate settings…'}
    </p>
  );
}

/**
 * The collateral box the served genesis spends, and how the client picks one.
 *
 * A lender posts the priority fee on top of the principal floor; the genesis pays a fifth of it to
 * this miner and the rest into the pool's payout for the block.
 */
function CollateralCard({ pkg, settings, blockSeconds }) {
  const fee = pkg?.collateralPriorityFeeNanoErg;
  const clearance = settings?.clearanceAge;
  const byFee = settings?.collateralStrategy === 'highestFee';
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Collateral box</h3>
        <span className={s.label}>{settings ? STRATEGY_LABELS[settings.collateralStrategy] ?? settings.collateralStrategy : ''}</span>
      </div>
      <div className={s.label}>Priority fee</div>
      <div className={s.bigStat} style={{ marginTop: 6 }}>
        <span className={s.bigStatValue}>{fee == null ? '—' : fmtErgAmount(fee, 4)}</span>
        <span className={s.bigStatUnit}>ERG</span>
      </div>
      <p className={s.cardNote}>above the principal floor</p>
      <div className={s.rows} style={{ marginTop: 14 }}>
        <Kv
          k="Paid to you"
          v={pkg?.collateralFinderFeeNanoErg == null ? '—' : `${fmtErgAmount(pkg.collateralFinderFeeNanoErg, 4)} ERG`}
        />
        <Kv k="Box" v={pkg ? shortId(pkg.collateralBoxId) : '—'} title={pkg?.collateralBoxId} dim />
        <Kv k="Lender" v={pkg?.lenderAddress ? shortId(pkg.lenderAddress) : '—'} title={pkg?.lenderAddress} dim />
        <Kv
          k="Clearance age"
          v={
            clearance == null
              ? '—'
              : !byFee
                ? 'not used'
                : `${fmtInt(clearance)} blocks${blockSeconds ? ` · ~${fmtDuration(clearance * blockSeconds * 1000)}` : ''}`
          }
          dim
        />
      </div>
      <p className={s.cardNote} style={{ marginTop: 12 }}>
        {byFee
          ? 'The client spends the box paying the highest priority fee, unless one has been live for the clearance age: then the oldest goes first.'
          : settings
            ? 'The client draws from every usable box regardless of fee, so it may earn a lower priority fee.'
            : 'A fifth of the priority fee is paid to whoever mines the box. The rest joins the pool payout.'}
      </p>
    </div>
  );
}

/** Whether blocks carry extra transactions, and which sources supply them. */
function SourcesCard({ pkg, settings, error }) {
  const on = settings?.blockTransactions;
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Extra transactions</h3>
        {settings && (
          <span className={`${s.chip} ${on ? s.chipOn : s.chipOff}`}>{on ? 'on' : 'off'}</span>
        )}
      </div>
      {!settings ? (
        <Unread error={error} />
      ) : (
        <>
          <div className={s.srcTable} role="table" aria-label="Transaction sources">
            <div className={`${s.srcTr} ${s.srcTh}`} role="row">
              <span role="columnheader">Source</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Max txs</span>
              <span role="columnheader">Max bytes</span>
              <span role="columnheader">Max cost</span>
              <span role="columnheader">This job</span>
            </div>
            {settings.sources.map((src) => {
              const state = sourceState(src, on);
              const included = pkg?.sources?.includes(src.name);
              const late = pkg?.lateSources?.includes(src.name);
              return (
                <div key={src.name} className={s.srcTr} role="row">
                  <span className={s.srcName} role="cell">
                    {SOURCE_LABELS[src.name] ?? src.name}
                  </span>
                  <span className={state.tone} role="cell" title={state.why}>
                    {state.text}
                  </span>
                  <span role="cell">{fmtInt(src.maxTxs)}</span>
                  <span role="cell">{fmtIntCompact(src.maxBytes)}</span>
                  <span role="cell">{fmtIntCompact(src.maxCost)}</span>
                  <span className={late ? s.srcWarn : included ? s.srcOn : s.srcOff} role="cell">
                    {late ? 'late' : included ? 'included' : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className={s.cardNote} style={{ marginTop: 12 }}>
            {on ? (
              <>
                Your blocks carry the genesis transaction plus what the asked sources build, up to{' '}
                {fmtPct(settings.blockShare, 0)} of the block&apos;s size and cost limits.
              </>
            ) : (
              <>
                Your blocks carry only the genesis transaction. Set{' '}
                <code>stratum.candidate.blockTransactions = true</code> and restart the client to add
                these sources.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** When a served job is replaced before the next block. */
function RefreshCard({ settings, error }) {
  const every = settings?.mempoolRefreshMs;
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Job refresh</h3>
        <span className={s.label}>mid-block</span>
      </div>
      {!settings ? (
        <Unread error={error} />
      ) : (
        <>
          <div className={s.rows}>
            <Kv k="Rebuild every" v={every > 0 ? secs(every) : 'off'} />
            <Kv k="Min revenue gain" v={`${fmtErgAmount(settings.minCandidateChangeRevenue, 4)} ERG`} />
            <Kv
              k="For protocol txs"
              v={settings.refreshForProtocolTxs ? `at ${fmtInt(settings.minNewProtocolTxs)} new` : 'off'}
            />
            <Kv k="Wait for package" v={settings.waitForBlockPackage ? 'on' : 'off'} dim />
            <Kv k="Source timeout" v={secs(settings.blockTxTimeout)} dim />
            <Kv k="Genesis wait" v={secs(settings.genesisWaitMs)} dim />
          </div>
          <p className={s.cardNote} style={{ marginTop: 12 }}>
            {every > 0
              ? 'A rebuilt package replaces the job when it earns at least the minimum gain more, or adds enough rollup or emission transactions.'
              : 'The package is built once per block and never replaced mid-block.'}
          </p>
        </>
      )}
    </div>
  );
}

/** The candidate settings row: the collateral box, the transaction sources and the refresh rules. */
export default function PackageSettings({ pkg, settings, error, blockSeconds }) {
  return (
    <div className={s.pkgRow}>
      <CollateralCard pkg={pkg} settings={settings} blockSeconds={blockSeconds} />
      <SourcesCard pkg={pkg} settings={settings} error={error} />
      <RefreshCard settings={settings} error={error} />
    </div>
  );
}
