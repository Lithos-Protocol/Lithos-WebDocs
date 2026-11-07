import { BOX_MINIMUM, NETWORK_FEE } from './bond';

const LONG_MAX = 9_223_372_036_854_775_807n;
export const BLOCKS_PER_DAY = 720;

/** Days are estimates; block input is an exact, whole-number duration. */
export function termToBlocks(value, unit = 'days') {
  const text = String(value).trim();
  if (!(unit === 'blocks' ? /^\d+$/ : /^(?:\d+\.?\d*|\.\d+)$/).test(text)) return null;
  const blocks = unit === 'blocks' ? Number(text) : Math.round(Number(text) * BLOCKS_PER_DAY);
  return Number.isSafeInteger(blocks) && blocks > 0 ? blocks : null;
}

/** Exact decimal input; reject excess precision and values outside the client's Long amounts. */
export function units(text, decimals, allowZero = false) {
  const value = String(text).trim();
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (fraction.replace(/0+$/, '').length > decimals) return null;
  const n = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, '0') || '0');
  return (n > 0n || (allowZero && n === 0n)) && n <= LONG_MAX ? n : null;
}

export function decimalText(raw, decimals) {
  const scale = 10n ** BigInt(decimals);
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return decimals && fraction ? `${raw / scale}.${fraction}` : `${raw / scale}`;
}

/** V2 creates borrower orders only. Exactly one principal and one maturity field cross the wire. */
export function buildOrder({ asset, loanAmount, repayAmount, days, term = days, termUnit = 'days', schedule, collateralErg, collateralTokens, fee, height, metadata = {}, wallet, nftIds = new Set() }) {
  const decimals = (id) => id === 'ERG' ? 9 : metadata[id]?.decimals ?? 0;
  const principal = units(loanAmount, decimals(asset));
  const repayment = units(repayAmount, decimals(asset));
  const collateral = units(String(collateralErg).trim() || '0', 9, true);
  const batchingFee = units(fee, 9);
  const duration = termToBlocks(term, termUnit);
  if (asset !== 'ERG' && !/^[a-f0-9]{64}$/.test(asset)) return { why: 'Select a loan asset.' };
  if (nftIds.has(asset)) return { why: 'Choose a fungible loan asset. NFTs can be used as collateral.' };
  if (!principal) return { why: 'Enter a valid loan amount at the asset’s precision.' };
  if (asset === 'ERG' && principal < 1_000_000n) return { why: 'The minimum loan is 0.001 ERG.' };
  if (!repayment) return { why: 'Enter a valid repayment amount at the asset’s precision.' };
  if (duration == null) return { why: termUnit === 'blocks' ? 'Enter a whole number of blocks.' : 'Enter a valid loan term.' };
  if (duration < (schedule === 'onClose' ? 30 : 3)) return { why: 'Choose a longer loan term.' };
  if (!Number.isInteger(height) || height <= 0) return { why: 'Connect to the client to read the current block.' };
  if (height + duration > 2_147_483_647) return { why: 'The term exceeds the maximum maturity height.' };
  if (!batchingFee || batchingFee < 50_000_000n) return { why: 'The batching / liquidation fee must be at least 0.05 ERG.' };
  if (collateral == null) return { why: 'Enter a valid non-negative ERG collateral amount.' };
  const locked = collateral + batchingFee + BOX_MINIMUM;
  if (locked > LONG_MAX - NETWORK_FEE) return { why: 'The collateral total exceeds the supported ERG amount.' };
  const seen = new Set();
  const tokens = [];
  for (const t of collateralTokens) {
    if (!/^[a-f0-9]{64}$/.test(t.tokenId)) return { why: 'Select a wallet token for each collateral entry.' };
    if (t.tokenId === asset) return { why: 'The loan token cannot also be collateral.' };
    if (seen.has(t.tokenId)) return { why: 'Use each collateral token once.' };
    const amount = nftIds.has(t.tokenId) ? 1n : units(t.amount, decimals(t.tokenId));
    if (!amount) return { why: 'Enter a valid amount for each collateral token.' };
    const balance = wallet?.tokens.find((a) => a.tokenId === t.tokenId);
    if (wallet && (!balance || amount > BigInt(balance.amount))) return { why: 'The collateral token amount exceeds your wallet balance.' };
    seen.add(t.tokenId);
    tokens.push({ tokenId: t.tokenId, amount: amount.toString() });
  }
  if (wallet && locked + NETWORK_FEE > BigInt(wallet.nanoErgs)) return { why: 'Your ERG balance must cover collateral, the batching fee, box minimum and network fee.' };
  return { body: {
    ...(asset === 'ERG' ? { principalNanoErgs: principal.toString() } : { principalToken: { tokenId: asset, amount: principal.toString() } }),
    repayment: repayment.toString(),
    collateralNanoErgs: locked.toString(),
    collateralTokens: tokens,
    batchingFee: batchingFee.toString(),
    liquidation: 'MaturityLiquidation',
    ...(schedule === 'onClose' ? { durationBlocks: duration } : { maturityHeight: height + duration }),
  } };
}
