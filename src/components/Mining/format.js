/**
 * Formatting for mining statistics.
 *
 * Hashrate and difficulty are the two quantities here that a double cannot hold exactly — mainnet
 * difficulty is well past 2^53 — so both are parsed to BigInt and scaled with integer math. Only
 * the final display string goes through Number.
 */

import {
  big,
  fmtInt,
  fmtIntCompact,
  fmtNum,
  fmtErg,
  fmtErgAmount,
  fmtErgMin,
  fmtPct,
  fmtAge,
  fmtUnits,
  shortId,
  ratio,
} from '../Dex/format';

export {
  big,
  fmtInt,
  fmtIntCompact,
  fmtNum,
  fmtErg,
  fmtErgAmount,
  fmtErgMin,
  fmtPct,
  fmtAge,
  fmtUnits,
  shortId,
  ratio,
};

/**
 * SI hashrate units. Ergo's Autolykos2 hashrate is quoted in raw hashes per second, and mainnet
 * sits in the tera range, so the ladder runs well past that to stay useful if it ever climbs.
 */
const RATE_UNITS = [
  { suffix: 'EH/s', at: 10n ** 18n },
  { suffix: 'PH/s', at: 10n ** 15n },
  { suffix: 'TH/s', at: 10n ** 12n },
  { suffix: 'GH/s', at: 10n ** 9n },
  { suffix: 'MH/s', at: 10n ** 6n },
  { suffix: 'kH/s', at: 1000n },
];

/**
 * A hashrate as value plus unit, kept separate so a card can style the unit differently.
 *
 * Returns nulls for an absent rate rather than a zero: the API omits `hashesPerSecond` when it has
 * no usable sample, and rendering that as "0 H/s" would claim a measurement it never made.
 */
export function splitHashrate(raw, dp = 2) {
  if (raw === null || raw === undefined || raw === '') return { value: null, unit: null };
  const v = big(raw);
  if (v <= 0n) return { value: '0', unit: 'H/s' };
  const unit = RATE_UNITS.find((u) => v >= u.at);
  if (!unit) return { value: v.toString(), unit: 'H/s' };
  const scale = 10n ** BigInt(dp);
  const scaled = (v * scale) / unit.at;
  const whole = (scaled / scale).toString();
  const frac = (scaled % scale).toString().padStart(dp, '0');
  return { value: dp > 0 ? `${whole}.${frac}` : whole, unit: unit.suffix };
}

/** The same thing as one string, for tooltips and axis labels. */
export function fmtHashrate(raw, dp = 2) {
  const { value, unit } = splitHashrate(raw, dp);
  return value === null ? '—' : `${value} ${unit}`;
}

/** Difficulty, which is a bare count of expected hashes and so carries no time unit. */
export function fmtDifficulty(raw, dp = 2) {
  const { value, unit } = splitHashrate(raw, dp);
  if (value === null) return '—';
  return unit === 'H/s' ? value : `${value}${unit.replace('H/s', '')}`;
}

/**
 * Ratio of two wire integers as a Number in [0, 1].
 *
 * Both sides can exceed the exact range of a double, so the division happens in BigInt at fixed
 * precision and only the small result is converted. Returns null on a zero denominator, which is a
 * window with no processed blocks rather than a zero share.
 */
export function shareOf(part, whole, dp = 9) {
  const w = big(whole);
  if (w <= 0n) return null;
  const scale = 10n ** BigInt(dp);
  return Number((big(part) * scale) / w) / Number(scale);
}

/** A bucket's accounting value, or 0n when the key is absent — a missing key means no contribution. */
export const metric = (bucket, key) => big(bucket?.totals?.[key]);

/**
 * Work over elapsed time, as an integer hashrate string.
 *
 * Buckets hold a difficulty sum and a width, which is all a hashrate needs: the sum is expected
 * hashes and the width is the time they were spread over.
 */
export function rateFrom(work, elapsedMs) {
  const w = big(work);
  const ms = big(elapsedMs);
  if (w <= 0n || ms <= 0n) return null;
  return ((w * 1000n) / ms).toString();
}

/** Short clock label for a time axis; the window decides how much detail earns its place. */
export function timeLabel(ts, interval) {
  const d = new Date(Number(ts));
  if (!Number.isFinite(d.getTime())) return '';
  if (interval === 'day') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
}

/** Full timestamp for a tooltip. */
export function fullTime(ts) {
  const d = new Date(Number(ts));
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

/** "4h 16m" for a duration in milliseconds; the epoch length is the main caller. */
export function fmtDuration(ms) {
  const total = Math.floor(Number(ms) / 1000);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const days = Math.floor(total / 86400);
  const hrs = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${total % 60}s`;
  return `${total}s`;
}
