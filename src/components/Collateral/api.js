/**
 * Lithos Collateral Market API client.
 *
 * Talks to the `collateral-market`-tagged endpoints in the Lithos Client API.
 * All amounts cross the wire as decimal strings — ERG in nanoERG, LIT in base
 * units (9 decimals) — so nothing here coerces a wire value through Number.
 * Use the helpers in ./format.js, which parse to BigInt.
 *
 * Counts, heights and queue positions are plain JSON integers.
 */

/*
 * Base URL and API key both live in the Dex module and are re-exported here.
 *
 * Both sections talk to the same client — they share `/wallet/balances` — so a
 * second, separately-editable host or key could only disagree with the first.
 */
import {
  getApiKey,
  setApiKey,
  hasApiKey,
  getBaseUrl,
  setBaseUrl,
  resetBaseUrl,
  getDefaultBaseUrl,
} from '../Dex/api';

export { getApiKey, setApiKey, hasApiKey, getBaseUrl, setBaseUrl, resetBaseUrl, getDefaultBaseUrl };

/* ---- Auto-refresh ----
   How often read-only state re-reads itself, in seconds; 0 means off. Not a
   secret and not per-session, so unlike the API key it belongs in storage. */
const REFRESH_KEY = 'lithos.collateral.autoRefresh';

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

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 409 — the quoted state moved between quote and send.
 *
 * Nothing was decided on the chain; the caller refreshes its quote off the live
 * endpoints and asks the user to re-confirm rather than reporting a hard failure.
 */
export class StateChangedError extends ApiError {
  constructor(message, body) {
    super(message, 409, body);
    this.name = 'StateChangedError';
    this.emissionBoxId = body?.emissionBoxId;
  }
}

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
    // The controller's `detail` strings were written for end users — surface
    // them verbatim near whatever control triggered the call.
    const msg =
      data?.detail ||
      data?.reason ||
      data?.message ||
      (res.status === 401 ? 'Unauthorized: check your API key under Settings.' : null) ||
      `Request failed (${res.status} ${res.statusText})`;
    // 409 is recoverable: the caller re-quotes and asks for a fresh confirmation.
    if (res.status === 409) throw new StateChangedError(msg, data);
    throw new ApiError(msg, res.status, data);
  }

  if (data === null && text) {
    throw new ApiError('Server returned a non-JSON response.', res.status, text.slice(0, 200));
  }
  return data;
}

/* ============================================================
   Market snapshot
   ============================================================ */

/**
 * GET /collateral/market — one snapshot feeding the stat pills.
 *
 * 404 here means no emission contracts exist on this network yet; callers show
 * "Emission has not launched on this network" rather than a raw error.
 */
export const getMarket = () => req('/collateral/market');

/* ============================================================
   Queue & active set listings
   ============================================================ */

/** GET /collateral/queue — waiting positions, head first. */
export const getQueue = ({ limit, offset } = {}) =>
  req('/collateral/queue', { query: { limit, offset } });

/** GET /collateral/active — live collateral boxes, newest first. At most 100. */
export const getActive = ({ limit, offset } = {}) =>
  req('/collateral/active', { query: { limit, offset } });

/**
 * GET /collateral/permits/history — permits actually paid by still-waiting
 * joins, oldest first. `truncated` is true when the series does not span the
 * whole queue; the points shown remain exact.
 */
export const getPermitHistory = ({ limit } = {}) =>
  req('/collateral/permits/history', { query: { limit } });

/* ============================================================
   Fee market — statistics, no key required
   ============================================================ */

/**
 * GET /stats/collateral — the inventory and the bid book it carries.
 *
 * `fees` is the distribution: at-floor vs bidding counts, total, best, median,
 * p90 and six bands. `fees.unreadable` is normally 0; when it is not, the
 * inventory counts more boxes than the distribution does and the shortfall has
 * to be said out loud rather than folded into the floor.
 */
export const getCollateralStats = () => req('/stats/collateral');

/**
 * GET /stats/mining/buckets — the accounting map per UTC hour or day.
 *
 * `from` is inclusive, `until` exclusive, both aligned to the interval, at most
 * 500 buckets. Missing buckets are omitted rather than zero-filled — read
 * `partial` and `retainedFrom` before treating a gap as a quiet period.
 */
export const getMiningBuckets = ({ from, until, interval = 'day' }) =>
  req('/stats/mining/buckets', { query: { from, until, interval } });

/* ============================================================
   Wallet-scoped state
   ============================================================ */

/** GET /collateral/wallet — balances, config echo, keys, positions, rewards. */
/*
 * Which token in the wallet is LIT.
 *
 * Not by name: token names on Ergo are not unique and cost nothing to mint, so
 * anybody can airdrop a token called "LIT" and change what this reads. Only the
 * id is unforgeable.
 *
 * The collateral API does not publish the permit token's id, so it comes from
 * `/dex/pool`. Its `tokenY` and the permit token are minted as the same token
 * at launch, so the id is authoritative rather than a guess.
 *
 * Memoised: the id is fixed for the life of a deployment, and the wallet is
 * re-read on a timer.
 */
let litTokenIdPromise = null;

function litTokenId() {
  if (!litTokenIdPromise) {
    litTokenIdPromise = req('/dex/pool')
      .then((p) => p?.tokenY ?? null)
      // A pool that cannot be read must not take the wallet down with it; the
      // balance reports as unknown instead.
      .catch(() => null);
  }
  return litTokenIdPromise;
}

/**
 * GET /wallet/balances
 *
 * One endpoint for both sections now. The collateral half moved under
 * `collateral`, and `primaryAddress` / spendable ERG live on the parent — so
 * this flattens them back together for the panels, which want one object.
 *
 * `litBalance` is null when the token could not be identified, which the UI
 * shows as unavailable. Guessing would be worse: a wrong balance looks right.
 */
export const getWallet = async () => {
  const [r, litId] = await Promise.all([req('/wallet/balances', { auth: true }), litTokenId()]);
  const tokens = r.tokens ?? [];
  const lit = litId ? (tokens.find((tk) => tk.tokenId === litId) ?? null) : null;
  return {
    ...(r.collateral ?? {}),
    primaryAddress: r.primaryAddress,
    spendableNanoErgs: r.nanoErgs,
    litBalance: litId ? (lit?.amount ?? '0') : null,
    litTokenId: litId,
    tokens,
  };
};

/** GET /collateral/rewards — reward summary alone (same shape as wallet.rewards). */
export const getRewards = () => req('/collateral/rewards', { auth: true });

/**
 * POST /collateral/rewards/claim — sweeps ALL unlocked coinbases to EIP-3 index 0.
 * Dust is consolidated, never dropped. 400 means nothing unlocked or a claim is
 * already running; nothing was lost either way.
 */
export const claimRewards = () => req('/collateral/rewards/claim', { method: 'POST', auth: true });

/* ============================================================
   Join flow
   ============================================================ */

/**
 * POST /collateral/join/check — quote joining `count` positions (1–25).
 * `permitsLit[]` escalates per position: each join lengthens the queue, which
 * raises the permit every later position pays. Show each line.
 *
 * `priorityFeeEachNanoErgs` is the priority bid. The quote prices it: the returned
 * `principalEachNanoErgs` already includes the bid AND the 4x premium the
 * contract charges into the pool, so it moves by five times whatever is sent.
 */
export const checkJoin = ({ count, priorityFeeEachNanoErgs }) =>
  req('/collateral/join/check', {
    method: 'POST',
    auth: true,
    body: omitEmpty({ count, priorityFeeEachNanoErgs: str(priorityFeeEachNanoErgs) }),
  });

/**
 * POST /collateral/join — execute.
 * Always send the quote's `emissionTipBoxId` as `expectedEmissionBoxId`, so a
 * queue that moved turns into a 409 instead of a silent join at a worse price.
 * `maxPermitEachLit` caps what each position pays if permits rise mid-flight.
 *
 * `priorityFeeEachNanoErgs` must be what the quote was taken at — it decides what
 * each position locks up. The endpoint enforces only a minimum, not a cap, so the
 * caller is responsible for having shown the reader the break-even first.
 */
export const join = ({
  count,
  maxPermitEachLit,
  expectedEmissionBoxId,
  acknowledgeNoWithdrawal,
  priorityFeeEachNanoErgs,
}) =>
  req('/collateral/join', {
    method: 'POST',
    auth: true,
    body: omitEmpty({
      count,
      maxPermitEachLit: str(maxPermitEachLit),
      expectedEmissionBoxId,
      priorityFeeEachNanoErgs: str(priorityFeeEachNanoErgs),
      // Required by the endpoint. Passed through explicitly rather than
      // defaulted here — the acknowledgement has to come from the reader
      // ticking the box, not from this function assuming it.
      acknowledgeNoWithdrawal,
    }),
  });

/**
 * GET /blocks/byHeight?fromHeight&toHeight — UTXO ids of tracked rollups mined
 * in the range, from the client's sync cache.
 *
 * NOT a way to count blocks per day: a rollup leaves tracking once it pays out,
 * so older ranges undercount and a week-long series slopes downwards on its own.
 * `getMiningBuckets` counts canonical genesis transactions instead and is what
 * the blocks-found chart uses.
 */
export const getBlocksByHeight = ({ fromHeight, toHeight }) =>
  req('/blocks/byHeight', { query: { fromHeight, toHeight } });
