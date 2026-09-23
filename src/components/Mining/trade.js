/**
 * The `diff` trade, as the mining guide states it.
 *
 * Super shares found in one window are Poisson distributed around the average a `diff` produces. A
 * window pays only with at least ten, so a lower average pays less often, while `diff` — and with it
 * score — is inversely proportional to that average. Score, chance and expected earnings therefore
 * depend on the average alone; only the `diff` that produces an average depends on hashrate.
 */

/** Super shares a NISP carries, and so the fewest a window can pay with. */
export const NISP_SHARES = 10;

/** How much harder a super share is than a share at `diff`. */
export const NISP_COEFFICIENT = 10000;

/** A window's length in blocks, and the block times the guide sizes it with. */
export const WINDOW_BLOCKS = 60;
export const NETWORKS = {
  TESTNET: { label: 'Testnet', blockSeconds: 45 },
  MAINNET: { label: 'Mainnet', blockSeconds: 120 },
};

export const windowSeconds = (network) => WINDOW_BLOCKS * (NETWORKS[network] ?? NETWORKS.MAINNET).blockSeconds;

/**
 * Seconds a rig actually hashes in one window. Autolykos 2 rebuilds its table at every new height
 * and hashes nothing while it does, so each of the window's blocks costs one rebuild.
 */
export const miningSeconds = (network, tableGenMs) =>
  Math.max(0, windowSeconds(network) - (WINDOW_BLOCKS * Math.max(0, tableGenMs || 0)) / 1000);

/** P(X >= NISP_SHARES) for X ~ Poisson(mean): the chance one window pays. */
export function payChance(mean) {
  if (!(mean > 0)) return 0;
  let term = Math.exp(-mean);
  let below = term;
  for (let k = 1; k < NISP_SHARES; k++) {
    term *= mean / k;
    below += term;
  }
  return Math.max(0, 1 - below);
}

/** The `diff` that makes `hashrate` average `mean` super shares per window. */
export const diffFor = (hashrate, seconds, mean) => (hashrate * seconds) / (NISP_COEFFICIENT * mean);

/** Super shares a `diff` averages per window at `hashrate`. */
export const meanFor = (hashrate, seconds, diff) => (hashrate * seconds) / (NISP_COEFFICIENT * diff);

/**
 * One row per average in [from, to], each relative to averaging ten, as the guide's table is.
 * `peak` marks the row with the highest expected earnings.
 */
export function tradeRows(from = 5, to = 20) {
  const base = payChance(NISP_SHARES);
  const rows = [];
  for (let mean = from; mean <= to; mean++) {
    const chance = payChance(mean);
    const score = NISP_SHARES / mean;
    rows.push({ mean, chance, score, earnings: (score * chance) / base });
  }
  const best = rows.reduce((a, r) => (r.earnings > a.earnings ? r : a), rows[0]);
  return rows.map((r) => ({ ...r, peak: r === best }));
}

const DIFF_SUFFIXES = [
  { suffix: 'P', at: 1e15 },
  { suffix: 'T', at: 1e12 },
  { suffix: 'G', at: 1e9 },
  { suffix: 'M', at: 1e6 },
  { suffix: 'K', at: 1e3 },
];

/**
 * A `diff` written the way `stratum.diff` parses it: three significant figures and a mandatory
 * K/M/G/T/P suffix. The parser rejects a bare number, so anything under a thousand is written in K.
 */
export function fmtConfigDiff(value) {
  if (!(value > 0) || !Number.isFinite(value)) return '—';
  const unit = DIFF_SUFFIXES.find((u) => value >= u.at) ?? DIFF_SUFFIXES[DIFF_SUFFIXES.length - 1];
  const m = value / unit.at;
  const digits = m >= 100 ? 0 : m >= 10 ? 1 : m >= 1 ? 2 : 3;
  return `${Number(m.toFixed(digits))}${unit.suffix}`;
}

const RATE_PREFIXES = { K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 };

/** A `stratum.diff` string such as "0.14M" as a number, or null when it is not one. */
export function parseConfigDiff(text) {
  const m = String(text ?? '').trim().match(/^(\d+(?:\.\d+)?|\.\d+)([KMGTP])$/);
  if (!m) return null;
  const value = Number(m[1]) * RATE_PREFIXES[m[2]];
  return value > 0 ? value : null;
}

/**
 * Hashes per second from what a miner types: "150 MH/s", "150M", "1.2 gh". The unit letter is
 * required — a bare number is almost always a hashrate typed without its unit, not a rig hashing a
 * few hundred times a second. Returns null for anything else, so a half-typed value shows as
 * unparsed rather than as a wrong table.
 */
export function parseHashrate(text) {
  const m = String(text ?? '')
    .trim()
    .replace(/,/g, '')
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kKmMgGtTpP])\s*(?:h(?:\/s)?|hash(?:es)?(?:\/s)?)?$/i);
  if (!m) return null;
  const value = Number(m[1]) * RATE_PREFIXES[m[2].toUpperCase()];
  return value > 0 && Number.isFinite(value) ? value : null;
}
