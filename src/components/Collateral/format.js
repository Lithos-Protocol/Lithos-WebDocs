/**
 * Formatting for the Collateral Market panel.
 *
 * Every amount helper lives with the Dex and is shared, never duplicated — the
 * two panels must render identical numbers identically. This file only re-exports.
 */
export {
  NANO_PER_ERG,
  big,
  fmtUnits,
  fmtErg,
  fmtToken,
  fmtUnitsMin,
  fmtErgMin,
  fmtTokenMin,
  hasAny,
  fmtCompact,
  fmtAmount,
  fmtErgAmount,
  fmtTokenAmount,
  fmtIntCompact,
  fmtInt,
  fmtNum,
  parseErg,
  parseToken,
  parseUnits,
  fmtPct,
  fmtAge,
  shortId,
  ratio,
} from '../Dex/format';

/**
 * Ergo's target block interval — used to turn a height difference into a rough
 * age ("joined 3d ago"). Estimates only; drifts with real block times, which is
 * fine for display purposes but never for anything financial.
 */
export const BLOCK_INTERVAL_MS = 120_000;
