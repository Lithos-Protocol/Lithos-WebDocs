/**
 * Wallet API client: the `wallet`-tagged endpoints. One client serves every section, so the base URL, the key
 * and the request helper are LithosDex's; only the auto-refresh period is the wallet page's own.
 */
import { request } from '../Dex/api';

export {
  getBaseUrl,
  setBaseUrl,
  resetBaseUrl,
  getDefaultBaseUrl,
  getApiKey,
  setApiKey,
  hasApiKey,
  outcomeOf,
  DEFAULT_REFRESH_SECONDS,
  MIN_REFRESH_SECONDS,
  MAX_REFRESH_SECONDS,
} from '../Dex/api';

const REFRESH_KEY = 'lithos.wallet.autoRefresh';

export function getAutoRefresh() {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number.parseInt(window.localStorage.getItem(REFRESH_KEY) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.max(2, n)) : 0;
  } catch {
    return 0;
  }
}

/** Pass 0 or anything unparseable to turn it off. */
export function setAutoRefresh(seconds) {
  if (typeof window === 'undefined') return;
  const n = Math.trunc(Number(seconds));
  try {
    if (Number.isFinite(n) && n > 0) window.localStorage.setItem(REFRESH_KEY, String(Math.min(3600, Math.max(2, n))));
    else window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* storage unavailable: the period lasts until a reload */
  }
}

/** GET /wallet/balances — spendable ERG, held boxes, and every token with `verified`. */
export const getBalances = () => request('/wallet/balances', { auth: true });

/** GET /wallet/rewards — coinbase reward boxes, locked and unlocked. */
export const getRewards = () => request('/wallet/rewards', { auth: true });

/** POST /wallet/rewards/claim — sweeps every unlocked coinbase to the primary address. */
export const claimRewards = () => request('/wallet/rewards/claim', { method: 'POST', auth: true });

/** GET /wallet/arb — the arb address and the confirmed boxes at it, which the balances leave out. */
export const getArbStake = () => request('/wallet/arb', { auth: true });

/** POST /wallet/arb/reclaim — sends everything at the arb address to the primary address and stops arb. */
export const reclaimArbStake = () => request('/wallet/arb/reclaim', { method: 'POST', auth: true });

/** GET /wallet/tokens/verified — open, so it doubles as the connection test. */
export const getVerifiedTokens = () => request('/wallet/tokens/verified');

/** Most token ids one provision NFT lookup takes. */
export const NFT_LOOKUP_MAX = 100;

/** POST /dex/provisions/nft — which of up to 100 tokens own a LithosDex provision, with its pool and stats. */
export const lookupNfts = (tokenIds) => request('/dex/provisions/nft', { method: 'POST', body: { tokenIds } });

/** The most token ids one `POST /sigmafi/assets` takes. */
export const BOND_LOOKUP_MAX = 50;

/** POST /sigmafi/assets — which of up to 50 tokens are SigmaFi bond assets, read from the chain. */
export const lookupBonds = (tokenIds) => request('/sigmafi/assets', { method: 'POST', body: { tokenIds } });
