/**
 * Lithos Mining statistics API client.
 *
 * Talks to the `stats`-tagged endpoints plus `/mining`. Every one of these reads is open — only
 * `/stats/local` needs a key, and nothing here calls it — so the page loads unattended on a
 * refresh instead of asking for a key first.
 *
 * Difficulty, assigned work and hashrate all cross the wire as decimal strings, and network
 * difficulty comfortably exceeds the exact range of a double. Nothing here coerces a wire value
 * through Number; use the helpers in ./format.js, which parse to BigInt.
 */

/*
 * Base URL and API key both live in the Dex module and are re-exported here, the same way
 * Collateral does it. All three talk to one client, so a second editable host could only disagree.
 */
import { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl, getApiKey, setApiKey, hasApiKey } from '../Dex/api';

export { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl, getApiKey, setApiKey, hasApiKey };

const REFRESH_KEY = 'lithos.mining.autoRefresh';

export const DEFAULT_REFRESH_SECONDS = 15;
export const MIN_REFRESH_SECONDS = 2;
export const MAX_REFRESH_SECONDS = 3600;

export function getAutoRefresh() {
  if (typeof window === 'undefined') return 0;
  const n = Number.parseInt(window.localStorage.getItem(REFRESH_KEY) ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REFRESH_SECONDS;
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n));
}

export function setAutoRefresh(seconds) {
  if (typeof window === 'undefined') return;
  const n = Math.trunc(Number(seconds));
  if (Number.isFinite(n) && n > 0) {
    window.localStorage.setItem(
      REFRESH_KEY,
      String(Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n))),
    );
  } else {
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

export class ApiError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function qs(params) {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function req(path, query) {
  const url = `${getBaseUrl()}${path}${qs(query)}`;
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (e) {
    const target = getBaseUrl() || window.location.origin;
    throw new ApiError(`Cannot reach the Lithos client at ${target}. Is it running?`, 0, String(e));
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body — fall through to the error below */
  }

  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.reason ||
      data?.message ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

/* ============================================================
   Range helpers

   The bucket endpoints demand both boundaries sit on a UTC boundary of the chosen interval and
   span at most 500 of them. Getting that wrong is a 400, so the ranges are built here once rather
   than at each call site.
   ============================================================ */

export const HOUR_MS = 3600000;
export const DAY_MS = 86400000;

/** The windows the page offers, and the interval each one is legible at. */
export const RANGES = [
  { id: '24H', label: '24H', interval: 'hour', buckets: 24 },
  { id: '7D', label: '7D', interval: 'hour', buckets: 24 * 7 },
  { id: '30D', label: '30D', interval: 'day', buckets: 30 },
];

/**
 * An aligned `[from, until)` covering `buckets` whole intervals up to and including the one in
 * progress, so the newest point is the current hour or day rather than the last completed one.
 */
export function alignedRange(rangeId, now = Date.now()) {
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];
  const width = range.interval === 'day' ? DAY_MS : HOUR_MS;
  const until = Math.floor(now / width) * width + width;
  return { from: until - range.buckets * width, until, interval: range.interval, widthMs: width };
}

/* ============================================================
   Reads
   ============================================================ */

/** GET /stats — the overview, for collection status and the current difficulty. */
export const getStats = () => req('/stats');

/** GET /stats/mining/buckets */
export const getBuckets = ({ from, until, interval }) =>
  req('/stats/mining/buckets', { from, until, interval });

/** GET /stats/mining/hashrate — the block-sampled Lithos estimate for one window. */
export const getHashrate = ({ from, until, interval }) =>
  req('/stats/mining/hashrate', { from, until, interval });

/** GET /stats/mining/difficulty — the epoch table, newest `limit` epochs by default. */
export const getDifficultyEpochs = ({ limit, from, to } = {}) =>
  req('/stats/mining/difficulty', { limit, from, to });

/** GET /stats/mining/workers — this client's own aggregate hashrate. */
export const getWorkers = () => req('/stats/mining/workers');

/** GET /stats/mining/workers/history */
export const getWorkerHistory = ({ from, until, interval }) =>
  req('/stats/mining/workers/history', { from, until, interval });

/**
 * GET /stats/mining/payments — one page of this client's payouts plus every unpaid claim and
 * fraud-proof bounty. `sort` is `paid` (the default) or `mined`, `order` is `desc` (the default) or
 * `asc`, and `total` counts every retained payout.
 */
export const getPayments = ({ offset, limit, sort, order } = {}) =>
  req('/stats/mining/payments', { offset, limit, sort, order });

/** The most payouts one request may ask for. */
export const MAX_PAYMENTS_PAGE = 500;

/** GET /mining — Stratum difficulty and tau. */
export const getStratumInfo = () => req('/mining');

/** GET /info — sync state, and which network this client is configured for. */
export const getInfo = () => req('/info');
