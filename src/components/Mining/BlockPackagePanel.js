import React, { useMemo, useState } from 'react';
import s from './styles.module.css';
import { useMining } from './MiningLayout';
import BlockCube from './BlockCube';
import TxStackList from './TxStackList';
import CompositionPanel from './CompositionPanel';
import { Alert } from '../Dex/ui';
import { big, fmtAge, fmtErgAmount, fmtInt, fmtNum, fmtPct, fullTime, shortId } from './format';

/*
 * One colour per transaction kind.
 *
 * These are `CandidateTx.kind` values, which are a different vocabulary from the accounting keys
 * the statistics endpoints use — a candidate says `nisp-submission` where the totals say
 * `rollup.submission`. Genesis is the Lithos purple because it is the transaction that makes the
 * block a Lithos block at all. An unrecognised kind falls back to slate rather than being dropped.
 */
const KIND_COLORS = {
  genesis: '#a855f7',
  /*
   * Rose. The top-up caps the stack flush against the mempool motes, so it has to sit far from
   * their blue — but the obvious pick there, a yellow-green, is an acid colour at this saturation
   * and glares against a dark card. Rose is the other end of the same contrast without the glare.
   */
  'holding-topup': '#f43f5e',
  'holding-transform': '#22d3ee',
  'eval-transform': '#34d399',
  'nisp-submission': '#60a5fa',
  // Defined but not currently reachable: a fraud proof cannot be built fee-less, so it is
  // broadcast on its own rather than admitted to a package. Kept for when that path lands, and
  // pushed deeper than the default red so it would stay clear of the top-up's rose.
  'fraud-proof': '#dc2626',
  payout: '#fbbf24',
  activate: '#c084fc',
  clear: '#e879f9',
  'lithosdex-batch': '#2dd4bf',
  'ergodex-batch': '#f472b6',
  'storage-rent': '#fb923c',
  'mempool-ancestor': '#64748b',
};
const FALLBACK = '#475569';
const colorOf = (kind) => KIND_COLORS[kind] ?? FALLBACK;

/** Plainer names than the wire kinds, for a legend someone has to read at a glance. */
const KIND_LABELS = {
  genesis: 'genesis',
  'holding-topup': 'holding top-up',
  'holding-transform': 'holding transform',
  'eval-transform': 'eval transform',
  'nisp-submission': 'NISP submission',
  'fraud-proof': 'fraud proof',
  payout: 'payout',
  activate: 'activate',
  clear: 'clear',
  'lithosdex-batch': 'LithosDex batch',
  'ergodex-batch': 'ErgoDEX batch',
  'storage-rent': 'storage rent',
  'mempool-ancestor': 'mempool ancestor',
};
const labelOf = (kind) => KIND_LABELS[kind] ?? kind;

const ANCESTOR = 'mempool-ancestor';
const GENESIS = 'genesis';
const TOPUP = 'holding-topup';

/**
 * Stack order, bottom to top: genesis, everything admitted, then the holding top-up.
 *
 * This is the order the node applies them in, standing up. Genesis founds the block and belongs at
 * the base; the top-up is the last thing this client contributes, so it sits directly beneath the
 * volume the node fills from its own mempool — which is what actually comes next in the block.
 * Reversing it put the top-up at the floor and left the mempool resting on the genesis, which is
 * the opposite of the order the block is built in.
 *
 * `position` carries the original index through, so a member still knows where it really sits.
 */
function stackOrder(txs) {
  const indexed = txs.map((tx, position) => ({ ...tx, position }));
  const genesis = indexed.filter((t) => t.kind === GENESIS);
  const topUp = indexed.filter((t) => t.kind === TOPUP);
  const rest = indexed.filter((t) => t.kind !== TOPUP && t.kind !== GENESIS);
  return [...genesis, ...rest, ...topUp];
}

const AXES = [
  { id: 'bytes', label: 'BYTES' },
  { id: 'cost', label: 'COST' },
];

/*
 * Three containers, because they answer different questions and no single one answers all of them.
 * A Lithos package is typically a few percent of a block, so drawn against the block its slabs are
 * hairlines — true, but useless for comparing them. Drawn against itself they are legible but say
 * nothing about how much of the block is claimed. Both views are needed, so both are offered.
 */
const SCALES = [
  { id: 'self', label: 'PACKAGE' },
  { id: 'package', label: 'ALLOWANCE' },
  { id: 'block', label: 'WHOLE BLOCK' },
];

const SCALE_NAMES = {
  self: 'package itself',
  package: "package's allowance",
  block: 'whole block',
};

/** A labelled fill meter. Both budgets get one, so neither is hidden behind the cube's toggle. */
function Meter({ label, used, limit, share, color, unit }) {
  const pct = limit > 0 ? Math.min(1, used / limit) : null;
  const sharePct = limit > 0 && share > 0 ? Math.min(1, share / limit) : null;
  return (
    <div className={s.meter}>
      <div className={s.meterHead}>
        <span className={s.railName}>{label}</span>
        <span className={s.meterVal}>
          {fmtInt(used)}
          <span className={s.railUnit}>{unit}</span>
          {limit > 0 && <span className={s.meterOf}> / {fmtInt(limit)}</span>}
        </span>
      </div>
      <div className={s.meterTrack}>
        {pct != null && (
          <div
            className={s.meterFill}
            style={{ width: `${Math.max(pct * 100, pct > 0 ? 0.6 : 0)}%`, background: color }}
          />
        )}
        {sharePct != null && sharePct < 1 && (
          <div className={s.meterMark} style={{ left: `${sharePct * 100}%` }} />
        )}
      </div>
      <div className={s.railSub}>
        {pct == null
          ? 'the node did not report this limit'
          : `${fmtPct(pct, pct < 0.01 ? 3 : 2)} of the ${
              share > 0 && share < limit ? 'block' : 'limit'
            }${sharePct != null && sharePct < 1 ? ` · allowance marked at ${fmtPct(sharePct, 0)}` : ''}`}
      </div>
    </div>
  );
}

export default function BlockPackagePanel() {
  const { stats, loading } = useMining();
  const [axis, setAxis] = useState('bytes');
  const [scale, setScale] = useState('package');
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);

  const stratum = stats?.local?.stratum;
  const job = stratum?.activeJob;
  const pkg = job?.blockPackage;

  const model = useMemo(() => {
    if (!pkg) return null;
    const txs = stackOrder(pkg.transactions ?? []);
    const valueOf = (tx) => Number(big(axis === 'bytes' ? tx.sizeBytes : tx.cost));

    const usedBytes = Number(big(pkg.knownSizeBytes));
    const usedCost = Number(big(pkg.knownCost));
    const blockBytes = pkg.blockMaxSizeBytes == null ? 0 : Number(big(pkg.blockMaxSizeBytes));
    const blockCost = pkg.blockMaxCost == null ? 0 : Number(big(pkg.blockMaxCost));
    const shareBytes = pkg.packageMaxSizeBytes == null ? 0 : Number(big(pkg.packageMaxSizeBytes));
    const shareCost = pkg.packageMaxCost == null ? 0 : Number(big(pkg.packageMaxCost));

    const used = axis === 'bytes' ? usedBytes : usedCost;
    const limitFor = (which) => {
      if (which === 'self') return used;
      if (axis === 'bytes') return which === 'block' ? blockBytes : shareBytes;
      return which === 'block' ? blockCost : shareCost;
    };

    const capacity = limitFor(scale);

    return {
      txs,
      slabs: txs.map((tx, i) => ({
        id: tx.id ?? `tx-${i}`,
        value: valueOf(tx),
        color: colorOf(tx.kind),
        ghost: tx.proofLeafMatched === false,
      })),
      // Falls back to the package's own total so the cube still draws something when the node's
      // limits are missing — with the caption saying the container is the package, not a limit.
      capacity: capacity > 0 ? capacity : used,
      // Whether the node gave us a denominator at all, which is separate from the container in use:
      // the PACKAGE view scales against the package itself and needs no limit.
      haveLimits: (axis === 'bytes' ? blockBytes : blockCost) > 0,
      markers:
        scale === 'block' && limitFor('package') > 0
          ? [{ id: 'allowance', at: limitFor('package'), color: 'rgba(251,191,36,0.9)' }]
          : [],
      used,
      usedBytes,
      usedCost,
      blockBytes,
      blockCost,
      shareBytes,
      shareCost,
      kinds: [...new Set(txs.map((t) => t.kind))],
      ancestors: txs.filter((t) => t.kind === ANCESTOR),
      // An ancestor's cost is 0 when the node reported none, which is "unmeasured", not "free".
      // Counting those as zero would understate how much of the cost budget the package really
      // needs, so they are called out rather than folded into the totals silently.
      uncostedAncestors: txs.filter((t) => t.kind === ANCESTOR && !(Number(big(t.cost)) > 0)).length,
    };
  }, [pkg, axis, scale]);

  if (loading && !stats) return <div className={s.card}>Loading…</div>;

  if (!job) {
    return (
      <div className={s.card}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>No job being served</h3>
          <span className={s.label}>{stratum?.status ?? 'unknown'}</span>
        </div>
        <p className={s.cardNote} style={{ fontSize: 13 }}>
          {stratum?.status === 'disabled'
            ? 'The Stratum server is not running, so this client is not serving work.'
            : 'The client has not published a job yet. It appears here as soon as one is broadcast.'}
        </p>
      </div>
    );
  }

  const hoveredTx = hovered != null ? model?.txs?.[hovered] : null;
  const unit = axis === 'bytes' ? 'B' : '';

  return (
    <>
      {/* ---- Job header ---- */}
      <div className={s.hero}>
        <div className={`${s.card} ${s.jobCard}`}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Block {fmtInt(job.height)}</h3>
            <span className={`${s.chip} ${s.chipMode}`}>{job.mode}</span>
          </div>
          <div className={s.rows}>
            <div className={s.kv}>
              <span className={s.kvKey}>Job</span>
              <span className={s.kvVal} title={job.jobId}>
                {job.jobId}
              </span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Published</span>
              <span className={`${s.kvVal} ${s.kvValDim}`} title={fullTime(job.publishedAt)}>
                {fmtAge(job.publishedAt) ?? '—'} ago
              </span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Parent</span>
              <span className={`${s.kvVal} ${s.kvValDim}`} title={job.parentId}>
                {shortId(job.parentId)}
              </span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Revision</span>
              <span className={s.kvVal}>{fmtInt(pkg?.revision ?? 0)}</span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Connections</span>
              <span className={`${s.kvVal} ${s.kvValDim}`}>
                {fmtInt(stratum?.connectedConnections ?? 0)}
              </span>
            </div>
          </div>
          <div className={s.workMsg} title={job.workMessage}>
            <span className={s.kvKey}>work</span> {shortId(job.workMessage, 16, 16)}
          </div>
          <p className={s.cardNote} style={{ marginTop: 10 }}>
            The last publication this client broadcast to workers
          </p>
        </div>

        <div className={`${s.card} ${s.meterCard}`}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Budgets</h3>
            <span className={s.label}>both limits at once</span>
          </div>
          <Meter
            label="Size"
            used={model?.usedBytes ?? 0}
            limit={model?.blockBytes ?? 0}
            share={model?.shareBytes ?? 0}
            color="linear-gradient(90deg, #38bdf8, #38bdf855)"
            unit=" B"
          />
          <Meter
            label="Validation cost"
            used={model?.usedCost ?? 0}
            limit={model?.blockCost ?? 0}
            share={model?.shareCost ?? 0}
            color="linear-gradient(90deg, #a855f7, #a855f755)"
            unit=""
          />
          <p className={s.cardNote} style={{ marginTop: 12 }}>
            A block is capped on both validation cost and transaction size.
            The amber mark is the slice of the block one Lithos package is allowed.
          </p>
        </div>

        <div className={`${s.card} ${s.revenueCard}`}>
          <div className={s.label}>Expected revenue</div>
          <div className={s.bigStat} style={{ marginTop: 8 }}>
            <span className={s.bigStatValue}>
              {fmtErgAmount(pkg?.expectedRevenueNanoErg ?? 0, 4)}
            </span>
            <span className={s.bigStatUnit}>ERG</span>
          </div>
          <p className={s.cardNote} style={{ marginTop: 10 }}>
            What this package proposes to earn if it is mined. Not confirmed income.
          </p>
          <div className={s.rows} style={{ marginTop: 14 }}>
            <div className={s.kv}>
              <span className={s.kvKey}>Transactions</span>
              <span className={s.kvVal}>{fmtInt(model?.txs?.length ?? 0)}</span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Sources</span>
              <span className={`${s.kvVal} ${s.kvValDim}`}>
                {pkg?.sources?.length ? pkg.sources.join(', ') : 'none'}
              </span>
            </div>
          </div>
          {pkg?.lateSources?.length > 0 && (
            <div className={s.warnNote}>
              <span>
                <strong>{pkg.lateSources.join(', ')}</strong> missed the collection deadline, so
                nothing of theirs is in this package.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---- The cube ---- */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h3 className={s.cardTitle}>The candidate block</h3>
          <div className={s.controls}>
            <span className={s.label}>measure by</span>
            <div className={s.seg}>
              {AXES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`${s.segBtn} ${axis === a.id ? s.segBtnOn : ''}`}
                  onClick={() => setAxis(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <span className={s.label}>against</span>
            <div className={s.seg}>
              {SCALES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`${s.segBtn} ${scale === o.id ? s.segBtnOn : ''}`}
                  onClick={() => setScale(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={s.cubeLayout}>
          <TxStackList
            txs={model?.txs ?? []}
            colorOf={colorOf}
            labelOf={labelOf}
            hovered={hovered}
            onHover={setHovered}
            focused={focused}
            onFocus={setFocused}
            axis={axis}
          />

          <div className={s.cubeStage}>
            <BlockCube
              slabs={model?.slabs ?? []}
              capacity={model?.capacity ?? 0}
              markers={model?.markers ?? []}
              hovered={hovered}
              onHover={setHovered}
              focused={focused}
              onFocus={setFocused}
              limitLabel="The node did not report its block limits, so there is nothing to scale against."
            />
            <div className={s.cubeCaption}>
              {model?.haveLimits ? (
                <>
                  container is the <strong>{SCALE_NAMES[scale]}</strong>, measured in{' '}
                  {axis === 'bytes' ? 'bytes' : 'validation cost'}
                </>
              ) : (
                <>container is the package itself: the node reported no limits</>
              )}
            </div>
          </div>

          <div className={s.cubeSide}>
            {/* Hover detail sits beside the cube rather than floating, so it never covers a slab. */}
            {/*
              Fixed rows whether or not anything is hovered. The panel holding its size means the
              cube beside it never shifts under the pointer, which it did when the box grew.
            */}
            <div className={s.detailBox}>
              <div className={s.detailHead}>
                <span
                  className={s.swatch}
                  style={{ background: hoveredTx ? colorOf(hoveredTx.kind) : 'rgba(125,211,252,0.18)' }}
                />
                <span className={`${s.detailKind} ${hoveredTx ? '' : s.detailKindIdle}`}>
                  {hoveredTx ? labelOf(hoveredTx.kind) : 'no slab selected'}
                </span>
              </div>
              <div className={s.kv}>
                <span className={s.kvKey}>Size</span>
                <span className={s.kvVal}>
                  {!hoveredTx
                    ? '—'
                    : hoveredTx.sizeBytes == null
                      ? 'unknown'
                      : `${fmtInt(hoveredTx.sizeBytes)} B`}
                </span>
              </div>
              <div className={s.kv}>
                <span className={s.kvKey}>Cost</span>
                <span className={s.kvVal}>
                  {!hoveredTx
                    ? '—'
                    : hoveredTx.cost == null
                      ? 'unknown'
                      : Number(big(hoveredTx.cost)) === 0 && hoveredTx.kind === ANCESTOR
                        ? 'not reported'
                        : fmtInt(hoveredTx.cost)}
                </span>
              </div>
              <div className={s.kv}>
                <span className={s.kvKey}>Cost / byte</span>
                <span className={`${s.kvVal} ${s.kvValDim}`}>
                  {hoveredTx && Number(big(hoveredTx.cost)) > 0 && hoveredTx.sizeBytes
                    ? fmtNum(Number(big(hoveredTx.cost)) / Number(hoveredTx.sizeBytes), 1)
                    : '—'}
                </span>
              </div>
              <div className={s.kv}>
                <span className={s.kvKey}>Position</span>
                <span className={`${s.kvVal} ${s.kvValDim}`}>
                  {hoveredTx ? `${hoveredTx.position + 1} of ${model?.txs?.length ?? 0}` : '—'}
                </span>
              </div>
              <div className={s.kv}>
                <span className={s.kvKey}>Proof leaf</span>
                <span className={`${s.kvVal} ${s.kvValDim}`}>
                  {!hoveredTx ? '—' : hoveredTx.proofLeafMatched ? 'matched' : 'unproven'}
                </span>
              </div>
              <div className={s.detailId} title={hoveredTx?.id}>
                {hoveredTx ? shortId(hoveredTx.id, 10, 10) : 'hover a slab or a row'}
              </div>
            </div>

            {/* The list doubles as the legend for the slabs; this is the one thing it cannot show. */}
            <span className={s.legendRow}>
              <span className={s.moteSwatch} />
              mempool (not enumerable)
            </span>
          </div>
        </div>

        <p className={s.cardNote} style={{ marginTop: 14 }}>
          Every slice is one transaction this client supplied, stacked in the order the node applies
          them. The genesis founds the block at the base, everything admitted sits on above of it, while
          the holding top-up caps the package. Switching the measure re-weighs the same package against
          the cost or by transaction size. Mempool transactions are represented by space filled with dots,
          and can still contribute to block rewards indirectly through fee markets.
          {model?.ancestors?.length > 0 && (
            <>
              {' '}
              Unconfirmed <strong>mempool ancestors</strong> this package had to carry are included.
              {model.uncostedAncestors > 0 && (
                <>
                  {' '}
                  {model.uncostedAncestors === 1 ? 'One carries' : `${model.uncostedAncestors} carry`}{' '}
                  no cost from the node.
                </>
              )}
            </>
          )}
          {model?.slabs?.some((sl) => sl.ghost) && (
            <>
              {' '}
              A dashed outline means the node's proof did not confirm existence of that transaction.
            </>
          )}
        </p>
      </div>

      {(!pkg?.allSizesKnown || !pkg?.allCostsKnown) && (
        <div className={s.stackGap}>
          <Alert kind="info">
            Some transactions report no {!pkg?.allSizesKnown ? 'size' : ''}
            {!pkg?.allSizesKnown && !pkg?.allCostsKnown ? ' or ' : ''}
            {!pkg?.allCostsKnown ? 'cost' : ''}. Those are drawn at a hairline and left out of the
            totals, so every fill shown is a floor rather than the whole package.
          </Alert>
        </div>
      )}

      <CompositionPanel
        txs={model?.txs ?? []}
        colorOf={colorOf}
        labelOf={labelOf}
        hovered={hovered}
        onHover={setHovered}
      />
    </>
  );
}
