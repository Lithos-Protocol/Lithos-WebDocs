import { big } from '../Dex/format';
import { BOND_ASSET_NAME } from '../Wallet/assetNames';

export const BOX_MINIMUM = 1_000_000n;
export const NETWORK_FEE = 1_000_000n;

/** API collateral excludes the lender reserve but includes the borrower's box minimum. */
export function collateralOf(terms) {
  const borrower = big(terms.collateralNanoErgs);
  const fee = big(terms.batchingFee);
  return {
    collateral: borrower > BOX_MINIMUM ? borrower - BOX_MINIMUM : 0n,
    borrower,
    fee,
    minimum: BOX_MINIMUM,
    total: borrower + fee,
    shortfall: borrower < BOX_MINIMUM,
  };
}

/** Prefer the client's indexed spend evidence, including after a vault has been claimed. */
export function bondState(asset) {
  if (asset?.verified === false) return 'unverified';
  const states = { Open: 'active', Matured: 'matured', Repaid: 'repaid', Liquidated: 'liquidated', Unknown: 'unknown', Unverified: 'unverified' };
  if (states[asset?.status]) return states[asset.status];
  if (asset?.bond) return asset.bond.status === 'matured' ? 'matured' : 'active';
  if (asset?.vault?.length) return 'settled';
  return 'unknown';
}

export const BOND_STATE_LABEL = {
  active: 'Active',
  matured: 'Matured',
  settled: 'Settled',
  repaid: 'Repaid',
  liquidated: 'Liquidated',
  unknown: 'Unknown',
  unverified: 'Unverified',
};

/** Keep the UI label short; on-chain EIP-4 metadata is unaffected. */
export const bondAssetName = () => BOND_ASSET_NAME;

/** Match the Wallet's single-unit NFT group, as well as chain-identified protocol NFTs. */
export function isNftAsset(token, check) {
  return !!(check?.nft?.provisionNft || check?.nft?.redeemed || check?.bond?.bondAsset ||
    (token && !token.verified && big(token.amount) === 1n && (token.decimals == null || token.decimals === 0)));
}
