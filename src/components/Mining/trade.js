/**
 * The `diff` trade, as the mining guide states it.
 *
 * Super shares found in one window are Poisson distributed around the average a `diff` produces. A
 * window pays only with at least ten, so a lower average pays less often, while `diff` — and with it
 * score — is inversely proportional to that average. Score, chance and expected earnings therefore
 * depend on the average alone; only the `diff` that produces an average depends on hashrate. Real
 * windows vary in length, which `tradeRows` can account for per network.
 */

/** Super shares a NISP carries, and so the fewest a window can pay with. */
export const NISP_SHARES = 10;

/** How much harder a super share is than a share at `diff`. */
export const NISP_COEFFICIENT = 10000;

/** A window's length in blocks, and the block times the guide sizes it with. */
export const WINDOW_BLOCKS = 60;

/*
 * How long windows really ran, as [multiple of the nominal window, windows per 10,000]. Block times
 * drift around their target, so one window in thirteen on mainnet takes under 100 minutes, and a
 * short window costs every miner super shares at once. The outer bins hold the tails.
 *
 * Mainnet: 43,139 windows ending at heights 1,846,742 to 1,889,880. Testnet: 107,939 windows ending
 * at heights 479,662 to 587,600. Both August to October 2026.
 */
const TESTNET_WINDOWS = [
  [0.35, 18], [0.4, 24], [0.45, 64], [0.5, 53], [0.55, 68], [0.6, 88], [0.65, 148], [0.7, 216],
  [0.75, 343], [0.8, 498], [0.85, 751], [0.9, 933], [0.95, 1002], [1, 1055], [1.05, 1023], [1.1, 850],
  [1.15, 751], [1.2, 573], [1.25, 430], [1.3, 314], [1.35, 220], [1.4, 144], [1.45, 96], [1.5, 72],
  [1.55, 48], [1.6, 29], [1.65, 24], [1.7, 17], [1.75, 15], [1.8, 17], [1.85, 14], [1.9, 8],
  [1.95, 6], [2, 90],
];

const MAINNET_WINDOWS = [
  [0.65, 25], [0.675, 22], [0.7, 27], [0.725, 61], [0.75, 88], [0.775, 136], [0.8, 180], [0.825, 274],
  [0.85, 375], [0.875, 470], [0.9, 551], [0.925, 644], [0.95, 725], [0.975, 728], [1, 731], [1.025, 683],
  [1.05, 683], [1.075, 602], [1.1, 545], [1.125, 476], [1.15, 367], [1.175, 302], [1.2, 264], [1.225, 226],
  [1.25, 188], [1.275, 150], [1.3, 131], [1.325, 110], [1.35, 82], [1.375, 43], [1.4, 29], [1.425, 27],
  [1.45, 12], [1.475, 9], [1.5, 7], [1.525, 6], [1.55, 3], [1.575, 2], [1.6, 20],
];

export const NETWORKS = {
  TESTNET: { label: 'Testnet', blockSeconds: 45, windows: TESTNET_WINDOWS },
  MAINNET: { label: 'Mainnet', blockSeconds: 120, windows: MAINNET_WINDOWS },
};

/** Miners submitting to a typical mainnet rollup in October 2026, assumed on both networks. */
export const ROLLUP_MINERS = 5;

/**
 * Blocks from sending a commitment until NISPs are judged against it, and until it may be replaced.
 * The contracts want a declared height at least a window ahead that binds a window after that; the
 * client declares 5 blocks further out for inclusion. Replacement waits a window plus a rollup lifetime.
 */
export const COMMIT_BINDS_BLOCKS = 125;
export const COMMIT_REPLACE_BLOCKS = 845;

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

/** The window table for `network`, normalised to shares of one, or null where none was measured. */
function windowsFor(network) {
  const table = NETWORKS[network]?.windows;
  if (!table) return null;
  const total = table.reduce((sum, [, n]) => sum + n, 0);
  return table.map(([length, n]) => [length, n / total]);
}

/** Whether `network` has measured window lengths to adjust for. */
export const hasMeasuredWindows = (network) => Boolean(NETWORKS[network]?.windows);

/** The chance one window pays at `mean`, averaged over the window lengths actually seen. */
function measuredPayChance(mean, windows) {
  return windows.reduce((sum, [length, p]) => sum + p * payChance(mean * length), 0);
}

/**
 * Your expected share of one rollup at `mean`, when `others` miners of your hashrate average
 * `othersMean`. A short window cuts everyone's super shares together, so the windows you still pay in
 * are the ones fewer others reach, and your share of those is larger. Scores scale as 1/mean, so with
 * `b` others paid your share is othersMean / (othersMean + b * mean).
 */
function measuredShare(mean, othersMean, others, windows) {
  let total = 0;
  for (const [length, p] of windows) {
    const mine = payChance(mean * length);
    if (mine === 0) continue;
    const q = payChance(othersMean * length);
    let share = 0;
    let ways = 1;
    for (let b = 0; b <= others; b++) {
      share += ways * q ** b * (1 - q) ** (others - b) * (othersMean / (othersMean + b * mean));
      ways = (ways * (others - b)) / (b + 1);
    }
    total += p * mine * share;
  }
  return total;
}

/**
 * The average every miner settles on when each picks their best reply to the rest: start anywhere,
 * replace the others' average with the best reply to it, and stop once it repeats.
 */
function settledMean(from, to, windows) {
  const others = ROLLUP_MINERS - 1;
  let theirs = Math.round((from + to) / 2);
  for (let i = 0; i < 20; i++) {
    let best = from;
    for (let mean = from + 1; mean <= to; mean++) {
      if (measuredShare(mean, theirs, others, windows) > measuredShare(best, theirs, others, windows)) best = mean;
    }
    if (best === theirs) break;
    theirs = best;
  }
  return theirs;
}

/**
 * One row per average in [from, to], each relative to averaging ten, as the guide's table is.
 * `peak` marks the row with the highest expected earnings. Rows the table shows at the same whole
 * percentage are a tie, and a tie goes to the higher average, which is paid more often.
 *
 * With `network`, rows use that network's measured window lengths, and expected earnings counts the
 * larger share you take when other miners miss the same short window. Without it, every window lasts
 * exactly its nominal length and your score is a small part of each rollup.
 */
export function tradeRows(from = 5, to = 20, network = null) {
  const windows = network ? windowsFor(network) : null;
  let chanceAt = payChance;
  let valueAt = (mean) => payChance(mean) / mean;
  if (windows) {
    const theirs = settledMean(from, to, windows);
    chanceAt = (mean) => measuredPayChance(mean, windows);
    valueAt = (mean) => measuredShare(mean, theirs, ROLLUP_MINERS - 1, windows);
  }
  const base = valueAt(NISP_SHARES);
  const rows = [];
  for (let mean = from; mean <= to; mean++) {
    rows.push({ mean, chance: chanceAt(mean), score: NISP_SHARES / mean, earnings: valueAt(mean) / base });
  }
  const shown = (r) => Math.round(r.earnings * 100);
  const best = rows.reduce((a, r) => (shown(r) >= shown(a) ? r : a), rows[0]);
  return rows.map((r) => ({ ...r, peak: r === best }));
}

/** The first and last averages whose expected earnings stay within `within` of the peak. */
export function nearPeak(rows, within = 0.07) {
  const top = Math.max(...rows.map((r) => r.earnings));
  const near = rows.filter((r) => r.earnings >= top * (1 - within));
  return { from: near[0].mean, to: near[near.length - 1].mean };
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
