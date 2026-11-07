import { big } from '../Dex/format';

export const BOX_MINIMUM = 1_000_000n;
export const NETWORK_FEE = 1_000_000n;

/** The box stores collateral, its liquidation bounty and the minimum vault value together. */
export function collateralOf(terms) {
  const total = big(terms.collateralNanoErgs);
  const fee = big(terms.batchingFee);
  const reserve = fee + BOX_MINIMUM;
  return {
    collateral: total > reserve ? total - reserve : 0n,
    fee,
    minimum: BOX_MINIMUM,
    total,
    shortfall: total < reserve,
  };
}

/** Settlement proceeds do not identify repayment versus liquidation in the current API. */
export function bondState(asset) {
  if (asset?.verified === false) return 'unverified';
  if (asset?.bond) return asset.bond.status === 'matured' ? 'matured' : 'active';
  if (asset?.vault?.length) return 'settled';
  return 'unknown';
}

export const BOND_STATE_LABEL = {
  active: 'Active',
  matured: 'Matured',
  settled: 'Settled',
  unknown: 'No active loan',
  unverified: 'Unverified',
};

/** Match the Wallet's single-unit NFT group, as well as chain-identified protocol NFTs. */
export function isNftAsset(token, check) {
  return !!(check?.nft?.provisionNft || check?.nft?.redeemed || check?.bond?.bondAsset ||
    (token && !token.verified && big(token.amount) === 1n && (token.decimals == null || token.decimals === 0)));
}
