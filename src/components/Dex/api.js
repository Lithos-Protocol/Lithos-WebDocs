/**
 * LithosDex API client.
 *
 * Talks to the `lithosdex`-tagged endpoints in the Lithos Client API
 * (see examples/lithosapi.yaml). All amounts cross the wire as decimal strings —
 * `accX` / `accY` are 1e27-scaled and would be corrupted by JSON number parsing —
 * so nothing here coerces a wire value through Number. Use the helpers in
 * ./format.js, which parse to BigInt.
 */

/**
 * Where the client API lives.
 *
 * In production the site is served by Play from the same origin as the API, so
 * an empty base means `/dex/pool` resolves against whatever host served the page.
 * The Docusaurus dev server (:3000) does not proxy the API, so default to Play on
 * :9000 there instead — otherwise every request 404s against the dev server.
 * Either way, Settings can override it.
 */
function defaultBase() {
  if (typeof window === 'undefined') return '';
  const { hostname, port } = window.location;
  const isDevServer = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000';
  return isDevServer ? 'http://localhost:9000' : '';
}

/*
 * One base URL for the whole site.
 *
 * DEX and Collateral talk to the same Lithos Client — they share `/wallet/balances`
 * outright — so two independently-editable hosts could only ever disagree, and a
 * reader who changed one would find half the site pointing somewhere else.
 */
const BASE_KEY = 'lithos.baseUrl';

/** Where the two halves used to keep it, read once so a custom host survives. */
const LEGACY_BASE_KEYS = ['lithos.dex.baseUrl', 'lithos.collateral.baseUrl'];

/**
 * Move a previously-set base URL onto the shared key.
 *
 * Only matters for someone who pointed the site at a non-default host; dropping
 * that silently would send their requests to the wrong client. The DEX key wins
 * when both exist and differ — arbitrary, but the two were meant to be equal and
 * a stale second value is not worth a prompt.
 */
function migrateBaseUrl() {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(BASE_KEY) !== null) return;
    for (const k of LEGACY_BASE_KEYS) {
      const v = window.localStorage.getItem(k);
      if (v !== null) {
        window.localStorage.setItem(BASE_KEY, v);
        break;
      }
    }
  } catch {
    /* storage unavailable — fall back to the default base */
  }
}

migrateBaseUrl();

/**
 * The API key lives in memory for the life of the page, never in storage.
 *
 * The base URL below is not a secret and stays in localStorage.
 */
let apiKey = '';

export function getBaseUrl() {
  if (typeof window === 'undefined') return '';
  const stored = window.localStorage.getItem(BASE_KEY);
  return stored === null ? defaultBase() : stored;
}

export function setBaseUrl(url) {
  if (typeof window === 'undefined') return;
  const trimmed = String(url ?? '')
    .trim()
    .replace(/\/+$/, '');
  window.localStorage.setItem(BASE_KEY, trimmed);
}

export function resetBaseUrl() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(BASE_KEY);
}

export function getDefaultBaseUrl() {
  return defaultBase();
}

/* ---- Auto-refresh ----
   How often read-only state re-reads itself, in seconds; 0 means off. Not a
   secret and not per-session, so unlike the API key it belongs in storage. */
const REFRESH_KEY = 'lithos.dex.autoRefresh';

export const DEFAULT_REFRESH_SECONDS = 10;
/** A 1s poll would hammer the node, and an hour is not a "refresh". */
export const MIN_REFRESH_SECONDS = 2;
export const MAX_REFRESH_SECONDS = 3600;

export function getAutoRefresh() {
  if (typeof window === 'undefined') return 0;
  const n = Number.parseInt(window.localStorage.getItem(REFRESH_KEY) ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n));
}

/** Pass 0, null or anything unparseable to turn it off. */
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

/* ---- Use orders ----
   Swap, deposit and redeem go through /dex/orders by default. A miner running
   the batcher supersedes unconfirmed direct spends of the pool in its own
   candidate, so a direct transaction can be dropped and need resending; an
   order placement never spends the pool, so it cannot be. One preference covers
   the Swap and Liquidity pages, saved per browser. */
const USE_ORDERS_KEY = 'lithos.dex.useOrders';

export function getUseOrders() {
  if (typeof window === 'undefined') return true;
  try {
    // Absent means the default, which is on. Only an explicit '0' turns it off.
    return window.localStorage.getItem(USE_ORDERS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setUseOrders(on) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USE_ORDERS_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — the choice just won't survive a reload */
  }
}

/* ---- Order fees ----
   `executorFee` pays whoever fills an order; `maxMinerFee` caps how much of it a
   broadcast fill may spend as a miner fee, and must be below it or the request
   is refused. Both nanoERG decimal strings. Stored as a pair: setting one alone
   would be checked against the client's hidden default for the other, which the
   form cannot validate. Absent means "use the client's defaults". */
const ORDER_FEES_KEY = 'lithos.dex.orderFees';

/** @returns {{ executorFee: string, maxMinerFee: string } | null} */
export function getOrderFees() {
  if (typeof window === 'undefined') return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(ORDER_FEES_KEY) ?? 'null');
    if (!v || !/^\d+$/.test(v.executorFee ?? '') || !/^\d+$/.test(v.maxMinerFee ?? '')) {
      return null;
    }
    return BigInt(v.maxMinerFee) < BigInt(v.executorFee) ? v : null;
  } catch {
    return null;
  }
}

/** Pass null to go back to the client's defaults. */
export function setOrderFees(fees) {
  if (typeof window === 'undefined') return;
  try {
    if (!fees) window.localStorage.removeItem(ORDER_FEES_KEY);
    else window.localStorage.setItem(ORDER_FEES_KEY, JSON.stringify(fees));
  } catch {
    /* storage unavailable */
  }
}

/** Fee fields for an order request body — empty when the client's defaults apply. */
const orderFeeFields = () => getOrderFees() ?? {};

export function getApiKey() {
  return apiKey;
}

export function setApiKey(key) {
  apiKey = String(key ?? '').trim();
}

export function hasApiKey() {
  return !!apiKey;
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 409 — a box this request was quoted against has moved.
 *
 * Carries the ids as they now stand (only the ones that apply are present), so a
 * caller can refresh, re-quote and resend rather than just reporting a failure.
 */
export class StateChangedError extends ApiError {
  constructor(message, body) {
    super(message, 409, body);
    this.name = 'StateChangedError';
    this.poolBoxId = body?.poolBoxId;
    this.vaultBoxId = body?.vaultBoxId;
    this.provisionBoxId = body?.provisionBoxId;
  }
}

/**
 * A transaction endpoint answered 200, but the node did not accept the transaction.
 *
 * Every tx result carries `outcome`. `rejected` means nothing was spent, so it is
 * a failure like any other. `uncertain` is not thrown: the transaction may still
 * confirm, and treating it as failed invites a resend that spends the same funds
 * twice — callers render it as a warning instead (see `outcomeOf`).
 */
export class TxRejectedError extends ApiError {
  constructor(result) {
    super(
      'The node rejected the transaction, so nothing was spent. Check the amounts and try again.',
      200,
      result,
    );
    this.name = 'TxRejectedError';
    this.txId = result?.txId;
  }
}

/** `accepted` | `uncertain` — `rejected` never gets this far. Absent reads as accepted. */
export const outcomeOf = (result) => result?.outcome ?? 'accepted';

/** Throw on a rejected submission; pass accepted and uncertain results through. */
const submitted = (promise) =>
  promise.then((r) => {
    if (r?.outcome === 'rejected') throw new TxRejectedError(r);
    return r;
  });

/** Amount -> decimal string, passing undefined/null through untouched. */
const str = (v) => (v === undefined || v === null ? undefined : String(v));

/**
 * Drop undefined/null keys so an omitted optional never reaches the server as
 * `null` — several of these fields are "absent means no bound", and an explicit
 * null is not the same thing.
 */
function omitEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/** Build a query string, dropping undefined/null/'' params. */
function qs(params) {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function req(path, { method = 'GET', body, auth = false, query } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const key = getApiKey();
    if (!key) {
      // Worth saying why it is missing: the usual cause is a refresh, not a
      // user who never entered one.
      throw new ApiError('API key required for this action. Add one under Settings.', 401);
    }
    headers['api_key'] = key;
  }

  const url = `${getBaseUrl()}${path}${qs(query)}`;

  let res;
  try {
    res = await fetch(url, {
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
    /* non-JSON body — leave data null and fall through to the error below */
  }

  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.reason ||
      data?.message ||
      (res.status === 401 ? 'Unauthorized: check your API key under Settings.' : null) ||
      `Request failed (${res.status} ${res.statusText})`;
    // 409 is recoverable: the caller can refresh and re-quote off the ids in the body.
    if (res.status === 409) throw new StateChangedError(msg, data);
    throw new ApiError(msg, res.status, data);
  }

  if (data === null && text) {
    throw new ApiError('Server returned a non-JSON response.', res.status, text.slice(0, 200));
  }
  return data;
}

/* ============================================================
   Pool & vault state
   ============================================================ */

/** GET /dex/pool */
export const getPool = () => req('/dex/pool');

/** GET /dex/vault */
export const getVault = () => req('/dex/vault');

/* ============================================================
   Swap
   ============================================================ */

/** POST /dex/swap/check */
export const checkSwap = ({ amountIn, ergIn }) =>
  req('/dex/swap/check', { method: 'POST', body: { amountIn: String(amountIn), ergIn } });

/** POST /dex/swap/checkOutput — reverse quote by desired output */
export const checkSwapOutput = ({ amountOut, ergIn }) =>
  req('/dex/swap/checkOutput', { method: 'POST', body: { amountOut: String(amountOut), ergIn } });

/**
 * POST /dex/swap
 * `expectedPoolBoxId` turns a moved pool into a 409 rather than a silent re-quote
 * at a worse price, so always send the id the quote came from.
 */
export const swap = ({ amountIn, ergIn, minOutput, expectedPoolBoxId }) =>
  submitted(req('/dex/swap', {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      amountIn: String(amountIn),
      ergIn,
      minOutput: String(minOutput),
      expectedPoolBoxId,
    }),
  }));

/* ============================================================
   Liquidity
   ============================================================ */

/**
 * POST /dex/deposit/check
 * Send either availableX/availableY, or shares — omitted fields are dropped so
 * the server sees only the form being used.
 */
export const checkDeposit = ({ availableX, availableY, shares }) => {
  const body = {};
  if (availableX !== undefined && availableX !== null) body.availableX = String(availableX);
  if (availableY !== undefined && availableY !== null) body.availableY = String(availableY);
  if (shares !== undefined && shares !== null) body.shares = String(shares);
  return req('/dex/deposit/check', { method: 'POST', body });
};

/**
 * POST /dex/deposit
 * `maxAmountX/Y` cap what the deposit costs if the pool moves between quote and send.
 * The response carries `ownerNFT` — the token that actually owns the provision, and
 * the one thing worth keeping; it survives the box id changing.
 */
export const deposit = ({ shares, maxAmountX, maxAmountY, expectedPoolBoxId }) =>
  submitted(req('/dex/deposit', {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      shares: String(shares),
      maxAmountX: str(maxAmountX),
      maxAmountY: str(maxAmountY),
      expectedPoolBoxId,
    }),
  }));

/** POST /dex/redeem/check */
export const checkRedeem = ({ provisionBoxId }) =>
  req('/dex/redeem/check', { method: 'POST', body: { provisionBoxId } });

/**
 * POST /dex/redeem
 * Unclaimed fees are destroyed with the provision box, so the API refuses the
 * redemption unless `acknowledgeUnclaimedFees` is explicitly set.
 */
export const redeem = ({
  provisionBoxId,
  minAmountX,
  minAmountY,
  expectedPoolBoxId,
  acknowledgeUnclaimedFees,
}) =>
  submitted(req('/dex/redeem', {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      provisionBoxId,
      minAmountX: str(minAmountX),
      minAmountY: str(minAmountY),
      expectedPoolBoxId,
      acknowledgeUnclaimedFees,
    }),
  }));

/* ============================================================
   Provisions & fees
   ============================================================ */

/** GET /dex/provisions */
export const listProvisions = () => req('/dex/provisions');

/**
 * POST /dex/provisions/{boxId}/claim
 * The provision gets a NEW box id — `successorBoxId` in the response. Any id held
 * from before the claim is dead, so callers must reload the list afterwards.
 */
export const claimProvision = (boxId, opts = {}) =>
  submitted(req(`/dex/provisions/${encodeURIComponent(boxId)}/claim`, {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      expectedVaultBoxId: opts.expectedVaultBoxId,
      expectedProvisionBoxId: opts.expectedProvisionBoxId,
      minAmountX: str(opts.minAmountX),
      minAmountY: str(opts.minAmountY),
    }),
  }));

/** POST /dex/provisions/{boxId}/resize/check */
export const checkResize = (boxId, { newShares }) =>
  req(`/dex/provisions/${encodeURIComponent(boxId)}/resize/check`, {
    method: 'POST',
    body: { newShares: String(newShares) },
  });

/**
 * POST /dex/provisions/{boxId}/resize
 * max bounds apply when increasing, min bounds when decreasing — see the quote's
 * `increasing`. Also flushes, hence the vault id. Returns a new `boxId`.
 */
export const resize = (boxId, opts) =>
  submitted(req(`/dex/provisions/${encodeURIComponent(boxId)}/resize`, {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      newShares: String(opts.newShares),
      maxAmountX: str(opts.maxAmountX),
      maxAmountY: str(opts.maxAmountY),
      minAmountX: str(opts.minAmountX),
      minAmountY: str(opts.minAmountY),
      expectedPoolBoxId: opts.expectedPoolBoxId,
      expectedVaultBoxId: opts.expectedVaultBoxId,
      expectedProvisionBoxId: opts.expectedProvisionBoxId,
    }),
  }));

/* ============================================================
   Flush
   ============================================================ */

/** POST /dex/flush/check */
export const checkFlush = () => req('/dex/flush/check', { method: 'POST' });

/** POST /dex/flush — permissionless; pays the caller nothing. */
export const flush = (opts = {}) =>
  submitted(req('/dex/flush', {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      expectedPoolBoxId: opts.expectedPoolBoxId,
      expectedVaultBoxId: opts.expectedVaultBoxId,
    }),
  }));

/* ============================================================
   History
   ============================================================ */

/** GET /dex/fees/history */
export const getFeeHistory = ({ from, to, bucket } = {}) =>
  req('/dex/fees/history', { query: { from, to, bucket } });

/** GET /dex/provisions/{boxId}/fees/history */
export const getProvisionFeeHistory = (boxId, { from, to, bucket } = {}) =>
  req(`/dex/provisions/${encodeURIComponent(boxId)}/fees/history`, { query: { from, to, bucket } });

/**
 * GET /dex/price/history
 *
 * Spot price over a range, for the chart. The server guarantees the series ends
 * at the current price, so it agrees with /dex/pool without any client-side
 * rebasing. `partial` is true when the index does not span the whole range.
 */
export const getPriceHistory = ({ range = '24H', bucket } = {}) =>
  req('/dex/price/history', { query: { range, bucket } });

/**
 * GET /dex/activity/recent
 *
 * Every transaction that moved the pool, newest first: SWAP, DEPOSIT, REDEEM,
 * RESIZE and FLUSH, each marked `via` ORDER or DIRECT. MEMPOOL entries come first
 * and can still be dropped or replaced; only CONFIRMED ones carry height and
 * timestamp. Replaces the removed /dex/swaps/recent.
 */
export const getRecentActivity = ({ limit } = {}) =>
  req('/dex/activity/recent', { query: { limit } });

/* ============================================================
   Orders
   Swap, deposit and redeem placed as orders that any miner fills for the
   order's executor fee. Checks are keyless (public state only); the list,
   placements and cancel need the key, since they name this wallet's funds.
   ============================================================ */

/**
 * GET /dex/orders
 * This wallet's outstanding orders, unconfirmed placements included. An order
 * leaves the list once the transaction filling or cancelling it confirms.
 */
export const listOrders = () => req('/dex/orders', { auth: true });

/** POST /dex/orders/swap/check */
export const checkSwapOrder = ({ amountIn, ergIn }) =>
  req('/dex/orders/swap/check', {
    method: 'POST',
    body: { amountIn: String(amountIn), ergIn, ...orderFeeFields() },
  });

/**
 * POST /dex/orders/swap
 * `minOutput` is required and must be positive on an order — a zero floor hands
 * the fill to whoever moves the pool first. Unlike a direct swap there is no
 * `expectedPoolBoxId`: the floor is checked when the order fills, not now.
 */
export const placeSwapOrder = ({ amountIn, ergIn, minOutput }) =>
  submitted(
    req('/dex/orders/swap', {
      method: 'POST',
      auth: true,
      body: {
        amountIn: String(amountIn),
        ergIn,
        minOutput: String(minOutput),
        ...orderFeeFields(),
      },
    }),
  );

/**
 * POST /dex/orders/deposit/check
 * Offers `amountX` and `amountY`; shares are bought with the scarcer side and the
 * rest comes back with the fill. Get a balanced pair from /dex/deposit/check first.
 */
export const checkDepositOrder = ({ amountX, amountY }) =>
  req('/dex/orders/deposit/check', {
    method: 'POST',
    body: { amountX: String(amountX), amountY: String(amountY), ...orderFeeFields() },
  });

/**
 * POST /dex/orders/deposit
 * `minShares` is the order's only protection against a pool moved earlier in the
 * same block. Required and positive.
 */
export const placeDepositOrder = ({ amountX, amountY, minShares }) =>
  submitted(
    req('/dex/orders/deposit', {
      method: 'POST',
      auth: true,
      body: {
        amountX: String(amountX),
        amountY: String(amountY),
        minShares: String(minShares),
        ...orderFeeFields(),
      },
    }),
  );

/**
 * POST /dex/orders/redeem/check
 * `claimableX/Y` are claimed by the placement itself; `unflushedX/Y`, and anything
 * earned while the order waits, are lost when it fills.
 */
export const checkRedeemOrder = ({ provisionBoxId }) =>
  req('/dex/orders/redeem/check', {
    method: 'POST',
    body: { provisionBoxId, ...orderFeeFields() },
  });

/**
 * POST /dex/orders/redeem
 * No acknowledge flag, unlike the direct redeem — the quote shows what is lost.
 * The result carries `claimedX/Y` when the placement settled any fees.
 */
export const placeRedeemOrder = ({ provisionBoxId }) =>
  submitted(
    req('/dex/orders/redeem', {
      method: 'POST',
      auth: true,
      body: { provisionBoxId, ...orderFeeFields() },
    }),
  );

/**
 * POST /dex/orders/{boxId}/cancel — no body.
 * Accepted while PENDING or OPEN. A 409 means an unconfirmed transaction is
 * already filling or cancelling it: re-read the list. A fill sent before the
 * cancel can still confirm first, in which case the cancel is dropped.
 */
export const cancelOrder = (boxId) =>
  submitted(
    req(`/dex/orders/${encodeURIComponent(boxId)}/cancel`, { method: 'POST', auth: true }),
  );

/* ============================================================
   Wallet
   ============================================================ */

/**
 * GET /wallet/balances
 *
 * Replaces the old `/wallet/balance` and the collateral panel's
 * `/collateral/wallet`, so both sections describe the same instant. Needs an
 * api_key, which the balance read did not previously — without one the balance
 * simply reads as unavailable.
 *
 * `nanoErgs` is the SPENDABLE balance: unreserved boxes plus matured rewards,
 * not the node's total. It is what a join quote's `affordNow` is decided
 * against, so the two now agree.
 */
export const getWalletBalances = () => req('/wallet/balances', { auth: true });
