/**
 * Extensions API client. Difficulty forwards are the first extension; their endpoints sit under
 * `/forwards`.
 *
 * Reads and every `check` are open, so the market loads without a key. This wallet's positions, its
 * history, and every call that signs send the API key, which lives in memory unless remembered (see ../Dex/api).
 *
 * Every amount and difficulty crosses the wire as a decimal string. Nothing here coerces one through
 * Number; ./format.js parses them to BigInt.
 */

import { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl, getApiKey, setApiKey, hasApiKey } from '../Dex/api';

export { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl, getApiKey, setApiKey, hasApiKey };

const REFRESH_KEY = 'lithos.extensions.autoRefresh';

export const DEFAULT_REFRESH_SECONDS = 20;
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
    window.localStorage.setItem(REFRESH_KEY, String(Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n))));
  } else {
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

/* Whether to show block heights where epochs would be. A display choice, kept per viewer. */
const HEIGHTS_KEY = 'lithos.extensions.blockHeights';

export function getShowHeights() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(HEIGHTS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setShowHeights(on) {
  try {
    if (on) window.localStorage.setItem(HEIGHTS_KEY, '1');
    else window.localStorage.removeItem(HEIGHTS_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only
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

/**
 * One request. `keyed` sends the API key, and refuses before the network when there is none, so a
 * missing key reads as a prompt rather than as the client's 403.
 */
async function req(path, { method = 'GET', query, body, keyed = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (keyed) {
    const key = getApiKey();
    if (!key) throw new ApiError('Enter your API key to continue.', 401);
    headers.api_key = key;
  }
  let res;
  try {
    res = await fetch(`${getBaseUrl()}${path}${qs(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const target = getBaseUrl() || window.location.origin;
    throw new ApiError(`Cannot reach the Lithos client at ${target}. Is it running?`, 0, String(e));
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body: fall through to the error below */
  }
  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.reason ||
      data?.message ||
      (res.status === 403 ? 'The API key was refused. Check it under Settings.' : null) ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

/* ---- Reads, open ---- */

/** GET /forwards/accumulator: the chain, the next epoch's difficulty, the recorded epochs and the offer limits. */
export const getAccumulator = () => req('/forwards/accumulator');

/** GET /forwards/market: both sides of the book and every open position by status. */
export const getMarket = () => req('/forwards/market');

/** GET /forwards/offers: offers a coming block could fill, by window start, then length, then strike. */
export const getOffers = ({ offset, limit } = {}) => req('/forwards/offers', { query: { offset, limit } });

/** GET /stats: read here only for the collection status the section banner shows. */
export const getStats = () => req('/stats');

/** GET /stats/mining/difficulty: the difficulty table, for history older than the accumulator's ring. */
export const getDifficultyEpochs = ({ limit } = {}) => req('/stats/mining/difficulty', { query: { limit } });

/** The most offers one page of the book may hold. */
export const MAX_OFFER_PAGE = 200;

/* ---- Checks, open ---- */

export const checkOffer = (request) => req('/forwards/offers/check', { method: 'POST', body: request });
export const checkFill = (boxId) => req(`/forwards/offers/${boxId}/fill/check`, { method: 'POST' });
export const checkCancel = (boxId) => req(`/forwards/offers/${boxId}/cancel/check`, { method: 'POST' });
export const checkSettle = (boxId) => req(`/forwards/positions/${boxId}/settle/check`, { method: 'POST' });

/* ---- This wallet, keyed ---- */

export const getPositions = () => req('/forwards/positions', { keyed: true });
export const getHistory = () => req('/forwards/history', { keyed: true });

export const createOffer = (request) => req('/forwards/offers', { method: 'POST', body: request, keyed: true });
export const fillOffer = (boxId) => req(`/forwards/offers/${boxId}/fill`, { method: 'POST', keyed: true });
export const cancelOffer = (boxId) => req(`/forwards/offers/${boxId}/cancel`, { method: 'POST', keyed: true });
export const settlePosition = (boxId) => req(`/forwards/positions/${boxId}/settle`, { method: 'POST', keyed: true });
