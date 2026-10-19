/**
 * Formatting for difficulty forwards.
 *
 * LIT amounts are base units (9 decimals) and difficulties are whole numbers well past 2^53, so both stay
 * BigInt until the final display string. Ratios between two of them are taken in BigInt at fixed precision
 * and only the small result becomes a Number.
 */

import { big, fmtInt, fmtNum, fmtPct, fmtUnits, fmtUnitsMin, fmtCompact, parseUnits, shortId, fmtAge } from '../Dex/format';
import { fmtDifficulty } from '../Mining/format';

export { big, fmtInt, fmtNum, fmtPct, shortId, fmtAge, fmtDifficulty };

export const LIT_DECIMALS = 9;
export const LIT_UNIT = 10n ** 9n;

/** Blocks per difficulty epoch: Ergo retargets at heights where (height - 1) % 128 == 0. */
export const EPOCH_LENGTH = 128;

/** Ergo's mainnet target block time, which turns block and epoch counts into rough durations. */
export const BLOCK_MS = 120_000;

/** Each side's margin is a fifth of the notional, and the payout is clamped to it: a 20% move. */
export const CLAMP = 0.2;

/** LIT each side adds on top of its margin and does not get back. */
export const SIDE_REWARD = 7_500_000_000n;

/** LIT a position adds to the accumulator's balance, half from each side. */
export const ACC_DEPOSIT = 10_000_000_000n;

/** LIT the accumulator pays whoever records a new epoch. */
export const RECORD_REWARD = 5_000_000_000n;

/** LIT whoever settles a position keeps: both sides' rewards less the deposit. */
export const SETTLE_REWARD = 2n * SIDE_REWARD - ACC_DEPOSIT;

export const epochOf = (height) => Math.floor((Number(height) - 1) / EPOCH_LENGTH);
export const epochStart = (epoch) => epoch * EPOCH_LENGTH + 1;
export const epochEnd = (epoch) => (epoch + 1) * EPOCH_LENGTH;
/** The last height a fill of a window starting at `windowStart` can be mined at: the window must stay 2 epochs out. */
export const lastFillHeight = (windowStart) => (windowStart - 1) * EPOCH_LENGTH + 1;

/*
 * Epochs or block heights. A reader can choose to see every epoch as the blocks it covers; the chain and the
 * API always count in epochs, so these only change what is shown.
 */

/** A window's span: its first and last epoch, or the first and last block they cover. */
export function fmtWindowRange(start, length, heights) {
  const end = start + length - 1;
  return heights ? `${fmtInt(epochStart(start))}–${fmtInt(epochEnd(end))}` : `${fmtInt(start)}–${fmtInt(end)}`;
}

/** A count of epochs: "8 epochs", or "1,024 blocks". `short` writes "8 ep". */
export function fmtEpochs(count, heights, short = false) {
  if (heights) return `${fmtInt(count * EPOCH_LENGTH)} blocks`;
  return short ? `${fmtInt(count)} ep` : `${fmtInt(count)} epoch${count === 1 ? '' : 's'}`;
}

/** One epoch by name: "epoch 14,814", or "block 1,896,065", the first block of it. */
export const fmtEpochAt = (epoch, heights) =>
  heights ? `block ${fmtInt(epochStart(epoch))}` : `epoch ${fmtInt(epoch)}`;

/** How long until `epoch` starts, from `tip`: in epochs, or in blocks, with the rough time either way. */
export function fmtStartsIn(epoch, currentEpoch, tip, heights) {
  const blocks = Math.max(0, epochStart(epoch) - Number(tip) - 1);
  return heights ? `${fmtInt(blocks)} blocks · ${fmtSpan(blocks)}` : `${fmtInt(epoch - currentEpoch)} ep · ${fmtSpan(blocks)}`;
}

/* Margin is what a reader stakes and judges by. The contract states the size as a notional, five times it. */

/** Each side's margin for a notional, as the contract divides it. */
export const marginOf = (notional) => big(notional) / 5n;

/** The notional that gives exactly `margin`. */
export const notionalFor = (margin) => big(margin) * 5n;

/** What each 1% the window's mean ends from the strike pays: a twentieth of the margin. */
export const perPercent = (margin) => big(margin) / 20n;

/** A LIT amount, compact past a million. */
export function fmtLit(raw, dp = 2) {
  return fmtCompact(raw, LIT_DECIMALS) ?? fmtUnitsMin(raw, LIT_DECIMALS, dp);
}

/** A LIT amount with every whole digit, for forms and quotes. */
export const fmtLitFull = (raw, dp = 4) => fmtUnits(raw, LIT_DECIMALS, dp);

/** A fixed amount for prose: "7.5 LIT". */
export const litText = (raw) => `${fmtLitFull(raw)} LIT`;

/** A signed LIT amount: "+12.5" or "-3". */
export function fmtLitSigned(raw, dp = 2) {
  const v = big(raw);
  if (v === 0n) return '0';
  return `${v > 0n ? '+' : '-'}${fmtLit(v > 0n ? v : -v, dp)}`;
}

/** Whole LIT typed by a reader, as base units, or null when it is not a number. */
export const parseLit = (str) => parseUnits(str, LIT_DECIMALS);

/** A fraction as a signed percentage: "+4.21%". */
export function fmtMove(frac, dp = 2) {
  if (frac == null || !Number.isFinite(frac)) return '—';
  // Nothing that rounds to zero carries a sign
  const shown = Math.round(Math.abs(frac) * 10 ** (dp + 2));
  const sign = shown === 0 ? '' : frac > 0 ? '+' : '-';
  return `${sign}${Math.abs(frac * 100).toFixed(dp)}%`;
}

/** `a / b - 1` from two wire integers, as a Number, or null when `b` is not positive. */
export function moveOf(a, b) {
  const den = big(b);
  if (den <= 0n) return null;
  return Number((big(a) * 1_000_000_000n) / den) / 1e9 - 1;
}

/** A difficulty scaled by `1 + frac`, rounded to a whole number. */
export function scaleDifficulty(raw, frac) {
  const ppb = BigInt(Math.round((1 + frac) * 1e9));
  return (big(raw) * ppb) / 1_000_000_000n;
}

/**
 * A difficulty typed with an optional SI suffix, as "64.27T" or "64270000000000", in whole units, or
 * null when it does not parse.
 */
export function parseDifficulty(str) {
  const s = String(str ?? '').replace(/[,\s]/g, '').toUpperCase();
  const m = /^(\d+(?:\.\d+)?)([KMGTP]?)$/.exec(s);
  if (!m) return null;
  const power = { '': 0, K: 3, M: 6, G: 9, T: 12, P: 15 }[m[2]];
  const v = parseUnits(m[1], power);
  return v == null || v <= 0n ? null : v;
}

/** A rough duration for a count of blocks at the target block time: "3.2 days", "5 h", "40 min". */
export function fmtSpan(blocks) {
  const ms = Number(blocks) * BLOCK_MS;
  if (!Number.isFinite(ms)) return '—';
  const mins = ms / 60_000;
  if (mins < 90) return `${Math.max(1, Math.round(mins))} min`;
  const hrs = mins / 60;
  if (hrs < 36) return `${fmtNum(hrs, hrs < 10 ? 1 : 0)} h`;
  const days = hrs / 24;
  return `${fmtNum(days, days < 10 ? 1 : 0)} days`;
}

/** The wall-clock time a height is expected at, from the current tip. */
export function heightTime(height, tip, now = Date.now()) {
  return new Date(now + (Number(height) - Number(tip)) * BLOCK_MS);
}

export function fmtDate(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false });
}

/**
 * LIT the long side receives above its margin when the window means `mean`, clamped to the margin, exactly
 * as the position computes it. Positive pays the long side, negative the short side.
 */
export function payoutAt(mean, strike, notional) {
  const k = big(strike);
  if (k <= 0n) return 0n;
  const n = big(notional);
  const cap = n / 5n;
  const raw = (n * (big(mean) - k)) / k;
  return raw > cap ? cap : raw < -cap ? -cap : raw;
}

/** The same payout from one side: what that side gains, negative when it pays. */
export const sidePayout = (long, mean, strike, notional) =>
  long ? payoutAt(mean, strike, notional) : -payoutAt(mean, strike, notional);

/**
 * The mean difficulty over each of `epochs` and the `span - 1` epochs before it, read from `history`: what a
 * window of `span` epochs ending there settles on. Decimal strings like the wire's, and null where any of those
 * epochs is missing, so no point is ever a partial window.
 */
export function trailingMeans(epochs, history, span) {
  const at = new Map(history.map((e) => [e.epoch, big(e.difficulty)]));
  return epochs.map(({ epoch }) => {
    let sum = 0n;
    for (let e = epoch - span + 1; e <= epoch; e++) {
      if (!at.has(e)) return null;
      sum += at.get(e);
    }
    return String(sum / BigInt(span));
  });
}

/** Fixed colours, one meaning each across every chart and table in the section. */
export const COLORS = {
  difficulty: '#38bdf8',
  average: '#f472b6',
  next: '#818cf8',
  long: '#6ee7b7',
  short: '#fbbf24',
  gain: '#c084fc',
  loss: '#f87171',
};
