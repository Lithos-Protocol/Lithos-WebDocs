/**
 * SigmaFi bonds API client, the endpoints under `/sigmafi`.
 *
 * Lists, the bond-asset lookup and every `check` are open, so the book loads without a key and a quote signs
 * nothing. The portfolio and every call that sends a transaction carry the API key, which lives in memory unless
 * remembered (see ../Dex/api).
 *
 * Every amount crosses the wire as a decimal string. Nothing here coerces one through Number.
 */

import { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl, getApiKey, setApiKey, hasApiKey } from '../Dex/api';

export { getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl, getApiKey, setApiKey, hasApiKey };

const REFRESH_KEY = 'lithos.bonds.autoRefresh';

export const DEFAULT_REFRESH_SECONDS = 30;
export const MIN_REFRESH_SECONDS = 2;
export const MAX_REFRESH_SECONDS = 3600;

export function getAutoRefresh() {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number.parseInt(window.localStorage.getItem(REFRESH_KEY) ?? '', 10);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_REFRESH_SECONDS;
    if (n === 0) return 0;
    return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n));
  } catch {
    return DEFAULT_REFRESH_SECONDS;
  }
}

export function setAutoRefresh(seconds) {
  if (typeof window === 'undefined') return;
  const n = Math.trunc(Number(seconds));
  try {
    if (Number.isFinite(n) && n > 0) {
      window.localStorage.setItem(REFRESH_KEY, String(Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n))));
    } else {
      window.localStorage.setItem(REFRESH_KEY, '0');
    }
  } catch {
    // Storage blocked: the setting lasts for this page only
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

/** One request. `keyed` sends the API key, and refuses before the network when there is none. */
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

/** Book reads page on the client side; the API pages at most 100 at a time. */
export const MAX_PAGE = 100;

/* ---- Reads, open ---- */

export const getOrders = ({ offset = 0, limit = MAX_PAGE, collateral, loan } = {}) =>
  req('/sigmafi/orders', { query: { offset, limit, collateral, loan } });
export const getBonds = ({ offset = 0, limit = MAX_PAGE, all = false } = {}) =>
  req('/sigmafi/bonds', { query: { offset, limit, all } });

/** POST /sigmafi/assets: which of up to 50 tokens are bond assets, read from the chain. */
export const ASSET_LOOKUP_MAX = 50;
export const lookupAssets = (tokenIds) => req('/sigmafi/assets', { method: 'POST', body: { tokenIds } });

/** GET /wallet/tokens/verified: the client's verified token list, for names and decimals. */
export const getVerifiedTokens = () => req('/wallet/tokens/verified');
export const getOracleFeed = () => req('/oracles/erg-usd', { query: { limit: 0 } });
export const getPricingPools = () => req('/dex/pools');

/** Every page of a list, up to `max` rows. */
export async function allPages(read, key, max = 1000) {
  const rows = [];
  let first = null;
  for (let offset = 0; offset < max; offset += MAX_PAGE) {
    const page = await read({ offset, limit: MAX_PAGE });
    first = first ?? page;
    rows.push(...page[key]);
    if (rows.length >= page.total || page[key].length === 0) break;
  }
  return { ...first, [key]: rows, truncated: !!first?.truncated || rows.length < (first?.total ?? 0) };
}

/* ---- Checks, open: they sign nothing ---- */

export const checkCreateOrder = (request) => req('/sigmafi/orders/check', { method: 'POST', body: request });
export const checkCancelOrder = (id) => req(`/sigmafi/orders/${id}/cancel/check`, { method: 'POST' });
export const checkFillOrder = (id) => req(`/sigmafi/orders/${id}/fill/check`, { method: 'POST' });
export const checkRepay = (id) => req(`/sigmafi/bonds/${id}/repay/check`, { method: 'POST' });
export const checkLiquidate = (id) => req(`/sigmafi/bonds/${id}/liquidate/check`, { method: 'POST' });
export const checkClaim = (tokenId) => req(`/sigmafi/claims/${tokenId}/check`, { method: 'POST' });

/* ---- This wallet, keyed ---- */

export const getPortfolio = () => req('/sigmafi/portfolio', { keyed: true });

export const createOrder = (request) => req('/sigmafi/orders', { method: 'POST', body: request, keyed: true });
export const cancelOrder = (id) => req(`/sigmafi/orders/${id}/cancel`, { method: 'POST', keyed: true });
export const fillOrder = (id) => req(`/sigmafi/orders/${id}/fill`, { method: 'POST', keyed: true });
export const repay = (id) => req(`/sigmafi/bonds/${id}/repay`, { method: 'POST', keyed: true });
export const liquidate = (id) => req(`/sigmafi/bonds/${id}/liquidate`, { method: 'POST', keyed: true });
export const claim = (tokenId) => req(`/sigmafi/claims/${tokenId}`, { method: 'POST', keyed: true });

/** Each action's check and send, by the name the API quotes it under. */
export const ACTIONS = {
  fillOrder: { check: checkFillOrder, send: fillOrder, label: 'Lend' },
  cancelOrder: { check: checkCancelOrder, send: cancelOrder, label: 'Cancel order' },
  repay: { check: checkRepay, send: repay, label: 'Repay' },
  liquidate: { check: checkLiquidate, send: liquidate, label: 'Liquidate' },
  claim: { check: checkClaim, send: claim, label: 'Claim' },
};
