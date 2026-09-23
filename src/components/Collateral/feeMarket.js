/**
 * Shared vocabulary for the fee-market page.
 *
 * The colours here are not the site's cyan/purple pair. Purple is reserved for
 * LIT-denominated figures everywhere else on the panel, and every series on this
 * page is ERG, so borrowing it would tell the reader the wrong thing. These four
 * were picked for a dark surface and checked for colourblind separation as a set,
 * which is why they sit a step darker than the brand accents: brighter steps of
 * the same hues fall outside the legible band against `--cur-bg-card`.
 */

/**
 * Break-even priority fee: the whole spread a lender earns, so a fee above it costs more than the
 * coinbase returns. Mirrors `breakEvenPriorityFeeNanoErgs` on the quote.
 */
export const BREAK_EVEN_NANO = 85_000_000n;

/** The smallest non-zero fee the client accepts. Mirrors `minPriorityFeeNanoErgs` on the quote. */
export const MIN_FEE_NANO = 1_000_000n;

/** The priority-fee concept is sky wherever it appears, so it reads the same across charts. */
export const BID = '#38bdf8';
export const BID_DIM = '#7dd3fc';

/** Block fees are amber wherever they appear — the ledger's slot and their own chart. */
export const FEE = '#d97706';

/** The flat block reward, which the lender collects as the block's miner. */
export const BLOCK_REWARD_NANO = 3_000_000_000n;

/** Floor principal. A priority fee raises what the box posts one for one. */
export const PRINCIPAL_FLOOR_NANO = 2_915_000_000n;

/**
 * The four legs of a lender's position on one Lithos block, split by whether they
 * move.
 *
 * The split is not cosmetic. The reward and the principal are ~3 ERG while the two
 * variable legs are thousandths of one, so putting all four on a single bar scale
 * renders the only interesting pair as invisible slivers. The constants are stated
 * as figures and the variable legs get the bars, scaled against each other — which
 * is the comparison a lender is actually making.
 *
 * Executor fees are deliberately absent. They are earned by whoever fills the
 * orders, not by the lender whose box funded the block, so folding them in would
 * credit a lender with revenue they never see.
 */
export const LEDGER_FIXED = [
  {
    id: 'coinbase',
    label: 'Block reward',
    sign: 1,
    note: 'The flat 3 ERG coinbase, paid to the lender’s key by the protocol.',
  },
  {
    id: 'principal',
    label: 'Principal posted',
    sign: -1,
    note: 'The 2.915 ERG floor locked into the queue box.',
  },
];

export const LEDGER_VARIABLE = [
  {
    id: 'txfees',
    label: 'Block fees',
    sign: 1,
    color: '#d97706',
    note: 'Every transaction fee inside the block collected by the lender. Rises with how busy the block was.',
    keys: ['lithos.transactionFeeNanoErg'],
  },
  {
    id: 'bid',
    label: 'Priority fee',
    sign: -1,
    color: '#0284c7',
    note: 'The ERG added to the collateral box above the floor. The one leg a lender sets.',
  },
];

/** A totals map value as BigInt. Absent means no contribution was collected, which is zero here. */
export const totalOf = (totals, key) => {
  const raw = totals?.[key];
  return raw === undefined || raw === null ? 0n : BigInt(raw);
};

export const sumKeys = (totals, keys) => keys.reduce((acc, k) => acc + totalOf(totals, k), 0n);

/**
 * Buckets that actually sampled a Lithos block, newest last.
 *
 * A bucket with no Lithos block has no mean to report. Plotting it as zero would
 * claim the mean WAS zero, when nothing was measured at all — so those buckets are
 * dropped and counted, never zero-filled.
 */
export function sampledBuckets(history) {
  const all = history?.buckets ?? [];
  const sampled = all.filter((b) => totalOf(b.totals, 'lithos.blocks') > 0n);
  return { sampled, skipped: all.length - sampled.length };
}

/** UTC day label for a bucket start, e.g. "14 Mar". */
export const bucketLabel = (startMs) =>
  new Date(Number(startMs)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * Whole-window sums across the sampled buckets, plus the block count behind them.
 *
 * Values stay BigInt the whole way. Stringifying the running total makes `+` a
 * string concatenation rather than an addition, which silently produces a number
 * made of the digits of every bucket in the window.
 */
export function windowTotals(sampled) {
  const totals = {};
  let blocks = 0n;
  for (const b of sampled) {
    blocks += totalOf(b.totals, 'lithos.blocks');
    for (const [k, v] of Object.entries(b.totals ?? {})) {
      totals[k] = (totals[k] ?? 0n) + BigInt(v);
    }
  }
  return { totals, blocks };
}

/** Integer division that keeps `dp` decimal places, so a mean never round-trips via Number. */
export function perBlock(total, blocks, dp = 0) {
  if (blocks === 0n) return null;
  const scale = 10n ** BigInt(dp);
  return (total * scale) / blocks / scale;
}

/**
 * The largest priority fee a block carrying `txFees` still repays.
 *
 * A lender posts `PRINCIPAL_FLOOR + fee` and collects the coinbase plus the block's transaction
 * fees, so breaking even means `BLOCK_REWARD + txFees - PRINCIPAL_FLOOR - fee >= 0`. With no fees
 * that is [[BREAK_EVEN_NANO]], and every nanoERG a block carries raises it by one — which is why
 * what blocks are carrying decides what a fee can be.
 */
export function affordableBid(txFees) {
  const spread = BLOCK_REWARD_NANO - PRINCIPAL_FLOOR_NANO + (txFees ?? 0n);
  return spread <= 0n ? 0n : spread;
}

/** Median of a BigInt series, low-of-pair on an even count so it stays a real observation. */
export function median(values) {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
