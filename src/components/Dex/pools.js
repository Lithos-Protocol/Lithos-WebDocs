/**
 * Helpers for the /dex/pools views: any LithosDex pool, ERG/token or token/token. A pool's sides are
 * `LDPoolToken`s, X first; X is ERG (`tokenId` 'ERG') on an ERG/token pool. Amounts stay BigInt.
 */
import { fmtTokenAmount, fmtToken, parseUnits } from './format';
import { tokenLabel } from '../Wallet/TokenIcon';

export { tokenLabel };

export const poolHref = (nft) => `/dex?pool=${nft}`;

/**
 * How far a pool can be trusted: `unsafe` breaks a genesis fact and can be drained, `verified` is on the
 * shipped list, `unchecked` has not had its genesis read yet, and `unverified` passed the checks but nobody
 * vetted it.
 */
export function poolTrust(p) {
  if (p.problems?.length) return 'unsafe';
  if (p.verified) return 'verified';
  if (!p.genesisChecked) return 'unchecked';
  return 'unverified';
}

export const pairLabel = (p) => `${tokenLabel(p.tokenX)} / ${tokenLabel(p.tokenY)}`;

export const kindLabel = (kind) => (kind === 't2t' ? 'token/token' : 'ERG/token');

/** Decimals a side is shown at. A token the node knows nothing about is shown in raw units. */
export const decimalsOf = (t) => (t?.tokenId === 'ERG' ? 9 : t?.decimals ?? 0);

/** A side's amount for display: compact above a million, never a bare 0 for a non-zero amount. */
export const fmtSide = (raw, t, maxDp = 4) => fmtTokenAmount(raw, decimalsOf(t), maxDp);

/** A side's amount at full precision, for titles and confirmations. */
export const fmtSideFull = (raw, t) => fmtToken(raw, decimalsOf(t), decimalsOf(t));

/** Display string -> base units of a side, or null. */
export const parseSide = (str, t) => parseUnits(str, decimalsOf(t));

/** A price of any magnitude to about five significant figures, without exponent notation. */
export function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const dp = Math.min(12, Math.max(4, 4 - Math.floor(Math.log10(v))));
  return v.toLocaleString('en-US', { maximumFractionDigits: dp });
}

/** The matching other side of a balanced deposit: `amount` of X (`fromX`) or Y at the pool's ratio, rounded up. */
export function matchSide(amount, pool, fromX) {
  const rx = BigInt(pool.reservesX);
  const ry = BigInt(pool.reservesY);
  if (amount <= 0n || rx === 0n || ry === 0n) return 0n;
  const [num, den] = fromX ? [ry, rx] : [rx, ry];
  return (amount * num + den - 1n) / den;
}
