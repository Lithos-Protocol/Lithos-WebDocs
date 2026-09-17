/**
 * Amount formatting for LithosDex.
 *
 * Wire amounts arrive as decimal strings. Balances and reserves are safe as
 * Numbers for display, but the accumulators (scaled by 1e27) are not — those stay
 * BigInt end to end and are only ever formatted, never arithmetic'd as Numbers.
 */

export const NANO_PER_ERG = 1_000_000_000;

/** Parse a wire value (string | number | bigint) into BigInt. Returns 0n on junk. */
export function big(v) {
  if (typeof v === 'bigint') return v;
  if (v === null || v === undefined || v === '') return 0n;
  try {
    return BigInt(typeof v === 'number' ? Math.trunc(v) : String(v).trim());
  } catch {
    return 0n;
  }
}

/**
 * BigInt raw units -> display string with `decimals` implied places.
 * Done with integer math so large values never lose precision through Number.
 */
export function fmtUnits(raw, decimals, maxDp = 4) {
  let v = big(raw);
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;

  let fracStr = '';
  if (maxDp > 0 && decimals > 0) {
    fracStr = frac.toString().padStart(decimals, '0').slice(0, maxDp).replace(/0+$/, '');
  }

  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${wholeStr}${fracStr ? `.${fracStr}` : ''}`;
}

/** nanoERG -> ERG display string. */
export const fmtErg = (nano, maxDp = 4) => fmtUnits(nano, 9, maxDp);

/** Raw token units -> display string honouring the token's decimals. */
export const fmtToken = (raw, decimals = 0, maxDp = 4) => fmtUnits(raw, decimals, maxDp);

/**
 * Like fmtUnits, but never renders a non-zero amount as "0".
 *
 * Fee amounts are routinely smaller than the display precision, where plain
 * truncation makes "you are owed something" indistinguishable from "you are owed
 * nothing". Anything below the smallest representable value shows as "< x" instead.
 */
export function fmtUnitsMin(raw, decimals, maxDp = 4) {
  const v = big(raw);
  if (v === 0n) return '0';
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const threshold = 10n ** BigInt(Math.max(0, decimals - maxDp));
  if (abs < threshold) return `${neg ? '> -' : '< '}${fmtUnits(threshold, decimals, maxDp)}`;
  return fmtUnits(v, decimals, maxDp);
}

/** nanoERG -> ERG display string, flooring to "< x" rather than "0". */
export const fmtErgMin = (nano, maxDp = 4) => fmtUnitsMin(nano, 9, maxDp);

/** Raw token units -> display string, flooring to "< x" rather than "0". */
export const fmtTokenMin = (raw, decimals = 0, maxDp = 4) => fmtUnitsMin(raw, decimals, maxDp);

/** True when there is a non-zero amount on either side. */
export const hasAny = (...vals) => vals.some((v) => big(v) > 0n);

/**
 * Compact notation for large amounts: 1.340M, 2.645G, 3.729T.
 *
 * Steps every 1000 from a million up. Uses G/T rather than B/Tn, matching the
 * SI-style convention already used for hashrate and difficulty elsewhere in the
 * client.
 *
 * All of it is integer math on BigInt — a supply figure can exceed the exact
 * range of a double, and rounding it through Number would quietly change the
 * digits being displayed.
 */
const COMPACT_UNITS = [
  { suffix: 'Q', at: 10n ** 18n },
  { suffix: 'P', at: 10n ** 15n },
  { suffix: 'T', at: 10n ** 12n },
  { suffix: 'G', at: 10n ** 9n },
  { suffix: 'M', at: 10n ** 6n },
];

export function fmtCompact(raw, decimals = 0, dp = 3) {
  let v = big(raw);
  const neg = v < 0n;
  if (neg) v = -v;

  const whole = v / 10n ** BigInt(decimals);
  const unit = COMPACT_UNITS.find((u) => whole >= u.at);
  if (!unit) return null; // below a million — caller falls back to plain formatting

  const scale = 10n ** BigInt(dp);
  const scaled = (whole * scale) / unit.at; // e.g. 1340 thousandths -> 1.340
  const int = scaled / scale;
  const frac = (scaled % scale).toString().padStart(dp, '0');
  const intStr = int.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${intStr}.${frac}${unit.suffix}`;
}

/**
 * The display rule for amounts rendered in Inter across the DEX.
 *
 * Large values compact to 1.340M; small non-zero values floor to "< 0.0001"
 * rather than a bare 0. Never used for input fields — a user has to be able to
 * type and edit the real number there.
 */
export function fmtAmount(raw, decimals = 0, maxDp = 4) {
  return fmtCompact(raw, decimals) ?? fmtUnitsMin(raw, decimals, maxDp);
}

/** ERG-denominated variant of fmtAmount. */
export const fmtErgAmount = (nano, maxDp = 4) => fmtAmount(nano, 9, maxDp);

/** Token-denominated variant of fmtAmount. */
export const fmtTokenAmount = (raw, decimals = 0, maxDp = 4) => fmtAmount(raw, decimals, maxDp);

/** Plain integer with thousands separators, compacting above a million. */
export const fmtIntCompact = (v) => fmtCompact(v, 0) ?? fmtInt(v);

/** Plain integer with thousands separators. */
export const fmtInt = (v) =>
  big(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Float formatting for ratios and prices. */
export function fmtNum(n, maxDp = 4) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: maxDp });
}

/** Display ERG string -> nanoERG BigInt, or null when unparseable. */
export const parseErg = (str) => parseUnits(str, 9);

/** Display token string -> raw BigInt, or null when unparseable. */
export const parseToken = (str, decimals = 0) => parseUnits(str, decimals);

/** Decimal string -> BigInt raw units, truncating beyond `decimals`. */
export function parseUnits(str, decimals) {
  const s = String(str ?? '')
    .replace(/,/g, '')
    .trim();
  if (!s || !/^\d*\.?\d*$/.test(s)) return null;
  const [w = '', f = ''] = s.split('.');
  if (w === '' && f === '') return null;
  const frac = f.slice(0, decimals).padEnd(decimals, '0');
  try {
    return BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(frac || '0');
  } catch {
    return null;
  }
}

/** 0.0125 -> "1.25%" */
export function fmtPct(frac, dp = 2) {
  const n = Number(frac);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(dp)}%`;
}

/**
 * Unix milliseconds -> a compact age: "42s", "9m", "3h", "2d".
 *
 * Returns null when there is no timestamp to work from — mempool entries have
 * none, and rendering "0m" for those would claim an age the server never gave.
 * Floors at every step, so 90s reads as 1m rather than rounding up to 2m.
 */
export function fmtAge(ts, now = Date.now()) {
  const t = Number(ts);
  if (!Number.isFinite(t) || t <= 0) return null;
  const secs = Math.max(0, Math.floor((now - t) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Block count -> "this block" / "1 block" / "12 blocks"; null when unknown.
 *
 * Orders carry a placement height, not a timestamp, so their age is counted in
 * blocks. Converting to minutes would assume a block time the chain does not
 * promise.
 */
export function fmtBlocks(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const b = Math.max(0, Math.trunc(n));
  if (b === 0) return 'this block';
  return `${b.toLocaleString('en-US')} block${b === 1 ? '' : 's'}`;
}

/**
 * `raw × (1 − slippage)`, floored, as BigInt. Slippage is a fraction (0.005 is
 * 0.5%) and resolves to basis points, which covers every chip on offer.
 * Never negative: a non-positive input floors to 0n, and callers that need a
 * positive floor check for that rather than sending it.
 */
export function lessSlippage(raw, slippage) {
  const v = big(raw);
  if (v <= 0n) return 0n;
  return (v * BigInt(Math.round((1 - slippage) * 10000))) / 10000n;
}

/** Long hex id -> "ce00d6e0…7d8f1b65" */
export function shortId(id, head = 8, tail = 8) {
  if (!id || typeof id !== 'string') return '—';
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/** Ratio of two BigInts as a Number, safe for display-scale magnitudes. */
export function ratio(a, b, dp = 6) {
  const bb = big(b);
  if (bb === 0n) return 0;
  // `dp` decimal places survive the integer division. Six is plenty for a price
  // around 20, but leaves one around 0.05 with four significant digits — callers
  // showing a small ratio ask for more. Capped at 15 so the scale itself stays
  // exact as a Number.
  const scale = 10n ** BigInt(Math.min(15, Math.max(0, dp)));
  return Number((big(a) * scale) / bb) / Number(scale);
}
