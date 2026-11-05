/**
 * Bond terms as people read them. Amounts arrive as decimal strings and stay BigInt until display.
 */
import { big, fmtErg, fmtInt, fmtPct } from '../Dex/format';

export { big, fmtErg, fmtInt, fmtPct };

/** Two-minute blocks: what a block count is worth in time. */
export const BLOCK_MS = 120_000;
export const BLOCKS_PER_YEAR = 262_800;

/** The shipped fee floor: clients on their defaults liquidate nothing paying less. */
export const MIN_BATCHING_FEE = 50_000_000n;

/** A span of blocks as days or hours. */
export function fmtSpan(blocks) {
  const n = Number(blocks);
  if (!Number.isFinite(n)) return '—';
  const hours = (n * BLOCK_MS) / 3_600_000;
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(hours < 240 ? 1 : 0)} d`;
}

/** What is lent: nanoERG, or a token's base units. */
export const principalOf = (t) => (t.principalToken ? big(t.principalToken.amount) : big(t.principalNanoErgs ?? 0));

/**
 * Blocks from now to repayment closing: a fixed maturity less the tip, or an on-close order's duration. Null when
 * neither is known.
 */
export function termBlocks(t, tip) {
  if (t.maturityHeight != null) return Math.max(0, t.maturityHeight - tip);
  if (t.durationBlocks != null) return t.durationBlocks;
  return null;
}

/** The loan's return over its term, as a fraction of the principal; null when the principal is unknown. */
export function interestOf(t) {
  const p = principalOf(t);
  if (p <= 0n || (t.principalNanoErgs == null && !t.principalToken)) return null;
  return Number(big(t.repayment) - p) / Number(p);
}

/** The same, scaled to a year of blocks. Null for a term under a block, where a yearly rate means nothing. */
export function aprOf(t, tip) {
  const r = interestOf(t);
  const blocks = termBlocks(t, tip);
  if (r == null || !blocks) return null;
  return (r * BLOCKS_PER_YEAR) / blocks;
}

/** The batching fee as a share of the collateral's ERG: what a lender gives up if they are liquidated to. */
export const feeShare = (t) => {
  const c = big(t.collateralNanoErgs);
  return c > 0n ? Number(big(t.batchingFee)) / Number(c) : null;
};

/** A percentage, or a dash. */
export const pct = (v, dp = 2) => (v == null || !Number.isFinite(v) ? '—' : fmtPct(v, dp));

/** A term in words: minutes, hours or days. */
export function fmtTerm(blocks) {
  const n = Number(blocks);
  if (!Number.isFinite(n)) return '—';
  const hours = (n * BLOCK_MS) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  const days = hours / 24;
  const shown = days < 10 ? Number(days.toFixed(1)) : Math.round(days);
  return `${shown} days`;
}

/** Liquidation scripts by the plain name a reader sees. */
export const LIQUIDATION_LABEL = { MaturityLiquidation: 'At maturity' };
export const liquidationLabel = (name) => (name ? LIQUIDATION_LABEL[name] ?? name : 'Unknown script');
